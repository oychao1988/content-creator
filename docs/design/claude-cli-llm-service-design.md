# Claude CLI LLM 服务设计文档

## 概述

本文档描述了基于本地 Claude CLI 的 LLM 服务实现，该实现通过统一的 `ILLMService` 接口与现有的 API 方式并行工作，提供了更灵活的 LLM 调用选择。

## 设计目标

1. **统一接口模式**：创建 `ILLMService` 接口，CLI 和 API 服务实现该接口
2. **流式响应支持**：实现 `--output-format stream-json` 的流式输出解析
3. **动态配置**：从工作流状态中获取 MCP 和 Skills 配置
4. **完整功能**：支持模型选择、工具控制、超时管理
5. **向后兼容**：保持现有代码的兼容性

## 架构设计

### 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         应用层                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ CheckTextNode│  │   WriteNode  │  │ OrganizeNode │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┼──────────────────┘                  │
│                            │                                     │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  ILLMService     │
                    │  (统一接口)       │
                    └────────┬─────────┘
                             │
            ┌────────────────┼────────────────┐
            │                │                │
┌───────────▼────────┐ ┌────▼─────┐ ┌───────▼──────────┐
│ EnhancedLLMService │ │  Factory │ │ClaudeCLIService   │
│  (API 实现)         │ │          │ │  (CLI 实现)       │
└────────────────────┘ └──────────┘ └──────────────────┘
         │                                      │
         ▼                                      ▼
  ┌───────────┐                        ┌──────────────┐
  │DeepSeek API│                        │ Claude CLI   │
  └───────────┘                        │(本地进程)     │
                                       └──────────────┘
```

### 文件结构

```
src/services/llm/
├── ILLMService.ts                 # 统一接口定义
├── EnhancedLLMService.ts          # API 服务实现（修改后实现接口）
├── ClaudeCLIService.ts            # CLI 服务实现（新增）
├── LLMServiceFactory.ts           # 服务工厂（新增）
├── LLMService.ts                  # 旧版 API 服务（保留兼容）
└── index.ts                       # 导出配置

src/domain/workflow/nodes/
├── BaseNode.ts                    # 基类（无需修改）
├── CheckTextNode.ts               # 支持 ILLMService 注入
├── WriteNode.ts                   # 支持 ILLMService 注入
└── OrganizeNode.ts                # 支持 ILLMService 注入

src/config/
└── index.ts                       # 添加 CLI 配置

.env.example                       # 添加环境变量示例
```

## 核心组件

### 1. ILLMService 统一接口

**文件**: `src/services/llm/ILLMService.ts`

```typescript
export interface ILLMService {
  /**
   * 聊天对话（支持流式）
   */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * 健康检查
   */
  healthCheck(): Promise<boolean>;

  /**
   * 估算 Token 数量
   */
  estimateTokens(text: string): number;

  /**
   * 估算成本
   */
  estimateCost(tokensIn: number, tokensOut: number): number;
}
```

**关键特性**：
- 统一的请求/响应格式
- 支持流式和非流式调用
- 提供健康检查和成本估算

### 2. ClaudeCLIService 实现

**文件**: `src/services/llm/ClaudeCLIService.ts`

**核心功能**：

1. **CLI 命令构建**
```typescript
private buildCLICommand(request: ChatRequest): string[] {
  const cmd = ['claude', '-p', '--output-format', 'stream-json'];
  const model = request.model || this.config.defaultModel || 'sonnet';
  cmd.push('--model', model);
  // 添加用户提示
  const userPrompt = this.buildUserPrompt(request.messages);
  cmd.push(userPrompt);
  return cmd;
}
```

2. **流式输出解析**
```typescript
proc.stdout.on('data', (chunk: Buffer) => {
  const lines = chunk.toString().split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      if (data.content) fullContent += data.content;
    }
  }
});
```

3. **超时控制**
```typescript
const timer = setTimeout(() => {
  proc.kill('SIGTERM');
  reject(new Error(`Timeout after ${timeout}ms`));
}, timeout);
```

4. **Token 估算**
```typescript
estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const englishChars = text.length - chineseChars;
  return Math.ceil(chineseChars / 1.5 + englishChars / 4);
}
```

### 3. LLMServiceFactory 工厂

**文件**: `src/services/llm/LLMServiceFactory.ts`

```typescript
export class LLMServiceFactory {
  static create(): ILLMService {
    if (config.llmServiceType === 'cli') {
      return this.createCLI();
    }
    return this.createAPI();
  }

  static createCLI(): ILLMService {
    return new ClaudeCLIService({
      defaultModel: config.claudeCLI.defaultModel,
      defaultTimeout: config.claudeCLI.defaultTimeout,
    });
  }

  static createAPI(): ILLMService {
    return new EnhancedLLMService();
  }
}
```

### 4. 节点服务注入

**修改方式**：所有节点现在支持可选的 `llmService` 参数

```typescript
interface CheckTextNodeConfig {
  llmService?: ILLMService; // 可注入的 LLM 服务
  // ... 其他配置
}

export class CheckTextNode extends BaseNode {
  private llmService: ILLMService;

  constructor(config: CheckTextNodeConfig = {}) {
    super(config);
    // 注入服务或使用默认
    this.llmService = config.llmService || enhancedLLMService;
  }
}
```

## 配置管理

### 环境变量

**文件**: `.env.example`

```bash
# LLM 服务类型（api | cli）
LLM_SERVICE_TYPE=api

