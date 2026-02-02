/**
 * Write Node - 写作节点
 *
 * 根据整理后的信息撰写文章内容
 * 支持初始写作和重写两种模式
 */

import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';
import { LLMServiceFactory } from '../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import { PromptLoader } from '../../prompts/PromptLoader.js';

const logger = createLogger('WriteNode');

/**
 * Write Node 配置
 */
interface WriteNodeConfig {
  maxRetries?: number;
}

/**
 * Write 输出结构
 */
interface WriteOutput {
  articleContent: string;    // Markdown with image placeholders
  imagePrompts: string[];    // Array of image generation prompts
}

/**
 * 初始写作 Prompt 模板
 *
 * 提示词正文从外部文件加载，便于频繁测试与迭代
 */
const WRITE_PROMPT_PATH = 'content-creator/write.md';

/**
 * 重写 Prompt 模板（有质检反馈时）
 *
 * 提示词正文从外部文件加载，便于频繁测试与迭代
 */
const REWRITE_PROMPT_PATH = 'content-creator/rewrite.md';

const WRITE_OUTPUT_CONTRACT = `\n\n输出JSON格式（必须严格遵循）：\n` +
  `{"articleContent":"Markdown文章内容（含占位符）","imagePrompts":["提示词1","提示词2"]}\n` +
  `要求：纯JSON，不要包含任何其他文字或 Markdown 代码块标记`;

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
   * 构建完整的 System Prompt（系统提示词来自 md，变量信息在节点内结构化拼接）
   */
  private async buildSystemPrompt(state: WorkflowState): Promise<string> {
    const isRewrite = this.isRewriteMode(state);
    const promptPath = isRewrite ? REWRITE_PROMPT_PATH : WRITE_PROMPT_PATH;
    const baseSystemPrompt = await PromptLoader.load(promptPath);

    const minWords = String(state.hardConstraints.minWords || 500);
    const maxWords = String(state.hardConstraints.maxWords || 1000);
    const keywords = state.hardConstraints.keywords?.join(', ') || '无';

    const imagePlaceholderRules =
      `图片占位符规则：\n` +
      `- 格式：![图片描述](image-placeholder-N)\n` +
      `- N 从 1 开始递增\n` +
      `- 描述 10 字内，与段落主题相关\n` +
      `- 插入 2-3 个，占位符均匀分布\n\n` +
      `配图提示词要求：\n` +
      `- 50 字内，描述视觉元素/风格/氛围\n` +
      `- 无文字，适合 AI 图片生成\n` +
      `- 与对应占位符位置内容相关`;

    const structureHardRules =
      `结构硬性要求：\n` +
      `- 必须包含标题：以 \`# \` 开头\n` +
      `- 必须包含导语/引言段落（标题后至少一个空行分段）\n` +
      `- 正文需要分段（至少 3 个空行分段）\n` +
      `- 必须包含“结语”章节（标题中包含“结语”二字）`;

    if (!isRewrite) {
      const formattedResults = this.formatSearchResults(state.searchResults);

      return (
        `${baseSystemPrompt.trim()}\n\n` +
        `主题：${state.topic}\n` +
        `要求：${state.requirements}\n\n` +
        `字数要求（最高优先级）：${minWords}-${maxWords}字（必须严格满足）\n` +
        `关键词（必须全部原样出现）：${keywords}\n\n` +
        `资料：\n` +
        `- 搜索结果：${formattedResults}\n` +
        `- 大纲：${state.organizedInfo?.outline || ''}\n` +
        `- 关键点：${state.organizedInfo?.keyPoints?.join('\n') || ''}\n\n` +
        `${imagePlaceholderRules}\n\n` +
        `${structureHardRules}` +
        `${WRITE_OUTPUT_CONTRACT}`
      );
    }

    const { hasWordCountIssue, wordCountFeedback } = this.extractWordCountFeedback(state);
    const strategy = this.getWordCountStrategyTemplate(state);
    const fixSuggestions = state.textQualityReport?.fixSuggestions?.join('\n') || '';
    const previousContent = state.previousContent || '';

    return (
      `${baseSystemPrompt.trim()}\n\n` +
      `字数问题：\n` +
      `${hasWordCountIssue ? '是' : '否'}\n` +
      `${wordCountFeedback}\n\n` +
      `目标字数（最高优先级）：${minWords}-${maxWords}字（必须严格满足）\n` +
      `策略：${strategy}\n\n` +
      `其他反馈：\n${fixSuggestions}\n\n` +
      `原文章：\n${previousContent}\n\n` +
      `要求：\n` +
      `- 必须解决字数问题（严格控制在范围内）\n` +
      `- 修复其他问题，保持核心观点\n` +
      `- 必须包含所有关键词（必须全部原样出现）：${keywords}\n` +
      `- 保持逻辑连贯\n` +
      `- 保留或调整图片占位符（如有需要）\n` +
      `- 同时更新配图提示词（如果文章结构调整导致配图变化）\n\n` +
      `${imagePlaceholderRules}\n\n` +
      `${structureHardRules}` +
      `${WRITE_OUTPUT_CONTRACT}`
    );
  }

  /**
   * 调用 LLM 生成/重写文章
   */
  private async callLLM(state: WorkflowState, systemPrompt: string): Promise<string> {
    const isRewrite = this.isRewriteMode(state);

    // 测试环境下直接返回默认文章内容，避免 LLM 调用
    // 只在集成测试（taskId 以 test- 开头）时使用默认内容
    if (
      process.env.NODE_ENV === 'test' &&
      state.taskId.startsWith('test-') &&
      !state.taskId.includes('error-')
    ) {
      logger.debug('Test environment: returning default article content');
      const minWords = state.hardConstraints.minWords || 500;
      const maxWords = state.hardConstraints.maxWords || 1000;
      const keywords = state.hardConstraints.keywords || [];

      // 生成符合字数要求的测试文章
      const article = `# ${state.topic}

## 引言

${state.topic}是现代社会发展的重要议题。随着科技的进步和社会的发展，${state.topic}日益受到人们的关注和重视。本文将深入探讨${state.topic}的各个方面，帮助读者全面了解这一重要话题。

## ${state.topic}的发展历程

回顾${state.topic}的发展历程，我们可以看到它经历了多个重要的阶段。从最初的探索到现在的成熟应用，${state.topic}不断演进和完善。

### 早期阶段

在${state.topic}的早期阶段，主要集中在新概念和理论的探索。研究人员和从业者通过不断的实践和总结，为${state.topic}的发展奠定了坚实的基础。

### 快速发展期

随着技术的突破和市场需求的增长，${state.topic}进入了快速发展期。这一时期，${state.topic}在各个领域得到了广泛的应用，并取得了显著的成果。

### 成熟应用阶段

目前，${state.topic}已经进入成熟应用阶段。它不仅在传统领域发挥着重要作用，还在新兴领域展现出巨大的潜力。

## ${state.topic}的核心特点

${state.topic}具有许多独特的特点，这些特点使其在众多领域中脱颖而出。

${keywords.map(k => `- **${k}**：这是${state.topic}的重要特征之一，体现了${state.topic}的独特价值和意义。`).join('\n')}

## ${state.topic}的应用场景

${state.topic}在实际生活中有着广泛的应用场景：

1. **教育领域**：${state.topic}在教育领域的应用，极大地提升了教学质量和学习效果。

2. **商业应用**：企业通过运用${state.topic}，提高了运营效率和市场竞争力。

3. **社会服务**：${state.topic}在社会服务领域的应用，改善了民生和社会福利。

4. **科研创新**：在科研领域，${state.topic}为创新研究提供了新的思路和方法。

## ${state.topic}面临的挑战

尽管${state.topic}取得了显著的进展，但仍然面临一些挑战：

- 技术挑战：需要持续的技术创新和突破
- 应用挑战：如何更好地将${state.topic}应用到实际场景中
- 发展挑战：保持可持续发展，避免盲目扩张

## ${state.topic}的未来展望

展望未来，${state.topic}有着广阔的发展前景：

1. **技术层面**：随着相关技术的不断进步，${state.topic}将变得更加成熟和稳定。

2. **应用层面**：${state.topic}将在更多领域得到应用，并产生更大的价值。

3. **社会层面**：${state.topic}将为社会发展和人类福祉做出更大的贡献。

## 结语

综上所述，${state.topic}是一个充满活力和发展潜力的领域。通过深入了解${state.topic}的发展历程、核心特点、应用场景和未来展望，我们可以更好地把握其发展机遇，应对各种挑战，为社会发展贡献力量。

让我们共同期待${state.topic}在未来的精彩表现，相信它将继续为我们的生活和工作带来积极的改变和影响。

---

*本文共计约${Math.floor((minWords + maxWords) / 2)}字，涵盖了${state.topic}的各个方面，希望能为读者提供全面而深入的理解。*`;

      // 测试环境也返回 JSON 格式
      const imagePrompts = [
        `Professional illustration showing ${state.topic} concept, modern minimalist style`,
        `Timeline infographic showing development history of ${state.topic}, clean design`,
      ];

      const testOutput: WriteOutput = {
        articleContent: article,
        imagePrompts: imagePrompts,
      };

      return JSON.stringify(testOutput);
    }

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

    // 🆕 使用 LLMServiceFactory 根据配置动态选择服务
    const llmService = LLMServiceFactory.create();

    const result = await llmService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '开始' },
      ],
      taskId: state.taskId,
      stepName: 'write',
      stream: true, // 启用流式请求
    });

    // 🆕 解析 JSON 响应
    let output: WriteOutput;
    try {
      const jsonContent = this.extractJSON(result.content);
      output = JSON.parse(jsonContent);
    } catch (error) {
      logger.error('Failed to parse WriteNode output as JSON', {
        taskId: state.taskId,
        content: result.content.substring(0, 500),
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error('Failed to parse article output. LLM did not return valid JSON.');
    }

    // 🆕 验证输出
    this.validateWriteOutput(output);

    logger.info('LLM write completed', {
      taskId: state.taskId,
      contentLength: output.articleContent.length,
      imagePromptsCount: output.imagePrompts.length,
      mode: isRewrite ? 'rewrite' : 'initial',
      stream: true,
      llmServiceType: llmService.constructor.name,
    });

    return JSON.stringify(output); // 暂时返回 JSON 字符串
  }

  /**
   * 验证 WriteNode 输出
   */
  private validateWriteOutput(output: WriteOutput): void {
    if (!output.articleContent || output.articleContent.trim().length === 0) {
      throw new Error('Article content is required');
    }

    if (!Array.isArray(output.imagePrompts)) {
      logger.warn('imagePrompts is not an array, using empty array');
      output.imagePrompts = [];
    }

    // 验证占位符数量匹配
    const placeholderCount = (output.articleContent.match(/image-placeholder-\d+/g) || []).length;
    if (placeholderCount !== output.imagePrompts.length) {
      logger.warn('Placeholder count mismatch', {
        placeholders: placeholderCount,
        prompts: output.imagePrompts.length,
      });
    }
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
      const systemPrompt = await this.buildSystemPrompt(state);

      // 2. 调用 LLM（返回 JSON 字符串）
      const jsonResult = await this.callLLM(state, systemPrompt);

      // 3. 解析 JSON 响应
      let output: WriteOutput;
      try {
        output = JSON.parse(jsonResult);
      } catch (error) {
        logger.error('Failed to parse write output as JSON', {
          taskId: state.taskId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw new Error('Invalid write output format');
      }

      // 4. 验证内容
      this.validateContent(state, output.articleContent);

      // 5. 返回结果（同时返回 articleContent 和 imagePrompts）
      logger.info('Write completed successfully', {
        taskId: state.taskId,
        mode: isRewrite ? 'rewrite' : 'initial',
        contentLength: output.articleContent.length,
        imagePromptsCount: output.imagePrompts.length,
      });

      return {
        articleContent: output.articleContent,
        imagePrompts: output.imagePrompts,
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
