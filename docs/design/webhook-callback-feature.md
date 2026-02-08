# content-creator Webhook 回调功能设计方案

## 🎯 设计目标

在 content-creator 中添加 HTTP Webhook 回调功能，当任务完成时主动通知 ContentHub，实现：
- **实时通知**：任务完成立即推送，无需轮询
- **降低负载**：减少 ContentHub 的查询压力
- **更好架构**：发布-订阅模式
- **可靠性**：回调失败重试机制

---

## 📋 功能设计

### 1. 配置项

#### 环境变量（`.env`）

```bash
# Webhook 配置
CALLBACK_ENABLED=true                    # 是否启用回调
CALLBACK_TIMEOUT=10                     # 回调超时（秒）
CALLBACK_RETRY_COUNT=3                  # 失败重试次数
CALLBACK_RETRY_DELAY=5                  # 重试延迟（秒）
CALLBACK_QUEUE_TYPE=bullmq             # 回调任务队列（bullmq|memory）
```

#### CLI 参数

```bash
content-creator create \
  --topic "文章主题" \
  --requirements "创作要求" \
  --mode async \
  --callback-url "http://content-hub/api/v1/content/callback" \  # 回调URL
  --callback-events "completed,failed"                         # 触发事件
```

---

### 2. 事件类型

| 事件 | 触发时机 | Payload |
|------|----------|---------|
| `submitted` | 任务提交到队列 | taskId, status, submittedAt |
| `started` | 任务开始执行 | taskId, status, startedAt |
| `progress` | 任务进度更新 | taskId, currentStep, percentage |
| `completed` | 任务成功完成 | taskId, content, images, qualityScore |
| `failed` | 任务失败 | taskId, error, errorMessage |
| `cancelled` | 任务被取消 | taskId, status, cancelledAt |

**默认**：仅回调 `completed` 和 `failed` 事件

---

### 3. 回调 Payload 格式

#### Completed 事件

```json
{
  "event": "completed",
  "taskId": "uuid-xxxx-xxxx",
  "workflowType": "content-creator",
  "status": "completed",
  "timestamp": "2026-02-08T12:00:00Z",
  "metadata": {
    "topic": "文章主题",
    "requirements": "创作要求",
    "targetAudience": "目标读者"
  },
  "result": {
    "content": "# 文章标题\n\n文章内容...",
    "htmlContent": "<p>文章HTML</p>",
    "images": ["path/to/image1.jpg"],
    "qualityScore": 8.5,
    "wordCount": 1500,
    "metrics": {
      "duration": "3分25秒",
      "tokensUsed": 1500,
      "cost": 0.05
    }
  }
}
```

#### Failed 事件

```json
{
  "event": "failed",
  "taskId": "uuid-xxxx-xxxx",
  "workflowType": "content-creator",
  "status": "failed",
  "timestamp": "2026-02-08T12:00:00Z",
  "error": {
    "type": "api_timeout",
    "message": "DeepSeek API 超时",
    "details": {
      "step": "write_content",
      "retryCount": 3
    }
  }
}
```

---

## 🏗️ 实现方案

### 方案 A：简单实现（推荐）

**位置**：`src/infrastructure/callback/`

#### 1. Webhook 服务

**文件**：`src/infrastructure/callback/WebhookService.ts`

```typescript
import axios, { AxiosError } from 'axios';
import { createLogger } from '../../logging/logger.js';

const logger = createLogger('WebhookService');

export interface CallbackPayload {
  event: string;
  taskId: string;
  workflowType: string;
  status: string;
  timestamp: string;
  metadata?: any;
  result?: any;
  error?: any;
}

export interface WebhookOptions {
  enabled: boolean;
  url?: string;
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
}

export class WebhookService {
  private queue: any[] = [];  // 内存队列
  private processing = false;

  /**
   * 发送回调
   */
  async sendCallback(
    payload: CallbackPayload,
    options: WebhookOptions
  ): Promise<boolean> {
    if (!options.enabled || !options.url) {
      logger.debug('Webhook is disabled or no URL configured');
      return true;  // 视为成功（不阻塞）
    }

    // 添加到队列
    this.queue.push({ payload, options, attempt: 0 });

    // 处理队列
    this.processQueue();

    return true;
  }

  /**
   * 处理回调队列（后台处理）
   */
  private async processQueue(): Promise<void> {
    if (this.processing) {
      return;  // 已有实例在处理
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      await this.sendCallbackWithRetry(item);
    }

    this.processing = false;
  }

  /**
   * 带重试的发送
   */
  private async sendCallbackWithRetry(item: any): Promise<void> {
    const { payload, options, attempt } = item;

    for (let i = 0; i <= (options.retryCount || 0); i++) {
      try {
        const response = await axios.post(
          options.url!,
          payload,
          {
            timeout: (options.timeout || 10) * 1000,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'content-creator/1.0'
            }
          }
        );

        if (response.status === 200 || response.status === 202) {
          logger.info('Webhook sent successfully', {
            taskId: payload.taskId,
            event: payload.event,
            attempt: i + 1
          });
          return;  // 成功，退出
        }

      } catch (error) {
        const axiosError = error as AxiosError;
        logger.warn('Webhook failed', {
          taskId: payload.taskId,
          event: payload.event,
          attempt: i + 1,
          error: axiosError.message,
          code: axiosError.code
        });

        // 最后一次尝试失败，记录到数据库
        if (i >= (options.retryCount || 0)) {
          logger.error('Webhook finally failed after retries', {
            taskId: payload.taskId,
            event: payload.event
          });
        }

        // 等待后重试
        if (i < (options.retryCount || 0)) {
          await new Promise(resolve =>
            setTimeout(resolve, (options.retryDelay || 5) * 1000)
          );
        }
      }
    }
  }
}
```

