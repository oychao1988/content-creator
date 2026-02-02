/**
 * TaskQueue - BullMQ 任务队列
 *
 * 负责任务的添加、调度和管理
 * 仅在 Redis 可用时启用
 */

import { Queue } from 'bullmq';
import type { QueueOptions, JobsOptions } from 'bullmq';
import { createLogger } from '../logging/logger.js';
import { config } from '../../config/index.js';

const logger = createLogger('TaskQueue');

/**
 * 任务作业数据接口
 */
export interface TaskJobData {
  taskId: string;
  type?: string;                 // 工作流类型，默认为 'content-creator'
  mode: 'sync' | 'async';
  topic: string;
  requirements: string;
  imageSize?: string;            // 图片尺寸，如 "1920x1080"
  hardConstraints?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
}

/**
 * TaskQueue 类
 *
 * 封装 BullMQ Queue，提供任务队列管理功能
 * 仅在 Redis 可用时启用
 */
export class TaskQueue {
  private queue: Queue<TaskJobData> | null = null;
  private initialized = false;
  private enabled: boolean;

  constructor(name: string = 'content-creator-tasks', options?: QueueOptions) {
    // 检查 Redis 是否可用
    this.enabled = config.redis.enabled;

    if (!this.enabled) {
      logger.info('TaskQueue is disabled (Redis not configured)');
      return;
    }

    try {
      // 从配置中解析 Redis URL
      if (!config.redis.url) {
        throw new Error('REDIS_URL is not configured');
      }

      const redisUrl = new URL(config.redis.url);
      const redisConnection = {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port) || 6379,
        db: config.redis.db,
      };

      // 添加密码（如果存在）
      if (config.redis.password) {
        (redisConnection as any).password = config.redis.password;
      } else if (redisUrl.password) {
        (redisConnection as any).password = decodeURIComponent(redisUrl.password);
      }

      logger.info('Creating TaskQueue with Redis config', {
        host: redisConnection.host,
        port: redisConnection.port,
        db: redisConnection.db,
        hasPassword: !!(redisConnection as any).password,
      });

      // 创建 Queue，使用配置的 Redis 连接
      this.queue = new Queue<TaskJobData>(name, {
        defaultJobOptions: {
          attempts: 3, // 默认重试 3 次
          backoff: {
            type: 'exponential',
            delay: 2000, // 指数退避，初始 2 秒
          },
          removeOnComplete: {
            count: 1000, // 保留最近 1000 个完成的任务
            age: 24 * 3600, // 或保留 24 小时
          },
          removeOnFail: {
            count: 5000, // 保留最近 5000 个失败的任务
            age: 7 * 24 * 3600, // 或保留 7 天
          },
        },
        connection: redisConnection,
        ...options,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error('Failed to create TaskQueue, disabling queue', {
        error: errorMessage,
        stack: errorStack,
      });
      this.enabled = false;
      this.queue = null;
    }
  }

  /**
   * 检查队列是否可用
   */
  isAvailable(): boolean {
    return this.enabled && this.queue !== null;
  }

  /**
   * 初始化队列
   */
  async initialize(): Promise<void> {
    if (!this.isAvailable()) {
      logger.info('TaskQueue is not available (Redis disabled or initialization failed)');
      return;
    }

    if (this.initialized) {
      return;
    }

    if (!this.queue) {
      logger.warn('TaskQueue instance is null');
      return;
    }

    try {
      // BullMQ 会在第一次使用时自动连接 Redis
      // 这里我们只需要标记为已初始化
      await this.queue.waitUntilReady();
      this.initialized = true;
      logger.info('TaskQueue initialized');
    } catch (error) {
      logger.error('Failed to initialize TaskQueue', error as Error);
      throw error;
    }
  }

  /**
   * 添加任务到队列
   */
  async addTask(
    data: TaskJobData,
    options?: JobsOptions
  ): Promise<void> {
    if (!this.isAvailable()) {
      if (process.env.NODE_ENV === 'test') {
        logger.warn('TaskQueue is not available in test environment, skipping addTask', {
          taskId: data.taskId,
        });
        return;
      }
      throw new Error('TaskQueue is not available. Redis is not configured or connection failed. Please use sync mode instead.');
    }

    await this.ensureInitialized();

    if (!this.queue) {
      throw new Error('Queue is not initialized');
    }

    try {
      await this.queue.add('process-content', data, {
        priority: this.calculatePriority(data),
        ...options,
      });

      logger.info('Task added to queue', {
        taskId: data.taskId,
        mode: data.mode,
        topic: data.topic,
      });
    } catch (error) {
      logger.error('Failed to add task to queue', error as Error, {
        taskId: data.taskId,
      });
      throw error;
    }
  }

  /**
   * 添加延迟任务
   */
  async addDelayedTask(
    data: TaskJobData,
    delayMs: number
  ): Promise<void> {
    if (!this.isAvailable()) {
      if (process.env.NODE_ENV === 'test') {
        logger.warn('TaskQueue is not available in test environment, skipping addDelayedTask', {
          taskId: data.taskId,
          delay: delayMs,
        });
        return;
      }
      throw new Error('TaskQueue is not available. Redis is not configured or connection failed. Please use sync mode instead.');
    }

    await this.ensureInitialized();

    try {
      if (!this.queue) {
        throw new Error('Queue is not initialized');
      }
      await this.queue.add('process-content', data, {
        delay: delayMs,
        priority: this.calculatePriority(data),
      });

      logger.info('Delayed task added to queue', {
        taskId: data.taskId,
        delay: delayMs,
      });
    } catch (error) {
      logger.error('Failed to add delayed task to queue', error as Error, {
        taskId: data.taskId,
      });
      throw error;
    }
  }

  /**
   * 批量添加任务
   */
  async addBatchTasks(
    dataList: TaskJobData[],
    options?: JobsOptions
  ): Promise<void> {
    if (!dataList || dataList.length === 0) {
      return;
    }

    if (!this.isAvailable()) {
      if (process.env.NODE_ENV === 'test') {
        logger.warn('TaskQueue is not available in test environment, skipping addBatchTasks', {
          count: dataList.length,
        });
        return;
      }
      throw new Error('TaskQueue is not available. Redis is not configured or connection failed. Please use sync mode instead.');
    }

    await this.ensureInitialized();

    try {
      const jobs = dataList.map((data) => ({
        name: 'process-content',
        data,
        opts: {
          priority: this.calculatePriority(data),
          ...options,
        },
      }));

      if (!this.queue) {
        throw new Error('Queue is not initialized');
      }
      await this.queue.addBulk(jobs);

      logger.info('Batch tasks added to queue', {
        count: dataList.length,
      });
    } catch (error) {
      logger.error('Failed to add batch tasks to queue', error as Error);
      throw error;
    }
  }

  /**
   * 计算任务优先级（1-10，数字越小优先级越高）
   */
  private calculatePriority(data: TaskJobData): number {
    // 同步任务优先级最高
    if (data.mode === 'sync') {
      return 1;
    }

    // 根据任务类型或其他因素计算优先级
    // 这里可以根据业务需求自定义
    return 5; // 默认优先级
  }

  /**
   * 暂停队列
   */
  async pause(): Promise<void> {
    if (!this.queue || !this.isAvailable()) {
      logger.warn('Cannot pause queue (not available)');
      return;
    }
    await this.queue.pause();
    logger.info('TaskQueue paused');
  }

  /**
   * 恢复队列
   */
  async resume(): Promise<void> {
    if (!this.queue || !this.isAvailable()) {
      logger.warn('Cannot resume queue (not available)');
      return;
    }
    await this.queue.resume();
    logger.info('TaskQueue resumed');
  }

  /**
   * 清空队列（等待中的任务）
   */
  async drain(): Promise<void> {
    if (!this.queue || !this.isAvailable()) {
      logger.warn('Cannot drain queue (not available)');
      return;
    }
    await this.queue.drain();
    logger.info('TaskQueue drained');
  }

  /**
   * 获取队列统计信息
   */
  async getStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    repeat: number;
  }> {
    if (!this.queue || !this.isAvailable()) {
      logger.warn('Cannot get stats (queue not available)');
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        repeat: 0,
      };
    }

