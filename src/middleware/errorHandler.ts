/**
 * 错误处理中间件
 *
 * 统一处理 API 错误响应
 */

import type { Request, Response, NextFunction } from 'express';
import type { ErrorResponseDto } from '../dto/taskDtos.js';
import * as Sentry from '@sentry/node';
import { createLogger } from '../infrastructure/logging/logger.js';

const logger = createLogger('ErrorHandler');

/**
 * API 错误类
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * 验证错误类
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(400, 'VALIDATION_ERROR', message, details);
    this.name = 'ValidationError';
  }
}

/**
 * 未找到错误类
 */
export class NotFoundError extends ApiError {
  constructor(resource: string, identifier: string) {
    super(404, 'NOT_FOUND', `${resource} not found: ${identifier}`);
    this.name = 'NotFoundError';
  }
}

/**
 * 异步错误包装器
 * 用于包装异步路由处理器
 */
export function asyncHandler(fn: Function) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 路由处理器包装器（2 参数版本）
 * 用于简化控制器方法调用
 */
export function routeHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return asyncHandler(async (req: Request, res: Response) => {
    await fn(req, res);
  });
}

/**
 * 错误处理中间件
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // 记录错误到日志
  logger.error('API error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  // 发送错误到 Sentry
  Sentry.captureException(error);

  // 构建 API 错误响应
  const errorResponse: ErrorResponseDto = {
    success: false,
    error: {
      message: error.message || 'Internal server error',
    },
    timestamp: new Date().toISOString(),
  };

  // 处理自定义 API 错误
  if (error instanceof ApiError) {
    errorResponse.error.code = error.code;
    if (error.details) {
      errorResponse.error.details = error.details;
    }
    res.status(error.statusCode).json(errorResponse);
    return;
  }

  // 处理 Zod 验证错误
  if (error.name === 'ZodError') {
    const zodError = error as { issues: Array<{ path: string[]; message: string }> };
    errorResponse.error.code = 'VALIDATION_ERROR';
    errorResponse.error.message = 'Request validation failed';
    errorResponse.error.details = {
      fields: zodError.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
    res.status(400).json(errorResponse);
    return;
  }

  // 默认 500 错误
  res.status(500).json(errorResponse);
}

/**
 * 404 处理中间件
 */
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse: ErrorResponseDto = {
    success: false,
    error: {
      message: `Route not found: ${req.method} ${req.path}`,
      code: 'NOT_FOUND',
    },
    timestamp: new Date().toISOString(),
  };
  res.status(404).json(errorResponse);
}
