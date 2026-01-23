# 实施指南 - 同步执行器与CLI

**创建时间**: 2025-01-19
**目标**: 完成阶段2剩余任务 - 同步执行器与CLI接口

---

## 📋 目录

1. [同步执行器实现指南](#1-同步执行器实现指南)
2. [CLI接口实现指南](#2-cli接口实现指南)
3. [测试框架配置指南](#3-测试框架配置指南)
4. [PostgreSQL快速启动](#4-postgresql快速启动)
5. [实施检查清单](#5-实施检查清单)

---

## 1. 同步执行器实现指南

### 1.1 目标

创建同步执行器,负责:
- 任务生命周期管理
- LangGraph工作流调用
- 结果持久化
- 错误处理和回滚

### 1.2 文件结构

```
src/application/
├── workflow/
│   ├── SyncExecutor.ts       # 同步执行器
│   └── types.ts              # 执行器类型定义
```

### 1.3 核心接口定义

**`src/application/workflow/types.ts`**

```typescript
import type { Task, CreateTaskParams } from '../../domain/entities/Task.js';
import type { WorkflowState } from '../../domain/workflow/State.js';

/**
 * 执行器配置
 */
export interface ExecutorConfig {
  // 数据库
  databaseType: 'postgres' | 'sqlite' | 'memory';

  // 超时配置
  timeout?: number;           // 单步超时(毫秒)
  totalTimeout?: number;      // 总超时(毫秒)

  // 重试配置
  maxRetries?: number;        // 最大重试次数

  // 日志配置
  enableLogging?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * 执行结果
 */
export interface ExecutionResult {
  taskId: string;
  status: 'completed' | 'failed' | 'cancelled';
  finalState: WorkflowState;
  duration: number;           // 执行时长(毫秒)
  error?: string;
  metadata: {
    stepsCompleted: string[];
    tokensUsed: number;
    cost: number;
  };
}

/**
 * 执行进度回调
 */
export type ProgressCallback = (progress: {
  taskId: string;
  currentStep: string;
  percentage: number;
  message: string;
}) => void;
```

### 1.4 同步执行器实现

**`src/application/workflow/SyncExecutor.ts`**

```typescript
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../infrastructure/logging/logger.js';
import type { ITaskRepository } from '../../domain/repositories/TaskRepository.js';
import type { Task, CreateTaskParams, TaskStatus } from '../../domain/entities/Task.js';
import type { WorkflowState } from '../../domain/workflow/State.js';
import { contentCreatorGraph } from '../../domain/workflow/ContentCreatorGraph.js';
import { createInitialState } from '../../domain/workflow/State.js';
import type {
  ExecutorConfig,
  ExecutionResult,
  ProgressCallback,
} from './types.js';

const logger = createLogger('SyncExecutor');

/**
 * 同步执行器
 *
 * 负责任务的端到端同步执行
 */
export class SyncExecutor {
  private taskRepo: ITaskRepository;
  private config: ExecutorConfig;
  private progressCallbacks: Map<string, ProgressCallback[]> = new Map();

  constructor(taskRepo: ITaskRepository, config: ExecutorConfig) {
    this.taskRepo = taskRepo;
    this.config = {
      timeout: 60000,         // 默认单步超时60秒
      totalTimeout: 300000,   // 默认总超时5分钟
      maxRetries: 3,
      enableLogging: true,
      logLevel: 'info',
      ...config,
    };
  }

  /**
   * 创建并执行任务
   */
  async execute(params: CreateTaskParams): Promise<ExecutionResult> {
    const startTime = Date.now();
    const taskId = params.idempotencyKey || uuidv4();

    logger.info('Starting task execution', { taskId, topic: params.topic });

    try {
      // 1. 创建任务记录
      const task = await this.createTask(taskId, params);

      // 2. 创建初始工作流状态
      const initialState = createInitialState({
        taskId: task.taskId,
        topic: task.topic,
        requirements: task.requirements,
        targetAudience: task.targetAudience || '',
        hardConstraints: task.hardConstraints,
      });

      // 3. 更新任务状态为running
      await this.taskRepo.updateStatus(taskId, 'running', task.version);

      // 4. 执行工作流
      const finalState = await this.executeWorkflow(taskId, initialState);

      // 5. 保存结果
      await this.saveResults(taskId, finalState);

      // 6. 标记任务完成
      await this.taskRepo.markAsCompleted(taskId, task.version + 1);

      const duration = Date.now() - startTime;

      logger.info('Task completed successfully', {
        taskId,
        duration,
        stepsCompleted: finalState.stepsCompleted,
      });

      return {
        taskId,
        status: 'completed',
        finalState,
        duration,
        metadata: {
          stepsCompleted: finalState.stepsCompleted || [],
          tokensUsed: finalState.totalTokens || 0,
          cost: finalState.totalCost || 0,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Task execution failed', { taskId, error: errorMessage });

      // 标记任务失败
      try {
        const task = await this.taskRepo.findById(taskId);
        if (task) {
          await this.taskRepo.markAsFailed(taskId, errorMessage, task.version);
        }
      } catch (repoError) {
        logger.error('Failed to mark task as failed', { taskId, error: repoError });
      }

      return {
        taskId,
        status: 'failed',
        finalState: {} as WorkflowState,
        duration,
        error: errorMessage,
        metadata: {
          stepsCompleted: [],
          tokensUsed: 0,
          cost: 0,
        },
      };
    }
  }

  /**
   * 创建任务
   */
  private async createTask(taskId: string, params: CreateTaskParams): Promise<Task> {
    logger.debug('Creating task', { taskId });

    const task = await this.taskRepo.create({
      userId: params.userId,
      mode: params.mode,
      topic: params.topic,
      requirements: params.requirements,
      hardConstraints: params.hardConstraints,
      idempotencyKey: params.idempotencyKey,
    });

    logger.debug('Task created', { taskId: task.taskId, status: task.status });
    return task;
  }

  /**
   * 执行工作流
   */
  private async executeWorkflow(
    taskId: string,
    initialState: WorkflowState
  ): Promise<WorkflowState> {
    logger.debug('Executing workflow', { taskId });

    let currentState = initialState;
    const startTime = Date.now();

    // 使用流式执行以支持进度回调
    for await (const event of contentCreatorGraph.stream(initialState)) {
      const [nodeName, output] = Object.entries(event)[0];

      if (nodeName !== '__end__') {
        logger.debug('Workflow step completed', {
          taskId,
          node: nodeName,
        });

        // 更新当前状态
        currentState = { ...currentState, ...output } as WorkflowState;

        // 更新任务当前步骤
        const task = await this.taskRepo.findById(taskId);
        if (task) {
          await this.taskRepo.updateCurrentStep(taskId, nodeName, task.version);
        }

        // 保存State快照(用于断点续传)
        if (task) {
          await this.taskRepo.saveStateSnapshot(
            taskId,
            currentState,
            task.version + 1
          );
        }

        // 触发进度回调
        this.notifyProgress(taskId, {
          taskId,
          currentStep: nodeName,
          percentage: this.calculateProgress(nodeName),
          message: `已完成: ${nodeName}`,
        });

        // 检查超时
        if (this.config.totalTimeout) {
          const elapsed = Date.now() - startTime;
          if (elapsed > this.config.totalTimeout) {
            throw new Error(`任务执行超时 (${elapsed}ms > ${this.config.totalTimeout}ms)`);
          }
        }
      }
    }

    logger.debug('Workflow execution completed', { taskId });
    return currentState;
  }

  /**
   * 保存结果
   */
  private async saveResults(taskId: string, state: WorkflowState): Promise<void> {
    logger.debug('Saving results', { taskId });

    // TODO: 创建Result记录
    // TODO: 创建QualityCheck记录
    // TODO: 更新TokenUsage记录

    logger.debug('Results saved', { taskId });
  }

  /**
   * 注册进度回调
   */
  onProgress(taskId: string, callback: ProgressCallback): void {
    if (!this.progressCallbacks.has(taskId)) {
      this.progressCallbacks.set(taskId, []);
    }
    this.progressCallbacks.get(taskId)!.push(callback);
  }

  /**
   * 移除进度回调
   */
  removeProgressCallback(taskId: string, callback: ProgressCallback): void {
    const callbacks = this.progressCallbacks.get(taskId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * 通知进度更新
   */
  private notifyProgress(taskId: string, progress: {
    taskId: string;
    currentStep: string;
    percentage: number;
    message: string;
  }): void {
    const callbacks = this.progressCallbacks.get(taskId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(progress);
        } catch (error) {
          logger.error('Progress callback error', {
            taskId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
  }

  /**
   * 计算进度百分比
   */
  private calculateProgress(currentStep: string): number {
    const steps = ['search', 'organize', 'write', 'check_text', 'generate_image', 'check_image'];
    const index = steps.indexOf(currentStep);
    return index >= 0 ? Math.round((index + 1) / steps.length * 100) : 0;
  }

  /**
   * 取消任务执行
   */
  async cancel(taskId: string): Promise<boolean> {
    logger.info('Cancelling task', { taskId });

    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      logger.warn('Task not found', { taskId });
      return false;
    }

    if (task.status !== 'running') {
      logger.warn('Task is not running', { taskId, status: task.status });
      return false;
    }

    await this.taskRepo.updateStatus(taskId, 'cancelled', task.version);

    // 清理进度回调
    this.progressCallbacks.delete(taskId);

    logger.info('Task cancelled', { taskId });
    return true;
  }

  /**
   * 获取任务状态
   */
  async getStatus(taskId: string): Promise<{
    status: TaskStatus;
    currentStep?: string;
    progress: number;
  } | null> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      return null;
    }

    return {
      status: task.status,
      currentStep: task.currentStep,
      progress: this.calculateProgress(task.currentStep || ''),
    };
  }
}

/**
 * 创建同步执行器工厂函数
 */
export function createSyncExecutor(
  taskRepo: ITaskRepository,
  config?: Partial<ExecutorConfig>
): SyncExecutor {
  return new SyncExecutor(taskRepo, {
    databaseType: 'postgres',
    ...config,
  });
}
```

### 1.5 使用示例

```typescript
import { createSyncExecutor } from './application/workflow/SyncExecutor.js';
import { PostgresTaskRepository } from './infrastructure/database/PostgresTaskRepository.js';

// 创建Repository
const taskRepo = new PostgresTaskRepository({
  host: 'localhost',
  port: 5432,
  database: 'content_creator',
  user: 'postgres',
  password: 'your_password',
});

// 创建执行器
const executor = createSyncExecutor(taskRepo, {
  timeout: 60000,
  totalTimeout: 300000,
  enableLogging: true,
});

// 执行任务
const result = await executor.execute({
  mode: 'sync',
  topic: 'AI技术的发展',
  requirements: '写一篇关于AI技术发展的文章',
  targetAudience: '技术爱好者',
  hardConstraints: {
    minWords: 500,
    maxWords: 1000,
  },
});

console.log('执行结果:', result);
```

---

## 2. CLI接口实现指南

### 2.1 目标

创建命令行接口,支持:
- 创建任务
- 查询任务状态
- 获取任务结果
- 取消任务

### 2.2 安装依赖

```bash
pnpm add commander chalk ora
pnpm add -D @types/node
```

### 2.3 文件结构

```
src/presentation/cli/
├── index.ts              # CLI入口
├── commands/
│   ├── create.ts         # 创建任务命令
│   ├── status.ts         # 查询状态命令
│   ├── result.ts         # 获取结果命令
│   └── cancel.ts         # 取消任务命令
└── utils/
    ├── logger.ts         # CLI日志工具
    └── formatter.ts      # 输出格式化
```

### 2.4 CLI入口实现

**`src/presentation/cli/index.ts`**

```typescript
#!/usr/bin/env node

import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { statusCommand } from './commands/status.js';
import { resultCommand } from './commands/result.js';
import { cancelCommand } from './commands/cancel.js';

const program = new Command();

program
  .name('content-creator')
  .description('AI 驱动的内容创作工具')
  .version('0.1.0');

// 添加命令
program.addCommand(createCommand);
program.addCommand(statusCommand);
program.addCommand(resultCommand);
program.addCommand(cancelCommand);

// 解析参数
program.parse();
```

### 2.5 创建任务命令

**`src/presentation/cli/commands/create.ts`**

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createSyncExecutor } from '../../application/workflow/SyncExecutor.js';
import { PostgresTaskRepository } from '../../infrastructure/database/PostgresTaskRepository.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('CLI:Create');

export const createCommand = new Command('create')
  .description('创建内容创作任务')
  .option('-t, --topic <topic>', '文章主题')
  .option('-r, --requirements <requirements>', '创作要求')
  .option('-a, --audience <audience>', '目标受众', '普通读者')
  .option('--min-words <number>', '最小字数', '500')
  .option('--max-words <number>', '最大字数', '2000')
  .option('--sync', '同步执行(等待结果)', false)
  .action(async (options) => {
    try {
      // 验证输入
      if (!options.topic) {
        console.error(chalk.red('错误: 必须提供文章主题 (-t, --topic)'));
        process.exit(1);
      }

      if (!options.requirements) {
        console.error(chalk.red('错误: 必须提供创作要求 (-r, --requirements)'));
        process.exit(1);
      }

      console.log(chalk.blue('🚀 创建内容创作任务'));
      console.log(chalk.gray('─────────────────────────'));
      console.log(chalk.white(`主题: ${options.topic}`));
      console.log(chalk.white(`要求: ${options.requirements}`));
      console.log(chalk.white(`受众: ${options.audience}`));
      console.log(chalk.gray('─────────────────────────'));

      // 创建执行器
      const taskRepo = new PostgresTaskRepository();
      const executor = createSyncExecutor(taskRepo);

      // 创建任务
      const spinner = ora('创建任务中...').start();

      // 添加进度回调
      executor.onProgress('progress', (progress) => {
        spinner.text = `${progress.message} (${progress.percentage}%)`;
      });

      const result = await executor.execute({
        mode: options.sync ? 'sync' : 'async',
        topic: options.topic,
        requirements: options.requirements,
        targetAudience: options.audience,
        hardConstraints: {
          minWords: parseInt(options.minWords),
          maxWords: parseInt(options.maxWords),
        },
      });

      spinner.succeed('任务执行完成!');

      // 显示结果
      console.log(chalk.green('\n✅ 执行成功'));
      console.log(chalk.gray('─────────────────────────'));
      console.log(chalk.white(`任务ID: ${result.taskId}`));
      console.log(chalk.white(`状态: ${result.status}`));
      console.log(chalk.white(`耗时: ${Math.round(result.duration / 1000)}秒`));
      console.log(chalk.white(`Token: ${result.metadata.tokensUsed}`));
      console.log(chalk.white(`成本: ¥${result.metadata.cost.toFixed(4)}`));
      console.log(chalk.gray('─────────────────────────'));

      if (result.finalState.articleContent) {
        console.log(chalk.white('\n📝 生成的内容:'));
        console.log(chalk.gray('─────────────────────────'));
        console.log(result.finalState.articleContent);
        console.log(chalk.gray('─────────────────────────'));
      }

    } catch (error) {
      logger.error('Create command failed', error as Error);
      console.error(chalk.red(`\n❌ 错误: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });
```

### 2.6 查询状态命令

**`src/presentation/cli/commands/status.ts`**

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { PostgresTaskRepository } from '../../infrastructure/database/PostgresTaskRepository.js';

export const statusCommand = new Command('status')
  .description('查询任务状态')
  .requiredOption('-t, --task-id <taskId>', '任务ID')
  .action(async (options) => {
    try {
      const taskRepo = new PostgresTaskRepository();
      const task = await taskRepo.findById(options.taskId);

      if (!task) {
        console.error(chalk.red(`错误: 未找到任务 ${options.taskId}`));
        process.exit(1);
      }

      console.log(chalk.blue('📊 任务状态'));
      console.log(chalk.gray('─────────────────────────'));
      console.log(chalk.white(`任务ID: ${task.taskId}`));
      console.log(chalk.white(`状态: ${getStatusText(task.status)}`));
      console.log(chalk.white(`当前步骤: ${task.currentStep || '无'}`));
      console.log(chalk.white(`创建时间: ${formatDate(task.createdAt)}`));
      if (task.startedAt) {
        console.log(chalk.white(`开始时间: ${formatDate(task.startedAt)}`));
      }
      if (task.completedAt) {
        console.log(chalk.white(`完成时间: ${formatDate(task.completedAt)}`));
      }
      if (task.errorMessage) {
        console.log(chalk.red(`错误信息: ${task.errorMessage}`));
      }
      console.log(chalk.gray('─────────────────────────'));

    } catch (error) {
      console.error(chalk.red(`错误: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

function getStatusText(status: string): string {
  const statusMap: Record<string, string> = {
    'pending': '⏳ 待处理',
    'running': '🔄 运行中',
    'waiting': '⏸️ 等待中',
    'completed': '✅ 已完成',
    'failed': '❌ 失败',
    'cancelled': '⏹️ 已取消',
  };
  return statusMap[status] || status;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString('zh-CN');
}
```

### 2.7 添加到package.json

```json
{
  "bin": {
    "content-creator": "./dist/cli/index.js"
  },
  "scripts": {
    "cli": "tsx src/presentation/cli/index.ts",
    "build:cli": "tsc"
  }
}
```

### 2.8 使用示例

```bash
# 创建任务(同步执行)
pnpm run cli create -t "AI技术发展" -r "写一篇技术文章" --sync

# 查询任务状态
pnpm run cli status -t xxx-xxx-xxx

# 获取任务结果
pnpm run cli result -t xxx-xxx-xxx

# 取消任务
pnpm run cli cancel -t xxx-xxx-xxx
```

---

## 3. 测试框架配置指南

### 3.1 Vitest配置

**`vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/*.config.ts',
      ],
    },
  },
});
```

### 3.2 测试示例

**`tests/application/SyncExecutor.test.ts`**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SyncExecutor } from '../../src/application/workflow/SyncExecutor.js';
import { MemoryTaskRepository } from '../../src/infrastructure/database/MemoryTaskRepository.js';

describe('SyncExecutor', () => {
  let executor: SyncExecutor;
  let taskRepo: MemoryTaskRepository;

  beforeEach(() => {
    taskRepo = new MemoryTaskRepository();
    executor = new SyncExecutor(taskRepo, {
      databaseType: 'memory',
      enableLogging: false,
    });
  });

  afterEach(() => {
    // 清理
  });

  it('should create and execute task successfully', async () => {
    const result = await executor.execute({
      mode: 'sync',
      topic: '测试主题',
      requirements: '测试要求',
      targetAudience: '测试受众',
    });

    expect(result.status).toBe('completed');
    expect(result.taskId).toBeDefined();
    expect(result.duration).toBeGreaterThan(0);
  });

  it('should handle task creation failure', async () => {
    // Mock错误场景
    // ...

    await expect(
      executor.execute({
        mode: 'sync',
        topic: '测试',
        requirements: '测试',
      })
    ).rejects.toThrow();
  });

  it('should report progress correctly', async () => {
    const progresses: any[] = [];

    executor.onProgress('test-task', (progress) => {
      progresses.push(progress);
    });

    await executor.execute({
      mode: 'sync',
      topic: '测试',
      requirements: '测试',
      targetAudience: '测试',
      idempotencyKey: 'test-task',
    });

    expect(progresses.length).toBeGreaterThan(0);
    expect(progresses[0].taskId).toBe('test-task');
  });
});
```

### 3.3 运行测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test SyncExecutor

# 查看测试覆盖率
pnpm test:coverage

# 监听模式
pnpm test -- --watch
```

---

## 4. PostgreSQL快速启动

### 4.1 使用Docker启动

```bash
# 启动PostgreSQL容器
docker run --name postgres-db \
  -e POSTGRES_PASSWORD=Oychao#1988 \
  -p 5432:5432 \
  -v /data/postgres:/var/lib/postgresql/data \
  -d postgres:latest

# 查看日志
docker logs -f postgres-db

# 连接到数据库
docker exec -it postgres-db psql -U postgres

# 停止容器
docker stop postgres-db

# 删除容器
docker rm postgres-db
```

### 4.2 运行数据库迁移

```bash
# 验证环境
pnpm run verify-env

# 运行迁移
pnpm run db:migrate

# 查看迁移状态
pnpm run db:status

# 回滚迁移
pnpm run db:rollback
```

### 4.3 验证数据库连接

```bash
# 连接到数据库
psql -h localhost -p 5432 -U postgres -d postgres

# 查看表
\dt

# 查看tasks表结构
\d tasks

# 退出
\q
```

---

## 5. 实施检查清单

### 5.1 同步执行器实施步骤

- [ ] 创建 `src/application/workflow/types.ts`
- [ ] 创建 `src/application/workflow/SyncExecutor.ts`
- [ ] 实现任务创建逻辑
- [ ] 实现工作流执行逻辑
- [ ] 实现进度回调机制
- [ ] 实现任务取消功能
- [ ] 添加错误处理和日志
- [ ] 编写单元测试
- [ ] 集成测试

### 5.2 CLI接口实施步骤

- [ ] 安装Commander.js依赖
- [ ] 创建 `src/presentation/cli/index.ts`
- [ ] 实现create命令
- [ ] 实现status命令
- [ ] 实现result命令
- [ ] 实现cancel命令
- [ ] 添加输出格式化
- [ ] 添加帮助文档
- [ ] 测试所有命令

### 5.3 测试实施步骤

- [ ] 配置Vitest
- [ ] 编写SyncExecutor单元测试
- [ ] 编写CLI命令测试
- [ ] 编写集成测试
- [ ] 达到80%测试覆盖率
- [ ] 添加测试文档

### 5.4 数据库配置步骤

- [ ] 启动PostgreSQL容器
- [ ] 验证数据库连接
- [ ] 运行数据库迁移
- [ ] 验证表结构
- [ ] 测试Repository操作

---

## 6. 预计工期

| 任务 | 预计时间 | 优先级 |
|------|----------|--------|
| 同步执行器 | 1-2天 | 🔴 高 |
| CLI接口 | 1天 | 🔴 高 |
| 测试编写 | 1-2天 | 🟡 中 |
| PostgreSQL配置 | 10分钟 | 🔴 高 |
| 集成测试 | 1天 | 🟡 中 |

**总计**: 4-6天

---

## 7. 风险与缓解

### 风险1: LangGraph工作流集成复杂
**缓解**: 参考现有ContentCreatorGraph实现,使用流式API

### 风险2: PostgreSQL连接问题
**缓解**: 使用Docker快速启动,提供详细的配置指南

### 风险3: 测试覆盖不足
**缓解**: 使用Vitest的覆盖率报告,逐步提高覆盖率

### 风险4: CLI用户体验不佳
**缓解**: 使用chalk和ora美化输出,添加进度提示

---

## 8. 参考资料

### 项目内部文档
- `/dev/active/implementation-analysis/` - 实施分析文档
- `/docs/architecture-complete.md` - 完整架构文档
- `src/domain/workflow/` - 工作流实现参考

### 外部文档
- LangGraph文档: https://langchain-ai.github.io/langgraph/
- Commander.js文档: https://commander.js.org/
- Vitest文档: https://vitest.dev/
- PostgreSQL文档: https://www.postgresql.org/docs/

---

**最后更新**: 2025-01-19
**维护者**: Claude Code
**状态**: 📝 待实施