# Claude CLI 配置
CLAUDE_CLI_ENABLED=false
CLAUDE_CLI_DEFAULT_MODEL=sonnet
CLAUDE_CLI_DEFAULT_TIMEOUT=120000
```

### 配置读取

**文件**: `src/config/index.ts`

```typescript
get llmServiceType(): 'api' | 'cli' {
  return this.env.LLM_SERVICE_TYPE;
}

get claudeCLI() {
  return {
    enabled: this.env.CLAUDE_CLI_ENABLED || this.env.LLM_SERVICE_TYPE === 'cli',
    defaultModel: this.env.CLAUDE_CLI_DEFAULT_MODEL,
    defaultTimeout: this.env.CLAUDE_CLI_DEFAULT_TIMEOUT,
    enableMCP: false,
  };
}
```

## 使用方式

### 方式 1：通过环境变量切换

```bash
# 使用 API 服务（默认）
LLM_SERVICE_TYPE=api npm run cli create --topic "测试"

# 使用 CLI 服务
LLM_SERVICE_TYPE=cli npm run cli create --topic "测试"
```

### 方式 2：直接注入服务

```typescript
import { CheckTextNode } from './nodes/index.js';
import { LLMServiceFactory } from './services/llm/index.js';

// 使用 API 服务
const apiCheckNode = new CheckTextNode({
  llmService: LLMServiceFactory.createAPI()
});

// 使用 CLI 服务
const cliCheckNode = new CheckTextNode({
  llmService: LLMServiceFactory.createCLI()
});
```

### 方式 3：使用工厂自动选择

```typescript
import { LLMServiceFactory } from './services/llm/index.js';

// 根据配置自动创建服务
const llmService = LLMServiceFactory.create();
```

## 技术细节

### 流式 JSON 解析

Claude CLI 使用 Server-Sent Events (SSE) 格式输出流式数据：

```
data: {"type":"content_delta","content":"Hello"}
data: {"type":"content_delta","content":" World"}
data: {"type":"content_stop"}
```

解析逻辑：
1. 按行分割输出
2. 过滤空行
3. 提取 `data:` 后的 JSON
4. 解析并累加 `content` 字段

### 子进程管理

使用 Node.js `child_process.spawn` 启动 CLI：

```typescript
const proc = spawn('claude', ['-p', '--output-format', 'stream-json', 'prompt']);

// 处理输出
proc.stdout.on('data', handleOutput);
proc.stderr.on('data', handleErrors);
proc.on('close', handleExit);
proc.on('error', handleError);
```

### 成本估算

Claude 官方定价（美元/1k tokens）：

| 模型   | 输入   | 输出   |
|--------|--------|--------|
| Sonnet | $0.003 | $0.015 |
| Opus   | $0.015 | $0.075 |

```typescript
estimateCost(tokensIn: number, tokensOut: number): number {
  const pricing = this.model === 'opus'
    ? { in: 0.015, out: 0.075 }
    : { in: 0.003, out: 0.015 };

  return (tokensIn / 1000) * pricing.in +
         (tokensOut / 1000) * pricing.out;
}
```

## 优势与限制

### 优势

1. **统一接口**：CLI 和 API 使用相同的接口，易于切换
2. **本地执行**：CLI 方式在本地运行，无需网络请求
3. **高级功能**：支持 MCP 和 Skills 扩展
4. **向后兼容**：现有代码无需修改即可工作

### 限制

1. **CLI 依赖**：需要本地安装 Claude CLI
2. **性能差异**：CLI 调用比 API 慢（需要启动子进程）
3. **Token 估算**：CLI 不返回准确 Token 数量，只能估算
4. **成本估算**：基于估算 Token 计算，可能不够准确

## 后续优化方向

1. **MCP 支持**：添加动态 MCP 配置加载
2. **Skills 支持**：支持自定义 Skills 目录
3. **并行调用**：支持多个 CLI 实例并行执行
4. **缓存机制**：实现 CLI 结果缓存
5. **监控集成**：集成 Sentry 性能监控

## 测试策略

### 单元测试

```typescript
describe('ClaudeCLIService', () => {
  it('should build correct CLI command', () => {
    const service = new ClaudeCLIService();
    const cmd = service.buildCLICommand({
      messages: [{ role: 'user', content: 'test' }],
    });
    expect(cmd).toContain('claude');
    expect(cmd).toContain('--output-format');
    expect(cmd).toContain('stream-json');
  });
});
```

### 集成测试

```typescript
describe('LLMServiceFactory', () => {
  it('should create API service by default', () => {
    const service = LLMServiceFactory.create();
    expect(service).toBeInstanceOf(EnhancedLLMService);
  });

  it('should create CLI service when configured', () => {
    process.env.LLM_SERVICE_TYPE = 'cli';
    const service = LLMServiceFactory.create();
    expect(service).toBeInstanceOf(ClaudeCLIService);
  });
});
```

### 手动测试

```bash
# 1. 测试 CLI 是否可用
claude -p --output-format json "你好"

# 2. 测试流式输出
claude -p --output-format stream-json "写一首诗"

# 3. 测试工作流
LLM_SERVICE_TYPE=cli npm run cli create --topic "测试"
```

## 相关文档

- [架构文档](./architecture-complete.md)
- [工作流架构](./workflow-architecture.md)
- [CLI 参考](./cli-reference.md)
- [快速开始](./quick-start.md)

## 版本历史

- **v1.0.0** (2025-02-01): 初始版本
  - 创建 ILLMService 统一接口
  - 实现 ClaudeCLIService
  - 添加 LLMServiceFactory
  - 修改节点支持服务注入
