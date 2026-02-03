# 工作流扩展开发指南

## 概述

本指南详细说明如何为 Content Creator 系统添加新的工作流类型。通过遵循本指南，您可以轻松扩展系统功能，添加如摘要、数据分析、内容审核等新的工作流。

## 前置要求

- 熟悉 TypeScript
- 了解 LangGraph 基础概念
- 理解系统的分层架构

## 架构概览

```
src/domain/workflow/
├── BaseWorkflowState.ts      # 基础状态抽象
├── WorkflowRegistry.ts       # 工作流注册表
├── adapters/                 # 工作流适配器
│   ├── ContentCreatorWorkflowAdapter.ts
│   └── [YourWorkflow]Adapter.ts
└── examples/                 # 示例工作流
    ├── TranslationWorkflow.ts
    └── [YourWorkflow].ts
```

## 快速开始

### 步骤 1: 定义工作流状态

创建继承自 `BaseWorkflowState` 的状态接口：

```typescript
// src/domain/workflow/examples/SummaryWorkflow.ts
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { ExecutionMode } from '../../../entities/Task.js';

/**
 * 摘要工作流状态接口
 */
export interface SummaryState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  sourceText: string;           // 待摘要的文本
  summaryLength?: 'short' | 'medium' | 'long';  // 摘要长度
  summaryStyle?: 'bullet' | 'paragraph';  // 摘要风格

  // ========== 流程数据 ==========
  summarizedText?: string;      // 摘要结果

  // ========== 质检数据 ==========
  qualityReport?: {
    score: number;              // 质量评分（0-10）
    passed: boolean;            // 是否通过质检
    checkedAt: number;          // 质检时间
  };
}
```

### 步骤 2: 实现工作流节点

创建继承自 `BaseNode` 的节点类：

```typescript
import { BaseNode } from '../nodes/BaseNode.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import { enhancedLLMService } from '../../../services/llm/EnhancedLLMService.js';

const logger = createLogger('SummaryWorkflow');

/**
 * 摘要节点
 */
class SummarizeNode extends BaseNode<SummaryState> {
  constructor() {
    super({
      name: 'summarize',
      retryCount: 2,
      timeout: 120000,
    });
  }

  protected async executeLogic(state: SummaryState): Promise<Partial<SummaryState>> {
    logger.info('Starting summary', {
      taskId: state.taskId,
      textLength: state.sourceText.length,
    });

    // 构建 Prompt
    const prompt = this.buildPrompt(state);

    // 调用 LLM
    const result = await enhancedLLMService.chat({
      messages: [
        { role: 'system', content: '你是一位专业的文本摘要专家。' },
        { role: 'user', content: prompt },
      ],
      taskId: state.taskId,
      stepName: 'summarize',
    });

    return {
      summarizedText: result.content.trim(),
    };
  }

  private buildPrompt(state: SummaryState): string {
    const length = state.summaryLength || 'medium';
    const style = state.summaryStyle || 'paragraph';

    return `请将以下文本总结为${this.getLengthDescription(length)}。

【待摘要文本】
${state.sourceText}

【要求】
1. ${this.getStyleRequirement(style)}
2. 准确提取关键信息
3. 语言简洁明了
4. 保持原文核心含义

${style === 'bullet' ? '请以项目符号列表形式输出。' : '请以段落形式输出。'}`;
  }

  private getLengthDescription(length: string): string {
    const map = {
      short: '50-100 字',
      medium: '100-200 字',
      long: '200-300 字',
    };
    return map[length] || map.medium;
  }

  private getStyleRequirement(style: string): string {
    return style === 'bullet'
      ? '使用项目符号列表，每个要点简洁明了'
      : '使用连贯段落，逻辑清晰';
  }

  protected validateState(state: SummaryState): void {
    super.validateState(state);

    if (!state.sourceText || state.sourceText.trim().length === 0) {
      throw new Error('Source text is required for summarization');
    }
  }
}
```

### 步骤 3: 创建工作流图

使用 LangGraph 的 `StateGraph` 创建工作流图：

