/**
 * HTTP 服务器
 *
 * 启动 HTTP API 服务器
 */

import type { Server } from 'http';
import { createServer } from 'http';
import { createApp } from './app.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('APIServer');

/**
 * 启动 HTTP API 服务器
 */
export async function startApiServer(port: number = 3001): Promise<Server> {
  const app = createApp();
  const server = createServer(app);

  return new Promise((resolve, reject) => {
    server.on('error', (error) => {
      logger.error('Failed to start API server', { error });
      reject(error);
    });

    server.listen(port, () => {
      logger.info('API server started', {
        port,
        env: config.isDevelopment ? 'development' : config.isProduction ? 'production' : 'test',
        nodeEnv: config.env.NODE_ENV,
        url: `http://localhost:${port}`,
        apiDocs: `http://localhost:${port}/api`,
      });

      // 打印可用路由
      logger.info('Available endpoints:', {
        health: `GET  http://localhost:${port}/health`,
        ready: `GET  http://localhost:${port}/ready`,
        apiRoot: `GET  http://localhost:${port}/api`,
        tasks: `GET  http://localhost:${port}/api/tasks`,
        createTask: `POST http://localhost:${port}/api/tasks`,
        workflows: `GET  http://localhost:${port}/api/workflows`,
        stats: `GET  http://localhost:${port}/api/stats`,
      });

      resolve(server);
    });
  });
}

/**
 * 主入口（可直接运行此文件）
 */
export async function main(): Promise<void> {
  const port = Number(process.env.API_PORT) || 3001;

  // 全局未处理异常和 Promise rejection 处理
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', {
      reason: String(reason),
      promise: String(promise),
    });
    // 不立即退出，给日志记录时间
  });

  try {
    const server = await startApiServer(port);

    // 优雅关闭
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down API server gracefully`);
      server.close(() => {
        logger.info('API server closed');
        process.exit(0);
      });

      // 强制关闭超时
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start API server', { error });
    process.exit(1);
  }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
