/**
 * Webhook Service
 *
 * 提供异步 HTTP Webhook 回调功能，支持重试机制和队列管理
 */

import axios, { AxiosError } from 'axios';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('WebhookService');

/**
 * 回调负载数据结构
 */
export interface CallbackPayload {
  /** 事件类型：completed, failed, progress, etc. */
  event: string;
  /** 任务 ID */
  taskId: string;
  /** 工作流类型 */
  workflowType: string;
  /** 任务状态 */
  status: string;
  /** 时间戳（ISO 8601 格式） */
  timestamp: string;
  /** 元数据（可选） */
  metadata?: Record<string, any>;
  /** 任务结果（成功时包含） */
  result?: Record<string, any>;
  /** 错误信息（失败时包含） */
  error?: Record<string, any>;
}

/**
 * Webhook 配置选项
 */
export interface WebhookOptions {
  /** 是否启用回调 */
  enabled: boolean;
  /** 回调 URL */
  url?: string;
  /** 超时时间（秒），默认 10 秒 */
  timeout?: number;
  /** 重试次数，默认 3 次 */
  retryCount?: number;
  /** 重试延迟（秒），默认 5 秒 */
  retryDelay?: number;
}

/**
 * 队列项结构
 */
interface QueueItem {
  payload: CallbackPayload;
  options: WebhookOptions;
}

/**
 * Webhook 服务类
 *
 * 提供异步回调发送功能，支持：
 * - 内存队列管理
 * - 自动重试机制
 * - 超时控制
 * - 详细日志记录
 */
export class WebhookService {
  private queue: QueueItem[] = [];
  private processing = false;

  /**
   * 发送回调
   *
   * 将回调添加到队列并异步处理，不阻塞主流程
   *
   * @param payload - 回调负载数据
   * @param options - Webhook 配置选项
   * @returns Promise<boolean> - 是否成功添加到队列
   */
  async sendCallback(
    payload: CallbackPayload,
    options: WebhookOptions
  ): Promise<boolean> {
    // 检查是否启用回调
    if (!options.enabled || !options.url) {
      logger.debug('Webhook is disabled or no URL configured', {
        enabled: options.enabled,
        hasUrl: !!options.url,
        taskId: payload.taskId,
      });
      return true; // 视为成功（不阻塞）
    }

    // 添加到队列
    this.queue.push({ payload, options });

    logger.info('Webhook added to queue', {
      taskId: payload.taskId,
      event: payload.event,
      queueSize: this.queue.length,
      url: options.url,
    });

    // 异步处理队列（不阻塞）
    this.processQueue().catch((err) => {
      logger.error('Failed to process webhook queue', {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return true;
  }

  /**
   * 处理回调队列（后台处理）
   *
   * 依次处理队列中的所有回调项，支持并发控制
   *
   * @private
   */
  private async processQueue(): Promise<void> {
    // 防止重复处理
    if (this.processing) {
      logger.debug('Queue processing already in progress');
      return;
    }

    this.processing = true;

    try {
      logger.debug('Starting webhook queue processing', {
        queueSize: this.queue.length,
      });

      while (this.queue.length > 0) {
        const item = this.queue.shift();
        if (item) {
          await this.sendCallbackWithRetry(item);
        }
      }

      logger.debug('Webhook queue processing completed');
    } catch (error) {
      logger.error('Error processing webhook queue', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.processing = false;
    }
  }

  /**
   * 带重试的发送逻辑
   *
   * 实现指数退避重试机制，在所有尝试失败后记录错误日志
   *
   * @param item - 队列项
   * @private
   */
  private async sendCallbackWithRetry(item: QueueItem): Promise<void> {
    const { payload, options } = item;
    const maxRetries = options.retryCount ?? 3;
    const retryDelay = (options.retryDelay ?? 5) * 1000; // 转换为毫秒
    const timeout = (options.timeout ?? 10) * 1000; // 转换为毫秒，支持 0 值

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(
          options.url!,
          payload,
          {
            timeout,
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'content-creator/1.0',
              'X-Webhook-Event': payload.event,
              'X-Task-ID': payload.taskId,
            },
          }
        );

        // 检查响应状态
        if (response.status === 200 || response.status === 202) {
          logger.info('Webhook sent successfully', {
            taskId: payload.taskId,
            event: payload.event,
            attempt: attempt + 1,
            status: response.status,
            url: options.url,
          });
          return; // 成功，退出重试循环
        }

        // 非 200/202 状态码
        logger.warn('Webhook returned unexpected status', {
          taskId: payload.taskId,
          event: payload.event,
          attempt: attempt + 1,
          status: response.status,
          url: options.url,
        });

      } catch (error) {
        const axiosError = error as AxiosError;

        // 记录失败日志
        logger.warn('Webhook delivery failed', {
          taskId: payload.taskId,
          event: payload.event,
          attempt: attempt + 1,
          maxAttempts: maxRetries + 1,
          error: axiosError.message,
          code: axiosError.code,
          url: options.url,
        });

        // 最后一次尝试失败
        if (attempt >= maxRetries) {
          logger.error('Webhook finally failed after all retries', {
            taskId: payload.taskId,
            event: payload.event,
            totalAttempts: attempt + 1,
            url: options.url,
            lastError: axiosError.message,
          });
          return; // 退出，不再重试
        }

        // 等待后重试
        if (attempt < maxRetries) {
          logger.debug('Waiting before retry', {
            taskId: payload.taskId,
            event: payload.event,
            attempt: attempt + 1,
            nextAttemptIn: retryDelay / 1000,
          });

          await new Promise((resolve) =>
            setTimeout(resolve, retryDelay)
          );
        }
      }
    }
  }

  /**
   * 获取当前队列大小
   *
   * @returns 队列中待处理的回调数量
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * 检查是否正在处理队列
   *
   * @returns 是否正在处理
   */
  isProcessing(): boolean {
    return this.processing;
  }
}
