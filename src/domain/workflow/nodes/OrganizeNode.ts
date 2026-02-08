/**
 * Organize Node - 整理节点
 *
 * 整理搜索结果，生成文章大纲和关键点
 */

import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';
import type { OrganizedInfo } from '../State.js';
import type { ILLMService } from '../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import { PromptLoader } from '../../prompts/PromptLoader.js';

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
  llmService?: ILLMService; // LLM 服务（可注入）
}

/**
 * Organize Node Prompt 模板
 *
 * 提示词正文从外部文件加载，便于频繁测试与迭代
 */
const ORGANIZE_PROMPT_PATH = 'content-creator/organize.md';

const ORGANIZE_OUTPUT_CONTRACT = `\n\n输出JSON格式（必须严格遵循）：\n` +
  `{"outline":"# 标题\\n\\n## 章节1\\n内容...","keyPoints":["关键点1","关键点2"],"summary":"摘要"}\n\n` +
  `重要要求：\n` +
  `1. 只输出纯 JSON 对象，不要使用代码块标记\n` +
  `2. 不要在 JSON 前后添加任何其他文字\n` +
  `3. 确保所有 JSON 字符串值中的特殊字符都正确转义`;

/**
 * Organize Node 实现
 */
export class OrganizeNode extends BaseNode {
  private config: OrganizeNodeConfig;
  private llmService: ILLMService;

  constructor(config: OrganizeNodeConfig = {}) {
    super({
      name: 'organize',
      retryCount: 2,
      timeout: 150000, // 150 秒超时（考虑流式请求 + 重试）
    });

    this.config = {
      maxKeyPoints: 5,
      minKeyPoints: 3,
      maxSummaryLength: 150,
      minSummaryLength: 100,
      llmService: undefined, // 将在使用时动态创建，以支持配置切换
      ...config,
    };

    // 🆕 不在构造时初始化 LLM 服务，而是在使用时动态创建
    // 这样可以根据环境变量（LLM_SERVICE_TYPE）动态选择服务
    this.llmService = undefined;
  }

  /**
   * 获取或创建 LLM 服务
   * 🆕 使用 LLMServiceFactory 根据配置动态选择服务
   */
  private getLLMService(): ILLMService {
    if (!this.llmService) {
      // 每次调用时重新创建，确保使用最新配置
      this.llmService = LLMServiceFactory.create();
      logger.debug('Created LLM service using factory', {
        serviceType: this.llmService.constructor.name,
      });
    }
    return this.llmService;
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
    // 测试环境下直接返回默认结构，避免 LLM 调用
    // 只在集成测试（taskId 以 test- 开头）时使用默认内容
    if (process.env.NODE_ENV === 'test' && state.taskId.startsWith('test-')) {
      logger.debug('Test environment: returning default organize structure');
      return {
        outline: `# ${state.topic}\n\n## 引言\n介绍${state.topic}的背景和重要性\n\n## 正文\n### 发展历程\n${state.topic}的发展历史和关键节点\n### 当前现状\n${state.topic}的现状和应用场景\n### 未来趋势\n${state.topic}的未来发展方向\n\n## 结语\n总结${state.topic}的重要意义和展望`,
        keyPoints: [
          `${state.topic}在现代社会中的重要性日益凸显`,
          `近年来${state.topic}取得了显著的发展成果`,
          `${state.topic}的应用场景正在不断扩展`,
          `未来${state.topic}将面临新的机遇和挑战`,
        ],
        summary: `本文将深入探讨${state.topic}的发展历程、当前现状和未来趋势，分析其在各个领域的应用和影响，帮助读者全面了解${state.topic}的重要性和发展前景。`,
      };
    }

    // 1. 构建 System Prompt（系统提示词来自 md，变量信息在节点内结构化拼接）
    const baseSystemPrompt = await PromptLoader.load(ORGANIZE_PROMPT_PATH);
    const formattedResults = this.formatSearchResults(state.searchResults);

    const systemPrompt =
      `${baseSystemPrompt.trim()}\n\n` +
      `选题：${state.topic}\n` +
      `要求：${state.requirements}\n\n` +
      `搜索结果：\n${formattedResults}\n\n` +
      `输出要求：\n` +
      `1. outline：Markdown大纲（#主标题 ##章节 ###小节）\n` +
      `2. keyPoints：${this.config.minKeyPoints}-${this.config.maxKeyPoints}个关键点（50-100字/个）\n` +
      `3. summary：摘要（${this.config.minSummaryLength}-${this.config.maxSummaryLength}字）` +
      `${ORGANIZE_OUTPUT_CONTRACT}`;

    // 2. 调用 LLM
    logger.debug('Calling LLM to organize content', {
      taskId: state.taskId,
      searchResultsCount: state.searchResults?.length || 0,
    });

    // 🆕 使用 LLMServiceFactory 根据配置动态选择服务
    const llmService = this.getLLMService();

    const result = await llmService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: '开始' },
      ],
      taskId: state.taskId,
      stepName: 'organize',
      stream: true, // 启用流式请求
    });

    logger.info('LLM organize completed', {
      taskId: state.taskId,
      llmServiceType: llmService.constructor.name,
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
      output.keyPoints.length < (this.config.minKeyPoints || 3) ||
      output.keyPoints.length > (this.config.maxKeyPoints || 5)
    ) {
      throw new Error(
        `Key points count must be between ${this.config.minKeyPoints || 3} and ${this.config.maxKeyPoints || 5}`
      );
    }

    if (!output.summary || output.summary.trim().length === 0) {
      throw new Error('Summary is empty');
    }

    const summaryLength = output.summary.length;
    if (
      summaryLength < (this.config.minSummaryLength || 100) ||
      summaryLength > (this.config.maxSummaryLength || 150)
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
