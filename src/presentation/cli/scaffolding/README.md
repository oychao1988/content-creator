# AI-Native Workflow Scaffolding Module

## 概述

AI-Native 工作流脚手架模块是一个基于 LangGraph 的智能工作流代码生成系统的核心组件。它能够将用户的自然语言描述自动转换为结构化的 LangGraph 工作流需求定义，为后续的代码生成阶段提供数据基础。

## 核心功能

### 1. AI 需求理解引擎 (AINeuralUnderstandingEngine)

将自然语言描述转换为结构化的工作流需求定义。

**主要能力：**
- 理解自然语言需求描述
- 生成符合 LangGraph 架构的工作流定义
- 验证需求的完整性和合理性
- 基于最佳实践优化需求设计
- 支持 Few-Shot Learning 以提高准确性

### 2. Schema 验证系统

使用 Zod 定义和验证工作流需求的数据结构。

**核心 Schema：**
- `ParamDefinitionSchema`: 参数定义
- `NodeDesignSchema`: 节点设计
- `ConnectionSchema`: 连接关系
- `WorkflowRequirementSchema`: 完整工作流需求

### 3. 上下文构建器 (Context Builder)

从项目现有代码中提取上下文信息，提高理解准确性。

**提取内容：**
- 现有工作流列表
- 代码模式（状态接口、节点类、工作流图）
- 最佳实践和命名规范
- 常用节点类型

### 4. Prompt 模板系统

Few-Shot Learning Prompt 模板，包含 4 个完整示例：
- 文本摘要工作流
- 翻译工作流
- 内容创作工作流
- 批量处理工作流

## 目录结构

```
scaffolding/
├── ai/
│   ├── AINeuralUnderstandingEngine.ts    # AI 理解引擎核心
│   └── prompts/
│       └── understanding.ts              # Prompt 模板和示例
├── schemas/
│   └── WorkflowRequirementSchema.ts      # Zod Schema 定义
├── utils/
│   └── contextBuilder.ts                 # 上下文构建器
├── validation/                           # 验证模块（待实现）
├── visualization/                        # 可视化模块（待实现）
├── __tests__/
│   └── AINeuralUnderstandingEngine.test.ts  # 单元测试
└── index.ts                              # 模块导出
```

## 使用示例

### 基本使用

```typescript
import { AINeuralUnderstandingEngine } from './scaffolding/index.js';

// 创建引擎实例
const engine = new AINeuralUnderstandingEngine();

// 理解自然语言需求
const result = await engine.understandRequirement(
  '创建一个翻译工作流，支持中英文互译，包含翻译质量检查'
);

if (result.success) {
  console.log('Workflow Type:', result.requirement?.type);
  console.log('Nodes:', result.requirement?.nodes);
  console.log('Connections:', result.requirement?.connections);
}
```

### 自定义上下文

```typescript
const result = await engine.understandRequirement(
  '创建一个批量处理工作流',
  {
    autoBuild: false,  // 不自动构建上下文
    codePatterns: '自定义代码模式',
    bestPractices: '自定义最佳实践',
    commonNodes: '自定义节点类型'
  }
);
```

### 验证和优化

```typescript
// 验证需求
const validation = engine.validateRequirement(requirement);
if (!validation.success) {
  console.log('Errors:', validation.errors);
}

// 优化需求
const optimization = await engine.optimizeRequirement(requirement);
console.log('Optimizations:', optimization.optimizations);
```

## 工作流需求 Schema

### 完整结构

