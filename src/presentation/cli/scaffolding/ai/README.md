# AI Code Generator - AI 代码生成器

## 概述

AI Code Generator 是阶段 3 的核心组件，负责根据 `WorkflowRequirement` 自动生成完整的 LangGraph 工作流代码。

## 架构

### 核心组件

```
AICodeGenerator (协调器)
├── StateInterfaceGenerator      - 状态接口生成器
├── NodeClassGenerator           - 节点类生成器
├── RouteFunctionGenerator       - 路由函数生成器
├── WorkflowGraphGenerator       - 工作流图生成器
├── FactoryClassGenerator        - 工厂类生成器
└── CodePostProcessor            - 代码后处理器
```

### Prompt 模板

- `generate-state.ts` - 状态接口生成模板
- `generate-node.ts` - 节点类生成模板
- `generate-graph.ts` - 工作流图生成模板
- `generate-factory.ts` - 工厂类生成模板

## 使用方法

### 基本用法

```typescript
import { AICodeGenerator } from './ai/AICodeGenerator.js';
import { WorkflowRequirement } from './schemas/WorkflowRequirementSchema.js';

// 创建生成器实例
const generator = new AICodeGenerator(llmService, {
  enablePostProcess: true,
  parallelNodes: true,
});

// 生成完整工作流代码
const files = await generator.generateWorkflow(requirement, context);

// 访问生成的文件
console.log(files.state);      // 状态接口代码
console.log(files.nodes);      // 节点类代码 Map
console.log(files.graph);      // 工作流图代码
console.log(files.factory);    // 工厂类代码
console.log(files.index);      // 导出文件代码
```

### 生成单个文件

```typescript
// 只生成状态接口
const stateCode = await generator.generateFile('state', requirement, context);

// 只生成节点类
const nodeCode = await generator.generateFile('node', requirement, context);

// 只生成工作流图
const graphCode = await generator.generateFile('graph', requirement, context);
```

### 质量评分

```typescript
// 计算生成的代码质量分数（0-100）
const score = await generator.calculateQualityScore(files);
console.log(`Code quality score: ${score}/100`);

if (score >= 85) {
  console.log('✅ Code quality is excellent!');
} else if (score >= 70) {
  console.log('⚠️ Code quality is good, but has some issues.');
} else {
  console.log('❌ Code quality needs improvement.');
}
```

## 生成的代码结构

```
generated-workflow/
├── {WorkflowType}State.ts        - 状态接口
├── {WorkflowType}Graph.ts        - 工作流图
├── {WorkflowType}Factory.ts      - 工厂类
├── index.ts                       - 导出文件
└── nodes/                         - 节点类目录
    ├── {NodeName}Node.ts
    ├── {NodeName}Node.ts
    └── ...
```

## 生成流程

### 1. 状态接口生成

**输入**:
- `WorkflowRequirement` - 工作流需求
- `ProjectContext` - 项目上下文

**输出**:
```typescript
export interface {WorkflowName}State extends BaseWorkflowState {
  // 输入参数字段
  inputParam1: string;
  inputParam2: number;

  // 流程数据字段
  outputField1?: string;
  outputField2?: number;

  // 质检数据字段
  qualityReport?: {
    score: number;
    passed: boolean;
  };

  // 控制数据字段
  retryCount: number;
}
```

### 2. 节点类生成

**输入**:
- `NodeDesign` - 节点设计
- `WorkflowRequirement` - 工作流需求
- `stateInterfaceName` - 状态接口名称

**输出**:
```typescript
class {NodeName}Node extends BaseNode<{StateName}> {
  constructor() {
    super({
      name: 'nodeName',
      timeout: 60000,
    });
  }

  protected async executeLogic(state: {StateName}): Promise<Partial<{StateName}>> {
    // 节点逻辑
    if (this.useLLM) {
      const prompt = this.buildPrompt(state);
      const result = await llmService.chat({ messages: [...] });
      return { outputField: result.content };
    }

    // 其他逻辑...
  }
}
```

### 3. 路由函数生成

**输入**:
- `nodes` - 节点列表
- `connections` - 连接关系
- `stateInterfaceName` - 状态接口名称

**输出**:
```typescript
function route{NodeName}(state: {StateName}): string {
  if (state.qualityReport?.passed) {
    return 'nextNode';
  } else if (state.retryCount < 3) {
    return 'retry';
  } else {
    return 'end';
  }
}
```

### 4. 工作流图生成

**输入**:
- `WorkflowRequirement` - 工作流需求
- `stateInterfaceName` - 状态接口名称
- `nodeClasses` - 节点类列表
- `routeFunctionCode` - 路由函数代码

