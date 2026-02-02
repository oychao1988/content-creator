/**
 * TaskScheduler - 任务调度器
 *
 * 负责任务的创建和调度
 */

import { v4 as uuidv4 } from 'uuid';
import { createTaskQueue } from '../infrastructure/queue/TaskQueue.js';
import { createTaskRepository } from '../infrastructure/database/index.js';
import { createLogger } from '../infrastructure/logging/logger.js';
import type { Task } from '../domain/entities/Task.js';
import type { TaskJobData } from '../infrastructure/queue/TaskQueue.js';

const logger = createLogger('TaskScheduler');

/**
 * 创建任务请求接口
 */
export interface CreateTaskRequest {
  userId?: string;
  mode: 'sync' | 'async';
  topic: string;
  requirements: string;
  imageSize?: string;
  hardConstraints?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
  scheduleAt?: Date; // 可选：延迟执行
  priority?: number; // 可选：优先级（1-10，数字越小优先级越高）
}

/**
 * 批量创建任务请求接口
 */
export interface CreateBatchTasksRequest {
  userId?: string;
  tasks: Array<{
    mode: 'sync' | 'async';
    topic: string;
    requirements: string;
    hardConstraints?: {
      minWords?: number;
      maxWords?: number;
      keywords?: string[];
    };
  }>;
}

/**
 * 任务调度结果接口
 */
export interface ScheduleResult {
  taskId: string;
  status: 'pending' | 'scheduled';
  scheduledAt?: Date;
}

/**
 * TaskScheduler 类
 *
 * 负责任务的创建、验证和调度
 */
export class TaskScheduler {
  private queue = createTaskQueue();
  private repository = createTaskRepository();
  private initialized = false;

