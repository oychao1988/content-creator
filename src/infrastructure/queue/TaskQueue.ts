/**
 * TaskQueue - BullMQ 任务队列
 *
 * 负责任务的添加、调度和管理
 */

import { Queue } from 'bullmq';
import type { QueueOptions, JobsOptions } from 'bullmq';
import { getRedisClient } from '../redis/connection.js';
import { createLogger } from '../logging/logger.js';
import { config } from '../../config/index.js';
import type { Task } from '../../domain/entities/Task.js';

const logger = createLogger('TaskQueue');

/**
 * 任务作业数据接口
 */
export interface TaskJobData {
  taskId: string;
  mode: 'sync' | 'async';
  topic: string;
  requirements: string;
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
 */
export class TaskQueue {
  private queue: Queue<TaskJobData>;
  private initialized = false;

  constructor(name: string = 'content-creator-tasks', options?: QueueOptions) {
    // 从配置中解析 Redis URL
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
  }

  /**
   * 初始化队列
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
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
    await this.ensureInitialized();

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
    await this.ensureInitialized();

    try {
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
    await this.queue.pause();
    logger.info('TaskQueue paused');
  }

  /**
   * 恢复队列
   */
  async resume(): Promise<void> {
    await this.queue.resume();
    logger.info('TaskQueue resumed');
  }

  /**
   * 清空队列（等待中的任务）
   */
  async drain(): Promise<void> {
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
  getQueue(): Queue<TaskJobData> {
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
    await this.queue.close();
    this.initialized = false;
    logger.info('TaskQueue closed');
  }

  /**
   * 获取任务状态
   */
  async getJobState(jobId: string): Promise<string | null> {
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
