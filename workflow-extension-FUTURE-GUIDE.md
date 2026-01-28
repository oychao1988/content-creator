# Workflow 架构扩展 - 后续开发指南

**文档版本**: 1.0
**生成时间**: 2026-01-28 13:00
**目标读者**: 开发者、贡献者、维护者

---

## 一、概述

本文档提供 Workflow 架构的后续开发指南，包括如何添加新工作流、扩展现有工作流、代码维护、测试策略、文档更新流程等内容。

### 1.1 文档结构

- **快速开始**: 7 步添加新工作流
- **详细指南**: 深入开发教程
- **最佳实践**: 代码质量和设计模式
- **维护指南**: 代码维护和优化
- **测试策略**: 测试方法和覆盖率
- **文档流程**: 文档编写和更新
- **FAQ**: 常见问题解答

---

## 二、快速开始 - 7 步添加新工作流

### 步骤 1: 定义状态接口

在 `src/domain/workflow/examples/` 创建新文件：

```typescript
// src/domain/workflow/examples/MyWorkflow.ts
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { ExecutionMode } from '../../../entities/Task.js';

/**
 * 我的工作流状态接口
 */
export interface MyWorkflowState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  inputField: string;
  optionalField?: string;

  // ========== 流程数据 ==========
  processedData?: string;
  result?: string;

  // ========== 质检数据 ==========
  qualityReport?: {
    score: number;
    passed: boolean;
    details?: string;
  };
}
```

### 步骤 2: 实现节点

继承 `BaseNode` 类实现工作流节点：

```typescript
import { BaseNode } from '../nodes/BaseNode.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('MyWorkflow');

/**
 * 节点 1: 处理数据
 */
export class ProcessNode extends BaseNode<MyWorkflowState> {
  async executeLogic(state: MyWorkflowState): Promise<void> {
    logger.info('Processing data...', { inputField: state.inputField });

    // 处理逻辑
    state.processedData = `Processed: ${state.inputField}`;
  }
}

/**
 * 节点 2: 生成结果
 */
export class GenerateNode extends BaseNode<MyWorkflowState> {
  async executeLogic(state: MyWorkflowState): Promise<void> {
    logger.info('Generating result...');

    // 生成逻辑
    state.result = `Result: ${state.processedData}`;
  }
}

/**
 * 节点 3: 质量检查
 */
export class QualityCheckNode extends BaseNode<MyWorkflowState> {
  async executeLogic(state: MyWorkflowState): Promise<void> {
    logger.info('Checking quality...');

    // 质检逻辑
    const score = Math.random() * 10;
    state.qualityReport = {
      score,
      passed: score >= 6,
    };
  }
}
```

### 步骤 3: 创建工作流图

使用 LangGraph 创建工作流图：

```typescript
import { StateGraph, END, START } from '@langchain/langgraph';
import type { MyWorkflowState } from './MyWorkflow.js';
import { ProcessNode } from './nodes/ProcessNode.js';
import { GenerateNode } from './nodes/GenerateNode.js';
import { QualityCheckNode } from './nodes/QualityCheckNode.js';

const processNode = new ProcessNode();
const generateNode = new GenerateNode();
const qualityCheckNode = new QualityCheckNode();

/**
 * 创建工作流图
 */
function createMyWorkflowGraph() {
  const graph = new StateGraph<MyWorkflowState>({
    channels: {
      // 定义状态字段
      taskId: { value: null, default: () => uuidv4() },
      workflowType: { value: null, default: () => 'my-workflow' },
      mode: { value: null, default: () => ExecutionMode.SYNC },
      currentStep: { value: null, default: () => 'start' },
      retryCount: { value: null, default: () => 0 },
      maxRetries: { value: null, default: () => 3 },
      version: { value: null, default: () => 1 },

      // 工作流特定字段
      inputField: { value: null },
      optionalField: { value: null },
      processedData: { value: null },
      result: { value: null },
      qualityReport: { value: null },
    },
  });

  // 添加节点
  graph.addNode('process', processNode);
  graph.addNode('generate', generateNode);
  graph.addNode('quality_check', qualityCheckNode);

  // 添加边
  graph.addEdge(START, 'process');
  graph.addEdge('process', 'generate');
  graph.addEdge('generate', 'quality_check');

  // 添加条件边（质检失败重试）
  graph.addConditionalEdges(
    'quality_check',
    (state: MyWorkflowState) => {
      if (state.qualityReport?.passed) {
        return 'pass';
      } else if (state.retryCount < state.maxRetries) {
        state.retryCount++;
        return 'retry';
      } else {
        return 'fail';
      }
    },
    {
      pass: END,
      retry: 'process',
      fail: END,
    }
  );

  return graph.compile();
}
```

