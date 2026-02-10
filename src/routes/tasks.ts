/**
 * 任务路由
 *
 * 定义任务相关的 API 路由
 */

import type { Request, Response, NextFunction } from 'express';
import { Router, type RequestHandler } from 'express';
import { TaskController } from '../controllers/TaskController.js';
import { createTaskSchema, listTasksQuerySchema } from '../validators/taskValidators.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
const taskController = new TaskController();

// 辅助函数：创建路由处理器
const handler = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => {
  return asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    await fn(req, res);
  });
};

/**
 * POST /api/tasks
 * 创建新任务
 */
router.post(
  '/',
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    // 验证请求体
    const result = createTaskSchema.safeParse(req.body);
    if (!result.success) {
      return next(result.error);
    }
    req.body = result.data;
    next();
  }),
  handler((req, res) => taskController.createTask(req, res))
);

/**
 * GET /api/tasks
 * 列出任务
 */
router.get(
  '/',
  asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
    // 验证查询参数
    const result = listTasksQuerySchema.safeParse(req.query);
    if (!result.success) {
      return next(result.error);
    }
    // 将验证后的数据存储到 request 对象的 validatedQuery 属性
    (req as any).validatedQuery = result.data;
    next();
  }),
  handler((req, res) => taskController.listTasks(req, res))
);

/**
 * GET /api/tasks/:id
 * 获取任务详情
 */
router.get(
  '/:id',
  handler((req, res) => taskController.getTask(req, res))
);

/**
 * GET /api/tasks/:id/status
 * 获取任务状态
 */
router.get(
  '/:id/status',
  handler((req, res) => taskController.getTaskStatus(req, res))
);

/**
 * GET /api/tasks/:id/result
 * 获取任务结果
 */
router.get(
  '/:id/result',
  handler((req, res) => taskController.getTaskResult(req, res))
);

/**
 * POST /api/tasks/:id/retry
 * 重试任务
 */
router.post(
  '/:id/retry',
  handler((req, res) => taskController.retryTask(req, res))
);

/**
 * DELETE /api/tasks/:id
 * 取消任务
 */
router.delete(
  '/:id',
  handler((req, res) => taskController.cancelTask(req, res))
);

export default router;
