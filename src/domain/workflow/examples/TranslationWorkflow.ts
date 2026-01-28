/**
 * TranslationWorkflow - 翻译工作流实现
 *
 * 一个完整的翻译工作流示例，包含：
 * - 翻译节点：使用 LLM 进行文本翻译
 * - 质检节点：检查翻译质量
 * - 支持质检失败重试
 *
 * 工作流类型：'translation'
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { ExecutionMode } from '../../entities/Task.js';
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { WorkflowStateFactory } from '../BaseWorkflowState.js';
import { BaseNode } from '../nodes/BaseNode.js';
import { enhancedLLMService } from '../../../services/llm/EnhancedLLMService.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';

const logger = createLogger('TranslationWorkflow');

// ============================================================================
// 1. 翻译工作流状态定义
// ============================================================================

/**
 * 翻译工作流状态接口
 *
 * 继承自 BaseWorkflowState，包含翻译工作流的特定字段
 */
export interface TranslationState extends BaseWorkflowState {
  // ========== 输入参数 ==========
  sourceText: string;              // 源文本（待翻译）
  sourceLanguage: string;         // 源语言（如 'zh', 'en', 'ja'）
  targetLanguage: string;         // 目标语言（如 'zh', 'en', 'ja'）
  translationStyle?: string;      // 翻译风格（如 'formal', 'casual', 'technical'）
  domain?: string;                // 领域（如 'technology', 'medical', 'legal'）

  // ========== 流程数据 ==========
  translatedText?: string;        // 翻译后的文本
  previousTranslation?: string;   // 上一次的翻译结果（用于质检失败重试）

  // ========== 质检数据 ==========
  qualityReport?: {
    score: number;                // 质量评分（0-10）
    passed: boolean;              // 是否通过质检
    fixSuggestions?: string[];    // 改进建议
    checkedAt: number;            // 质检时间
  };

  // ========== 控制数据 ==========
  translationRetryCount: number;  // 翻译重试次数
}

// ============================================================================
// 2. 翻译节点实现
// ============================================================================

/**
 * 翻译节点配置
 */
interface TranslateNodeConfig {
  maxRetries?: number;
}

/**
 * 翻译节点实现
 */
class TranslateNode extends BaseNode<TranslationState> {
  constructor(config: TranslateNodeConfig = {}) {
    super({
      name: 'translate',
      retryCount: config.maxRetries ?? 2,
      timeout: 120000, // 120秒超时
    });
  }

  /**
   * 构建翻译 Prompt
   */
  private buildPrompt(state: TranslationState): string {
    const style = state.translationStyle ? `【翻译风格】${state.translationStyle}` : '';
    const domain = state.domain ? `【领域】${state.domain}` : '';

    return `你是一位专业的翻译专家。请将以下文本从${this.getLanguageName(state.sourceLanguage)}翻译为${this.getLanguageName(state.targetLanguage)}。

${style}
${domain}

【待翻译文本】
${state.sourceText}

【翻译要求】
1. 准确传达原文含义
2. 语言表达自然流畅
3. 符合目标语言的语法和表达习惯
${state.translationStyle ? `4. 保持${state.translationStyle}风格` : ''}
${state.domain ? `5. 符合${state.domain}领域的专业术语` : ''}

请直接输出翻译结果，不要添加任何额外说明。`;
  }

  /**
   * 获取语言名称
   */
  private getLanguageName(languageCode: string): string {
    const languageNames: Record<string, string> = {
      zh: '中文',
      en: '英文',
      ja: '日文',
      ko: '韩文',
      fr: '法文',
      de: '德文',
      es: '西班牙文',
      ru: '俄文',
    };

    return languageNames[languageCode.toLowerCase()] ?? languageCode;
  }

  /**
   * 调用 LLM 进行翻译
   */
  private async callLLM(state: TranslationState, prompt: string): Promise<string> {
    logger.debug('Calling LLM for translation', {
      taskId: state.taskId,
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
    });

    const systemMessage = '你是一位专业的翻译专家。请准确翻译文本。';

    const result = await enhancedLLMService.chat({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      taskId: state.taskId,
      stepName: 'translate',
    });

    logger.info('Translation completed', {
      taskId: state.taskId,
      sourceLength: state.sourceText.length,
      targetLength: result.content.length,
    });

    return result.content.trim();
  }

