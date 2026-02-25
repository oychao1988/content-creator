/**
 * ClaudeCLIProviderService - 基于 claude-cli-provider HTTP API 的 LLM 服务
 *
 * 通过调用远程的 claude-cli-provider HTTP API 来提供 LLM 服务
 */

import axios from 'axios';
import { createLogger } from '../../infrastructure/logging/logger.js';
import type { ILLMService, ChatMessage, ChatRequest, ChatResponse } from './ILLMService.js';

const logger = createLogger('ClaudeCLIProvider');

/**
 * claude-cli-provider API 配置
 */
export interface ClaudeCLIProviderConfig {
  baseURL: string;           // API 服务地址
  apiKey?: string;           // API 密钥（如果启用了认证）
  defaultTimeout?: number;   // 默认超时（毫秒）
  defaultModel?: string;     // 默认模型
}

/**
 * claude-cli-provider API 响应格式
 */
interface ProviderResponse {
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
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * claude-cli-provider 服务实现
 */
export class ClaudeCLIProviderService implements ILLMService {
  private config: ClaudeCLIProviderConfig;
  private axiosInstance;

  constructor(config: ClaudeCLIProviderConfig) {
    this.config = {
      defaultTimeout: 120000, // 120 秒
      defaultModel: 'claude-sonnet-4-6',
      ...config,
    };

    // 创建 axios 实例
    this.axiosInstance = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.defaultTimeout,
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && {
          'Authorization': `Bearer ${this.config.apiKey}`
        }),
      },
    });

    logger.info('claude-cli-provider service initialized', {
      baseURL: this.config.baseURL,
      model: this.config.defaultModel,
      timeout: this.config.defaultTimeout,
      hasAuth: !!this.config.apiKey,
    });
  }

  /**
   * 聊天对话
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      logger.debug('Starting claude-cli-provider chat request', {
        model: request.model || this.config.defaultModel,
        messagesCount: request.messages.length,
        stream: request.stream || false,
      });

      // 构建 API 请求
      const apiRequest = {
        model: request.model || this.config.defaultModel,
        messages: request.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
        stream: false, // 强制使用非流式响应
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      };

      logger.debug('claude-cli-provider API request', {
        url: `${this.config.baseURL}/v1/chat/completions`,
        model: apiRequest.model,
        stream: apiRequest.stream,
      });

      // 发送请求
      const response = await this.axiosInstance.post<ProviderResponse>(
        '/v1/chat/completions',
        apiRequest,
        {
          responseType: 'json', // 明确指定响应类型为 JSON
        }
      );

      let data = response.data;

      // 如果响应是字符串，尝试解析为 JSON
      if (typeof data === 'string') {
        logger.warn('Response is string, attempting to parse as JSON');
        try {
          data = JSON.parse(data);
        } catch (parseError) {
          logger.error('Failed to parse response as JSON', {
            error: parseError,
            responsePreview: data.substring(0, 200),
          });
          throw new Error('Invalid API response: cannot parse JSON');
        }
      }

      logger.info('claude-cli-provider API response received', {
        status: response.status,
        statusText: response.statusText,
        hasData: !!data,
        dataType: typeof data,
        dataKeys: data ? Object.keys(data) : [],
        hasChoices: !!(data && data.choices),
        choicesLength: data?.choices?.length,
        responseData: JSON.stringify(data).substring(0, 200), // 记录前200个字符
      });

      // 提取响应内容
      if (!data || !data.choices || data.choices.length === 0) {
        logger.error('claude-cli-provider API invalid response', {
          hasData: !!data,
          data: data,
        });
        throw new Error('Invalid API response: missing choices');
      }

      const content = data.choices[0].message?.content || '';

      // 提取 token 使用情况
      const promptTokens = data.usage?.prompt_tokens || 0;
      const completionTokens = data.usage?.completion_tokens || 0;

      const duration = Date.now() - startTime;

      logger.info('claude-cli-provider chat request completed', {
        duration,
        promptTokens,
        completionTokens,
      });

      return {
        content,
        promptTokens,
        completionTokens,
        model: data.model,
      };
    } catch (error: any) {
      logger.error('claude-cli-provider chat request failed', {
        error: error.message,
        status: error.response?.status,
      });

      throw new Error(`claude-cli-provider API error: ${error.message}`);
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/health');
      return response.data?.status === 'ok';
    } catch (error: any) {
      logger.error('Health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * 估算 token 数量
   */
  estimateTokens(text: string): number {
    // 粗略估算：1 token ≈ 4 字符
    return Math.ceil(text.length / 4);
  }

  /**
   * 估算成本
   */
  estimateCost(tokensIn: number, tokensOut: number): number {
    // claude-sonnet-4-6 定价（美元）
    const inputPricePer1k = 0.003;  // $3/1M tokens
    const outputPricePer1k = 0.015; // $15/1M tokens

    return (tokensIn / 1000) * inputPricePer1k +
           (tokensOut / 1000) * outputPricePer1k;
  }
}
