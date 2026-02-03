/**
 * SearchTool - 搜索工具
 *
 * 使用 LangChain Tool 包装封装搜索服务
 * 用于 ReAct Agent 搜索网络信息
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { searchService } from '../../../services/search/SearchService.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('SearchTool');

/**
 * 搜索工具
 *
 * 功能：
 * - 搜索网络信息
 * - 收集背景资料和参考内容
 * - 返回搜索结果和 AI 生成的答案
 */
export const searchTool = tool(
  async (input) => {
    const { query, maxResults = 10 } = input;
    logger.info('Search tool invoked', { query, maxResults });

    try {
      const response = await searchService.searchWithAnswer(
        query,
        maxResults
      );

      // 格式化返回结果
      const result = {
        query,
        resultCount: response.results.length,
        answer: response.answer,
        results: response.results.slice(0, 5).map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content.substring(0, 300),
        })),
      };

      logger.info('Search tool completed', {
        query,
        resultCount: result.resultCount,
      });

      return JSON.stringify(result, null, 2);
    } catch (error) {
      logger.error('Search tool failed', error as Error);
      throw error;
    }
  },
  {
    name: 'search_content',
    description: '搜索网络信息，用于收集背景资料和参考内容。返回相关的网页链接、标题、内容摘要以及 AI 生成的综合答案。',
    schema: z.object({
      query: z.string().describe('搜索查询词'),
      maxResults: z
        .number()
        .optional()
        .default(10)
        .describe('最大结果数（默认 10）'),
    }),
  }
);