```typescript
interface WorkflowRequirement {
  // 基本信息
  type: string;                    // kebab-case 工作流类型
  name: string;                    // 显示名称
  description: string;             // 详细描述（10-500字）
  category: 'content' | 'translation' | 'analysis' | 'automation' | 'other';
  tags: string[];                  // 标签列表

  // 输入输出
  inputParams: ParamDefinition[];  // 输入参数定义
  outputFields: string[];          // 输出字段列表

  // 工作流结构
  nodes: NodeDesign[];             // 节点设计列表
  connections: Connection[];       // 连接关系列表

  // 配置
  enableQualityCheck: boolean;     // 是否启用质量检查
  maxRetries: number;              // 最大重试次数（0-10）
  enableCheckpoint: boolean;       // 是否启用检查点
}

interface ParamDefinition {
  name: string;                    // camelCase 参数名
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;               // 是否必需
  description: string;             // 参数描述
  defaultValue?: any;              // 默认值（可选）
  examples?: any[];                // 示例值（可选）
}

interface NodeDesign {
  name: string;                    // camelCase 节点名
  displayName: string;             // 显示名称
  description: string;             // 节点描述
  nodeType: 'llm' | 'api' | 'transform' | 'quality_check' | 'custom';
  timeout: number;                 // 超时时间（毫秒）
  useLLM: boolean;                 // 是否使用 LLM
  llmSystemPrompt?: string;        // LLM 系统提示词
  enableQualityCheck: boolean;     // 是否启用质检
  qualityCheckPrompt?: string;     // 质检提示词
  dependencies: string[];          // 依赖节点列表
}

interface Connection {
  from: string;                    // 源节点
  to: string;                      // 目标节点
  condition?: string;              // 条件表达式（可选）
}
```

## 验证规则

### 必需字段验证
- 工作流类型必须是 kebab-case 格式
- 描述长度必须在 10-500 字之间
- 至少需要一个输入参数
- 至少需要一个输出字段
- 至少需要一个节点
- 至少需要一个连接

### 结构验证
- 所有连接中的节点必须在 nodes 列表中存在（除 START/END）
- 节点依赖必须在 nodes 列表中存在
- LLM 节点必须提供 `llmSystemPrompt`
- 质检节点必须提供 `qualityCheckPrompt`
- 必须有起始连接（from: "START"）
- 必须有结束连接（to: "END"）

### 业务逻辑验证
- 检测循环依赖（不包括条件重试）
- 检查孤立节点
- 检查超时时间是否合理（5-600 秒）
- 检查重试次数是否合理（0-10）

## 测试

### 运行单元测试

```bash
pnpm test:unit scaffolding
```

### 运行集成测试

```bash
npx tsx scripts/integration-test-scaffolding.ts
```

### 测试覆盖率

```bash
pnpm test:coverage scaffolding
```

## API 文档

### AINeuralUnderstandingEngine

#### `constructor(llmService?: ILLMService)`

创建 AI 理解引擎实例。

**参数：**
- `llmService` (可选): LLM 服务实例，默认使用 `LLMServiceFactory.create()`

#### `understandRequirement(naturalLanguageDescription, contextConfig?)`

理解自然语言需求。

**参数：**
- `naturalLanguageDescription`: 自然语言描述
- `contextConfig`: 上下文配置（可选）

**返回：** `Promise<UnderstandingResult>`

#### `validateRequirement(requirement)`

验证需求完整性。

**参数：**
- `requirement`: 工作流需求

**返回：** `ValidationResult`

#### `optimizeRequirement(requirement)`

优化需求设计。

**参数：**
- `requirement`: 原始需求

**返回：** `Promise<OptimizationResult>`

## 依赖项

- **zod**: Schema 验证
- **langchain/langgraph**: 工作流框架
- **项目服务层**: ILLMService, LLMServiceFactory
- **项目基础设施**: 日志系统

## 扩展性

### 添加新的 Few-Shot 示例

编辑 `ai/prompts/understanding.ts`，添加新的示例到模板中。

### 自定义验证规则

扩展 `schemas/WorkflowRequirementSchema.ts` 中的 refine 函数。

### 添加新的节点类型

更新 `schemas/WorkflowRequirementSchema.ts` 中的 `NodeTypeEnum`。

## 性能考虑

- **上下文缓存**: 引擎内置 5 分钟上下文缓存
- **异步构建**: 上下文构建是异步的，不阻塞主流程
- **流式 LLM**: 支持流式 LLM 调用以提高响应速度

## 最佳实践

1. **明确的描述**: 提供清晰、具体的需求描述
2. **使用示例**: 在描述中包含具体的使用场景
3. **渐进式迭代**: 先生成基本需求，再通过优化改进
4. **验证输出**: 始终验证生成的需求是否符合预期

## 后续阶段

- **阶段 2**: 代码生成器（基于需求生成 LangGraph 代码）
- **阶段 3**: 可视化设计器（图形化编辑工作流）
- **阶段 4**: 交互式验证（实时验证和预览）

## 贡献指南

1. 遵循项目代码风格
2. 添加 JSDoc 注释
3. 编写单元测试
4. 更新此 README

## 许可证

MIT
