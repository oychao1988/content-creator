# 工作流脚手架示例：文本摘要工作流

> 本附录展示通过脚手架工具生成的完整工作流代码示例
> 工作流类型：`text-summarizer`

---

## 1. 工作流配置

### 1.1 交互式问答过程

```bash
$ pnpm run cli workflow create

? 工作流类型标识符 (kebab-case，如: text-summarizer): text-summarizer
? 工作流显示名称: 文本摘要工作流
? 工作流描述: 基于LLM的文本摘要生成工具，支持长文本压缩
? 选择工作流分类: content
? 选择标签: llm, ai, quality-check

? 添加输入参数 (yes/no): yes
? 参数 1 名称 (camelCase): sourceText
? 参数类型: string
? 是否必需: yes
? 参数描述: 待摘要的原始文本
? 默认值 (可选): [跳过]
? 示例值 (逗号分隔，可选): [跳过]

? 继续添加参数 (yes/no): yes
? 参数 2 名称 (camelCase): maxLength
? 参数类型: number
? 是否必需: no
? 参数描述: 摘要最大长度（字符数）
? 默认值 (可选): 200

? 继续添加参数 (yes/no): no

? 添加节点 (yes/no): yes
? 节点 1 名称 (camelCase): summarize
? 节点显示名称: 摘要
? 节点描述: 生成文本摘要
? 节点类型: LLM 调用节点
? 超时时间 (毫秒): 90000
? 此节点是否使用 LLM: yes
? 请输入 LLM 系统提示词: 你是一位专业的文本摘要专家，能够准确提取文本核心内容...
? 是否为此节点启用质检: yes

? 继续添加节点 (yes/no): no

? 是否启用检查点（支持断点续传）: yes
? 质检失败最大重试次数: 2

✅ 配置完成，正在生成代码...
```

### 1.2 生成的配置对象

```typescript
{
  type: 'text-summarizer',
  name: '文本摘要工作流',
  description: '基于LLM的文本摘要生成工具，支持长文本压缩',
  category: 'content',
  version: '1.0.0',
  tags: ['llm', 'ai', 'quality-check'],
  author: 'User',

  inputParams: [
    {
      name: 'sourceText',
      type: 'string',
      required: true,
      description: '待摘要的原始文本'
    },
    {
      name: 'maxLength',
      type: 'number',
      required: false,
      description: '摘要最大长度（字符数）',
      defaultValue: 200
    }
  ],

  nodes: [
    {
      name: 'summarize',
      displayName: '摘要',
      description: '生成文本摘要',
      nodeType: NodeType.LLM,
      timeout: 90000,
      useLLM: true,
      llmSystemPrompt: '你是一位专业的文本摘要专家...',
      enableQualityCheck: true
    }
  ],

  enableCheckpoint: true,
  maxRetries: 2
}
```

---

## 2. 生成的代码文件

### 2.1 文件结构

```
src/domain/workflows/
└── TextSummarizerWorkflow.ts        # 完整工作流文件
```

### 2.2 完整代码

```typescript
/**
 * TextSummarizer - 文本摘要工作流
 *
 * 工作流类型: 'text-summarizer'
 * 描述: 基于LLM的文本摘要生成工具，支持长文本压缩
 * 自动生成于: 2026-02-03
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { ExecutionMode } from '../../entities/Task.js';
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { WorkflowStateFactory } from '../BaseWorkflowState.js';
import { BaseNode } from '../nodes/BaseNode.js';
import { enhancedLLMService } from '../../../services/llm/EnhancedLLMService.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';

const logger = createLogger('TextSummarizer');

// ============================================================================
// 1. 摘要工作流状态定义
// ============================================================================

/**
 * 摘要工作流状态接口
 */
export interface TextSummarizerState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  sourceText: string;              // 待摘要的原始文本
  maxLength?: number;              // 摘要最大长度（字符数）

  // ========== 流程数据 ==========
  summary?: string;                // 生成的摘要
  previousSummary?: string;        // 上一次的摘要（用于质检失败重试）

  // ========== 质检数据 ==========
  qualityReport?: {
    score: number;                 // 质量评分（0-10）
    passed: boolean;               // 是否通过质检
    fixSuggestions?: string[];     // 改进建议
    checkedAt: number;             // 质检时间
  };

  // ========== 控制数据 ==========
  summarizeRetryCount: number;     // 摘要重试次数
}

// ============================================================================
// 2. 摘要节点实现
// ============================================================================

/**
 * 摘要节点实现
 */
class SummarizeNode extends BaseNode<TextSummarizerState> {
  constructor() {
    super({
      name: 'summarize',
      timeout: 90000,
    });
  }

  /**
   * 构建摘要 Prompt
   */
  private buildPrompt(state: TextSummarizerState): string {
    const maxLength = state.maxLength || 200;

    return `请将以下文本总结为简明扼要的摘要。