**输出**:
```typescript
export function create{WorkflowName}Graph(): CompiledGraph {
  const graph = new StateGraph<{StateName}>({
    channels: {
      taskId: { value: (x, y) => y ?? x, default: () => '' },
      // ... 所有状态字段
    },
  });

  // 添加节点
  graph.addNode('node1', node1.toLangGraphNode());
  graph.addNode('node2', node2.toLangGraphNode());

  // 设置入口点
  graph.setEntryPoint('node1');

  // 添加边
  graph.addEdge('node1', 'node2');

  // 添加条件边
  graph.addConditionalEdges('node2', routeNode2, {
    continue: 'node3',
    retry: 'node1',
    end: END,
  });

  return graph.compile();
}
```

### 5. 工厂类生成

**输入**:
- `WorkflowRequirement` - 工作流需求
- `stateInterfaceName` - 状态接口名称
- `graphFunctionName` - 图函数名

**输出**:
```typescript
class {WorkflowName}WorkflowFactory implements WorkflowFactory<{StateName}> {
  readonly type = '{workflow-type}';
  readonly version = '1.0.0';
  readonly name = '{Workflow Name}';
  readonly description = '{Workflow Description}';

  createGraph(): WorkflowGraph {
    return create{WorkflowName}Graph();
  }

  createState(params: WorkflowParams): {StateName} {
    const baseState = WorkflowStateFactory.createBaseState({...});
    return WorkflowStateFactory.extendState(baseState, {...});
  }

  validateParams(params: WorkflowParams): boolean {
    // 验证逻辑
  }

  getMetadata(): WorkflowMetadata {
    return {...};
  }
}

export const {workflowInstanceName} = new {WorkflowName}WorkflowFactory();
```

## 配置选项

```typescript
interface CodeGeneratorConfig {
  /** 是否启用后处理（格式化、Lint、类型检查） */
  enablePostProcess?: boolean;

  /** 是否并行生成节点 */
  parallelNodes?: boolean;

  /** 后处理配置 */
  postProcessorConfig?: {
    enablePrettier?: boolean;
    enableESLint?: boolean;
    enableTypeCheck?: boolean;
  };
}
```

## 代码质量保证

### 后处理流程

1. **清理代码**: 移除多余空行、行尾空格
2. **Prettier 格式化**: 统一代码风格
3. **ESLint 检查**: 检查代码规范
4. **TypeScript 验证**: 类型检查

### 质量评分

- **ESLint 错误**: 每个 -10 分
- **ESLint 警告**: 每个 -2 分
- **TypeScript 错误**: 每个 -15 分

**目标分数**: ≥ 85/100

## 工具函数

```typescript
import {
  toPascalCase,          // 'content-creator' => 'ContentCreator'
  toCamelCase,           // 'ContentCreator' => 'contentCreator'
  toKebabCase,           // 'contentCreator' => 'content-creator'
  extractClassName,      // 从代码中提取类名
  generateImports,       // 生成 import 语句
  cleanCode,             // 清理代码
  countEffectiveLines,   // 计算有效代码行数
} from './codegen/utils.js';
```

## 错误处理

所有生成器都包含完整的错误处理：

```typescript
try {
  const files = await generator.generateWorkflow(requirement, context);
} catch (error) {
  if (error.message.includes('Failed to generate state interface')) {
    console.error('状态接口生成失败');
  } else if (error.message.includes('Failed to generate node class')) {
    console.error('节点类生成失败');
  }
  // ... 其他错误处理
}
```

## 测试

运行测试：

```bash
# 运行所有测试
pnpm test src/presentation/cli/scaffolding/codegen/__tests__

# 运行特定测试
pnpm test src/presentation/cli/scaffolding/codegen/__tests__/AICodeGenerator.test.ts

# 监听模式
pnpm test:watch src/presentation/cli/scaffolding/codegen/__tests__
```

## 性能优化

1. **并行生成**: 默认启用并行节点生成
2. **LLM 缓存**: 可以添加 LLM 响应缓存
3. **增量生成**: 支持只生成修改的部分
4. **流式响应**: 使用 LLM 流式响应加速

## 下一步

- [ ] 添加更多单元测试
- [ ] 实现代码增量更新
- [ ] 添加代码模板库
- [ ] 支持自定义 Prompt 模板
- [ ] 实现 LLM 响应缓存
- [ ] 添加代码生成可视化

## 参考文档

- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [TypeScript 手册](https://www.typescriptlang.org/docs/)
- [项目设计文档](../../../../../docs/design/workflow-scaffolding-design.md)
