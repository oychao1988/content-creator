/**
 * Express 应用设置
 *
 * 配置 Express 中间件和路由
 */

import express, { type Application } from 'express';
import * as Sentry from '@sentry/node';
import { requestLogger, errorHandler, notFoundHandler } from '../../middleware/index.js';
import apiRoutes from '../../routes/index.js';
import healthRoutes from '../../routes/health.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('ExpressApp');

/**
 * 创建 Express 应用
 */
export function createApp(): Application {
  const app = express();

  // ========== Sentry 初始化 ==========
  if (config.monitoring.sentry) {
    Sentry.init({
      dsn: config.monitoring.sentry.dsn,
      environment: config.monitoring.sentry.environment,
      integrations: [
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.Express({ app }),
      ],
      tracesSampleRate: 1.0,
    });

    // Sentry 请求处理中间件
    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());
  }

  // ========== 基础中间件 ==========
  // JSON 解析
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 请求日志
  app.use(requestLogger);

  // ========== CORS (可选) ==========
  // 简单的 CORS 支持
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // ========== 路由 ==========
  // API 根路径
  app.get('/api', (_req, res) => {
    res.json({
      name: 'LLM Content Creator API',
      version: '0.2.0',
      description: 'AI-powered multi-workflow content creation API',
      endpoints: {
        tasks: '/api/tasks',
        workflows: '/api/workflows',
        health: '/health',
        stats: '/api/stats',
      },
    });
  });

  // 挂载健康检查路由（根级别）
  app.use('/health', healthRoutes);
  app.use('/ready', healthRoutes);

  // 挂载 API 路由
  app.use('/api', apiRoutes);

  // ========== Sentry 错误处理 ==========
  if (config.monitoring.sentry) {
    app.use(Sentry.Handlers.errorHandler());
  }

  // ========== 错误处理 ==========
  app.use(notFoundHandler);
  app.use(errorHandler);

  logger.info('Express app configured');

  return app;
}