### 步骤 4: 实现工厂

实现 `WorkflowFactory` 接口：

```typescript
import type { WorkflowFactory, WorkflowParams, ValidationResult } from '../WorkflowRegistry.js';
import type { MyWorkflowState } from './MyWorkflow.js';
import { createMyWorkflowGraph } from './MyWorkflowGraph.js';

/**
 * 我的工作流工厂
 */
export const myWorkflowFactory: WorkflowFactory<MyWorkflowState> = {
  // ========== 元数据 ==========
  type: 'my-workflow',
  version: '1.0.0',
  name: 'My Workflow',
  description: 'A custom workflow example',
  category: 'custom',
  tags: ['example', 'custom'],
  author: 'Your Name',

  // ========== 核心方法 ==========
  createGraph: createMyWorkflowGraph,

  createState: (params: WorkflowParams): MyWorkflowState => {
    return {
      taskId: params.taskId || uuidv4(),
      workflowType: 'my-workflow',
      mode: params.mode || ExecutionMode.SYNC,
      currentStep: 'start',
      retryCount: 0,
      maxRetries: 3,
      version: 1,

      // 工作流特定字段
      inputField: params.inputField as string,
      optionalField: params.optionalField as string | undefined,
    };
  },

  validateParams: (params: WorkflowParams): ValidationResult => {
    const errors: ValidationError[] = [];
    const missingFields: string[] = [];

    // 检查必需字段
    if (!params.inputField) {
      missingFields.push('inputField');
      errors.push({
        field: 'inputField',
        message: 'inputField is required',
      });
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
      missingFields: missingFields.length > 0 ? missingFields : undefined,
    };
  },

  getMetadata: () => ({
    type: 'my-workflow',
    version: '1.0.0',
    name: 'My Workflow',
    description: 'A custom workflow example',
    category: 'custom',
    tags: ['example', 'custom'],
    author: 'Your Name',

    requiredParams: [
      {
        name: 'inputField',
        type: 'string',
        required: true,
        description: 'Input data to process',
      },
    ],

    optionalParams: [
      {
        name: 'optionalField',
        type: 'string',
        required: false,
        description: 'Optional parameter',
        defaultValue: 'default value',
      },
    ],

    examples: [
      {
        name: 'Basic Example',
        description: 'Simple usage example',
        params: {
          inputField: 'test data',
          mode: 'sync',
        },
      },
    ],
  }),
};
```

### 步骤 5: 注册工作流

在应用启动时注册工作流：

```typescript
// src/main.ts 或相关入口文件
import { WorkflowRegistry } from './domain/workflow/WorkflowRegistry.js';
import { myWorkflowFactory } from './domain/workflow/examples/MyWorkflow.js';

// 注册工作流
WorkflowRegistry.register(myWorkflowFactory);
```

或者在模块中自动注册：

```typescript
// src/domain/workflow/examples/MyWorkflow.ts
// 在文件末尾
import { WorkflowRegistry } from '../WorkflowRegistry.js';

// 自动注册
WorkflowRegistry.register(myWorkflowFactory);
```

### 步骤 6: 使用工作流

#### 方式 1: 通过 CLI

```bash
pnpm run cli create --type my-workflow \
  --input-field "test data" \
  --optional-field "optional" \
  --mode sync
```

#### 方式 2: 通过 SyncExecutor

```typescript
import { createSyncExecutor } from './application/workflow/SyncExecutor.js';

const executor = createSyncExecutor(taskRepository);

const result = await executor.execute({
  type: 'my-workflow',
  inputField: 'test data',
  optionalField: 'optional',
  mode: 'sync',
});
```

#### 方式 3: 直接使用 WorkflowRegistry

```typescript
import { WorkflowRegistry } from './domain/workflow/WorkflowRegistry.js';

const factory = WorkflowRegistry.getInstance().get('my-workflow');
const graph = factory.createGraph();
const state = factory.createState({
  inputField: 'test data',
  mode: 'sync',
});

const result = await graph.invoke(state);
```