【要求】
1. 摘要长度控制在 ${maxLength} 字符以内
2. 提取文本的核心信息和关键要点
3. 保持语言简洁流畅
4. 不要遗漏重要信息

【待摘要文本】
${state.sourceText}

请直接输出摘要，不要添加任何额外说明。`;
  }

  /**
   * 调用 LLM 生成摘要
   */
  private async callLLM(state: TextSummarizerState, prompt: string): Promise<string> {
    logger.debug('Calling LLM for summarization', {
      taskId: state.taskId,
      sourceLength: state.sourceText.length,
      maxLength: state.maxLength,
    });

    const systemMessage = '你是一位专业的文本摘要专家，能够准确提取文本核心内容。';

    const result = await enhancedLLMService.chat({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      taskId: state.taskId,
      stepName: 'summarize',
      stream: true,
    });

    logger.info('Summarization completed', {
      taskId: state.taskId,
      sourceLength: state.sourceText.length,
      summaryLength: result.content.length,
    });

    return result.content.trim();
  }

  /**
   * 验证摘要结果
   */
  private validateSummary(state: TextSummarizerState, summary: string): void {
    logger.debug('Validating summary', {
      taskId: state.taskId,
      summaryLength: summary.length,
    });

    const warnings: string[] = [];

    // 检查长度
    const maxLength = state.maxLength || 200;
    if (summary.length > maxLength * 1.2) {
      warnings.push(`Summary exceeds max length (${summary.length} > ${maxLength})`);
    }

    // 检查是否为空
    if (summary.length === 0) {
      warnings.push('Summary is empty');
    }

    // 检查是否包含占位符
    if (summary.includes('...') || summary.includes('待补充')) {
      warnings.push('Summary contains placeholder text');
    }

    if (warnings.length > 0) {
      logger.warn('Summary validation warnings', {
        taskId: state.taskId,
        warnings,
      });
    }
  }

  /**
   * 执行摘要逻辑
   */
  protected async executeLogic(state: TextSummarizerState): Promise<Partial<TextSummarizerState>> {
    logger.info('Starting summarization', {
      taskId: state.taskId,
      sourceLength: state.sourceText.length,
      isRetry: !!state.previousSummary,
    });

    try {
      // 1. 构建 Prompt
      const prompt = this.buildPrompt(state);

      // 2. 调用 LLM 生成摘要
      const summary = await this.callLLM(state, prompt);

      // 3. 验证摘要结果
      this.validateSummary(state, summary);

      // 4. 返回结果
      logger.info('Summarization completed successfully', {
        taskId: state.taskId,
        summaryLength: summary.length,
      });

      return {
        summary,
      };
    } catch (error) {
      logger.error('Summarization failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: TextSummarizerState): void {
    super.validateState(state);

    if (!state.sourceText || state.sourceText.trim().length === 0) {
      throw new Error('Source text is required for summarization');
    }

    if (state.sourceText.length < 50) {
      throw new Error('Source text is too short to summarize (minimum 50 characters)');
    }

    if (state.maxLength !== undefined && state.maxLength < 10) {
      throw new Error('Max length must be at least 10 characters');
    }
  }
}

// ============================================================================
// 3. 摘要质检节点实现
// ============================================================================

/**
 * 摘要质检节点实现
 */
class SummarizeQualityNode extends BaseNode<TextSummarizerState> {
  private config: {
    minPassingScore: number;
  };

  constructor() {
    super({
      name: 'checkQuality',
      timeout: 90000,
    });

    const isTestEnvironment = process.env.NODE_ENV === 'test';
    this.config = {
      minPassingScore: isTestEnvironment ? 6.0 : 7.0,
    };
  }

  /**
   * 构建质检 Prompt
   */
  private buildPrompt(state: TextSummarizerState): string {
    const maxLength = state.maxLength || 200;

    return `你是一位专业的文本摘要质量评估专家。请评估以下摘要的质量。

