# LLM 服务修复总结

## ✅ 已完成的修复

### 1. API 模式生成问题 ✅

**问题**：使用 `deepseek-v3.2-thinking` 模型时，LLM 会输出大量思考过程，导致 JSON 解析失败。

**修复**：
```bash
# .env
LLM_MODEL_NAME=deepseek-chat  # 从 thinking 改为普通模型
```

**测试结果**：
```
✅ 生成成功!
📄 回复内容: TypeScript 是 JavaScript 的超集，通过添加静态类型系统和编译时类型检查来增强代码的可维护性和开发效率。
📊 统计信息:
   - Token 使用: 36 (输入: 9, 输出: 27)
   - 耗时: 41.95s
   - 成本: $0.000063
```

**工作流测试**：
- ✅ Search 节点：成功（1.9秒）
- ✅ Organize 节点：成功（14.9秒）
- ⚠️ Write 节点：超时重试中（120秒超时）

### 2. Claude CLI 流式输出 ✅

**问题**：CLI 命令参数不正确，无法正确解析流式 JSON 输出。

**修复**：
1. 更新命令参数：
```typescript
const cmd = [
  'claude',
  '-p',                                    // print 模式
  '--output-format', 'stream-json',        // 流式 JSON 输出
  '--include-partial-messages',           // 包含部分消息
  '--model', model,
];
```

2. 重写解析逻辑：
```typescript
// 正确解析流式事件
if (json.type === 'stream_event') {
  if (json.event?.type === 'content_block_delta' && json.event?.delta?.text) {
    fullContent += json.event.delta.text;
  }
}

// 提取统计信息
else if (json.type === 'result') {
  inputTokens = json.usage.input_tokens || 0;
  outputTokens = json.usage.output_tokens || 0;
}
```

**测试结果**：
```bash
claude -p --output-format stream-json --include-partial-messages --model sonnet "1+1=?"
```
输出格式正确，包含：
- `type: "system"` - 系统初始化（跳过）
- `type: "stream_event"` - 流式内容增量
- `type: "assistant"` - 完整消息（备用）
- `type: "result"` - 最终结果和统计信息

## 📝 配置方式

### 切换到 API 服务（默认推荐）

```bash
# .env
LLM_SERVICE_TYPE=api
LLM_MODEL_NAME=deepseek-chat
```

### 切换到 Claude CLI 服务

```bash
# .env
LLM_SERVICE_TYPE=cli
CLAUDE_CLI_ENABLED=true
```

## 🔧 命令行参数

### API 模式测试

```bash
# 快速测试
npx tsx scripts/quick-llm-test.ts

# 完整工作流
npm run cli create -- --topic "测试" --requirements "写一篇文章"
```

### CLI 模式测试

```bash
# 直接测试 Claude CLI
claude -p --output-format stream-json --include-partial-messages --model sonnet "你好"

# 切换到 CLI 模式后测试
# 1. 修改 .env: LLM_SERVICE_TYPE=cli
# 2. npm run cli create -- --topic "测试" --requirements "写一篇文章"
```

## 🎯 当前状态

| 功能 | 状态 | 说明 |
|------|------|------|
| **API 模式** | ✅ 可用 | 使用 deepseek-chat，生成正常 |
| **CLI 模式** | ⚠️ 需认证 | 代码已修复，但需要本地认证 |
| **配置切换** | ✅ 可用 | 通过 .env 平滑切换 |
| **节点注入** | ✅ 完成 | 所有 5 个节点支持服务注入 |

## 🚀 推荐配置

**开发环境**：
```bash
LLM_SERVICE_TYPE=api
LLM_MODEL_NAME=deepseek-chat
```

**生产环境**：
```bash
LLM_SERVICE_TYPE=api
LLM_MODEL_NAME=deepseek-chat
# Redis 用于缓存（可选）
REDIS_URL="redis://localhost:6379"
```

**本地测试（有 Claude CLI）**：
```bash
LLM_SERVICE_TYPE=cli
CLAUDE_CLI_ENABLED=true
```

## 📌 待优化事项

1. **超时配置** - Write 节点超时 120 秒，考虑增加
2. **Redis 依赖** - sync 模式下也会尝试连接 Redis（不强制使用）
3. **CLI 认证** - 需要本地 Claude CLI 认证才能使用 CLI 模式