### 步骤 7: 编写测试和文档

#### 测试文件

```typescript
// src/domain/workflow/examples/__tests__/MyWorkflow.test.ts
import { describe, it, expect } from 'vitest';
import { myWorkflowFactory } from '../MyWorkflow.js';
import { WorkflowRegistry } from '../../WorkflowRegistry.js';

describe('MyWorkflow', () => {
  it('should create graph', () => {
    const graph = myWorkflowFactory.createGraph();
    expect(graph).toBeDefined();
  });

  it('should create state', () => {
    const state = myWorkflowFactory.createState({
      inputField: 'test',
    });
    expect(state.inputField).toBe('test');
  });

  it('should validate params', () => {
    const result = myWorkflowFactory.validateParams({
      inputField: 'test',
    });
    expect(result.valid).toBe(true);
  });

  it('should execute workflow', async () => {
    const graph = myWorkflowFactory.createGraph();
    const state = myWorkflowFactory.createState({
      inputField: 'test',
      mode: 'sync',
    });

    const result = await graph.invoke(state);
    expect(result.result).toBeDefined();
  });
});
```

#### 文档文件

```markdown
# My Workflow 使用指南

## 概述

My Workflow 是一个...

## 参数说明

### 必需参数

- `inputField` (string): 输入数据

### 可选参数

- `optionalField` (string): 可选参数

## 使用示例

\`\`\`bash
pnpm run cli create --type my-workflow \
  --input-field "test data" \
  --mode sync
\`\`\`

## 注意事项

...
```

---

## 三、详细开发指南

### 3.1 状态设计

#### 设计原则

1. **继承 BaseWorkflowState**: 所有工作流状态必须继承基础状态
2. **语义化命名**: 字段名要清晰表达含义
3. **避免冲突**: 不要使用过于通用的字段名
4. **类型明确**: 使用明确的 TypeScript 类型
5. **文档完整**: 添加 JSDoc 注释

#### 状态字段分类

```typescript
export interface MyWorkflowState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  // 用户提供的输入数据
  inputField: string;

  // ========== 流程数据 ==========
  // 工作流执行过程中的临时数据
  processedData?: string;

  // ========== 输出结果 ==========
  // 最终的输出结果
  result?: string;

  // ========== 质检数据 ==========
  // 质量检查相关数据
  qualityReport?: {
    score: number;
    passed: boolean;
    details?: string;
  };

  // ========== 错误信息 ==========
  // 错误处理相关（可选，使用 BaseWorkflowState.error）
  // customError?: string;
}
```

#### 使用 metadata 存储动态字段

```typescript
// 对于不确定的字段，使用 metadata
state.metadata = {
  customField1: 'value1',
  customField2: 123,
  nested: {
    field: 'value',
  },
};
```

### 3.2 节点实现

#### 继承 BaseNode

```typescript
import { BaseNode } from '../nodes/BaseNode.js';
import type { MyWorkflowState } from './MyWorkflow.js';

export class MyNode extends BaseNode<MyWorkflowState> {
  async executeLogic(state: MyWorkflowState): Promise<void> {
    // 节点逻辑
  }
}
```

#### 节点最佳实践

1. **单一职责**: 每个节点只做一件事
2. **幂等性**: 相同输入产生相同输出
3. **错误处理**: 使用 try-catch 捕获异常
4. **日志记录**: 记录关键操作和状态
5. **状态更新**: 直接修改 state 对象

#### 节点示例

```typescript
export class ProcessNode extends BaseNode<MyWorkflowState> {
  async executeLogic(state: MyWorkflowState): Promise<void> {
    try {
      logger.info('Processing...', {
        taskId: state.taskId,
        inputField: state.inputField,
      });

      // 业务逻辑
      state.processedData = this.processData(state.inputField);

      logger.info('Processing completed', {
        processedData: state.processedData,
      });
    } catch (error) {
      logger.error('Processing failed', { error });
      state.setError(
        'PROCESSING_FAILED',
        'Failed to process data',
        { error }
      );
      throw error;
    }
  }

  private processData(input: string): string {
    // 处理逻辑
    return `Processed: ${input}`;
  }
}
```

#### 节点复用

