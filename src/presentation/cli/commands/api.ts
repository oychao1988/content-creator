/**
 * API 服务器命令
 *
 * 启动 HTTP API 服务器
 */

import { Command } from 'commander';
import { startApiServer } from '../../api/server.js';
import { config } from '../../../config/index.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('CLI::API');

export const apiCommand = new Command('api')
  .description('启动 HTTP API 服务器')
  .option('-p, --port <number>', '端口号', String(config.api.port))
  .option('-h, --host <string>', '监听地址', config.api.host)
  .action(async (options) => {
    const port = Number(options.port);

    logger.info('Starting API server', {
      port,
      host: options.host,
    });

    try {
      await startApiServer(port);
    } catch (error) {
      logger.error('Failed to start API server', { error });
      process.exit(1);
    }
  });
