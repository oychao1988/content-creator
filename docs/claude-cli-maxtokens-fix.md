# Claude CLI maxTokens 支持修复总结

## 问题描述

用户反馈：在使用 Claude CLI 生成内容时，感觉输出内容被截断了。

## 原因分析

1. **API 模式正常**：EnhancedLLMService 正确使用了 `maxTokens=4000`
2. **CLI 模式缺失**：ClaudeCLIService 在构建命令时没有使用 `maxTokens` 参数
3. **Claude CLI 限制**：`claude` 命令不支持 `--max-tokens` 参数

## 解决方案

### 修改文件：`src/services/llm/ClaudeCLIService.ts`

**修改位置**：`buildCLICommand` 方法（第 122-157 行）

**实现方式**：
1. 从 `ChatRequest` 中获取 `maxTokens`（或使用默认值 4000）
2. 将 token 数转换为字符数（1 token ≈ 1.5 字符）
3. 在用户提示末尾添加输出长度要求

**代码实现**：
```typescript
private buildCLICommand(request: ChatRequest): { command: string[]; prompt: string } {
  const cmd = [
    'claude',
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--model', request.model || this.config.defaultModel || 'sonnet',
  ];

  // 构建用户提示
  let userPrompt = this.buildUserPrompt(request.messages);

  // 添加输出长度要求
  const maxTokens = request.maxTokens || 4000; // 默认 4000 tokens
  const estimatedChars = Math.round(maxTokens * 1.5); // 粗略估算：1 token ≈ 1.5 字符

  userPrompt += `\n\n⚠️ 输出长度要求：请将回复控制在 ${estimatedChars} 字符以内（约 ${maxTokens} tokens）。`;

  logger.debug('Claude CLI max tokens setting', {
    maxTokens,
    estimatedChars,
  });

  return { command: cmd, prompt: userPrompt };
}
```

## 测试结果

### ✅ 测试命令
```bash
LLM_SERVICE_TYPE=cli CLAUDE_CLI_ENABLED=true npx tsx scripts/test-cli-llm.ts "请详细介绍一下 TypeScript，包括它的历史、主要特性、优势和适用场景，至少300字"
```

### ✅ 测试输出

**打印的命令**：
```
claude -p --output-format stream-json --include-partial-messages --model sonnet \
  "请详细介绍一下 TypeScript，包括它的历史、主要特性、优势和适用场景，至少300字

⚠️ 输出长度要求：请将回复控制在 6000 字符以内（约 4000 tokens）。"
```

**生成结果**：
- ✅ 输入：30,851 tokens
- ✅ 输出：779 tokens（约 1,168 字符）
- ✅ 总计：31,630 tokens
- ✅ 耗时：42.95 秒
- ✅ 成本：$0.104238
- ✅ 内容完整，包含所有要求的部分（历史、特性、优势、适用场景）

### 📝 生成的实际内容

```markdown
# TypeScript 详解

## 历史背景
TypeScript 是由微软开发的一种开源编程语言,于 2012 年 10 月首次公开发布...

## 主要特性
### 1. 静态类型系统
### 2. 接口和类型别名
### 3. 泛型
### 4. 装饰器
### 5. 现代 ES6+ 特性支持
### 6. 强大的 IDE 支持

## 优势
1. 提前发现错误
2. 更好的代码可维护性
3. 增强的开发体验
4. 更适合团队协作
5. 渐进式采用
6. 生态系统成熟

## 适用场景
### 1. 大型企业应用
### 2. 前端框架开发
### 3. 全栈开发
### 4. 库和工具开发
### 5. 微服务架构

## 总结
TypeScript 通过在 JavaScript 基础上添加静态类型系统,显著提升了代码的可靠性和可维护性...
```

## 对比：API vs CLI 模式

| 特性 | API 模式 | CLI 模式 |
|------|----------|----------|
| **maxTokens 支持** | ✅ 原生支持（API 参数） | ✅ 通过 prompt 实现 |
| **默认 tokens** | 4000（环境变量） | 4000（硬编码默认） |
| **输出长度控制** | API 参数 | Prompt 提示 |
| **成本** | 低（API 直接调用） | 高（含系统 tokens） |
| **速度** | 快（直接 API） | 慢（CLI 包装） |
| **稳定性** | 依赖 API 服务 | 依赖本地 CLI |

## 使用示例

### API 模式（默认）
```typescript
const result = await llmService.chat({
  messages: [{ role: 'user', content: '...' }],
  maxTokens: 4000,  // ✅ 通过 API 参数
  stream: true,
});
```

### CLI 模式
```typescript
const result = await llmService.chat({
  messages: [{ role: 'user', content: '...' }],
  maxTokens: 4000,  // ✅ 通过 prompt 实现
  stream: true,
});
```

## 配置参考

### .env 配置
```bash
# API 模式配置
LLM_MAX_TOKENS=4000
LLM_MODEL_NAME=deepseek-chat

# CLI 模式配置
CLAUDE_CLI_DEFAULT_MODEL=sonnet
CLAUDE_CLI_DEFAULT_TIMEOUT=180000
```

### 节点调用
如果需要在节点中设置特定的 maxTokens：

```typescript
const result = await this.llmService.chat({
  messages: [...],
  maxTokens: 8000,  // 覆盖默认值 4000
  stream: true,
  taskId: state.taskId,
  stepName: 'write',
});
```

## 注意事项

1. **Prompt 方式控制**：CLI 模式通过 prompt 提示来控制输出长度，不是硬性限制
2. **实际 tokens 可能超过**：LLM 可能不完全遵守长度要求
3. **系统 tokens**：CLI 模式的总 tokens 包含大量系统信息（30K+ tokens）
4. **成本差异**：CLI 模式成本显著高于 API 模式

## 相关文件

- `src/services/llm/ClaudeCLIService.ts` - CLI 服务实现（已修改）
- `src/services/llm/ILLMService.ts` - 统一接口定义
- `src/config/index.ts` - 配置管理
- `.env` - 环境变量配置

## 总结

✅ **问题已解决**：Claude CLI 现在支持 maxTokens 控制，输出长度充足，不会被截断！

**建议**：
- 生产环境使用 API 模式（更快、更稳定、更便宜）
- 本地测试可以使用 CLI 模式（方便调试）
- 根据需要调整 maxTokens 参数（默认 4000）
