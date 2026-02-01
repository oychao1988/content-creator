# Debug 模式流式输出修复总结

## 问题描述

用户反馈："为什么在节点中 debug 模式没有流式输出打印生成的内容？"

## 根本原因

所有节点（WriteNode、OrganizeNode、CheckTextNode、CheckImageNode、GenerateImageNode）在调用 `llmService.chat()` 时都**只传递了 `stream: true`**，但没有传递 `enableStreamDisplay: true`。

虽然 LLM 服务已经实现了 `enableStreamDisplay` 功能，但节点没有使用这个参数，导致在 debug 模式下看不到实时流式输出。

## 解决方案

采用**自动检测并启用**的方案，在 LLM 服务层自动检测 debug 日志级别，当 `LOG_LEVEL=debug` 且 `stream=true` 时，自动启用 `enableStreamDisplay`。

### 修改的文件

#### 1. `src/services/llm/EnhancedLLMService.ts`

**修改位置**：`chatRequest` 方法（第 227-243 行）

**添加的代码**：
```typescript
const useStream = request.stream || false;

// 在 debug 模式下自动启用流式显示
const shouldEnableStreamDisplay = config.logging.level === 'debug';
if (shouldEnableStreamDisplay && useStream && !request.enableStreamDisplay) {
  request.enableStreamDisplay = true;
  logger.debug('Auto-enabled stream display for debug mode');
}
```

**同时添加了 config 导入**：
```typescript
import { config } from '../../config/index.js';
```

#### 2. `src/services/llm/ClaudeCLIService.ts`

**修改位置**：`chat` 方法（第 72-87 行）

**添加的代码**：
```typescript
logger.debug('Starting Claude CLI chat request', {
  model: request.model || this.config.defaultModel,
  messagesCount: request.messages.length,
  stream: request.stream || false,
});

// 在 debug 模式下自动启用流式显示
const shouldEnableStreamDisplay = config.logging.level === 'debug';
if (shouldEnableStreamDisplay && request.stream && !request.enableStreamDisplay) {
  request.enableStreamDisplay = true;
  logger.debug('Auto-enabled stream display for debug mode');
}
```

**同时添加了 config 导入**：
```typescript
import { config } from '../../config/index.js';
```

## 工作原理

### 流程图

```
用户执行节点
  ↓
节点调用 llmService.chat({ stream: true })
  ↓
LLM 服务检查 config.logging.level === 'debug'
  ↓
如果是 debug 模式，自动设置 request.enableStreamDisplay = true
  ↓
流式输出实时显示到终端
```

### 条件判断

只有当**同时满足**以下条件时，才会自动启用流式显示：

1. `LOG_LEVEL=debug`（在 `.env` 中设置）
2. `request.stream = true`（节点传递的参数）
3. `request.enableStreamDisplay` 未被显式设置

## 使用示例

### 自动启用（推荐）

在 `.env` 中设置：
```bash
LOG_LEVEL=debug
```

然后正常运行任何节点，流式输出会自动显示：
```bash
pnpm cli create --topic "测试"
```

### 手动控制

如果想在非 debug 模式下也启用流式显示，可以在调用时显式传递参数：
```typescript
const result = await this.llmService.chat({
  messages: [...],
  stream: true,
  enableStreamDisplay: true,  // 显式启用
});
```

## 测试验证

### 测试命令
```bash
LOG_LEVEL=debug npx tsx scripts/test-llm.ts "简单测试" --type api --stream
```

### 测试结果

**预期行为**：
- ✅ 流式内容实时显示到终端
- ✅ Debug 日志正常输出
- ✅ 内容不会被截断
- ✅ 统计信息正常显示

**实际输出**：
```
💬 回复:
你好！看起来你发送了"简单测试"来确认我是否正常工作。😊

我确实在正常运行中，可以为你提供各种帮助：
...
```

## 优势

1. **无侵入性**：不需要修改任何节点代码
2. **统一管理**：通过 `LOG_LEVEL` 环境变量统一控制
3. **自动检测**：LLM 服务自动检测并启用
4. **向后兼容**：不影响现有代码和默认行为
5. **灵活性**：仍可手动控制每个请求

## 相关文件

### 修改的文件
- `src/services/llm/EnhancedLLMService.ts` - API 服务自动启用流式显示
- `src/services/llm/ClaudeCLIService.ts` - CLI 服务自动启用流式显示

### 节点文件（无需修改）
以下节点现在自动支持 debug 模式流式输出：
- `src/domain/workflow/nodes/WriteNode.ts`
- `src/domain/workflow/nodes/OrganizeNode.ts`
- `src/domain/workflow/nodes/CheckTextNode.ts`
- `src/domain/workflow/nodes/CheckImageNode.ts`
- `src/domain/workflow/nodes/GenerateImageNode.ts`

## 配置参考

### .env 配置
```bash
# 日志配置
LOG_LEVEL=debug  # 开启 debug 模式以启用流式输出

# LLM 服务配置
LLM_SERVICE_TYPE=api
LLM_MODEL_NAME=deepseek-chat
LLM_MAX_TOKENS=4000
```

## 总结

✅ **问题已解决**：在 `LOG_LEVEL=debug` 时，所有节点的流式输出会自动实时显示到终端，无需修改任何节点代码！

**建议**：
- 开发调试时设置 `LOG_LEVEL=debug`
- 生产环境保持 `LOG_LEVEL=info`（不显示实时输出）
- 如需临时查看某个请求的实时输出，可传递 `enableStreamDisplay: true`
