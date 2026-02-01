# LLM 测试命令使用指南

## 快速开始

### 方式 1：使用环境变量覆盖 .env 配置

```bash
# 使用 CLI 模式
LLM_SERVICE_TYPE=cli CLAUDE_CLI_ENABLED=true npx tsx scripts/quick-llm-test.ts

# 使用 API 模式
LLM_SERVICE_TYPE=api npx tsx scripts/quick-llm-test.ts

# 使用不同的模型
LLM_SERVICE_TYPE=cli CLAUDE_CLI_DEFAULT_MODEL=opus npx tsx scripts/quick-llm-test.ts
```

### 方式 2：使用专用脚本

#### API 测试（强制使用 DeepSeek API）

```bash
# 默认提示词
npm run test:llm:api

# 自定义提示词
npx tsx scripts/test-api-llm.ts "写一首关于春天的诗"
```

#### CLI 测试（强制使用 Claude CLI）

```bash
# 默认提示词
npm run test:llm:cli

# 自定义提示词
npx tsx scripts/test-cli-llm.ts "用英文介绍 Rust 语言"
```

#### 通用测试脚本（支持多种配置）

```bash
# 使用默认配置（API 模式）
npm run test:llm

# 指定提示词
npx tsx scripts/test-llm.ts "你好，世界"

# 使用 CLI 模式
npx tsx scripts/test-llm.ts "你好" --type cli

# 禁用流式输出
npx tsx scripts/test-llm.ts "你好" --no-stream

# 禁用实时显示
npx tsx scripts/test-llm.ts "你好" --no-display

# 查看帮助
npx tsx scripts/test-llm.ts --help
```

### 方式 3：快速测试（使用 .env 配置）

```bash
# 使用 .env 中的配置
npm run test:llm:quick
```

## 命令对比

| 命令 | LLM 类型 | 配置来源 | 流式输出 | 实时显示 |
|------|----------|----------|----------|----------|
| `npm run test:llm:quick` | .env 配置 | .env | ✅ | ✅ |
| `npm run test:llm:api` | API | 强制 API | ✅ | ✅ |
| `npm run test:llm:cli` | CLI | 强制 CLI | ✅ | ✅ |
| `npm run test:llm` | API（默认） | 命令行参数 | ✅ | ✅ |
| `LLM_SERVICE_TYPE=cli npm run test:llm:quick` | CLI | 环境变量覆盖 | ✅ | ✅ |

## 常见使用场景

### 场景 1：快速测试 API 是否正常

```bash
npm run test:llm:api
```

### 场景 2：测试 Claude CLI 是否可用

```bash
npm run test:llm:cli
```

### 场景 3：比较 API 和 CLI 的输出

```bash
# API 输出
npm run test:llm:api "什么是 TypeScript？"

# CLI 输出
npm run test:llm:cli "什么是 TypeScript？"
```

### 场景 4：自定义提示词测试

```bash
# 使用通用脚本
npx tsx scripts/test-llm.ts "写一首关于AI的诗" --type api

# 使用专用脚本
npx tsx scripts/test-api-llm.ts "写一首关于AI的诗"
```

### 场景 5：在工作流中使用不同的 LLM

```bash
# 使用 API 模式运行工作流
LLM_SERVICE_TYPE=api npm run cli create -- --topic "测试" --requirements "写一篇文章"

# 使用 CLI 模式运行工作流
LLM_SERVICE_TYPE=cli CLAUDE_CLI_ENABLED=true npm run cli create -- --topic "测试" --requirements "写一篇文章"
```

## 环境变量参考

可以在命令行中覆盖以下环境变量：

```bash
# LLM 服务类型
LLM_SERVICE_TYPE=api              # api 或 cli

# API 配置
LLM_API_KEY=your_key
LLM_BASE_URL=https://api.example.com
LLM_MODEL_NAME=deepseek-chat
LLM_MAX_TOKENS=4000
LLM_TEMPERATURE=0.7
LLM_TIMEOUT_MS=60000
LLM_STREAM_TIMEOUT_MS=120000

# CLI 配置
CLAUDE_CLI_ENABLED=true
CLAUDE_CLI_DEFAULT_MODEL=sonnet   # sonnet 或 opus
CLAUDE_CLI_DEFAULT_TIMEOUT=180000

# 日志配置
LOG_LEVEL=debug                   # debug, info, warn, error
```

## 示例输出

### Debug 模式 + 流式显示

```bash
LOG_LEVEL=debug npm run test:llm:api
```

输出：
```
🧪 LLM 服务测试
==================================================
📝 提示词: 请用一句话介绍 TypeScript

⏳ 正在生成...

💬 回复:
2026-02-01 13:14:43 [debug]: [LLMFactory] Creating LLM service {"type":"api"}
2026-02-01 13:14:43 [info]: [LLMFactory] Creating Enhanced LLM API service
2026-02-01 13:14:43 [debug]: [LLM:Enhanced] Starting stream request
TypeScript 是 JavaScript 的一个超集，添加了静态类型系统，使代码更易维护和适合大型项目开发。
2026-02-01 13:14:47 [debug]: [LLM:Enhanced] Stream request completed

✅ 生成成功!

📊 统计信息:
   - Token 使用: 38 (输入: 10, 输出: 28)
   - 耗时: 4.09s
   - 成本: $0.000066
```

## 故障排除

### CLI 超时

如果 CLI 模式超时：
1. 确保已安装 Claude CLI：`npm install -g @anthropic-ai/claude-code`
2. 确保已认证：`claude setup-token`
3. 增加超时时间：`CLAUDE_CLI_DEFAULT_TIMEOUT=300000`

### API 超时

如果 API 模式超时：
1. 检查网络连接
2. 检查 API Key 是否有效
3. 增加超时时间：`LLM_STREAM_TIMEOUT_MS=180000`
4. 启用 debug 日志查看详情：`LOG_LEVEL=debug`

### 流式显示不工作

确保：
1. 使用 `stream: true` 参数
2. 使用 `enableStreamDisplay: true` 参数
3. 命令行支持 ANSI 输出（大多数终端都支持）

## 脚本文件说明

- `scripts/quick-llm-test.ts` - 快速测试（使用 .env 配置）
- `scripts/test-api-llm.ts` - API 测试（强制使用 API）
- `scripts/test-cli-llm.ts` - CLI 测试（强制使用 CLI）
- `scripts/test-llm.ts` - 通用测试（支持命令行参数）
