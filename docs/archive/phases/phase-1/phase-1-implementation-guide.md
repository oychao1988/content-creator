# 阶段 1 实施指南：核心数据层与基础架构

**项目**: Content Creator (写作 Agent)
**阶段**: 1 - 核心数据层与基础架构
**工期**: 5-7 天
**状态**: ⏳ 进行中

---

## 📋 阶段概述

### 目标
实现完整的数据访问层，包括领域模型、数据库表结构和 Repository 层，为后续工作流引擎提供坚实的数据基础。

### 时间分配
- 领域模型完善: **1 天**
- 数据库迁移脚本: **1 天** (简化版，不含分区)
- Repository 实现: **2 天**
- 数据访问测试: **1.5 天**
- 性能优化: **0.5 天**

### 验收标准
- ✅ 可以创建任务记录
- ✅ 可以查询和更新任务状态
- ✅ 数据库迁移可重复执行
- ✅ 测试覆盖率 > 80%
- ✅ 并发测试通过（乐观锁验证）

---

## 📦 领域模型设计

### 1.1 核心实体

#### **Task (任务)**

```typescript
// src/domain/entities/Task.ts

export enum TaskStatus {
  PENDING = 'pending',      // 等待执行
  RUNNING = 'running',      // 执行中
  COMPLETED = 'completed',  // 完成
  FAILED = 'failed'         // 失败
}

export enum ExecutionMode {
  SYNC = 'sync',            // 同步执行
  ASYNC = 'async'           // 异步执行
}

export interface Task {
  // 基础信息
  taskId: string;           // UUID
  userId?: string;          // 用户 ID (外键，可选)
  mode: ExecutionMode;      // 执行模式
  topic: string;            // 选题方向
  requirements: string;     // 写作要求

  // 硬性约束
  hardConstraints: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };

  // 状态字段
  status: TaskStatus;
  currentStep: string;      // 当前步骤
  workerId?: string;        // Worker ID（多 Worker 抢占）

  // 重试计数
  textRetryCount: number;   // 文本质检重试次数
  imageRetryCount: number;  // 配图质检重试次数

  // 乐观锁（并发控制）
  version: number;          // 版本号

  // 时间戳
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
  deletedAt?: Date;         // 软删除

  // 错误信息
  errorMessage?: string;

  // State 快照（崩溃恢复）
  stateSnapshot?: object;   // LangGraph State 序列化

  // 幂等性
  idempotencyKey?: string;  // 幂等键（防止重复提交）
}
```

#### **TaskStep (执行步骤)**

```typescript
// src/domain/entities/TaskStep.ts

export enum StepName {
  SEARCH = 'search',
  ORGANIZE = 'organize',
  WRITE = 'write',
  CHECK_TEXT = 'check_text',
  GENERATE_IMAGE = 'generate_image',
  CHECK_IMAGE = 'check_image'
}

export enum StepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

export interface TaskStep {
  id: number;
  taskId: string;
  stepName: StepName;
  status: StepStatus;
  attempt: number;          // 尝试次数（用于重试）

  // 输入输出
  inputData?: object;       // 输入数据 (JSON)
  outputData?: object;      // 输出数据 (JSON)

  // 性能指标
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;      // 执行耗时（毫秒）

  // 错误信息
  errorMessage?: string;
}
```

#### **QualityCheck (质检结果)**

```typescript
// src/domain/entities/QualityCheck.ts

export enum CheckType {
  TEXT = 'text',
  IMAGE = 'image'
}

export interface QualityCheck {
  id: number;
  taskId: string;
  checkType: CheckType;

  // 评分
  score: number;            // 1-10 分
  passed: boolean;
  hardConstraintsPassed: boolean;

  // 详情
  details: {
    // 硬规则检查结果
    hardRules?: {
      wordCount: { passed: boolean; wordCount: number };
      keywords: { passed: boolean; found: string[] };
      structure: { passed: boolean; checks: object };
    };

    // 软评分（LLM）
    softScores?: {
      relevance: { score: number; reason: string };
      coherence: { score: number; reason: string };
      completeness: { score: number; reason: string };
      readability: { score: number; reason: string };
    };

    // 文本质检
    wordCount?: number;
    keywordsFound?: string[];
    structureCheck?: {
      hasTitle: boolean;
      hasIntro: boolean;
      hasBody: boolean;
      hasConclusion: boolean;
    };

    // 配图质检
    relevanceScore?: number;
    aestheticScore?: number;
    promptMatch?: number;
  };

  // 改进建议
  fixSuggestions?: string[];

  // 元数据
  rubricVersion?: string;
  modelName?: string;
  promptHash?: string;

  checkedAt: Date;
}
```

