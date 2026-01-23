#!/usr/bin/env node

/**
 * Content Creator CLI
 *
 * AI驱动的内容创作工具
 */

import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { statusCommand } from './commands/status.js';
import { resultCommand } from './commands/result.js';
import { cancelCommand } from './commands/cancel.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('CLI');

// 创建主程序
const program = new Command();

program
  .name('content-creator')
  .description('AI 驱动的内容创作工具')
  .version('0.1.0')
  .option('-v, --verbose', '显示详细日志');

// 添加命令
program.addCommand(createCommand);
program.addCommand(statusCommand);
program.addCommand(resultCommand);
program.addCommand(cancelCommand);

// 解析参数
program.parse();

// 记录命令执行
logger.debug('CLI command executed', {
  args: process.argv.slice(2)
});
