/**
 * CLI status命令
 *
 * 查询任务状态
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createTaskRepository } from '../../../infrastructure/database/index.js';
import { getStatusText, formatDate, formatDuration, printSeparator } from '../utils/formatter.js';
import { cleanupResources } from '../utils/cleanup.js';

export const statusCommand = new Command('status')
  .description('查询任务状态')
  .requiredOption('-t, --task-id <taskId>', '任务ID')
  .action(async (options) => {
    const taskRepo = createTaskRepository();

    try {
      const task = await taskRepo.findById(options.taskId);

      if (!task) {
        console.error(chalk.red(`❌ 错误: 未找到任务 ${options.taskId}`));
        await cleanupResources(taskRepo);
        process.exit(1);
      }

      console.log(chalk.blue.bold('\n📊 任务状态'));
      printSeparator();
      console.log(chalk.white(`任务ID: ${task.taskId}`));
      console.log(chalk.white(`状态: ${getStatusText(task.status)}`));
      console.log(chalk.white(`当前步骤: ${task.currentStep ? getStepDisplayName(task.currentStep) : '无'}`));
      console.log(chalk.white(`执行模式: ${task.mode === 'sync' ? '同步' : '异步'}`));
      console.log(chalk.white(`优先级: ${getPriorityText(task.priority)}`));
      printSeparator();
      console.log(chalk.white(`创建时间: ${formatDate(task.createdAt)}`));
      if (task.startedAt) {
        console.log(chalk.white(`开始时间: ${formatDate(task.startedAt)}`));
      }
      if (task.completedAt) {
        const duration = task.completedAt.getTime() - task.createdAt.getTime();
        console.log(chalk.white(`完成时间: ${formatDate(task.completedAt)}`));
        console.log(chalk.white(`总耗时: ${formatDuration(duration)}`));
      }
      printSeparator();

      // 显示重试信息
      if (task.textRetryCount > 0 || task.imageRetryCount > 0) {
        console.log(chalk.white.bold('重试统计:'));
        if (task.textRetryCount > 0) {
          console.log(chalk.white(`  文本质检: ${task.textRetryCount} 次`));
        }
        if (task.imageRetryCount > 0) {
          console.log(chalk.white(`  配图质检: ${task.imageRetryCount} 次`));
        }
        printSeparator();
      }

      // 显示错误信息
      if (task.errorMessage) {
        console.log(chalk.red.bold('错误信息:'));
        console.log(chalk.red(task.errorMessage));
        printSeparator();
      }

      // 显示Worker信息
      if (task.workerId) {
        console.log(chalk.white(`Worker ID: ${task.workerId}`));
        printSeparator();
      }

      // 清理资源并正常退出
      await cleanupResources(taskRepo);
      process.exit(0);

    } catch (error) {
      console.error(chalk.red(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`));
      await cleanupResources(taskRepo);
      process.exit(1);
    }
  });

function getStepDisplayName(step: string): string {
  const displayNames: Record<string, string> = {
    'search': '🔍 搜索资料',
    'organize': '📋 整理大纲',
    'write': '✍️ 撰写内容',
    'check_text': '🔍 文本质检',
    'generate_image': '🎨 生成配图',
    'check_image': '🔍 配图质检',
  };
  return displayNames[step] || step;
}

function getPriorityText(priority: number): string {
  const priorityMap: Record<number, string> = {
    1: '低',
    2: '普通',
    3: '高',
    4: '紧急',
  };
  return priorityMap[priority] || '普通';
}
