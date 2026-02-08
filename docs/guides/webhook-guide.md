# Webhook 回调使用指南

本指南介绍如何使用 content-creator 的 Webhook 回调功能，实现任务完成时的实时通知。

---

## 📖 目录

- [快速开始](#快速开始)
- [事件类型](#事件类型)
- [配置选项](#配置选项)
- [回调 Payload 格式](#回调-payload-格式)
- [接收回调示例](#接收回调示例)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)
- [常见问题](#常见问题)

---

## 🚀 快速开始

### CLI 使用示例

```bash
content-creator create \
  --topic "AI 技术的发展" \
  --requirements "写一篇关于 AI 技术发展趋势的文章" \
  --target-audience "技术爱好者" \
  --mode async \
  --callback-url "http://your-server.com/api/callback" \
  --callback-events "completed,failed"
```

### Node.js 代码示例

```typescript
import { createSyncExecutor } from 'llm-content-creator/executor';
import { createTaskRepository } from 'llm-content-creator/database';

const executor = createSyncExecutor(createTaskRepository());

const result = await executor.execute({
  mode: 'sync',
  topic: 'AI 技术的发展',
  requirements: '写一篇关于 AI 技术发展趋势的文章',
  targetAudience: '技术爱好者',
  callbackUrl: 'http://your-server.com/api/callback',
  callbackEnabled: true,
  callbackEvents: ['completed', 'failed'],
});
```

### 参数说明

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `callbackUrl` | string | 是 | - | 接收回调的 URL |
| `callbackEnabled` | boolean | 否 | `true` | 是否启用回调 |
| `callbackEvents` | string[] | 否 | `['completed', 'failed']` | 触发回调的事件列表 |

---

## 📋 事件类型

content-creator 支持以下事件类型：

| 事件 | 触发时机 | Payload 内容 |
|------|----------|--------------|
| `completed` | 任务成功完成 | 包含完整的结果数据（content, images, metrics） |
| `failed` | 任务失败 | 包含错误信息（message, type, details） |
| `submitted` | 任务提交到队列 | taskId, status, submittedAt |
| `started` | 任务开始执行 | taskId, status, startedAt |
| `progress` | 任务进度更新 | taskId, currentStep, percentage |
| `cancelled` | 任务被取消 | taskId, status, cancelledAt |

**注意**：默认仅回调 `completed` 和 `failed` 事件。其他事件需要手动配置。

### 事件过滤示例

```bash
# 仅在成功完成时回调
content-creator create \
  --topic "AI 技术" \
  --callback-url "http://your-server.com/callback" \
  --callback-events "completed"

# 在成功和失败时都回调
content-creator create \
  --topic "AI 技术" \
  --callback-url "http://your-server.com/callback" \
  --callback-events "completed,failed"

# 回调所有事件
content-creator create \
  --topic "AI 技术" \
  --callback-url "http://your-server.com/callback" \
  --callback-events "submitted,started,progress,completed,failed,cancelled"
```

---

## ⚙️ 配置选项

### 环境变量配置

可以在 `.env` 文件中配置全局 Webhook 设置：

```bash
# Webhook 配置
CALLBACK_ENABLED=true                    # 是否启用回调（默认：true）
CALLBACK_TIMEOUT=10                     # 回调超时时间（秒，默认：10）
CALLBACK_RETRY_COUNT=3                  # 失败重试次数（默认：3）
CALLBACK_RETRY_DELAY=5                  # 重试延迟（秒，默认：5）
```

### CLI 参数优先级

CLI 参数优先级高于环境变量。例如：

```bash
# 即使 CALLBACK_ENABLED=false，CLI 参数仍会启用回调
content-creator create \
  --topic "AI 技术" \
  --callback-url "http://your-server.com/callback" \
  --callback-events "completed"
```

### 重试机制

当回调失败时，content-creator 会自动重试：

- **默认重试次数**：3 次
- **重试间隔**：5 秒
- **超时时间**：10 秒

可以通过环境变量调整这些参数。

---

## 📦 回调 Payload 格式

### Completed 事件

```json
{
  "event": "completed",
  "taskId": "uuid-xxxx-xxxx",
  "workflowType": "content-creator",
  "status": "completed",
  "timestamp": "2026-02-08T12:00:00Z",
  "metadata": {
    "topic": "AI 技术的发展",
    "requirements": "写一篇关于 AI 技术发展趋势的文章",
    "targetAudience": "技术爱好者",
    "tone": "专业",
    "keywords": ["AI", "技术", "趋势"]
  },
  "result": {
    "content": "# AI 技术的发展\n\n文章内容...",
    "htmlContent": "<h1>AI 技术的发展</h1><p>文章内容...</p>",
    "images": [
      {
        "url": "https://example.com/image-1.png",
        "localPath": "data/images/uuid-1_1234567890.png",
        "prompt": "微观视角的CPU芯片，蓝色电子流在晶圆上交替闪烁",
        "width": 1920,
        "height": 1920,
        "format": "png"
      }
    ],
    "qualityScore": 8.5,
    "wordCount": 1500,
    "metrics": {
      "duration": 25991,
      "tokensUsed": 1500,
      "cost": 0.05,
      "stepsCompleted": ["search", "organize", "write", "check_text", "generate_image", "check_image", "post_process"]
    }
  }
}
```

### Failed 事件

```json
{
  "event": "failed",
  "taskId": "uuid-xxxx-xxxx",
  "workflowType": "content-creator",
  "status": "failed",
  "timestamp": "2026-02-08T12:00:00Z",
  "metadata": {
    "topic": "AI 技术",
    "requirements": "写一篇文章",
    "targetAudience": "技术爱好者"
  },
  "error": {
    "type": "ValidationError",
    "message": "Invalid parameters for workflow \"content-creator\"",
    "details": {
      "field": "topic",
      "reason": "Invalid topic",
      "step": "validation"
    }
  }
}
```

### Payload 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `event` | string | 事件类型（completed, failed 等） |
| `taskId` | string | 任务唯一标识符 |
| `workflowType` | string | 工作流类型（content-creator, translation） |
| `status` | string | 任务状态（completed, failed） |
| `timestamp` | string | ISO 8601 格式的时间戳 |
| `metadata` | object | 任务元数据（topic, requirements 等） |
| `result` | object | 任务结果（仅 completed 事件） |
| `error` | object | 错误信息（仅 failed 事件） |

---

## 💻 接收回调示例

### Node.js (Express)

```javascript
const express = require('express');
const app = express();

app.use(express.json());

// 接收 Webhook 回调
app.post('/api/callback', (req, res) => {
  const { event, taskId, status, result, error } = req.body;

  console.log(`收到回调：${event} - 任务 ${taskId} - 状态 ${status}`);

  if (event === 'completed') {
    // 处理成功回调
    console.log('内容生成成功：', result.content);
    console.log('质量评分：', result.qualityScore);

    // 保存到数据库
    saveToDatabase(taskId, result);
  } else if (event === 'failed') {
    // 处理失败回调
    console.error('任务失败：', error.message);

    // 发送告警
    sendAlert(taskId, error);
  }

  // 返回成功响应
  res.status(200).json({ success: true });
});

app.listen(3000, () => {
  console.log('回调服务器运行在 http://localhost:3000');
});
```

### Python (Flask)

```python
from flask import Flask, request, jsonify
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

@app.route('/api/callback', methods=['POST'])
def handle_callback():
    data = request.get_json()
    event = data.get('event')
    task_id = data.get('taskId')
    status = data.get('status')

    logging.info(f"收到回调：{event} - 任务 {task_id} - 状态 {status}")

    if event == 'completed':
        # 处理成功回调
        result = data.get('result', {})
        content = result.get('content')
        quality_score = result.get('qualityScore')

        logging.info(f"内容生成成功，质量评分：{quality_score}")
        logging.info(f"内容预览：{content[:100]}...")

        # 保存到数据库
        save_to_database(task_id, result)

    elif event == 'failed':
        # 处理失败回调
        error = data.get('error', {})
        error_message = error.get('message')

        logging.error(f"任务失败：{error_message}")

        # 发送告警
        send_alert(task_id, error)

    # 返回成功响应
    return jsonify({"success": True}), 200

if __name__ == '__main__':
    app.run(port=3000)
```

### Go (Gin)

```go
package main

import (
    "encoding/json"
    "log"
    "net/http"

    "github.com/gin-gonic/gin"
)

type CallbackPayload struct {
    Event        string                 `json:"event"`
    TaskID       string                 `json:"taskId"`
    WorkflowType string                 `json:"workflowType"`
    Status       string                 `json:"status"`
    Timestamp    string                 `json:"timestamp"`
    Metadata     map[string]interface{} `json:"metadata"`
    Result       map[string]interface{} `json:"result,omitempty"`
    Error        map[string]interface{} `json:"error,omitempty"`
}

func handleCallback(c *gin.Context) {
    var payload CallbackPayload
    if err := c.BindJSON(&payload); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }

    log.Printf("收到回调：%s - 任务 %s - 状态 %s",
        payload.Event, payload.TaskID, payload.Status)

    if payload.Event == "completed" {
        // 处理成功回调
        content := payload.Result["content"].(string)
        qualityScore := payload.Result["qualityScore"].(float64)

        log.Printf("内容生成成功，质量评分：%.1f", qualityScore)
        log.Printf("内容预览：%.100s...", content)

        // 保存到数据库
        saveToDatabase(payload.TaskID, payload.Result)

    } else if payload.Event == "failed" {
        // 处理失败回调
        errorMessage := payload.Error["message"].(string)

        log.Printf("任务失败：%s", errorMessage)

        // 发送告警
        sendAlert(payload.TaskID, payload.Error)
    }

    // 返回成功响应
    c.JSON(http.StatusOK, gin.H{"success": true})
}

func main() {
    r := gin.Default()
    r.POST("/api/callback", handleCallback)
    r.Run(":3000")
}
```

---

## 🎯 最佳实践

### 1. 验证回调签名（推荐）

在生产环境中，建议验证回调签名以确保请求来自 content-creator：

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  const digest = hmac.digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(digest)
  );
}

app.post('/api/callback', (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const payload = req.body;

  if (!verifySignature(payload, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // 处理回调...
});
```

### 2. 异步处理回调

回调处理应该快速返回，避免阻塞 content-creator：

```javascript
app.post('/api/callback', async (req, res) => {
  const { taskId, result } = req.body;

  // 立即返回成功响应
  res.status(200).json({ success: true });

  // 异步处理回调
  setImmediate(async () => {
    try {
      await saveToDatabase(taskId, result);
      await notifyUsers(taskId);
    } catch (error) {
      console.error('处理回调失败：', error);
    }
  });
});
```

### 3. 幂等性处理

确保回调处理是幂等的，避免重复处理：

```javascript
const processedCallbacks = new Set();

app.post('/api/callback', (req, res) => {
  const { taskId, event } = req.body;

  // 检查是否已处理
  const key = `${taskId}-${event}`;
  if (processedCallbacks.has(key)) {
    console.log(`回调 ${key} 已处理，跳过`);
    return res.status(200).json({ success: true, message: 'Already processed' });
  }

  // 标记为已处理
  processedCallbacks.add(key);

  // 处理回调...
});
```

### 4. 错误处理和重试

实现健壮的错误处理和重试机制：

```javascript
app.post('/api/callback', async (req, res) => {
  try {
    await processCallback(req.body);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('处理回调失败：', error);

    // 如果是临时错误，返回 5xx 让 content-creator 重试
    if (isTemporaryError(error)) {
      res.status(503).json({ error: 'Temporary error' });
    } else {
      // 永久错误，返回成功避免重试
      res.status(200).json({ success: true, message: 'Logged but not processed' });
    }
  }
});
```

### 5. 监控和日志

记录所有回调以便调试和监控：

```javascript
app.post('/api/callback', (req, res) => {
  const startTime = Date.now();

  // 记录回调
  logCallback({
    timestamp: new Date().toISOString(),
    headers: req.headers,
    body: req.body,
  });

  // 处理回调...

  const duration = Date.now() - startTime;
  console.log(`回调处理耗时：${duration}ms`);
});
```

---

## 🔧 故障排查

### 问题 1：未收到回调

**可能原因**：
1. 回调 URL 无法访问
2. 防火墙阻止了请求
3. 回调服务器返回非 2xx 状态码

**解决方案**：
```bash
# 测试回调 URL 是否可访问
curl -X POST http://your-server.com/api/callback \
  -H "Content-Type: application/json" \
  -d '{"event":"test","taskId":"test-123"}'

# 检查防火墙设置
# 确保 3000 端口开放（或你使用的端口）

# 检查回调服务器日志
tail -f /var/log/callback-server.log
```

### 问题 2：回调延迟

**可能原因**：
1. 网络延迟
2. 回调服务器处理慢
3. content-creator 队列拥堵

**解决方案**：
- 使用异步处理回调
- 检查回调服务器性能
- 监控 content-creator 队列状态

### 问题 3：重复收到回调

**可能原因**：
content-creator 重试机制导致

**解决方案**：
实现幂等性处理（见[最佳实践](#3-幂等性处理)）

### 问题 4：回调格式错误

**可能原因**：
Payload 格式不匹配

**解决方案**：
```javascript
// 验证 Payload 格式
function validatePayload(payload) {
  const requiredFields = ['event', 'taskId', 'status', 'timestamp'];
  for (const field of requiredFields) {
    if (!payload[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (payload.event === 'completed' && !payload.result) {
    throw new Error('Missing result field for completed event');
  }

  if (payload.event === 'failed' && !payload.error) {
    throw new Error('Missing error field for failed event');
  }
}
```

---

## ❓ 常见问题

### Q1: Webhook 回调和轮询有什么区别？

**Webhook 回调**：
- ✅ 实时通知（<2 秒延迟）
- ✅ 减少服务器负载
- ✅ 更好的用户体验

**轮询**：
- ❌ 30 秒延迟
- ❌ 频繁查询，增加负载
- ✅ 实现简单

**推荐方案**：Webhook 优先 + 轮询兜底

### Q2: 回调失败会影响任务执行吗？

**不会**。回调失败会自动重试 3 次，但不影响任务执行结果。

### Q3: 如何禁用回调？

有两种方式：

```bash
# 方式 1：不配置 callbackUrl
content-creator create --topic "AI 技术"

# 方式 2：设置 callbackEnabled=false
content-creator create \
  --topic "AI 技术" \
  --callback-url "http://your-server.com/callback" \
  --callback-events "completed" \
  # 但任务执行时设置 callbackEnabled=false
```

### Q4: 支持哪些事件类型？

目前支持：
- `submitted` - 任务提交
- `started` - 任务开始
- `progress` - 进度更新
- `completed` - 任务完成
- `failed` - 任务失败
- `cancelled` - 任务取消

默认仅回调 `completed` 和 `failed`。

### Q5: 回调超时时间是多少？

默认 10 秒。可以通过环境变量 `CALLBACK_TIMEOUT` 调整。

### Q6: 如何测试 Webhook 回调？

使用测试工具：

```bash
# 使用 ngrok 暴露本地服务器
ngrok http 3000

# 或者使用 webhook.site 测试
# 访问 https://webhook.site 获取临时 URL
```

### Q7: 回调会重试吗？

会。默认重试 3 次，每次间隔 5 秒。可以通过环境变量调整：
- `CALLBACK_RETRY_COUNT` - 重试次数
- `CALLBACK_RETRY_DELAY` - 重试间隔

---

## 📚 相关资源

- [Webhook 回调设计文档](../design/webhook-callback-feature.md)
- [Webhook 实施计划](../design/webhook-implementation-plan.md)
- [集成测试报告](../test-results/webhook-integration-test-report.md)

---

## 🆘 获取帮助

如有问题，请：
1. 查看[故障排查](#故障排查)
2. 查看[常见问题](#常见问题)
3. 提交 Issue 到 GitHub
4. 联系技术支持

---

**最后更新**：2026-02-08
