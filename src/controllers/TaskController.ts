/**
 * 任务控制器
 *
 * 处理任务相关的 HTTP 请求
 */

import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SyncExecutor } from '../application/workflow/SyncExecutor.js';
import { TaskQueue } from '../infrastructure/queue/TaskQueue.js';
import { createTaskRepository, createResultRepository } from '../infrastructure/database/index.js';
import { WorkflowRegistry } from '../domain/workflow/WorkflowRegistry.js';
import type { CreateTaskParams } from '../domain/entities/Task.js';
import { ExecutionMode } from '../domain/entities/Task.js';
import { taskToDto, type TaskResultResponseDto, type TaskStatusResponseDto } from '../dto/taskDtos.js';
import {
  ValidationError,
  NotFoundError,
  asyncHandler,
} from '../middleware/errorHandler.js';
import { createLogger } from '../infrastructure/logging/logger.js';

const logger = createLogger('TaskController');

/**
 * 任务控制器类
 */
export class TaskController {
  private syncExecutor: SyncExecutor;
  private taskQueue?: TaskQueue;

  constructor() {
    // 初始化同步执行器
    const taskRepo = createTaskRepository();
    const resultRepo = createResultRepository();
    this.syncExecutor = new SyncExecutor(taskRepo);
    this.syncExecutor.setResultRepository(resultRepo);

    // 初始化任务队列（如果可用）
    // 注意：TaskQueue 需要 Redis，如果未配置则跳过
    // 异步任务通过队列处理，但 API 调用本身是同步的
    logger.info('TaskController initialized');
  }

  /**
   * 创建任务
   * POST /api/tasks
   */
  createTask = asyncHandler(async (req: Request, res: Response) => {
    const body = req.body;

    // 确定执行模式
    const mode: ExecutionMode = body.mode || 'sync';

    // 构建创建任务参数
    const params: CreateTaskParams = {
      mode,
      type: body.type,
      topic: body.topic,
      requirements: body.requirements,
      targetAudience: body.targetAudience,
      keywords: body.keywords,
      tone: body.tone,
      imageSize: body.imageSize,
      priority: body.priority,
      maxTokens: body.maxTokens,
      userId: body.userId,
      hardConstraints: body.hardConstraints,
      idempotencyKey: body.idempotencyKey || uuidv4(),
      callbackUrl: body.callbackUrl,
      callbackEnabled: body.callbackEnabled,
      callbackEvents: body.callbackEvents,
    };

    logger.info('Creating task', {
      mode,
      topic: params.topic,
      type: params.type,
    });

    // 根据模式执行任务
    if (mode === 'sync') {
      // 同步执行
      const result = await this.syncExecutor.execute(params);

      const response: TaskResultResponseDto = {
        taskId: result.taskId,
        status: result.status,
        content: (result.finalState as any).articleContent,
        htmlContent: (result.finalState as any).finalArticleContent,
        images: (result.finalState as any).images,
        qualityScore: (result.finalState as any).textQualityReport?.score,
        wordCount: (result.finalState as any).articleContent?.length || 0,
        metrics: {
          tokensUsed: result.metadata.tokensUsed,
          cost: result.metadata.cost,
          duration: result.duration,
          stepsCompleted: result.metadata.stepsCompleted,
        },
        error: result.error,
      };

      res.status(201).json({
        success: true,
        data: response,
        timestamp: new Date().toISOString(),
      });
    } else {
      // 异步执行 - 添加到队列
      if (!this.taskQueue) {
        throw new ValidationError('Async mode is not available - queue not configured');
      }

      // 验证工作流类型
      const workflowType = params.type || 'content-creator';
      if (!WorkflowRegistry.has(workflowType)) {
        throw new ValidationError(`Unknown workflow type: ${workflowType}`);
      }

      const taskRepo = createTaskRepository();
      const task = await taskRepo.create({
        id: params.idempotencyKey || uuidv4(),
        userId: params.userId,
        mode: params.mode,
        type: workflowType,
        topic: params.topic,
        requirements: params.requirements,
        hardConstraints: params.hardConstraints,
        idempotencyKey: params.idempotencyKey,
      });

      // 添加到队列
      await this.taskQueue.add(task.id, {
        type: workflowType,
        params,
      });

      logger.info('Task added to queue', { taskId: task.id });

      res.status(202).json({
        success: true,
        data: {
          taskId: task.id,
          status: 'pending',
          message: 'Task has been queued for processing',
        },
        timestamp: new Date().toISOString(),
      });
    }
  });

