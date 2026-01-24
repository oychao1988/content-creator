#!/usr/bin/env tsx
/**
 * Worker CLI
 *
 * 启动 TaskWorker 处理任务
 */

import { Command } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import { createTaskWorker } from '../workers/TaskWorker.js';
import { createLogger } from '../infrastructure/logging/logger.js';

const logger = createLogger('WorkerCLI');
const program = new Command();

program
  .name('worker')
  .description('Content Creator Task Worker')
  .version('0.1.0');

program
  .command('start')
  .description('启动 Worker')
  .option('-w, --worker-id <id>', 'Worker ID', process.env.WORKER_ID || `worker-${uuidv4()}`)
  .option('-c, --concurrency <number>', '并发数', '2')
  .action(async (options) => {
    try {
      const worker = createTaskWorker(
        options.workerId,
        parseInt(options.concurrency)
      );

      logger.info('Starting worker', {
        workerId: options.workerId,
        concurrency: options.concurrency,
      });

      await worker.start();

      // 监听退出信号
      process.on('SIGTERM', async () => {
        logger.info('SIGTERM received, shutting down worker');
        await worker.close();
        process.exit(0);
      });

      process.on('SIGINT', async () => {
        logger.info('SIGINT received, shutting down worker');
        await worker.close();
        process.exit(0);
      });

      // 保持进程运行
      logger.info('Worker running, press Ctrl+C to stop');
    } catch (error) {
      logger.error('Failed to start worker', error as Error);
      console.error('Detailed error:', error);
      if (error instanceof Error) {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  });

program.parse();
