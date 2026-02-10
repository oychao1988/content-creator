/**
 * API 路由聚合
 *
 * 集中管理所有 API 路由
 *
 * 注意：/health 和 /ready 路由在 app.ts 中直接挂载 healthRoutes
 */

import type { Request, Response, NextFunction } from 'express';
import { Router, type RequestHandler } from 'express';
import taskRoutes from './tasks.js';
import workflowRoutes from './workflows.js';
import { HealthController } from '../controllers/HealthController.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();
const healthController = new HealthController();

// 辅助函数：创建路由处理器
const handler = (fn: (req: Request, res: Response) => Promise<void>): RequestHandler => {
  return asyncHandler(async (req: Request, res: Response, _next: NextFunction) => {
    await fn(req, res);
  });
};

// 挂载子路由
router.use('/tasks', taskRoutes);
router.use('/workflows', workflowRoutes);

// GET /api/stats - 统计信息
router.get('/stats', handler((req, res) => healthController.getStats(req, res)));

export default router;
