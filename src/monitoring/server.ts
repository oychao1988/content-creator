/**
 * Bull Board 监控面板服务器
 *
 * 提供 Web UI 监控任务队列状态
 */

import express from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { createTaskQueue } from '../infrastructure/queue/TaskQueue.js';
import { createLogger } from '../infrastructure/logging/logger.js';

const logger = createLogger('BullBoard');

/**
 * 创建 Bull Board 监控服务器
 */
export async function createMonitorServer(port: number = 3000): Promise<void> {
  const app = express();

  try {
    // 创建 Express 适配器
    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/admin/queues');

    // 创建任务队列
    const taskQueue = await createTaskQueue();
    const queue = taskQueue.getQueue();
    if (!queue) {
      throw new Error('Task queue not available');
    }

    // 创建 Bull Board
    createBullBoard({
      queues: [new BullMQAdapter(queue)],
      serverAdapter,
    });

    // 挂载 Bull Board 路由
    app.use('/admin/queues', serverAdapter.getRouter());

    // 自定义统计 API
    app.get('/api/stats', async (_req, res) => {
      try {
        const stats = await taskQueue.getStats();
        res.json({
          success: true,
          data: stats,
        });
      } catch (error) {
        logger.error('Failed to get queue stats', error as Error);
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    // 健康检查
    app.get('/health', (_req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
      });
    });

    // 启动服务器
    const server = app.listen(port, () => {
      logger.info('Monitor server started', {
        port,
        url: `http://localhost:${port}`,
        bullBoardUrl: `http://localhost:${port}/admin/queues`,
      });
    });

    // 优雅关闭
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received, closing monitor server');
      server.close(() => {
        logger.info('Monitor server closed');
      });
    });

    process.on('SIGINT', () => {
      logger.info('SIGINT received, closing monitor server');
      server.close(() => {
        logger.info('Monitor server closed');
      });
    });

    return;
  } catch (error) {
    logger.error('Failed to start monitor server', error as Error);
    throw error;
  }
}

/**
 * 启动监控服务器
 */
export async function startMonitorServer(port?: number): Promise<void> {
  try {
    await createMonitorServer(port);
  } catch (error) {
    logger.error('Failed to start monitor server', error as Error);
    process.exit(1);
  }
}