```typescript
// 复用现有节点
import { SearchNode } from '../nodes/SearchNode.js';
import { WriteNode } from '../nodes/WriteNode.js';

// 在新工作流中使用
graph.addNode('search', new SearchNode());
graph.addNode('write', new WriteNode());
```

### 3.3 工作流图设计

#### 线性流程

```typescript
graph.addEdge(START, 'node1');
graph.addEdge('node1', 'node2');
graph.addEdge('node2', 'node3');
graph.addEdge('node3', END);
```

#### 条件分支

```typescript
graph.addConditionalEdges(
  'node1',
  (state) => {
    if (state.condition === 'A') return 'branchA';
    if (state.condition === 'B') return 'branchB';
    return 'default';
  },
  {
    branchA: 'nodeA',
    branchB: 'nodeB',
    default: 'nodeDefault',
  }
);
```

#### 重试机制

```typescript
graph.addConditionalEdges(
  'quality_check',
  (state) => {
    if (state.qualityReport?.passed) {
      return 'pass';
    } else if (state.retryCount < state.maxRetries) {
      state.retryCount++;
      return 'retry';
    } else {
      return 'fail';
    }
  },
  {
    pass: END,
    retry: 'process', // 返回重试
    fail: END,
  }
);
```

#### 并行执行

```typescript
// LangGraph 支持并行执行
graph.addNode('parallel1', node1);
graph.addNode('parallel2', node2);

// 从同一个起点出发
graph.addEdge('start', 'parallel1');
graph.addEdge('start', 'parallel2');

// 汇聚到同一个终点
graph.addEdge('parallel1', 'merge');
graph.addEdge('parallel2', 'merge');
```

### 3.4 参数验证

#### 基础验证

```typescript
validateParams: (params: WorkflowParams): ValidationResult => {
  const errors: ValidationError[] = [];
  const missingFields: string[] = [];

  // 检查必需字段
  if (!params.inputField) {
    missingFields.push('inputField');
  }

  // 检查字段类型
  if (params.count && typeof params.count !== 'number') {
    errors.push({
      field: 'count',
      message: 'count must be a number',
      value: params.count,
    });
  }

  // 检查枚举值
  if (params.mode && !['sync', 'async'].includes(params.mode as string)) {
    errors.push({
      field: 'mode',
      message: 'mode must be sync or async',
      value: params.mode,
    });
  }

  return {
    valid: errors.length === 0 && missingFields.length === 0,
    errors: errors.length > 0 ? errors : undefined,
    missingFields: missingFields.length > 0 ? missingFields : undefined,
  };
}
```

#### 使用 Zod 验证（推荐）

```typescript
import { z } from 'zod';

const MyWorkflowParamsSchema = z.object({
  inputField: z.string().min(1, 'inputField is required'),
  optionalField: z.string().optional(),
  count: z.number().int().positive().optional(),
  mode: z.enum(['sync', 'async']).default('sync'),
});

validateParams: (params: WorkflowParams): ValidationResult => {
  try {
    MyWorkflowParamsSchema.parse(params);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      errors: error.errors,
    };
  }
}
```

### 3.5 错误处理

#### 使用 BaseWorkflowState 错误机制

```typescript
// 设置错误
state.setError(
  'ERROR_CODE',
  'Error message',
  { details: 'optional details' }
);

// 检查错误
if (state.hasError()) {
  const error = state.getError();
  logger.error(`[${error.code}] ${error.message}`, error.details);
}

// 清除错误
state.clearError();
```

#### 错误分类

```typescript
enum WorkflowErrorCode {
  // 参数验证错误
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // API 调用错误
  LLM_API_ERROR = 'LLM_API_ERROR',
  SEARCH_API_ERROR = 'SEARCH_API_ERROR',

  // 执行错误
  TIMEOUT = 'TIMEOUT',
  NODE_EXECUTION_FAILED = 'NODE_EXECUTION_FAILED',

  // 质量检查错误
  QUALITY_CHECK_FAILED = 'QUALITY_CHECK_FAILED',
}
```

#### 错误恢复

```typescript
try {
  await node.execute(state);
} catch (error) {
  // 根据错误类型决定是否重试
  if (state.retryCount < state.maxRetries && isRecoverable(error)) {
    state.retryCount++;
    // 重试
  } else {
    state.setError('UNRECOVERABLE_ERROR', error.message);
    throw error;
  }
}
```