```typescript
import { StateGraph, END, START } from '@langchain/langgraph';

/**
 * 创建摘要工作流图
 */
function createSummaryGraph(): any {
  logger.info('Creating summary workflow graph');

  // 创建节点实例
  const summarizeNode = new SummarizeNode().toLangGraphNode();

  // 创建 StateGraph
  const graph = new StateGraph<SummaryState>({
    channels: {
      // 基础字段
      taskId: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      workflowType: {
        default: () => 'summary' as const,
        reducer: (x?: string, y?: string) => (y ?? x ?? 'summary') as 'summary',
      },
      mode: {
        default: () => ExecutionMode.SYNC,
        reducer: (x?: ExecutionMode, y?: ExecutionMode) => y ?? x ?? ExecutionMode.SYNC,
      },
      retryCount: {
        default: () => 0,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 0),
      },

      // 输入参数
      sourceText: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      summaryLength: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      summaryStyle: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },

      // 流程数据
      summarizedText: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },

      // 质检数据
      qualityReport: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },

      // 控制数据
      currentStep: {
        default: () => 'start',
        reducer: (x?: string, y?: string) => y ?? x ?? 'start',
      },
      version: {
        default: () => 1,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 1),
      },
      startTime: {
        default: () => Date.now(),
        reducer: (x?: number, y?: number) => y ?? x ?? Date.now(),
      },
      endTime: {
        default: () => undefined,
        reducer: (x?: number, y?: number) => y ?? x,
      },
      error: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      metadata: {
        default: () => undefined,
        reducer: (x?: any, y?: any) => y ?? x,
      },
    },
  }) as any;

  // 添加节点
  graph.addNode('summarize', summarizeNode);

  // 设置边
  graph.addEdge(START as any, 'summarize');
  graph.addEdge('summarize' as any, END);

  logger.info('Summary workflow graph created successfully');

  return graph.compile();
}
```

### 步骤 4: 实现工作流工厂

创建实现 `WorkflowFactory` 接口的工厂类：

```typescript
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';
import { WorkflowStateFactory } from '../BaseWorkflowState.js';

/**
 * 摘要工作流工厂
 */
export class SummaryWorkflowFactory implements WorkflowFactory<SummaryState> {
  public readonly type: string = 'summary';
  public readonly version: string = '1.0.0';
  public readonly name: string = '文本摘要工作流';
  public readonly description: string = '基于 LLM 的智能文本摘要，支持多种摘要风格';

  createGraph(): any {
    return createSummaryGraph();
  }

  createState(params: WorkflowParams): SummaryState {
    logger.debug('Creating summary workflow state', {
      taskId: params.taskId,
    });

    // 验证必需参数
    if (!params.sourceText) {
      throw new Error('Missing required parameter: sourceText');
    }

    // 创建基础状态
    const baseState = WorkflowStateFactory.createBaseState({
      taskId: params.taskId,
      workflowType: this.type,
      mode: params.mode || ExecutionMode.SYNC,
    });

    // 扩展为摘要工作流状态
    return WorkflowStateFactory.extendState<SummaryState>(baseState, {
      sourceText: params.sourceText,
      summaryLength: params.summaryLength,
      summaryStyle: params.summaryStyle,
    });
  }

  validateParams(params: WorkflowParams): boolean {
    if (!params.taskId || !params.sourceText) {
      logger.error('Missing required parameters', {
        missing: !params.taskId ? ['taskId'] : [],
        missing: !params.sourceText ? ['sourceText'] : [],
      });
      return false;
    }

    if (params.sourceText && params.sourceText.trim().length === 0) {
      logger.error('Source text cannot be empty');
      return false;
    }

    logger.debug('Summary workflow parameters validated successfully');
    return true;
  }

  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      version: this.version,
      name: this.name,
      description: this.description,
      category: 'content-processing',
      tags: ['summary', 'llm', 'text-processing'],
      author: 'Your Name',
      createdAt: '2025-01-28',
      requiredParams: ['sourceText'],
      optionalParams: ['summaryLength', 'summaryStyle'],
      examples: [
        {
          name: '简短摘要',
          description: '生成简短的文本摘要',
          params: {
            sourceText: '人工智能正在改变我们的生活方式...',
            summaryLength: 'short',
            summaryStyle: 'paragraph',
          },
        },
        {
          name: '详细摘要',
          description: '生成详细的要点式摘要',
          params: {
            sourceText: '机器学习是人工智能的一个分支...',
            summaryLength: 'long',
            summaryStyle: 'bullet',
          },
        },
      ],
    };
  }
}

// 导出工厂实例
export const summaryWorkflowFactory = new SummaryWorkflowFactory();
```

