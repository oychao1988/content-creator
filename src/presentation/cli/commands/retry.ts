/**
 * CLI Retry Command
 *
 * 重新执行历史任务
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createTaskRepository } from '../../../infrastructure/database/index.js';
import { TaskQueue } from '../../../infrastructure/queue/TaskQueue.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('CLI:Retry');

function printSeparator() {
  console.log(chalk.gray('─'.repeat(80)));
}

export const retryCommand = new Command('retry')
  .description('重新执行任务')
  .option('-t, --task-id <id>', '重新执行指定任务')
  .option('-a, --all', '重新执行所有等待中的任务')
  .option('-s, --status <status>', '按状态筛选任务 (pending, failed, cancelled)', 'pending')
  .option('-l, --limit <number>', '处理数量限制', '10')
  .option('--dry-run', '模拟运行，不实际执行')
  .action(async (options) => {
    try {
      printSeparator();
      console.log(chalk.bold.blue('🔄 重新执行任务'));
      printSeparator();

      const repository = createTaskRepository();
      const queue = new TaskQueue();

      // 方案 1: 重新执行指定任务
      if (options.taskId) {
        await retrySingleTask(options.taskId, repository, queue, options.dryRun);
        process.exit(0);
      }

      // 方案 2: 批量重新执行
      if (options.all) {
        const limit = parseInt(options.limit) || 10;
        await retryBatchTasks(options.status, limit, repository, queue, options.dryRun);
        process.exit(0);
      }

      // 没有指定参数，显示帮助
      console.log(chalk.yellow('请指定要重新执行的任务：'));
      console.log(chalk.white('1. 重新执行单个任务：'));
      console.log(chalk.gray('   pnpm run cli:retry --task-id <任务ID>'));
      console.log(chalk.white('\n2. 批量重新执行所有等待任务：'));
      console.log(chalk.gray('   pnpm run cli:retry --all'));
      console.log(chalk.white('\n3. 批量重新执行失败任务：'));
      console.log(chalk.gray('   pnpm run cli:retry --all --status failed'));
      console.log(chalk.white('\n4. 模拟运行（不实际执行）：'));
      console.log(chalk.gray('   pnpm run cli:retry --all --dry-run'));
      console.log();

      process.exit(0);
    } catch (error) {
      logger.error('Failed to retry tasks', error as Error);
      console.error(chalk.red('❌ 重新执行失败：'), (error as Error).message);
      process.exit(1);
    } finally {
      // 清理队列连接
      try {
        const queue = new TaskQueue();
        await queue.close();
      } catch (error) {
        // 忽略清理错误
      }
    }
  });

/**
 * 重新执行单个任务
 */
async function retrySingleTask(
  taskId: string,
  repository: any,
  queue: TaskQueue,
  dryRun: boolean = false
): Promise<void> {
  console.log(chalk.white(`📝 任务 ID: ${chalk.bold(taskId)}`));
  console.log();

  // 1. 查询任务
  const task = await repository.findById(taskId);

  if (!task) {
    console.log(chalk.red('❌ 任务不存在'));
    process.exit(1);
  }

  console.log(chalk.gray('任务信息:'));
  console.log(chalk.gray(`  主题: ${task.topic}`));
  console.log(chalk.gray(`  状态: ${task.status}`));
  console.log(chalk.gray(`  模式: ${task.mode}`));
  console.log(chalk.gray(`  创建时间: ${task.createdAt?.toLocaleString('zh-CN')}`));
  console.log();

  // 2. 检查任务状态
  if (task.status === 'running' || task.status === 'processing') {
    console.log(chalk.yellow('⚠️  任务正在运行中，无需重新执行'));
    process.exit(0);
  }

  if (task.status === 'completed') {
    console.log(chalk.yellow('⚠️  任务已完成，如需重新执行请创建新任务'));
    process.exit(0);
  }

  // 3. 模拟运行
  if (dryRun) {
    console.log(chalk.blue('🔍 [模拟运行] 将会执行以下操作:'));
    console.log(chalk.gray(`  1. 将任务添加到 Redis 队列`));
    console.log(chalk.gray(`  2. Worker 将会获取并处理该任务`));
    console.log();
    console.log(chalk.yellow('💡 这是模拟运行，没有实际执行'));
    console.log(chalk.gray('   去掉 --dry-run 参数即可实际执行'));
    console.log();
    return;
  }

  // 4. 添加到队列
  try {
    console.log(chalk.white('⏳ 正在添加到队列...'));

    await queue.addTask({
      taskId: task.taskId,
      mode: task.mode === 'sync' ? 'sync' : 'async',
      topic: task.topic,
      requirements: task.requirements,
      hardConstraints: task.hardConstraints,
    });

    console.log(chalk.green('✅ 任务已添加到队列！'));
    console.log();
    console.log(chalk.white('💡 后续操作：'));
    console.log(chalk.gray('   1. 确保 Worker 正在运行: pnpm run worker'));
    console.log(chalk.gray('   2. 查看任务状态: pnpm run cli:status --task-id ' + task.taskId));
    console.log();

    logger.info('Task retried', { taskId, topic: task.topic });
  } catch (error) {
    console.log(chalk.red('❌ 添加到队列失败：'), (error as Error).message);
    throw error;
  }
}