    return {
      waiting: await this.queue.getWaitingCount(),
      active: await this.queue.getActiveCount(),
      completed: await this.queue.getCompletedCount(),
      failed: await this.queue.getFailedCount(),
      delayed: await this.queue.getDelayedCount(),
      // getRepeatCount 可能在某些版本的 BullMQ 中不可用
      repeat: 0, // BullMQ 5.x 中重复任务已被重构
    };
  }

  /**
   * 获取队列实例（用于 Bull Board）
   */
  getQueue(): Queue<TaskJobData> | null {
    return this.queue;
  }

  /**
   * 确保队列已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 关闭队列
   */
  async close(): Promise<void> {
    if (!this.queue) {
      logger.warn('Cannot close queue (not initialized)');
      return;
    }
    await this.queue.close();
    this.initialized = false;
    logger.info('TaskQueue closed');
  }

  /**
   * 获取任务状态
   */
  async getJobState(jobId: string): Promise<string | null> {
    if (!this.queue || !this.isAvailable()) {
      logger.warn('Cannot get job state (queue not available)', { jobId });
      return null;
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return null;
      }
      const state = await job.getState();
      return state;
    } catch (error) {
      logger.error('Failed to get job state', error as Error, { jobId });
      return null;
    }
  }

  /**
   * 删除任务
   */
  async removeJob(jobId: string): Promise<boolean> {
    if (!this.queue || !this.isAvailable()) {
      logger.warn('Cannot remove job (queue not available)', { jobId });
      return false;
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return false;
      }
      await job.remove();
      logger.info('Job removed', { jobId });
      return true;
    } catch (error) {
      logger.error('Failed to remove job', error as Error, { jobId });
      return false;
    }
  }

  /**
   * 重试失败的任务
   */
  async retryJob(jobId: string): Promise<boolean> {
    if (!this.queue || !this.isAvailable()) {
      logger.warn('Cannot retry job (queue not available)', { jobId });
      return false;
    }

    try {
      const job = await this.queue.getJob(jobId);
      if (!job) {
        return false;
      }
      await job.retry();
      logger.info('Job retried', { jobId });
      return true;
    } catch (error) {
      logger.error('Failed to retry job', error as Error, { jobId });
      return false;
    }
  }
}

/**
 * 创建默认任务队列实例
 */
export async function createTaskQueue(): Promise<TaskQueue> {
  const queue = new TaskQueue();
  await queue.initialize();
  return queue;
}