  /**
   * 列出任务
   * GET /api/tasks
   */
  listTasks = asyncHandler(async (req: Request, res: Response) => {
    const query = (req as any).validatedQuery || {};
    const taskRepo = createTaskRepository();

    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const offset = (page - 1) * limit;

    // 构建查询选项
    const filters: {
      status?: string;
      workerId?: string;
      type?: string;
      limit: number;
      offset: number;
    } = {
      limit,
      offset,
    };

    if (query.status) {
      filters.status = query.status;
    }
    if (query.userId) {
      // SQLite 没有 userId 字段，跳过此过滤
    }

    const result = await taskRepo.list(filters);

    res.json({
      success: true,
      data: {
        tasks: result.data.map(taskToDto),
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit),
        },
      },
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * 获取任务详情
   * GET /api/tasks/:id
   */
  getTask = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const taskRepo = createTaskRepository();

    const task = await taskRepo.findById(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    res.json({
      success: true,
      data: taskToDto(task),
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * 获取任务状态
   * GET /api/tasks/:id/status
   */
  getTaskStatus = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const taskRepo = createTaskRepository();

    const task = await taskRepo.findById(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    // 计算进度
    const steps = ['search', 'organize', 'write', 'check_text', 'generate_image', 'check_image'];
    const currentIndex = steps.indexOf(task.currentStep || '');
    const progress = currentIndex >= 0 ? Math.round((currentIndex + 1) / steps.length * 100) : 0;

    const response: TaskStatusResponseDto = {
      taskId: task.id,
      status: task.status,
      currentStep: task.currentStep,
      progress,
    };

    res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * 获取任务结果
   * GET /api/tasks/:id/result
   */
  getTaskResult = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const taskRepo = createTaskRepository();
    const resultRepo = createResultRepository();

    const task = await taskRepo.findById(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    if (task.status !== 'completed') {
      throw new ValidationError('Task is not completed yet');
    }

    const results = await resultRepo.findByTaskId(id);

    // 聚合结果
    const response: TaskResultResponseDto = {
      taskId: task.id,
      status: 'completed',
    };

    for (const result of results) {
      if (result.resultType === 'article') {
        response.content = result.content;
      } else if (result.resultType === 'finalArticle') {
        response.htmlContent = result.content;
        response.wordCount = result.metadata?.wordCount;
      } else if (result.resultType === 'image') {
        response.images = JSON.parse(result.content);
      }
    }

    res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * 重试任务
   * POST /api/tasks/:id/retry
   */
  retryTask = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const taskRepo = createTaskRepository();

    const task = await taskRepo.findById(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    if (task.status !== 'failed') {
      throw new ValidationError('Only failed tasks can be retried');
    }

    // 重新执行任务
    const params: CreateTaskParams = {
      mode: 'sync',
      type: task.type,
      topic: task.topic,
      requirements: task.requirements,
      targetAudience: task.targetAudience,
      keywords: task.keywords,
      tone: task.tone,
      hardConstraints: task.hardConstraints,
      idempotencyKey: uuidv4(),
    };

    const result = await this.syncExecutor.execute(params);

    const response: TaskResultResponseDto = {
      taskId: result.taskId,
      status: result.status,
      content: (result.finalState as any).articleContent,
      htmlContent: (result.finalState as any).finalArticleContent,
      images: (result.finalState as any).images,
      qualityScore: (result.finalState as any).textQualityReport?.score,
      wordCount: (result.finalState as any).articleContent?.length || 0,
      metrics: {
        tokensUsed: result.metadata.tokensUsed,
        cost: result.metadata.cost,
        duration: result.duration,
        stepsCompleted: result.metadata.stepsCompleted,
      },
      error: result.error,
    };

    res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * 取消任务
   * DELETE /api/tasks/:id
   */
  cancelTask = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const taskRepo = createTaskRepository();

    const task = await taskRepo.findById(id);
    if (!task) {
      throw new NotFoundError('Task', id);
    }

    if (task.status === 'completed' || task.status === 'cancelled') {
      throw new ValidationError('Task cannot be cancelled');
    }

    // 取消任务
    await this.syncExecutor.cancel(id);

    res.json({
      success: true,
      data: {
        taskId: id,
        status: 'cancelled',
        message: 'Task has been cancelled',
      },
      timestamp: new Date().toISOString(),
    });
  });
}
