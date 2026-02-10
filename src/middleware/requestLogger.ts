/**
 * 请求日志中间件
 *
 * 记录所有 HTTP 请求
 */

import type { Request, Response, NextFunction } from 'express';
import { createLogger } from '../infrastructure/logging/logger.js';

const logger = createLogger('HTTP');

/**
 * 请求日志中间件
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // 记录请求开始
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });

  // 监听响应完成
  res.on('finish', () => {
    const duration = Date.now() - startTime;

    if (res.statusCode >= 500) {
      logger.error('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    } else if (res.statusCode >= 400) {
      logger.warn('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    } else {
      logger.info('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      });
    }
  });

  next();
}