#### **Result (生成结果)**

```typescript
// src/domain/entities/Result.ts

export enum ResultType {
  ARTICLE = 'article',
  IMAGE = 'image'
}

export interface Result {
  id: number;
  taskId: string;
  resultType: ResultType;
  content?: string;         // 文章内容 (Markdown)
  filePath?: string;        // 文件路径

  metadata: {
    // 文章元数据
    wordCount?: number;
    title?: string;
    keywords?: string[];

    // 配图元数据
    prompt?: string;
    url?: string;
    width?: number;
    height?: number;

    // 来源引用
    sources?: Array<{
      url: string;
      title: string;
      snippet: string;
    }>;
  };

  createdAt: Date;
}
```

#### **TokenUsage (Token 使用记录)**

```typescript
// src/domain/entities/TokenUsage.ts

export interface TokenUsage {
  id: number;
  taskId: string;
  traceId: string;          // 链路追踪 ID
  stepName: string;         // 步骤名称
  apiName: string;          // API 名称 (deepseek, doubao)
  modelName: string;        // 模型名称

  // Token 统计
  tokensIn: number;         // 输入 token
  tokensOut: number;        // 输出 token
  totalTokens: number;      // 总 token

  // 成本计算
  costPer1kTokensIn: number;
  costPer1kTokensOut: number;
  totalCost: number;

  // 元数据
  metadata?: {
    temperature?: number;
    maxTokens?: number;
    duration?: number;
  };

  createdAt: Date;
}
```

---

## 🗄️ 数据库表结构设计

### 2.1 数据库迁移脚本

**注意**: 根据实施计划修订版，阶段 1 使用简化版设计，**不含分区策略**。

#### **迁移脚本位置**
```
migrations/
└── 001_create_initial_tables.sql
```

#### **核心表结构**

##### **1. tasks 表**

```sql
-- 任务主表
CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT UNIQUE NOT NULL,
  user_id TEXT,                      -- 用户 ID（外键，可选）

  -- 执行模式和需求
  mode TEXT NOT NULL CHECK (mode IN ('sync', 'async')),
  topic TEXT NOT NULL,
  requirements TEXT NOT NULL,

  -- 硬性约束 (JSON)
  hard_constraints JSONB,

  -- 状态字段
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_step TEXT,
  worker_id TEXT,

  -- 重试计数
  text_retry_count INTEGER NOT NULL DEFAULT 0,
  image_retry_count INTEGER NOT NULL DEFAULT 0,

  -- 乐观锁
  version INTEGER NOT NULL DEFAULT 1,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  -- 错误和快照
  error_message TEXT,
  state_snapshot JSONB,

  -- 幂等性
  idempotency_key TEXT UNIQUE
);

-- 索引
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_idempotency_key ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 自动更新 updated_at 触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

##### **2. task_steps 表**

```sql
-- 执行步骤记录表
CREATE TABLE IF NOT EXISTS task_steps (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_name TEXT NOT NULL CHECK (step_name IN (
    'search', 'organize', 'write', 'check_text',
    'generate_image', 'check_image'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'skipped'
  )),

  -- 尝试次数
  attempt INTEGER NOT NULL DEFAULT 1,

  -- 输入输出 (JSON)
  input_data JSONB,
  output_data JSONB,

  -- 性能指标
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,

  -- 错误信息
  error_message TEXT,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX idx_task_steps_step_name ON task_steps(step_name);
CREATE INDEX idx_task_steps_status ON task_steps(status);
```

##### **3. quality_checks 表**

```sql
-- 质检结果表
CREATE TABLE IF NOT EXISTS quality_checks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('text', 'image')),

  -- 评分
  score NUMERIC(3, 2) NOT NULL CHECK (score >= 1 AND score <= 10),
  passed BOOLEAN NOT NULL,
  hard_constraints_passed BOOLEAN NOT NULL,

  -- 详情 (JSON)
  details JSONB NOT NULL,

  -- 改进建议
  fix_suggestions TEXT[],

  -- 元数据
  rubric_version TEXT,
  model_name TEXT,
  prompt_hash TEXT,

  -- 时间戳
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_quality_checks_task_id ON quality_checks(task_id);
CREATE INDEX idx_quality_checks_check_type ON quality_checks(check_type);
CREATE INDEX idx_quality_checks_passed ON quality_checks(passed);
```

##### **4. results 表**

```sql
-- 生成结果表
CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  result_type TEXT NOT NULL CHECK (result_type IN ('article', 'image')),

  -- 内容
  content TEXT,
  file_path TEXT,

  -- 元数据 (JSON)
  metadata JSONB NOT NULL,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,

  -- 约束：一个任务只能有一种类型的结果
  UNIQUE (task_id, result_type)
);

