# 阶段 3: 异步任务系统 - 开发计划

**日期**: 2026-01-19
**阶段**: 阶段 3 - BullMQ 异步任务系统
**预计工期**: 7-10 天
**依赖**: 阶段 2b 完成 ✅

---

## 📋 阶段目标

构建基于 BullMQ 的异步任务处理系统，实现：
1. ✅ 任务队列管理（创建、调度、监控）
2. ✅ Worker 进程池（多任务并发处理）
3. ✅ 任务优先级和延迟执行
4. ✅ 失败重试和错误恢复
5. ✅ 实时监控和统计面板

---

## 🏗️ 架构设计

### 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      API Server                             │
│                   (Express/Fastify)                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
┌─────────────────────────────────────────────────────────────┐
│                   Task Scheduler                            │
│              (任务创建和调度器)                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ↓
         ┌────────────────────────┐
         │   Redis (BullMQ)        │
         │   - 任务队列             │
         │   - 任务状态             │
         │   - 重试策略             │
         └────────────────────────┘
                      │
          ┌───────────┴───────────┐
          ↓                       ↓
┌──────────────────┐    ┌──────────────────┐
│   Worker 1       │    │   Worker 2       │
│   (Process 1)    │    │   (Process 2)    │
│                  │    │                  │
│  - Claim Task    │    │  - Claim Task    │
│  - Execute       │    │  - Execute       │
│  - Update Status │    │  - Update Status │
└──────────────────┘    └──────────────────┘
          │                       │
          └───────────┬───────────┘
                      ↓
         ┌────────────────────────┐
         │  PostgreSQL Database    │
         │  - 任务持久化            │
         │  - 状态快照              │
         │  - 执行历史              │
         └────────────────────────┘
```

---

## 📦 技术栈

### 核心依赖

```json
{
  "dependencies": {
    "bullmq": "^5.0.0",           // 任务队列
    "ioredis": "^5.0.0",           // Redis 客户端
    "@bull-board/api": "^5.0.0",   // 监控面板 API
    "@bull-board/express": "^5.0.0", // Express 集成
    "express": "^4.18.0"           // Web 框架（用于监控面板）
  },
  "devDependencies": {
    "@types/bullmq": "^4.0.0",     // TypeScript 类型
    "@types/express": "^4.17.0"    // Express 类型
  }
}
```

### Redis 配置

```typescript
// src/infrastructure/queue/redis.ts
import Redis from 'ioredis';

export const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  maxRetriesPerRequest: 3,
};

// 创建连接
export const createRedisConnection = () => {
  return new Redis(redisConfig.host, {
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
    maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
  });
};
```

---

## 🔧 组件设计

### 1. Task Queue (任务队列)

**文件**: `src/infrastructure/queue/TaskQueue.ts`

**职责**:
- 创建和管理任务队列
- 添加任务到队列
- 配置任务选项（优先级、重试、延迟）

**接口设计**:

```typescript
import { Queue, JobsOptions } from 'bullmq';

export interface TaskJobData {
  taskId: string;
  mode: 'sync' | 'async';
  topic: string;
  requirements: string;
  hardConstraints?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
}

export class TaskQueue {
  private queue: Queue<TaskJobData>;

  constructor(connection: Redis) {
    this.queue = new Queue<TaskJobData>('content-creator-tasks', {
      connection,
      defaultJobOptions: {
        attempts: 3,              // 默认重试 3 次
        backoff: {
          type: 'exponential',
          delay: 2000,            // 指数退避，初始 2 秒
        },
        removeOnComplete: {
          count: 1000,            // 保留最近 1000 个完成的任务
          age: 24 * 3600,         // 或保留 24 小时
        },
        removeOnFail: {
          count: 5000,            // 保留最近 5000 个失败的任务
          age: 7 * 24 * 3600,     // 或保留 7 天
        },
      },
    });
  }

  /**
   * 添加任务到队列
   */
  async addTask(
    data: TaskJobData,
    options?: JobsOptions
  ): Promise<void> {
    await this.queue.add('process-content', data, {
      priority: this.calculatePriority(data),
      ...options,
    });
  }

