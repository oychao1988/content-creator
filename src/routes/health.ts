/**
 * 健康检查路由
 *
 * 定义健康检查和监控相关的 API 路由
 */

import type { Request, Response, NextFunction } from 'express';
import { Router, type RequestHandler } from 'express';
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

/**
 * GET /health
 * 健康检查
 */
router.get(
  '/',
  handler((req, res) => healthController.health(req, res))
);

/**
 * GET /ready
 * 就绪检查
 */
router.get(
  '/ready',
  handler((req, res) => healthController.ready(req, res))
);

export default router;