  /**
   * 初始化调度器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.queue;
      this.initialized = true;
      logger.info('TaskScheduler initialized');
    } catch (error) {
      logger.error('Failed to initialize TaskScheduler', error as Error);
      throw error;
    }
  }

  /**
   * 确保调度器已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * 创建并调度单个任务
   */
  async scheduleTask(request: CreateTaskRequest): Promise<string> {
    await this.ensureInitialized();

    try {
      // 1. 验证请求参数
      this.validateTaskRequest(request);

      // 2. 生成任务 ID
      const taskId = uuidv4();

      // 3. 创建任务实体
      const task: Partial<Task> = {
        id: taskId,
        taskId: taskId,
        mode: request.mode as any,
        type: 'article' as any,
        topic: request.topic,
        requirements: request.requirements,
        hardConstraints: request.hardConstraints,
        status: 'pending' as any,
        priority: 2,
        version: 1,
        textRetryCount: 0,
        imageRetryCount: 0,
        targetAudience: 'general',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // 4. 保存到数据库
      await this.repository.create({
        id: task.id!,
        traceId: undefined,
        mode: task.mode!,
        type: (task.type as any) || 'article',
        topic: task.topic!,
        requirements: task.requirements!,
        hardConstraints: task.hardConstraints,
        priority: task.priority,
        maxRetries: 3,
      });

      logger.info('Task created', {
        taskId,
        mode: request.mode,
        topic: request.topic,
      });

      // 5. 准备队列数据
      const jobData: TaskJobData = {
        taskId: task.id!,
        mode: task.mode!,
        topic: task.topic!,
        requirements: task.requirements!,
        imageSize: request.imageSize,
        hardConstraints: task.hardConstraints,
      };

      // 6. 添加到队列
      if (request.scheduleAt) {
        // 延迟任务
        const delay = request.scheduleAt.getTime() - Date.now();
        if (delay > 0) {
          await (await this.queue).addDelayedTask(jobData, delay);
          logger.info('Task scheduled for delayed execution', {
            taskId,
            delay,
            scheduleAt: request.scheduleAt,
          });
        } else {
          // 时间已过，立即执行
          await (await this.queue).addTask(jobData, {
            priority: request.priority,
          });
          logger.info('Task scheduled for immediate execution', {
            taskId,
          });
        }
      } else {
        // 立即执行
        await (await this.queue).addTask(jobData, {
          priority: request.priority,
        });
        logger.info('Task scheduled for immediate execution', {
          taskId,
        });
      }

      return taskId;
    } catch (error) {
      logger.error('Failed to schedule task', error as Error, {
        topic: request.topic,
      });
      throw error;
    }
  }

  /**
   * 批量创建任务
   */
  async scheduleBatchTasks(
    request: CreateBatchTasksRequest
  ): Promise<string[]> {
    await this.ensureInitialized();

    const taskIds: string[] = [];

    try {
      logger.info('Scheduling batch tasks', {
        count: request.tasks.length,
      });

      for (const taskRequest of request.tasks) {
        const taskId = await this.scheduleTask({
          ...taskRequest,
          userId: request.userId,
        });
        taskIds.push(taskId);
      }

      logger.info('Batch tasks scheduled', {
        count: taskIds.length,
      });

      return taskIds;
    } catch (error) {
      logger.error('Failed to schedule batch tasks', error as Error);
      throw error;
    }
  }

  /**
   * 验证任务请求参数
   */
  private validateTaskRequest(request: CreateTaskRequest): void {
    if (!request.topic || request.topic.trim().length === 0) {
      throw new Error('Topic is required');
    }

    if (!request.requirements || request.requirements.trim().length === 0) {
      throw new Error('Requirements are required');
    }

    if (!['sync', 'async'].includes(request.mode)) {
      throw new Error('Mode must be either sync or async');
    }

    if (request.hardConstraints) {
      if (request.hardConstraints.minWords && request.hardConstraints.maxWords) {
        if (request.hardConstraints.minWords > request.hardConstraints.maxWords) {
          throw new Error('minWords cannot be greater than maxWords');
        }
      }
    }

    if (request.imageSize !== undefined) {
      if (typeof request.imageSize !== 'string') {
        throw new Error('imageSize must be a string');
      }
      const trimmed = request.imageSize.trim();
      if (trimmed.length === 0) {
        throw new Error('imageSize cannot be empty');
      }
      const match = trimmed.match(/^(\d+)x(\d+)$/);
      if (!match) {
        throw new Error('imageSize must be in format "WIDTHxHEIGHT" (e.g., 1920x1080)');
      }
      const width = Number(match[1]);
      const height = Number(match[2]);
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        throw new Error('imageSize width/height must be positive numbers');
      }
    }
  }

  /**
   * 取消任务
   */
  async cancelTask(taskId: string): Promise<boolean> {
    try {
      // 更新数据库中的任务状态
      const task = await this.repository.findById(taskId);

      if (!task) {
        logger.warn('Task not found', { taskId });
        return false;
      }

      // 只有 pending 状态的任务可以取消
      if (task.status !== 'pending') {
        logger.warn('Task cannot be cancelled', {
          taskId,
          status: task.status,
        });
        return false;
      }

      // 使用 delete 方法标记任务为已取消
      await this.repository.update(task.id, { status: 'cancelled' });

      logger.info('Task cancelled', { taskId });

      return true;
    } catch (error) {
      logger.error('Failed to cancel task', error as Error, { taskId });
      return false;
    }
  }

  /**
   * 获取队列统计信息
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
    repeat: number;
  }> {
    await this.ensureInitialized();
    return await (await this.queue).getStats();
  }

  /**
   * 关闭调度器
   */
  async close(): Promise<void> {
    if (this.initialized) {
      await (await this.queue).close();
      this.initialized = false;
      logger.info('TaskScheduler closed');
    }
  }
}

/**
 * 创建 TaskScheduler 实例
 */
export async function createTaskScheduler(): Promise<TaskScheduler> {
  const scheduler = new TaskScheduler();
  await scheduler.initialize();
  return scheduler;
}
