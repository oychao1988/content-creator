#!/usr/bin/env tsx
/**
 * Monitor CLI
 *
 * 启动 Bull Board 监控面板
 */

import { Command } from 'commander';
import { startMonitorServer } from '../../monitoring/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('MonitorCLI');
const program = new Command();

program
  .name('monitor')
  .description('Content Creator Monitor Server')
  .version('0.1.0');

program
  .command('start')
  .description('启动监控面板')
  .option('-p, --port <number>', '端口号', '3000')
  .action(async (options) => {
    try {
      const port = parseInt(options.port);

      logger.info('Starting monitor server', { port });

      await startMonitorServer(port);

      // 监听退出信号
      process.on('SIGTERM', () => {
        logger.info('SIGTERM received, shutting down monitor');
        process.exit(0);
      });

      process.on('SIGINT', () => {
        logger.info('SIGINT received, shutting down monitor');
        process.exit(0);
      });

      logger.info('Monitor server running, press Ctrl+C to stop');
    } catch (error) {
      logger.error('Failed to start monitor server', error as Error);
      process.exit(1);
    }
  });

program.parse();
