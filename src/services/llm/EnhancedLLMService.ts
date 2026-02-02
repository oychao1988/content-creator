/**
 * Enhanced LLM Service
 *
 * 在原有 LLMService 基础上添加：
 * - 重试机制（指数退避）
 * - Token 使用记录
 * - 成本估算
 * - 性能监控
 * - 实现 ILLMService 统一接口
 */

import axios, { AxiosError } from 'axios';
import { config } from '../../config/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';
import type { ILLMService, ChatRequest, ChatResponse, ChatMessage } from './ILLMService.js';

const logger = createLogger('LLM:Enhanced');

// 从 ILLMService 导入的类型
// ChatMessage, ChatRequest, ChatResponse

/**
 * Chat API 响应（DeepSeek API 格式）
 */
interface APIChatResponse {
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
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number;        // 最大重试次数
  initialDelay: number;      // 初始延迟（毫秒）
  maxDelay: number;          // 最大延迟（毫秒）
  backoffMultiplier: number; // 退避乘数
}

/**
 * 默认重试配置
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,        // 1 秒
  maxDelay: 10000,           // 10 秒
  backoffMultiplier: 2,      // 指数退避
};

/**
 * 成本配置（元/1k tokens）
 */
const COST_CONFIG: Record<string, Record<string, { costPer1kTokensIn: number; costPer1kTokensOut: number }>> = {
  deepseek: {
    'deepseek-chat': {
      costPer1kTokensIn: 0.001,
      costPer1kTokensOut: 0.002,
    },
  },
};

/**
 * 增强的 LLM 服务类
 * 实现 ILLMService 统一接口
 */
