/**
 * CLI List Command
 *
 * 列出历史任务
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createTaskRepository } from '../../../infrastructure/database/index.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('CLI:List');

function printSeparator() {
  console.log(chalk.gray('─'.repeat(100)));
}

/**
 * 格式化任务状态显示
 */
function formatTaskStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: chalk.yellow('等待中'),
    processing: chalk.blue('处理中'),
    running: chalk.blue('运行中'),
    completed: chalk.green('已完成'),
    failed: chalk.red('失败'),
    cancelled: chalk.gray('已取消'),
  };
  return statusMap[status] || status;
}

/**
 * 格式化执行模式
 */
function formatExecutionMode(mode: string): string {
  const modeMap: Record<string, string> = {
    sync: '同步',
    async: '异步',
  };
  return modeMap[mode] || mode;
}

/**
 * 格式化时间显示
 */
function formatTime(dateStr: string | undefined): string {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  // 小于1分钟
  if (diff < 60000) {
    return `${Math.floor(diff / 1000)}秒前`;
  }
  // 小于1小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }
  // 小于24小时
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }
  // 大于24小时，显示日期
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 格式化持续时间
 */
function formatDuration(startedAt: string | undefined, completedAt: string | undefined): string {
  if (!startedAt) return '-';
  if (!completedAt) return '进行中...';

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const duration = end - start;

  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${Math.floor(duration / 1000)}s`;
  return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
}

export const listCommand = new Command('list')
  .description('列出历史任务')
  .option('-s, --status <status>', '筛选状态 (pending, running, completed, failed, cancelled)')
  .option('-m, --mode <mode>', '筛选执行模式 (sync, async)')
  .option('-l, --limit <number>', '显示数量', '20')
  .option('-o, --offset <number>', '偏移量（用于分页）', '0')
  .option('--json', '以 JSON 格式输出')
  .action(async (options) => {
    try {
      const repository = createTaskRepository();

      // 解析参数
      const limit = parseInt(options.limit) || 20;
      const offset = parseInt(options.offset) || 0;

      // 构建过滤条件
      const filters: any = {};

      if (options.status) {
        filters.status = options.status;
      }

      if (options.mode) {
        filters.mode = options.mode;
      }

      // 使用 findMany 方法查询任务列表
      const tasks = await repository.findMany(filters, { limit, offset });

      // JSON 格式输出
      if (options.json) {
        console.log(JSON.stringify(tasks, null, 2));
        process.exit(0);
      }

      // 文本格式输出
      printSeparator();
      console.log(chalk.bold.blue('📋 历史任务列表'));
      printSeparator();

      if (tasks.length === 0) {
        console.log(chalk.yellow('暂无任务记录'));
        console.log();
        console.log(chalk.white('💡 提示：使用以下命令创建新任务'));
        console.log(chalk.gray('  pnpm run cli:create --topic "文章主题" --requirements "创作要求"'));
        console.log();
        process.exit(0);
      }

      // 输出任务列表
      tasks.forEach((task: any, index: number) => {
        console.log(chalk.bold.white(`${index + 1}. ${task.topic}`));
        console.log(chalk.gray(`   ID:        ${task.taskId}`));
        console.log(chalk.gray(`   状态:      ${formatTaskStatus(task.status)}`));
        console.log(chalk.gray(`   模式:      ${formatExecutionMode(task.mode)}`));
        console.log(chalk.gray(`   创建时间:  ${formatTime(task.createdAt?.toISOString())}`));
        console.log(chalk.gray(`   耗时:      ${formatDuration(task.startedAt?.toISOString(), task.completedAt?.toISOString())}`));

        if (task.errorMessage) {
          console.log(chalk.red(`   错误:      ${task.errorMessage}`));
        }

        console.log();
      });

      // 详细信息提示
      console.log(chalk.white('💡 查看任务详情：'));
      console.log(chalk.gray('  pnpm run cli:status --task-id <任务ID>'));
      console.log(chalk.gray('  pnpm run cli:result --task-id <任务ID>'));
      console.log();

      logger.info('Listed tasks', {
        count: tasks.length,
        filters,
      });

      process.exit(0);
    } catch (error) {
      logger.error('Failed to list tasks', error as Error);
      console.error(chalk.red('❌ 查询任务列表失败：'), (error as Error).message);
      process.exit(1);
    }
  });
