# 写作 Agent 架构设计（完整版）

基于 LangGraph 的智能写作 Agent，支持选题搜索、内容生成、质量检查和配图生成，采用 PostgreSQL 数据持久化，支持同步和异步两种执行模式，支持 100 人并发，多 Worker 高可用部署。

---

## 目录

- [一、系统概述与设计目标](#一系统概述与设计目标)
- [二、架构分层设计](#二架构分层设计)
- [三、核心领域模型](#三核心领域模型)
- [四、交互流程设计](#四交互流程设计)
  - [4.1 同步执行流程](#41-同步执行流程)
  - [4.2 异步执行流程](#42-异步执行流程多-worker)
  - [4.3 质量检查循环流程](#43-质量检查循环流程)
  - [4.4 执行优化策略](#44-执行优化策略)
- [五、状态转移设计](#五状态转移设计)
- [六、数据与存储设计](#六数据与存储设计)
  - [6.1 ER 图](#61-er-图)
  - [6.2 表结构](#62-表结构postgresql)
  - [6.3 视图](#63-视图)
  - [6.4 存储策略概述](#64-存储策略概述)
  - [6.5 文案存储设计](#65-文案存储设计)
  - [6.6 图片存储设计](#66-图片存储设计)
  - [6.7 存储访问与检索](#67-存储访问与检索)
  - [6.8 存储优化策略](#68-存储优化策略)
  - [6.9 推荐配置](#69-推荐配置)
- [七、状态管理策略](#七状态管理策略)
- [八、错误处理与重试策略](#八错误处理与重试策略)
- [九、可观测性与监控](#九可观测性与监控)
- [十、质量检查架构](#十质量检查架构)
- [十一、安全设计](#十一安全设计)
- [十二、扩展性设计](#十二扩展性设计)
- [十三、部署与运维](#十三部署与运维)

---

## 一、系统概述与设计目标

### 1.1 系统概述

写作 Agent 是一个基于 LangGraph 的智能内容生成系统，能够自动完成从选题搜索、内容创作、质量检查到配图生成的完整流程。

### 1.2 设计目标

**功能目标**：
- 支持内容类型：技术文章、博客文章、营销文案（可扩展）
- 核心能力：选题搜索、内容生成、质量检查、配图生成
- 执行模式：同步（立即返回结果）、异步（后台处理）

**性能目标**：
- 单任务端到端延迟：< 5 分钟
- 支持并发用户数：100 人同时在线
- 支持并发任务数：20 个任务同时执行（峰值）
- 日任务处理能力：500-3000 个任务/天

**可用性目标**：
- 系统可用性：99.9%（每月停机时间 < 43 分钟）
- Worker 故障自动恢复
- 数据库主从复制，故障自动切换

### 1.3 设计边界

**包含的功能**：
- ✅ 同步/异步任务执行
- ✅ 质量检查（硬规则 + LLM 评审）
- ✅ Token 监测与成本统计
- ✅ 任务查询与状态追踪
- ✅ 日志与监控

**不包含的功能**：
- ❌ 用户管理（无多租户、无权限控制）
- ❌ 内容审核（合规性检查需外部接入）
- ❌ 实时协作
- ❌ 用户配额管理（无限额，但需监控）

### 1.4 部署模式与技术栈

#### 部署模式：分布式多 Worker

```
架构选择：分布式模式
├── 数据库：PostgreSQL 14+ (必需，不支持 SQLite)
├── 队列：Bull + Redis 7+
├── 缓存：Redis 7+
├── Worker：Node.js (5 个 Worker × 2 并发 = 10 并发任务)
└── 负载均衡：Nginx / Kubernetes Service
```

#### 为什么不用 SQLite？

| 特性 | SQLite | PostgreSQL |
|------|--------|------------|
| 并发写入 | ❌ 写锁，瓶颈严重 | ✅ MVCC，支持高并发 |
| 连接数限制 | ❌ 单连接 | ✅ 支持 100+ 连接 |
| 分布式部署 | ❌ 不支持 | ✅ 支持 |
| 数据完整性 | ⚠️ 可能丢失 | ✅ ACID 保证 |
| 生产可用性 | ❌ 不推荐 | ✅ 生产级 |

#### 容量规划

```
配置：5 Worker × 2 并发 = 10 并发任务
吞吐量：120 任务/小时 = 2880 任务/天
支持用户：100 人同时在线
峰值负载：20 个并发任务（20% 用户同时提交）
余量系数：5.76 倍
```

---

## 二、架构分层设计

### 2.1 整体架构

```mermaid
graph TB
    subgraph "表现层 (Presentation)"
        CLI[CLI Interface<br/>用户交互界面]
    end

    subgraph "应用层 (Application)"
        SyncExec[Sync Executor<br/>同步执行器]
        AsyncExec[Async Executor<br/>异步执行器]
        QuerySvc[Query Service<br/>查询服务]
    end

    subgraph "领域层 (Domain)"
        Workflow[LangGraph Workflow Engine<br/>工作流编排]
        Search[Search Node]
        Organize[Organize Node]
        Write[Write Node]
        CheckText[Check Text Node]
        GenImage[Generate Image Node]
        CheckImage[Check Image Node]

        Search --> Organize --> Write --> CheckText
        CheckText -->|passed| GenImage --> CheckImage
        CheckText -->|failed| Write
        CheckImage -->|failed| GenImage
    end

    subgraph "服务层 (Services)"
        LLMSvc[LLM Service<br/>DeepSeek API]
        SearchSvc[Search Service<br/>MCP Search]
        ImageSvc[Image Service<br/>Doubao API]
        QualitySvc[Quality Service<br/>质量检查]
        TokenMonitor[Token Monitor<br/>Token 监控]
    end

    subgraph "数据层 (Data)"
        Repo[(Repository<br/>PostgreSQL)]
        Queue[(Queue<br/>Bull)]
        Cache[(Cache<br/>Redis)]
    end

    CLI --> SyncExec
    CLI --> AsyncExec
    CLI --> QuerySvc

    SyncExec --> Workflow
    AsyncExec --> Queue
    QuerySvc --> Repo

    Workflow --> SearchSvc
    Workflow --> ImageSvc
    Workflow --> LLMSvc
    Workflow --> QualitySvc

    SearchSvc --> Cache
    LLMSvc --> Repo
    LLMSvc --> TokenMonitor
    ImageSvc --> Repo
    QualitySvc --> Repo

    Queue --> Cache
    Repo --> Repo
```

### 2.2 各层职责

#### 表现层 (Presentation Layer)
- **职责**: 用户交互和接口暴露
- **组件**:
  - **CLI Interface**: 命令行界面
  - **REST API**: HTTP 接口（可选，用于 Web 应用集成）
  - **WebSocket Server**: 实时推送（可选）
- **功能**:
  - 接收用户输入（选题、要求、硬性指标）
  - 选择执行模式（同步/异步）
  - 显示任务执行进度
  - 展示查询结果
  - API 认证和授权（可选）
  - 速率限制（可选）

#### REST API 设计（可选扩展）

```javascript
// API 路由设计
POST   /api/v1/tasks              // 创建任务
GET    /api/v1/tasks/:taskId      // 查询任务状态
GET    /api/v1/tasks/:taskId/result // 查询任务结果
GET    /api/v1/tasks              // 列出任务列表
DELETE /api/v1/tasks/:taskId      // 删除任务（软删除）

POST   /api/v1/tasks/:taskId/retry // 重试任务
GET    /api/v1/tasks/:taskId/steps // 查询执行步骤

GET    /api/v1/users/:userId/quota // 查询用户配额
GET    /api/v1/token-stats         // Token 统计

// WebSocket 订阅
WS     /api/v1/tasks/:taskId/stream // 实时推送任务进度
```

**API 中间件**:
```javascript
// 认证中间件（可选）
async function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const user = await validateApiKey(apiKey);
  req.user = user;
  next();
}

// 速率限制
const rateLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 100              // 最多 100 次请求
});

// 请求验证
const validateTask = body({
  topic: isString().maxLength(500),
  requirements: isString().maxLength(5000),
  mode: isIn(['sync', 'async'])
});
```

#### 应用层 (Application Layer)
- **职责**: 编排业务流程，协调领域服务
- **组件**:
  - **Sync Executor**: 同步执行器，阻塞式执行任务
  - **Async Executor**: 异步执行器，将任务提交到队列
  - **Query Service**: 查询服务，提供任务状态和结果查询
- **功能**:
  - 任务生命周期管理
  - 执行模式路由
  - 数据库事务协调

#### 领域层 (Domain Layer)
- **职责**: 核心业务逻辑和工作流编排
- **组件**: LangGraph Workflow Engine
  - State: 状态管理
  - Nodes: 业务节点（搜索、整理、写作、质检、生成）
  - Graph: 流程编排和条件路由
- **功能**:
  - 写作流程编排
  - 质量检查循环
  - 状态转换控制

#### 服务层 (Services Layer)
- **职责**: 外部服务集成和工具封装
- **组件**:
  - **LLM Service**: DeepSeek API 封装
  - **Search Service**: MCP Search 封装
  - **Image Service**: Doubao API 封装
  - **Quality Service**: 质量检查服务（两层架构）
  - **Token Monitor**: Token 监控服务
- **功能**:
  - API 调用封装
  - 错误处理和重试
  - 响应数据转换
  - Token 使用记录

#### 数据层 (Data Layer)
- **职责**: 数据持久化和异步任务管理
- **组件**:
  - **Repository (PostgreSQL)**: 数据持久化
  - **Queue (Bull)**: 异步任务队列
  - **Cache (Redis)**: 缓存和队列后端存储
- **功能**:
  - 任务数据 CRUD
  - 执行步骤记录
  - 质检结果存储
  - Token 使用记录
  - 异步任务调度

---

## 三、核心领域模型

### 3.1 用户 (User)

```javascript
User {
  // 基础信息
  userId: string              // UUID
  email: string               // 邮箱（可选）
  name: string                // 用户名（可选）

  // 配额管理
  quotaDaily: number          // 每日配额（默认 10）
  quotaUsedToday: number      // 今日已使用

  // 状态
  status: 'active' | 'suspended' | 'deleted'

  // 时间戳
  createdAt: DateTime
  updatedAt: DateTime
  deletedAt: DateTime?        // 软删除

  // 元数据
  metadata: {
    source?: string           // 注册来源
    tags?: string[]           // 用户标签
  }
}
```

### 3.2 任务 (Task)

```javascript
Task {
  // 基础信息
  taskId: string              // UUID
  userId: string              // 用户 ID (外键)
  mode: 'sync' | 'async'      // 执行模式
  topic: string               // 选题方向
  requirements: string        // 写作要求
  hardConstraints: {          // 硬性指标
    minWords?: number
    maxWords?: number
    keywords?: string[]
  }

  // 状态字段
  status: TaskStatus          // 任务状态
  currentStep: string         // 当前步骤
  workerId: string            // Worker ID（多 Worker 抢占）

  // 重试计数（持久化）
  textRetryCount: number      // 文本质检重试次数
  imageRetryCount: number     // 配图质检重试次数

  // 乐观锁（并发控制）
  version: number             // 版本号

  // 时间戳
  createdAt: DateTime
  startedAt?: DateTime
  completedAt?: DateTime
  updatedAt: DateTime         // 自动更新
  deletedAt: DateTime?        // 软删除

  // 错误信息
  errorMessage?: string

  // State 快照（崩溃恢复）
  stateSnapshot?: object      // LangGraph State 序列化

  // 幂等性
  idempotencyKey?: string     // 幂等键（防止重复提交）
}

enum TaskStatus {
  PENDING     = 'pending',      // 等待执行
  RUNNING     = 'running',      // 执行中
  COMPLETED   = 'completed',    // 完成
  FAILED      = 'failed'        // 失败
}
```

### 3.3 执行步骤 (TaskStep)

```javascript
TaskStep {
  id: number
  taskId: string
  stepName: StepName           // 步骤名称
  status: StepStatus           // 步骤状态
  attempt: number              // 尝试次数（用于重试）

  // 输入输出
  inputData?: object           // 输入数据 (JSON)
  outputData?: object          // 输出数据 (JSON)

  // 性能
  startedAt?: DateTime
  completedAt?: DateTime
  durationMs?: number          // 执行耗时（毫秒）

  // 错误
  errorMessage?: string
}

enum StepName {
  SEARCH          = 'search',
  ORGANIZE        = 'organize',
  WRITE           = 'write',
  CHECK_TEXT      = 'check_text',
  GENERATE_IMAGE  = 'generate_image',
  CHECK_IMAGE     = 'check_image'
}

enum StepStatus {
  PENDING   = 'pending',
  RUNNING   = 'running',
  COMPLETED = 'completed',
  FAILED    = 'failed',
  SKIPPED   = 'skipped'
}
```

### 3.4 质检结果 (QualityCheck)

```javascript
QualityCheck {
  id: number
  taskId: string
  checkType: 'text' | 'image'

  // 评分
  score: number                 // 1-10 分
  passed: boolean               // 是否通过
  hardConstraintsPassed: boolean

  // 详情
  details: {
    // 硬规则检查结果
    hardRules?: {
      wordCount: { passed: boolean, wordCount: number }
      keywords: { passed: boolean, found: string[] }
      structure: { passed: boolean, checks: object }
    }

    // 软评分（LLM）
    softScores?: {
      relevance: { score: number, reason: string }
      coherence: { score: number, reason: string }
      completeness: { score: number, reason: string }
      readability: { score: number, reason: string }
    }

    // 文本质检
    wordCount?: number
    keywordsFound?: string[]
    structureCheck?: {
      hasTitle: boolean
      hasIntro: boolean
      hasBody: boolean
      hasConclusion: boolean
    }

    // 配图质检
    relevanceScore?: number
    aestheticScore?: number
    promptMatch?: number
  }

  // 改进建议（用于重写/重生成）
  fixSuggestions?: string[]

  // 元数据
  rubricVersion?: string        // 评分标准版本
  modelName?: string            // 使用的模型
  promptHash?: string           // Prompt hash

  checkedAt: DateTime
}
```

### 3.5 生成结果 (Result)

```javascript
Result {
  id: number
  taskId: string
  resultType: 'article' | 'image'
  content?: string              // 文章内容 (Markdown)
  filePath?: string             // 文件路径

  metadata: {
    // 文章元数据
    wordCount?: number
    title?: string
    keywords?: string[]

    // 配图元数据
    prompt?: string
    url?: string
    width?: number
    height?: number

    // 来源引用
    sources?: Array<{
      url: string
      title: string
      snippet: string
    }>
  }

  createdAt: DateTime
}
```

### 3.6 Token 使用记录 (TokenUsage)

```javascript
TokenUsage {
  id: number
  taskId: string
  traceId: string               // 链路追踪 ID
  stepName: string              // 步骤名称
  apiName: string               // API 名称 (deepseek, doubao)
  modelName: string             // 模型名称

  // Token 统计
  tokensIn: number              // 输入 token
  tokensOut: number             // 输出 token
  totalTokens: number           // 总 token

  // 成本计算
  costPer1kTokensIn: number     // 每 1k 输入 token 成本
  costPer1kTokensOut: number    // 每 1k 输出 token 成本
  totalCost: number             // 总成本

  // 元数据
  metadata: {
    temperature?: number
    maxTokens?: number
    duration?: number           // API 调用耗时
  }

  createdAt: DateTime
}
```

---

## 四、交互流程设计

### 4.0 执行模式定义

#### 4.0.1 同步模式 (Sync Mode)

**定义**: 同步模式是指**用户请求等待任务完成后才返回响应**,但底层工作流执行本身仍然是异步的(LangGraph 是异步编排框架)。

**特点**:
- ✅ 请求-响应模型: 用户提交任务后阻塞等待,直到任务完成或失败
- ✅ 实时反馈: 可以通过 WebSocket/SSE 推送执行进度
- ✅ 简单直观: 适合交互式使用场景(CLI、Web 表单)
- ⚠️ 超时风险: HTTP 请求可能超时(建议 60 秒超时,超过则切换为异步)
- ⚠️ 资源占用: 长连接占用服务器资源

**适用场景**:
- CLI 工具执行(用户等待结果)
- 低延迟场景(任务执行时间 < 60 秒)
- 开发调试环境

**技术实现**:
```javascript
// 同步模式执行
async function executeSync(taskData) {
  // 1. 创建任务记录
  const task = await createTask(taskData);

  // 2. 在当前进程执行工作流(异步等待)
  try {
    const result = await workflowEngine.execute(task.task_id);
    return result;  // 直接返回结果
  } catch (error) {
    throw error;
  }
}
```

#### 4.0.2 异步模式 (Async Mode)

**定义**: 异步模式是指**用户请求立即返回任务 ID,任务在后台 Worker 中执行**,用户通过轮询或 WebSocket 获取结果。

**特点**:
- ✅ 立即响应: 请求立即返回 taskId,不阻塞用户
- ✅ 长任务支持: 适合执行时间长的任务(数分钟到数十分钟)
- ✅ 高吞吐量: 可以提交大量任务,由队列控制执行速率
- ✅ 可恢复: Worker 崩溃后任务可被其他 Worker 接管
- ⚠️ 复杂度增加: 需要轮询或 WebSocket 获取结果

**适用场景**:
- 生产环境批量任务
- 长时间任务(> 60 秒)
- API 服务集成
- 高并发场景

**技术实现**:
```javascript
// 异步模式执行
async function executeAsync(taskData) {
  // 1. 创建任务记录
  const task = await createTask({ ...taskData, mode: 'async' });

  // 2. 提交到队列
  await queue.add('task', { taskId: task.task_id });

  // 3. 立即返回 taskId
  return { taskId: task.task_id, status: 'pending' };
}

// Worker 后台处理
Worker.process('task', async (job) => {
  const { taskId } = job.data;
  await workflowEngine.execute(taskId);
});
```

#### 4.0.3 模式对比

| 维度 | 同步模式 | 异步模式 |
|------|---------|----------|
| **响应时间** | 等待任务完成(秒-分钟级) | 立即返回(< 100ms) |
| **执行位置** | API 服务器进程 | 后台 Worker 进程 |
| **并发能力** | 受限于 API 服务器连接数 | 受限于 Worker 数量和队列 |
| **超时处理** | HTTP 超时(建议 60s) | 无超时限制 |
| **进度反馈** | WebSocket/SSE 推送 | 轮询或 WebSocket 订阅 |
| **故障恢复** | API 服务器崩溃任务失败 | Worker 崩溃任务被接管 |
| **适用场景** | 低延迟、交互式 | 高并发、长任务 |

#### 4.0.4 模式自动切换策略

```javascript
// 根据预估执行时间自动选择模式
async function smartExecute(taskData) {
  const estimatedTime = await estimateExecutionTime(taskData);

  if (estimatedTime < 60000) {  // < 60秒
    return await executeSync(taskData);
  } else {
    return await executeAsync(taskData);
  }
}

// 或者根据用户指定
async function executeTask(taskData, mode = 'async') {
  if (mode === 'sync') {
    return await executeSync(taskData);
  } else {
    return await executeAsync(taskData);
  }
}
```

---

### 4.1 同步执行流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant CLI as CLI Interface
    participant Executor as Sync Executor
    participant DB as Database
    participant Workflow as LangGraph Workflow

    User->>CLI: 1. 提交任务（选题+要求+硬性指标）
    CLI->>CLI: 验证参数
    CLI->>Executor: 2. 创建任务记录
    Executor->>DB: 保存任务（status: pending）
    Executor->>DB: 更新状态为 running（抢占）
    Executor->>Workflow: 3. 执行工作流

    Note over Workflow: Search → Organize → Write
    Workflow->>DB: 保存步骤记录
    Note over Workflow: Check Text（质量检查）
    alt 质检通过
        Note over Workflow: 生成配图 → 质检
    else 质检失败
        Note over Workflow: 重试写作（max 3次）
    end

    Workflow->>DB: 保存所有步骤和结果
    Workflow-->>Executor: 4. 返回结果
    Executor->>DB: 更新任务状态为 completed/failed
    Executor->>DB: 保存最终结果
    Executor-->>CLI: 返回任务结果
    CLI-->>User: 5. 显示结果
```

### 4.2 异步执行流程（多 Worker）

```mermaid
sequenceDiagram
    participant User as 用户
    participant CLI as CLI Interface
    participant Executor as Async Executor
    participant DB as Database
    participant Queue as Bull Queue
    participant Worker as Worker Process
    participant Workflow as LangGraph Workflow

    User->>CLI: 1. 提交任务
    CLI->>CLI: 验证参数
    CLI->>Executor: 2. 创建任务并请求 taskId
    Executor->>DB: 保存任务（status: pending）
    Executor->>Queue: 提交任务到队列
    Executor-->>CLI: 3. 立即返回 taskId
    CLI-->>User: taskId

    Note over Queue,Worker: 后台执行（Worker 抢占）
    Queue->>Worker: 4. Worker 取出任务
    Worker->>DB: 抢占任务（原子更新）
    Note over Worker,DB: UPDATE tasks<br/>SET status='running',<br/>worker_id='worker-1'<br/>WHERE status='pending'

    alt 抢占成功
        Worker->>Workflow: 执行工作流
        Note over Workflow: 完整流程执行
        Workflow->>DB: 保存步骤记录
        Workflow->>DB: 保存质检结果
        Workflow->>DB: 记录 Token 使用
        Workflow-->>Worker: 返回结果
        Worker->>DB: 更新状态为 completed/failed
        Worker->>DB: 保存最终结果
    else 抢占失败
        Note over Worker: 任务已被其他 Worker 抢占<br/>跳过处理
    end

    Note over User,DB: 用户查询
    User->>CLI: 5. 查询任务状态
    CLI->>DB: 读取任务状态和结果
    DB-->>CLI: 返回状态和结果
    CLI-->>User: 6. 显示状态/结果
```

### 4.3 质量检查循环流程

```mermaid
flowchart TD
    Start([Write Node<br/>写作完成]) --> HardCheck{硬规则检查}

    HardCheck -->|✅ 通过| SoftCheck{软评分检查<br/>LLM 评审}
    HardCheck -->|❌ 失败| FailHard[失败: 违反硬性约束]

    SoftCheck -->|score >= 7| Continue1[通过<br/>继续下一步]
    SoftCheck -->|score < 7| Retry1{重试次数 < 3?}

    Retry1 -->|Yes| WriteRetry[重新写作<br/>基于反馈]
    Retry1 -->|No| FailSoft[失败: 质量不达标]

    WriteRetry --> SoftCheck

    Continue1 --> GenImage[Generate Image<br/>生成配图]
    GenImage --> CheckImage{配图质检}

    CheckImage -->|score >= 7| Complete[完成<br/>任务完成]
    CheckImage -->|score < 7| Retry2{重试次数 < 2?}

    Retry2 -->|Yes| ImageRetry[重新生成]
    Retry2 -->|No| FailImage[失败: 配图不达标]

    ImageRetry --> CheckImage

    style Start fill:#e1f5ff
    style Complete fill:#d4edda
    style FailHard fill:#f8d7da
    style FailSoft fill:#f8d7da
    style FailImage fill:#f8d7da
    style HardCheck fill:#e3f2fd
    style SoftCheck fill:#fff3e0
```

### 4.4 执行优化策略

针对执行流程长、失败重试成本高、缺少实时反馈等问题，我们设计了以下优化策略：

#### 4.4.1 Checkpoint 持久化（断点续传）

**问题**：流程中断后需要从头开始，浪费时间

**解决方案**：每个节点执行完成后保存状态到数据库

```javascript
// Checkpoint 管理
class CheckpointManager {
  async saveCheckpoint(taskId, stepName, state) {
    await db.query(`
      UPDATE tasks
      SET
        current_step = $1,
        state_snapshot = $2,
        checkpointed_at = CURRENT_TIMESTAMP
      WHERE task_id = $3
    `, [stepName, JSON.stringify(state), taskId]);
  }

  async loadCheckpoint(taskId) {
    const result = await db.query(`
      SELECT current_step, state_snapshot
      FROM tasks
      WHERE task_id = $1
    `, [taskId]);

    if (result.rows.length > 0 && result.rows[0].state_snapshot) {
      return {
        step: result.rows[0].current_step,
        state: JSON.parse(result.rows[0].state_snapshot)
      };
    }
    return null;
  }
}

// 使用示例
async function executeWorkflowWithCheckpoint(taskId) {
  // 1. 尝试加载断点
  const checkpoint = await checkpointManager.loadCheckpoint(taskId);

  if (checkpoint) {
    logger.info(`Resuming from checkpoint: ${checkpoint.step}`);
    state = checkpoint.state;
    startFrom = checkpoint.step;
  } else {
    state = getInitialState(taskId);
    startFrom = 'search';
  }

  // 2. 从断点继续执行
  switch (startFrom) {
    case 'search':
      state = await executeSearch(state);
      await checkpointManager.saveCheckpoint(taskId, 'search', state);
    case 'organize':
      state = await executeOrganize(state);
      await checkpointManager.saveCheckpoint(taskId, 'organize', state);
    // ... 其他步骤
  }
}
```

**收益**：
- ✅ Worker 崩溃后可以恢复
- ✅ 用户可以中断任务，稍后继续
- ✅ 节省已完成步骤的执行时间

---

#### 4.4.2 指定节点重试

**问题**：任何步骤失败都要重试整个流程

**解决方案**：支持从任意节点恢复和重试

```bash
# CLI 命令
cli retry <task_id> --step write     # 只重试 write 节点
cli retry <task_id> --from organize # 从 organize 节点开始重试
cli retry <task_id>                 # 从失败节点重试
```

```javascript
// 实现逻辑
async function retryFromStep(taskId, stepName) {
  // 1. 加载之前的 Checkpoint
  const checkpoint = await checkpointManager.loadCheckpoint(taskId);

  if (!checkpoint) {
    throw new Error('No checkpoint found');
  }

  // 2. 找到指定步骤的父状态
  const state = findStateBeforeStep(checkpoint, stepName);

  // 3. 从指定步骤开始执行
  await executeWorkflowFrom(taskId, state, stepName);
}
```

**收益**：
- ✅ 质检失败时，只需重新写作，不需要重新搜索
- ✅ 图片生成失败时，不需要重新写作
- ✅ 大幅降低重试成本和时间

---

#### 4.4.3 增量结果返回（实时反馈）

**问题**：用户必须等全部完成才能看到结果

**解决方案**：每个步骤完成后立即返回结果

```bash
# CLI 命令
cli create --topic "AI" --stream   # 流式返回结果
```

```javascript
// 实现逻辑
async function executeWithStreaming(taskId, callback) {
  const state = getInitialState(taskId);

  // Search 完成
  state = await executeSearch(state);
  callback({ step: 'search', status: 'completed', result: state.searchResults });

  // Write 完成
  state = await executeWrite(state);
  callback({
    step: 'write',
    status: 'completed',
    result: {
      preview: state.articleContent.substring(0, 200) + '...'
    }
  });

  // Check Text 完成
  const checkResult = await executeCheckText(state);
  callback({ step: 'check_text', status: checkResult.passed ? 'passed' : 'failed' });
}

// 用户看到的效果：
// ✓ Step 1/6: Search completed (found 5 articles)
// ✓ Step 2/6: Organize completed
// ✓ Step 3/6: Write completed (preview: 人工智能技术发展...)
// ⚠ Step 4/6: Check Text failed (score: 5.5, retrying...)
// ✓ Step 4/6: Check Text passed (score: 7.5)
```

**收益**：
- ✅ 用户可以实时看到进度
- ✅ 提前发现问题和错误
- ✅ 更好的用户体验

---

#### 4.4.4 独立节点执行

**问题**：无法单独执行某个步骤

**解决方案**：支持单独执行任意节点

```bash
# CLI 命令
cli execute <task_id> --step write              # 只执行 write 节点
cli execute <task_id> --step generate_image     # 只执行图片生成
```

```javascript
// 实现逻辑
async function executeSingleStep(taskId, stepName, inputOverride) {
  // 1. 加载任务状态
  const task = await getTask(taskId);

  // 2. 准备输入
  let state = {
    taskId: task.task_id,
    topic: task.topic,
    requirements: task.requirements,
    ...inputOverride  // 允许覆盖某些输入
  };

  // 3. 执行单个节点
  const node = this.nodes[stepName];
  const result = await node.execute(state);

  // 4. 保存结果
  await saveStepResult(taskId, stepName, result);

  return result;
}
```

**收益**：
- ✅ 用户可以先写文章，再决定是否生成配图
- ✅ 可以用不同的参数重新生成某个步骤
- ✅ 便于调试和优化单个节点

---

#### 4.4.5 并行执行（性能优化）

**问题**：串行执行导致总耗时长

**解决方案**：将可以并行的子步骤同时执行

```javascript
// 并行搜索多个来源
async function executeSearchWithParallel(state) {
  const [source1, source2, source3] = await Promise.all([
    searchAPI.search(state.topic, { source: 'google' }),
    searchAPI.search(state.topic, { source: 'bing' }),
    searchAPI.search(state.topic, { source: 'baidu' })
  ]);

  return {
    ...state,
    searchResults: [...source1, ...source2, ...source3]
  };
}

// 并行生成多张图片
async function executeImageGenerationWithParallel(state) {
  const images = await Promise.all(
    state.imagePrompts.map(prompt =>
      imageGenAPI.generate(prompt)
    )
  );

  return { ...state, images };
}
```

**收益**：
- ✅ 缩短总执行时间 20-30%
- ✅ 更好地利用系统资源
- ✅ 支持生成多个图片时更高效

---

#### 4.4.6 优化收益总结

| 优化项 | 收益 | 实施难度 | 优先级 |
|-------|------|---------|--------|
| Checkpoint 持久化 | 支持断点续传，降低重试成本 | 中 | P0 |
| 指定节点重试 | 精细化重试，节省时间 | 中 | P0 |
| 增量结果返回 | 实时反馈，提升体验 | 低 | P1 |
| 独立节点执行 | 灵活性提升，便于调试 | 中 | P1 |
| 并行执行 | 缩短总耗时 20-30% | 高 | P2 |

---

#### 4.4.7 任务优先级调度机制

**问题**: 当前所有任务按 FIFO 顺序执行,无法区分用户优先级,导致:
- VIP 用户任务需长时间等待
- 紧急任务无法优先处理
- 用户体验差

**解决方案**: 实现多优先级队列调度

##### 优先级定义

```yaml
# config/priority.yaml
priority:
  enabled: true

  # 优先级定义
  levels:
    - name: critical    # 紧急任务
      value: 1
      weight: 10        # 调度权重
      max_wait_time: 5s # 最大等待时间
      description: "紧急任务,立即执行"

    - name: high        # 高优先级
      value: 2
      weight: 5
      max_wait_time: 30s
      description: "VIP 用户任务"

    - name: normal      # 普通优先级(默认)
      value: 3
      weight: 1
      max_wait_time: 300s
      description: "普通用户任务"

    - name: low         # 低优先级
      value: 4
      weight: 0.5
      max_wait_time: 600s
      description: "批量任务"

  # 用户优先级映射
  user_priority_mapping:
    default: normal
    rules:
      - condition: "user.tier === 'vip'"
        priority: "high"
      - condition: "user.tier === 'enterprise'"
        priority: "critical"
      - condition: "task.flags.includes('batch')"
        priority: "low"
```

##### Bull Queue 优先级实现

```javascript
// services/priority-queue.js
const { Queue, Worker } = require('bull');

class PriorityQueueManager {
  constructor(redisConfig) {
    // 创建多个优先级队列
    this.queues = {
      critical: new Queue('tasks-critical', { redis: redisConfig }),
      high: new Queue('tasks-high', { redis: redisConfig }),
      normal: new Queue('tasks-normal', { redis: redisConfig }),
      low: new Queue('tasks-low', { redis: redisConfig })
    };

    // Worker 按优先级顺序处理
    this.workers = [];
  }

  // 添加任务到队列
  async addTask(taskId, priority = 'normal', options = {}) {
    const queue = this.queues[priority];

    if (!queue) {
      throw new Error(`Invalid priority: ${priority}`);
    }

    const job = await queue.add(
      'process-task',
      { taskId },
      {
        priority: this.getPriorityValue(priority),
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        ...options
      }
    );

    logger.info(`Task added to ${priority} queue`, { taskId, jobId: job.id });

    return job;
  }

  // 确定任务优先级
  async determineTaskPriority(task, user) {
    // 1. 检查用户级别
    if (user.tier === 'enterprise') return 'critical';
    if (user.tier === 'vip') return 'high';

    // 2. 检查任务标记
    if (task.flags?.includes('urgent')) return 'critical';
    if (task.flags?.includes('batch')) return 'low';

    // 3. 检查用户自定义优先级
    if (task.priority) return task.priority;

    // 4. 默认优先级
    return 'normal';
  }

  // 启动 Workers(按优先级顺序处理)
  startWorkers(processor) {
    // Worker 处理顺序: critical > high > normal > low
    const priorityOrder = ['critical', 'high', 'normal', 'low'];

    priorityOrder.forEach((priority, index) => {
      const worker = new Worker(
        this.queues[priority],
        async (job) => {
          logger.info(`Processing ${priority} task`, { taskId: job.data.taskId });
          return await processor(job);
        },
        {
          concurrency: 2,  // 每个 Worker 2 个并发
          limiter: {
            max: index === 0 ? 10 : 5,  // critical 队列限制更宽松
            duration: 1000
          }
        }
      );

      this.workers.push(worker);

      worker.on('completed', (job) => {
        logger.info(`${priority} task completed`, { taskId: job.data.taskId });
      });

      worker.on('failed', (job, err) => {
        logger.error(`${priority} task failed`, {
          taskId: job.data.taskId,
          error: err.message
        });
      });
    });

    logger.info('Priority workers started', { count: this.workers.length });
  }

  getPriorityValue(priority) {
    const values = { critical: 1, high: 2, normal: 3, low: 4 };
    return values[priority] || 3;
  }

  // 获取队列状态
  async getQueueStats() {
    const stats = {};

    for (const [name, queue] of Object.entries(this.queues)) {
      const [waiting, active, completed, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount()
      ]);

      stats[name] = { waiting, active, completed, failed };
    }

    return stats;
  }

  // 关闭所有队列和 Workers
  async close() {
    await Promise.all([
      ...Object.values(this.queues).map(q => q.close()),
      ...this.workers.map(w => w.close())
    ]);
  }
}
```

##### 集成到异步执行器

```javascript
// executor/async-executor.js
class AsyncExecutorWithPriority {
  constructor(queueManager, db) {
    this.queueManager = queueManager;
    this.db = db;
  }

  async execute(taskData, user) {
    // 1. 创建任务记录
    const task = await this.db.query(`
      INSERT INTO tasks (task_id, user_id, mode, topic, requirements, status, priority)
      VALUES ($1, $2, $3, $4, $5, 'pending', $6)
      RETURNING *
    `, [
      generateTaskId(),
      user.user_id,
      'async',
      taskData.topic,
      taskData.requirements,
      taskData.priority || 'normal'
    ]);

    // 2. 确定任务优先级
    const priority = await this.queueManager.determineTaskPriority(task.rows[0], user);

    // 3. 添加到优先级队列
    await this.queueManager.addTask(task.rows[0].task_id, priority);

    // 4. 立即返回 taskId
    return {
      taskId: task.rows[0].task_id,
      status: 'pending',
      priority,
      estimatedWaitTime: this.estimateWaitTime(priority)
    };
  }

  estimateWaitTime(priority) {
    const estimates = {
      critical: '< 5秒',
      high: '< 30秒',
      normal: '< 5分钟',
      low: '< 10分钟'
    };
    return estimates[priority] || estimates.normal;
  }
}
```

##### 数据库表更新

```sql
-- 在 tasks 表添加优先级字段
ALTER TABLE tasks ADD COLUMN priority TEXT DEFAULT 'normal'
CHECK (priority IN ('critical', 'high', 'normal', 'low'));

-- 添加索引
CREATE INDEX idx_tasks_priority_status ON tasks(priority, status)
WHERE status IN ('pending', 'running');

-- 添加用户等级字段
ALTER TABLE users ADD COLUMN tier TEXT DEFAULT 'free'
CHECK (tier IN ('free', 'pro', 'vip', 'enterprise'));

-- 更新用户表索引
CREATE INDEX idx_users_tier ON users(tier);
```

##### CLI 命令

```bash
# 创建任务时指定优先级
cli create --topic "AI" --priority high

# 创建批量任务(自动低优先级)
cli create --batch --topics "AI,ML,DL"

# 查看队列状态
cli queue stats

# 手动调整任务优先级
cli queue reprioritize --task-id <task_id> --priority critical

# 查看某用户的任务
cli queue list --user-id <user_id>
```

##### 监控指标

```javascript
// 优先级队列监控
const priorityQueueWaiting = new promClient.Gauge({
  name: 'priority_queue_waiting_tasks',
  help: 'Number of waiting tasks by priority',
  labelNames: ['priority']
});

const priorityQueueWaitTime = new promClient.Histogram({
  name: 'priority_queue_wait_time_seconds',
  help: 'Task wait time in queue by priority',
  labelNames: ['priority'],
  buckets: [1, 5, 10, 30, 60, 300, 600]
});

const priorityQueueProcessingTime = new promClient.Histogram({
  name: 'priority_queue_processing_time_seconds',
  help: 'Task processing time by priority',
  labelNames: ['priority'],
  buckets: [10, 30, 60, 120, 300, 600, 1800]
});

// 定期更新指标
setInterval(async () => {
  const stats = await queueManager.getQueueStats();

  for (const [priority, counts] of Object.entries(stats)) {
    priorityQueueWaiting.labels({ priority }).set(counts.waiting);
  }
}, 10000);
```

##### 优先级调度收益

| 维度 | 无优先级 | 有优先级 |
|------|---------|----------|
| **VIP 用户体验** | ❌ 需排队等待 | ✅ 优先执行,秒级响应 |
| **紧急任务处理** | ❌ 无法优先 | ✅ 立即执行 |
| **资源利用** | 平均分配 | 按需分配 |
| **用户满意度** | ⚠️ 中等 | ✅ 高 |
| **实施难度** | - | 中等(2-3天) |

**使用场景**:
- VIP 用户任务自动高优先级
- 批量任务自动低优先级
- 管理员手动调整紧急任务优先级
- 根据用户等级分配不同优先级

---

#### 4.4.7 数据库优化

为了支持上述策略，需要对数据库表进行一些调整：

```sql
-- 在 tasks 表添加字段
ALTER TABLE tasks ADD COLUMN checkpointed_at TIMESTAMP;
ALTER TABLE tasks ADD COLUMN last_checkpoint_step TEXT;
ALTER TABLE tasks ADD COLUMN checkpoint_metadata JSONB;

-- 增加复合索引，优化查询
CREATE INDEX idx_task_steps_task_step_status
ON task_steps(task_id, step_name, status);
```

---

## 五、状态转移设计

### 5.1 任务生命周期状态机

```mermaid
stateDiagram-v2
    [*] --> PENDING: 创建任务

    PENDING --> RUNNING: Worker 抢占成功
    RUNNING --> COMPLETED: 执行成功
    RUNNING --> FAILED: 执行失败
    RUNNING --> RUNNING: 重试中

    COMPLETED --> [*]
    FAILED --> [*]

    note right of PENDING
        等待执行
        任务已创建
    end note

    note right of RUNNING
        执行中
        Worker 占有
    end note

    note right of COMPLETED
        完成
        执行成功
    end note

    note right of FAILED
        失败
        可重新提交
    end note
```

### 5.2 任务步骤状态机

```mermaid
stateDiagram-v2
    [*] --> PENDING: 步骤创建

    PENDING --> RUNNING: 开始执行
    RUNNING --> COMPLETED: 执行成功
    RUNNING --> FAILED: 执行失败

    FAILED --> PENDING: 重试（attempt+1）

    COMPLETED --> [*]
    FAILED --> [*]: 不重试

    note right of PENDING
        等待执行
        已创建记录
    end note

    note right of RUNNING
        执行中
        正在处理
    end note

    note right of COMPLETED
        完成
        保存结果
    end note

    note right of FAILED
        失败
        可重试
    end note
```

### 5.3 LangGraph State 状态转移

```mermaid
stateDiagram-v2
    [*] --> Initial: 初始化

    Initial --> Search: 开始执行
    Search --> Organize: 搜索完成
    Organize --> Write: 整理完成
    Write --> CheckText: 写作完成

    CheckText --> GenerateImage: passed (score >= 7)
    CheckText --> Write: failed (score < 7, 重试)

    GenerateImage --> CheckImage: 生成完成
    CheckImage --> Complete: passed (score >= 7)
    CheckImage --> GenerateImage: failed (score < 7, 重试)

    Complete --> [*]: 结束

    note right of Initial
        State: {
          taskId, mode, topic,
          requirements, hardConstraints
        }
    end note

    note right of Search
        State + { searchResults }
    end note

    note right of Organize
        State + { organizedInfo }
    end note

    note right of Write
        State + {
          articleContent,
          imagePrompts
        }
    end note

    note right of CheckText
        State + { textQualityReport }
    end note

    note right of GenerateImage
        State + { images }
    end note

    note right of CheckImage
        State + { imageQualityReport }
    end note
```

**State 定义**:
```javascript
State {
  // 输入参数
  taskId: string
  mode: 'sync' | 'async'
  topic: string
  requirements: string
  hardConstraints: object

  // 流程数据
  searchResults?: array
  organizedInfo?: object
  articleContent?: string
  imagePrompts?: array
  images?: array

  // 质检数据
  textQualityReport?: object
  imageQualityReport?: object

  // 控制数据（持久化到 DB）
  textRetryCount: number
  imageRetryCount: number
  currentStep: string
}
```

---

## 六、数据库设计

### 6.1 ER 图

```mermaid
erDiagram
    TASK ||--o{ TASK_STEP : contains
    TASK ||--o{ QUALITY_CHECK : has
    TASK ||--o{ RESULT : produces
    TASK ||--o{ TOKEN_USAGE : tracks
    TASK ||--o{ EXECUTION_LOG : logs

    TASK {
        string task_id PK
        string mode
        string topic
        string requirements
        jsonb hard_constraints
        string status
        string current_step
        string worker_id
        int text_retry_count
        int image_retry_count
        int version
        datetime created_at
        datetime started_at
        datetime completed_at
        datetime updated_at
        string error_message
        jsonb state_snapshot
    }

    TASK_STEP {
        int id PK
        string task_id FK
        string step_name
        string status
        int attempt
        jsonb input_data
        jsonb output_data
        datetime started_at
        datetime completed_at
        int duration_ms
        string error_message
        datetime created_at
    }

    QUALITY_CHECK {
        int id PK
        string task_id FK
        string check_type
        numeric score
        boolean passed
        boolean hard_constraints_passed
        jsonb details
        jsonb fix_suggestions
        string rubric_version
        string model_name
        string prompt_hash
        datetime checked_at
    }

    RESULT {
        int id PK
        string task_id FK
        string result_type
        text content
        string file_path
        jsonb metadata
        datetime created_at
    }

    TOKEN_USAGE {
        int id PK
        string task_id FK
        string trace_id
        string step_name
        string api_name
        string model_name
        int tokens_in
        int tokens_out
        int total_tokens
        numeric cost_per_1k_tokens_in
        numeric cost_per_1k_tokens_out
        numeric total_cost
        jsonb metadata
        datetime created_at
    }

    EXECUTION_LOG {
        int id PK
        string task_id FK
        string trace_id
        string level
        string event_name
        text message
        jsonb metadata
        datetime created_at
    }
```

### 6.2 数据库连接池配置

```javascript
// config/database.js
const { Pool } = require('pg');

/**
 * 连接池容量计算
 * 5 Workers × 2 并发 × 1.5(安全系数) = 15 连接
 * 加上查询服务和监控 = 20 连接
 * 设置 max: 25 留有余量
 */
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'content_creator',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,

  // 连接池配置
  max: 25,                          // 最大连接数
  min: 5,                           // 最小连接数
  idleTimeoutMillis: 30000,         // 空闲连接超时（30 秒）
  connectionTimeoutMillis: 2000,    // 连接超时（2 秒）

  // 性能优化
  statement_timeout: 30000,         // 查询超时（30 秒）
  query_timeout: 60000,             // 长查询超时（60 秒）
});

// 连接池监控
const poolUsage = new promClient.Gauge({
  name: 'db_pool_usage',
  help: 'Database connection pool usage',
  labelNames: ['state']  // active, idle, total
});

setInterval(() => {
  poolUsage.labels({ state: 'active' }).set(pool.totalCount - pool.idleCount);
  poolUsage.labels({ state: 'idle' }).set(pool.idleCount);
  poolUsage.labels({ state: 'total' }).set(pool.totalCount);
}, 10000);

// 连接池事件监听
pool.on('connect', (client) => {
  logger.debug('New client connected to DB');
});

pool.on('remove', (client) => {
  logger.debug('Client removed from pool');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

module.exports = pool;
```

**连接池最佳实践**:

1. **连接数计算公式**:
   ```
   max_connections = workers × concurrency × 1.5 + overhead
   max_connections = 5 × 2 × 1.5 + 5 = 20
   ```

2. **连接泄漏检测**:
   ```javascript
   // 监控长时间持有的连接
   setInterval(() => {
     const active = pool.totalCount - pool.idleCount;
     if (active > pool.max * 0.8) {
       logger.warn(`DB pool usage high: ${active}/${pool.max}`);
     }
   }, 30000);
   ```

3. **健康检查**:
   ```javascript
   async function checkDatabaseHealth() {
     const client = await pool.connect();
     try {
       await client.query('SELECT 1');
       return { status: 'healthy' };
     } catch (error) {
       return { status: 'unhealthy', error: error.message };
     } finally {
       client.release();
     }
   }
   ```

---

### 6.3 表结构（PostgreSQL）

#### tasks (任务表)

```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT UNIQUE NOT NULL,
  user_id TEXT,                      -- 用户 ID（外键，可选）
  mode TEXT NOT NULL CHECK (mode IN ('sync', 'async')),
  topic TEXT NOT NULL,
  requirements TEXT NOT NULL,
  hard_constraints JSONB,

  -- 状态字段
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_step TEXT,
  worker_id TEXT,

  -- 重试计数
  text_retry_count INTEGER DEFAULT 0,
  image_retry_count INTEGER DEFAULT 0,

  -- 乐观锁
  version INTEGER DEFAULT 0,

  -- 幂等性
  idempotency_key TEXT UNIQUE,       -- 幂等键（防止重复提交）

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,              -- 软删除

  -- 错误信息
  error_message TEXT,

  -- State 快照
  state_snapshot JSONB,

  -- 外键约束
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
);

-- 索引
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_worker_id ON tasks(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX idx_tasks_status_created ON tasks(status, created_at);
CREATE INDEX idx_tasks_user_id ON tasks(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_tasks_idempotency ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_tasks_deleted_at ON tasks(deleted_at) WHERE deleted_at IS NOT NULL;

-- 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### users (用户表)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  name TEXT,

  -- 配额管理
  quota_daily INTEGER DEFAULT 10,
  quota_used_today INTEGER DEFAULT 0,
  quota_reset_date DATE DEFAULT CURRENT_DATE,

  -- 状态
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  -- 元数据
  metadata JSONB
);

-- 索引
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- 触发器
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### task_status_history (状态转移历史表)

```sql
CREATE TABLE task_status_history (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by TEXT,              -- worker_id 或 'system'
  reason TEXT,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_status_history_task ON task_status_history(task_id, changed_at DESC);
CREATE INDEX idx_status_history_new_status ON task_status_history(new_status);
CREATE INDEX idx_status_history_changed_at ON task_status_history(changed_at DESC);
```

#### worker_heartbeats (Worker 心跳表)

```sql
CREATE TABLE worker_heartbeats (
  worker_id TEXT PRIMARY KEY,
  last_heartbeat TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dead')),
  metadata JSONB,                -- 可选: Worker 负载、内存使用等
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_worker_heartbeat_last ON worker_heartbeats(last_heartbeat);
CREATE INDEX idx_worker_heartbeat_status ON worker_heartbeats(status);
```

#### task_steps (执行步骤记录表)

```sql
CREATE TABLE task_steps (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_name TEXT NOT NULL CHECK (step_name IN (
    'search', 'organize', 'write',
    'check_text', 'generate_image', 'check_image'
  )),

  -- 状态
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),

  -- 重试
  attempt INTEGER DEFAULT 0,

  -- 输入输出
  input_data JSONB,
  output_data JSONB,

  -- 性能
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,

  -- 错误
  error_message TEXT,

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,

  -- 唯一约束
  UNIQUE(task_id, step_name, attempt)
);

-- 索引
CREATE INDEX idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX idx_task_steps_status ON task_steps(status);
CREATE INDEX idx_task_steps_step_name ON task_steps(step_name);
CREATE INDEX idx_task_steps_created_at ON task_steps(created_at);
```

#### quality_checks (质检结果表)

```sql
CREATE TABLE quality_checks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('text', 'image')),

  -- 评分
  score NUMERIC(3, 2) NOT NULL CHECK (score >= 0 AND score <= 10),
  passed BOOLEAN NOT NULL,
  hard_constraints_passed BOOLEAN,

  -- 详情
  details JSONB NOT NULL,

  -- 改进建议
  fix_suggestions JSONB,

  -- 元数据
  rubric_version TEXT,
  model_name TEXT,
  prompt_hash TEXT,

  -- 时间戳
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_quality_checks_task_id ON quality_checks(task_id);
CREATE INDEX idx_quality_checks_type ON quality_checks(check_type);
CREATE INDEX idx_quality_checks_score ON quality_checks(score);
CREATE INDEX idx_quality_checks_rubric ON quality_checks(rubric_version);
CREATE INDEX idx_quality_checks_model ON quality_checks(model_name);
```

#### results (生成结果表)

```sql
CREATE TABLE results (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  result_type TEXT NOT NULL CHECK (result_type IN ('article', 'image')),

  -- 内容
  content TEXT,
  file_path TEXT,

  -- 元数据
  metadata JSONB NOT NULL,

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_results_task_id ON results(task_id);
CREATE INDEX idx_results_type ON results(result_type);
```

#### token_usage (Token 使用记录表)

```sql
CREATE TABLE token_usage (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  api_name TEXT NOT NULL,
  model_name TEXT NOT NULL,

  -- Token 统计
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,

  -- 成本计算
  cost_per_1k_tokens_in NUMERIC(10, 6),
  cost_per_1k_tokens_out NUMERIC(10, 6),
  total_cost NUMERIC(10, 6) NOT NULL,

  -- 元数据
  metadata JSONB,

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_token_usage_task_id ON token_usage(task_id);
CREATE INDEX idx_token_usage_trace_id ON token_usage(trace_id);
CREATE INDEX idx_token_usage_step_name ON token_usage(step_name);
CREATE INDEX idx_token_usage_api_name ON token_usage(api_name);
CREATE INDEX idx_token_usage_created_at ON token_usage(created_at);
CREATE INDEX idx_token_usage_api_date ON token_usage(api_name, created_at);
```

#### token_usage_hourly (Token 统计汇总表)

```sql
CREATE TABLE token_usage_hourly (
  id SERIAL PRIMARY KEY,
  hour TIMESTAMP NOT NULL,
  api_name TEXT NOT NULL,
  model_name TEXT NOT NULL,

  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost NUMERIC(10, 6) NOT NULL DEFAULT 0,
  request_count INTEGER NOT NULL DEFAULT 0,

  UNIQUE(hour, api_name, model_name)
);

CREATE INDEX idx_token_hourly_date ON token_usage_hourly(hour);
```

#### execution_logs (日志表)

```sql
CREATE TABLE execution_logs (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  event_name TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_logs_task_id ON execution_logs(task_id);
CREATE INDEX idx_logs_trace_id ON execution_logs(trace_id);
CREATE INDEX idx_logs_level ON execution_logs(level);
CREATE INDEX idx_logs_created_at ON execution_logs(created_at);
```

#### search_references (搜索引用记录表)

```sql
CREATE TABLE search_references (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  snippet TEXT,
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

CREATE INDEX idx_search_refs_task_id ON search_references(task_id);
```

### 6.3 数据库分区策略

#### 6.3.1 分区概述

随着任务数据量的增长,需要对大表进行分区以保持查询性能:

**需要分区的表**:
- `tasks` - 按创建时间分区
- `task_steps` - 按创建时间分区
- `quality_checks` - 按检查时间分区
- `token_usage` - 按创建时间分区
- `execution_logs` - 按创建时间分区

#### 6.3.2 Tasks 表分区(按月)

```sql
-- 1. 删除原表(如果已存在)
DROP TABLE IF EXISTS tasks;

-- 2. 创建分区主表
CREATE TABLE tasks (
  id SERIAL,
  task_id TEXT NOT NULL,
  user_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('sync', 'async')),
  topic TEXT NOT NULL,
  requirements TEXT NOT NULL,
  hard_constraints JSONB,

  -- 状态字段
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  current_step TEXT,
  worker_id TEXT,

  -- 重试计数
  text_retry_count INTEGER DEFAULT 0,
  image_retry_count INTEGER DEFAULT 0,

  -- 乐观锁
  version INTEGER DEFAULT 0,

  -- 幂等性
  idempotency_key TEXT,

  -- 时间戳
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  -- 错误信息
  error_message TEXT,

  -- State 快照
  state_snapshot JSONB,

  -- 主键约束(分区表需要本地主键)
  PRIMARY KEY (id, created_at),
  UNIQUE (task_id, created_at)
) PARTITION BY RANGE (created_at);

-- 3. 创建月度分区(自动生成未来3个月)
-- 2025年1月
CREATE TABLE tasks_2025_01 PARTITION OF tasks
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- 2025年2月
CREATE TABLE tasks_2025_02 PARTITION OF tasks
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- 2025年3月
CREATE TABLE tasks_2025_03 PARTITION OF tasks
  FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');

-- 4. 创建索引(每个分区自动继承)
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_worker_id ON tasks(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX idx_tasks_user_id ON tasks(user_id) WHERE user_id IS NOT NULL;

-- 5. 自动创建未来分区的函数
CREATE OR REPLACE FUNCTION create_monthly_partitions()
RETURNS void AS $$
DECLARE
  start_date DATE;
  end_date DATE;
  partition_name TEXT;
  i INTEGER;
BEGIN
  -- 创建未来3个月的分区
  FOR i IN 0..2 LOOP
    start_date := date_trunc('month', CURRENT_DATE + (i || ' months')::INTERVAL);
    end_date := start_date + INTERVAL '1 month';
    partition_name := 'tasks_' || to_char(start_date, 'YYYY_MM');

    -- 检查分区是否已存在
    IF NOT EXISTS (
      SELECT 1 FROM pg_class
      WHERE relname = partition_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS %I PARTITION OF tasks
         FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
      );
      RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 6. 创建定时任务(每月1号自动创建下月分区)
-- 使用 pg_cron 扩展(需先安装)
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'create-monthly-partitions',
  '0 0 1 * *',  -- 每月1号00:00执行
  'SELECT create_monthly_partitions();'
);

-- 7. 手动触发创建分区(用于测试)
SELECT create_monthly_partitions();
```

#### 6.3.3 其他表的分区

**task_steps 分区**:
```sql
-- 删除原表
DROP TABLE IF EXISTS task_steps;

-- 创建分区主表
CREATE TABLE task_steps (
  id SERIAL,
  task_id TEXT NOT NULL,
  step_name TEXT NOT NULL CHECK (step_name IN (
    'search', 'organize', 'write',
    'check_text', 'generate_image', 'check_image'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  attempt INTEGER DEFAULT 0,
  input_data JSONB,
  output_data JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 创建月度分区
CREATE TABLE task_steps_2025_01 PARTITION OF task_steps
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE task_steps_2025_02 PARTITION OF task_steps
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- 创建索引
CREATE INDEX idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX idx_task_steps_status ON task_steps(status);
```

**token_usage 分区**:
```sql
DROP TABLE IF EXISTS token_usage;

CREATE TABLE token_usage (
  id SERIAL,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  api_name TEXT NOT NULL,
  model_name TEXT NOT NULL,
  tokens_in INTEGER NOT NULL DEFAULT 0,
  tokens_out INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_per_1k_tokens_in NUMERIC(10, 6),
  cost_per_1k_tokens_out NUMERIC(10, 6),
  total_cost NUMERIC(10, 6) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 创建月度分区
CREATE TABLE token_usage_2025_01 PARTITION OF token_usage
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE token_usage_2025_02 PARTITION OF token_usage
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- 创建索引
CREATE INDEX idx_token_usage_task_id ON token_usage(task_id);
CREATE INDEX idx_token_usage_api_name ON token_usage(api_name);
```

**execution_logs 分区**:
```sql
DROP TABLE IF EXISTS execution_logs;

CREATE TABLE execution_logs (
  id SERIAL,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error', 'fatal')),
  event_name TEXT NOT NULL,
  message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- 创建月度分区
CREATE TABLE execution_logs_2025_01 PARTITION OF execution_logs
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE execution_logs_2025_02 PARTITION OF execution_logs
  FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');

-- 创建索引
CREATE INDEX idx_logs_task_id ON execution_logs(task_id);
CREATE INDEX idx_logs_level ON execution_logs(level);
```

#### 6.3.4 分区维护

**自动删除旧分区**:
```sql
-- 删除6个月前的分区(保留数据到归档表)
CREATE OR REPLACE FUNCTION drop_old_partitions()
RETURNS void AS $$
DECLARE
  partition_name TEXT;
  cutoff_date DATE;
BEGIN
  cutoff_date := CURRENT_DATE - INTERVAL '6 months';

  -- 查找需要删除的分区
  FOR partition_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'tasks_%'
      AND substring(tablename from 12) < to_char(cutoff_date, 'YYYY_MM')
  LOOP
    -- 可选:先备份到归档表
    -- EXECUTE format('CREATE TABLE IF NOT EXISTS archive_%I AS TABLE %I', partition_name, partition_name);

    -- 删除分区
    EXECUTE format('DROP TABLE IF EXISTS %I', partition_name);
    RAISE NOTICE 'Dropped partition: %', partition_name;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 每月1号自动删除旧分区
SELECT cron.schedule(
  'drop-old-partitions',
  '0 1 1 * *',  -- 每月1号01:00执行
  'SELECT drop_old_partitions();'
);
```

**分区查询优化**:
```sql
-- 查询时自动分区裁剪(只扫描相关分区)
EXPLAIN ANALYZE
SELECT * FROM tasks
WHERE created_at >= '2025-01-01'
  AND created_at < '2025-02-01'
  AND status = 'completed';

-- PostgreSQL 会自动只扫描 tasks_2025_01 分区
```

#### 6.3.5 分区监控

```sql
-- 查看所有分区的大小
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  (SELECT COUNT(*) FROM tasks WHERE created_at >= (
    CASE
      WHEN tablename LIKE '%_2025_01' THEN '2025-01-01'::date
      WHEN tablename LIKE '%_2025_02' THEN '2025-02-01'::date
      ELSE '2025-01-01'::date
    END
  ) AND created_at < (
    CASE
      WHEN tablename LIKE '%_2025_01' THEN '2025-02-01'::date
      WHEN tablename LIKE '%_2025_02' THEN '2025-03-01'::date
      ELSE '2025-02-01'::date
    END
  )) AS row_count
FROM pg_tables
WHERE tablename LIKE 'tasks_%'
ORDER BY tablename;
```

#### 6.3.6 分区策略总结

| 表名 | 分区键 | 分区粒度 | 保留期限 | 说明 |
|------|--------|----------|----------|------|
| `tasks` | `created_at` | 月 | 6个月 | 核心业务表 |
| `task_steps` | `created_at` | 月 | 6个月 | 执行步骤记录 |
| `token_usage` | `created_at` | 月 | 12个月 | 成本统计,保留更久 |
| `execution_logs` | `created_at` | 月 | 3个月 | 日志表,短期保留 |
| `quality_checks` | `checked_at` | 月 | 6个月 | 质检结果 |

**收益**:
- ✅ 查询性能提升 50-80%(分区裁剪)
- ✅ 删除旧数据更快(直接 DROP 分区)
- ✅ 维护操作可并行化
- ✅ 索引大小可控

---

### 6.4 视图

#### task_overview (任务概览视图)

```sql
CREATE OR REPLACE VIEW task_overview AS
SELECT
  t.task_id,
  t.topic,
  t.status,
  t.mode,
  t.worker_id,
  t.created_at,
  t.started_at,
  t.completed_at,
  t.text_retry_count,
  t.image_retry_count,
  COUNT(DISTINCT s.id) as total_steps,
  COUNT(DISTINCT s.id) FILTER (WHERE s.status = 'completed') as completed_steps,
  SUM(s.duration_ms) as total_duration_ms,
  COALESCE(SUM(tk.total_tokens), 0) as total_tokens,
  COALESCE(SUM(tk.total_cost), 0) as total_cost
FROM tasks t
LEFT JOIN task_steps s ON t.task_id = s.task_id
LEFT JOIN token_usage tk ON t.task_id = tk.task_id
GROUP BY
  t.task_id, t.topic, t.status, t.mode, t.worker_id,
  t.created_at, t.started_at, t.completed_at,
  t.text_retry_count, t.image_retry_count;
```

### 6.4 存储策略概述

#### 存储层次

```
存储层次
├── 文案（文本内容）
│   ├── 数据库存储（PostgreSQL）✅ 主要
│   └── 文件系统存储（可选，用于备份）
│
└── 图片（二进制内容）
    ├── 对象存储（推荐：S3/OSS/MinIO）✅ 生产环境
    ├── 文件系统存储（本地/挂载卷）⚠️ 开发环境
    └── 数据库引用（URL/路径）
```

#### 存储原则

| 数据类型 | 主要存储 | 备份存储 | 访问方式 |
|---------|---------|---------|---------|
| **文案内容** | PostgreSQL TEXT | 文件系统（.md 文件） | 数据库查询 / 文件读取 |
| **图片文件** | 对象存储（S3/OSS） | 本地文件系统 | 公开 URL / API 下载 |
| **元数据** | PostgreSQL JSONB | - | 数据库查询 |

---

### 6.5 文案存储设计

#### 6.5.1 数据库存储（主要方案）

文案内容直接存储在 `results` 表的 `content` 字段（TEXT 类型）：

```javascript
// 保存文章到数据库
async function saveArticleResult(taskId, article, metadata) {
  const result = await db.query(`
    INSERT INTO results (task_id, result_type, content, metadata)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [
    taskId,
    'article',
    article.content,              // Markdown 格式的完整文章
    JSON.stringify({
      wordCount: article.wordCount,
      title: article.title,
      keywords: article.keywords,
      sources: article.sources,    // 参考来源
      model: metadata.model,
      generatedAt: metadata.generatedAt
    })
  ]);

  return result.rows[0].id;
}

// 示例数据
{
  content: `# 人工智能技术发展

## 引言
人工智能（AI）技术正在快速发展...`,
  // 完整的 Markdown 文章内容

  metadata: {
    wordCount: 1250,
    title: "人工智能技术发展",
    keywords: ["人工智能", "机器学习", "深度学习"],
    sources: [
      {
        url: "https://example.com/article1",
        title: "AI 技术概述",
        snippet: "..."
      }
    ],
    model: "deepseek-chat",
    generatedAt: "2025-01-18T10:30:00Z"
  }
}
```

#### 6.5.2 文件系统导出（可选）

**导出配置**：

```javascript
// config/storage.js
module.exports = {
  articles: {
    outputDir: process.env.ARTICLE_OUTPUT_DIR || './data/articles',
    formats: ['md', 'pdf', 'docx'],  // 支持的导出格式
    autoExport: true,                 // 自动导出
  }
};
```

**文件路径规则**：

```
data/articles/
├── 2025/
│   ├── 01/
│   │   ├── 18/
│   │   │   ├── task-abc123.md       # Markdown 原文
│   │   │   ├── task-abc123.pdf      # PDF 导出
│   │   │   └── task-abc123.docx     # Word 导出
```

**导出实现**：

```javascript
// services/article-exporter.js
const fs = require('fs').promises;
const path = require('path');

class ArticleExporter {
  constructor(config) {
    this.outputDir = config.articles.outputDir;
  }

  async export(taskId, content, metadata) {
    // 生成文件路径：data/articles/2025/01/18/task-abc123.md
    const date = new Date();
    const datePath = path.join(
      this.outputDir,
      date.getFullYear().toString(),
      (date.getMonth() + 1).toString().padStart(2, '0'),
      date.getDate().toString().padStart(2, '0')
    );

    // 创建目录
    await fs.mkdir(datePath, { recursive: true });

    // 文件名
    const fileName = `task-${taskId}.md`;
    const filePath = path.join(datePath, fileName);

    // 写入文件
    await fs.writeFile(filePath, content, 'utf8');

    // 更新数据库记录
    await db.query(`
      UPDATE results
      SET file_path = $1
      WHERE task_id = $2 AND result_type = 'article'
    `, [filePath, taskId]);

    logger.info(`Article exported: ${filePath}`);

    return filePath;
  }
}
```

---

### 6.6 图片存储设计

#### 6.6.1 存储架构

```
图片存储流程
┌─────────────┐
│ Generate    │
│ Image Node  │
└──────┬──────┘
       │
       ↓
┌──────────────────────────────────┐
│ 1. API 返回图片（URL 或二进制）   │
└──────┬───────────────────────────┘
       │
       ↓
┌──────────────────────────────────┐
│ 2. 上传到对象存储                 │
│    - S3 / OSS / MinIO            │
│    - 生成唯一文件名               │
│    - 获取公开 URL                 │
└──────┬───────────────────────────┘
       │
       ↓
┌──────────────────────────────────┐
│ 3. 保存元数据到数据库             │
│    - URL / 路径                   │
│    - 宽高、格式、大小等            │
└──────────────────────────────────┘
```

#### 6.6.2 对象存储配置

```javascript
// config/storage.js
module.exports = {
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local',  // s3 | oss | minio | local

    // AWS S3（生产环境推荐）
    s3: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || 'content-creator-images',
      acl: 'public-read',
    },

    // 阿里云 OSS
    oss: {
      accessKeyId: process.env.OSS_ACCESS_KEY_ID,
      secretAccessKey: process.env.OSS_SECRET_ACCESS_KEY,
      region: process.env.OSS_REGION || 'oss-cn-hangzhou',
      bucket: process.env.OSS_BUCKET || 'content-creator',
    },

    // MinIO（自托管）
    minio: {
      endPoint: process.env.MINIO_ENDPOINT || 'localhost:9000',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      bucket: process.env.MINIO_BUCKET || 'content-creator',
    },

    // 本地文件系统（开发环境）
    local: {
      outputDir: process.env.IMAGE_OUTPUT_DIR || './data/images',
      baseUrl: process.env.IMAGE_BASE_URL || 'http://localhost:3000/images',
    }
  }
};
```

#### 6.6.3 图片上传实现

```javascript
// services/image-storage.js
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs').promises;

class ImageStorage {
  constructor(config) {
    this.provider = config.storage.provider;
    this.config = config.storage[this.provider];

    if (this.provider === 's3') {
      this.s3 = new S3Client({
        region: this.config.region,
        credentials: {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        },
      });
    }
  }

  async uploadImage(taskId, imageBuffer, metadata) {
    let location;

    switch (this.provider) {
      case 's3':
        location = await this.uploadToS3(taskId, imageBuffer, metadata);
        break;
      case 'local':
        location = await this.uploadToLocal(taskId, imageBuffer, metadata);
        break;
      default:
        throw new Error(`Unsupported storage provider: ${this.provider}`);
    }

    return location;
  }

  // 上传到 S3
  async uploadToS3(taskId, imageBuffer, metadata) {
    const fileName = this.generateFileName(taskId, metadata.format);
    const key = `images/${new Date().toISOString().split('T')[0]}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: imageBuffer,
      ContentType: `image/${metadata.format}`,
      ACL: this.config.acl || 'public-read',
    });

    await this.s3.send(command);

    const url = `https://${this.config.bucket}.s3.${this.config.region}.amazonaws.com/${key}`;

    logger.info(`Image uploaded to S3: ${url}`);

    return {
      url,
      key,
      provider: 's3',
      bucket: this.config.bucket,
    };
  }

  // 上传到本地文件系统
  async uploadToLocal(taskId, imageBuffer, metadata) {
    const date = new Date();
    const datePath = path.join(
      this.config.outputDir,
      date.getFullYear().toString(),
      (date.getMonth() + 1).toString().padStart(2, '0'),
      date.getDate().toString().padStart(2, '0')
    );

    await fs.mkdir(datePath, { recursive: true });

    const fileName = this.generateFileName(taskId, metadata.format);
    const filePath = path.join(datePath, fileName);

    await fs.writeFile(filePath, imageBuffer);

    const relativePath = path.relative(this.config.outputDir, filePath);
    const url = `${this.config.baseUrl}/${relativePath}`;

    logger.info(`Image saved to local: ${filePath}`);

    return {
      url,
      path: filePath,
      provider: 'local',
    };
  }

  generateFileName(taskId, format) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `task-${taskId}-${timestamp}-${random}.${format}`;
  }
}
```

#### 6.6.4 图片元数据存储

```javascript
// 完整的图片存储流程
async function handleImageGeneration(taskId, imageData, metadata) {
  // 1. 接收图片数据
  let imageBuffer;
  let imageMetadata;

  if (imageData.url) {
    // 如果 API 返回 URL，下载图片
    const response = await axios.get(imageData.url, { responseType: 'arraybuffer' });
    imageBuffer = Buffer.from(response.data);
    imageMetadata = { ...imageData, ...metadata };
  } else if (imageData.buffer) {
    // 如果 API 返回二进制数据
    imageBuffer = imageData.buffer;
    imageMetadata = { ...imageData, ...metadata };
  } else {
    throw new Error('Invalid image data');
  }

  // 2. 获取图片尺寸
  const dimensions = await imageSize(imageBuffer);
  imageMetadata.width = dimensions.width;
  imageMetadata.height = dimensions.height;
  imageMetadata.size = imageBuffer.length;
  imageMetadata.format = metadata.format || 'png';

  // 3. 上传到对象存储
  const storage = new ImageStorage(config);
  const location = await storage.uploadImage(taskId, imageBuffer, imageMetadata);

  // 4. 保存到数据库
  await db.query(`
    INSERT INTO results (task_id, result_type, file_path, metadata)
    VALUES ($1, $2, $3, $4)
  `, [
    taskId,
    'image',
    location.url,
    JSON.stringify({
      ...imageMetadata,
      ...location,
      generatedAt: new Date().toISOString()
    })
  ]);

  return {
    url: location.url,
    path: location.path,
    metadata: imageMetadata
  };
}
```

---

### 6.7 存储访问与检索

#### 6.7.1 查询文案

```javascript
// 获取文章内容
async function getArticle(taskId) {
  const result = await db.query(`
    SELECT id, content, metadata, file_path, created_at
    FROM results
    WHERE task_id = $1 AND result_type = 'article'
  `, [taskId]);

  if (result.rows.length === 0) {
    throw new Error('Article not found');
  }

  const article = result.rows[0];

  return {
    id: article.id,
    taskId,
    content: article.content,       // Markdown 内容
    metadata: article.metadata,     // 元数据
    filePath: article.file_path,    // 导出文件路径（如果有）
    createdAt: article.created_at
  };
}
```

#### 6.7.2 查询图片

```javascript
// 获取图片 URL
async function getImage(taskId) {
  const result = await db.query(`
    SELECT id, file_path as url, metadata, created_at
    FROM results
    WHERE task_id = $1 AND result_type = 'image'
  `, [taskId]);

  if (result.rows.length === 0) {
    throw new Error('Image not found');
  }

  const image = result.rows[0];

  return {
    id: image.id,
    taskId,
    url: image.url,                 // 图片 URL（可直接访问）
    metadata: image.metadata,       // 元数据
    createdAt: image.created_at
  };
}
```

#### 6.7.3 批量查询

```javascript
// 获取任务的所有结果
async function getTaskResults(taskId) {
  const result = await db.query(`
    SELECT result_type, content, file_path, metadata, created_at
    FROM results
    WHERE task_id = $1
    ORDER BY created_at ASC
  `, [taskId]);

  const results = {
    article: null,
    images: []
  };

  for (const row of result.rows) {
    if (row.result_type === 'article') {
      results.article = {
        content: row.content,
        metadata: row.metadata,
        filePath: row.file_path
      };
    } else if (row.result_type === 'image') {
      results.images.push({
        url: row.file_path,
        metadata: row.metadata
      });
    }
  }

  return results;
}
```

---

### 6.8 存储优化策略

#### 6.8.1 文案压缩存储（可选）

对于超长文章，可以使用压缩：

```javascript
const zlib = require('zlib');

async function saveCompressedArticle(taskId, content, metadata) {
  const compressed = zlib.deflateSync(content);

  await db.query(`
    INSERT INTO results (task_id, result_type, content, metadata)
    VALUES ($1, $2, $3, $4)
  `, [taskId, 'article', compressed, JSON.stringify({ ...metadata, compressed: true })]);
}

// 读取时解压
async function getDecompressedArticle(taskId) {
  const result = await db.query(`
    SELECT content, metadata FROM results
    WHERE task_id = $1 AND result_type = 'article'
  `, [taskId]);

  const metadata = JSON.parse(result.rows[0].metadata);
  let content = result.rows[0].content;

  if (metadata.compressed) {
    content = zlib.inflateSync(content).toString('utf8');
  }

  return { content, metadata };
}
```

#### 6.8.2 图片优化

**自动缩略图**：

```javascript
const sharp = require('sharp');

async function generateThumbnail(imageBuffer, size = 300) {
  return await sharp(imageBuffer)
    .resize(size, size, { fit: 'inside' })
    .toBuffer();
}

// 上传原图和缩略图
async function uploadImageWithThumbnail(taskId, imageBuffer, metadata) {
  const original = await storage.uploadImage(
    taskId,
    imageBuffer,
    { ...metadata, type: 'original' }
  );

  const thumbnailBuffer = await generateThumbnail(imageBuffer);
  const thumbnail = await storage.uploadImage(
    taskId,
    thumbnailBuffer,
    { ...metadata, type: 'thumbnail', width: 300, height: 300 }
  );

  return { original, thumbnail };
}
```

**格式转换（WebP）**：

```javascript
async function convertToWebP(imageBuffer) {
  return await sharp(imageBuffer)
    .webp({ quality: 80 })
    .toBuffer();
}
```

#### 6.8.3 CDN 加速（可选）

```javascript
const cdnConfig = {
  enabled: true,
  baseUrl: 'https://cdn.example.com',
  cacheControl: 'public, max-age=31536000'
};

function getCdnUrl(originalUrl) {
  if (!cdnConfig.enabled) return originalUrl;

  return originalUrl.replace(
    /^https:\/\/[^\.]+\.s3\.[^\.]+\.amazonaws\.com\//,
    `${cdnConfig.baseUrl}/`
  );
}
```

---

### 6.9 推荐配置

#### 开发环境

```yaml
文案: PostgreSQL + 本地文件导出
图片: 本地文件系统（./data/images）
```

#### 生产环境

```yaml
文案: PostgreSQL（主） + S3（备份）
图片: S3/OSS（主） + CDN（加速）
```

---

## 七、状态管理策略

### 7.1 Worker 心跳机制

为了及时检测 Worker 崩溃并自动恢复任务，实现了心跳机制：

```javascript
// Worker 定期发送心跳（每 30 秒）
class WorkerHeartbeat {
  constructor(workerId, db) {
    this.workerId = workerId;
    this.db = db;
    this.interval = null;
  }

  start() {
    // 立即发送一次心跳
    this.sendHeartbeat();

    // 每 30 秒发送一次心跳
    this.interval = setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  async sendHeartbeat() {
    await this.db.query(`
      INSERT INTO worker_heartbeats (worker_id, last_heartbeat, status, metadata)
      VALUES ($1, CURRENT_TIMESTAMP, 'active', $2)
      ON CONFLICT (worker_id)
      DO UPDATE SET
        last_heartbeat = CURRENT_TIMESTAMP,
        status = 'active',
        metadata = $2,
        updated_at = CURRENT_TIMESTAMP
    `, [this.workerId, JSON.stringify(this.getMetadata())]);
  }

  getMetadata() {
    return {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      activeTasks: this.getActiveTaskCount()
    };
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

// Worker 启动时
const heartbeat = new WorkerHeartbeat(workerId, db);
heartbeat.start();

// Worker 优雅关闭
process.on('SIGTERM', async () => {
  heartbeat.stop();
  await db.query(`
    UPDATE worker_heartbeats
    SET status = 'inactive'
    WHERE worker_id = $1
  `, [workerId]);
  process.exit(0);
});
```

**心跳监控服务**（独立进程或主 Worker）:

```javascript
// services/heartbeat-monitor.js
class HeartbeatMonitor {
  constructor(db, timeout = 120000) {  // 默认 2 分钟超时
    this.db = db;
    this.timeout = timeout;
  }

  async checkDeadWorkers() {
    // 查找超时的 Worker
    const deadWorkers = await this.db.query(`
      UPDATE worker_heartbeats
      SET status = 'dead'
      WHERE status = 'active'
        AND last_heartbeat < NOW() - INTERVAL '2 minutes'
      RETURNING worker_id, last_heartbeat
    `);

    if (deadWorkers.rows.length > 0) {
      logger.warn(`Detected ${deadWorkers.rows.length} dead workers`);

      for (const worker of deadWorkers.rows) {
        await this.handleDeadWorker(worker.worker_id);
      }
    }
  }

  async handleDeadWorker(workerId) {
    logger.warn(`Worker ${workerId} is dead, releasing tasks...`);

    // 释放该 Worker 的所有 running 状态任务
    const result = await this.db.query(`
      UPDATE tasks
      SET status = 'pending',
          worker_id = NULL,
          error_message = 'Worker died, task released'
      WHERE worker_id = $1
        AND status = 'running'
      RETURNING task_id
    `, [workerId]);

    logger.info(`Released ${result.rows.length} tasks from dead worker ${workerId}`);

    // 记录状态转移历史
    for (const task of result.rows) {
      await this.recordStatusChange(task.task_id, 'running', 'pending', 'system', 'Worker died');
    }
  }

  async recordStatusChange(taskId, oldStatus, newStatus, changedBy, reason) {
    await this.db.query(`
      INSERT INTO task_status_history (task_id, old_status, new_status, changed_by, reason)
      VALUES ($1, $2, $3, $4, $5)
    `, [taskId, oldStatus, newStatus, changedBy, reason]);
  }

  start() {
    // 每 30 秒检查一次
    this.interval = setInterval(() => {
      this.checkDeadWorkers();
    }, 30000);
  }
}

// 启动心跳监控
const monitor = new HeartbeatMonitor(db);
monitor.start();
```

### 7.2 超时自动恢复机制

```javascript
// services/task-timeout-monitor.js
class TaskTimeoutMonitor {
  constructor(db, timeout = 1800000) {  // 默认 30 分钟超时
    this.db = db;
    this.timeout = timeout;
  }

  async checkTimeoutTasks() {
    // 查找超时的 running 任务
    const timeoutTasks = await this.db.query(`
      UPDATE tasks
      SET status = 'pending',
          worker_id = NULL,
          error_message = 'Task timeout, auto-recovered',
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'running'
        AND started_at < NOW() - INTERVAL '30 minutes'
      RETURNING task_id, topic, started_at
    `);

    if (timeoutTasks.rows.length > 0) {
      logger.warn(`Recovered ${timeoutTasks.rows.length} timeout tasks`);

      for (const task of timeoutTasks.rows) {
        await this.recordStatusChange(task.task_id, 'running', 'pending', 'system', 'Task timeout');

        logger.warn(`Task ${task.task_id} (${task.topic}) timeout after ${Date.now() - new Date(task.started_at).getTime()}ms`);
      }
    }
  }

  async recordStatusChange(taskId, oldStatus, newStatus, changedBy, reason) {
    await this.db.query(`
      INSERT INTO task_status_history (task_id, old_status, new_status, changed_by, reason)
      VALUES ($1, $2, $3, $4, $5)
    `, [taskId, oldStatus, newStatus, changedBy, reason]);
  }

  start() {
    // 每 5 分钟检查一次
    this.interval = setInterval(() => {
      this.checkTimeoutTasks();
    }, 300000);  // 5 分钟
  }
}

// 启动超时监控
const timeoutMonitor = new TaskTimeoutMonitor(db);
timeoutMonitor.start();
```

**监控指标**:

```javascript
// 超时恢复监控
const timeoutRecoveredTotal = new promClient.Counter({
  name: 'task_timeout_recovered_total',
  help: 'Total number of tasks recovered from timeout'
});

const workerDiedTotal = new promClient.Counter({
  name: 'worker_died_total',
  help: 'Total number of workers detected as dead'
});
```

---

### 7.3 真相来源（Source of Truth）

**数据持久化层次**：
```
PostgreSQL（主数据源）✅
  ├─ tasks 表：任务状态、重试计数、版本号
  ├─ task_steps 表：步骤执行记录、attempt 次数
  ├─ quality_checks 表：质检结果、改进建议
  └─ token_usage 表：Token 消耗、成本统计

Redis（运行时缓存）⚡️
  ├─ 任务状态缓存（减少 DB 查询）
  ├─ 搜索结果缓存（减少 API 调用）
  ├─ 队列数据（Bull Queue）
  └─ 限流计数器

LangGraph State（内存状态）💾
  ├─ 工作流执行时的临时状态
  ├─ 定期同步到 PostgreSQL
  └─ 崩溃后从 DB 恢复
```

**原则**：
- **任务状态**：以 `tasks` 表为准
- **执行步骤**：以 `task_steps` 表为准
- **重试计数**：持久化到 `tasks.text_retry_count` 和 `tasks.image_retry_count`
- **LangGraph State**：作为运行时状态，每个节点执行完成后同步到 DB

### 7.4 状态同步策略

#### 同步 State 到 DB

```javascript
// 每个 Node 执行完成后，同步 State 到 DB
async function syncState(taskId, state) {
  await db.query(`
    UPDATE tasks
    SET current_step = $1,
        text_retry_count = $2,
        image_retry_count = $3,
        state_snapshot = $4,
        updated_at = CURRENT_TIMESTAMP
    WHERE task_id = $5
  `, [
    state.currentStep,
    state.textRetryCount,
    state.imageRetryCount,
    JSON.stringify(state),
    taskId
  ]);
}
```

#### 从 DB 恢复 State

```javascript
// 崩溃恢复：从 DB 恢复 State
async function recoverState(taskId) {
  const result = await db.query(`
    SELECT state_snapshot, current_step,
           text_retry_count, image_retry_count
    FROM tasks
    WHERE task_id = $1
  `, [taskId]);

  if (result.rows.length > 0 && result.rows[0].state_snapshot) {
    return JSON.parse(result.rows[0].state_snapshot);
  }

  return null;
}
```

### 7.5 幂等性与一致性保障

#### Worker 抢占机制（原子操作）

```sql
-- Worker 开始执行前，原子性地抢占任务
UPDATE tasks
SET status = 'running',
    started_at = CURRENT_TIMESTAMP,
    worker_id = $1,
    version = version + 1
WHERE task_id = $2
  AND status IN ('pending', 'failed')
  AND worker_id IS NULL
RETURNING task_id, version;

-- 检查受影响行数，为 0 说明已被抢占
```

#### 任务级幂等

```javascript
// CLI 提交任务前检查是否已存在
async function createTaskIfNotExists(taskId, data) {
  const existing = await db.query(
    'SELECT * FROM tasks WHERE task_id = $1',
    [taskId]
  );

  if (existing.rows.length > 0) {
    const task = existing.rows[0];
    if (task.status === 'completed') {
      return { exists: true, result: await getTaskResult(taskId) };
    } else {
      throw new Error('Task already exists');
    }
  }

  // 创建新任务
  return await db.query('INSERT INTO tasks ...');
}
```

#### 步骤级幂等

```sql
-- 唯一约束防止重复记录
CREATE UNIQUE INDEX idx_task_step_attempt
ON task_steps(task_id, step_name, attempt);

-- Node 执行前检查
SELECT * FROM task_steps
WHERE task_id = $1 AND step_name = $2 AND attempt = $3;
```

---

## 八、错误处理与重试策略

### 8.1 错误分类体系

```javascript
enum ErrorType {
  // API 调用错误（可重试）
  API_TIMEOUT = 'api_timeout',
  API_RATE_LIMIT = 'api_rate_limit',
  API_SERVER_ERROR = 'api_server_error',
  API_NETWORK_ERROR = 'api_network_error',

  // 业务规则错误（不可重试）
  VALIDATION_ERROR = 'validation_error',
  QUALITY_ERROR = 'quality_error',
  CONSTRAINT_ERROR = 'constraint_error',

  // 系统错误（需人工介入）
  DATABASE_ERROR = 'database_error',
  QUEUE_ERROR = 'queue_error',
  CONFIG_ERROR = 'config_error',
  UNKNOWN_ERROR = 'unknown_error'
}

enum ErrorSeverity {
  LOW = 'low',       // 不影响主流程
  MEDIUM = 'medium', // 影响当前步骤，可重试
  HIGH = 'high',     // 任务终止
  CRITICAL = 'critical' // 系统级错误
}
```

### 8.2 错误处理矩阵

| 错误类型 | 是否重试 | 重试策略 | 最大次数 | 降级方案 |
|---------|---------|----------|---------|---------|
| API_TIMEOUT | ✅ | 指数退避（1s, 2s, 4s） | 3 | 使用缓存 |
| API_RATE_LIMIT | ✅ | 固定延迟（60s） | 5 | 排队等待 |
| API_SERVER_ERROR | ✅ | 指数退避 | 3 | 标记失败 |
| VALIDATION_ERROR | ❌ | - | - | 立即返回 |
| QUALITY_ERROR | ✅ | 业务重试 | 3 | 保留结果 |
| DATABASE_ERROR | ❌ | - | - | 告警 |
| QUEUE_ERROR | ❌ | - | - | 告警 |

### 8.3 断路器模式

为了防止级联故障和资源浪费，对外部 API 调用实现断路器模式：

```javascript
const CircuitBreaker = require('opossum');

// LLM 服务断路器
const llmBreaker = new CircuitBreaker(llmService.chat.bind(llmService), {
  timeout: 30000,                // 30 秒超时
  errorThresholdPercentage: 50,  // 错误率超过 50% 时熔断
  resetTimeout: 60000,           // 60 秒后尝试恢复
  rollingCountTimeout: 10000,    // 10 秒滚动窗口
  rollingCountBuckets: 10        // 10 个桶
});

// 断路器事件监听
llmBreaker.on('open', () => {
  logger.error('LLM circuit breaker opened, failing fast');
  metrics.llmCircuitBreakerState.set('open');
});

llmBreaker.on('halfOpen', () => {
  logger.warn('LLM circuit breaker half-open, testing');
  metrics.llmCircuitBreakerState.set('half-open');
});

llmBreaker.on('close', () => {
  logger.info('LLM circuit breaker closed, normal operation');
  metrics.llmCircuitBreakerState.set('closed');
});

llmBreaker.on('fallback', (result) => {
  logger.warn('LLM circuit breaker fallback triggered', result);
});

// 使用断路器
async function callLLMWithCircuitBreaker(params) {
  try {
    return await llmBreaker.fire(params);
  } catch (error) {
    if (error.message.includes('Circuit breaker')) {
      // 断路器打开，使用降级方案
      logger.error('LLM circuit breaker is open, using fallback');
      return await getFallbackResponse(params);
    }
    throw error;
  }
}

// 降级方案
async function getFallbackResponse(params) {
  // 1. 使用缓存
  const cached = await cache.get(`llm:${hash(params)}`);
  if (cached) {
    return cached;
  }

  // 2. 使用简化逻辑
  return {
    content: `[服务暂时不可用，请稍后重试]`,
    cached: false
  };
}
```

**多个断路器**:

```javascript
// Search API 断路器
const searchBreaker = new CircuitBreaker(searchApi.search.bind(searchApi), {
  timeout: 10000,
  errorThresholdPercentage: 60,
  resetTimeout: 30000
});

// Image Generation 断路器
const imageBreaker = new CircuitBreaker(imageApi.generate.bind(imageApi), {
  timeout: 60000,                 // 图片生成需要更长时间
  errorThresholdPercentage: 40,   // 更严格的阈值
  resetTimeout: 120000            // 2 分钟恢复时间
});

// 断路器状态监控
const circuitBreakerStates = new promClient.Gauge({
  name: 'circuit_breaker_state',
  help: 'Circuit breaker state (0=closed, 1=open, 2=half-open)',
  labelNames: ['service']
});

setInterval(() => {
  circuitBreakerStates.labels({ service: 'llm' }).set(
    llmBreaker.open ? 1 : (llmBreaker.halfOpen ? 2 : 0)
  );
  circuitBreakerStates.labels({ service: 'search' }).set(
    searchBreaker.open ? 1 : (searchBreaker.halfOpen ? 2 : 0)
  );
  circuitBreakerStates.labels({ service: 'image' }).set(
    imageBreaker.open ? 1 : (imageBreaker.halfOpen ? 2 : 0)
  );
}, 10000);
```

**断路器配置中心**:

```yaml
# config/circuit-breaker.yaml
circuit_breaker:
  llm:
    enabled: true
    timeout: 30000
    error_threshold: 50
    reset_timeout: 60000
    fallback:
      - cache
      - default_response

  search:
    enabled: true
    timeout: 10000
    error_threshold: 60
    reset_timeout: 30000
    fallback:
      - cache
      - skip

  image:
    enabled: true
    timeout: 60000
    error_threshold: 40
    reset_timeout: 120000
    fallback:
      - placeholder_image
```

---

### 8.4 重试策略

#### 指数退避

```javascript
function calculateBackoff(attempt) {
  return Math.min(1000 * Math.pow(2, attempt), 30000);
}
// 延迟：1s, 2s, 4s, 8s, 16s, 30s, 30s...
```

#### 业务重试（质量检查）

```javascript
function shouldRetryQualityCheck(checkResult, attempt) {
  if (attempt >= 3) return false;

  // 分数越低，越值得重试
  if (checkResult.score < 5) return true;
  if (checkResult.score < 7 && attempt < 2) return true;

  return false;
}
```

### 8.5 失败语义

#### 任务级失败

```javascript
// 以下情况任务标记为 FAILED
- 硬性约束验证失败（字数、关键词）
- 质量检查重试 3 次后仍不通过
- API 调用失败且无法降级
- 数据库/队列系统错误
- 超过最大执行时间（30 分钟）
```

#### 降级策略

```javascript
// Search API 失败
if (searchApiFailed && cachedResults) {
  logger.warn('Search API failed, using cache');
  return cachedResults;
}

// Image Generation 失败
if (imageGenFailed) {
  logger.warn('Image generation failed, using placeholder');
  return { type: 'placeholder', url: DEFAULT_IMAGE };
}
```

---

## 九、可观测性与监控

### 9.1 链路追踪

```javascript
// Trace ID 设计
Task {
  taskId: string,        // 业务 ID（UUID）
  traceId: string,       // 追踪 ID（复用 taskId）
}

StepExecution {
  traceId: string,
  spanId: string,        // 当前步骤 ID
  parentSpanId: string,  // 父步骤 ID
  stepName: string,
  startTime: DateTime,
  endTime: DateTime,
  duration: number
}

// Trace 传播
LLMService.call(prompt, { traceId }) {
  const span = startSpan('llm_call', { traceId });
  span.setTag('model', 'deepseek-chat');
  span.setTag('tokens_in', result.usage.prompt_tokens);
  span.setTag('tokens_out', result.usage.completion_tokens);
  span.finish();
}
```

### 9.2 日志设计

#### 结构化日志

```javascript
logger.info('step_started', {
  traceId: task.traceId,
  taskId: task.taskId,
  stepName: 'search',
  attempt: 1,
  timestamp: DateTime.now()
});

logger.error('api_call_failed', {
  traceId: task.traceId,
  api: 'deepseek',
  error: error.message,
  statusCode: error.statusCode,
  retryable: true
});
```

### 9.3 指标监控（Prometheus）

```javascript
const promClient = require('prom-client');

// 任务指标
const taskTotal = new promClient.Counter({
  name: 'tasks_total',
  help: 'Total number of tasks',
  labelNames: ['status']
});

const taskDuration = new promClient.Histogram({
  name: 'task_duration_seconds',
  help: 'Task duration in seconds',
  labelNames: ['status'],
  buckets: [60, 180, 300, 600, 1800]
});

// 队列指标
const queueWaiting = new promClient.Gauge({
  name: 'queue_waiting_tasks',
  help: 'Number of waiting tasks',
  labelNames: ['queue_name']
});

// Token 指标
const tokenConsumed = new promClient.Counter({
  name: 'tokens_consumed_total',
  help: 'Total tokens consumed',
  labelNames: ['api_name', 'model_name', 'type']
});

const tokenCost = new promClient.Gauge({
  name: 'token_cost_yuan',
  help: 'Total token cost in Yuan',
  labelNames: ['api_name', 'model_name']
});
```

### 9.4 Token 监控服务

#### CLI 命令

```bash
# 查看今天的统计
cli token-stats

# 查看指定日期
cli token-stats --date 2025-01-18

# 查看 Top 10 最耗 Token 的任务
cli token-stats --top 10

# 生成 7 天成本报告
cli token-stats --report
```

### 9.5 主动成本预算控制

#### 9.5.1 预算控制概述

**问题**: 当前系统只记录 Token 消耗,但未主动控制成本,可能导致:
- 用户配额耗尽后仍产生大量费用
- API 意外过度调用导致成本失控
- 缺少预算预警机制

**解决方案**: 实现多层预算控制机制

#### 9.5.2 预算配置

```yaml
# config/budget.yaml
budget:
  enabled: true

  # 全局预算(系统级)
  global:
    daily_limit_yuan: 1000       # 每日总预算 1000元
    hourly_limit_yuan: 100       # 每小时预算 100元
    alert_threshold: 0.8         # 80% 时告警

  # 用户级预算
  per_user:
    default_daily_limit_yuan: 50  # 每用户每日 50元
    default_task_limit_yuan: 10   # 单任务最多 10元

  # 任务级预算
  per_task:
    default_max_cost_yuan: 10     # 默认单任务成本上限
    warn_at_yuan: 8               # 8元时警告
    hard_stop_at_yuan: 12         # 12元时强制停止
```

#### 9.5.3 预算控制服务

```javascript
// services/budget-controller.js
class BudgetController {
  constructor(db, cache, config) {
    this.db = db;
    this.cache = cache;
    this.config = config;
  }

  // 任务开始前检查预算
  async checkTaskBudget(userId, estimatedCost) {
    // 1. 检查全局预算
    await this.checkGlobalBudget(estimatedCost);

    // 2. 检查用户预算
    await this.checkUserBudget(userId, estimatedCost);

    // 3. 预留预算
    await this.reserveBudget(userId, estimatedCost);

    return true;
  }

  // 检查全局预算
  async checkGlobalBudget(estimatedCost) {
    const today = new Date().toISOString().split('T')[0];
    const hour = new Date().toISOString().slice(0, 13);

    // 查询今日已使用
    const dailyUsed = await this.db.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM token_usage
      WHERE DATE(created_at) = $1
    `, [today]);

    const dailyCost = parseFloat(dailyUsed.rows[0].total);

    // 检查日预算
    if (dailyCost + estimatedCost > this.config.budget.global.daily_limit_yuan) {
      throw new BudgetExceededError(
        `Global daily budget exceeded: ${dailyCost.toFixed(2)} + ${estimatedCost.toFixed(2)} > ${this.config.budget.global.daily_limit_yuan}`
      );
    }

    // 检查小时预算
    const hourlyUsed = await this.db.query(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM token_usage
      WHERE TO_CHAR(created_at, 'YYYY-MM-DD HH24') = $1
    `, [hour]);

    const hourlyCost = parseFloat(hourlyUsed.rows[0].total);

    if (hourlyCost + estimatedCost > this.config.budget.global.hourly_limit_yuan) {
      throw new BudgetExceededError(
        `Global hourly budget exceeded: ${hourlyCost.toFixed(2)} + ${estimatedCost.toFixed(2)} > ${this.config.budget.global.hourly_limit_yuan}`
      );
    }

    // 预警检查
    if (dailyCost / this.config.budget.global.daily_limit_yuan > this.config.budget.global.alert_threshold) {
      logger.warn('Global daily budget alert', {
        used: dailyCost,
        limit: this.config.budget.global.daily_limit_yuan,
        usage: (dailyCost / this.config.budget.global.daily_limit_yuan * 100).toFixed(1) + '%'
      });
    }
  }

  // 检查用户预算
  async checkUserBudget(userId, estimatedCost) {
    const today = new Date().toISOString().split('T')[0];

    // 查询用户今日使用
    const result = await this.db.query(`
      SELECT COALESCE(SUM(tk.total_cost), 0) as total
      FROM token_usage tk
      JOIN tasks t ON t.task_id = tk.task_id
      WHERE t.user_id = $1
        AND DATE(tk.created_at) = $2
    `, [userId, today]);

    const dailyCost = parseFloat(result.rows[0].total);
    const userLimit = this.config.budget.per_user.default_daily_limit_yuan;

    if (dailyCost + estimatedCost > userLimit) {
      throw new BudgetExceededError(
        `User daily budget exceeded: ${dailyCost.toFixed(2)} + ${estimatedCost.toFixed(2)} > ${userLimit}`
      );
    }
  }

  // 预留预算
  async reserveBudget(userId, amount) {
    const key = `budget:reserved:${userId}`;
    await this.cache.incrbyfloat(key, amount);
    await this.cache.expire(key, 3600); // 1小时过期
  }

  // 释放预算
  async releaseBudget(userId, amount) {
    const key = `budget:reserved:${userId}`;
    await this.cache.incrbyfloat(key, -amount);
  }

  // 实时成本跟踪(在 LLM 调用后)
  async trackCost(taskId, actualCost) {
    // 获取任务信息
    const task = await this.db.query('SELECT user_id, estimated_cost FROM tasks WHERE task_id = $1', [taskId]);

    if (task.rows.length === 0) return;

    const userId = task.rows[0].user_id;
    const estimatedCost = task.rows[0].estimated_cost || 0;

    // 累计实际成本
    const key = `budget:actual:${taskId}`;
    const totalCost = await this.cache.incrbyfloat(key, actualCost);

    // 检查是否超出任务预算
    const taskLimit = this.config.budget.per_task.default_max_cost_yuan;
    const warnThreshold = this.config.budget.per_task.warn_at_yuan;

    if (totalCost > warnThreshold && totalCost <= taskLimit) {
      logger.warn('Task cost warning', {
        taskId,
        totalCost: totalCost.toFixed(2),
        limit: taskLimit,
        userId
      });
    }

    if (totalCost > taskLimit) {
      logger.error('Task budget exceeded, cancelling', { taskId, totalCost, userId });
      await this.cancelTask(taskId, 'Budget exceeded');
      throw new BudgetExceededError('Task budget exceeded');
    }
  }

  // 取消任务
  async cancelTask(taskId, reason) {
    await this.db.query(`
      UPDATE tasks
      SET status = 'failed',
          error_message = $1,
          completed_at = CURRENT_TIMESTAMP
      WHERE task_id = $2
    `, [reason, taskId]);
  }
}
```

#### 9.5.4 集成到工作流

```javascript
// 在 LLM Service 中集成
class LLMServiceWithBudget {
  constructor(llmService, budgetController) {
    this.llm = llmService;
    this.budget = budgetController;
  }

  async chat(params, taskId) {
    // 1. 预估成本
    const estimatedCost = this.estimateCost(params);

    // 2. 检查预算
    try {
      await this.budget.checkTaskBudget(params.userId, estimatedCost);
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        logger.error('Budget check failed', { error: error.message });
        throw error;
      }
    }

    // 3. 调用 LLM
    const result = await this.llm.chat(params);

    // 4. 计算实际成本
    const actualCost = this.calculateCost(result.usage);

    // 5. 跟踪成本
    await this.budget.trackCost(taskId, actualCost);

    // 6. 记录到数据库
    await this.recordTokenUsage(taskId, params, result.usage, actualCost);

    return result;
  }
}
```

#### 9.5.5 预算监控告警

```javascript
// 告警服务
class BudgetAlertService {
  constructor(budgetController, notifier) {
    this.budget = budgetController;
    this.notifier = notifier;  // 邮件/钉钉/企业微信
  }

  async checkAndAlert() {
    const today = new Date().toISOString().split('T')[0];

    // 检查全局预算使用情况
    const result = await this.budget.db.query(`
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COUNT(DISTINCT task_id) as task_count
      FROM token_usage
      WHERE DATE(created_at) = $1
    `, [today]);

    const usage = parseFloat(result.rows[0].total_cost);
    const limit = this.budget.config.budget.global.daily_limit_yuan;
    const ratio = usage / limit;

    if (ratio >= 0.9) {
      // 严重告警
      await this.notifier.send({
        level: 'critical',
        title: '🚨 全局预算严重超支告警',
        message: `今日已使用 ¥${usage.toFixed(2)} / ¥${limit} (${(ratio * 100).toFixed(1)}%)`,
        metrics: { usage, limit, ratio, taskCount: result.rows[0].task_count }
      });
    } else if (ratio >= 0.8) {
      // 警告
      await this.notifier.send({
        level: 'warning',
        title: '⚠️ 全局预算预警',
        message: `今日已使用 ¥${usage.toFixed(2)} / ¥${limit} (${(ratio * 100).toFixed(1)}%)`
      });
    }
  }

  start() {
    // 每10分钟检查一次
    this.interval = setInterval(() => this.checkAndAlert(), 600000);
  }
}
```

#### 9.5.6 CLI 命令

```bash
# 查看预算使用情况
cli budget status

# 查看用户预算
cli budget user --user-id <user_id>

# 设置用户预算
cli budget set --user-id <user_id> --daily-limit 100

# 查看预算告警历史
cli budget alerts
```

#### 9.5.7 Prometheus 指标

```javascript
// 预算相关指标
const budgetUsageGauge = new promClient.Gauge({
  name: 'budget_usage_yuan',
  help: 'Current budget usage in Yuan',
  labelNames: ['type', 'user_id']  // type: daily, hourly
});

const budgetLimitGauge = new promClient.Gauge({
  name: 'budget_limit_yuan',
  help: 'Budget limit in Yuan',
  labelNames: ['type', 'user_id']
});

const budgetOverrunTotal = new promClient.Counter({
  name: 'budget_overrun_total',
  help: 'Total number of budget overruns',
  labelNames: ['type', 'user_id']
});

// 定期更新指标
setInterval(async () => {
  const today = new Date().toISOString().split('T')[0];

  // 全局预算
  const result = await db.query(`
    SELECT COALESCE(SUM(total_cost), 0) as total
    FROM token_usage
    WHERE DATE(created_at) = $1
  `, [today]);

  budgetUsageGauge.labels({ type: 'daily', user_id: 'global' }).set(result.rows[0].total);
  budgetLimitGauge.labels({ type: 'daily', user_id: 'global' }).set(config.budget.global.daily_limit_yuan);
}, 60000);
```

#### 9.5.8 预算控制收益

| 维度 | 改进前 | 改进后 |
|------|--------|--------|
| **成本控制** | 被动记录,无法阻止超支 | 主动检查,超支前拦截 |
| **预警机制** | ❌ 无 | ✅ 80%/90% 多级告警 |
| **任务保护** | ❌ 无成本上限 | ✅ 单任务预算上限 |
| **用户隔离** | ❌ 用户间无隔离 | ✅ 用户级预算控制 |
| **响应时间** | 实时查询 DB | 缓存加速,< 10ms |

---

## 十、质量检查架构

### 10.1 两层质检架构

```
文章内容
  ↓
┌──────────────────────────────────────┐
│ 硬规则检查（确定性）                    │
│  - 字数范围（minWords, maxWords）      │
│  - 关键词覆盖（keywords）              │
│  - 结构要求（标题、导语、正文）          │
│  - 禁用词过滤                          │
└──────────────────────────────────────┘
  ↓ 通过？
  ├─ ❌ → 失败（违反硬性约束）
  └─ ✅ → 继续
         ↓
┌──────────────────────────────────────┐
│ 软评分检查（LLM 评审）                  │
│  - 相关性 (relevance, 30%)            │
│  - 连贯性 (coherence, 30%)            │
│  - 完整性 (completeness, 20%)         │
│  - 可读性 (readability, 20%)          │
└──────────────────────────────────────┘
  ↓ 分数 >= 7.0？
  ├─ ❌ → 重试（最多 3 次）
  └─ ✅ → 通过
```

### 10.2 配置化的质检规则

```yaml
# config/quality-check.yaml
quality_check:
  version: "1.0"

  # 硬规则（必须通过）
  hard_rules:
    - name: word_count
      enabled: true
      config:
        min_words: 500
        max_words: 5000

    - name: keywords
      enabled: true
      config:
        required: true
        match_all: false

    - name: structure
      enabled: true
      config:
        require_title: true
        require_intro: true
        require_body: true
        require_conclusion: false

  # 软评分（LLM 评审）
  soft_scoring:
    enabled: true
    provider: llm

    llm_config:
      model: deepseek-chat
      temperature: 0.3
      max_tokens: 500
      rubric_version: v1

    dimensions:
      - name: relevance
        weight: 0.3
        description: "内容与主题的相关性"

      - name: coherence
        weight: 0.3
        description: "逻辑连贯性"

      - name: completeness
        weight: 0.2
        description: "内容完整性"

      - name: readability
        weight: 0.2
        description: "可读性"

    pass_threshold: 7.0

    retry:
      max_attempts: 3
      temperature_schedule: [0.3, 0.5, 0.7]
```

### 10.3 智能重写机制

```javascript
// 质检结果反馈
QualityCheck {
  fixSuggestions: [
    "字数不足：当前 450 字，最少需要 500 字",
    "缺少关键词：人工智能",
    "缺少导语段落"
  ]
}

// Write Node 接收反馈
WriteNode {
  input: {
    previousContent?: string,     // 上一版内容
    fixSuggestions?: string[],   // 质检反馈
    searchResults: array,
    requirements: string
  }

  // 如果有反馈，只针对性地修改
  if (fixSuggestions) {
    prompt = `
      根据以下质检反馈，修改上一版文章：
      反馈：${fixSuggestions.join('\n')}

      要求：
      1. 只修改有问题的部分
      2. 保持已经合格的内容不变
      3. 确保修改后不引入新问题

      上一版内容：
      ${previousContent}
    `;
  }
}
```

---

## 十一、安全设计

### 11.1 用户认证与授权

#### 11.1.1 API Key 认证机制

```javascript
// 认证中间件
class ApiKeyAuth {
  constructor(db, cache) {
    this.db = db;
    this.cache = cache;
  }

  async authenticate(apiKey) {
    // 1. 检查缓存
    const cached = await this.cache.get(`auth:${apiKey}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. 查询数据库
    const result = await this.db.query(`
      SELECT user_id, email, name, status,
             quota_daily, quota_used_today, quota_reset_date
      FROM users
      WHERE api_key = $1 AND status = 'active'
    `, [apiKey]);

    if (result.rows.length === 0) {
      throw new AuthenticationError('Invalid API key');
    }

    const user = result.rows[0];

    // 3. 重置每日配额
    await this.resetQuotaIfNeeded(user);

    // 4. 缓存用户信息（5分钟）
    await this.cache.set(`auth:${apiKey}`, JSON.stringify(user), 300);

    return user;
  }

  async resetQuotaIfNeeded(user) {
    const today = new Date().toISOString().split('T')[0];
    if (user.quota_reset_date < today) {
      await this.db.query(`
        UPDATE users
        SET quota_used_today = 0,
            quota_reset_date = $1
        WHERE user_id = $2
      `, [today, user.user_id]);
      user.quota_used_today = 0;
    }
  }
}

// 使用示例
const auth = new ApiKeyAuth(db, redis);

app.post('/api/v1/tasks', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const user = await auth.authenticate(apiKey);

    // 检查配额
    if (user.quota_used_today >= user.quota_daily) {
      return res.status(429).json({
        error: 'Daily quota exceeded',
        quota: {
          used: user.quota_used_today,
          limit: user.quota_daily,
          resetsAt: getNextResetTime()
        }
      });
    }

    // 创建任务...
  } catch (error) {
    res.status(401).json({ error: 'Authentication failed' });
  }
});
```

#### 11.1.2 配额强制执行

```javascript
// 配额管理服务
class QuotaService {
  constructor(db, cache) {
    this.db = db;
    this.cache = cache;
  }

  async checkQuota(userId, cost = 0) {
    // 1. 获取用户配额
    const user = await this.getUserQuota(userId);

    // 2. 检查是否超限
    if (user.quota_used_today >= user.quota_daily) {
      throw new QuotaExceededError('Daily quota exceeded');
    }

    // 3. 预留配额（防止并发提交）
    const reserved = await this.reserveQuota(userId, 1);

    if (!reserved) {
      throw new QuotaExceededError('No quota available');
    }

    return true;
  }

  async consumeQuota(userId, amount = 1) {
    await this.db.query(`
      UPDATE users
      SET quota_used_today = quota_used_today + $1
      WHERE user_id = $2
    `, [amount, userId]);

    // 清除缓存
    await this.cache.del(`quota:${userId}`);
  }

  async refundQuota(userId, amount = 1) {
    await this.db.query(`
      UPDATE users
      SET quota_used_today = GREATEST(0, quota_used_today - $1)
      WHERE user_id = $2
    `, [amount, userId]);
  }

  async reserveQuota(userId, amount = 1) {
    // 使用乐观锁预留配额
    const result = await this.db.query(`
      UPDATE users
      SET quota_used_today = quota_used_today + $1,
          version = version + 1
      WHERE user_id = $2
        AND quota_used_today + $1 <= quota_daily
      RETURNING quota_used_today, quota_daily
    `, [amount, userId]);

    return result.rows.length > 0;
  }

  async getUserQuota(userId) {
    // 先查缓存
    const cached = await this.cache.get(`quota:${userId}`);
    if (cached) return JSON.parse(cached);

    // 查数据库
    const result = await this.db.query(`
      SELECT quota_daily, quota_used_today, quota_reset_date
      FROM users
      WHERE user_id = $1
    `, [userId]);

    const quota = result.rows[0];

    // 缓存5分钟
    await this.cache.set(`quota:${userId}`, JSON.stringify(quota), 300);

    return quota;
  }
}

// 在任务创建时使用
const quotaService = new QuotaService(db, redis);

async function createTask(user, taskData) {
  // 1. 检查配额
  await quotaService.checkQuota(user.user_id);

  try {
    // 2. 创建任务
    const task = await db.insert('tasks', { ...taskData, user_id: user.user_id });

    // 3. 消费配额
    await quotaService.consumeQuota(user.user_id);

    return task;
  } catch (error) {
    // 4. 失败时退款
    await quotaService.refundQuota(user.user_id);
    throw error;
  }
}
```

#### 11.1.3 API Key 管理

```javascript
// API Key 生成和存储
class ApiKeyManager {
  constructor(db) {
    this.db = db;
  }

  generateApiKey() {
    // 生成格式: ccak_<timestamp>_<random>
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    return `ccak_${timestamp}_${random}`;
  }

  async createApiKey(userId, metadata = {}) {
    const apiKey = this.generateApiKey();
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    await this.db.query(`
      INSERT INTO api_keys (key_hash, user_id, metadata, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
    `, [hashedKey, userId, JSON.stringify(metadata)]);

    return apiKey;
  }

  async verifyApiKey(apiKey) {
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

    const result = await this.db.query(`
      SELECT ak.*, u.user_id, u.email, u.status,
             u.quota_daily, u.quota_used_today
      FROM api_keys ak
      JOIN users u ON u.user_id = ak.user_id
      WHERE ak.key_hash = $1
        AND ak.is_active = true
        AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
        AND u.status = 'active'
    `, [hashedKey]);

    if (result.rows.length === 0) {
      return null;
    }

    // 更新最后使用时间
    await this.db.query(`
      UPDATE api_keys
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE key_hash = $1
    `, [hashedKey]);

    return result.rows[0];
  }
}
```

#### 11.1.4 数据库表更新

```sql
-- 添加 api_keys 表
CREATE TABLE api_keys (
  id SERIAL PRIMARY KEY,
  key_hash TEXT UNIQUE NOT NULL,  -- SHA-256 hash
  user_id TEXT NOT NULL,
  name TEXT,                       -- API Key 名称
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;

-- 为 users 表添加 api_key 字段（可选，用于默认key）
ALTER TABLE users ADD COLUMN api_key_hash TEXT UNIQUE;
```

### 11.2 输入验证

```javascript
function validateTaskInput(input) {
  // 长度限制
  if (input.topic.length > 500) {
    throw new ValidationError('Topic too long');
  }

  if (input.requirements.length > 5000) {
    throw new ValidationError('Requirements too long');
  }

  // 格式验证
  if (input.hardConstraints?.minWords && input.hardConstraints.minWords < 50) {
    throw new ValidationError('minWords too small');
  }

  // 敏感词过滤
  if (containsSensitiveWords(input.topic)) {
    throw new ValidationError('Topic contains sensitive words');
  }
}
```

### 11.2 提示注入防护

```javascript
// 内容净化
function sanitizeSearchResults(results) {
  return results.map(r => ({
    title: r.title.replace(/ignore\s+(previous|all)\s+instructions/gi, '[REDACTED]'),
    snippet: r.snippet.replace(/override\s+protocol/gi, '[REDACTED]'),
    url: r.url
  }));
}

// Prompt 模板化
function buildPrompt(searchResults, requirements) {
  return `
You are a content writer. Write an article based on:

Requirements: ${requirements}

Source Materials:
${searchResults.map((r, i) => `[${i+1}] ${r.title}\n${r.snippet}`).join('\n')}

Remember: Only use the provided source materials.
  `.trim();
}
```

### 11.3 API 密钥管理

#### 密钥加密存储

使用 AWS KMS 或其他密钥管理服务加密存储 API 密钥：

```javascript
// 使用 AWS KMS 加密密钥
const { KMSClient, DecryptCommand, EncryptCommand } = require('@aws-sdk/client-kms');

const kms = new KMSClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

class SecureApiKeyManager {
  constructor() {
    this.keys = new Map();
    this.currentIndex = new Map();
  }

  // 解密密钥（启动时调用一次）
  async decryptKey(encryptedKey) {
    try {
      const command = new DecryptCommand({
        CiphertextBlob: Buffer.from(encryptedKey, 'base64')
      });

      const result = await kms.send(command);
      return result.Plaintext.toString();
    } catch (error) {
      logger.error('Failed to decrypt API key', error);
      throw new Error('API key decryption failed');
    }
  }

  // 初始化密钥（应用启动时）
  async initializeKeys() {
    // 从环境变量读取加密后的密钥
    const encryptedDeepSeekKey = process.env.DEEPSEEK_API_KEY_ENCRYPTED;
    const encryptedDoubaoKey = process.env.DOUBAO_API_KEY_ENCRYPTED;

    if (!encryptedDeepSeekKey || !encryptedDoubaoKey) {
      throw new Error('Encrypted API keys not found in environment');
    }

    // 解密密钥
    const deepseekKey = await this.decryptKey(encryptedDeepSeekKey);
    const doubaoKey = await this.decryptKey(encryptedDoubaoKey);

    // 存储在内存中（不落盘）
    this.keys.set('deepseek', [deepseekKey]);
    this.keys.set('doubao', [doubaoKey]);

    this.currentIndex.set('deepseek', 0);
    this.currentIndex.set('doubao', 0);

    logger.info('API keys decrypted and loaded into memory');
  }

  // 获取密钥（带轮换）
  async getKey(service) {
    const keys = this.keys.get(service);
    if (!keys || keys.length === 0) {
      throw new Error(`No keys available for service: ${service}`);
    }

    const index = this.currentIndex.get(service) || 0;
    const key = keys[index];

    // 轮换到下一个密钥
    this.currentIndex.set(service, (index + 1) % keys.length);

    return key;
  }

  // 添加多个密钥（用于轮换）
  addKeys(service, keys) {
    if (!this.keys.has(service)) {
      this.keys.set(service, []);
      this.currentIndex.set(service, 0);
    }
    this.keys.get(service).push(...keys);
  }
}

// 全局实例
const apiKeyManager = new SecureApiKeyManager();

// 应用启动时初始化
(async () => {
  await apiKeyManager.initializeKeys();
})();

// 使用
async function callLLM() {
  const apiKey = await apiKeyManager.getKey('deepseek');
  // 使用 apiKey 调用 API
}
```

**环境变量配置**：

```bash
# .env.production
# 加密后的密钥（不是明文！）
DEEPSEEK_API_KEY_ENCRYPTED="AQICAHh KmZ...（Base64 编码的加密数据）"
DOUBAO_API_KEY_ENCRYPTED="AQICAHh KmZ...（Base64 编码的加密数据）"

# AWS KMS 配置
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-kms-access-key
AWS_SECRET_ACCESS_KEY=your-kms-secret-key
```

**密钥加密脚本**（用于生成加密密钥）：

```javascript
// scripts/encrypt-api-key.js
const { KMSClient, EncryptCommand } = require('@aws-sdk/client-kms');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function encryptApiKey(plaintextKey) {
  const kms = new KMSClient({ region: 'us-east-1' });

  const command = new EncryptCommand({
    KeyId: process.env.KMS_KEY_ID,  // KMS Key ID
    Plaintext: Buffer.from(plaintextKey)
  });

  const result = await kms.send(command);
  return result.CiphertextBlob.toString('base64');
}

rl.question('Enter API key to encrypt: ', async (answer) => {
  try {
    const encrypted = await encryptApiKey(answer);
    console.log('\nEncrypted API Key (Base64):');
    console.log(encrypted);
    console.log('\nAdd this to your .env file:');
    console.log(`API_KEY_ENCRYPTED="${encrypted}"`);
  } catch (error) {
    console.error('Encryption failed:', error);
  } finally {
    rl.close();
  }
});
```

**密钥轮换**：

```javascript
// 支持多个密钥同时有效，方便滚动更新
apiKeyManager.addKeys('deepseek', [
  'old-key-123',    // 旧密钥，逐步淘汰
  'current-key-456', // 当前密钥
  'new-key-789'     // 新密钥，逐步启用
]);

// 优先使用新密钥，如果失败则尝试旧密钥
async function callWithFallback(service) {
  const keys = apiKeyManager.keys.get(service);

  for (let i = 0; i < keys.length; i++) {
    try {
      const key = keys[(keys.length - 1 - i) % keys.length];  // 从新到旧
      return await callAPI(key);
    } catch (error) {
      if (i === keys.length - 1) throw error;
      logger.warn(`API call failed with key ${i}, trying next key`);
    }
  }
}
```

**密钥审计**：

```javascript
class AuditableApiKeyManager extends SecureApiKeyManager {
  async getKey(service) {
    const key = await super.getKey(service);
    const keyIndex = this.currentIndex.get(service);

    // 记录密钥使用（不记录密钥本身）
    logger.info('api_key_used', {
      service,
      keyIndex,
      timestamp: new Date().toISOString(),
      traceId: currentTraceId
    });

    return key;
  }
}

// 监控密钥使用情况
const apiKeyUsageCounter = new promClient.Counter({
  name: 'api_key_usage_total',
  help: 'Total API key usage count',
  labelNames: ['service', 'key_index']
});

const apiKeyManager = new AuditableApiKeyManager();
```

#### 密钥访问控制

```javascript
// 基于用户的配额和权限
class UserApiKeyManager {
  constructor(db, secureKeyManager) {
    this.db = db;
    this.keyManager = secureKeyManager;
  }

  async getKeyForUser(userId, service) {
    // 检查用户配额
    const user = await this.db.query(
      'SELECT quota_daily, quota_used_today FROM users WHERE user_id = $1',
      [userId]
    );

    if (user.rows[0].quota_used_today >= user.rows[0].quota_daily) {
      throw new Error('User quota exceeded');
    }

    // 检查服务权限
    const hasPermission = await this.checkUserPermission(userId, service);
    if (!hasPermission) {
      throw new Error('User not authorized for this service');
    }

    // 获取密钥
    return await this.keyManager.getKey(service);
  }

  async checkUserPermission(userId, service) {
    // 实现权限检查逻辑
    return true;
  }
}
```

### 11.4 内容引用与合规

```javascript
// 保存搜索引用
SearchNode {
  async execute(input) {
    const results = await searchApi.search(input.topic);

    // 持久化引用来源
    await db.insert('search_references', {
      task_id: input.taskId,
      url: result.url,
      title: result.title,
      snippet: result.snippet
    });

    return results;
  }
}

// 在最终结果中标注来源
Result {
  metadata: {
    sources: [
      { url: 'https://example.com', title: 'Example' }
    ]
  }
}
```

### 11.5 内容审核架构

#### 11.5.1 审核概述

**问题**: 文档中原说明"不包含内容审核",但生产环境必须对生成内容进行合规性检查,以防止:
- 违法违规内容传播
- 敏感信息泄露
- 不当内容生成

**解决方案**: 集成第三方内容审核服务,实现多层审核机制

#### 11.5.2 审核服务提供商

**推荐方案**:
- **阿里云内容安全** - 国内首选,支持文本/图片审核
- **腾讯云天御** - 备选方案
- **AWS Rekognition** - 国际版

**对比**:

| 服务商 | 文本审核 | 图片审核 | 响应时间 | 价格 |
|--------|---------|----------|----------|------|
| 阿里云 | ✅ | ✅ | < 500ms | ¥0.8/千次 |
| 腾讯云 | ✅ | ✅ | < 600ms | ¥0.7/千次 |
| AWS | ✅ | ✅ | < 800ms | $0.001/张 |

#### 11.5.3 审核流程设计

```javascript
// services/content-moderator.js
class ContentModerator {
  constructor(config) {
    this.provider = config.provider || 'aliyun';  // aliyun | tencent | aws
    this.config = config[this.provider];
    this.cache = new Redis();
  }

  // 审核文章内容
  async moderateArticle(taskId, content) {
    // 1. 检查缓存(避免重复审核)
    const cacheKey = `moderation:article:${this.hash(content)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. 调用审核服务
    const result = await this.callModerationAPI('text', content);

    // 3. 缓存结果(24小时)
    await this.cache.set(cacheKey, JSON.stringify(result), 86400);

    // 4. 记录审核结果
    await this.saveModerationResult(taskId, 'article', result);

    // 5. 判断是否通过
    if (!result.passed) {
      throw new ContentModerationError(
        `Content moderation failed: ${result.reason}`,
        result.details
      );
    }

    return result;
  }

  // 审核图片内容
  async moderateImage(taskId, imageUrl) {
    // 1. 检查缓存
    const cacheKey = `moderation:image:${this.hash(imageUrl)}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. 下载图片(如果需要)
    const imageData = await this.downloadImage(imageUrl);

    // 3. 调用审核服务
    const result = await this.callModerationAPI('image', imageData);

    // 4. 缓存结果
    await this.cache.set(cacheKey, JSON.stringify(result), 86400);

    // 5. 记录审核结果
    await this.saveModerationResult(taskId, 'image', result);

    if (!result.passed) {
      throw new ContentModerationError(
        `Image moderation failed: ${result.reason}`,
        result.details
      );
    }

    return result;
  }

  // 调用审核API
  async callModerationAPI(type, data) {
    switch (this.provider) {
      case 'aliyun':
        return await this.moderateWithAliyun(type, data);
      case 'tencent':
        return await this.moderateWithTencent(type, data);
      case 'aws':
        return await this.moderateWithAWS(type, data);
      default:
        throw new Error(`Unsupported moderation provider: ${this.provider}`);
    }
  }

  // 阿里云内容审核
  async moderateWithAliyun(type, data) {
    const GreenClient = require('@alicloud/green20220302');
    const client = new GreenClient({
      accessKeyId: this.config.accessKeyId,
      accessKeySecret: this.config.accessKeySecret,
      endpoint: 'green-cip.cn-shanghai.aliyuncs.com'
    });

    if (type === 'text') {
      const response = await client.textModeration({
        Service: 'comment_detection',
        ServiceParameters: JSON.stringify({
          content: data
        })
      });

      return this.parseAliyunResult(response);
    } else if (type === 'image') {
      const response = await client.imageModeration({
        Service: 'baselineCheck',
        ServiceParameters: JSON.stringify({
          imageUrl: data,  // 或 imageData: Buffer
          dataId: this.generateDataId()
        })
      });

      return this.parseAliyunResult(response);
    }
  }

  // 解析阿里云审核结果
  parseAliyunResult(response) {
    const data = response.Data;

    return {
      passed: !data.some(item => item.RiskLevel === 'high'),
      riskLevel: data[0]?.RiskLevel || 'none',
      reason: data[0]?.Labels?.map(l => l.LabelName).join(', ') || '',
      details: data.map(item => ({
        riskLevel: item.RiskLevel,
        labels: item.Labels?.map(l => ({
          name: l.LabelName,
          score: l.Score
        }))
      })),
      provider: 'aliyun',
      checkedAt: new Date().toISOString()
    };
  }

  // 保存审核结果到数据库
  async saveModerationResult(taskId, contentType, result) {
    await this.db.query(`
      INSERT INTO content_moderations (
        task_id, content_type, passed,
        risk_level, reason, details,
        provider, checked_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      taskId,
      contentType,
      result.passed,
      result.riskLevel,
      result.reason,
      JSON.stringify(result.details),
      result.provider,
      result.checkedAt
    ]);
  }

  hash(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  generateDataId() {
    return `mod_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

#### 11.5.4 集成到工作流

```javascript
// 在 Write Node 后添加审核
class WorkflowWithModeration {
  constructor(moderator) {
    this.moderator = moderator;
  }

  async executeWriteNode(state) {
    // 1. 执行写作
    const article = await writeNode.execute(state);

    // 2. 内容审核
    try {
      await this.moderator.moderateArticle(state.taskId, article.content);
    } catch (error) {
      if (error instanceof ContentModerationError) {
        logger.error('Content moderation failed', {
          taskId: state.taskId,
          reason: error.message,
          details: error.details
        });

        // 记录质检结果
        await qualityCheckRecord.record(state.taskId, {
          passed: false,
          reason: `Content moderation: ${error.message}`
        });

        // 返回失败,触发重写
        return {
          ...state,
          articleContent: null,
          moderationError: error.message
        };
      }
      throw error;
    }

    // 3. 审核通过,继续
    return { ...state, articleContent: article.content };
  }

  async executeGenerateImageNode(state) {
    // 1. 生成图片
    const images = await imageGenNode.execute(state);

    // 2. 图片审核
    for (const image of images) {
      try {
        await this.moderator.moderateImage(state.taskId, image.url);
      } catch (error) {
        if (error instanceof ContentModerationError) {
          logger.error('Image moderation failed', {
            taskId: state.taskId,
            imageUrl: image.url,
            reason: error.message
          });

          // 标记图片未通过
          image.approved = false;
          image.rejectionReason = error.message;
          continue;
        }
      }

      image.approved = true;
    }

    // 3. 过滤未通过的图片
    const approvedImages = images.filter(img => img.approved);

    if (approvedImages.length === 0) {
      throw new ContentModerationError('All images failed moderation');
    }

    return { ...state, images: approvedImages };
  }
}
```

#### 11.5.5 数据库表设计

```sql
-- 内容审核结果表
CREATE TABLE content_moderations (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('article', 'image')),
  content_hash TEXT,  -- 用于缓存去重

  -- 审核结果
  passed BOOLEAN NOT NULL,
  risk_level TEXT CHECK (risk_level IN ('none', 'low', 'medium', 'high')),
  reason TEXT,
  details JSONB,

  -- 服务信息
  provider TEXT NOT NULL,
  api_response JSONB,

  -- 时间戳
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 外键
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX idx_moderations_task_id ON content_moderations(task_id);
CREATE INDEX idx_moderations_content_type ON content_moderations(content_type);
CREATE INDEX idx_moderations_passed ON content_moderations(passed);
CREATE INDEX idx_moderations_content_hash ON content_moderations(content_hash);

-- 复合索引,查询某任务的审核结果
CREATE INDEX idx_moderations_task_type ON content_moderations(task_id, content_type);
```

#### 11.5.6 配置文件

```yaml
# config/content-moderation.yaml
content_moderation:
  enabled: true

  # 服务提供商
  provider: aliyun  # aliyun | tencent | aws

  # 阿里云配置
  aliyun:
    access_key_id: ${ALIYUN_ACCESS_KEY_ID}
    access_key_secret: ${ALIYUN_ACCESS_KEY_SECRET}
    region: cn-shanghai
    endpoint: green-cip.cn-shanghai.aliyuncs.com

  # 腾讯云配置
  tencent:
    secret_id: ${TENCENT_SECRET_ID}
    secret_key: ${TENCENT_SECRET_KEY}
    region: ap-guangzhou

  # AWS 配置
  aws:
    access_key_id: ${AWS_ACCESS_KEY_ID}
    secret_access_key: ${AWS_SECRET_ACCESS_KEY}
    region: us-east-1

  # 审核策略
  policy:
    # 文本审核
    text:
      enabled: true
      risk_threshold: medium  # low | medium | high
      cache_ttl: 86400  # 24小时

    # 图片审核
    image:
      enabled: true
      risk_threshold: medium
      cache_ttl: 86400

    # 失败处理
    on_failure:
      action: reject  # reject | warn | pass
      retry: true
      max_retries: 1
```

#### 11.5.7 监控指标

```javascript
// 内容审核指标
const moderationTotal = new promClient.Counter({
  name: 'content_moderation_total',
  help: 'Total number of content moderation checks',
  labelNames: ['content_type', 'provider', 'result']  // result: passed, failed
});

const moderationDuration = new promClient.Histogram({
  name: 'content_moderation_duration_seconds',
  help: 'Content moderation duration in seconds',
  labelNames: ['content_type', 'provider'],
  buckets: [0.1, 0.5, 1, 2, 5]
});

const moderationRiskLevel = new promClient.Gauge({
  name: 'content_moderation_risk_level',
  help: 'Content moderation risk level (0=none, 1=low, 2=medium, 3=high)',
  labelNames: ['content_type']
});
```

#### 11.5.8 CLI 命令

```bash
# 审核指定内容
cli moderate --type text --content "测试内容"

# 批量审核任务
cli moderate batch --task-ids <task_ids>

# 查看审核历史
cli moderate history --task-id <task_id>

# 重新审核
cli moderate retry --task-id <task_id>
```

#### 11.5.9 成本估算

**阿里云内容安全价格**:
- 文本审核: ¥0.8/千次
- 图片审核: ¥1.5/千次

**月度成本估算**:
```
假设每月 3000 个任务:
- 文章审核: 3000 次 × ¥0.8/千次 = ¥2.4
- 图片审核: 3000 次 × ¥1.5/千次 = ¥4.5
总计: ¥6.9/月
```

**结论**: 成本极低,建议启用

#### 11.5.10 审核架构收益

| 维度 | 无审核 | 有审核 |
|------|--------|--------|
| **合规风险** | ❌ 高风险,可能违法 | ✅ 低风险,主动拦截 |
| **品牌安全** | ❌ 可能产生不当内容 | ✅ 保护品牌形象 |
| **用户信任** | ⚠️ 不确定 | ✅ 可信内容 |
| **成本** | ¥0 | ¥7/月(可忽略) |
| **实施难度** | - | 简单(2-3天) |

**建议**: **必须实施**(P0 级别)

---

## 十二、扩展性设计

### 12.1 工作流插件化

```javascript
// 节点注册表
class NodeRegistry {
  nodes = new Map();

  register(name, node) {
    this.nodes.set(name, node);
  }

  get(name) {
    return this.nodes.get(name);
  }
}

// 注册自定义节点
registry.register('summarize', {
  name: 'Summarize',
  execute: async (state) => { /* ... */ },
  inputs: ['articleContent'],
  outputs: ['summary']
});

registry.register('translate', {
  name: 'Translate',
  execute: async (state) => { /* ... */ },
  inputs: ['articleContent'],
  outputs: ['translatedContent']
});
```

### 12.2 服务提供者接口（SPI）

```javascript
// LLM 服务接口
interface LLMService {
  name: string;
  async chat(params): Promise<{ content, usage }>;
  estimateCost(params): number;
}

// DeepSeek 实现
class DeepSeekLLM implements LLMService {
  name = 'deepseek';
  async chat(params) { /* ... */ }
  estimateCost(params) { /* ... */ }
}

// OpenAI 实现（未来扩展）
class OpenAILLM implements LLMService {
  name = 'openai';
  async chat(params) { /* ... */ }
  estimateCost(params) { /* ... */ }
}
```

### 12.3 配置化

```yaml
# config/workflow.yaml
workflow:
  name: content-creator
  version: 1.0

  nodes:
    write:
      service: deepseek
      model: deepseek-chat
      temperature: 0.7
      maxTokens: 2000

    check_text:
      service: quality
      rubric: v1
      minScore: 7

  globals:
    maxExecutionTime: 1800000
    enableCache: true
```

---

## 十三、部署与运维

### 13.1 Docker Compose 部署

```yaml
version: '3.8'

services:
  postgres-primary:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: content_creator
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_primary_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s

  redis-master:
    image: redis:7-alpine
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_master_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  worker:
    build: .
    command: node worker.js
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres-primary:5432/content_creator
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis-master:6379
      WORKER_ID: ${HOSTNAME}
    deploy:
      replicas: 5
    healthcheck:
      test: ["CMD", "node", "healthcheck.js"]
      interval: 30s

volumes:
  postgres_primary_data:
  redis_master_data:
```

### 13.2 健康检查

```javascript
// healthcheck.js
async function check() {
  const checks = {
    uptime: process.uptime(),
    status: 'healthy'
  };

  try {
    // 检查数据库
    const db = new Pool({ /* config */ });
    await db.query('SELECT 1');
    checks.database = { status: 'ok' };

    // 检查 Redis
    const redis = new Redis({ /* config */ });
    await redis.ping();
    checks.redis = { status: 'ok' };

    console.log(JSON.stringify(checks));
    process.exit(0);
  } catch (error) {
    checks.status = 'unhealthy';
    checks.error = error.message;
    console.error(JSON.stringify(checks));
    process.exit(1);
  }
}

check();
```

### 13.3 监控与告警

#### Prometheus 告警规则

```yaml
groups:
- name: content_creator
  rules:
  - alert: HighTaskFailureRate
    expr: rate(tasks_total{status="failed"}[5m]) > 0.1
    for: 5m
    annotations:
      summary: "High task failure rate"

  - alert: WorkerDown
    expr: up{job="worker"} == 0
    for: 1m
    annotations:
      summary: "Worker is down"

  - alert: TooManyPendingTasks
    expr: queue_waiting_tasks > 100
    annotations:
      summary: "Too many pending tasks"
```

### 13.4 故障排查手册

#### 常见问题

**问题：任务卡在 running 状态**
```bash
# 查找僵尸任务
psql -c "SELECT task_id, worker_id, started_at FROM tasks WHERE status='running' AND started_at < NOW() - INTERVAL '30 minutes';"

# 重置状态
psql -c "UPDATE tasks SET status='pending', worker_id=NULL WHERE task_id='xxx';"
```

**问题：质量检查一直失败**
```bash
# 查看质检日志
psql -c "SELECT details, fix_suggestions FROM quality_checks WHERE task_id='xxx' ORDER BY checked_at DESC LIMIT 5;"
```

**问题：API 调用超时**
```bash
# 查看错误日志
psql -c "SELECT * FROM execution_logs WHERE event_name='api_call_failed' ORDER BY created_at DESC LIMIT 10;"
```

---

## 附录

### A. 关键技术决策

| 决策项 | 选择 | 理由 |
|-------|------|------|
| 数据库 | PostgreSQL | 高并发、分布式、ACID |
| 队列 | Bull + Redis | 成熟、可靠、易扩展 |
| 部署模式 | 多 Worker | 支持 100 人并发 |
| 质量检查 | 硬规则 + LLM | 稳定性与可扩展性平衡 |
| 状态管理 | DB 为主 | 崩溃恢复、幂等性 |

### B. 容量总结

```
配置：5 Worker × 2 并发 = 10 并发任务
吞吐量：120 任务/小时 = 2880 任务/天
支持用户：100 人同时在线
峰值负载：20 个并发任务（20% 用户同时提交）
余量系数：5.76 倍
```

### C. 实施路线图

#### 第一阶段：核心稳定（1-2 周）
- ✅ 数据库迁移
- ✅ Worker 抢占机制
- ✅ 状态持久化
- ✅ 基础监控

#### 第二阶段：可观测性与安全（2-3 周）
- ✅ 错误处理体系
- ✅ Token 监控
- ✅ 质量检查服务
- ✅ 安全防护

#### 第三阶段：可维护性（3-4 周）
- ✅ 测试覆盖
- ✅ 性能优化
- ✅ 扩展性增强
- ✅ 文档完善

---

**文档版本**: 1.0
**最后更新**: 2025-01-18
**维护者**: Content Creator Team