export class EnhancedLLMService implements ILLMService {
  private baseURL: string;
  private apiKey: string;
  private modelName: string;
  private maxTokens: number;
  private temperature: number;
  private retryConfig: RetryConfig;
  private tokenUsageRepo: TempTokenUsageRepository;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.baseURL = config.llm.baseURL;
    this.apiKey = config.llm.apiKey;
    this.modelName = config.llm.modelName;
    this.maxTokens = config.llm.maxTokens;
    this.temperature = config.llm.temperature;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.tokenUsageRepo = new TempTokenUsageRepository();
  }

  /**
   * 聊天对话（带重试和 Token 记录）
   * 实现 ILLMService.chat 接口
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const startTime = Date.now();

    try {
      logger.debug('Sending chat request with retry', {
        model: request.model || this.modelName,
        messagesCount: request.messages.length,
        maxRetries: this.retryConfig.maxRetries,
        stream: request.stream || false,
      });

      // 带重试的请求
      const response = await this.chatWithRetry(request);

      // 提取数据
      const choice = response.choices[0];
      if (!choice) {
        throw new Error('No choice in response');
      }
      const content = choice.message.content;
      const usage = response.usage;

      // 计算 Token 成本
      const cost = this.calculateCost(
        usage.promptTokens,
        usage.completionTokens,
        this.modelName
      );

      // 记录 Token 使用
      if (request.taskId && request.stepName) {
        await this.recordTokenUsage({
          taskId: request.taskId,
          stepName: request.stepName,
          tokensIn: usage.promptTokens,
          tokensOut: usage.completionTokens,
          totalTokens: usage.totalTokens,
          costPer1kTokensIn: COST_CONFIG.deepseek?.[this.modelName]?.costPer1kTokensIn || 0,
          costPer1kTokensOut: COST_CONFIG.deepseek?.[this.modelName]?.costPer1kTokensOut || 0,
          totalCost: cost,
          duration: Date.now() - startTime,
        });
      }

      logger.info('Chat request completed', {
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        cost,
        finishReason: choice.finishReason,
        duration: Date.now() - startTime,
        stream: request.stream || false,
      });

      // 返回统一的 ChatResponse 格式
      return {
        content,
        usage: {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        },
        cost,
      };
    } catch (error) {
      logger.error('LLM API request failed after retries', {
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        stream: request.stream || false,
      });
      throw error;
    }
  }

  /**
   * 带重试的聊天请求
   */
  private async chatWithRetry(request: ChatRequest): Promise<APIChatResponse> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateRetryDelay(attempt);
          logger.info(`Retrying chat request (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1})`, {
            delay,
          });
          await this.sleep(delay);
        }

        return await this.chatRequest(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 判断是否应该重试
        if (!this.shouldRetry(lastError, attempt)) {
          throw lastError;
        }

        logger.warn('Chat request failed, will retry', {
          attempt: attempt + 1,
          error: lastError.message,
        });
      }
    }

    throw lastError;
  }

  /**
   * 单次聊天请求
   */
  private async chatRequest(request: ChatRequest): Promise<APIChatResponse> {
    const maxTokens = typeof (request.maxTokens || this.maxTokens) === 'number'
      ? request.maxTokens || this.maxTokens
      : parseInt(String(request.maxTokens || this.maxTokens));

    const temperature = typeof (request.temperature ?? this.temperature) === 'number'
      ? request.temperature ?? this.temperature
      : parseFloat(String(request.temperature ?? this.temperature));

    const useStream = request.stream || false;

    // 流式请求
    if (useStream) {
      return await this.chatRequestStream(
        request,
        maxTokens,
        temperature
      );
    }

    // 非流式请求
    const response = await axios.post<APIChatResponse>(
      `${this.baseURL}/chat/completions`,
      {
        model: request.model || this.modelName,
        messages: request.messages,
        max_tokens: maxTokens,
        temperature: temperature,
        stream: false,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: config.llm.timeout, // 使用配置的超时时间
      }
    );

    return response.data;
  }

  /**
   * 流式聊天请求
   */
  private async chatRequestStream(
    request: ChatRequest,
    maxTokens: number,
    temperature: number
  ): Promise<APIChatResponse> {
    logger.debug('Starting stream request', {
      model: request.model || this.modelName,
    });

    const response = await axios.post(
      `${this.baseURL}/chat/completions`,
      {
        model: request.model || this.modelName,
        messages: request.messages,
        max_tokens: maxTokens,
        temperature: temperature,
        stream: true,
      },
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
        timeout: config.llm.streamTimeout, // 使用配置的流式超时时间
      }
    );

    // 收集流式数据
    let fullContent = '';
    let finishReason: string | null = null;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    let sseBuffer = '';

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      response.data.on('data', (chunk: Buffer) => {
        chunks.push(chunk);

        // 解析 SSE 数据（注意：SSE 的单行可能会跨 chunk 分片）
        sseBuffer += chunk.toString('utf-8');

        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line) {
            continue;
          }

          if (!line.startsWith('data: ')) {
            continue;
          }

          const data = line.slice(6);
          if (data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            if (delta?.content) {
              fullContent += delta.content;
            }

            if (parsed.choices?.[0]?.finish_reason) {
              finishReason = parsed.choices[0].finish_reason;
            }

            // 从最后一个 chunk 获取 usage 信息
            if (parsed.usage) {
              promptTokens = parsed.usage.prompt_tokens || 0;
              completionTokens = parsed.usage.completion_tokens || 0;
              totalTokens = parsed.usage.total_tokens || 0;
            }
          } catch {
            // 忽略解析错误（例如服务端发送的非 JSON 行）
          }
        }
      });

      response.data.on('end', () => {
        // 尝试处理 buffer 中最后一行（如果没有以 \n 结尾）
        const lastLine = sseBuffer.trim();
        if (lastLine.startsWith('data: ')) {
          const data = lastLine.slice(6);
          if (data && data !== '[DONE]') {
            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              if (delta?.content) {
                fullContent += delta.content;
              }

              if (parsed.choices?.[0]?.finish_reason) {
                finishReason = parsed.choices[0].finish_reason;
              }

              if (parsed.usage) {
                promptTokens = parsed.usage.prompt_tokens || 0;
                completionTokens = parsed.usage.completion_tokens || 0;
                totalTokens = parsed.usage.total_tokens || 0;
              }
            } catch {
              // ignore
            }
          }
        }

        logger.debug('Stream request completed', {
          contentLength: fullContent.length,
          finishReason,
        });

        // 构造标准响应格式
        resolve({
          id: `chatcmpl-${Date.now()}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model: request.model || this.modelName,
          choices: [{
            index: 0,
            message: {
              role: 'assistant',
              content: fullContent,
            },
            finishReason,
          }],
          usage: {
            promptTokens,
            completionTokens,
            totalTokens,
          },
        });
      });

      response.data.on('error', (error: Error) => {
        logger.error('Stream request error', { error: error.message });
        reject(error);
      });
    });
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(error: Error, attempt: number): boolean {
    // 超过最大重试次数
    if (attempt >= this.retryConfig.maxRetries) {
      return false;
    }

    // 网络错误或超时
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const isRetryable =
        !axiosError.response || // 无响应（网络错误）
        axiosError.response.status >= 500 || // 服务器错误
        axiosError.response.status === 429; // 限流

      return isRetryable;
    }

    // 其他错误不重试
    return false;
  }

  /**
   * 计算重试延迟（指数退避）
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelay
    );
    return delay;
  }

  /**
   * 计算 Token 成本
   */
  private calculateCost(
    tokensIn: number,
    tokensOut: number,
    modelName: string = this.modelName
  ): number {
    const config = COST_CONFIG.deepseek?.[modelName];
    if (!config) {
      logger.warn(`No cost config found for model: ${modelName}`);
      return 0;
    }

    const costIn = (tokensIn / 1000) * config.costPer1kTokensIn;
    const costOut = (tokensOut / 1000) * config.costPer1kTokensOut;

    return Number((costIn + costOut).toFixed(6));
  }

  /**
   * 记录 Token 使用到数据库
   */
  private async recordTokenUsage(params: {
    taskId: string;
    stepName: string;
    tokensIn: number;
    tokensOut: number;
    totalTokens: number;
    costPer1kTokensIn: number;
    costPer1kTokensOut: number;
    totalCost: number;
    duration: number;
  }): Promise<void> {
    try {
      await this.tokenUsageRepo.create({
        taskId: params.taskId,
        traceId: this.generateTraceId(),
        stepName: params.stepName,
        apiName: 'deepseek',
        modelName: this.modelName,
        tokensIn: params.tokensIn,
        tokensOut: params.tokensOut,
        totalTokens: params.totalTokens,
        costPer1kTokensIn: params.costPer1kTokensIn,
        costPer1kTokensOut: params.costPer1kTokensOut,
        totalCost: params.totalCost,
        metadata: {
          duration: params.duration,
          temperature: this.temperature,
          maxTokens: this.maxTokens,
        },
      });

      logger.debug('Token usage recorded', {
        taskId: params.taskId,
        stepName: params.stepName,
        totalTokens: params.totalTokens,
        cost: params.totalCost,
      });
    } catch (error) {
      logger.error('Failed to record token usage', {
        error: error instanceof Error ? error.message : String(error),
      });
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 生成 Trace ID（用于链路追踪）
   */
  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 生成文本（简化接口）
   */
  async generateText(
    prompt: string,
    systemPrompt?: string,
    options?: {
      taskId?: string;
      stepName?: string;
    }
  ): Promise<string> {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    const result = await this.chat({
      messages,
      taskId: options?.taskId,
      stepName: options?.stepName,
    });

    return result.content;
  }

  /**
   * 健康检查
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

  /**
   * 估算成本（未调用 API）
   */
  estimateCost(tokensIn: number, tokensOut: number): number {
    return this.calculateCost(tokensIn, tokensOut, this.modelName);
  }
}

/**
 * Token Usage Repository（临时实现，后续使用真实的 Repository）
 */
class TempTokenUsageRepository {
  async create(params: any): Promise<void> {
    // TODO: 实现真实的数据库保存
    // 目前只记录日志
    logger.debug('Token usage would be saved to database', params);
  }
}

/**
 * 增强的 LLM 服务单例
 */
export const enhancedLLMService = new EnhancedLLMService();
