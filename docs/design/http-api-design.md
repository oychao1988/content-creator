# HTTP API 设计文档

## 概述

本文档描述了 `llm-content-creator` 项目的 RESTful HTTP API 设计。API 提供了对 AI 驱动的内容创作系统的完整访问，包括任务管理、工作流管理和系统监控功能。

**版本**: v0.2.0
**基础路径**: `http://localhost:3001`
**内容类型**: `application/json`

---

## 架构设计

### 分层架构

API 遵循标准的分层架构模式：

```
HTTP Request
    ↓
Routes (路由层 - 路由定义)
    ↓
Controllers (控制器层 - 请求处理)
    ↓
Services (服务层 - 业务逻辑复用)
    ↓
Repositories (仓储层 - 数据访问)
    ↓
Database
```

### 目录结构

```
src/
├── controllers/          # 控制器层
│   ├── TaskController.ts
│   ├── WorkflowController.ts
│   └── HealthController.ts
├── routes/              # 路由定义
│   ├── tasks.ts
│   ├── workflows.ts
│   ├── health.ts
│   └── index.ts
├── middleware/          # 中间件
│   ├── errorHandler.ts
│   └── requestLogger.ts
├── validators/          # Zod 验证 Schema
│   └── taskValidators.ts
├── dto/                # 数据传输对象
│   └── taskDtos.ts
└── presentation/api/   # API 服务器入口
    ├── app.ts
    └── server.ts
```

---

## API 端点

### 健康检查和监控

#### GET /health

