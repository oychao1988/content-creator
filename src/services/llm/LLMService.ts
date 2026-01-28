/**
 * LLM 服务
 *
 * 封装 DeepSeek API 调用，支持缓存
 */

import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';
import { cacheService } from '../../infrastructure/cache/CacheService.js';
import { metricsService } from '../../infrastructure/monitoring/MetricsService.js';

const logger = createLogger('LLM');

/**
 * Chat 消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Chat 请求参数
 */
export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

/**
 * Chat 响应
 */
export interface ChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finishReason: string | null;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Token 使用统计
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * LLM 服务类
 */
export class LLMService {
  private baseURL: string;
  private apiKey: string;
  private modelName: string;
  private maxTokens: number;
  private temperature: number;
  private enableCache: boolean;

  constructor() {
    this.baseURL = config.llm.baseURL;
    this.apiKey = config.llm.apiKey;
    this.modelName = config.llm.modelName;
    this.maxTokens = config.llm.maxTokens;
    this.temperature = config.llm.temperature;
    this.enableCache = config.llm.enableCache ?? true;
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: ChatRequest): string {
    const cacheData = {
      model: request.model || this.modelName,
      messages: request.messages,
      maxTokens: request.maxTokens || this.maxTokens,
      temperature: request.temperature ?? this.temperature,
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(cacheData))
      .digest('hex');

    return hash;
  }

  /**
   * 聊天对话（支持缓存）
   */
  async chat(request: ChatRequest): Promise<{ content: string; usage: TokenUsage }> {
    const cacheKey = this.generateCacheKey(request);

    // 尝试从缓存获取
    if (this.enableCache) {
      try {
        const cached = await cacheService.getCachedLLMResponse(cacheKey);
        if (cached) {
          logger.debug('LLM response retrieved from cache', { cacheKey });
          metricsService.recordCacheHit('llm');

          // 返回缓存的结果，usage 设为 0（因为这是缓存）
          return {
            content: cached,
            usage: {
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
            },
          };
        }
        metricsService.recordCacheMiss('llm');
      } catch (error) {
        logger.warn('Failed to retrieve from cache', error as Error);
        // 继续执行，不阻断请求
      }
    }

    try {
      logger.debug('Sending chat request', {
        model: request.model || this.modelName,
        messagesCount: request.messages.length,
      });

      const maxTokens = typeof (request.maxTokens || this.maxTokens) === 'number'
        ? request.maxTokens || this.maxTokens
        : parseInt(String(request.maxTokens || this.maxTokens));

      const temperature = typeof (request.temperature ?? this.temperature) === 'number'
        ? request.temperature ?? this.temperature
        : parseFloat(String(request.temperature ?? this.temperature));

      const response = await axios.post<ChatResponse>(
        `${this.baseURL}/chat/completions`,
        {
          model: request.model || this.modelName,
          messages: request.messages,
          max_tokens: maxTokens,
          temperature: temperature,
          stream: request.stream || false,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60000, // 60 秒超时
        }
      );

      const choice = response.data.choices[0];
      if (!choice) {
        throw new Error('No choice in response');
      }
      const content = choice.message.content;
      const usage = response.data.usage;

      logger.info('Chat request completed', {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        finishReason: choice.finishReason,
      });

      // 缓存响应（异步，不等待）
      if (this.enableCache) {
        cacheService.setCachedLLMResponse(cacheKey, content).catch((error) => {
          logger.warn('Failed to cache LLM response', error);
        });
      }

      // 记录 LLM 调用指标
      metricsService.recordLLMRequest(this.modelName, 'chat');
      metricsService.recordLLMTokenUsage(this.modelName, 'prompt', usage.promptTokens);
      metricsService.recordLLMTokenUsage(this.modelName, 'completion', usage.completionTokens);

      return {
        content,
        usage: {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        logger.error('LLM API request failed', {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          message: axiosError.message,
        });

        throw new Error(
          `LLM API error: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data)}`
        );
      }

      logger.error('LLM service error', error as Error);
      throw error;
    }
  }

  /**
   * 生成文本（简化接口）
   */
  async generateText(prompt: string, systemPrompt?: string): Promise<string> {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const result = await this.chat({ messages });

    return result.content;
  }

  /**
   * 生成文本并返回使用情况
   */
  async generateTextWithUsage(
    prompt: string,
    systemPrompt?: string
  ): Promise<{ text: string; usage: TokenUsage }> {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const result = await this.chat({ messages });

    return {
      text: result.content,
      usage: result.usage,
    };
  }

  /**
   * 批量生成（并行）
   */
  async batchGenerateText(prompts: string[]): Promise<string[]> {
    logger.info('Batch generating text', { count: prompts.length });

    const results = await Promise.all(
      prompts.map((prompt) => this.generateText(prompt))
    );

    logger.info('Batch generation completed', { count: results.length });

    return results;
  }

  /**
   * 检查 API 连接
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.chat({
        messages: [{ role: 'user', content: 'test' }],
        maxTokens: 1,
      });

      logger.info('LLM service health check passed');
      return true;
    } catch (error) {
      logger.error('LLM service health check failed', error as Error);
      return false;
    }
  }

  /**
   * 计算文本的 Token 数量（估算）
   */
  estimateTokens(text: string): number {
    // 粗略估算：英文约 4 字符/token，中文约 1.5 字符/token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 1.5 + englishChars / 4);
  }
}

/**
 * LLM 服务单例
 */
export const llmService = new LLMService();
