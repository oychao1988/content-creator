# Content Creator - 存储与返回机制说明

**更新日期**: 2026-01-20
**版本**: 1.0

---

## 📖 目录

1. [内容存储机制](#内容存储机制)
2. [API 返回流程](#api-返回流程)
3. [图片处理与返回](#图片处理与返回)
4. [当前实现状态](#当前实现状态)
5. [未来改进计划](#未来改进计划)

---

## 📦 内容存储机制

### 数据库设计

项目使用 PostgreSQL 作为主要存储，设计了完整的表结构：

#### 1. **tasks 表** - 任务主表

```sql
CREATE TABLE tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT UNIQUE NOT NULL,
  user_id TEXT,

  -- 任务参数
  mode TEXT CHECK (mode IN ('sync', 'async')),
  topic TEXT NOT NULL,
  requirements TEXT NOT NULL,

  -- 硬性约束（JSON）
  hard_constraints JSONB,

  -- 状态管理
  status TEXT CHECK (status IN (
    'pending', 'running', 'waiting', 'completed', 'failed', 'cancelled'
  )),
  current_step TEXT,
  worker_id TEXT,

  -- 重试计数
  text_retry_count INTEGER DEFAULT 0,
  image_retry_count INTEGER DEFAULT 0,

  -- 乐观锁
  version INTEGER NOT NULL DEFAULT 1,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 错误和快照
  error_message TEXT,
  state_snapshot JSONB,

  -- 幂等性
  idempotency_key TEXT UNIQUE
);
```

**用途**: 存储任务的基本信息和状态

#### 2. **results 表** - 生成结果表

```sql
CREATE TABLE results (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  result_type TEXT CHECK (result_type IN (
    'article', 'image', 'text'
  )),

  -- 内容存储
  content TEXT,           -- 文章内容或图片 URL
  file_path TEXT,          -- 本地文件路径（如果下载）

  -- 元数据（JSON）
  metadata JSONB NOT NULL,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
  UNIQUE (task_id, result_type)
);
```

**用途**: 存储生成的内容（文章、图片 URL 等）

#### 3. **quality_checks 表** - 质量检查表

```sql
CREATE TABLE quality_checks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  check_type TEXT CHECK (check_type IN ('text', 'image')),

  -- 评分
  score NUMERIC(3, 2) CHECK (score >= 1 AND score <= 10),
  passed BOOLEAN NOT NULL,
  hard_constraints_passed BOOLEAN NOT NULL,

  -- 详情（JSON）
  details JSONB NOT NULL,
  fix_suggestions TEXT[],

  -- 元数据
  rubric_version TEXT,
  model_name TEXT,
  prompt_hash TEXT,

  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);
```

**用途**: 存储质量检查结果和改进建议

#### 4. **task_steps 表** - 任务步骤表

```sql
CREATE TABLE task_steps (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_name TEXT CHECK (step_name IN (
    'search', 'organize', 'write', 'check_text',
    'generate_image', 'check_image'
  )),
  status TEXT CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'skipped'
  )),

  -- 输入输出（JSON）
  input_data JSONB,
  output_data JSONB,

  -- 性能指标
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,

  error_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);
```

**用途**: 记录每个工作流步骤的执行情况

#### 5. **token_usage 表** - Token 使用统计

```sql
CREATE TABLE token_usage (
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

  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);
```

**用途**: 跟踪 Token 使用量和成本

---

## 🔄 API 返回流程

### 当前实现（同步模式）

用户通过 CLI 请求后，内容直接**实时返回给用户**：

```
┌────────────────────────────────────────────────────────────┐
│ 1. 用户创建任务                           │
│    pnpm run cli:create --topic "xxx" --sync    │
├────────────────────────────────────────────────────────────┤
│ 2. SyncExecutor 执行                         │
│    - 创建任务记录 (tasks 表)                 │
│    - 执行工作流                              │
│    - 保存结果到内存                            │
├────────────────────────────────────────────────────────────┤
│ 3. CLI 直接显示结果给用户                    │
│    - 📝 生成的内容: [文章全文]               │
│    - 🖼️ 生成的配图: [图片 URL]              │
│    - 🔍 文本质检: [质量报告]                │
└────────────────────────────────────────────────────────────┘
```

### 返回结果示例

```typescript
interface ExecutionResult {
  taskId: string;                    // 任务 ID
  status: 'completed' | 'failed';     // 任务状态
  finalState: {
    articleContent: string;            // 文章内容（直接返回）
    imageUrl: string;                  // 图片 URL（直接返回）
    textQualityReport?: {              // 质量报告
      score: number;
      passed: boolean;
      reason?: string;
    };
  };
  duration: number;                   // 执行时长（毫秒）
  metadata: {
    stepsCompleted: string[];         // 完成的步骤
    tokensUsed: number;              // 使用 Token 数
    cost: number;                    // 成本
  };
}
```

### CLI 显示给用户

**成功时**:
```bash
✅ 任务执行完成!

✅ 执行成功
────────────────────────────────────────
任务ID: 261e42a2-52fa-4777-b88d-ebc1b13bffe4
状态: 已完成
耗时: 51 秒
步骤: search → organize → write → check_text → generate_image → check_image
Token: 3,450
成本: ¥0.1234
────────────────────────────────────────

📝 生成的内容:
────────────────────────────────────────
# AI 技术的发展趋势

人工智能（AI）技术正在以前所未有的速度发展...
[完整文章内容]
────────────────────────────────────────

🖼️ 生成的配图:
────────────────────────────────────────
https://tos-cn-beijing.ivolces.com/xxxxx.jpg
────────────────────────────────────────

🔍 文本质检:
────────────────────────────────────────
状态: 通过
评分: 8.5/100
────────────────────────────────────────
```

---

## 🖼️ 图片处理与返回

### 图片生成流程

```
┌────────────────────────────────────────────────────────────┐
│ 1. GenerateImageNode 执行                      │
│    - 基于 articleContent 生成提示词              │
│    - 调用 ImageService.generateImage()         │
├────────────────────────────────────────────────────────────┤
│ 2. ImageService 调用 Doubao API              │
│    POST https://ark.cn-beijing.volces.com/       │
│         api/v3/images/generations               │
│    {                                            │
│      model: "doubao-seedream-4-5-251128",    │
│      prompt: "...",                              │
│      size: "1920x1920",                       │
│      response_format: "url"                      │
│    }                                            │
├────────────────────────────────────────────────────────────┤
│ 3. Doubao API 返回图片 URL                   │
│    {                                            │
│      data: [{                                    │
│        url: "https://tos-xxx.com/xxx.jpg"      │
│      }]                                          │
│    }                                            │
├────────────────────────────────────────────────────────────┤
│ 4. URL 存储到 WorkflowState                  │
│    state.imageUrl = "https://tos-xxx.com/xxx.jpg" │
├────────────────────────────────────────────────────────────┤
│ 5. URL 直接返回给用户（CLI 显示）            │
│    🖼️ 生成的配图: https://tos-xxx.com/xxx.jpg │
└────────────────────────────────────────────────────────────┘
```

### 图片 API 响应格式

```typescript
// Doubao API 响应
{
  "data": [
    {
      "url": "https://tos-cn-beijing.ivolces.com/xxxx/xxxxx.jpg"
    }
  ]
}

// ImageService 转换后
interface ImageGenerationResponse {
  imageUrl: string;          // 直接的图片 URL
  model: string;
  prompt?: string;
  seed?: number;
}
```

### 图片存储策略

**当前实现**:
- ✅ **云端存储**: Doubao API 生成并托管图片
- ✅ **URL 返回**: 直接返回云端 URL
- ✅ **临时访问**: URL 可能有时效限制

**特点**:
- ✅ **无需下载**: 用户直接访问云端 URL
- ✅ **CDN 加速**: Doubao 使用 COS（对象存储）+ CDN
- ✅ **自动过期**: Doubao 可能设置访问有效期

**缺点**:
- ⚠️ **无持久化**: 图片不存储到本地数据库
- ⚠️ **可能过期**: 长期访问可能失败
- ⚠️ **不可控**: 依赖 Doubao 的存储策略

---

## 📊 当前实现状态

### ✅ 已实现

| 功能 | 状态 | 说明 |
|------|------|------|
| 任务状态管理 | ✅ | tasks 表完整记录状态 |
| 结果存储（设计） | ✅ | results 表已创建 |
| 内容实时返回 | ✅ | CLI 直接显示结果 |
| 图片 URL 返回 | ✅ | Doubao API URL 直接返回 |
| 质量检查记录 | ✅ | quality_checks 表已设计 |
| Token 统计（设计） | ✅ | token_usage 表已创建 |

### ⚠️ 部分实现

| 功能 | 状态 | 说明 |
|------|------|------|
| 结果持久化 | ⚠️ | 表结构已设计，但 saveResults() 为 TODO |
| 图片本地存储 | ⚠️ | 当前只返回 URL，未下载到本地 |
| 质量检查记录 | ⚠️ | 检查功能完整，但未写入数据库 |

### ❌ 未实现

| 功能 | 状态 | 优先级 |
|------|------|--------|
| 结果持久化实现 | ❌ | 高 |
| 图片本地下载 | ❌ | 中 |
| Token 使用记录 | ❌ | 中 |
| 质量报告存储 | ❌ | 中 |

---

## 🔍 SyncExecutor 的 saveResults() 方法

### 当前代码（src/application/workflow/SyncExecutor.ts:226）

```typescript
/**
 * 保存结果
 */
private async saveResults(taskId: string, state: WorkflowState): Promise<void> {
  logger.debug('Saving results', {
    taskId,
    hasArticle: !!state.articleContent,
    hasImage: !!state.imageUrl
  });

  // TODO: 创建Result记录
  // TODO: 创建QualityCheck记录
  // TODO: 更新TokenUsage记录

  logger.debug('Results saved', { taskId });
}
```

**状态**: ❌ **未实现**（所有都是 TODO）

---

## 🎯 用户获取内容的方式

### 方式一：CLI 直接返回（当前）

**流程**:
1. 用户运行 `pnpm run cli:create --topic "xxx" --sync`
2. 系统执行工作流
3. **CLI 直接显示**生成的内容和图片 URL
4. 用户从终端复制或查看

**优点**:
- ✅ 即时获取
- ✅ 无需查询数据库
- ✅ 适合命令行使用

**缺点**:
- ❌ 内容不持久化
- ❌ 刷新终端后内容丢失
- ❌ 无法查询历史

### 方式二：数据库查询（待实现）

**流程**:
1. 用户创建任务
2. 系统保存结果到 results 表
3. 用户通过 API 或 CLI 查询历史
4. 系统返回持久化的内容

**优点**:
- ✅ 内容持久化
- ✅ 可查询历史
- ✅ 支持多用户
- ✅ 适合 Web 应用

**缺点**:
- ❌ 需要额外实现
- ❌ 增加存储成本

---

## 🚀 未来改进计划

### 优先级：高

#### 1. 实现 saveResults() 方法

```typescript
private async saveResults(taskId: string, state: WorkflowState): Promise<void> {
  const resultsRepo = new PostgresResultRepository();

  // 保存文章结果
  if (state.articleContent) {
    await resultsRepo.create({
      taskId,
      resultType: 'article',
      content: state.articleContent,
      metadata: {
        wordCount: state.articleContent.length,
        generatedAt: new Date().toISOString(),
      },
    });
  }

  // 保存图片结果
  if (state.imageUrl) {
    await resultsRepo.create({
      taskId,
      resultType: 'image',
      content: state.imageUrl,  // URL
      metadata: {
        generatedAt: new Date().toISOString(),
      },
    });
  }
}
```

#### 2. 下载图片到本地

```typescript
private async saveResults(taskId: string, state: WorkflowState): Promise<void> {
  if (state.imageUrl) {
    // 下载图片
    const response = await axios.get(state.imageUrl, {
      responseType: 'arraybuffer',
    });

    // 保存到本地
    const filename = `${taskId}_image.jpg`;
    const filePath = path.join(
      config.storage.path,
      filename
    );
    fs.writeFileSync(filePath, response.data);

    // 存储本地路径
    await resultsRepo.create({
      taskId,
      resultType: 'image',
      content: state.imageUrl,          // 保留云 URL
      filePath,                      // 本地路径
      metadata: { filename, fileSize: response.data.length },
    });
  }
}
```

### 优先级：中

#### 3. 实现 Token 统计

```typescript
private async saveResults(taskId: string, state: WorkflowState): Promise<void> {
  // 保存 Token 使用量
  if (state.totalTokens && state.totalCost) {
    await tokenUsageRepo.create({
      taskId,
      traceId: state.traceId,
      stepName: 'total',
      apiName: 'llm',
      modelName: config.llm.modelName,
      tokensIn: 0,
      tokensOut: state.totalTokens,
      totalTokens: state.totalTokens,
      costPer1kTokensIn: 0,
      costPer1kTokensOut: config.llm.costPer1kTokensOut || 0.0014,
      totalCost: state.totalCost,
    });
  }
}
```

#### 4. 实现 HTTP API 查询接口

```typescript
// GET /api/tasks/:taskId/results
router.get('/tasks/:taskId/results', async (req, res) => {
  const results = await resultsRepo.findByTaskId(req.params.taskId);
  res.json(results);
});
```

### 优先级：低

#### 5. 添加 Web 前端

- 提供友好的 Web 界面
- 支持创建和查询任务
- 显示历史记录
- 下载生成的内容

---

## 📋 总结

### 当前状态

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                当前存储与返回机制
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

内容存储:  ⚠️  表结构完整，但写入逻辑未实现
图片存储:  ⚠️ 仅返回云端 URL，未本地持久化
返回方式:  ✅ CLI 实时返回（用户可直接查看）
历史查询:  ❌ 未实现
───────────────────────────────────────────────────────────────────
```

### 用户使用流程

```bash
# 1. 创建任务（同步模式）
pnpm run cli:create \
  --topic "AI 技术发展" \
  --requirements "写一篇文章" \
  --sync

# 2. 等待执行完成（约 50 秒）

# 3. 内容直接显示在终端
✅ 执行成功
────────────────────────────────────────
📝 生成的内容:
# AI 技术的发展趋势
[完整内容...]
────────────────────────────────────────

🖼️ 生成的配图:
https://tos-cn-beijing.ivolces.com/xxxxx.jpg
────────────────────────────────────────

# 4. 用户可以：
#    - 复制文章内容
#    - 访问图片 URL
#    - 保存到文件
```

---

**文档版本**: 1.0
**最后更新**: 2026-01-20
**作者**: Content Creator Team