健康检查端点，用于监控服务状态。

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-10T10:09:45.694Z",
  "uptime": 2324,
  "version": "0.2.0",
  "checks": {
    "database": "ok",
    "redis": "disabled",
    "queue": "disabled"
  }
}
```

**状态码**:
- `200` - 服务正常
- `503` - 服务降级或不可用

---

#### GET /ready

就绪检查端点，用于 Kubernetes 等编排系统的探针。

**响应示例**:
```json
{
  "status": "ok",
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

#### GET /api/stats

获取系统统计信息。

**响应示例**:
```json
{
  "success": true,
  "data": {
    "tasks": {
      "total": 150,
      "byStatus": {
        "pending": 10,
        "running": 5,
        "waiting": 2,
        "completed": 120,
        "failed": 10,
        "cancelled": 3
      },
      "byType": {
        "article": 100,
        "social_media": 30,
        "marketing": 20
      }
    },
    "queue": {
      "waiting": 15,
      "active": 3,
      "completed": 120,
      "failed": 5
    }
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

### 任务管理

#### POST /api/tasks

创建新的内容创作任务。

**请求体**:
```json
{
  "mode": "sync",
  "type": "article",
  "topic": "人工智能的发展趋势",
  "requirements": "写一篇关于 AI 最新发展趋势的文章，包括大语言模型、计算机视觉等方向",
  "targetAudience": "技术从业者",
  "keywords": ["AI", "大语言模型", "LLM", "GPT"],
  "tone": "专业",
  "imageSize": "1920x1080",
  "priority": 2,
  "hardConstraints": {
    "minWords": 1000,
    "maxWords": 2000,
    "keywords": ["人工智能", "机器学习"]
  },
  "callbackUrl": "https://example.com/webhook",
  "callbackEnabled": true,
  "callbackEvents": ["completed", "failed"]
}
```

**参数说明**:

| 参数 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `mode` | string | 是 | 执行模式：`sync`(同步) 或 `async`(异步) |
| `type` | string | 否 | 任务类型：`article`, `social_media`, `marketing` |
| `topic` | string | 是 | 任务主题 |
| `requirements` | string | 是 | 详细需求描述 |
| `targetAudience` | string | 是 | 目标受众 |
| `keywords` | string[] | 否 | 关键词列表 |
| `tone` | string | 否 | 语气风格 |
| `imageSize` | string | 否 | 生成图片尺寸，如 "1920x1080" |
| `priority` | number | 否 | 优先级 (1-4) |
| `hardConstraints` | object | 否 | 硬性约束 |
| `hardConstraints.minWords` | number | 否 | 最小字数 |
| `hardConstraints.maxWords` | number | 否 | 最大字数 |
| `callbackUrl` | string | 否 | Webhook 回调 URL |
| `callbackEnabled` | boolean | 否 | 是否启用回调 |
| `callbackEvents` | string[] | 否 | 触发回调的事件 |

**同步模式响应 (201)**:
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "content": "生成的文章内容...",
    "htmlContent": "<p>生成的 HTML 文章...</p>",
    "images": [
      {
        "url": "http://localhost:3001/images/abc123.jpg",
        "prompt": "AI technology illustration",
        "width": 1920,
        "height": 1080
      }
    ],
    "qualityScore": 85,
    "wordCount": 1500,
    "metrics": {
      "tokensUsed": 4500,
      "cost": 0.045,
      "duration": 45000,
      "stepsCompleted": ["search", "organize", "write", "check_text", "generate_image", "check_image"]
    }
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

**异步模式响应 (202)**:
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "message": "Task has been queued for processing"
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "message": "Request validation failed",
    "code": "VALIDATION_ERROR",
    "details": {
      "fields": [
        {
          "path": "topic",
          "message": "Topic is required"
        }
      ]
    }
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

#### GET /api/tasks

列出任务，支持分页、过滤和排序。

**查询参数**:

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | number | 1 | 页码 |
| `limit` | number | 20 | 每页数量 (最大 100) |
| `status` | string | - | 按状态过滤 |
| `type` | string | - | 按类型过滤 |
| `userId` | string | - | 按用户 ID 过滤 |
| `sortBy` | string | createdAt | 排序字段 |
| `sortOrder` | string | desc | 排序方向 |

**请求示例**:
```
GET /api/tasks?page=1&limit=20&status=completed&sortBy=createdAt&sortOrder=desc
```

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "tasks": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "type": "article",
        "status": "completed",
        "mode": "sync",
        "priority": 2,
        "topic": "人工智能的发展趋势",
        "requirements": "写一篇关于 AI 的文章...",
        "targetAudience": "技术从业者",
        "keywords": ["AI", "LLM"],
        "tone": "专业",
        "userId": "user-123",
        "currentStep": "check_image",
        "errorMessage": null,
        "createdAt": "2026-02-10T09:00:00.000Z",
        "updatedAt": "2026-02-10T09:15:00.000Z",
        "startedAt": "2026-02-10T09:00:05.000Z",
        "completedAt": "2026-02-10T09:15:00.000Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 150,
      "totalPages": 8
    }
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

#### GET /api/tasks/:id

获取任务详情。

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "type": "article",
    "status": "completed",
    "mode": "sync",
    "priority": 2,
    "topic": "人工智能的发展趋势",
    "requirements": "写一篇关于 AI 的文章...",
    "targetAudience": "技术从业者",
    "keywords": ["AI", "LLM"],
    "tone": "专业",
    "hardConstraints": {
      "minWords": 1000,
      "maxWords": 2000
    },
    "userId": "user-123",
    "currentStep": "check_image",
    "errorMessage": null,
    "createdAt": "2026-02-10T09:00:00.000Z",
    "updatedAt": "2026-02-10T09:15:00.000Z",
    "startedAt": "2026-02-10T09:00:05.000Z",
    "completedAt": "2026-02-10T09:15:00.000Z"
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

**错误响应 (404)**:
```json
{
  "success": false,
  "error": {
    "message": "Task not found: 550e8400-e29b-41d4-a716-446655440000",
    "code": "NOT_FOUND"
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

#### GET /api/tasks/:id/status

获取任务状态和进度。

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "running",
    "currentStep": "write",
    "progress": 50
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

**进度计算**:
- search: 16%
- organize: 33%
- write: 50%
- check_text: 66%
- generate_image: 83%
- check_image: 100%

---

#### GET /api/tasks/:id/result

获取任务的最终结果。

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "content": "纯文本文章内容...",
    "htmlContent": "<p>HTML 格式文章内容...</p>",
    "images": [
      {
        "url": "http://localhost:3001/images/abc123.jpg",
        "prompt": "AI technology illustration",
        "width": 1920,
        "height": 1080
      }
    ],
    "qualityScore": 85,
    "wordCount": 1500
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "message": "Task is not completed yet",
    "code": "VALIDATION_ERROR"
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

#### POST /api/tasks/:id/retry

重试失败的任务。

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "content": "重新生成的文章内容...",
    "metrics": {
      "tokensUsed": 4500,
      "cost": 0.045,
      "duration": 45000,
      "stepsCompleted": ["search", "organize", "write", "check_text", "generate_image", "check_image"]
    }
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

**错误响应 (400)**:
```json
{
  "success": false,
  "error": {
    "message": "Only failed tasks can be retried",
    "code": "VALIDATION_ERROR"
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

#### DELETE /api/tasks/:id

取消正在运行或等待中的任务。

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "taskId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "cancelled",
    "message": "Task has been cancelled"
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

### 工作流管理

#### GET /api/workflows

列出所有可用的工作流。

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "workflows": [
      {
        "type": "content-creator",
        "name": "Content Creator",
        "description": "AI-powered content creation workflow with search, writing, and image generation",
        "parameters": [
          {
            "name": "topic",
            "type": "string",
            "required": true,
            "description": "Content topic or title"
          },
          {
            "name": "requirements",
            "type": "string",
            "required": true,
            "description": "Detailed content requirements"
          },
          {
            "name": "targetAudience",
            "type": "string",
            "required": true,
            "description": "Target audience for the content"
          },
          {
            "name": "tone",
            "type": "string",
            "required": false,
            "description": "Content tone and style"
          }
        ]
      },
      {
        "type": "translation",
        "name": "翻译工作流",
        "description": "Text translation workflow with quality check",
        "parameters": [
          {
            "name": "sourceText",
            "type": "string",
            "required": true,
            "description": "Text to translate"
          },
          {
            "name": "sourceLanguage",
            "type": "string",
            "required": true,
            "description": "Source language"
          },
          {
            "name": "targetLanguage",
            "type": "string",
            "required": true,
            "description": "Target language"
          }
        ]
      },
      {
        "type": "content-creator-agent",
        "name": "Content Creator Agent",
        "description": "AI Agent-based content creation with intelligent tool selection",
        "parameters": [
          {
            "name": "topic",
            "type": "string",
            "required": true,
            "description": "Content topic"
          },
          {
            "name": "requirements",
            "type": "string",
            "required": true,
            "description": "Content requirements"
          }
        ]
      }
    ]
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

#### GET /api/workflows/:type

获取特定工作流的详细信息。

**响应示例 (200)**:
```json
{
  "success": true,
  "data": {
    "type": "content-creator",
    "name": "Content Creator",
    "description": "AI-powered content creation workflow with search, writing, and image generation",
    "parameters": [
      {
        "name": "topic",
        "type": "string",
        "required": true,
        "description": "Content topic or title"
      },
      {
        "name": "requirements",
        "type": "string",
        "required": true,
        "description": "Detailed content requirements"
      }
    ]
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

**错误响应 (404)**:
```json
{
  "success": false,
  "error": {
    "message": "Workflow not found: unknown-workflow",
    "code": "NOT_FOUND"
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

---

### API 根端点

#### GET /api

获取 API 基本信息。

**响应示例 (200)**:
```json
{
  "name": "LLM Content Creator API",
  "version": "0.2.0",
  "description": "AI-powered multi-workflow content creation API",
  "endpoints": {
    "tasks": "/api/tasks",
    "workflows": "/api/workflows",
    "health": "/health",
    "stats": "/api/stats"
  }
}
```

---

## 错误处理

### 错误响应格式

所有错误响应遵循统一格式：

```json
{
  "success": false,
  "error": {
    "message": "错误描述",
    "code": "ERROR_CODE",
    "details": {}  // 可选的额外信息
  },
  "timestamp": "2026-02-10T10:09:45.694Z"
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 202 | 已接受（异步任务） |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |
| 503 | 服务不可用 |

### 错误代码

| 代码 | 说明 |
|------|------|
| `VALIDATION_ERROR` | 请求验证失败 |
| `NOT_FOUND` | 资源不存在 |
| `INTERNAL_ERROR` | 内部错误 |

---

## Webhook 回调

### 配置

在创建任务时可以配置 Webhook 回调：

```json
{
  "callbackUrl": "https://your-domain.com/webhook",
  "callbackEnabled": true,
  "callbackEvents": ["completed", "failed"]
}
```

### 回调格式

**任务完成回调**:
```json
{
  "event": "completed",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "workflowType": "content-creator",
  "status": "completed",
  "timestamp": "2026-02-10T10:09:45.694Z",
  "metadata": {
    "topic": "人工智能的发展趋势",
    "requirements": "写一篇关于 AI 的文章...",
    "targetAudience": "技术从业者"
  },
  "result": {
    "content": "生成的文章内容...",
    "htmlContent": "<p>HTML 格式文章...</p>",
    "images": [...],
    "qualityScore": 85,
    "wordCount": 1500,
    "metrics": {
      "tokensUsed": 4500,
      "cost": 0.045,
      "duration": 45000,
      "stepsCompleted": [...]
    }
  }
}
```

**任务失败回调**:
```json
{
  "event": "failed",
  "taskId": "550e8400-e29b-41d4-a716-446655440000",
  "workflowType": "content-creator",
  "status": "failed",
  "timestamp": "2026-02-10T10:09:45.694Z",
  "metadata": {
    "topic": "人工智能的发展趋势",
    "requirements": "写一篇关于 AI 的文章...",
    "targetAudience": "技术从业者"
  },
  "error": {
    "message": "LLM API timeout",
    "type": "execution_error",
    "details": {
      "duration": 60000,
      "stepsCompleted": ["search", "organize"]
    }
  }
}
```

---

## 启动和配置

### 启动服务器

```bash
# 方式 1：使用 npm script
pnpm run api

# 方式 2：使用 CLI
pnpm run cli api

# 方式 3：开发模式（热重载）
pnpm run api:dev

# 方式 4：指定端口
API_PORT=8080 pnpm run api
```

### 环境变量配置

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `API_PORT` | 3001 | API 服务器端口 |
| `API_HOST` | 0.0.0.0 | 监听地址 |

### 默认端点

- **API 服务器**: `http://localhost:3001`
- **健康检查**: `http://localhost:3001/health`
- **API 根路径**: `http://localhost:3001/api`

---

## 使用示例

### cURL 示例

#### 创建同步任务
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "sync",
    "topic": "人工智能的发展趋势",
    "requirements": "写一篇关于 AI 最新发展趋势的文章",
    "targetAudience": "技术从业者"
  }'
```

#### 查询任务列表
```bash
curl "http://localhost:3001/api/tasks?page=1&limit=10&status=completed"
```

#### 获取任务状态
```bash
curl http://localhost:3001/api/tasks/550e8400-e29b-41d4-a716-446655440000/status
```

#### 列出工作流
```bash
curl http://localhost:3001/api/workflows
```

### JavaScript 示例

```javascript
// 创建任务
const response = await fetch('http://localhost:3001/api/tasks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    mode: 'sync',
    topic: '人工智能的发展趋势',
    requirements: '写一篇关于 AI 最新发展趋势的文章',
    targetAudience: '技术从业者'
  })
});

const data = await response.json();
console.log(data);
```

---

## 技术实现

### 核心组件

1. **Express** - HTTP 服务器框架
2. **Zod** - 请求参数验证
3. **Sentry** - 错误追踪和监控
4. **Winston** - 日志记录

### 业务逻辑复用

API 完全复用现有的业务逻辑：

- `SyncExecutor` - 同步任务执行
- `WorkflowRegistry` - 工作流管理
- 仓储模式 - 数据访问
- 配置系统 - 统一配置

### 中间件

- **请求日志** - 记录所有 HTTP 请求
- **错误处理** - 统一的错误响应格式
- **CORS** - 跨域资源共享支持
- **Sentry** - 自动错误捕获

---

## 未来扩展

### 计划功能

1. **认证和授权**
   - API Key 认证
   - JWT Token 认证
   - OAuth 2.0 集成

2. **速率限制**
   - 基于 IP 的速率限制
   - 基于用户的速率限制
   - Redis 支持的分布式限流

3. **API 版本控制**
   - `/api/v1/` 端点
   - 版本弃用策略

4. **WebSocket 支持**
   - 实时任务进度推送
   - 任务状态变更通知

5. **API 文档**
   - Swagger/OpenAPI 规范
   - 交互式 API 文档

---

## 相关文档

- [项目架构](./architecture/workflow-architecture.md)
- [快速开始](./guides/quick-start.md)
- [工作流扩展指南](./guides/workflow-extension-guide.md)
- [Webhook 功能设计](./webhook-callback-feature.md)
