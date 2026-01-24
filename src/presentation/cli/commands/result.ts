/**
 * CLI result命令
 *
 * 获取任务结果
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createTaskRepository } from '../../../infrastructure/database/index.js';
import { PostgresResultRepository } from '../../../infrastructure/database/ResultRepository.js';
import { getStatusText, printSeparator } from '../utils/formatter.js';
import { cleanupResources } from '../utils/cleanup.js';
import { config } from '../../../config/index.js';

export const resultCommand = new Command('result')
  .description('获取任务结果')
  .requiredOption('-t, --task-id <taskId>', '任务ID')
  .option('--format <format>', '输出格式 (text|json)', 'text')
  .action(async (options) => {
    // 使用工厂函数创建 Repository（支持 memory 和 postgres）
    const taskRepo = createTaskRepository();
    let resultRepo: any = null;
    let pool: any = null;

    try {
      const task = await taskRepo.findById(options.taskId);

      if (!task) {
        console.error(chalk.red(`❌ 错误: 未找到任务 ${options.taskId}`));

        // 如果是内存模式，显示额外提示
        if (config.database.type === 'memory') {
          console.log(chalk.yellow('\n💡 提示: 当前使用内存模式'));
          console.log(chalk.gray('   - 内存模式下的任务数据不会持久化'));
          console.log(chalk.gray('   - 任务完成后结果会直接显示在终端'));
          console.log(chalk.gray('   - 如果需要查询历史任务，请使用 PostgreSQL 模式'));
        }

        await cleanupResources(taskRepo, resultRepo);
        process.exit(1);
      }

      // 如果任务未完成，显示状态
      if (task.status !== 'completed') {
        console.log(chalk.yellow(`⚠️  任务尚未完成，当前状态: ${getStatusText(task.status)}`));
        await cleanupResources(taskRepo, resultRepo);
        process.exit(0);
      }

      // JSON格式输出
      if (options.format === 'json') {
        console.log(JSON.stringify(task, null, 2));
        await cleanupResources(taskRepo, resultRepo);
        process.exit(0);
      }

      // 文本格式输出
      console.log(chalk.blue.bold('\n📄 任务结果'));
      printSeparator();
      console.log(chalk.white(`任务ID: ${task.taskId}`));
      console.log(chalk.white(`状态: ${getStatusText(task.status)}`));
      printSeparator();

      // 从数据库查询结果（支持 PostgreSQL 和 SQLite）
      if (config.database.type === 'postgres') {
        const { Pool } = await import('pg');
        pool = new Pool({
          host: config.postgres.host,
          port: config.postgres.port,
          database: config.postgres.database,
          user: config.postgres.user,
          password: config.postgres.password,
        });

        resultRepo = new PostgresResultRepository(pool);
        const results = await resultRepo.findByTaskId(options.taskId);

        if (results.length === 0) {
          console.log(chalk.yellow('提示: 该任务未生成结果'));
        } else {
          console.log(chalk.blue.bold('\n📋 生成结果'));
          printSeparator();

          results.forEach((result: any, index: number) => {
            console.log(chalk.white.bold(`${index + 1}. ${result.resultType.toUpperCase()}`));
            printSeparator();

            if (result.resultType === 'article') {
              console.log(chalk.white('内容:'));
              console.log(chalk.gray(result.content || '(无内容)'));
              if (result.metadata?.wordCount) {
                console.log(chalk.gray(`字数: ${result.metadata.wordCount}`));
              }
            } else if (result.resultType === 'image') {
              console.log(chalk.white('图片 URL:'));
              console.log(chalk.cyan(result.content || '(无 URL)'));
            }
            printSeparator();
          });
        }

        // 关闭结果查询的连接池
        await pool.end();
      } else if (config.database.type === 'sqlite') {
        // SQLite 模式：使用 SQLiteResultRepository 查询结果
        const { SQLiteResultRepository } = await import('../../../infrastructure/database/SQLiteResultRepository.js');
        resultRepo = new SQLiteResultRepository();
        const results = await resultRepo.findByTaskId(options.taskId);

        if (results.length === 0) {
          console.log(chalk.yellow('提示: 该任务未生成结果'));
        } else {
          console.log(chalk.blue.bold('\n📋 生成结果'));
          printSeparator();

          results.forEach((result: any, index: number) => {
            console.log(chalk.white.bold(`${index + 1}. ${result.resultType.toUpperCase()}`));
            printSeparator();

            if (result.resultType === 'article') {
              console.log(chalk.white('内容:'));
              console.log(chalk.gray(result.content || '(无内容)'));
              if (result.metadata?.wordCount) {
                console.log(chalk.gray(`字数: ${result.metadata.wordCount}`));
              }
            } else if (result.resultType === 'image') {
              console.log(chalk.white('图片 URL:'));
              console.log(chalk.cyan(result.content || '(无 URL)'));
            }
            printSeparator();
          });
        }
      } else {
        // Memory 模式：提示结果仅实时返回
        console.log(chalk.yellow('\n💡 提示: 当前使用 Memory 模式'));
        console.log(chalk.gray('   - 任务结果仅在执行时实时返回到终端'));
        console.log(chalk.gray('   - 任务完成后数据不会保存到数据库'));
        console.log(chalk.gray('   - 如需保存结果，请使用 PostgreSQL 模式或 sync 模式查看实时输出'));
      }

      // 清理所有资源
      await cleanupResources(taskRepo, resultRepo);
      process.exit(0);

    } catch (error) {
      console.error(chalk.red(`❌ 错误: ${error instanceof Error ? error.message : String(error)}`));

      // 如果是内存模式，显示额外提示
      if (config.database.type === 'memory') {
        console.log(chalk.yellow('\n💡 提示: Memory 模式下任务数据不持久化'));
      }

      await cleanupResources(taskRepo, resultRepo);

      // 清理 PostgreSQL 连接池
      if (pool) {
        try {
          await pool.end();
        } catch (e) {
          // 忽略关闭错误
        }
      }

      process.exit(1);
    }
  });
