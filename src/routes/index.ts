/**
 * API 路由聚合
 *
 * 集中管理所有 API 路由
 */

import type { Request, Response, NextFunction } from 'express';
import { Router, type RequestHandler } from 'express';
import taskRoutes from './tasks.js';
import workflowRoutes from './workflows.js';
import healthRoutes from './health.js';
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

// 健康检查路由
router.use('/health', healthRoutes);

// GET /ready - 就绪检查
router.get('/ready', handler((req, res) => healthController.ready(req, res)));

// GET /api/stats - 统计信息
router.get('/stats', handler((req, res) => healthController.getStats(req, res)));

export default router;
