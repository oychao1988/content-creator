/**
 * Write Node - 写作节点
 *
 * 根据整理后的信息撰写文章内容
 * 支持初始写作和重写两种模式
 */

import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';
import { enhancedLLMService } from '../../../services/llm/EnhancedLLMService.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('WriteNode');

/**
 * Write Node 配置
 */
interface WriteNodeConfig {
  maxRetries?: number;
}

/**
 * 初始写作 Prompt 模板
 */
const WRITE_PROMPT = `你是一位专业的内容创作者。根据以下信息撰写一篇文章：

【主题】{topic}

【要求】{requirements}

【⚠️ 字数要求 - 必须严格遵守】
- 最少字数：{minWords} 字
- 最多字数：{maxWords} 字
- 字数范围：{minWords}-{maxWords} 字

【必须包含的关键词】
{keywords}

【参考资料】
1. 搜索结果：
{searchResults}

2. 文章大纲：
{outline}

3. 关键点：
{keyPoints}

【写作要求】
请撰写一篇完整的文章，务必确保：

1. ⚠️ 字数控制是最高优先级要求
   - 如果字数不足 {minWords}，需要补充内容
   - 如果字数超过 {maxWords}，必须精简内容
   - 字数必须严格控制在 {minWords}-{maxWords} 之间

2. 内容要求
   - 内容原创，不抄袭
   - 逻辑清晰，条理分明
   - 语言流畅，表达准确

3. 结构要求
   - 包含标题、导语、正文、结语
   - 参考大纲结构，但可以根据内容需要灵活调整

4. 关键词要求
   - 必须包含所有指定关键词：{keywords}
   - 关键词要自然融入文章内容

【输出格式】
以 Markdown 格式输出完整文章。

【⚠️ 重要提醒】
请在生成文章后：
1. 检查字数是否在 {minWords}-{maxWords} 范围内
2. 如果字数不符合要求，请调整内容长度
3. 字数不符合要求将被视为不合格作品
`;

/**
 * 重写 Prompt 模板（有质检反馈时）
 */
const REWRITE_PROMPT = `你是一位专业的内容创作者。根据以下质检反馈，修改上一版文章：

【🚨 字数问题 - 最高优先级】
{hasWordCountIssue}
{wordCountFeedback}

【⚠️ 字数要求 - 必须满足】
- 目标字数范围：{minWords} - {maxWords} 字
- 上次字数未达标，本次必须解决！

【字数调整策略】
{strategy}

【其他质检反馈】
{fixSuggestions}

【修改要求】
优先级顺序：
1. ⚠️⚠️⚠️ 字数调整（最高优先级，必须解决）
   - 如果上面标注了字数不足/超出，必须严格按照建议调整
   - 字数必须在 {minWords}-{maxWords} 范围内
   - 宁可超出也不要不足（但超出不能超过 {maxWords}）

2. 其他问题修复
   - 根据其他质检反馈修改有问题的部分
   - 保持文章的核心观点和关键信息
   - 保持文章的整体风格和连贯性

3. 关键词要求
   - 必须包含所有关键词：{keywords}
   - 关键词要自然融入文章内容

【上一版文章】
{previousContent}

【🚨 重要提醒】
修改完成后请自检：
1. ✅ 字数是否在 {minWords}-{maxWords} 范围内？← 最重要！
2. ✅ 是否解决了所有字数问题？
3. ✅ 是否包含了所有关键词？
4. ✅ 文章逻辑是否连贯？

请直接输出修改后的完整文章（Markdown 格式），不要添加任何额外说明。
`;

/**
 * Write Node 实现
 */
export class WriteNode extends BaseNode {
  constructor(_config: WriteNodeConfig = {}) {
    super({
      name: 'write',
      retryCount: 1, // 质检失败后会重试，这里设为 1
      timeout: 240000, // 240 秒超时（流式请求 + 重试需要更长时间）
    });

    // Note: config.maxRetries is available but not currently used
    // Retries are controlled by the workflow's checkText node
  }

  /**
   * 判断是否为重写模式
   */
  private isRewriteMode(state: WorkflowState): boolean {
    return !!(
      state.previousContent &&
      state.textQualityReport?.fixSuggestions &&
      state.textQualityReport.fixSuggestions.length > 0
    );
  }

  /**
   * 从质检反馈中提取字数相关的建议
   */
  private extractWordCountFeedback(state: WorkflowState): {
    hasWordCountIssue: boolean;
    wordCountFeedback: string;
  } {
    if (!state.textQualityReport?.fixSuggestions) {
      return { hasWordCountIssue: false, wordCountFeedback: '' };
    }

    // 查找包含"字数"关键词的建议
    const wordCountSuggestions = state.textQualityReport.fixSuggestions.filter(s =>
      s.includes('字数不足') || s.includes('字数超出')
    );

    if (wordCountSuggestions.length === 0) {
      return { hasWordCountIssue: false, wordCountFeedback: '' };
    }

    return {
      hasWordCountIssue: true,
      wordCountFeedback: wordCountSuggestions.join('\n\n'),
    };
  }