-- 索引
CREATE INDEX idx_results_task_id ON results(task_id);
CREATE INDEX idx_results_result_type ON results(result_type);
```

##### **5. token_usage 表**

```sql
-- Token 使用记录表
CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  api_name TEXT NOT NULL,
  model_name TEXT NOT NULL,

  -- Token 统计
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,

  -- 成本计算
  cost_per_1k_tokens_in NUMERIC(10, 6) NOT NULL,
  cost_per_1k_tokens_out NUMERIC(10, 6) NOT NULL,
  total_cost NUMERIC(10, 6) NOT NULL,

  -- 元数据 (JSON)
  metadata JSONB,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_token_usage_task_id ON token_usage(task_id);
CREATE INDEX idx_token_usage_trace_id ON token_usage(trace_id);
CREATE INDEX idx_token_usage_api_name ON token_usage(api_name);
CREATE INDEX idx_token_usage_created_at ON token_usage(created_at DESC);
```

##### **6. users 表 (可选)**

```sql
-- 用户表（如果需要用户系统）
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  name TEXT,

  -- 配额管理
  quota_daily INTEGER NOT NULL DEFAULT 10,
  quota_used_today INTEGER NOT NULL DEFAULT 0,

  -- 状态
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  -- 元数据
  metadata JSONB
);

-- 索引
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);

-- 自动更新 updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

## 🔧 Repository 实现

### 3.1 Repository 基类

```typescript
// src/infrastructure/database/BaseRepository.ts

import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../../config';

/**
 * Repository 基类
 * 提供通用的数据库操作和事务管理
 */
export abstract class BaseRepository {
  protected pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || new Pool({
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      max: 20, // 连接池大小
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * 执行查询
   */
  protected async query<T>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();
    try {
      const res = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: res.rowCount });
      return res;
    } catch (error) {
      console.error('Query error', { text, error });
      throw error;
    }
  }

  /**
   * 获取数据库连接（用于事务）
   */
  protected async getConnection(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * 执行事务
   */
  protected async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getConnection();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
```

### 3.2 TaskRepository 接口

```typescript
// src/domain/repositories/TaskRepository.ts

import { Task, TaskStatus, ExecutionMode } from '../entities/Task';

export interface CreateTaskInput {
  userId?: string;
  mode: ExecutionMode;
  topic: string;
  requirements: string;
  hardConstraints?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
  idempotencyKey?: string;
}

export interface TaskRepository {
  /**
   * 创建任务
   */
  create(input: CreateTaskInput): Promise<Task>;

  /**
   * 根据 taskId 查询任务
   */
  findById(taskId: string): Promise<Task | null>;

  /**
   * 根据 userId 查询任务列表
   */
  findByUserId(userId: string, limit?: number, offset?: number): Promise<Task[]>;

  /**
   * 更新任务状态
   */
  updateStatus(taskId: string, status: TaskStatus, version: number): Promise<boolean>;

  /**
   * Worker 抢占任务（乐观锁）
   */
  claimTask(taskId: string, workerId: string, version: number): Promise<boolean>;

  /**
   * 更新当前步骤
   */
  updateCurrentStep(taskId: string, step: string, version: number): Promise<boolean>;

  /**
   * 增加重试计数
   */
  incrementRetryCount(
    taskId: string,
    type: 'text' | 'image',
    version: number
  ): Promise<boolean>;

  /**
   * 保存 State 快照
   */
  saveStateSnapshot(taskId: string, snapshot: object, version: number): Promise<boolean>;

  /**
   * 标记任务完成
   */
  markAsCompleted(taskId: string, version: number): Promise<boolean>;

  /**
   * 标记任务失败
   */
  markAsFailed(taskId: string, errorMessage: string, version: number): Promise<boolean>;

  /**
   * 软删除任务
   */
  softDelete(taskId: string): Promise<boolean>;
}
```

### 3.3 TaskRepository 实现

```typescript
// src/infrastructure/database/PostgresTaskRepository.ts

import { BaseRepository } from './BaseRepository';
import { TaskRepository, CreateTaskInput } from '../../domain/repositories/TaskRepository';
import { Task, TaskStatus, ExecutionMode } from '../../domain/entities/Task';
import { v4 as uuidv4 } from 'uuid';

export class PostgresTaskRepository extends BaseRepository implements TaskRepository {

  /**
   * 创建任务
   */
  async create(input: CreateTaskInput): Promise<Task> {
    const taskId = input.idempotencyKey || uuidv4();

    const query = `
      INSERT INTO tasks (
        task_id, user_id, mode, topic, requirements,
        hard_constraints, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      taskId,
      input.userId || null,
      input.mode,
      input.topic,
      input.requirements,
      JSON.stringify(input.hardConstraints || {}),
      input.idempotencyKey || null,
    ];

    const result = await this.query<any>(query, values);
    return this.mapToTask(result.rows[0]);
  }

  /**
   * 根据 taskId 查询任务
   */
  async findById(taskId: string): Promise<Task | null> {
    const query = 'SELECT * FROM tasks WHERE task_id = $1 AND deleted_at IS NULL';
    const result = await this.query<any>(query, [taskId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToTask(result.rows[0]);
  }

  /**
   * 根据 userId 查询任务列表
   */
  async findByUserId(userId: string, limit = 10, offset = 0): Promise<Task[]> {
    const query = `
      SELECT * FROM tasks
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.query<any>(query, [userId, limit, offset]);
    return result.rows.map(row => this.mapToTask(row));
  }

  /**
   * 更新任务状态（带乐观锁）
   */
  async updateStatus(taskId: string, status: TaskStatus, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET status = $1,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $2 AND version = $3
      RETURNING version
    `;

    const result = await this.query(query, [status, taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * Worker 抢占任务（乐观锁）
   */
  async claimTask(taskId: string, workerId: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET worker_id = $1,
          status = 'running',
          started_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE task_id = $2
        AND version = $3
        AND status = 'pending'
      RETURNING version
    `;

    const result = await this.query(query, [workerId, taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 更新当前步骤
   */
  async updateCurrentStep(taskId: string, step: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET current_step = $1,
          version = version + 1
      WHERE task_id = $2 AND version = $3
      RETURNING version
    `;

    const result = await this.query(query, [step, taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 增加重试计数
   */
  async incrementRetryCount(
    taskId: string,
    type: 'text' | 'image',
    version: number
  ): Promise<boolean> {
    const column = type === 'text' ? 'text_retry_count' : 'image_retry_count';

    const query = `
      UPDATE tasks
      SET ${column} = ${column} + 1,
          version = version + 1
      WHERE task_id = $1 AND version = $2
      RETURNING version
    `;

    const result = await this.query(query, [taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 保存 State 快照
   */
  async saveStateSnapshot(taskId: string, snapshot: object, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET state_snapshot = $1,
          version = version + 1
      WHERE task_id = $2 AND version = $3
      RETURNING version
    `;

    const result = await this.query(query, [JSON.stringify(snapshot), taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 标记任务完成
   */
  async markAsCompleted(taskId: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE task_id = $1 AND version = $2
      RETURNING version
    `;

    const result = await this.query(query, [taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 标记任务失败
   */
  async markAsFailed(taskId: string, errorMessage: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET status = 'failed',
          error_message = $1,
          completed_at = CURRENT_TIMESTAMP,
          version = version + 1
      WHERE task_id = $2 AND version = $3
      RETURNING version
    `;

    const result = await this.query(query, [errorMessage, taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 软删除任务
   */
  async softDelete(taskId: string): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE task_id = $1 AND deleted_at IS NULL
      RETURNING task_id
    `;

    const result = await this.query(query, [taskId]);
    return result.rowCount === 1;
  }

  /**
   * 映射数据库行到 Task 实体
   */
  private mapToTask(row: any): Task {
    return {
      taskId: row.task_id,
      userId: row.user_id || undefined,
      mode: row.mode as ExecutionMode,
      topic: row.topic,
      requirements: row.requirements,
      hardConstraints: row.hard_constraints || {},
      status: row.status as TaskStatus,
      currentStep: row.current_step || '',
      workerId: row.worker_id || undefined,
      textRetryCount: row.text_retry_count,
      imageRetryCount: row.image_retry_count,
      version: row.version,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      errorMessage: row.error_message || undefined,
      stateSnapshot: row.state_snapshot || undefined,
      idempotencyKey: row.idempotency_key || undefined,
    };
  }
}
```

---

## 🧪 测试策略

### 4.1 测试框架配置

```typescript
// tests/setup.ts

import { Pool } from 'pg';
import { config } from '../src/config';

let testPool: Pool;

export async function setupTestDatabase() {
  testPool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name + '_test', // 测试数据库
    user: config.database.user,
    password: config.database.password,
  });

  // 清空测试表
  await testPool.query('TRUNCATE TABLE token_usage, results, quality_checks, task_steps, tasks CASCADE');

  return testPool;
}

export async function teardownTestDatabase() {
  await testPool?.end();
}

export { testPool };
```

### 4.2 Repository 单元测试

```typescript
// tests/unit/repositories/TaskRepository.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgresTaskRepository } from '../../../src/infrastructure/database/PostgresTaskRepository';
import { setupTestDatabase, teardownTestDatabase } from '../../setup';
import { TaskStatus, ExecutionMode } from '../../../src/domain/entities/Task';

describe('PostgresTaskRepository', () => {
  let repository: PostgresTaskRepository;
  let pool: any;

  beforeEach(async () => {
    pool = await setupTestDatabase();
    repository = new PostgresTaskRepository(pool);
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  describe('create', () => {
    it('应该成功创建任务', async () => {
      const input = {
        mode: ExecutionMode.SYNC,
        topic: 'AI 技术发展',
        requirements: '写一篇关于 AI 技术发展的文章',
        hardConstraints: {
          minWords: 500,
          maxWords: 1000,
          keywords: ['AI', '技术', '发展'],
        },
      };

      const task = await repository.create(input);

      expect(task).toBeDefined();
      expect(task.taskId).toBeDefined();
      expect(task.status).toBe(TaskStatus.PENDING);
      expect(task.version).toBe(1);
      expect(task.topic).toBe(input.topic);
    });

    it('应该支持幂等键', async () => {
      const input = {
        mode: ExecutionMode.SYNC,
        topic: '测试选题',
        requirements: '测试要求',
        idempotencyKey: 'test-key-123',
      };

      const task1 = await repository.create(input);
      const task2 = await repository.create(input);

      expect(task1.taskId).toBe(task2.taskId);
      expect(task1.taskId).toBe('test-key-123');
    });
  });

  describe('findById', () => {
    it('应该正确查询任务', async () => {
      const input = {
        mode: ExecutionMode.ASYNC,
        topic: '测试选题',
        requirements: '测试要求',
      };

      const created = await repository.create(input);
      const found = await repository.findById(created.taskId);

      expect(found).toBeDefined();
      expect(found?.taskId).toBe(created.taskId);
      expect(found?.status).toBe(created.status);
    });

    it('查询不存在的任务应该返回 null', async () => {
      const found = await repository.findById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('应该正确更新任务状态', async () => {
      const task = await repository.create({
        mode: ExecutionMode.SYNC,
        topic: '测试',
        requirements: '测试',
      });

      const updated = await repository.updateStatus(task.taskId, TaskStatus.RUNNING, task.version);

      expect(updated).toBe(true);

      const found = await repository.findById(task.taskId);
      expect(found?.status).toBe(TaskStatus.RUNNING);
      expect(found?.version).toBe(2);
    });

    it('乐观锁应该生效', async () => {
      const task = await repository.create({
        mode: ExecutionMode.SYNC,
        topic: '测试',
        requirements: '测试',
      });

      // 使用错误的版本号
      const updated = await repository.updateStatus(task.taskId, TaskStatus.RUNNING, 999);

      expect(updated).toBe(false);
    });
  });

  describe('claimTask', () => {
    it('Worker 应该能成功抢占任务', async () => {
      const task = await repository.create({
        mode: ExecutionMode.ASYNC,
        topic: '测试',
        requirements: '测试',
      });

      const claimed = await repository.claimTask(task.taskId, 'worker-1', task.version);

      expect(claimed).toBe(true);

      const found = await repository.findById(task.taskId);
      expect(found?.workerId).toBe('worker-1');
      expect(found?.status).toBe(TaskStatus.RUNNING);
    });

    it('多个 Worker 抢占同一任务应该只有一个成功', async () => {
      const task = await repository.create({
        mode: ExecutionMode.ASYNC,
        topic: '测试',
        requirements: '测试',
      });

      // 模拟并发抢占
      const [claim1, claim2, claim3] = await Promise.all([
        repository.claimTask(task.taskId, 'worker-1', task.version),
        repository.claimTask(task.taskId, 'worker-2', task.version),
        repository.claimTask(task.taskId, 'worker-3', task.version),
      ]);

      // 应该只有一个成功
      const successCount = [claim1, claim2, claim3].filter(c => c).length;
      expect(successCount).toBe(1);

      const found = await repository.findById(task.taskId);
      expect(found?.workerId).toBeDefined();
      expect(found?.status).toBe(TaskStatus.RUNNING);
    });
  });
});
```

### 4.3 并发测试

```typescript
// tests/integration/concurrency.test.ts

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PostgresTaskRepository } from '../../../src/infrastructure/database/PostgresTaskRepository';
import { setupTestDatabase, teardownTestDatabase } from '../../setup';
import { ExecutionMode } from '../../../src/domain/entities/Task';

describe('并发测试: 乐观锁验证', () => {
  let repository: PostgresTaskRepository;
  let pool: any;

  beforeEach(async () => {
    pool = await setupTestDatabase();
    repository = new PostgresTaskRepository(pool);
  });

  afterEach(async () => {
    await teardownTestDatabase();
  });

  it('多个 Worker 同时更新同一任务应该只有一个成功', async () => {
    const task = await repository.create({
      mode: ExecutionMode.ASYNC,
      topic: '测试',
      requirements: '测试',
    });

    // 模拟 10 个并发更新
    const updatePromises = Array.from({ length: 10 }, (_, i) =>
      repository.updateStatus(task.taskId, 'running' as any, task.version)
    );

    const results = await Promise.all(updatePromises);
    const successCount = results.filter(r => r).length;

    // 只有一个应该成功
    expect(successCount).toBe(1);

    // 验证最终状态
    const finalTask = await repository.findById(task.taskId);
    expect(finalTask?.version).toBe(2); // 只增加了一次
  });

  it('并发抢占任务测试', async () => {
    const task = await repository.create({
      mode: ExecutionMode.ASYNC,
      topic: '测试',
      requirements: '测试',
    });

    // 5 个 Worker 同时抢占
    const workers = Array.from({ length: 5 }, (_, i) => `worker-${i + 1}`);
    const claimPromises = workers.map(workerId =>
      repository.claimTask(task.taskId, workerId, task.version)
    );

    const results = await Promise.all(claimPromises);
    const successCount = results.filter(r => r).length;

    // 只有一个抢占成功
    expect(successCount).toBe(1);

    // 验证任务被哪个 Worker 抢占
    const finalTask = await repository.findById(task.taskId);
    expect(workers).toContain(finalTask?.workerId);
    expect(finalTask?.status).toBe('running');
  });
});
```

---

## 📊 任务清单

### 按优先级排序

#### P0 - 阻塞性任务

- [ ] **任务 1.1**: 完善领域模型实体类 (1 天)
  - [ ] 1.1.1: 完善 `Task.ts` 实体类
  - [ ] 1.1.2: 完善 `TaskStep.ts` 实体类
  - [ ] 1.1.3: 完善 `QualityCheck.ts` 实体类
  - [ ] 1.1.4: 完善 `Result.ts` 实体类
  - [ ] 1.1.5: 完善 `TokenUsage.ts` 实体类
  - [ ] 1.1.6: 添加 Zod 验证 Schema

- [ ] **任务 1.2**: 创建数据库迁移脚本 (1 天)
  - [ ] 1.2.1: 创建 `migrations/001_create_initial_tables.sql`
  - [ ] 1.2.2: 创建 `tasks` 表和索引
  - [ ] 1.2.3: 创建 `task_steps` 表和索引
  - [ ] 1.2.4: 创建 `quality_checks` 表和索引
  - [ ] 1.2.5: 创建 `results` 表和索引
  - [ ] 1.2.6: 创建 `token_usage` 表和索引
  - [ ] 1.2.7: 创建 `users` 表和索引
  - [ ] 1.2.8: 添加更新时间触发器函数
  - [ ] 1.2.9: 测试迁移脚本可重复执行

- [ ] **任务 1.3**: 实现 Repository 基类 (0.5 天)
  - [ ] 1.3.1: 创建 `BaseRepository.ts`
  - [ ] 1.3.2: 实现连接池管理
  - [ ] 1.3.3: 实现 `query()` 方法
  - [ ] 1.3.4: 实现 `transaction()` 方法

- [ ] **任务 1.4**: 实现 TaskRepository (1.5 天)
  - [ ] 1.4.1: 定义 `TaskRepository` 接口
  - [ ] 1.4.2: 实现 `create()` 方法
  - [ ] 1.4.3: 实现 `findById()` 方法
  - [ ] 1.4.4: 实现 `findByUserId()` 方法
  - [ ] 1.4.5: 实现 `updateStatus()` 方法（乐观锁）
  - [ ] 1.4.6: 实现 `claimTask()` 方法（抢占机制）
  - [ ] 1.4.7: 实现其他更新方法
  - [ ] 1.4.8: 添加数据映射方法

#### P1 - 高优先级任务

- [ ] **任务 1.5**: 编写单元测试 (1.5 天)
  - [ ] 1.5.1: 配置 Vitest 测试环境
  - [ ] 1.5.2: 创建测试数据库设置
  - [ ] 1.5.3: 编写 `create()` 测试
  - [ ] 1.5.4: 编写 `findById()` 测试
  - [ ] 1.5.5: 编写 `updateStatus()` 测试
  - [ ] 1.5.6: 编写 `claimTask()` 测试
  - [ ] 1.5.7: 编写乐观锁验证测试

- [ ] **任务 1.6**: 并发测试 (0.5 天)
  - [ ] 1.6.1: 编写并发更新测试
  - [ ] 1.6.2: 编写并发抢占测试
  - [ ] 1.6.3: 验证乐观锁正确性

#### P2 - 中优先级任务

- [ ] **任务 1.7**: 性能优化 (0.5 天)
  - [ ] 1.7.1: 优化数据库索引
  - [ ] 1.7.2: 配置连接池参数
  - [ ] 1.7.3: 添加查询性能监控
  - [ ] 1.7.4: 编写性能基准测试

- [ ] **任务 1.8**: 文档完善 (0.5 天)
  - [ ] 1.8.1: 编写 API 文档
  - [ ] 1.8.2: 添加使用示例
  - [ ] 1.8.3: 更新 README

---

## 🚀 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置数据库连接

编辑 `.env` 文件:

```env
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=content_creator
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
```

### 3. 运行数据库迁移

```bash
# 创建数据库
createdb content_creator

# 运行迁移脚本
psql -U postgres -d content_creator -f migrations/001_create_initial_tables.sql
```

### 4. 运行测试

```bash
# 运行所有测试
pnpm test

# 运行单元测试
pnpm test:unit

# 运行并发测试
pnpm test:concurrency

# 查看测试覆盖率
pnpm test:coverage
```

---

## ⚠️ 注意事项

### 开发注意事项

1. **乐观锁使用**: 所有更新操作必须传入 `version` 参数
2. **幂等键**: 使用幂等键防止重复提交任务
3. **软删除**: 删除操作使用软删除，不物理删除数据
4. **JSON 字段**: 约束条件、快照等使用 JSONB 存储

### 测试注意事项

1. **测试隔离**: 每个测试前清空测试表
2. **并发测试**: 使用真实的并发操作验证乐观锁
3. **覆盖率**: 确保测试覆盖率 > 80%
4. **边界条件**: 测试空值、并发冲突等边界情况

### 性能注意事项

1. **连接池**: 合理配置连接池大小（默认 20）
2. **索引**: 为常用查询字段添加索引
3. **事务**: 复杂操作使用事务保证一致性
4. **监控**: 添加查询性能监控

---

## 📚 相关资源

- [完整架构文档](./architecture-complete.md)
- [实施战略规划](./implementation-analysis-plan.md)
- [Backend 开发规范](../.claude/skills/backend-dev-guidelines/SKILL.md)

---

**文档版本**: 1.0
**创建日期**: 2025-01-18
**最后更新**: 2025-01-18
