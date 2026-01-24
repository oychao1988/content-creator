/**
 * TaskWorker - BullMQ 任务处理器
 *
 * 从队列获取任务并执行工作流逻辑
 */

import { Worker, Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from '../infrastructure/redis/connection.js';
import { createTaskRepository, createResultRepository } from '../infrastructure/database/index.js';
import { createContentCreatorGraph, createInitialState } from '../domain/workflow/index.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import type { TaskJobData } from '../infrastructure/queue/TaskQueue.js';
import { ExecutionMode } from '../domain/entities/Task.js';

const logger = createLogger('TaskWorker');

/**
 * TaskWorker 类
 *
 * 从队列中获取任务并执行工作流
 */
export class TaskWorker {
  private worker: Worker<TaskJobData> | null = null;
  private workerId: string;
  private concurrency: number;
  private repository = createTaskRepository();

  constructor(workerId: string, concurrency: number = 2) {
    this.workerId = workerId;
    this.concurrency = concurrency;
  }

  /**
   * 启动 Worker
   */
  async start(): Promise<void> {
    try {
      const connection = await getRedisClient();

      this.worker = new Worker<TaskJobData>(
        'content-creator-tasks',
        async (job: Job<TaskJobData>) => {
          return await this.processJob(job);
        },
        {
          connection,
          concurrency: this.concurrency,
          limiter: {
            max: 10, // 每秒最多处理 10 个任务
            duration: 1000,
          },
        }
      );

      // 设置事件监听器
      this.setupEventListeners();

      // 等待 Worker 就绪
      await this.worker.waitUntilReady();

      logger.info('Worker started', {
        workerId: this.workerId,
        concurrency: this.concurrency,
      });
    } catch (error) {
      logger.error('Failed to start worker', error as Error);
      throw error;
    }
  }

  /**
   * 处理单个任务
   */
  private async processJob(job: Job<TaskJobData>): Promise<{
    success: boolean;
    taskId: string;
    error?: string;
  }> {
    const { data } = job;
    const startTime = Date.now();

    logger.info('Processing job', {
      jobId: job.id,
      taskId: data.taskId,
      topic: data.topic,
    });

    // 更新任务进度
    await job.updateProgress(0);

    let task: Awaited<ReturnType<typeof this.repository.findById>> | null = null;

    try {
      // 1. 抢占任务（使用乐观锁）
      task = await this.repository.findById(data.taskId);
      if (!task) {
        throw new Error(`Task not found: ${data.taskId}`);
      }

      const claimed = await this.repository.claimTask(
        data.taskId,
        this.workerId,
        task.version
      );

      if (!claimed) {
        throw new Error(`Failed to claim task ${data.taskId} (version mismatch or already claimed)`);
      }

      // 更新任务版本号（claimTask 会将版本号 +1）
      task.version = task.version + 1;

      logger.info('Task claimed', { taskId: data.taskId });

      // 更新进度 10%
      await job.updateProgress(10);

      // 2. 创建工作流图
      const graph = createContentCreatorGraph();

      // 3. 创建初始状态
      const initialState = createInitialState({
        taskId: data.taskId,
        mode: data.mode === 'sync' ? ExecutionMode.SYNC : ExecutionMode.ASYNC,
        topic: data.topic,
        requirements: data.requirements,
        hardConstraints: data.hardConstraints,
      });

      logger.info('Starting workflow execution', { taskId: data.taskId });

      // 更新进度 20%
      await job.updateProgress(20);

      // 4. 执行工作流
      const result = await graph.invoke(initialState, {
        recursionLimit: 100, // 设置递归限制
      });

      // 更新进度 90%
      await job.updateProgress(90);

      // 5. 保存结果
      const resultRepo = createResultRepository();

      if (result.articleContent) {
        await resultRepo.create({
          taskId: data.taskId,
          resultType: 'article',
          content: result.articleContent,
          metadata: {
            wordCount: result.articleContent.length,
          },
        });
      }

      if (result.images && result.images.length > 0) {
        for (const image of result.images) {
          await resultRepo.create({
            taskId: data.taskId,
            resultType: 'image',
            content: image.url,
            metadata: image.metadata,
          });
        }
      }

      await this.repository.markAsCompleted(data.taskId, task.version);

      const duration = Date.now() - startTime;

      logger.info('Job completed successfully', {
        jobId: job.id,
        taskId: data.taskId,
        duration,
      });

      // 更新进度 100%
      await job.updateProgress(100);

      return {
        success: true,
        taskId: data.taskId,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Job failed', {
        jobId: job.id,
        taskId: data.taskId,
        error: errorMessage,
        duration,
      });

      // 保存错误信息
      try {
        if (task) {
          await this.repository.markAsFailed(data.taskId, errorMessage, task.version);
        }
      } catch (updateError) {
        logger.error('Failed to update task error status', updateError as Error, {
          taskId: data.taskId,
        });
      }

      // 抛出错误以触发 BullMQ 重试
      throw error;
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.worker) {
      return;
    }

    this.worker.on('completed', (job: Job, result) => {
      logger.info('Job completed', {
        jobId: job.id,
        taskId: job.data.taskId,
        result,
      });
    });

    this.worker.on('failed', (job: Job | undefined, error: Error) => {
      logger.error('Job failed', {
        jobId: job?.id,
        taskId: job?.data.taskId,
        error: error.message,
        stack: error.stack,
      });
    });

    this.worker.on('progress', (job: Job, progress) => {
      logger.debug('Job progress', {
        jobId: job.id,
        taskId: job.data.taskId,
        progress,
      });
    });

    this.worker.on('error', (error: Error) => {
      logger.error('Worker error', error);
    });

    this.worker.on('ready', () => {
      logger.info('Worker ready', { workerId: this.workerId });
    });

    this.worker.on('closing', () => {
      logger.info('Worker closing', { workerId: this.workerId });
    });

    this.worker.on('closed', () => {
      logger.info('Worker closed', { workerId: this.workerId });
    });
  }

  /**
   * 获取 Worker 统计信息
   */
  async getStats(): Promise<{
    isRunning: boolean;
    isWaiting: boolean;
  }> {
    if (!this.worker) {
      return {
        isRunning: false,
        isWaiting: false,
      };
    }

    return {
      isRunning: this.worker.isRunning(),
      isWaiting: false,
    };
  }

  /**
   * 暂停 Worker
   */
  async pause(): Promise<void> {
    if (!this.worker) {
      return;
    }

    await this.worker.pause();
    logger.info('Worker paused', { workerId: this.workerId });
  }

  /**
   * 恢复 Worker
   */
  async resume(): Promise<void> {
    if (!this.worker) {
      return;
    }

    await this.worker.resume();
    logger.info('Worker resumed', { workerId: this.workerId });
  }

  /**
   * 停止 Worker
   */
  async close(): Promise<void> {
    if (!this.worker) {
      return;
    }

    await this.worker.close();
    this.worker = null;

    logger.info('Worker closed', { workerId: this.workerId });
  }

  /**
   * 获取 Worker ID
   */
  getWorkerId(): string {
    return this.workerId;
  }

  /**
   * 获取并发数
   */
  getConcurrency(): number {
    return this.concurrency;
  }
}

/**
 * 创建 TaskWorker 实例
 */
export function createTaskWorker(
  workerId?: string,
  concurrency?: number
): TaskWorker {
  const id = workerId || process.env.WORKER_ID || `worker-${uuidv4()}`;
  return new TaskWorker(id, concurrency);
}