  /**
   * 获取字数调整策略模板
   */
  private getWordCountStrategyTemplate(state: WorkflowState): string {
    if (!state.previousContent) {
      return '';
    }

    const wordCount = state.previousContent.length;
    const minWords = state.hardConstraints.minWords || 500;
    const maxWords = state.hardConstraints.maxWords || 1000;

    if (wordCount < minWords) {
      const shortage = minWords - wordCount;
      const shortagePercent = Math.round((shortage / minWords) * 100);

      if (shortagePercent < 10) {
        return `【小幅扩充策略】
- 为每个段落添加1-2句补充说明
- 增加1-2个具体案例的细节描述
- 添加数据或引用支撑
- 优化过渡句，使段落更连贯`;
      } else if (shortagePercent < 25) {
        return `【中等扩充策略】
- 增加2-3个新案例，每个100-150字
- 为每个主要观点添加详细论证
- 增加背景介绍或相关研究数据
- 增加实际应用场景说明
- 扩展现有案例的分析深度`;
      } else {
        return `【大幅扩充策略】
- 增加3-5个全新案例（每个150-200字）
- 为每个主要观点添加详细论证和反面论证
- 添加完整的背景介绍、研究数据、行业趋势
- 增加实际应用场景、成功案例、失败教训
- 添加FAQ或常见问题解答部分
- 扩展每个案例的深度分析`;
      }
    } else if (wordCount > maxWords) {
      const excess = wordCount - maxWords;
      const excessPercent = Math.round((excess / wordCount) * 100);

      if (excessPercent < 10) {
        return `【小幅精简策略】
- 删除冗余的形容词和副词
- 合并相似的段落
- 删除重复的观点表达
- 简化过长的句子`;
      } else if (excessPercent < 25) {
        return `【中等精简策略】
- 删除1-2个次要案例
- 合并相似观点的段落
- 删除扩展说明，只保留核心内容
- 简化长句，使用更精炼的表达`;
      } else {
        return `【大幅精简策略】
- 只保留最核心的3-5个案例
- 删除所有扩展说明和背景介绍
- 每个案例只保留关键信息
- 删除FAQ和额外章节
- 使用最简洁的表达方式`;
      }
    }

    return '';
  }

  /**
   * 格式化搜索结果
   */
  private formatSearchResults(searchResults: WorkflowState['searchResults']): string {
    if (!searchResults || searchResults.length === 0) {
      return '（无搜索结果）';
    }

    // 限制显示前 5 条结果，避免 Token 过多
    return searchResults
      .slice(0, 5)
      .map((result, index) => {
        const content =
          result.content.length > 300
            ? result.content.substring(0, 300) + '...'
            : result.content;

        return `${index + 1}. ${result.title}
   ${content}`;
      })
      .join('\n\n');
  }

  /**
   * 构建 Prompt 参数
   */
  private buildPromptParams(state: WorkflowState): Record<string, string> {
    const { hasWordCountIssue, wordCountFeedback } = this.extractWordCountFeedback(state);

    return {
      topic: state.topic,
      requirements: state.requirements,
      minWords: String(state.hardConstraints.minWords || 500),
      maxWords: String(state.hardConstraints.maxWords || 1000),
      keywords: state.hardConstraints.keywords?.join(', ') || '无',
      searchResults: this.formatSearchResults(state.searchResults),
      outline: state.organizedInfo?.outline || '',
      keyPoints: state.organizedInfo?.keyPoints?.join('\n') || '',
      previousContent: state.previousContent || '',
      fixSuggestions:
        state.textQualityReport?.fixSuggestions?.join('\n') || '',
      // 🆕 添加专门字数反馈字段
      hasWordCountIssue: hasWordCountIssue ? '是' : '否',
      wordCountFeedback: wordCountFeedback,
      strategy: this.getWordCountStrategyTemplate(state),
    };
  }

  /**
   * 构建 Prompt
   */
  private buildPrompt(
    state: WorkflowState,
    params: Record<string, string>
  ): string {
    const template = this.isRewriteMode(state) ? REWRITE_PROMPT : WRITE_PROMPT;

    return template.replace(/\{(\w+)\}/g, (_, key) => params[key] || '');
  }

