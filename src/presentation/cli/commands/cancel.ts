/**
 * CLI cancel命令
 *
 * 取消任务执行
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { createSyncExecutor } from '../../../application/workflow/SyncExecutor.js';
import { PostgresTaskRepository } from '../../../infrastructure/database/PostgresTaskRepository.js';
import { getStatusText, printSeparator } from '../utils/formatter.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('CLI:Cancel');

export const cancelCommand = new Command('cancel')
  .description('取消任务执行')
  .requiredOption('-t, --task-id <taskId>', '任务ID')
  .action(async (options) => {
    const spinner = ora('处理中...').start();

    try {
      const taskRepo = new PostgresTaskRepository();
      const executor = createSyncExecutor(taskRepo);

      // 检查任务是否存在
      const task = await taskRepo.findById(options.taskId);
      if (!task) {
        spinner.fail('任务不存在');
        console.error(chalk.red(`❌ 错误: 未找到任务 ${options.taskId}`));
        process.exit(1);
      }

      console.log(chalk.blue.bold('\n⏹️  取消任务'));
      printSeparator();
      console.log(chalk.white(`任务ID: ${options.taskId}`));
      console.log(chalk.white(`当前状态: ${getStatusText(task.status)}`));
      printSeparator();

      // 尝试取消
      const success = await executor.cancel(options.taskId);

      if (success) {
        spinner.succeed('任务已取消');
        console.log(chalk.green('✅ 任务已成功取消'));
      } else {
        spinner.fail('取消失败');
        console.log(chalk.yellow('⚠️  无法取消任务'));
        console.log(chalk.gray('可能原因: 任务已完成、失败或已被取消'));
      }

      logger.info('Cancel command executed', {
        taskId: options.taskId,
        success
      });

    } catch (error) {
      spinner.fail('操作失败');
      logger.error('Cancel command failed', error as Error);
      console.error(chalk.red(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });
