# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

**llm-content-creator** 是一个基于 LangGraph 的 AI 驱动多工作流内容创作系统，支持：
- 智能内容生成（基于 DeepSeek API）
- 多工作流架构（内容创作、翻译等）
- 同步/异步执行模式
- HTTP RESTful API 接口
- CLI 命令行工具
- 双层质量检查（硬规则 + LLM）
- BullMQ 队列任务处理
- PostgreSQL/SQLite/内存数据库支持

## 开发命令

### 环境初始化
```bash
# 安装依赖
pnpm install

# 验证环境配置
pnpm run verify-env

# 数据库迁移
pnpm run db:migrate
```

### 开发与构建
```bash
# 开发模式（热重载）
pnpm run dev

# 构建
pnpm run build

# 启动生产服务
pnpm run start
```

### 测试
```bash
# 所有测试
pnpm run test

# 单元测试
pnpm run test:unit

# 集成测试
pnpm run test:integration

# 性能测试
pnpm run test:performance

# 单个测试文件
pnpm test path/to/test.test.ts

# 测试监听模式
pnpm run test:watch
```

### CLI 工具

```bash
# 查看帮助
pnpm run cli --help

# 创建任务（通用命令）
pnpm run cli create --type <工作流类型> [工作流参数]
pnpm run cli create --type content-creator --topic "AI 技术" --requirements "写一篇文章" --mode sync

# 异步模式创建任务（需要 Worker 运行）
pnpm run cli create --type content-creator --topic "主题" --mode async

# 列出历史任务
pnpm run cli list
pnpm run cli list --status completed  # 按状态过滤
pnpm run cli list --limit 10          # 限制数量

# 查看任务状态
pnpm run cli status --task-id <taskId>

# 查看任务结果
pnpm run cli result --task-id <taskId>

# 重试任务
pnpm run cli retry --task-id <taskId>

# 取消任务
pnpm run cli cancel --task-id <taskId>

# 工作流管理
pnpm run cli workflow list                    # 列出所有工作流
pnpm run cli workflow info content-creator    # 查看工作流详情
pnpm run cli workflow info translation        # 查看翻译工作流详情
```

#### 可用的工作流类型

使用 `pnpm run cli workflow list` 查看所有已注册的工作流，当前支持：

- **content-creator** - 内容创作工作流（默认）
  - 参数：`--topic`, `--requirements`, `--targetAudience`, `--tone`, `--imageSize`, `--hardConstraints`

- **content-creator-agent** - AI Agent 内容创作工作流（基于 LangGraph ReAct Agent）
  - 参数：`--topic`, `--requirements`, `--targetAudience`, `--tone`, `--imageSize`
  - 特点：使用 LLM 驱动的 Agent 智能决策工具调用顺序

- **translation** - 翻译工作流
  - 参数：`--sourceText`, `--sourceLanguage`, `--targetLanguage`

### Worker 和监控
```bash
# 启动 Worker
pnpm run worker

# Worker 开发模式（热重载）
pnpm run worker:dev

# 启动监控面板
pnpm run monitor

# 启动调度器
pnpm run scheduler
```

### HTTP API 服务器
```bash
# 启动 API 服务器
pnpm run api

# API 开发模式（热重载）
pnpm run api:dev

# 通过 CLI 启动
pnpm run cli api

# 指定端口启动
API_PORT=8080 pnpm run api
```

**API 端点**（默认 `http://localhost:3001`）：
- `GET /health` - 健康检查
- `GET /api` - API 信息
- `GET /api/tasks` - 列出任务（支持分页、过滤、排序）
- `POST /api/tasks` - 创建任务（同步/异步）
- `GET /api/tasks/:id` - 获取任务详情
- `GET /api/tasks/:id/status` - 获取任务状态
- `GET /api/tasks/:id/result` - 获取任务结果
- `POST /api/tasks/:id/retry` - 重试任务
- `DELETE /api/tasks/:id` - 取消任务
- `GET /api/workflows` - 列出所有工作流
- `GET /api/workflows/:type` - 获取工作流详情
- `GET /api/stats` - 获取统计信息

详细 API 文档：`docs/design/http-api-design.md`

### LLM 测试
```bash
# 快速测试
pnpm run test:llm:quick

# API LLM 测试
pnpm run test:llm:api

# CLI LLM 测试
pnpm run test:llm:cli

# 集成测试
pnpm run test:llm:integration
```

## 核心架构

### 分层架构

项目采用 DDD（领域驱动设计）分层架构：

```
src/
├── domain/              # 领域层（核心业务逻辑）
│   ├── entities/        # 实体（Task, Result, QualityCheck, TokenUsage）
│   ├── repositories/    # 仓储接口
│   └── workflow/        # 工作流系统
│       ├── nodes/       # 工作流节点（BaseNode, SearchNode, WriteNode 等）
│       ├── State.ts     # 工作流状态定义
│       ├── WorkflowRegistry.ts  # 工作流注册表
│       └── examples/    # 工作流实现示例
├── application/         # 应用层（用例编排）
│   └── workflow/
│       └── SyncExecutor.ts  # 同步执行器
├── infrastructure/      # 基础设施层
│   ├── database/        # 数据库实现（PostgreSQL, SQLite, Memory）
│   ├── redis/          # Redis 连接
│   ├── queue/          # 任务队列（BullMQ）
│   ├── cache/          # 缓存服务
│   ├── monitoring/     # 监控（Sentry, Prometheus）
│   └── logging/        # 日志（Winston）
├── services/           # 服务层（外部集成）
│   ├── llm/           # LLM 服务（API + CLI 两种实现）
│   ├── quality/       # 质量检查服务
│   └── image/         # 图片生成服务
├── controllers/        # API 控制器层
│   ├── TaskController.ts      # 任务管理控制器
│   ├── WorkflowController.ts  # 工作流管理控制器
│   └── HealthController.ts    # 健康检查控制器
├── routes/             # API 路由定义
│   ├── tasks.ts        # 任务路由
│   ├── workflows.ts    # 工作流路由
│   ├── health.ts       # 健康检查路由
│   └── index.ts        # 路由聚合
├── middleware/         # Express 中间件
│   ├── errorHandler.ts     # 错误处理中间件
│   └── requestLogger.ts    # 请求日志中间件
├── validators/         # Zod 验证 Schema
│   └── taskValidators.ts
├── dto/                # 数据传输对象
│   └── taskDtos.ts
└── presentation/       # 表现层（CLI/API）
    ├── cli/           # CLI 命令
    ├── api/           # API 服务器
    │   ├── app.ts      # Express 应用设置
    │   └── server.ts   # HTTP 服务器
    ├── worker-cli.ts  # Worker CLI
    └── monitor-cli.ts # 监控 CLI
```

### 工作流系统架构

项目核心是可扩展的多工作流系统，基于 LangGraph 实现：

#### 1. WorkflowRegistry（工作流注册表）
- 位置：`src/domain/workflow/WorkflowRegistry.ts`
- 功能：管理所有工作流类型，提供统一的注册、创建、验证接口
- 核心方法：
  - `register()` - 注册新工作流
  - `createGraph()` - 创建工作流图实例
  - `createState()` - 创建工作流状态

#### 2. WorkflowFactory 接口
所有工作流必须实现此接口：
```typescript
interface WorkflowFactory {
  readonly type: string;           // 工作流类型标识符
  createGraph(): WorkflowGraph;    // 创建 LangGraph 图
  createState(params): State;      // 创建初始状态
  validateParams(params): boolean; // 验证参数
  getMetadata?(): WorkflowMetadata; // 元数据
}
```

#### 3. 工作流节点（BaseNode）
- 位置：`src/domain/workflow/nodes/BaseNode.ts`
- 所有节点继承 `BaseNode`，实现 `executeLogic()` 方法
- 内置功能：错误处理、超时控制、Token 记录、JSON 提取

#### 4. 内容创作者工作流
- 工作流类型：`content-creator`
- 流程：search → organize → write → check_text → generate_image → check_image → post_process
- 支持质检失败重试（文本 3 次，图片 2 次）

### LLM 服务架构

支持两种 LLM 服务实现，通过 `ILLMService` 接口统一：

```typescript
interface ILLMService {
  chat(request: ChatRequest): Promise<ChatResponse>;
  healthCheck(): Promise<boolean>;
  estimateTokens(text: string): number;
  estimateCost(tokensIn, tokensOut): number;
}
```

#### 实现方式
1. **API 方式**（`EnhancedLLMService`）- DeepSeek API
2. **CLI 方式**（`ClaudeCLIService`）- Claude CLI

切换方式：通过环境变量 `LLM_SERVICE_TYPE=api|cli`

### 数据库架构

支持三种数据库，通过环境变量 `DATABASE_TYPE` 切换：

| 类型 | 环境变量 | 使用场景 |
|------|----------|----------|
| PostgreSQL | `DATABASE_TYPE=postgres` | 生产环境 |
| SQLite | `DATABASE_TYPE=sqlite` | 开发环境（默认） |
| Memory | `DATABASE_TYPE=memory` | 测试环境 |

#### 仓储模式
- 接口定义：`src/domain/repositories/`
- 实现：`src/infrastructure/database/`
- 工厂：`createTaskRepository()`, `createResultRepository()`, `createQualityCheckRepository()`

### 异步任务系统

基于 BullMQ + Redis：

- **TaskQueue**：任务队列管理（`src/infrastructure/queue/TaskQueue.ts`）
- **TaskWorker**：任务处理器（`src/workers/TaskWorker.ts`）
- **TaskScheduler**：任务调度器（`src/schedulers/TaskScheduler.ts`）

Worker 通过 `WorkflowRegistry` 动态创建工作流实例，支持并发处理和任务抢占（乐观锁）。

### 质量检查系统

双层质量保证：

1. **硬规则检查**（`HardRuleChecker`）：字数、格式、禁止词等
2. **LLM 评估**（`LLMEvaluator`）：内容质量评分

## 扩展新工作流

### 步骤

1. **定义状态**：继承 `BaseWorkflowState`
2. **实现节点**：继承 `BaseNode`，实现 `executeLogic()`
3. **创建图**：使用 LangGraph `StateGraph`
4. **实现工厂**：实现 `WorkflowFactory` 接口
5. **注册工作流**：调用 `WorkflowRegistry.register()`

### 示例

参考 `src/domain/workflow/examples/TranslationWorkflow.ts`

## 重要设计模式

### 1. 乐观锁版本控制
所有实体使用 `version` 字段进行乐观锁控制，防止并发修改冲突。

### 2. 检查点机制
`CheckpointManager` 在每个节点执行后保存状态，支持断点续传。

### 3. 工厂模式
- LLM 服务：`LLMServiceFactory`
- 数据库仓储：`createTaskRepository()`
- 工作流：`WorkflowRegistry`

### 4. 适配器模式
`ContentCreatorWorkflowAdapter` 将现有工作流适配为 `WorkflowFactory` 接口。

## 配置系统

配置通过 `src/config/index.ts` 统一管理，使用 Zod 验证：

```typescript
import { config } from './config/index.js';

// LLM 配置
config.llm.apiKey
config.llm.baseURL
config.llm.modelName

// 数据库配置
config.database.type  // 'postgres' | 'sqlite' | 'memory'
config.postgres.host

// Redis 配置
config.redis.enabled
config.redis.url

// API 服务器配置
config.api.port       // 默认 3001
config.api.host       // 默认 '0.0.0.0'
```

**环境变量**：
- `API_PORT` - API 服务器端口（默认：3001）
- `API_HOST` - 监听地址（默认：0.0.0.0）

## 错误处理

- 所有错误通过 Sentry 捕获（如果配置了 `SENTRY_DSN`）
- 节点错误自动记录并支持重试
- Worker 错误会触发 BullMQ 重试机制

## 日志系统

使用 Winston 结构化日志：

```typescript
import { createLogger } from './infrastructure/logging/logger.js';

const logger = createLogger('ModuleName');
logger.info('Message', { metadata });
```

## 测试策略

- **单元测试**：测试独立组件（节点、服务、仓储）
- **集成测试**：测试完整工作流
- **性能测试**：测试并发和吞吐量

测试使用 Vitest，配置文件 `vitest.config.ts`。

## 常见问题

### API 服务器相关

#### API 服务器无法启动
```bash
# 检查端口是否被占用
lsof -i :3001

# 使用其他端口启动
API_PORT=8080 pnpm run api
```

#### API 请求返回 404
- 检查请求路径是否正确（注意 `/api` 前缀）
- 查看可用端点：`curl http://localhost:3001/api`

#### API 请求超时
- 同步任务可能需要较长时间处理
- 检查 LLM 服务连接
- 考虑使用异步模式：`"mode": "async"`

### 数据库迁移失败
```bash
# 检查迁移状态
pnpm run db:status

# 回滚后重试
pnpm run db:rollback
pnpm run db:migrate
```

### Worker 无法启动
1. 检查 Redis 是否运行
2. 验证 `REDIS_URL` 环境变量
3. 查看日志：`tail -f logs/app.log`

### LLM 调用超时
- 检查网络连接
- 调整 `LLM_TIMEOUT_MS` 和 `LLM_STREAM_TIMEOUT_MS`
- 切换到 CLI 模式：`LLM_SERVICE_TYPE=cli`

### API 使用示例

#### 创建任务（cURL）
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "sync",
    "topic": "人工智能的发展趋势",
    "requirements": "写一篇关于 AI 的文章",
    "targetAudience": "技术从业者"
  }'
```

#### 查询任务列表
```bash
curl "http://localhost:3001/api/tasks?page=1&limit=10&status=completed"
```

#### 获取任务状态
```bash
curl http://localhost:3001/api/tasks/{taskId}/status
```

更多 API 示例请参考：`docs/design/http-api-design.md`