### 步骤 5: 注册工作流

在应用启动时注册您的工作流：

```typescript
// src/index.ts 或 main.ts
import { WorkflowRegistry } from './domain/workflow/WorkflowRegistry.js';
import { contentCreatorWorkflowFactory } from './domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';
import { translationWorkflowFactory } from './domain/workflow/examples/TranslationWorkflow.js';
import { summaryWorkflowFactory } from './domain/workflow/examples/SummaryWorkflow.js';

// 注册所有工作流
WorkflowRegistry.register('content-creator', contentCreatorWorkflowFactory);
WorkflowRegistry.register('translation', translationWorkflowFactory);
WorkflowRegistry.register('summary', summaryWorkflowFactory);  // 新增
```

### 步骤 6: 更新导出

在 `src/domain/workflow/index.ts` 中导出您的工作流：

```typescript
// Examples
export * from './examples/TranslationWorkflow.js';
export * from './examples/SummaryWorkflow.js';  // 新增
```

### 步骤 7: 添加单元测试

创建测试文件验证工作流功能：

```typescript
// src/domain/workflow/examples/__tests__/SummaryWorkflow.test.ts
import { describe, it, expect } from 'vitest';
import { SummaryWorkflowFactory } from '../SummaryWorkflow.js';
import { WorkflowRegistry } from '../../WorkflowRegistry.js';

describe('SummaryWorkflow', () => {
  let factory: SummaryWorkflowFactory;

  beforeEach(() => {
    factory = new SummaryWorkflowFactory();
    WorkflowRegistry.clear();
    WorkflowRegistry.register('summary', factory);
  });

  it('should have correct metadata', () => {
    expect(factory.type).toBe('summary');
    expect(factory.version).toBe('1.0.0');
    expect(factory.name).toBe('文本摘要工作流');
  });

  it('should validate required parameters', () => {
    const validParams = {
      taskId: 'task-123',
      sourceText: 'Test text',
    };

    expect(factory.validateParams(validParams)).toBe(true);
  });

  it('should reject missing sourceText', () => {
    const invalidParams = {
      taskId: 'task-123',
    };

    expect(factory.validateParams(invalidParams)).toBe(false);
  });

  it('should create state correctly', () => {
    const params = {
      taskId: 'task-123',
      sourceText: 'Long text to summarize...',
      summaryLength: 'short' as const,
      summaryStyle: 'bullet' as const,
    };

    const state = factory.createState(params);

    expect(state.taskId).toBe('task-123');
    expect(state.workflowType).toBe('summary');
    expect(state.sourceText).toBe('Long text to summarize...');
    expect(state.summaryLength).toBe('short');
    expect(state.summaryStyle).toBe('bullet');
  });

  it('should be registered in WorkflowRegistry', () => {
    expect(WorkflowRegistry.has('summary')).toBe(true);
  });
});
```

## 使用新工作流

### 通过 SyncExecutor 使用

```typescript
import { createSyncExecutor } from './application/workflow/SyncExecutor.js';

const executor = createSyncExecutor(createTaskRepository());

const result = await executor.execute({
  mode: 'sync',
  type: 'summary',  // 指定新的工作流类型
  taskId: 'task-456',
  sourceText: '这是一段很长的文本...',
  summaryLength: 'medium',
  summaryStyle: 'paragraph',
});

console.log('摘要结果:', result.state.summarizedText);
```

### 通过 CLI 查看工作流信息

```bash
# 查看所有工作流
pnpm run cli workflow list

# 查看摘要工作流详情
pnpm run cli workflow info summary
```

## 最佳实践

### 1. 状态设计

- 保持状态接口简洁明了
- 区分输入参数、流程数据、质检数据、控制数据
- 使用 JSDoc 注释说明每个字段的用途

### 2. 节点实现

- 继承 `BaseNode` 并实现 `executeLogic()` 和 `validateState()`
- 使用 `createLogger` 记录关键操作
- 实现适当的超时和重试机制
- 在 `validateState()` 中验证输入参数

### 3. 错误处理

