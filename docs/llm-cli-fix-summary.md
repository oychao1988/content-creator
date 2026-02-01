# Claude CLI 集成修复总结

## 问题描述

Claude CLI 服务在 `ClaudeCLIService` 中无法正常工作：
- ❌ 总是超时（120秒）
- ❌ 没有接收到任何流式输出
- ❌ 直接执行 `claude` 命令可以正常工作

## 根本原因

通过调试发现，问题出在 Node.js `spawn` 的使用方式上：

1. **缺少 `shell: true` 选项** - 直接 spawn 无法正确执行 claude CLI
2. **错误地传递提示词** - 将提示词作为命令行参数传递，而不是通过 stdin

## 解决方案

### 1. 使用 shell 模式

```typescript
const proc = spawn(command[0], command.slice(1), {
  shell: true,  // 关键修复
  env: { ...process.env, PATH: process.env.PATH }
});
```

### 2. 通过 stdin 传递提示词

```typescript
// 构建命令时不包含提示词
const { command, prompt } = this.buildCLICommand(request);

// 通过 stdin 写入提示词
if (proc.stdin) {
  proc.stdin.write(prompt);
  proc.stdin.end();
}
```

### 3. 添加流式显示支持

```typescript
// 处理流式事件时实时输出
if (json.event?.type === 'content_block_delta' && json.event?.delta?.text) {
  const text = json.event.delta.text;
  fullContent += text;

  // 实时显示
  if (request.enableStreamDisplay && request.stream) {
    process.stdout.write(text);
  }
}
```

## 测试结果

### ✅ 修复前
```
⚠️  10秒内未收到任何数据
stdout 长度: 0
stderr 长度: 0
```

### ✅ 修复后
```
📋 Claude CLI Command:
   claude -p --output-format stream-json --include-partial-messages --model sonnet "你好"

你好！有什么我可以帮助你的吗？
...

✅ 生成成功!

📊 统计信息:
   - Token 使用: 30843 (输入: 30768, 输出: 75)
   - 耗时: 15.51s
   - 成本: $0.093429
```

## 使用方式

### 1. 通过环境变量切换

```bash
# 使用 API 模式（默认）
LLM_SERVICE_TYPE=api pnpm cli create -- --topic "测试"

# 使用 CLI 模式
LLM_SERVICE_TYPE=cli CLAUDE_CLI_ENABLED=true pnpm cli create -- --topic "测试"
```

### 2. 使用专用测试脚本

```bash
# 测试 API 模式
pnpm test:llm:api

# 测试 CLI 模式
pnpm test:llm:cli

# 通用测试（支持参数）
npx tsx scripts/test-llm.ts "你好" --type cli
```

## 新增功能

### 1. 流式实时显示

在 debug 模式下可以看到：
- 完整的 Claude CLI 命令
- 实时流式输出
- 详细的 debug 日志
- Token 使用统计

### 2. 命令打印

```typescript
if (request.enableStreamDisplay) {
  console.log(`\n📋 Claude CLI Command:\n   ${formattedCommand}\n`);
}
```

### 3. 统一的流式接口

API 和 CLI 服务都支持：
```typescript
await llmService.chat({
  messages: [{ role: 'user', content: prompt }],
  stream: true,                      // 启用流式响应
  enableStreamDisplay: true,         // 启用终端实时显示
});
```

## 关键代码变更

### 文件：`src/services/llm/ClaudeCLIService.ts`

**1. `buildCLICommand` 方法**
```typescript
// 修改前：返回 string[]
private buildCLICommand(request: ChatRequest): string[] {
  const cmd = ['claude', '-p', ...];
  cmd.push(userPrompt);  // ❌ 作为参数传递
  return cmd;
}

// 修改后：返回 { command: string[]; prompt: string }
private buildCLICommand(request: ChatRequest): { command: string[]; prompt: string } {
  const cmd = ['claude', '-p', ...];
  const userPrompt = this.buildUserPrompt(request.messages);
  return { command: cmd, prompt: userPrompt };  // ✅ 分离返回
}
```

**2. `executeCommand` 方法**
```typescript
// 修改前
const proc = spawn(command[0], command.slice(1));

// 修改后
const proc = spawn(command[0], command.slice(1), {
  shell: true,  // ✅ 关键修复
  env: { ...process.env, PATH: process.env.PATH }
});

// 通过 stdin 传递提示词
if (proc.stdin) {
  proc.stdin.write(prompt);
  proc.stdin.end();
}
```

**3. 流式输出处理**
```typescript
// 添加实时显示
if (json.event?.type === 'content_block_delta' && json.event?.delta?.text) {
  const text = json.event.delta.text;
  fullContent += text;

  // ✅ 实时显示
  if (request.enableStreamDisplay && request.stream) {
    process.stdout.write(text);
  }
}

// 流式结束后换行
if (request.enableStreamDisplay && request.stream) {
  console.log();
}
```

## 配置参考

### .env 配置
```bash
# LLM 服务类型
LLM_SERVICE_TYPE=api              # api 或 cli

# Claude CLI 配置
CLAUDE_CLI_ENABLED=false
CLAUDE_CLI_DEFAULT_MODEL=sonnet   # sonnet 或 opus
CLAUDE_CLI_DEFAULT_TIMEOUT=180000 # 3分钟

# 日志级别
LOG_LEVEL=debug                   # 查看详细日志
```

## 性能对比

| 模式 | 耗时 | Token 成本 | 稳定性 | 推荐场景 |
|------|------|------------|--------|----------|
| API  | ~4s  | 低         | ✅ 高 | 生产环境 |
| CLI  | ~15s | 高         | ⚠️ 中  | 本地测试 |

## 注意事项

1. **CLI 模式要求**：
   - 已安装 Claude CLI：`npm install -g @anthropic-ai/claude-code`
   - 已完成认证：`claude setup-token`
   - 网络可访问 Anthropic API

2. **性能考虑**：
   - CLI 模式需要启动子进程，比 API 慢
   - CLI 模式的 Token 统计包含系统提示，会更高
   - 推荐生产环境使用 API 模式

3. **调试建议**：
   - 启用 debug 日志：`LOG_LEVEL=debug`
   - 使用测试脚本验证：`pnpm test:llm:cli`
   - 检查命令是否正确打印

## 相关文件

- `src/services/llm/ClaudeCLIService.ts` - CLI 服务实现
- `src/services/llm/ILLMService.ts` - 统一接口定义
- `scripts/test-cli-llm.ts` - CLI 测试脚本
- `scripts/test-llm.ts` - 通用测试脚本
- `scripts/debug-cli-spawn.ts` - 调试脚本
- `docs/llm-commands-guide.md` - 使用指南