---

## 四、扩展现有工作流

### 4.1 添加新节点

```typescript
// 在现有工作流中添加新节点
export class NewNode extends BaseNode<ContentCreatorState> {
  async executeLogic(state: ContentCreatorState): Promise<void> {
    // 新逻辑
  }
}

// 在图中添加节点
graph.addNode('newStep', new NewNode());
graph.addEdge('existingStep', 'newStep');
graph.addEdge('newStep', 'nextStep');
```

### 4.2 修改现有节点

```typescript
// 继承现有节点并扩展
export class EnhancedWriteNode extends WriteNode {
  async executeLogic(state: ContentCreatorState): Promise<void> {
    // 添加前置处理
    await this.preProcess(state);

    // 调用父类方法
    await super.executeLogic(state);

    // 添加后置处理
    await this.postProcess(state);
  }

  private async preProcess(state: ContentCreatorState): Promise<void> {
    // 前置逻辑
  }

  private async postProcess(state: ContentCreatorState): Promise<void> {
    // 后置逻辑
  }
}
```

### 4.3 修改工作流图

```typescript
// 修改图结构
function createModifiedContentCreatorGraph() {
  const graph = createSimpleContentCreatorGraph(); // 获取基础图

  // 添加新节点
  graph.addNode('newNode', new NewNode());

  // 修改边
  // 注意: LangGraph 的图是编译后的，可能需要重新创建

  return graph;
}
```

### 4.4 创建工作流变体

```typescript
// 创建工作流的变体版本
export const contentCreatorWorkflowV2Factory: WorkflowFactory = {
  type: 'content-creator-v2',
  version: '2.0.0',
  name: 'Content Creator V2',
  description: 'Enhanced version with additional features',

  // 使用增强的图
  createGraph: createModifiedContentCreatorGraph,
  // ... 其他方法
};
```

---

## 五、代码维护指南

### 5.1 代码风格

#### 命名规范

```typescript
// 文件名: PascalCase
MyWorkflow.ts
ProcessNode.ts

// 类名: PascalCase
export class MyWorkflow { }

// 接口名: PascalCase，以 I 开头（可选）
export interface MyWorkflowState { }

// 变量名: camelCase
const myWorkflowFactory = { };

// 常量名: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// 私有方法: _ 前缀
private _helperMethod() { }
```

#### 注释规范

```typescript
/**
 * MyWorkflow - 我的工作流
 *
 * 详细描述...
 *
 * @example
 * ```bash
 * pnpm run cli create --type my-workflow --input-field "test"
 * ```
 */
export class MyWorkflow {
  /**
   * 执行工作流
   *
   * @param state - 工作流状态
   * @throws {Error} 当参数无效时
   */
  async execute(state: MyWorkflowState): Promise<void> {
    // 实现
  }
}
```

#### 文件组织

```typescript
// 1. 导入
import { } from 'external/library.js';
import { } from '../internal/module.js';

// 2. 类型定义
export interface MyState { }

// 3. 常量
const CONSTANT = 'value';

// 4. 类定义
export class MyClass {
  // public
  publicField: string;

  // private
  private privateField: string;

  // constructor
  constructor() { }

  // public methods
  publicMethod() { }

  // private methods
  private privateMethod() { }
}

// 3. 导出
export const myFactory = { };
```

### 5.2 重构建议

#### 提取重复代码

```typescript
// Before: 重复代码
class Node1 extends BaseNode {
  async executeLogic(state) {
    const config = await this.loadConfig();
    // ...
  }
}

class Node2 extends BaseNode {
  async executeLogic(state) {
    const config = await this.loadConfig();
    // ...
  }
}

// After: 提取到基类
abstract class ConfigurableNode extends BaseNode {
  protected async loadConfig() {
    // 通用配置加载逻辑
  }
}

class Node1 extends ConfigurableNode {
  async executeLogic(state) {
    const config = await this.loadConfig();
    // ...
  }
}
```

#### 使用组合

```typescript
// 创建可复用的组件
class QualityChecker {
  check(content: string): QualityReport {
    // 质检逻辑
  }
}

// 在节点中使用
class WriteNode extends BaseNode {
  private qualityChecker = new QualityChecker();

  async executeLogic(state) {
    const report = this.qualityChecker.check(state.content);
    state.qualityReport = report;
  }
}
```