```typescript
protected async executeLogic(state: SummaryState): Promise<Partial<SummaryState>> {
  try {
    // 业务逻辑
  } catch (error) {
    logger.error('Summary failed', {
      taskId: state.taskId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;  // 重新抛出错误
  }
}
```

### 4. 质量检查

对于需要质量保证的工作流，添加质检节点：

```typescript
class SummaryQualityNode extends BaseNode<SummaryState> {
  protected async executeLogic(state: SummaryState): Promise<Partial<SummaryState>> {
    // 调用 LLM 评估摘要质量
    const quality = await this.evaluateQuality(state);

    return {
      qualityReport: {
        score: quality.score,
        passed: quality.score >= 8.0,
        checkedAt: Date.now(),
      },
    };
  }
}
```

### 5. 路由逻辑

使用条件边实现复杂的流程控制：

```typescript
function routeAfterQualityCheck(state: SummaryState): string {
  if (state.qualityReport?.passed) {
    return '__end__';
  }

  if (state.retryCount < 2) {
    return 'summarize';  // 重试
  }

  throw new Error('Quality check failed after max retries');
}

// 在图中添加条件边
graph.addConditionalEdges('qualityCheck' as any, routeAfterQualityCheck, {
  summarize: 'summarize',
  __end__: END,
});
```

## 高级特性

### 1. 并行执行

使用 LangGraph 的并发功能：

```typescript
// 并行执行多个节点
graph.addEdge(START, 'node1');
graph.addEdge(START, 'node2');  // node1 和 node2 并行执行
graph.addEdge('node1', 'merge');
graph.addEdge('node2', 'merge');
```

### 2. 子工作流

将复杂工作流拆分为可复用的子工作流：

```typescript
function createSubWorkflow() {
  // 创建子工作流图
  return subGraph.compile();
}

// 在主工作流中引用
const subWorkflow = createSubWorkflow();
graph.addNode('subTask', subWorkflow);
```

### 3. 动态参数

根据输入动态决定工作流行为：

```typescript
protected async executeLogic(state: SummaryState): Promise<Partial<SummaryState>> {
  const strategy = this.selectStrategy(state);
  return strategy.execute(state);
}

private selectStrategy(state: SummaryState) {
  if (state.sourceText.length < 500) {
    return new ShortTextStrategy();
  }
  return new LongTextStrategy();
}
```

## 调试和测试

### 1. 启用详细日志

```typescript
const executor = createSyncExecutor(createTaskRepository(), {
  databaseType: 'sqlite',
  enableLogging: true,  // 启用日志
  logLevel: 'debug',   // 设置日志级别
});
```

### 2. 使用测试环境

```bash
NODE_ENV=test pnpm run test src/domain/workflow/examples/__tests__/SummaryWorkflow.test.ts
```

### 3. 本地测试工作流

```typescript
// 创建简单的测试脚本
import { summaryWorkflowFactory } from './src/domain/workflow/examples/SummaryWorkflow.js';

const state = summaryWorkflowFactory.createState({
  taskId: 'test-123',
  sourceText: 'Test text...',
});

const graph = summaryWorkflowFactory.createGraph();
const result = await graph.invoke(state);

console.log('Result:', result);
```

## 迁移现有工作流

如果您已有现有的工作流逻辑，可以按照以下步骤迁移：

1. **定义新状态接口**：继承 `BaseWorkflowState`
2. **创建适配器**：实现 `WorkflowFactory` 接口
3. **注册工作流**：在 `WorkflowRegistry` 中注册
4. **更新执行器**：确保 `SyncExecutor` 和 `TaskWorker` 支持新类型
5. **测试验证**：确保向后兼容性

## 相关文档

- [工作流扩展设计文档](./workflow-extension-design.md)
- [翻译工作流使用指南](./translation-workflow-guide.md)
- [BaseWorkflowState API 文档](../src/domain/workflow/BaseWorkflowState.ts)
- [WorkflowRegistry API 文档](../src/domain/workflow/WorkflowRegistry.ts)

## 示例代码

完整的工作流示例可以参考：
- [翻译工作流](../src/domain/workflow/examples/TranslationWorkflow.ts)
- [内容创作工作流](../src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.ts)

---

**作者**: Content Creator System
**最后更新**: 2025-01-28
**版本**: 1.0.0
