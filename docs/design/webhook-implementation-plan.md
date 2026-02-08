# content-creator Webhook 回调功能实施计划

## 项目信息

- **项目名称**: content-creator Webhook 回调功能
- **优先级**: P1（建议）
- **预计工作量**: 1-2 天
- **实施阶段**: 2 个阶段，6 个步骤
- **风险等级**: 低

---

## 目标概述

在 content-creator 中添加 HTTP Webhook 回调功能，使任务完成时能够主动通知外部系统（如 ContentHub），实现：
- **实时通知**：任务完成立即推送，无需轮询
- **降低负载**：减少外部系统的查询压力
- **更好架构**：发布-订阅模式
- **可靠性**：回调失败重试机制

---

## 实施阶段概览

```
阶段 1: 核心功能开发 (1-1.5天)
  ├─ 步骤 1.1: 创建 Webhook 服务 (4-5小时)
  ├─ 步骤 1.2: 集成到执行器 (2-3小时)
  └─ 步骤 1.3: 扩展 CLI 参数 (2小时)

阶段 2: 测试和文档 (0.5-1天)
  ├─ 步骤 2.1: 编写测试 (3-4小时)
  └─ 步骤 2.2: 更新文档 (2小时)
```

---

## 阶段 1：核心功能开发

### 步骤 1.1：创建 Webhook 服务

**文件清单**:
- `src/infrastructure/callback/WebhookService.ts` (新建)
- `src/infrastructure/callback/__tests__/WebhookService.test.ts` (新建)

**实现内容**:

```typescript
// src/infrastructure/callback/WebhookService.ts

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

    // 异步处理队列（不阻塞）
    this.processQueue().catch(err => {
      logger.error('Failed to process webhook queue', { error: err });
    });

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

    try {
      while (this.queue.length > 0) {
        const item = this.queue.shift();
        await this.sendCallbackWithRetry(item);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * 带重试的发送
   */
  private async sendCallbackWithRetry(item: any): Promise<void> {
    const { payload, options } = item;

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

        // 最后一次尝试失败，记录错误
        if (i >= (options.retryCount || 0)) {
          logger.error('Webhook finally failed after retries', {
            taskId: payload.taskId,
            event: payload.event,
            totalAttempts: i + 1
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

**单元测试**:

```typescript
// src/infrastructure/callback/__tests__/WebhookService.test.ts

import { describe, it, expect, vi } from 'vitest';
import { WebhookService, CallbackPayload } from '../WebhookService.js';
import axios from 'axios';

vi.mock('axios');