  /**
   * 调用 LLM 生成/重写文章
   */
  private async callLLM(
    state: WorkflowState,
    prompt: string
  ): Promise<string> {
    const isRewrite = this.isRewriteMode(state);

    // 🆕 增强日志记录
    const logContext: any = {
      taskId: state.taskId,
      mode: isRewrite ? 'rewrite' : 'initial',
      retryCount: state.textRetryCount,
      stream: true,
    };

    // 如果是重写模式，记录字数分析信息
    if (isRewrite && state.previousContent) {
      const wordCount = state.previousContent.length;
      const minWords = state.hardConstraints.minWords || 500;
      const maxWords = state.hardConstraints.maxWords || 1000;
      const { hasWordCountIssue } = this.extractWordCountFeedback(state);

      logContext.previousWordCount = wordCount;
      logContext.minRequired = minWords;
      logContext.maxRequired = maxWords;
      logContext.hasWordCountIssue = hasWordCountIssue;
      logContext.strategy = this.getWordCountStrategyTemplate(state);

      if (hasWordCountIssue) {
        logger.info('Write retry word count analysis', logContext);
      }
    }

    logger.debug('Calling LLM to write article', logContext);

    const systemMessage =
      '你是一位专业的内容创作者。请根据要求撰写高质量的文章。';

    const result = await enhancedLLMService.chat({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      taskId: state.taskId,
      stepName: 'write',
      stream: true, // 启用流式请求
    });

    logger.info('LLM write completed', {
      taskId: state.taskId,
      contentLength: result.content.length,
      mode: isRewrite ? 'rewrite' : 'initial',
      stream: true,
    });

    return result.content;
  }

  /**
   * 验证文章内容
   * 检查字数、关键词等约束，但只输出警告，不阻止流程
   * 质量检查和重试决策由 checkText 节点负责
   */
  private validateContent(state: WorkflowState, content: string): void {
    logger.debug('Validating article content', {
      taskId: state.taskId,
      contentLength: content.length,
    });

    const warnings: string[] = [];

    // 1. 检查字数（改为警告）
    const wordCount = content.length;

    if (state.hardConstraints.minWords && wordCount < state.hardConstraints.minWords) {
      warnings.push(`Word count insufficient: ${wordCount} < ${state.hardConstraints.minWords}`);
    }

    if (state.hardConstraints.maxWords && wordCount > state.hardConstraints.maxWords) {
      warnings.push(`Word count exceeded: ${wordCount} > ${state.hardConstraints.maxWords}`);
    }

    // 2. 检查关键词（改为警告）
    if (state.hardConstraints.keywords && state.hardConstraints.keywords.length > 0) {
      const missingKeywords = state.hardConstraints.keywords.filter(
        (keyword) => !content.includes(keyword)
      );

      if (missingKeywords.length > 0) {
        warnings.push(`Missing keywords: ${missingKeywords.join(', ')}`);
      }
    }

    // 3. 检查基本结构（警告）
    const hasTitle = /^#\s+.+/.test(content);
    if (!hasTitle) {
      warnings.push('Article may be missing title');
    }

    // 输出所有警告信息（不阻止流程）
    if (warnings.length > 0) {
      logger.warn('Content validation warnings (will be checked by checkText node)', {
        taskId: state.taskId,
        wordCount,
        warnings,
      });
    } else {
      logger.info('Content validation passed', {
        taskId: state.taskId,
        wordCount,
      });
    }
  }

  /**
   * 执行写作逻辑
   */
  protected async executeLogic(state: WorkflowState): Promise<Partial<WorkflowState>> {
    const isRewrite = this.isRewriteMode(state);

    logger.info('Starting write', {
      taskId: state.taskId,
      mode: isRewrite ? 'rewrite' : 'initial',
      topic: state.topic,
    });

    try {
      // 1. 构建 Prompt
      const params = this.buildPromptParams(state);
      const prompt = this.buildPrompt(state, params);

      // 2. 调用 LLM
      const content = await this.callLLM(state, prompt);

      // 3. 验证内容
      this.validateContent(state, content);

      // 4. 返回结果
      logger.info('Write completed successfully', {
        taskId: state.taskId,
        mode: isRewrite ? 'rewrite' : 'initial',
        contentLength: content.length,
      });

      return {
        articleContent: content,
      };
    } catch (error) {
      logger.error('Write failed', {
        taskId: state.taskId,
        mode: isRewrite ? 'rewrite' : 'initial',
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
        } : {
          message: String(error),
        },
      });

      // 写作失败时抛出错误，让工作流重试
      throw error;
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: WorkflowState): void {
    super.validateState(state);

    if (!state.requirements || state.requirements.trim().length === 0) {
      throw new Error('Requirements are required for write');
    }

    // 如果是初始模式，需要有组织信息
    if (!this.isRewriteMode(state)) {
      if (!state.organizedInfo) {
        throw new Error('Organized info is required for initial write');
      }
    }
    // 如果是重写模式，需要有上一版内容和质检反馈
    else {
      if (!state.previousContent) {
        throw new Error('Previous content is required for rewrite');
      }

      if (!state.textQualityReport?.fixSuggestions) {
        throw new Error('Quality report with fix suggestions is required for rewrite');
      }
    }
  }
}

/**
 * Write Node 单例导出（默认配置）
 */
export const writeNode = new WriteNode();
