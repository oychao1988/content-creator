# 阶段 3 实施资料准备清单

**准备日期**: 2025-01-19
**阶段**: 阶段 3 - 异步任务与 Worker 系统
**预计工期**: 3-5 天
**依赖**: 阶段 2 已完成 ✅

---

## 📋 资料清单

### ✅ 已有资料

#### 1. 文档资料
- ✅ `docs/bullmq-quick-reference.md` - Bull/BullMQ 快速参考指南
- ✅ `docs/phase-3-development-plan.md` - 阶段 3 详细开发计划（879 行）
- ✅ `dev/active/implementation-analysis/implementation-analysis-tasks.md` - 任务清单

#### 2. 已安装依赖
```json
{
  "bull": "^4.16.5",              // ✅ 已安装（注意：不是 BullMQ）
  "ioredis": "^5.9.2",            // ✅ 已安装
  "@types/ioredis": "^5.0.0"      // ✅ 已安装
}
```

#### 3. 现有基础设施
- ✅ Redis 配置（.env 中已配置）
- ✅ PostgreSQL 数据库
- ✅ SyncExecutor（可复用逻辑）
- ✅ 工作流图（ContentCreatorGraph）

---

## ⚠️ 关键差异说明

### Bull vs BullMQ

项目当前使用 **Bull 4.16.5**，但文档示例主要基于 **BullMQ 5.x**。

| 特性 | Bull 4.x | BullMQ 5.x |
|------|----------|------------|
| 导入 | `import { Queue } from 'bull'` | `import { Queue } from 'bullmq'` |
| Redis 连接 | `new Queue(name, { redis: {...} })` | `new Queue(name, connection)` |
| Worker 创建 | `new Worker(name, processor, { redis })` | `new Worker(name, processor, { connection })` |
| 类型支持 | `@types/bull` | 内置 TypeScript |

**决策**: 使用 **Bull 4.x**（已安装），适配文档示例到 Bull API

---

## 📦 需要安装的依赖

### 核心依赖
```bash
# 监控面板（可选，建议安装）
pnpm add bull-board @bull-board/express express

# 类型定义
pnpm add -D @types/express @types/bull-board
```

### 验证安装
```bash
# 检查 Bull 版本
pnpm list bull

# 检查 Redis 连接
pnpm run verify-env
```

---

## 🏗️ 架构概览

### 系统组件

```
┌─────────────────────────────────────┐
│         CLI / API 接口              │
│  (创建任务 → 添加到队列)            │
└──────────────┬──────────────────────┘
               │
               ↓
┌──────────────────────────────────────┐
│       Bull Queue (Redis)             │
│  - 任务队列                           │
│  - 优先级                             │
│  - 重试策略                           │
│  - 延迟执行                           │
└──────────────┬───────────────────────┘
               │
        ┌──────┴──────┐
        ↓             ↓
┌─────────────┐ ┌─────────────┐
│  Worker 1    │ │  Worker 2    │
│  - claim     │ │  - claim     │
│  - execute   │ │  - execute   │
│  - update    │ │  - update    │
└──────┬──────┘ └──────┬──────┘
       │               │
       └───────┬───────┘
               ↓
┌──────────────────────────────────────┐
│      PostgreSQL Database             │
│  - 任务持久化                         │
│  - 状态更新                           │
│  - 结果存储                           │
└──────────────────────────────────────┘
```

### 核心流程

1. **任务提交**
   ```
   CLI/API → TaskScheduler.addTask()
          → TaskQueue.add()
          → Bull Queue (Redis)
   ```

2. **任务处理**
   ```
   Bull Queue → Worker.process()
              → claimForProcessing()
              → SyncExecutor.execute()
              → markAsCompleted()
   ```

3. **状态更新**
   ```
   Worker → PostgreSQL (TaskRepository)
          → status: pending → running → completed
   ```

---

## 🔧 需要实现的组件

### 1. TaskQueue（任务队列）

**文件**: `src/infrastructure/queue/TaskQueue.ts`

**职责**:
- 封装 Bull Queue
- 提供添加任务的方法
- 配置重试策略
- 提供队列统计

**Bull API 示例**:
```typescript
import { Queue, JobOptions } from 'bull';
import Redis from 'ioredis';

export class TaskQueue {
  private queue: Queue;

  constructor(connection: Redis) {
    this.queue = new Queue('content-creator-tasks', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }

  async addTask(data: any, options?: JobOptions): Promise<void> {
    await this.queue.add('process-content', data, options);
  }
}
```