【原始文本】
${state.sourceText.substring(0, 500)}${state.sourceText.length > 500 ? '...' : ''}

【摘要文本】
${state.summary}

【摘要要求】
- 最大长度: ${maxLength} 字符

请从以下维度评估（每项 1-10 分）：
1. **完整性**（completeness）：是否包含了原始文本的核心信息
2. **简洁性**（conciseness）：是否简明扼要，没有冗余内容
3. **准确性**（accuracy）：是否准确传达了原文的意思
4. **可读性**（readability）：语言是否流畅易懂

请以 JSON 格式返回评估结果：
{
  "score": 8.5,
  "passed": true,
  "fixSuggestions": ["建议1", "建议2"]
}

重要要求：
1. 只返回纯 JSON，不要有任何其他文字或说明
2. 所有数值必须是纯数字
3. score 字段是总分（0-10）
4. passed 字段表示是否通过质检（score >= 7 为通过）`;
  }

  /**
   * 调用 LLM 进行质检
   */
  private async callLLMForQualityCheck(state: TextSummarizerState): Promise<{
    score: number;
    passed: boolean;
    fixSuggestions: string[];
  }> {
    logger.debug('Calling LLM for quality check', {
      taskId: state.taskId,
    });

    const systemMessage = '你是一位专业的文本摘要质量评估专家。请严格按照 JSON 格式返回评估结果。';

    const result = await enhancedLLMService.chat({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: this.buildPrompt(state) },
      ],
      taskId: state.taskId,
      stepName: 'checkQuality',
      stream: true,
    });

    // 解析 LLM 响应
    let output;
    try {
      let content = result.content.trim();
      if (content.startsWith('```json')) {
        content = content.slice(7);
      }
      if (content.startsWith('```')) {
        content = content.slice(3);
      }
      if (content.endsWith('```')) {
        content = content.slice(0, -3);
      }
      content = content.trim();

      output = JSON.parse(content);
    } catch (error) {
      logger.error('Failed to parse LLM output as JSON', {
        taskId: state.taskId,
        content: result.content.substring(0, 500),
      });

      throw new Error('Failed to parse quality check output');
    }

    return {
      score: output.score || 0,
      passed: output.passed || output.score >= this.config.minPassingScore,
      fixSuggestions: output.fixSuggestions || [],
    };
  }

  /**
   * 执行质检逻辑
   */
  protected async executeLogic(state: TextSummarizerState): Promise<Partial<TextSummarizerState>> {
    logger.info('Starting quality check', {
      taskId: state.taskId,
    });

    try {
      // 1. 调用 LLM 进行质检
      const qualityResult = await this.callLLMForQualityCheck(state);

      // 2. 构建质检报告
      const qualityReport = {
        score: qualityResult.score,
        passed: qualityResult.passed,
        fixSuggestions: qualityResult.fixSuggestions,
        checkedAt: Date.now(),
      };

      logger.info('Quality check completed', {
        taskId: state.taskId,
        passed: qualityReport.passed,
        score: qualityReport.score,
        suggestionsCount: qualityReport.fixSuggestions?.length || 0,
      });

      // 3. 准备结果
      const result: Partial<TextSummarizerState> = {
        qualityReport,
      };

      // 如果质检失败，保存上一次摘要并递增重试计数
      if (!qualityReport.passed) {
        result.previousSummary = state.summary;
        result.summarizeRetryCount = (state.summarizeRetryCount || 0) + 1;

        logger.info('Quality check failed, incrementing retry count', {
          taskId: state.taskId,
          retryCount: result.summarizeRetryCount,
        });
      }

      return result;
    } catch (error) {
      logger.error('Quality check failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: TextSummarizerState): void {
    super.validateState(state);

    if (!state.summary || state.summary.trim().length === 0) {
      throw new Error('Summary is required for quality check');
    }
  }
}

// ============================================================================
// 4. 工作流路由函数
// ============================================================================

/**
 * 摘要后的路由函数
 */
function routeAfterSummarize(state: TextSummarizerState): string {
  logger.debug('Routing after summarize', {
    taskId: state.taskId,
    hasSummary: !!state.summary,
  });

  if (state.summary) {
    return 'checkQuality';
  }

  throw new Error('No summary to check');
}

/**
 * 质检后的路由函数
 */
function routeAfterCheckQuality(state: TextSummarizerState): string {
  logger.debug('Routing after check quality', {
    taskId: state.taskId,
    passed: state.qualityReport?.passed,
    retryCount: state.summarizeRetryCount,
  });

  // 如果质检通过，结束
  if (state.qualityReport?.passed) {
    logger.info('Quality check passed, workflow completed', {
      taskId: state.taskId,
      score: state.qualityReport.score,
    });
    return '__end__';
  }

  // 如果质检失败但重试次数未满，重试摘要
  if (state.summarizeRetryCount < 2) {
    logger.info('Quality check failed, retrying summarize', {
      taskId: state.taskId,
      retryCount: state.summarizeRetryCount,
      maxRetries: 2,
    });
    return 'summarize';
  }

  // 重试次数已满，抛出错误
  logger.error('Quality check failed after max retries', {
    taskId: state.taskId,
    retryCount: state.summarizeRetryCount,
  });
  throw new Error('Quality check failed after 2 attempts');
}

// ============================================================================
// 5. 摘要工作流图创建
// ============================================================================

/**
 * 创建摘要工作流图
 */
function createTextSummarizerGraph(): any {
  logger.info('Creating text-summarizer workflow graph');

  // 创建节点实例
  const summarizeNode = new SummarizeNode().toLangGraphNode();
  const checkQualityNode = new SummarizeQualityNode().toLangGraphNode();

  // 创建 StateGraph
  const graph = new StateGraph<TextSummarizerState>({
    channels: {
      // 基础字段
      taskId: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      workflowType: {
        default: () => 'text-summarizer' as const,
        reducer: (x?: string, y?: string) => (y ?? x ?? 'text-summarizer') as 'text-summarizer',
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
      maxLength: {
        default: () => undefined,
        reducer: (x?: number, y?: number) => y ?? x,
      },

      // 流程数据
      summary: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      previousSummary: {
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
      summarizeRetryCount: {
        default: () => 0,
        reducer: (x?: number, y?: number) => (y !== undefined ? y : x || 0),
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
  graph.addNode('checkQuality', checkQualityNode);

  // 设置入口点和边
  graph.addEdge(START as any, 'summarize');
  graph.addConditionalEdges('summarize' as any, routeAfterSummarize, {
    checkQuality: 'checkQuality',
  });
  graph.addConditionalEdges('checkQuality' as any, routeAfterCheckQuality, {
    summarize: 'summarize',
    __end__: END,
  });

  logger.info('Text-summarizer workflow graph created successfully');

  return graph.compile();
}

// ============================================================================
// 6. 摘要工作流工厂
// ============================================================================

/**
 * 摘要工作流工厂
 */
export class TextSummarizerWorkflowFactory implements WorkflowFactory<TextSummarizerState> {
  public readonly type: string = 'text-summarizer';
  public readonly version: string = '1.0.0';
  public readonly name: string = '文本摘要工作流';
  public readonly description: string = '基于LLM的文本摘要生成工具，支持长文本压缩';

  /**
   * 创建工作流图
   */
  createGraph(): any {
    return createTextSummarizerGraph();
  }

  /**
   * 创建工作流状态
   */
  createState(params: WorkflowParams): TextSummarizerState {
    logger.debug('Creating text-summarizer workflow state', {
      taskId: params.taskId,
      params: Object.keys(params),
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
    return WorkflowStateFactory.extendState<TextSummarizerState>(baseState, {
      sourceText: params.sourceText,
      maxLength: params.maxLength,
      summarizeRetryCount: 0,
    });
  }

  /**
   * 验证工作流参数
   */
  validateParams(params: WorkflowParams): boolean {
    const requiredParams = ['taskId', 'sourceText'];
    const hasAllRequired = requiredParams.every(param => params[param]);

    if (!hasAllRequired) {
      logger.error('Missing required parameters', {
        missing: requiredParams.filter(param => !params[param]),
      });
      return false;
    }

    if (params.sourceText && params.sourceText.trim().length === 0) {
      logger.error('Source text cannot be empty');
      return false;
    }

    if (params.maxLength !== undefined && (typeof params.maxLength !== 'number' || params.maxLength < 10)) {
      logger.error('Invalid maxLength');
      return false;
    }

    logger.debug('Text-summarizer workflow parameters validated successfully');
    return true;
  }

  /**
   * 获取工作流元数据
   */
  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      version: this.version,
      name: this.name,
      description: this.description,
      category: 'content',
      tags: ['llm', 'ai', 'quality-check'],
      author: 'User',
      createdAt: '2026-02-03',
      requiredParams: ['sourceText'],
      optionalParams: ['maxLength'],
      examples: [
        {
          name: '基础示例',
          description: '生成文章摘要',
          params: {
            sourceText: '人工智能（AI）是计算机科学的一个分支...',
            maxLength: 100,
          },
        },
        {
          name: '长文本摘要',
          description: '生成长文摘要',
          params: {
            sourceText: '区块链技术是一种分布式账本技术...',
            maxLength: 300,
          },
        },
      ],
      paramDefinitions: [
        {
          name: 'sourceText',
          description: '待摘要的原始文本',
          type: 'string',
          required: true,
        },
        {
          name: 'maxLength',
          description: '摘要最大长度（字符数）',
          type: 'number',
          required: false,
          defaultValue: 200,
          examples: ['100', '200', '500'],
        },
      ],
      stepNames: {
        summarize: '摘要',
        checkQuality: '质检',
      },
      retryFields: [
        { name: 'summarizeRetryCount', displayName: '摘要重试' },
      ],
    };
  }
}

// ============================================================================
// 7. 导出
// ============================================================================

/**
 * 摘要工作流工厂实例
 */
export const textSummarizerWorkflowFactory = new TextSummarizerWorkflowFactory();
```

---

## 3. 使用生成的作品流

### 3.1 CLI 执行

```bash
# 查看工作流信息
pnpm run cli workflow info text-summarizer

# 执行工作流
pnpm run cli create --type text-summarizer \
  --source-text "人工智能（AI）是计算机科学的一个分支..." \
  --max-length 100

# 执行结果
🚀 创建工作流任务
========================================
工作流类型: 文本摘要工作流 (text-summarizer)
描述: 基于LLM的文本摘要生成工具，支持长文本压缩
执行模式: sync
========================================

✅ 执行成功
========================================
任务ID: task-abc123
状态: 已完成
耗时: 15.2s
步骤: summarize → checkQuality
========================================

📝 生成的内容:
========================================
人工智能是计算机科学的重要分支，致力于研究如何让计算机模拟人类智能。本文介绍了AI的发展历程、核心技术和应用领域...
========================================
```

### 3.2 编程方式调用

```typescript
import { WorkflowRegistry } from './workflow/index.js';

// 创建状态
const state = WorkflowRegistry.createState('text-summarizer', {
  taskId: 'task-001',
  mode: 'sync',
  sourceText: '长文本内容...',
  maxLength: 200,
});

// 执行工作流
const graph = WorkflowRegistry.createGraph('text-summarizer');
const result = await graph.invoke(state);

console.log(result.summary);
```

---

**附录结束**

> 此示例展示了通过脚手架工具生成的完整工作流代码，包括状态定义、节点实现、路由逻辑、工作流图和工厂类。
