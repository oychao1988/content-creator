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
import { listCommand } from './commands/list.js';
import { retryCommand } from './commands/retry.js';
import { workflowCommand } from './commands/workflow.js';
import { apiCommand } from './commands/api.js';
import { createLogger } from '../../infrastructure/logging/logger.js';
import { ensureWorkflowsInitialized } from '../../domain/workflow/initialize.js';

const logger = createLogger('CLI');

// 确保工作流已初始化
ensureWorkflowsInitialized();

// 创建主程序
const program = new Command();

program
  .name('content-creator')
  .description('AI 驱动的内容创作工具')
  .version('0.1.0')
  .option('-v, --verbose', '显示详细日志');

// 添加命令
program.addCommand(createCommand);
program.addCommand(listCommand);
program.addCommand(retryCommand);
program.addCommand(statusCommand);
program.addCommand(resultCommand);
program.addCommand(cancelCommand);
program.addCommand(workflowCommand);
program.addCommand(apiCommand);

// ========== 工作流脚手架命令 ==========
// 导入脚手架命令
try {
  const { createWorkflowCommand } = await import('./scaffolding/commands/create.js');
  program.addCommand(createWorkflowCommand);
} catch (error) {
  logger.debug('Scaffolding command not available', {
    error: error instanceof Error ? error.message : String(error),
  });
}

// 解析参数
program.parse();

// 记录命令执行
logger.debug('CLI command executed', {
  args: process.argv.slice(2)
});