/**
 * 批量重新执行任务
 */
async function retryBatchTasks(
  status: string,
  limit: number,
  repository: any,
  queue: TaskQueue,
  dryRun: boolean = false
): Promise<void> {
  console.log(chalk.white(`📊 批量重新执行 ${chalk.bold(status)} 状态的任务`));
  console.log(chalk.gray(`限制: ${limit} 个`));
  console.log();

  // 1. 查询任务
  const tasks = await repository.findMany({ status }, { limit });

  if (tasks.length === 0) {
    console.log(chalk.yellow('✅ 没有找到需要重新执行的任务'));
    console.log();
    return;
  }

  console.log(chalk.gray(`找到 ${tasks.length} 个任务\n`));

  // 2. 显示任务列表
  console.log(chalk.gray('任务列表:'));
  tasks.forEach((task: any, index: number) => {
    console.log(chalk.gray(`  ${index + 1}. ${task.taskId}`));
    console.log(chalk.gray(`     主题: ${task.topic}`));
    console.log(chalk.gray(`     状态: ${task.status}`));
    console.log();
  });

  // 3. 模拟运行
  if (dryRun) {
    console.log(chalk.blue('🔍 [模拟运行] 将会执行以下操作:'));
    console.log(chalk.gray(`  将 ${tasks.length} 个任务添加到 Redis 队列`));
    console.log();
    console.log(chalk.yellow('💡 这是模拟运行，没有实际执行'));
    console.log(chalk.gray('   去掉 --dry-run 参数即可实际执行'));
    console.log();
    return;
  }

  // 4. 批量添加到队列
  console.log(chalk.white('⏳ 正在批量添加到队列...\n'));

  let successCount = 0;
  let failCount = 0;

  for (const task of tasks) {
    try {
      await queue.addTask({
        taskId: task.taskId,
        mode: task.mode === 'sync' ? 'sync' : 'async',
        topic: task.topic,
        requirements: task.requirements,
        hardConstraints: task.hardConstraints,
      });

      console.log(chalk.green(`✅ ${task.taskId}`));
      successCount++;
    } catch (error) {
      console.log(chalk.red(`❌ ${task.taskId} - ${(error as Error).message}`));
      failCount++;
    }
  }

  console.log();
  console.log(chalk.white('📊 执行结果：'));
  console.log(chalk.green(`   成功: ${successCount} 个`));
  if (failCount > 0) {
    console.log(chalk.red(`   失败: ${failCount} 个`));
  }
  console.log();

  if (successCount > 0) {
    console.log(chalk.white('💡 后续操作：'));
    console.log(chalk.gray('   1. 确保 Worker 正在运行: pnpm run worker'));
    console.log(chalk.gray('   2. 查看任务列表: pnpm run cli:list'));
    console.log();
  }

  logger.info('Batch retry completed', {
    total: tasks.length,
    success: successCount,
    failed: failCount,
  });
}