  /**
   * 添加延迟任务
   */
  async addDelayedTask(
    data: TaskJobData,
    delayMs: number
  ): Promise<void> {
    await this.queue.add('process-content', data, {
      delay: delayMs,
      priority: this.calculatePriority(data),
    });
  }

  /**
   * 计算任务优先级（1-10，数字越小优先级越高）
   */
  private calculatePriority(data: TaskJobData): number {
    // 根据 mode 和其他因素计算优先级
    if (data.mode === 'sync') {
      return 1; // 同步任务优先级最高
    }
    return 5; // 默认优先级
  }

  /**
   * 暂停队列
   */
  async pause(): Promise<void> {
    await this.queue.pause();
  }

  /**
   * 恢复队列
   */
  async resume(): Promise<void> {
    await this.queue.resume();
  }

  /**
   * 清空队列
   */
  async drain(): Promise<void> {
    await this.queue.drain();
  }

  /**
   * 获取队列统计信息
   */
  async getStats() {
    return {
      waiting: await this.queue.getWaitingCount(),
      active: await this.queue.getActiveCount(),
      completed: await this.queue.getCompletedCount(),
      failed: await this.queue.getFailedCount(),
      delayed: await this.queue.getDelayedCount(),
    };
  }
}
```

### 2. Task Worker (任务处理器)

**文件**: `src/workers/TaskWorker.ts`

**职责**:
- 从队列获取任务
- 执行工作流逻辑
- 更新任务状态
- 处理失败和重试

**接口设计**:

```typescript
import { Worker, Job } from 'bullmq';
import { createRedisConnection } from '../infrastructure/queue/redis.js';
import { createTaskRepository } from '../infrastructure/database/index.js';
import { createSimpleContentCreatorGraph } from '../domain/workflow/index.js';

export class TaskWorker {
  private worker: Worker<TaskJobData>;
  private repo = createTaskRepository();

  constructor(workerId: string, concurrency: number = 2) {
    const connection = createRedisConnection();

    this.worker = new Worker<TaskJobData>(
      'content-creator-tasks',
      async (job: Job<TaskJobData>) => {
        return await this.processJob(job);
      },
      {
        connection,
        concurrency,                    // 并发处理任务数
        limiter: {
          max: 10,                       // 每秒最多处理 10 个任务
          duration: 1000,
        },
      }
    );

    // 事件监听
    this.setupEventListeners(workerId);
  }

