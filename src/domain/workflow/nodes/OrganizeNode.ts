/**
 * Organize Node - 整理节点
 *
 * 整理搜索结果，生成文章大纲和关键点
 */

import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';
import type { OrganizedInfo } from '../State.js';
import { enhancedLLMService } from '../../../services/llm/EnhancedLLMService.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('OrganizeNode');

/**
 * Organize 输出结构
 */
interface OrganizeOutput {
  outline: string;
  keyPoints: string[];
  summary: string;
}

/**
 * Organize Node 配置
 */
interface OrganizeNodeConfig {
  maxKeyPoints?: number;
  minKeyPoints?: number;
  maxSummaryLength?: number;
  minSummaryLength?: number;
}

/**
 * Organize Node Prompt 模板
 */
const ORGANIZE_PROMPT = `你是一位专业的内容策划。请根据以下搜索结果，整理出文章的大纲和关键点。

【选题】{topic}

【要求】{requirements}

【搜索结果】
{searchResults}

请按以下格式输出：

1. **文章大纲**（Markdown 格式）
   - 使用一级标题（#）作为主标题
   - 使用二级标题（##）作为章节
   - 使用三级标题（###）作为小节
   - 每个章节下简要说明该部分要写的内容

2. **关键点列表**（{minKeyPoints}-{maxKeyPoints} 个）
   - 每个关键点 50-100 字
   - 提炼文章的核心观点
   - 确保逻辑连贯

3. **摘要**（{minSummaryLength}-{maxSummaryLength} 字）
   - 概括文章核心内容
   - 包含文章的主要观点
   - 语言简洁明了

请以 JSON 格式返回：
{
  "outline": "完整大纲（Markdown 格式）",
  "keyPoints": ["关键点1", "关键点2", ...],
  "summary": "文章摘要"
}

注意：
1. 大纲必须使用 Markdown 格式
2. 关键点数量必须在 {minKeyPoints}-{maxKeyPoints} 之间
3. 摘要长度必须在 {minSummaryLength}-{maxSummaryLength} 字之间
4. 只返回 JSON，不要有其他内容
`;

/**
 * Organize Node 实现
 */
export class OrganizeNode extends BaseNode {
  private config: OrganizeNodeConfig;

  constructor(config: OrganizeNodeConfig = {}) {
    super({
      name: 'organize',
      retryCount: 2,
      timeout: 60000, // 60 秒超时（LLM 调用可能较慢）
    });

    this.config = {
      maxKeyPoints: 5,
      minKeyPoints: 3,
      maxSummaryLength: 150,
      minSummaryLength: 100,
      ...config,
    };
  }

  /**
   * 格式化搜索结果供 LLM 使用
   */
  private formatSearchResults(searchResults: WorkflowState['searchResults']): string {
    if (!searchResults || searchResults.length === 0) {
      return '（无搜索结果）';
    }

    return searchResults
      .map((result, index) => {
        // 限制内容长度，避免 Token 过多
        const content =
          result.content.length > 500
            ? result.content.substring(0, 500) + '...'
            : result.content;

        return `${index + 1}. ${result.title}
   URL: ${result.url}
   ${result.author ? `作者: ${result.author}` : ''}
   ${result.publishedDate ? `日期: ${result.publishedDate}` : ''}
   内容: ${content}`;
      })
      .join('\n\n');
  }

  /**
   * 调用 LLM 生成组织结构
   */
  private async callLLM(state: WorkflowState): Promise<OrganizeOutput> {
    // 1. 构建 Prompt
    const formattedResults = this.formatSearchResults(state.searchResults);

    const prompt = ORGANIZE_PROMPT.replace('{topic}', state.topic)
      .replace('{requirements}', state.requirements)
      .replace('{searchResults}', formattedResults)
      .replace('{minKeyPoints}', String(this.config.minKeyPoints))
      .replace('{maxKeyPoints}', String(this.config.maxKeyPoints))
      .replace('{minSummaryLength}', String(this.config.minSummaryLength))
      .replace('{maxSummaryLength}', String(this.config.maxSummaryLength));

    // 2. 调用 LLM
    logger.debug('Calling LLM to organize content', {
      taskId: state.taskId,
      searchResultsCount: state.searchResults?.length || 0,
    });

    const systemMessage =
      '你是一位专业的内容策划。请严格按照要求输出 JSON 格式，不要包含任何其他内容。';

    const result = await enhancedLLMService.chat({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: prompt },
      ],
      taskId: state.taskId,
      stepName: 'organize',
    });

    // 3. 解析 JSON 响应
    let output: OrganizeOutput;
    try {
      // 尝试提取 JSON（去除可能的 markdown 代码块标记）
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
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        'Failed to parse organize output. LLM did not return valid JSON.'
      );
    }

    // 4. 验证输出
    this.validateOutput(output);

    return output;
  }

  /**
   * 验证 LLM 输出
   */
  private validateOutput(output: OrganizeOutput): void {
    if (!output.outline || output.outline.trim().length === 0) {
      throw new Error('Outline is empty');
    }

    if (
      !output.keyPoints ||
      output.keyPoints.length < this.config.minKeyPoints ||
      output.keyPoints.length > this.config.maxKeyPoints
    ) {
      throw new Error(
        `Key points count must be between ${this.config.minKeyPoints} and ${this.config.maxKeyPoints}`
      );
    }

    if (!output.summary || output.summary.trim().length === 0) {
      throw new Error('Summary is empty');
    }

    const summaryLength = output.summary.length;
    if (
      summaryLength < this.config.minSummaryLength ||
      summaryLength > this.config.maxSummaryLength
    ) {
      logger.warn('Summary length is out of recommended range', {
        length: summaryLength,
        min: this.config.minSummaryLength,
        max: this.config.maxSummaryLength,
      });
      // 不抛出错误，只是警告
    }
  }

  /**
   * 执行整理逻辑
   */
  protected async executeLogic(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Starting organize', {
      taskId: state.taskId,
      topic: state.topic,
      searchResultsCount: state.searchResults?.length || 0,
    });

    try {
      // 1. 检查是否有搜索结果
      if (!state.searchResults || state.searchResults.length === 0) {
        logger.warn('No search results available', {
          taskId: state.taskId,
        });

        // 如果没有搜索结果，生成基础结构
        const basicOutput: OrganizedInfo = {
          outline: `# ${state.topic}\n\n## 引言\n\n## 正文\n\n## 结语\n`,
          keyPoints: [`${state.topic}的相关内容`],
          summary: `这是一篇关于${state.topic}的文章。`,
        };

        return {
          organizedInfo: basicOutput,
        };
      }

      // 2. 调用 LLM 生成组织结构
      const output = await this.callLLM(state);

      // 3. 构建返回结果
      const organizedInfo: OrganizedInfo = {
        outline: output.outline,
        keyPoints: output.keyPoints,
        summary: output.summary,
      };

      logger.info('Organize completed successfully', {
        taskId: state.taskId,
        outlineLength: output.outline.length,
        keyPointsCount: output.keyPoints.length,
        summaryLength: output.summary.length,
      });

      return {
        organizedInfo,
      };
    } catch (error) {
      logger.error('Organize failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      // 整理失败时，抛出错误（这个步骤很关键）
      throw error;
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: WorkflowState): void {
    super.validateState(state);

    if (!state.requirements || state.requirements.trim().length === 0) {
      throw new Error('Requirements are required for organize');
    }
  }
}

/**
 * Organize Node 单例导出（默认配置）
 */
export const organizeNode = new OrganizeNode();