  /**
   * 验证翻译结果
   */
  private validateTranslation(state: TranslationState, translation: string): void {
    logger.debug('Validating translation', {
      taskId: state.taskId,
      translationLength: translation.length,
    });

    const warnings: string[] = [];

    if (translation.length < state.sourceText.length * 0.3) {
      warnings.push('Translation seems too short');
    }

    if (translation.length > state.sourceText.length * 3) {
      warnings.push('Translation seems too long');
    }

    if (translation.toLowerCase().includes('todo') || translation.includes('待翻译')) {
      warnings.push('Translation contains placeholder text');
    }

    if (warnings.length > 0) {
      logger.warn('Translation validation warnings', {
        taskId: state.taskId,
        warnings,
      });
    }
  }

  /**
   * 执行翻译逻辑
   */
  protected async executeLogic(state: TranslationState): Promise<Partial<TranslationState>> {
    logger.info('Starting translation', {
      taskId: state.taskId,
      sourceLanguage: state.sourceLanguage,
      targetLanguage: state.targetLanguage,
      isRetry: !!state.previousTranslation,
    });

    try {
      // 1. 构建 Prompt
      const prompt = this.buildPrompt(state);

      // 2. 调用 LLM 翻译
      const translation = await this.callLLM(state, prompt);

      // 3. 验证翻译结果
      this.validateTranslation(state, translation);

      // 4. 返回结果
      logger.info('Translation completed successfully', {
        taskId: state.taskId,
        sourceLength: state.sourceText.length,
        targetLength: translation.length,
      });

      return {
        translatedText: translation,
      };
    } catch (error) {
      logger.error('Translation failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: TranslationState): void {
    super.validateState(state);

    if (!state.sourceText || state.sourceText.trim().length === 0) {
      throw new Error('Source text is required for translation');
    }

    if (!state.sourceLanguage || state.sourceLanguage.trim().length === 0) {
      throw new Error('Source language is required for translation');
    }

    if (!state.targetLanguage || state.targetLanguage.trim().length === 0) {
      throw new Error('Target language is required for translation');
    }

    if (state.sourceLanguage.toLowerCase() === state.targetLanguage.toLowerCase()) {
      throw new Error('Source and target languages must be different');
    }
  }
}

// ============================================================================
// 3. 翻译质检节点实现
// ============================================================================

/**
 * 翻译质检节点配置
 */
interface TranslationQualityNodeConfig {
  minPassingScore?: number; // 最低通过分数（0-10）
}

/**
 * 翻译质检节点实现
 */
class TranslationQualityNode extends BaseNode<TranslationState> {
  private config: TranslationQualityNodeConfig;

  constructor(config: TranslationQualityNodeConfig = {}) {
    super({
      name: 'checkQuality',
      retryCount: 1,
      timeout: 60000, // 60秒超时
    });

    const isTestEnvironment = process.env.NODE_ENV === 'test';
    this.config = {
      minPassingScore: isTestEnvironment ? 6.0 : 8.0,
      ...config,
    };
  }

  /**
   * 构建质检 Prompt
   */
  private buildPrompt(state: TranslationState): string {
    const style = state.translationStyle ? `【翻译风格】${state.translationStyle}` : '';
    const domain = state.domain ? `【领域】${state.domain}` : '';

    return `你是一位专业的翻译质量评估专家。请评估以下翻译的质量。

${style}
${domain}

【源文本（${this.getLanguageName(state.sourceLanguage)}）】
${state.sourceText}

【翻译文本（${this.getLanguageName(state.targetLanguage)}）】
${state.translatedText}

请从以下维度评估（每项 1-10 分）：
1. **准确性**（accuracy）：是否准确传达原文含义
2. **流畅性**（fluency）：语言表达是否自然流畅
3. **一致性**（consistency）：术语和风格是否一致
4. **完整性**（completeness）：是否完整翻译了所有内容

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
4. passed 字段表示是否通过质检（score >= 8 为通过）
5. 如果有问题，提供具体的改进建议`;
  }

  /**
   * 获取语言名称
   */
  private getLanguageName(languageCode: string): string {
    const languageNames: Record<string, string> = {
      zh: '中文',
      en: '英文',
      ja: '日文',
      ko: '韩文',
      fr: '法文',
      de: '德文',
      es: '西班牙文',
      ru: '俄文',
    };

    return languageNames[languageCode.toLowerCase()] ?? languageCode;
  }

  /**
   * 调用 LLM 进行质检
   */
  private async callLLMForQualityCheck(state: TranslationState): Promise<{ score: number; passed: boolean; fixSuggestions: string[] }> {
    logger.debug('Calling LLM for quality check', {
      taskId: state.taskId,
    });

    const systemMessage = '你是一位专业的翻译质量评估专家。请严格按照 JSON 格式返回评估结果。';

    const result = await enhancedLLMService.chat({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: this.buildPrompt(state) },
      ],
      taskId: state.taskId,
      stepName: 'checkQuality',
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
      passed: output.passed || false,
      fixSuggestions: output.fixSuggestions || [],
    };
  }

  /**
   * 执行质检逻辑
   */
  protected async executeLogic(state: TranslationState): Promise<Partial<TranslationState>> {
    logger.info('Starting quality check', {
      taskId: state.taskId,
    });

    try {
      // 1. 调用 LLM 进行质检
      const qualityResult = await this.callLLMForQualityCheck(state);

      // 2. 构建质检报告
      const qualityReport = {
        score: qualityResult.score,
        passed: qualityResult.passed || qualityResult.score >= this.config.minPassingScore!,
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
      const result: Partial<TranslationState> = {
        qualityReport,
      };

      // 如果质检失败，保存上一次翻译结果并递增重试计数
      if (!qualityReport.passed) {
        result.previousTranslation = state.translatedText;
        result.translationRetryCount = (state.translationRetryCount || 0) + 1;

        logger.info('Quality check failed, incrementing retry count', {
          taskId: state.taskId,
          retryCount: result.translationRetryCount,
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
  protected validateState(state: TranslationState): void {
    super.validateState(state);

    if (!state.translatedText || state.translatedText.trim().length === 0) {
      throw new Error('Translated text is required for quality check');
    }
  }
}

// ============================================================================
// 4. 工作流路由函数
// ============================================================================

/**
 * 翻译后的路由函数
 */
function routeAfterTranslate(state: TranslationState): string {
  logger.debug('Routing after translate', {
    taskId: state.taskId,
    hasTranslatedText: !!state.translatedText,
  });

  if (state.translatedText) {
    return 'checkQuality';
  }

  throw new Error('No translated text to check');
}

/**
 * 质检后的路由函数
 */
function routeAfterCheckQuality(state: TranslationState): string {
  logger.debug('Routing after check quality', {
    taskId: state.taskId,
    passed: state.qualityReport?.passed,
    retryCount: state.translationRetryCount,
  });

  // 如果质检通过，结束
  if (state.qualityReport?.passed) {
    logger.info('Quality check passed, workflow completed', {
      taskId: state.taskId,
      score: state.qualityReport.score,
    });
    return '__end__';
  }

  // 如果质检失败但重试次数未满，重试翻译
  if (state.translationRetryCount < 2) {
    logger.info('Quality check failed, retrying translate', {
      taskId: state.taskId,
      retryCount: state.translationRetryCount,
      maxRetries: 2,
    });
    return 'translate';
  }

  // 重试次数已满，抛出错误
  logger.error('Quality check failed after max retries', {
    taskId: state.taskId,
    retryCount: state.translationRetryCount,
  });
  throw new Error('Quality check failed after 2 attempts');
}

// ============================================================================
// 5. 翻译工作流图创建
// ============================================================================

/**
 * 创建翻译工作流图
 */
function createTranslationGraph(): any {
  logger.info('Creating translation workflow graph');

  // 创建节点实例
  const translateNode = new TranslateNode().toLangGraphNode();
  const checkQualityNode = new TranslationQualityNode().toLangGraphNode();

  // 创建 StateGraph
  const graph = new StateGraph<TranslationState>({
    channels: {
      // 基础字段
      taskId: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      workflowType: {
        default: () => 'translation' as const,
        reducer: (x?: string, y?: string) => (y ?? x ?? 'translation') as 'translation',
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
      sourceLanguage: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      targetLanguage: {
        default: () => '',
        reducer: (x?: string, y?: string) => y ?? x ?? '',
      },
      translationStyle: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      domain: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },

      // 流程数据
      translatedText: {
        default: () => undefined,
        reducer: (x?: string, y?: string) => y ?? x,
      },
      previousTranslation: {
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
      translationRetryCount: {
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
  graph.addNode('translate', translateNode);
  graph.addNode('checkQuality', checkQualityNode);

  // 设置入口点和边
  graph.addEdge(START as any, 'translate');
  graph.addConditionalEdges('translate' as any, routeAfterTranslate, {
    checkQuality: 'checkQuality',
  });
  graph.addConditionalEdges('checkQuality' as any, routeAfterCheckQuality, {
    translate: 'translate',
    __end__: END,
  });

  logger.info('Translation workflow graph created successfully');

  return graph.compile();
}

// ============================================================================
// 6. 翻译工作流工厂
// ============================================================================

/**
 * 翻译工作流工厂
 */
export class TranslationWorkflowFactory implements WorkflowFactory<TranslationState> {
  public readonly type: string = 'translation';
  public readonly version: string = '1.0.0';
  public readonly name: string = '翻译工作流';
  public readonly description: string = '基于 LLM 的文本翻译工作流，包含翻译和质量检查';

  /**
   * 创建工作流图
   */
  createGraph(): any {
    return createTranslationGraph();
  }

  /**
   * 创建工作流状态
   */
  createState(params: WorkflowParams): TranslationState {
    logger.debug('Creating translation workflow state', {
      taskId: params.taskId,
      params: Object.keys(params),
    });

    // 验证必需参数
    const requiredParams = ['sourceText', 'sourceLanguage', 'targetLanguage'];
    for (const param of requiredParams) {
      if (!params[param]) {
        throw new Error(`Missing required parameter: ${param}`);
      }
    }

    // 创建基础状态
    const baseState = WorkflowStateFactory.createBaseState({
      taskId: params.taskId,
      workflowType: this.type,
      mode: params.mode || ExecutionMode.SYNC,
    });

    // 扩展为翻译工作流状态
    return WorkflowStateFactory.extendState<TranslationState>(baseState, {
      sourceText: params.sourceText,
      sourceLanguage: params.sourceLanguage,
      targetLanguage: params.targetLanguage,
      translationStyle: params.translationStyle,
      domain: params.domain,
      translationRetryCount: 0,
    });
  }

  /**
   * 验证工作流参数
   */
  validateParams(params: WorkflowParams): boolean {
    const requiredParams = ['taskId', 'sourceText', 'sourceLanguage', 'targetLanguage'];
    const hasAllRequired = requiredParams.every(param => params[param]);

    if (!hasAllRequired) {
      logger.error('Missing required parameters', {
        missing: requiredParams.filter(param => !params[param]),
      });
      return false;
    }

    if (params.sourceLanguage && params.targetLanguage &&
        params.sourceLanguage.toLowerCase() === params.targetLanguage.toLowerCase()) {
      logger.error('Source and target languages must be different');
      return false;
    }

    if (params.sourceText && params.sourceText.trim().length === 0) {
      logger.error('Source text cannot be empty');
      return false;
    }

    logger.debug('Translation workflow parameters validated successfully');
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
      category: 'translation',
      tags: ['translation', 'llm', 'quality-check'],
      author: 'Content Creator System',
      createdAt: '2025-01-28',
      requiredParams: ['sourceText', 'sourceLanguage', 'targetLanguage'],
      optionalParams: ['translationStyle', 'domain'],
      examples: [
        {
          name: '中英翻译',
          description: '将中文文本翻译为英文',
          params: {
            sourceText: '人工智能正在改变世界',
            sourceLanguage: 'zh',
            targetLanguage: 'en',
            translationStyle: 'formal',
            domain: 'technology',
          },
        },
        {
          name: '英日翻译',
          description: '将英文文本翻译为日文',
          params: {
            sourceText: 'Machine learning is revolutionizing many industries',
            sourceLanguage: 'en',
            targetLanguage: 'ja',
            translationStyle: 'technical',
            domain: 'technology',
          },
        },
      ],
    };
  }
}

// ============================================================================
// 7. 导出
// ============================================================================

/**
 * 翻译工作流工厂实例
 */
export const translationWorkflowFactory = new TranslationWorkflowFactory();