  /**
   * 处理单个任务
   */
  private async processJob(job: Job<TaskJobData>) {
    const { data } = job;
    const logger = createLogger('TaskWorker');

    logger.info('Processing job', {
      jobId: job.id,
      taskId: data.taskId,
      topic: data.topic,
    });

    try {
      // 1. 抢占任务（使用乐观锁）
      const claimed = await this.repo.claimForProcessing(
        data.taskId,
        process.env.WORKER_ID || 'worker-1'
      );

      if (!claimed) {
        throw new Error('Failed to claim task');
      }

      // 2. 创建工作流图
      const graph = createSimpleContentCreatorGraph();

      // 3. 创建初始状态
      const initialState = createInitialState({
        taskId: data.taskId,
        mode: data.mode,
        topic: data.topic,
        requirements: data.requirements,
        hardConstraints: data.hardConstraints,
      });

      // 4. 执行工作流
      const result = await graph.invoke(initialState);

      // 5. 保存结果
      await this.repo.update(data.taskId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: {
          articleContent: result.articleContent,
          searchResults: result.searchResults,
          organizedInfo: result.organizedInfo,
        },
      });

      logger.info('Job completed successfully', {
        jobId: job.id,
        taskId: data.taskId,
      });

      return {
        success: true,
        taskId: data.taskId,
      };

    } catch (error) {
      logger.error('Job failed', {
        jobId: job.id,
        taskId: data.taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      // 保存错误信息
      await this.repo.update(data.taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });

      throw error; // 抛出错误以触发 BullMQ 重试
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(workerId: string) {
    this.worker.on('completed', (job: Job, result) => {
      console.log(`[${workerId}] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      console.error(`[${workerId}] Job ${job?.id} failed:`, error.message);
    });

    this.worker.on('progress', (job: Job, progress) => {
      console.log(`[${workerId}] Job ${job.id} progress:`, progress);
    });
  }

  /**
   * 启动 Worker
   */
  async start(): Promise<void> {
    await this.worker.waitUntilReady();
    console.log('Worker started');
  }

  /**
   * 停止 Worker
   */
  async close(): Promise<void> {
    await this.worker.close();
    console.log('Worker closed');
  }
}
```

### 3. Task Scheduler (任务调度器)

**文件**: `src/schedulers/TaskScheduler.ts`

**职责**:
- 接收 API 请求创建任务
- 将任务添加到队列
- 返回任务 ID 给客户端

**接口设计**:

```typescript
import { TaskQueue } from '../infrastructure/queue/TaskQueue.js';
import { createTaskRepository } from '../infrastructure/database/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface CreateTaskRequest {
  userId?: string;
  mode: 'sync' | 'async';
  topic: string;
  requirements: string;
  hardConstraints?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
  scheduleAt?: Date;  // 可选：延迟执行
}

export class TaskScheduler {
  private queue: TaskQueue;
  private repo = createTaskRepository();

  constructor(connection: Redis) {
    this.queue = new TaskQueue(connection);
  }

  /**
   * 创建并调度任务
   */
  async scheduleTask(request: CreateTaskRequest): Promise<string> {
    // 1. 生成任务 ID
    const taskId = uuidv4();

    // 2. 保存到数据库
    const task = await this.repo.create({
      id: taskId,
      mode: request.mode,
      type: 'article',
      topic: request.topic,
      requirements: request.requirements,
      hardConstraints: request.hardConstraints,
      status: 'pending',
    });

    // 3. 添加到队列
    const jobData: TaskJobData = {
      taskId: task.id,
      mode: task.mode,
      topic: task.topic,
      requirements: task.requirements,
      hardConstraints: task.hardConstraints,
    };

    if (request.scheduleAt) {
      // 延迟任务
      const delay = request.scheduleAt.getTime() - Date.now();
      if (delay > 0) {
        await this.queue.addDelayedTask(jobData, delay);
      } else {
        await this.queue.addTask(jobData);
      }
    } else {
      // 立即执行
      await this.queue.addTask(jobData);
    }

    console.log(`Task ${taskId} scheduled successfully`);

    return taskId;
  }

  /**
   * 批量创建任务
   */
  async scheduleBatchTasks(
    requests: CreateTaskRequest[]
  ): Promise<string[]> {
    const taskIds: string[] = [];

    for (const request of requests) {
      const taskId = await this.scheduleTask(request);
      taskIds.push(taskId);
    }

    return taskIds;
  }
}
```

### 4. Monitor (监控面板)

**文件**: `src/monitoring/server.ts`

**职责**:
- 提供任务队列可视化
- 显示任务统计信息
- 支持任务操作（重试、删除、暂停）

**实现**:

```typescript
import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter.js';
import { ExpressAdapter } from '@bull-board/express';
import { TaskQueue } from '../infrastructure/queue/TaskQueue.js';
import { createRedisConnection } from '../infrastructure/queue/redis.js';

export function createMonitorServer(port: number = 3000) {
  const app = express();

  // 创建 Bull Board
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  const connection = createRedisConnection();
  const taskQueue = new TaskQueue(connection);

  createBullBoard({
    queues: [new BullMQAdapter(taskQueue.getQueue())],
    serverAdapter,
  });

  // 挂载 Bull Board
  app.use('/admin/queues', serverAdapter.getRouter());

  // 自定义统计 API
  app.get('/api/stats', async (req, res) => {
    const stats = await taskQueue.getStats();
    res.json(stats);
  });

  // 启动服务器
  app.listen(port, () => {
    console.log(`Monitor server running on http://localhost:${port}`);
    console.log(`Bull Board: http://localhost:${port}/admin/queues`);
  });

  return app;
}
```

---

## 📂 文件结构

```
src/
├── infrastructure/
│   └── queue/
│       ├── redis.ts                    # Redis 连接配置
│       ├── TaskQueue.ts                # 任务队列
│       └── index.ts                    # 导出
├── workers/
│   ├── TaskWorker.ts                   # 任务处理器
│   ├── WorkerPool.ts                   # Worker 进程池（可选）
│   └── index.ts
├── schedulers/
│   ├── TaskScheduler.ts                # 任务调度器
│   └── index.ts
├── monitoring/
│   ├── server.ts                       # 监控面板服务器
│   └── index.ts
├── api/
│   ├── routes/
│   │   ├── tasks.ts                    # 任务相关 API
│   │   └── index.ts
│   └── server.ts                       # API 服务器
└── cli/
    ├── start-worker.ts                 # 启动 Worker CLI
    ├── start-monitor.ts                # 启动监控面板 CLI
    └── index.ts
```

---

## 🚀 实施步骤

### Step 1: 环境准备（1 天）

1. ✅ 安装依赖
   ```bash
   pnpm add bullmq ioredis @bull-board/api @bull-board/express express
   pnpm add -D @types/bullmq @types/express
   ```

2. ✅ 配置 Redis
   - 更新 `.env` 添加 Redis 配置
   - 验证 Redis 连接

3. ✅ 创建基础文件结构
   - 创建 `infrastructure/queue` 目录
   - 创建 `workers` 目录
   - 创建 `schedulers` 目录

### Step 2: 任务队列实现（2 天）

1. ✅ 实现 Redis 连接
   - `src/infrastructure/queue/redis.ts`

2. ✅ 实现 TaskQueue 类
   - `src/infrastructure/queue/TaskQueue.ts`
   - 支持添加任务
   - 支持延迟任务
   - 支持优先级
   - 支持队列统计

3. ✅ 单元测试
   - 测试队列创建
   - 测试任务添加
   - 测试延迟任务
   - 测试优先级

### Step 3: Worker 实现（2-3 天）

1. ✅ 实现 TaskWorker 类
   - `src/workers/TaskWorker.ts`
   - 集成工作流执行逻辑
   - 实现任务抢占
   - 实现状态更新
   - 实现错误处理

2. ✅ 实现 Worker CLI
   - `src/cli/start-worker.ts`
   - 支持启动单个 Worker
   - 支持配置并发数

3. ✅ 集成测试
   - 测试 Worker 启动
   - 测试任务处理
   - 测试错误重试
   - 测试并发处理

### Step 4: 调度器实现（1-2 天）

1. ✅ 实现 TaskScheduler 类
   - `src/schedulers/TaskScheduler.ts`
   - 支持创建任务
   - 支持批量创建
   - 支持延迟调度

2. ✅ 实现 API 服务器
   - `src/api/server.ts`
   - POST /api/tasks - 创建任务
   - GET /api/tasks/:id - 查询任务
   - GET /api/tasks - 列出任务
   - DELETE /api/tasks/:id - 取消任务

3. ✅ API 测试
   - 测试任务创建
   - 测试任务查询
   - 测试任务取消

### Step 5: 监控面板实现（1 天）

1. ✅ 实现 Bull Board 集成
   - `src/monitoring/server.ts`
   - 配置队列监控
   - 配置任务操作

2. ✅ 实现统计 API
   - GET /api/stats - 队列统计
   - GET /api/workers - Worker 状态

3. ✅ 测试监控面板
   - 验证 Bull Board 显示
   - 验证任务操作
   - 验证统计信息

### Step 6: 集成测试和文档（1 天）

1. ✅ 端到端测试
   - 创建任务 → Worker 处理 → 查询结果
   - 测试失败重试
   - 测试并发处理

2. ✅ 编写文档
   - API 文档
   - 部署文档
   - 使用指南

---

## 🧪 测试计划

### 单元测试

```typescript
// tests/queue/TaskQueue.test.ts
describe('TaskQueue', () => {
  it('should add task to queue', async () => {
    const queue = new TaskQueue(mockConnection);
    await queue.addTask({
      taskId: 'test-1',
      mode: 'async',
      topic: 'Test',
      requirements: 'Test',
    });

    const stats = await queue.getStats();
    expect(stats.waiting).toBe(1);
  });

  it('should add delayed task', async () => {
    const queue = new TaskQueue(mockConnection);
    await queue.addDelayedTask({
      taskId: 'test-1',
      mode: 'async',
      topic: 'Test',
      requirements: 'Test',
    }, 5000);

    const stats = await queue.getStats();
    expect(stats.delayed).toBe(1);
  });
});
```

### 集成测试

```typescript
// tests/integration/workflow.test.ts
describe('Workflow Integration', () => {
  it('should process task end-to-end', async () => {
    // 1. 创建任务
    const taskId = await scheduler.scheduleTask({
      mode: 'async',
      topic: 'Test',
      requirements: 'Test',
    });

    // 2. 启动 Worker
    const worker = new TaskWorker('test-worker');
    await worker.start();

    // 3. 等待处理
    await new Promise(resolve => setTimeout(resolve, 5000));

    // 4. 验证结果
    const task = await repo.findById(taskId);
    expect(task?.status).toBe('completed');

    await worker.close();
  });
});
```

---

## 📊 性能目标

| 指标 | 目标 | 说明 |
|------|------|------|
| 任务吞吐量 | 10+ 任务/秒/Worker | 单个 Worker 处理能力 |
| 并发数 | 2-5 个/Worker | 可配置并发数 |
| 内存占用 | <500MB/Worker | 单个 Worker 进程 |
| 延迟 | <100ms | 任务从队列到开始处理的延迟 |
| 可用性 | 99.9% | 系统可用性 |

---

## 🔐 安全考虑

1. **Redis 认证**
   - 使用密码保护 Redis
   - 使用独立的 Redis DB

2. **任务验证**
   - 验证任务输入参数
   - 限制任务大小
   - 防止恶意任务

3. **资源限制**
   - 限制并发数
   - 限制任务执行时间
   - 限制内存使用

---

## 📝 配置示例

### .env 配置

```bash
# Redis 配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
REDIS_DB=0

# Worker 配置
WORKER_ID=worker-1
WORKER_CONCURRENCY=2

# API 配置
API_PORT=3000
API_HOST=0.0.0.0

# 监控配置
MONITOR_PORT=3001
```

### Worker 启动脚本

```json
{
  "scripts": {
    "worker": "tsx src/cli/start-worker.ts",
    "worker:dev": "tsx watch src/cli/start-worker.ts",
    "monitor": "tsx src/cli/start-monitor.ts",
    "api": "tsx src/api/server.ts"
  }
}
```

---

## 🎯 验收标准

### 功能验收

- [ ] 可以创建异步任务
- [ ] Worker 可以从队列获取并处理任务
- [ ] 任务失败自动重试
- [ ] 支持延迟任务
- [ ] 支持任务优先级
- [ ] 可以查询任务状态
- [ ] 监控面板正常显示
- [ ] 支持任务操作（重试、删除）

### 性能验收

- [ ] 单 Worker 可以并发处理 2+ 任务
- [ ] 任务处理时间与阶段 2b 基本一致（~2-3 分钟）
- [ ] 系统内存占用合理（<2GB 总计）
- [ ] 任务延迟 <100ms

### 质量验收

- [ ] 所有单元测试通过
- [ ] 集成测试通过
- [ ] 代码覆盖率 >80%
- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 错误
- [ ] 文档完整

---

## 📚 参考资料

### BullMQ 官方文档
- 官方网站: https://docs.bullmq.io/
- GitHub: https://github.com/taskforcesh/bullmq
- API 参考: https://docs.bullmq.io/guide/introduction

### Bull Board（监控面板）
- GitHub: https://github.com/felixmosh/bull-board
- 示例: https://github.com/felixmosh/bull-board/tree/master/examples

### Redis
- 官方文档: https://redis.io/docs/
- 命令参考: https://redis.io/commands/

### 相关文章
- BullMQ vs Bull: https://blog.taskforce.sh/announcing-bullmq-3/
- TypeScript Best Practices: https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html

---

**文档生成时间**: 2026-01-19
**预计开始时间**: 阶段 2b 完成后
**预计完成时间**: 7-10 天后