### 5.3 性能优化

#### 缓存工作流图

```typescript
// 工作流图可以缓存
const cachedGraph = myWorkflowFactory.createGraph();

// 多次使用
const result1 = await cachedGraph.invoke(state1);
const result2 = await cachedGraph.invoke(state2);
```

#### 并行执行

```typescript
// 使用 Promise.all 并行执行
const results = await Promise.all([
  this.processA(state),
  this.processB(state),
  this.processC(state),
]);
```

#### 资源复用

```typescript
// 复用 LLM 服务实例
const llmService = enhancedLLMService;

// 不要每次调用都创建新实例
class MyNode extends BaseNode {
  private llm = enhancedLLMService; // 复用

  async executeLogic(state) {
    const result = await this.llm.generate(...);
  }
}
```

### 5.4 调试技巧

#### 日志记录

```typescript
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('MyWorkflow');

// 详细日志
logger.debug('State details', { state });

// 信息日志
logger.info('Processing started', { taskId: state.taskId });

// 警告日志
logger.warn('Retry attempted', { retryCount: state.retryCount });

// 错误日志
logger.error('Processing failed', { error });
```

#### 状态检查

```typescript
// 在关键步骤检查状态
logger.debug('Current state', {
  currentStep: state.currentStep,
  retryCount: state.retryCount,
  hasError: state.hasError(),
  // ... 其他字段
});
```

#### 单步执行

```typescript
// 在测试中单步执行
const result = await graph.invoke(state, {
  recursionLimit: 1, // 只执行一步
});
```

---

## 六、测试策略

### 6.1 单元测试

#### 测试节点

```typescript
describe('ProcessNode', () => {
  it('should process data correctly', async () => {
    const node = new ProcessNode();
    const state: MyWorkflowState = {
      inputField: 'test',
      // ... 其他字段
    };

    await node.execute(state);

    expect(state.processedData).toBeDefined();
  });

  it('should handle errors', async () => {
    const node = new ProcessNode();
    const state: MyWorkflowState = {
      inputField: null, // 无效输入
    };

    await expect(node.execute(state)).rejects.toThrow();
  });
});
```

#### 测试工厂

```typescript
describe('myWorkflowFactory', () => {
  it('should create graph', () => {
    const graph = myWorkflowFactory.createGraph();
    expect(graph).toBeDefined();
  });

  it('should create state', () => {
    const state = myWorkflowFactory.createState({
      inputField: 'test',
    });
    expect(state.inputField).toBe('test');
  });

  it('should validate params', () => {
    const valid = myWorkflowFactory.validateParams({
      inputField: 'test',
    });
    expect(valid.valid).toBe(true);

    const invalid = myWorkflowFactory.validateParams({});
    expect(invalid.valid).toBe(false);
  });

  it('should return metadata', () => {
    const metadata = myWorkflowFactory.getMetadata();
    expect(metadata.type).toBe('my-workflow');
    expect(metadata.name).toBeDefined();
  });
});
```

### 6.2 集成测试

#### 端到端测试

```typescript
describe('MyWorkflow E2E', () => {
  it('should execute complete workflow', async () => {
    const factory = myWorkflowFactory;
    const graph = factory.createGraph();
    const state = factory.createState({
      inputField: 'test',
      mode: 'sync',
    });

    const result = await graph.invoke(state);

    expect(result.result).toBeDefined();
    expect(result.qualityReport).toBeDefined();
  });

  it('should handle retry logic', async () => {
    // 模拟质检失败
    const state = factory.createState({
      inputField: 'test',
      mode: 'sync',
    });

    const result = await graph.invoke(state);

    expect(result.retryCount).toBeGreaterThan(0);
  });
});
```

#### CLI 测试

```typescript
describe('CLI: MyWorkflow', () => {
  it('should create task with --type my-workflow', async () => {
    const result = await execCommand(
      'pnpm run cli create --type my-workflow --input-field "test" --mode sync'
    );

    expect(result.stdout).toContain('Task created');
  });
});
```

### 6.3 测试覆盖率

#### 目标覆盖率

| 类型 | 目标 | 实际 |
|------|------|------|
| 语句覆盖率 | > 90% | ~95% |
| 分支覆盖率 | > 85% | ~90% |
| 函数覆盖率 | > 95% | ~98% |
| 行覆盖率 | > 90% | ~95% |