describe('WebhookService', () => {
  it('should send callback on task completion', async () => {
    const service = new WebhookService();

    vi.mocked(axios.post).mockResolvedValueOnce({
      status: 200,
      data: { success: true }
    });

    const payload: CallbackPayload = {
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
      expect.objectContaining({
        timeout: 10000,
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'User-Agent': 'content-creator/1.0'
        })
      })
    );

    // 等待异步队列处理
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  it('should skip webhook when disabled', async () => {
    const service = new WebhookService();

    const payload: CallbackPayload = {
      event: 'completed',
      taskId: 'test-456',
      workflowType: 'content-creator',
      status: 'completed',
      timestamp: new Date().toISOString()
    };

    const result = await service.sendCallback(payload, {
      enabled: false
    });

    expect(result).toBe(true);
    expect(axios.post).not.toHaveBeenCalled();
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

    const payload: CallbackPayload = {
      event: 'completed',
      taskId: 'test-789',
      workflowType: 'content-creator',
      status: 'completed',
      timestamp: new Date().toISOString()
    };

    const result = await service.sendCallback(payload, {
      enabled: true,
      url: 'http://localhost:3000/callback',
      retryCount: 3,
      retryDelay: 1  // 1秒用于测试
    });

    expect(result).toBe(true);

    // 等待异步队列处理完成
    await new Promise(resolve => setTimeout(resolve, 3500));

    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  it('should handle timeout correctly', async () => {
    const service = new WebhookService();

    vi.mocked(axios.post).mockRejectedValueOnce({
      code: 'ECONNABORTED',
      message: 'timeout of 10000ms exceeded'
    });

    const payload: CallbackPayload = {
      event: 'completed',
      taskId: 'test-timeout',
      workflowType: 'content-creator',
      status: 'completed',
      timestamp: new Date().toISOString()
    };

    const result = await service.sendCallback(payload, {
      enabled: true,
      url: 'http://localhost:3000/callback',
      timeout: 10,
      retryCount: 2,
      retryDelay: 1
    });

    expect(result).toBe(true);

    // 等待重试完成
    await new Promise(resolve => setTimeout(resolve, 2500));

    expect(axios.post).toHaveBeenCalledTimes(2); // 初始调用 + 1次重试
  });
});
```

**任务清单**:
- [ ] 创建 `src/infrastructure/callback/` 目录
- [ ] 实现 `WebhookService` 类
- [ ] 实现内存队列机制
- [ ] 实现重试逻辑（指数退避）
- [ ] 添加详细日志记录
- [ ] 编写单元测试
- [ ] 运行测试确保通过

**验收标准**:
- [ ] 单元测试覆盖率 > 90%
- [ ] 所有测试用例通过
- [ ] 日志输出清晰完整

---

### 步骤 1.2：集成到执行器

**文件清单**:
- `src/application/workflow/SyncExecutor.ts` (修改)
- `src/domain/workflow/WorkflowParams.ts` (修改)

**1. 修改 WorkflowParams 接口**:

```typescript
// src/domain/workflow/WorkflowParams.ts

export interface WorkflowParams {
  // ... 现有字段 ...

  // ✅ 新增：Webhook 相关参数
  callbackUrl?: string;           // 回调 URL
  callbackEnabled?: boolean;      // 是否启用回调
  callbackEvents?: string[];      // 触发回调的事件列表
}
```

**2. 修改 SyncExecutor 类**:

```typescript
// src/application/workflow/SyncExecutor.ts

import { WebhookService, CallbackPayload } from '../../infrastructure/callback/WebhookService.js';
import { createLogger } from '../../logging/logger.js';

const logger = createLogger('SyncExecutor');

export class SyncExecutor {
  private webhookService: WebhookService;

  constructor(config: ExecutorConfig) {
    // ... 现有代码 ...
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
        taskId: params.taskId || '',
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
    const callbackUrl = params.callbackUrl;
    const enabled = params.callbackEnabled ?? true;  // 默认启用

    if (!enabled || !callbackUrl) {
      logger.debug('Webhook notification skipped', {
        enabled,
        hasCallbackUrl: !!callbackUrl
      });
      return;
    }

    // 检查是否应该发送此事件
    const events = params.callbackEvents || ['completed', 'failed'];
    if (!events.includes(result.status)) {
      logger.debug('Event not in callback events list', {
        event: result.status,
        allowedEvents: events
      });
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
        requirements: params.requirements,
        targetAudience: params.targetAudience
      }
    };

    if (result.status === 'completed') {
      payload.result = {
        content: result.finalState?.content,
        htmlContent: result.finalState?.htmlContent,
        images: result.finalState?.images,
        qualityScore: result.finalState?.qualityScore,
        wordCount: result.finalState?.wordCount,
        metrics: result.finalState?.metrics
      };
    } else if (result.status === 'failed') {
      payload.error = {
        message: result.error || 'Unknown error',
        type: 'execution_error',
        details: result.errorDetails
      };
    }

    try {
      await this.webhookService.sendCallback(payload, {
        enabled: true,
        url: callbackUrl,
        timeout: 10,
        retryCount: 3,
        retryDelay: 5
      });

      logger.info('Webhook notification queued', {
        taskId: result.taskId,
        event: result.status,
        callbackUrl
      });
    } catch (error) {
      // Webhook 发送失败不应该影响任务执行结果
      logger.error('Failed to queue webhook notification', {
        taskId: result.taskId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}
```

**任务清单**:
- [ ] 在 `WorkflowParams` 中添加回调参数
- [ ] 在 `SyncExecutor` 中注入 `WebhookService`
- [ ] 实现成功回调逻辑
- [ ] 实现失败回调逻辑
- [ ] 添加事件过滤机制
- [ ] 添加错误处理（webhook 失败不影响任务）
- [ ] 添加详细日志

**验收标准**:
- [ ] 任务成功时发送 completed 事件
- [ ] 任务失败时发送 failed 事件
- [ ] Webhook 失败不影响任务执行
- [ ] 日志记录完整

---

### 步骤 1.3：扩展 CLI 参数

**文件清单**:
- `src/presentation/cli/commands/create.ts` (修改)
- `src/presentation/cli/commands/async.ts` (如果存在)

**修改 create 命令**:

```typescript
// src/presentation/cli/commands/create.ts

import { Command } from 'commander';

export const createCommand = new Command('create')
  .description('创建并执行工作流任务')
  .option('--topic <topic>', '文章主题')
  .option('--requirements <requirements>', '创作要求')
  // ... 现有选项 ...
  .option('--mode <mode>', '执行模式 (sync|async)', 'sync')
  // ✅ 新增：Webhook 回调选项
  .option('--callback-url <url>', 'Webhook 回调URL（异步模式有效）')
  .option('--callback-events <events>', '触发回调的事件（逗号分隔，默认：completed,failed）')
  .action(async (options, cmd: any) => {
    try {
      // ... 现有映射代码 ...

      // ✅ 新增：处理回调参数
      const callbackUrl = options.callbackUrl;
      const callbackEvents = options.callbackEvents
        ? options.callbackEvents.split(',').map((e: string) => e.trim())
        : undefined;

      const params = {
        ...mappedParams,
        // ✅ 新增：传递回调参数
        callbackUrl,
        callbackEnabled: !!callbackUrl,
        callbackEvents
      };

      // 执行工作流
      const executor = cmd.executor;
      const result = await executor.execute(params);

      // ... 现有输出代码 ...

    } catch (error) {
      console.error('执行失败:', error);
      process.exit(1);
    }
  });
```

**更新帮助文档**:

```bash
# 使用示例
content-creator create \
  --topic "2025年汽车智能化技术发展" \
  --requirements "写一篇1500字的专业分析文章" \
  --mode async \
  --callback-url "http://content-hub:18010/api/v1/content/callback" \
  --callback-events "completed,failed"
```

**任务清单**:
- [ ] 添加 `--callback-url` 选项
- [ ] 添加 `--callback-events` 选项
- [ ] 解析事件列表（逗号分隔）
- [ ] 更新命令帮助文档
- [ ] 添加使用示例

**验收标准**:
- [ ] CLI 正确解析回调参数
- [ ] 参数正确传递到执行器
- [ ] 帮助文档清晰完整
- [ ] 使用示例可运行

---

## 阶段 2：测试和文档

### 步骤 2.1：编写集成测试

**文件清单**:
- `tests/integration/test_webhook_callback.ts` (新建)
- `tests/fixtures/callback-server.ts` (新建)

**1. 创建测试 Webhook 服务器**:

```typescript
// tests/fixtures/callback-server.ts

import express from 'express';
import { writeFileSync } from 'fs';
import { join } from 'path';

const app = express();
app.use(express.json());

const callbacks: any[] = [];

app.post('/callback', (req, res) => {
  const callbackData = {
    ...req.body,
    receivedAt: new Date().toISOString()
  };

  callbacks.push(callbackData);

  // 记录到文件
  writeFileSync(
    join(process.cwd(), 'test-webhook-callbacks.json'),
    JSON.stringify(callbacks, null, 2)
  );

  res.json({ success: true });
});

app.listen(3000, () => {
  console.log('Test webhook server listening on port 3000');
});
```

**2. 集成测试**:

```typescript
// tests/integration/test_webhook_callback.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';
import axios from 'axios';

describe('Webhook Integration Test', () => {
  let callbackServer: any;
  let creatorProcess: any;

  beforeAll(async () => {
    // 启动测试 Webhook 服务器
    callbackServer = spawn('node', ['tests/fixtures/callback-server.ts'], {
      stdio: 'pipe',
      cwd: process.cwd()
    });

    // 等待服务器启动
    await setTimeout(2000);
  });

  afterAll(() => {
    if (callbackServer) {
      callbackServer.kill();
    }
    if (creatorProcess) {
      creatorProcess.kill();
    }
  });

  it('should send webhook callback on task completion', async () => {
    // 创建带回调的任务
    creatorProcess = spawn('node', ['dist/cli.js', 'create'], {
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'test'
      }
    });

    // 模拟输入
    creatorProcess.stdin.write('--topic "Webhook测试"\n');
    creatorProcess.stdin.write('--requirements "测试回调功能"\n');
    creatorProcess.stdin.write('--mode async\n');
    creatorProcess.stdin.write(`--callback-url "http://localhost:3000/callback"\n`);
    creatorProcess.stdin.end();

    // 等待任务完成（最多3分钟）
    await setTimeout(180000);

    // 验证回调被接收
    try {
      const response = await axios.get('http://localhost:3000/callbacks');
      expect(response.data.callbacks.length).toBeGreaterThan(0);

      const lastCallback = response.data.callbacks[response.data.callbacks.length - 1];
      expect(lastCallback.event).toBe('completed');
      expect(lastCallback.taskId).toBeDefined();
      expect(lastCallback.result).toBeDefined();
    } catch (error) {
      throw new Error('Failed to verify webhook callback');
    }
  }, 200000);

  it('should send failed event when task fails', async () => {
    // 创建一个会失败的任务
    creatorProcess = spawn('node', ['dist/cli.js', 'create'], {
      stdio: 'pipe'
    });

    // 模拟无效输入导致失败
    creatorProcess.stdin.write('--topic ""\n');  // 空主题会导致失败
    creatorProcess.stdin.write('--mode async\n');
    creatorProcess.stdin.write(`--callback-url "http://localhost:3000/callback"\n`);
    creatorProcess.stdin.end();

    await setTimeout(10000);

    // 验证失败回调
    const { readFileSync } = await import('fs');
    const callbackData = JSON.parse(
      readFileSync('test-webhook-callbacks.json', 'utf-8')
    );

    const failedCallback = callbackData.find((c: any) => c.event === 'failed');
    expect(failedCallback).toBeDefined();
    expect(failedCallback.error).toBeDefined();
  }, 30000);
});
```

**任务清单**:
- [ ] 创建测试 webhook 服务器
- [ ] 编写成功回调测试
- [ ] 编写失败回调测试
- [ ] 编写重试机制测试
- [ ] 编写超时处理测试
- [ ] 所有测试通过

**验收标准**:
- [ ] 集成测试覆盖率 > 80%
- [ ] 所有测试用例通过
- [ ] 测试文档清晰

---

### 步骤 2.2：更新文档

**文件清单**:
- `docs/guides/webhook-guide.md` (新建)
- `README.md` (更新)
- `CHANGELOG.md` (更新)

**1. 创建 Webhook 使用指南**:

```markdown
# Webhook 回调功能使用指南

## 概述

content-creator 支持 Webhook 回调功能，当任务完成或失败时主动通知外部系统。

## 快速开始

### 基本用法

\`\`\`bash
content-creator create \
  --topic "文章主题" \
  --requirements "创作要求" \
  --mode async \
  --callback-url "http://your-server.com/callback"
\`\`\`

### 高级配置

\`\`\`bash
content-creator create \
  --topic "文章主题" \
  --requirements "创作要求" \
  --mode async \
  --callback-url "http://your-server.com/callback" \
  --callback-events "completed,failed,progress"
\`\`\`

## 事件类型

### completed 事件

任务成功完成时触发。

\`\`\`json
{
  "event": "completed",
  "taskId": "uuid-xxxx-xxxx",
  "workflowType": "content-creator",
  "status": "completed",
  "timestamp": "2026-02-08T12:00:00Z",
  "metadata": {
    "topic": "文章主题",
    "requirements": "创作要求"
  },
  "result": {
    "content": "文章内容...",
    "images": ["path/to/image.jpg"],
    "qualityScore": 8.5
  }
}
\`\`\`

### failed 事件

任务失败时触发。

\`\`\`json
{
  "event": "failed",
  "taskId": "uuid-xxxx-xxxx",
  "status": "failed",
  "timestamp": "2026-02-08T12:00:00Z",
  "error": {
    "message": "错误信息",
    "type": "error_type"
  }
}
\`\`\`

## 配置选项

### 环境变量

\`\`\`bash
# .env
CALLBACK_ENABLED=true
CALLBACK_TIMEOUT=10
CALLBACK_RETRY_COUNT=3
CALLBACK_RETRY_DELAY=5
\`\`\`

### CLI 参数

\`\`\`bash
--callback-url <url>          # 回调 URL
--callback-events <events>    # 事件列表（逗号分隔）
\`\`\`

## 接收回调

### Node.js 示例

\`\`\`javascript
const express = require('express');
const app = express();

app.use(express.json());

app.post('/callback', (req, res) => {
  const { event, taskId, result, error } = req.body;

  if (event === 'completed') {
    console.log(\`Task \${taskId} completed\`);
    // 处理结果
  } else if (event === 'failed') {
    console.error(\`Task \${taskId} failed: \${error.message}\`);
    // 处理错误
  }

  res.json({ success: true });
});

app.listen(3000);
\`\`\`

### Python 示例

\`\`\`python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.post('/callback')
def handle_callback():
    data = request.get_json()

    if data['event'] == 'completed':
        print(f"Task {data['taskId']} completed")
        # 处理结果
    elif data['event'] == 'failed':
        print(f"Task {data['taskId']} failed: {data['error']['message']}")
        # 处理错误

    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(port=3000)
\`\`\`

## 最佳实践

1. **快速响应**: 回调端点应在 2 秒内返回响应
2. **幂等性**: 同一事件可能被多次发送，确保处理幂等
3. **错误处理**: 即使处理失败，也应返回 200/202 状态码
4. **验证签名**: 生产环境建议验证回调签名（待实现）
5. **异步处理**: 将回调数据放入队列异步处理

## 故障排查

### 回调未收到

1. 检查回调 URL 是否可访问
2. 查看日志确认回调是否发送
3. 检查网络连接和防火墙设置
4. 验证回调端点是否正常工作

### 回调延迟

- 回调采用异步发送，可能有几秒延迟
- 检查网络状况
- 查看重试日志

## 常见问题

**Q: 回调失败会重试吗？**

A: 是的，默认重试 3 次，每次间隔 5 秒。

**Q: 如何只接收特定事件？**

A: 使用 `--callback-events` 参数指定，例如：`--callback-events "completed"`。

**Q: 回调失败会影响任务执行吗？**

A: 不会，回调失败不会影响任务本身的结果。
```

**2. 更新 README.md**:

在 README.md 中添加 Webhook 功能介绍：

```markdown
## 功能特性

- ✅ 支持同步和异步模式
- ✅ Webhook 回调通知
- ✅ 自动重试机制
- ✅ ...
```

**3. 更新 CHANGELOG.md**:

```markdown
## [Unreleased]

### Added
- Webhook 回调功能，支持任务完成时主动通知外部系统
- CLI 参数 `--callback-url` 和 `--callback-events`
- `WebhookService` 服务，支持重试和队列机制

### Changed
- `WorkflowParams` 接口新增回调相关参数
- `SyncExecutor` 集成 Webhook 通知

### Fixed
- Webhook 失败不影响任务执行
```

**任务清单**:
- [ ] 创建 Webhook 使用指南
- [ ] 更新 README.md
- [ ] 更新 CHANGELOG.md
- [ ] 添加代码示例
- [ ] 添加故障排查指南

**验收标准**:
- [ ] 文档清晰完整
- [ ] 包含多个语言示例
- [ ] 包含故障排查指南
- [ ] CHANGELOG 记录完整

---

## 测试计划

### 单元测试

```bash
# 运行 Webhook 服务单元测试
npm test -- WebhookService.test.ts

# 预期结果
# ✓ should send callback on task completion
# ✓ should skip webhook when disabled
# ✓ should retry on failure
# ✓ should handle timeout correctly
```

### 集成测试

```bash
# 运行 Webhook 集成测试
npm test -- test_webhook_callback.ts

# 预期结果
# ✓ should send webhook callback on task completion
# ✓ should send failed event when task fails
```

### 手动测试

1. **启动测试服务器**:
   ```bash
   node tests/fixtures/callback-server.ts
   ```

2. **创建带回调的任务**:
   ```bash
   content-creator create \
     --topic "测试文章" \
     --requirements "测试webhook回调" \
     --mode async \
     --callback-url "http://localhost:3000/callback"
   ```

3. **验证回调**:
   - 查看测试服务器日志
   - 检查 `test-webhook-callbacks.json` 文件
   - 确认收到 `completed` 事件

---

## 部署清单

### 环境变量配置

```bash
# 生产环境 .env
CALLBACK_ENABLED=true
CALLBACK_TIMEOUT=10
CALLBACK_RETRY_COUNT=3
CALLBACK_RETRY_DELAY=5
```

### 依赖检查

```bash
# 确保 axios 已安装
npm list axios

# 如果未安装
npm install axios
```

### 构建和测试

```bash
# 1. 构建项目
npm run build

# 2. 运行所有测试
npm test

# 3. 本地验证
content-creator create \
  --topic "验证测试" \
  --mode async \
  --callback-url "http://your-server/callback"
```

---

## 回滚策略

如果发现问题需要回滚：

1. **禁用 Webhook 功能**:
   ```bash
   # 设置环境变量
   CALLBACK_ENABLED=false
   ```

2. **从 CLI 中移除参数**:
   ```bash
   # 不使用 --callback-url 参数即可
   content-creator create --topic "xxx" --mode async
   ```

3. **代码回滚**:
   ```bash
   # Git 回滚
   git revert <commit-hash>
   npm run build
   ```

---

## 验收标准总结

### 功能验收

- [ ] CLI 支持 `--callback-url` 参数
- [ ] 支持 `--callback-events` 参数（事件过滤）
- [ ] 回调失败自动重试（3次）
- [ ] 回调超时控制（10秒）
- [ ] 支持禁用回调（默认启用）
- [ ] 支持异步队列（不阻塞任务）

### 性能验收

- [ ] 回调发送延迟 < 2秒
- [ ] 回调成功率 > 95%
- [ ] 不影响任务执行性能
- [ ] 失败回调不阻塞任务完成

### 测试验收

- [ ] 单元测试覆盖率 > 90%
- [ ] 集成测试通过率 100%
- [ ] 回调重试功能正常
- [ ] 高并发下回调稳定

### 文档验收

- [ ] 使用指南清晰完整
- [ ] 包含多种语言示例
- [ ] 故障排查指南完善
- [ ] CHANGELOG 记录完整

---

## 时间估算

| 阶段 | 步骤 | 预计时间 |
|------|------|---------|
| 阶段 1 | 步骤 1.1: 创建 Webhook 服务 | 4-5 小时 |
| 阶段 1 | 步骤 1.2: 集成到执行器 | 2-3 小时 |
| 阶段 1 | 步骤 1.3: 扩展 CLI 参数 | 2 小时 |
| 阶段 2 | 步骤 2.1: 编写测试 | 3-4 小时 |
| 阶段 2 | 步骤 2.2: 更新文档 | 2 小时 |
| **总计** | | **13-16 小时** (约 2 天) |

---

## 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 回调端点不可用 | 中 | 低 | 重试机制 + 轮询兜底 |
| 回调延迟 | 低 | 中 | 异步队列 + 日志监控 |
| 网络超时 | 中 | 中 | 超时控制 + 重试 |
| 向后兼容性 | 低 | 低 | 默认禁用 + 可选参数 |

**整体风险等级**: 低

---

## 后续优化建议

1. **签名验证**: 添加 HMAC 签名验证回调真实性
2. **持久化队列**: 使用 BullMQ 替代内存队列
3. **回调监控**: 添加回调成功率监控
4. **批量回调**: 支持批量发送多个回调
5. **自定义 Headers**: 支持添加自定义 HTTP 头

---

**文档版本**: v1.0
**创建日期**: 2026-02-08
**最后更新**: 2026-02-08