### 2. TaskWorker（任务处理器）

**文件**: `src/workers/TaskWorker.ts`

**职责**:
- 从队列获取任务
- 调用 SyncExecutor 执行
- 更新任务状态
- 处理错误和重试

**Bull Worker API 示例**:
```typescript
import { Worker, Job } from 'bull';
import Redis from 'ioredis';

export class TaskWorker {
  private worker: Worker;

  constructor(workerId: string, concurrency: number) {
    const connection = new Redis();

    this.worker = new Worker(
      'content-creator-tasks',
      async (job: Job) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency,
      }
    );

    this.setupEvents(workerId);
  }

  private async processJob(job: Job) {
    // 任务处理逻辑
    const taskId = job.data.taskId;

    // 1. claim 任务
    // 2. 执行工作流
    // 3. 更新状态

    return { success: true, taskId };
  }

  private setupEvents(workerId: string) {
    this.worker.on('completed', (job) => {
      console.log(`[${workerId}] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[${workerId}] Job ${job?.id} failed:`, err.message);
    });
  }

  async close(): Promise<void> {
    await this.worker.close();
  }
}
```

### 3. TaskScheduler（任务调度器）

**文件**: `src/schedulers/TaskScheduler.ts`

**职责**:
- 接收任务创建请求
- 保存到数据库
- 添加到队列

**接口示例**:
```typescript
export class TaskScheduler {
  constructor(private queue: TaskQueue, private repo: ITaskRepository) {}

  async scheduleTask(params: CreateTaskParams): Promise<string> {
    // 1. 创建任务记录
    const task = await this.repo.create(params);

    // 2. 添加到队列
    await this.queue.addTask({
      taskId: task.id,
      topic: task.topic,
      requirements: task.requirements,
      // ...
    });

    return task.id;
  }
}
```

### 4. Bull Board（监控面板）

**文件**: `src/monitoring/server.ts`

**职责**:
- 提供 Web 监控界面
- 显示队列状态
- 支持任务操作

**Bull Board 集成**:
```typescript
import express from 'express';
import { createBullBoard } from 'bull-board';
import { BullAdapter } from 'bull-board/bullAdapter';
import { TaskQueue } from '../infrastructure/queue/TaskQueue';

export function createMonitorServer() {
  const app = express();

  const board = createBullBoard({
    queues: [new BullAdapter(taskQueue.getQueue())],
  });

  app.use('/admin/queues', board.router);

  return app;
}
```

---

## 📂 文件结构

### 需要创建的文件

```
src/
├── infrastructure/
│   └── queue/
│       ├── TaskQueue.ts          ⭐ 核心队列封装
│       ├── redis.ts              ⭐ Redis 连接配置
│       └── index.ts
├── workers/
│   ├── TaskWorker.ts             ⭐ 任务处理器
│   ├── WorkerPool.ts             🔄 可选：进程池
│   └── index.ts
├── schedulers/
│   ├── TaskScheduler.ts          ⭐ 任务调度器
│   └── index.ts
├── monitoring/
│   ├── server.ts                 ⭐ 监控面板
│   └── index.ts
├── api/
│   ├── routes/
│   │   └── tasks.ts              ⭐ API 路由
│   └── server.ts                 ⭐ API 服务器
└── cli/
    ├── start-worker.ts           ⭐ 启动 Worker
    ├── start-monitor.ts          ⭐ 启动监控
    └── index.ts
```

---

## 🔑 关键技术点

### 1. Bull Queue 配置

**重试策略**:
```typescript
{
  attempts: 3,                    // 最多重试 3 次
  backoff: {
    type: 'exponential',          // 指数退避
    delay: 2000,                  // 初始延迟 2 秒
  },
}
```

**优先级**:
```typescript
{
  priority: 1,                    // 1-10，数字越小优先级越高
}
```

**延迟任务**:
```typescript
{
  delay: 5000,                    // 延迟 5 秒执行
}
```

### 2. Worker 并发控制

```typescript
{
  concurrency: 2,                 // 并发处理 2 个任务
  limiter: {
    max: 10,                      // 每秒最多处理 10 个
    duration: 1000,
  },
}
```

### 3. 任务抢占（乐观锁）