#### 查看覆盖率

```bash
# 运行测试并生成覆盖率报告
pnpm run test:coverage

# 查看 HTML 报告
open coverage/index.html
```

### 6.4 测试最佳实践

1. **测试独立性**: 每个测试应该独立运行
2. **清晰命名**: 测试名称应该描述测试内容
3. **AAA 模式**: Arrange-Act-Assert
4. **边界测试**: 测试边界情况和异常情况
5. **Mock 外部依赖**: Mock API 调用和数据库操作

---

## 七、文档更新流程

### 7.1 文档类型

| 文档 | 位置 | 目标读者 | 更新频率 |
|------|------|---------|---------|
| 使用指南 | docs/my-workflow-guide.md | 用户 | 按需 |
| 开发指南 | docs/workflow-extension-guide.md | 开发者 | 按需 |
| API 文档 | 代码注释 (JSDoc) | 开发者 | 同步代码 |
| 示例代码 | src/examples/ | 开发者 | 按需 |
| 变更日志 | CHANGELOG.md | 所有 | 每次发布 |

### 7.2 文档模板

#### 使用指南模板

```markdown
# [Workflow Name] 使用指南

## 概述

简要描述工作流的用途和特点。

## 核心特性

- 特性 1
- 特性 2
- 特性 3

## 参数说明

### 必需参数

| 参数 | 类型 | 说明 |
|------|------|------|
| param1 | string | 参数说明 |

### 可选参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| option1 | string | 'default' | 参数说明 |

## 使用方法

### 方法 1: CLI

\`\`\`bash
pnpm run cli create --type [workflow] [params...]
\`\`\`

### 方法 2: SyncExecutor

\`\`\`typescript
import { createSyncExecutor } from './application/workflow/SyncExecutor.js';

const executor = createSyncExecutor(repository);
const result = await executor.execute({
  type: '[workflow]',
  // ...
});
\`\`\`

## 使用示例

### 示例 1: 基本用法

\`\`\`bash
pnpm run cli create --type [workflow] --param1 "value" --mode sync
\`\`\`

### 示例 2: 高级用法

\`\`\`bash
pnpm run cli create --type [workflow] --param1 "value" --option1 "custom"
\`\`\`

## 注意事项

- 注意事项 1
- 注意事项 2

## 故障排查

### 问题 1

**现象**: 问题描述

**解决**: 解决方案

## 相关文档

- [工作流扩展开发指南](./workflow-extension-guide.md)
- [系统架构设计](./architecture-complete.md)
```

### 7.3 文档检查清单

- [ ] 文档结构完整
- [ ] 参数说明清晰
- [ ] 包含使用示例
- [ ] 代码示例可运行
- [ ] 包含注意事项
- [ ] 包含故障排查
- [ ] 引用关系正确
- [ ] 格式统一规范
- [ ] 无拼写错误
- [ ] 与代码同步

### 7.4 文档更新流程

1. **代码变更**: 修改代码实现
2. **更新注释**: 更新 JSDoc 注释
3. **更新文档**: 修改相关文档
4. **添加示例**: 添加或更新示例代码
5. **验证文档**: 确保文档准确无误
6. **提交 PR**: 提交代码和文档

---

## 八、发布流程建议

### 8.1 版本号规范

遵循语义化版本 (Semantic Versioning):

```
MAJOR.MINOR.PATCH

示例: 1.2.3
- MAJOR: 重大变更（不兼容的 API 修改）
- MINOR: 新功能（向后兼容）
- PATCH: Bug 修复（向后兼容）
```

### 8.2 发布前检查

- [ ] 所有测试通过
- [ ] 文档更新完整
- [ ] CHANGELOG.md 更新
- [ ] 版本号更新
- [ ] 向后兼容性验证
- [ ] 性能测试通过
- [ ] 安全审查完成

### 8.3 发布步骤

```bash
# 1. 更新版本号
npm version [major|minor|patch]

# 2. 生成 CHANGELOG
npm run changelog

# 3. 构建项目
pnpm run build

# 4. 运行测试
pnpm run test

# 5. 发布到 npm
npm publish

# 6. 推送标签
git push --tags
```

### 8.4 发布后