#### 2. 集成到任务执行器

**文件**：`src/application/workflow/SyncExecutor.ts`

**修改执行完成的代码**：

```typescript
import { WebhookService } from '../../infrastructure/callback/WebhookService.js';

export class SyncExecutor {
  private webhookService: WebhookService;

  constructor(config: ExecutorConfig) {
    // ... 现有代码
    this.webhookService = new WebhookService();
  }

  async execute(params: WorkflowParams): Promise<ExecutionResult> {
    try {
      // ... 执行工作流的现有代码 ...

      // ✅ 新增：任务完成后发送回调
      await this.sendWebhookNotification(result, params);

      return result;

    } catch (error) {
      // ✅ 新增：任务失败时发送回调
      await this.sendWebhookNotification({
        taskId: params.taskId,
        status: 'failed',
        error: error
      }, params);

      throw error;
    }
  }

  /**
   * 发送 Webhook 通知
   */
  private async sendWebhookNotification(
    result: ExecutionResult | any,
    params: WorkflowParams
  ): Promise<void> {
    const callbackUrl = params.callbackUrl;  // 从CLI参数获取
    const enabled = params.webhookEnabled ?? this.config.webhookEnabled;

    if (!enabled || !callbackUrl) {
      return;
    }

    const payload: CallbackPayload = {
      event: result.status,
      taskId: result.taskId,
      workflowType: params.workflowType || 'content-creator',
      status: result.status,
      timestamp: new Date().toISOString(),
      metadata: {
        topic: params.topic,
        requirements: params.requirements
      }
    };

    if (result.status === 'completed') {
      payload.result = result.finalState;
    } else if (result.status === 'failed') {
      payload.error = {
        message: result.error || 'Unknown error',
        type: 'execution_error'
      };
    }

    await this.webhookService.sendCallback(payload, {
      enabled: true,
      url: callbackUrl,
      timeout: 10,
      retryCount: 3,
      retryDelay: 5
    });
  }
}
```

---

### 方案 B：使用 BullMQ 回调（高级）

**优势**：
- 利用现有的 BullMQ 基础设施
- 支持持久化队列
- 自动重试机制
- 可以监控回调状态

**实现位置**：`src/infrastructure/callback/CallbackProducer.ts`

```typescript
import { Queue } from 'bullmq';
import { createLogger } from '../../logging/logger.js';

const logger = createLogger('CallbackProducer');

export class CallbackProducer {
  private queue: Queue;

  constructor(redisUrl: string) {
    this.queue = new Queue('webhook-callbacks', {
      connection: { url: redisUrl },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        }
      }
    });
  }

  /**
   * 添加回调任务到队列
   */
  async addCallback(
    callbackUrl: string,
    payload: CallbackPayload
  ): Promise<void> {
    await this.queue.add('webhook', {
      callbackUrl,
      payload
    });
  }
}
```

---

## 📝 CLI 参数扩展

### 修改 create 命令

**文件**：`src/presentation/cli/commands/create.ts`

**新增选项**：

```typescript
export const createCommand = new Command('create')
  .description('创建并执行工作流任务')
  .option('--callback-url <url>', 'Webhook 回调URL（异步模式）')
  .option('--callback-events <events>', '触发回调的事件（逗号分隔，默认：completed,failed）')
  .action(async (options, cmd: any) => {
    // ... 现有代码 ...

    // ✅ 新增：传递回调参数到工作流
    const params = {
      ...mappedParams,
      callbackUrl: options.callbackUrl,
      callbackEnabled: !!options.callbackUrl,
      callbackEvents: options.callbackEvents?.split(',') || ['completed', 'failed']
    };

    // 执行工作流
    const result = await executor.execute(params);

    // ... 现有代码 ...
  });
```