```typescript
// Worker 中
const claimed = await this.repo.claimForProcessing(
  taskId,
  workerId
);

if (!claimed) {
  throw new Error('Task already claimed');
}
```

### 4. 优雅关闭

```typescript
process.on('SIGTERM', async () => {
  console.log('Closing worker...');
  await worker.close();
  process.exit(0);
});
```

---

## 📝 配置文件

### .env 需要添加

```bash
# Redis 配置
REDIS_HOST=150.158.88.23
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

### package.json 需要添加

```json
{
  "scripts": {
    "worker": "tsx src/cli/start-worker.ts",
    "worker:dev": "tsx watch src/cli/start-worker.ts",
    "monitor": "tsx src/cli/start-monitor.ts",
    "api": "tsx src/api/server.ts",
    "queue:test": "tsx scripts/test-queue.ts"
  }
}
```

---

## 🧪 测试策略

### 单元测试

```typescript
// tests/queue/TaskQueue.test.ts
describe('TaskQueue', () => {
  it('should add task to queue');
  it('should add delayed task');
  it('should calculate priority');
  it('should get stats');
});

// tests/workers/TaskWorker.test.ts
describe('TaskWorker', () => {
  it('should process job');
  it('should handle errors');
  it('should update task status');
});
```

### 集成测试

```typescript
// tests/integration/async-workflow.test.ts
describe('Async Workflow', () => {
  it('should process task end-to-end');
  it('should retry on failure');
  it('should handle concurrent tasks');
});
```

---

## 📚 参考资料

### 官方文档
- **Bull 文档**: https://docs.bullmq.io/bull（注意：不是 BullMQ）
- **Bull GitHub**: https://github.com/OptimalBits/bull
- **Redis**: https://redis.io/docs/

### 项目文档
- ✅ `docs/bullmq-quick-reference.md` - 快速参考（需适配到 Bull）
- ✅ `docs/phase-3-development-plan.md` - 详细开发计划

### Bull Board
- GitHub: https://github.com/felixmosh/bull-board
- 注意：使用 `@bull-board/express` 的 Bull Adapter

---

## ✅ 准备工作检查清单

### 环境准备
- [ ] Redis 服务运行中（已配置：150.158.88.23:6379）
- [ ] PostgreSQL 运行中
- [ ] Node.js >= 18.0.0
- [ ] pnpm 可用

### 依赖检查
- [ ] bull@4.16.5 ✅
- [ ] ioredis@5.9.2 ✅
- [ ] @types/ioredis ✅
- [ ] @bull-board/express（需安装）
- [ ] express（需安装）

### 代码准备
- [ ] SyncExecutor 已完成 ✅
- [ ] MemoryTaskRepository 已完成 ✅
- [ ] ContentCreatorGraph 已完成 ✅
- [ ] 工作流节点已完成 ✅

### 配置准备
- [ ] .env 中 Redis 配置已设置 ✅
- [ ] WORKER_ID 环境变量
- [ ] WORKER_CONCURRENCY 环境变量

---

## 🚀 实施步骤建议

### Day 1: 基础设施
1. 安装缺失依赖（bull-board, express）
2. 创建 Redis 连接配置
3. 实现 TaskQueue 类
4. 编写队列测试

### Day 2: Worker 实现
1. 实现 TaskWorker 类
2. 集成 SyncExecutor
3. 实现 Worker 启动脚本
4. 编写 Worker 测试

### Day 3: 调度器与 API
1. 实现 TaskScheduler 类
2. 实现 API 服务器
3. 实现任务创建和查询 API
4. API 测试

### Day 4: 监控与集成
1. 集成 Bull Board
2. 实现监控面板
3. 端到端测试
4. 并发测试

### Day 5: 文档与优化
1. 编写使用文档
2. 性能优化
3. 错误处理完善
4. 部署配置

---

## 🎯 验收标准

### 功能验收
- [ ] 可以创建异步任务
- [ ] Worker 可以处理任务
- [ ] 支持多个 Worker 并发
- [ ] 任务失败自动重试
- [ ] 监控面板可用

### 性能验收
- [ ] 2 个 Worker 可同时运行
- [ ] 单 Worker 并发处理 2+ 任务
- [ ] 任务崩溃可被接管
- [ ] 10 个并发任务测试通过

---

**准备完成时间**: 2025-01-19
**准备人**: Claude
**状态**: ✅ 资料齐全，可以开始实施