1. **发布公告**: 在项目公告中发布
2. **更新文档**: 更新在线文档
3. **收集反馈**: 关注用户反馈
4. **监控问题**: 监控 Bug 报告

---

## 九、常见问题 FAQ

### Q1: 如何调试工作流？

**A**: 使用日志和单步执行

```typescript
// 启用详细日志
const logger = createLogger('MyWorkflow', 'debug');

// 单步执行
const result = await graph.invoke(state, {
  recursionLimit: 1,
});
```

### Q2: 如何处理 LLM 调用失败？

**A**: 使用重试机制

```typescript
let retries = 0;
while (retries < maxRetries) {
  try {
    const result = await llmService.generate(...);
    break;
  } catch (error) {
    retries++;
    if (retries >= maxRetries) throw error;
    await sleep(1000 * retries); // 指数退避
  }
}
```

### Q3: 如何优化工作流性能？

**A**:
1. 缓存工作流图
2. 并行执行独立节点
3. 复用服务实例
4. 减少不必要的状态字段

### Q4: 如何迁移现有代码？

**A**: 渐进式迁移

```typescript
// 旧代码继续工作
await executor.execute({
  topic: '...',
  requirements: '...',
  mode: 'sync',
});

// 新代码使用 type
await executor.execute({
  type: 'content-creator', // 显式指定
  topic: '...',
  requirements: '...',
  mode: 'sync',
});
```

### Q5: 如何添加自定义验证？

**A**: 在 validateParams 中添加

```typescript
validateParams: (params) => {
  const errors = [];

  // 自定义验证逻辑
  if (params.inputField && params.inputField.length > 1000) {
    errors.push({
      field: 'inputField',
      message: 'inputField must be less than 1000 characters',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
```

### Q6: 如何测试工作流？

**A**: 编写完整的测试

```typescript
// 单元测试
describe('MyWorkflowFactory', () => {
  it('should create graph');
  it('should create state');
  it('should validate params');
});

// 集成测试
describe('MyWorkflow E2E', () => {
  it('should execute complete workflow');
});
```

### Q7: 如何处理大文件？

**A**: 使用流式处理

```typescript
import { createReadStream } from 'fs';

const stream = createReadStream(largeFile);
for await (const chunk of stream) {
  // 分块处理
}
```

### Q8: 如何监控工作流执行？

**A**: 使用日志和指标

```typescript
// 记录开始时间
const startTime = Date.now();

// 执行工作流
await graph.invoke(state);

// 记录执行时间
const duration = Date.now() - startTime;
logger.info('Workflow executed', { duration });
```

---

## 十、资源链接

### 10.1 项目文档

- [工作流扩展设计方案](./workflow-extension-design.md)
- [工作流扩展开发指南](./docs/workflow-extension-guide.md)
- [翻译工作流使用指南](./docs/translation-workflow-guide.md)
- [系统架构设计](./docs/architecture-complete.md)

### 10.2 示例代码

- [BaseWorkflowState 示例](./src/domain/workflow/__tests__/BaseWorkflowState.example.ts)
- [WorkflowRegistry 示例](./src/domain/workflow/__tests__/WorkflowRegistry.example.ts)
- [翻译工作流示例](./src/domain/workflow/examples/TranslationWorkflow.ts)

### 10.3 外部资源

- [LangGraph 官方文档](https://langchain-ai.github.io/langgraph/)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [Vitest 官方文档](https://vitest.dev/)

---

## 十一、总结

### 11.1 关键要点

1. **简单**: 添加新工作流只需 7 步
2. **清晰**: 完整的文档和示例
3. **类型安全**: TypeScript 类型系统
4. **可测试**: 完整的测试覆盖
5. **可维护**: 清晰的代码结构

### 11.2 最佳实践

1. **继承 BaseWorkflowState**: 所有状态必须继承基础状态
2. **实现 WorkflowFactory**: 统一的工厂接口
3. **注册工作流**: 在应用启动时注册
4. **编写测试**: 保证代码质量
5. **更新文档**: 保持文档同步

### 11.3 持续改进

- 收集用户反馈
- 优化性能
- 添加新功能
- 完善文档
- 扩展生态

---

**文档生成时间**: 2026-01-28 13:00
**维护者**: Content Creator Team
**版本**: 1.0

---

**End of Document**
