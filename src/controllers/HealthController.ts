/**
 * 健康检查控制器
 *
 * 处理健康检查和监控相关的 HTTP 请求
 */

import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { createTaskRepository } from '../infrastructure/database/index.js';
import { TaskQueue } from '../infrastructure/queue/TaskQueue.js';
import { config } from '../config/index.js';
import type {
  HealthResponseDto,
  StatsResponseDto,
} from '../dto/taskDtos.js';
import { TaskStatus } from '../domain/entities/Task.js';
import { createLogger } from '../infrastructure/logging/logger.js';

const logger = createLogger('HealthController');

/**
 * 健康检查控制器类
 */
export class HealthController {
  private startTime: number = Date.now();
  private version = '0.2.0';

  /**
   * 健康检查
   * GET /health
   */
  health = asyncHandler(async (req: Request, res: Response) => {
    const checks: HealthResponseDto['checks'] = {
      database: 'ok',
      redis: 'disabled',
      queue: 'disabled',
    };

    // 检查数据库
    try {
      const taskRepo = createTaskRepository();
      await taskRepo.findById('00000000-0000-0000-0000-000000000000');
      checks.database = 'ok';
    } catch (error) {
      logger.warn('Database health check failed', { error });
      checks.database = 'down';
    }

    // 检查 Redis（如果启用）
    if (config.redis.enabled) {
      try {
        // TODO: 添加 Redis 健康检查
        checks.redis = 'ok';
      } catch (error) {
        logger.warn('Redis health check failed', { error });
        checks.redis = 'down';
      }
    }

    // 检查队列（如果启用）
    if (config.redis.enabled) {
      try {
        const queue = new TaskQueue();
        await queue.initialize();
        await queue.getStats();
        checks.queue = 'ok';
      } catch (error) {
        logger.warn('Queue health check failed', { error });
        checks.queue = 'down';
      }
    }

    // 确定整体状态
    const hasDown = Object.values(checks).some((v) => v === 'down');
    const status: HealthResponseDto['status'] = hasDown ? 'degraded' : 'ok';

    const response: HealthResponseDto = {
      status,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime,
      version: this.version,
      checks,
    };

    // 根据状态设置 HTTP 状态码
    const statusCode = status === 'ok' ? 200 : status === 'degraded' ? 200 : 503;

    res.status(statusCode).json(response);
  });

  /**
   * 获取统计信息
   * GET /api/stats
   */
  getStats = asyncHandler(async (req: Request, res: Response) => {
    const taskRepo = createTaskRepository();

    // 获取任务统计
    const result = await taskRepo.list({ limit: 1000000, offset: 0 });
    const allTasks = result.data;

    const byStatus: Record<TaskStatus, number> = {
      [TaskStatus.PENDING]: 0,
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.WAITING]: 0,
      [TaskStatus.COMPLETED]: 0,
      [TaskStatus.FAILED]: 0,
      [TaskStatus.CANCELLED]: 0,
    };

    const byType: Record<string, number> = {};

    for (const task of allTasks) {
      byStatus[task.status]++;
      const type = task.type || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    }

    const response: StatsResponseDto = {
      tasks: {
        total: allTasks.length,
        byStatus,
        byType,
      },
    };

    // 添加队列统计（如果可用）
    if (config.redis.enabled) {
      try {
        const queue = new TaskQueue();
        await queue.initialize();
        const queueStats = await queue.getStats();
        response.queue = {
          waiting: queueStats.waiting || 0,
          active: queueStats.active || 0,
          completed: queueStats.completed || 0,
          failed: queueStats.failed || 0,
        };
      } catch (error) {
        logger.warn('Failed to get queue stats', { error });
      }
    }

    res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * 就绪检查
   * GET /ready
   */
  ready = asyncHandler(async (_req: Request, res: Response) => {
    // 简单检查服务是否启动
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  });
}
