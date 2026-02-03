/**
 * WriteTool - 写作工具
 *
 * 使用 LangChain Tool 包装封装 LLM 服务
 * 用于 ReAct Agent 生成文章内容
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod/v3';
import { LLMServiceFactory } from '../../../services/llm/LLMServiceFactory.js';
import { PromptLoader } from '../../prompts/PromptLoader.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('WriteTool');

/**
 * 写作工具
 *
 * 功能：
 * - 基于主题和要求撰写文章内容
 * - 支持根据搜索结果进行创作
 * - 返回文章内容和配图提示词列表
 */
export const writeTool = tool(
  async (input) => {
    const { topic, requirements, context, metadata } = input;
    logger.info('Write tool invoked', { topic, requirements, metadata });

    try {
      const llmService = LLMServiceFactory.create();
      const systemPrompt = await PromptLoader.load(
        'content-creator/write.md'
      );

      // 构建用户提示词
      const userPrompt = `
主题：${topic}
要求：${requirements}
${context ? `参考资料：\n${context}` : ''}

请基于以上信息撰写文章内容，包含标题、正文，以及配图提示词列表。
输出格式：{"articleContent":"...","imagePrompts":["...","..."]}
`.trim();

      // 调用 LLM 生成内容
      const result = await llmService.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        stream: false,
      });

      logger.info('Write tool completed', {
        topic,
        contentLength: result.content.length,
        tokens: result.usage.totalTokens,
      });

      return result.content;
    } catch (error) {
      logger.error('Write tool failed', error as Error);
      throw error;
    }
  },
  {
    name: 'write_content',
    description:
      '基于主题和要求撰写文章内容，支持根据搜索结果进行创作。返回完整的文章内容（Markdown 格式）和配图提示词列表。',
    schema: z.object({
      topic: z.string().describe('文章主题'),
      requirements: z.string().describe('写作要求'),
      context: z
        .string()
        .optional()
        .describe('参考资料（来自搜索，可选）'),
      metadata: z
        .record(z.any())
        .optional()
        .describe('额外元数据（可选）'),
    }),
  }
);