---

## 🧪 测试方案

### 单元测试

**文件**：`tests/infrastructure/callback/test_WebhookService.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';
import { WebhookService } from '../../../src/infrastructure/callback/WebhookService.js';
import axios from 'axios';

vi.mock('axios');

describe('WebhookService', () => {
  it('should send callback on task completion', async () => {
    const service = new WebhookService();

    vi.mocked(axios.post).mockResolvedValueOnce({
      status: 200,
      data: { success: true }
    });

    const payload = {
      event: 'completed',
      taskId: 'test-123',
      workflowType: 'content-creator',
      status: 'completed',
      timestamp: new Date().toISOString()
    };

    const result = await service.sendCallback(payload, {
      enabled: true,
      url: 'http://localhost:3000/callback'
    });

    expect(result).toBe(true);
    expect(axios.post).toHaveBeenCalledWith(
      'http://localhost:3000/callback',
      payload,
      expect.anything()
    );
  });

  it('should retry on failure', async () => {
    const service = new WebhookService();

    // 前两次失败，第三次成功
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Network error'));
    vi.mocked(axios.post).mockRejectedValueOnce(new Error('Timeout'));
    vi.mocked(axios.post).mockResolvedValueOnce({
      status: 200,
      data: { success: true }
    });

    const payload = {
      event: 'completed',
      taskId: 'test-456',
      status: 'completed'
    };

    const result = await service.sendCallback(payload, {
      enabled: true,
      url: 'http://localhost:3000/callback',
      retryCount: 3,
      retryDelay: 1  // 1秒用于测试
    });

    expect(result).toBe(true);
    expect(axios.post).toHaveBeenCalledTimes(3);
  });
});
```

### 集成测试

**文件**：`tests/integration/test_webhook_callback.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

describe('Webhook Integration Test', () => {
  let callbackServer: any;

  beforeAll(async () => {
    // 启动测试 Webhook 服务器
    callbackServer = spawn('node', ['tests/fixtures/callback-server.js'], {
      stdio: 'pipe'
    });

    // 等待服务器启动
    await setTimeout(2000);
  });

  afterAll(() => {
    if (callbackServer) {
      callbackServer.kill();
    }
  });

  it('should receive callback on task completion', async () => {
    // 创建带回调的任务
    const result = spawn('content-creator', [
      'create',
      '--topic', 'Webhook测试',
      '--requirements', '测试回调功能',
      '--mode', 'async',
      '--callback-url', 'http://localhost:3000/callback'
    ]);

    // 等待回调
    await setTimeout(180000);  // 3分钟

    // 验证回调被接收
    // （测试服务器会记录回调到文件）

    expect(result.exitCode).toBe(0);
  }, 30000);
});
```

---

## 🚀 实施步骤

### 阶段 1：核心功能开发（1-2天）

#### 步骤 1.1：创建 Webhook 服务

**文件**：
- `src/infrastructure/callback/WebhookService.ts`
- `src/infrastructure/callback/__tests__/WebhookService.test.ts`

**任务**：
- [ ] 实现 WebhookService 类
- [ ] 实现队列和重试机制
- [ ] 添加日志记录
- [ ] 编写单元测试

#### 步骤 1.2：集成到执行器

**文件**：
- `src/application/workflow/SyncExecutor.ts`

**任务**：
- [ ] 添加 webhookService 实例
- [ ] 在任务完成/失败时调用 sendCallback
- [ ] 传递必要的参数到 payload

#### 步骤 1.3：扩展 CLI 参数

**文件**：
- `src/presentation/cli/commands/create.ts`
- `src/domain/workflow/WorkflowParams.ts`

**任务**：
- [ ] 添加 --callback-url 参数
- [ ] 添加 --callback-events 参数
- [ ] 更新参数验证
- [ ] 更新帮助文档

---

### 阶段 2：测试和文档（1天）

#### 步骤 2.1：编写测试

**文件**：
- `tests/integration/test_webhook_callback.ts`
- `tests/fixtures/callback-server.ts`

**任务**：
- [ ] 创建测试 Webhook 服务器
- [ ] 测试正常回调
- [ ] 测试失败重试
- [ ] 测试超时处理

#### 步骤 2.2：更新文档

**文件**：
- `docs/guides/webhook-guide.md`（新建）
- `README.md`（更新）

