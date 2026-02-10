/**
 * 工作流路由
 *
 * 定义工作流相关的 API 路由
 */

import type { Request, Response, NextFunction } from 'express';
import { Router, type RequestHandler } from 'express';
import { WorkflowController } from '../controllers/WorkflowController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
const workflowController = new WorkflowController();

// 辅助函数：创建路由处理器
const handler = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => {
  return asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    await fn(req, res);
  });
};

/**
 * GET /api/workflows
 * 列出所有工作流
 */
router.get(
  '/',
  handler((req, res) => workflowController.listWorkflows(req, res))
);

/**
 * GET /api/workflows/:type
 * 获取工作流详情
 */
router.get(
  '/:type',
  handler((req, res) => workflowController.getWorkflow(req, res))
);

export default router;