**任务**：
- [ ] 编写 Webhook 使用指南
- [ ] 更新 API 文档
- [ ] 添加配置说明

---

## 📊 与 ContentHub 集成

### ContentHub 接收端点

**新增端点**：`src/backend/app/modules/content/endpoints.py`

```python
@router.post("/callback/{task_id}")
async def handle_task_callback(
    task_id: str,
    callback_data: Dict,
    db: Session = Depends(get_db)
):
    """
    接收 content-creator 的 Webhook 回调

    Payload:
    {
      "event": "completed|failed",
      "taskId": "uuid-xxxx",
      "status": "completed|failed",
      "timestamp": "2026-02-08T12:00:00Z",
      "result": {
        "content": "文章内容",
        "images": ["path/to/image.jpg"],
        "qualityScore": 8.5
      },
      "error": {
        "message": "错误信息",
        "type": "error_type"
      }
    }
    """
    try:
        # 1. 验证回调签名（可选）
        # 2. 查找任务记录
        task = db.query(ContentGenerationTask).filter_by(task_id=task_id).first()

        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")

        # 3. 根据事件类型处理
        if callback_data['event'] == 'completed':
            result = callback_data['result']
            handle_task_completed(task, result)
        elif callback_data['event'] == 'failed':
            error = callback_data['error']
            handle_task_failed(task, error)

        return {"success": True}

    except Exception as e:
        logger.error(f"Webhook处理失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
```

### ContentHub 配置

**文件**：`src/backend/.env`

```bash
# content-creator 配置
CREATOR_CALLBACK_URL=http://content-hub:18010/api/v1/content/callback
CREATOR_CALLBACK_ENABLED=true
CREATOR_CALLBACK_EVENTS=completed,failed
```

---

## ✅ 验收标准

### 功能验收

- [ ] CLI 支持 `--callback-url` 参数
- [ ] 支持 `--callback-events` 参数（事件过滤）
- [ ] 回调失败自动重试（3次）
- [ ] 回调超时控制（10秒）
- [ ] 支持禁用回调（默认启用）

### 性能验收

- [ ] 回调发送延迟 < 2秒
- [ ] 回调成功率 > 95%
- [ ] 不影响任务执行性能
- [ ] 失败回调不阻塞任务完成

### 测试验收

- [ ] 单元测试覆盖率 > 80%
- [ ] 集成测试通过率 100%
- [ ] 回调重试功能正常
- [ ] 高并发下回调稳定

---

## 📊 对比：轮询 vs Webhook

| 维度 | 轮询方案 | Webhook 方案 |
|------|---------|-------------|
| **实时性** | 30秒延迟 | <2秒延迟 ⭐ |
| **服务器负载** | 每30秒查询一次 | 仅任务完成时调用 ⭐ |
| **网络开销** | 大量查询请求 | 少量回调请求 ⭐ |
| **实现复杂度** | 简单 | 中等 |
| **可靠性** | 依赖轮询间隔 | 实时通知 ⭐ |
| **调试难度** | 容易 | 中等 |

---

## 🎯 推荐方案

**组合方案**：Webhook 优先 + 轮询兜底

```
                    任务完成
                        ↓
              ┌───────────┴───────────┐
              │                       │
        Webhook 回调              轮询兜底
      （优先，实时）            （30秒兜底）
              │                       │
        ├─ 成功 ✅                  ├─ 补偿 ✅
        ├─ 失败，重试                │
        └─ 3次失败后放弃              │
                                     ↓
                              轮询获取结果
```

**好处**：
- ⭐ 最佳实时性
- ⭐ 最高可靠性
- ⭐ 最小网络开销
- ⭐ 容错能力强

---

## 📅 实施建议

### 优先级：P1（建议）

**工作量**：1-2天

**收益**：
- 实时性提升 30秒 → 2秒
- 减少 95% 的轮询请求
- 更好的用户体验

### 风险：低

- **向后兼容**：不添加回调参数时保持原样工作
- **可配置**：可通过环境变量禁用
- **渐进式**：可以先在部分账号上测试

---

## 📝 待确认事项

1. **技术细节**
   - [ ] 回调 URL 格式验证
   - [ ] 是否需要签名验证？
   - [ ] 回调失败是否需要记录到数据库？

2. **业务规则**
   - [ ] 默认启用还是禁用回调？
   - [ ] 重试次数是否可配置？
   - [ ] 回调超时时间？

3. **优先级**
   - [ ] 是否现在就实现？
   - [ ] 还是先使用轮询方案？

---

**请确认是否需要在 content-creator 中添加此功能？**
