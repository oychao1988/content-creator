/**
 * CLI create命令
 *
 * 创建内容创作任务
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { v4 as uuidv4 } from 'uuid';
import { createSyncExecutor } from '../../../application/workflow/SyncExecutor.js';
import { MemoryTaskRepository } from '../../../infrastructure/database/MemoryTaskRepository.js';
import { PostgresTaskRepository } from '../../../infrastructure/database/PostgresTaskRepository.js';
import { SQLiteTaskRepository } from '../../../infrastructure/database/SQLiteTaskRepository.js';
import { PostgresResultRepository } from '../../../infrastructure/database/ResultRepository.js';
import { PostgresQualityCheckRepository } from '../../../infrastructure/database/PostgresQualityCheckRepository.js';
import { ExecutionMode, TaskPriority } from '../../../domain/entities/Task.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';
import { closeLogger } from '../../../infrastructure/logging/logger.js';
import { printSeparator, formatDuration, formatTokens, formatCost } from '../utils/formatter.js';
import { config } from '../../../config/index.js';

const logger = createLogger('CLI:Create');

export const createCommand = new Command('create')
  .description('创建内容创作任务')
  .option('-t, --topic <topic>', '文章主题')
  .option('-r, --requirements <requirements>', '创作要求')
  .option('-a, --audience <audience>', '目标受众', '普通读者')
  .option('--keywords <keywords>', '关键词（逗号分隔）', '')
  .option('--tone <tone>', '语气风格', '专业')
  .option('--min-words <number>', '最小字数', '500')
  .option('--max-words <number>', '最大字数', '2000')
  .option('--mode <mode>', '执行模式 (sync|async)', 'sync')
  .option('--priority <priority>', '优先级 (low|normal|high|urgent)', 'normal')
  .option('--sync', '同步执行（等待结果）', false)
  .action(async (options) => {
    // ==================== 第一阶段：参数验证（不需要任何服务） ====================
    try {
      // 验证输入
      if (!options.topic) {
        console.error(chalk.red('❌ 错误: 必须提供文章主题 (-t, --topic)'));
        process.exit(1);
      }

      if (!options.requirements) {
        console.error(chalk.red('❌ 错误: 必须提供创作要求 (-r, --requirements)'));
        process.exit(1);
      }

      // 显示任务信息
      console.log(chalk.blue.bold('\n🚀 创建内容创作任务'));
      printSeparator();
      console.log(chalk.white(`主题: ${options.topic}`));
      console.log(chalk.white(`要求: ${options.requirements}`));
      console.log(chalk.white(`受众: ${options.audience}`));
      console.log(chalk.white(`语气: ${options.tone}`));
      if (options.keywords) {
        console.log(chalk.white(`关键词: ${options.keywords}`));
      }
      console.log(chalk.white(`执行模式: ${options.mode}`));
      console.log(chalk.white(`优先级: ${options.priority}`));
      printSeparator();
    } catch (error) {
      console.error(chalk.red(`\n❌ 参数验证失败: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }

    // 解析关键词（在两个 try 块之外的共享作用域）
    const keywords = options.keywords
      ? options.keywords.split(',').map((k: string) => k.trim())
      : undefined;

    // ==================== 第二阶段：服务初始化（仅在验证通过后） ====================
    // 延迟导入服务，避免参数验证失败时不必要的初始化
    const { redisClient } = await import('../../../infrastructure/redis/connection.js');
    const { metricsService } = await import('../../../infrastructure/monitoring/MetricsService.js');

    // 资源管理变量
    const resources = {
      pool: null as any,
      servicesInitialized: true,
    };

    try {
      // 创建执行器
      // 根据配置选择使用 PostgreSQL 或内存数据库
      let taskRepo: any;
      let resultRepo: any = null;
      let qualityCheckRepo: any = null;

      if (config.database.type === 'postgres') {
        const { Pool } = await import('pg');
        resources.pool = new Pool({
          host: config.postgres.host,
          port: config.postgres.port,
          database: config.postgres.database,
          user: config.postgres.user,
          password: config.postgres.password,
        });

        // 使用 PostgreSQL Task Repository，确保任务持久化
        taskRepo = new PostgresTaskRepository(resources.pool);
        resultRepo = new PostgresResultRepository(resources.pool);
        qualityCheckRepo = new PostgresQualityCheckRepository(resources.pool);

        console.log('✅ 使用 PostgreSQL 持久化存储');
      } else if (config.database.type === 'sqlite') {
        // 使用 SQLite Task Repository，确保任务持久化
        taskRepo = new SQLiteTaskRepository();
        console.log('✅ 使用 SQLite 持久化存储');
      } else {
        // 使用内存数据库（仅用于测试）
        taskRepo = new MemoryTaskRepository();
        console.log('⚠️  使用内存存储（数据不会持久化）');
      }

      // ==================== 第三阶段：执行任务 ====================
      const isAsyncMode = options.mode === 'async';

      if (isAsyncMode) {
        // ==================== 异步模式：使用 TaskScheduler ====================
        const { TaskScheduler } = await import('../../../schedulers/TaskScheduler.js');
        const scheduler = new TaskScheduler();

        // 初始化调度器
        await scheduler.initialize();

        // 创建进度spinner
        const spinner = ora('添加任务到队列...').start();

        // 添加任务到队列
        const taskId = await scheduler.scheduleTask({
          mode: 'async',
          topic: options.topic,
          requirements: options.requirements,
          hardConstraints: {
            minWords: parseInt(options.minWords) || undefined,
            maxWords: parseInt(options.maxWords) || undefined,
            keywords,
          },
          priority: parsePriorityToNumber(options.priority),
        });

        spinner.succeed('任务已添加到队列!');

        // 显示任务信息
        console.log(chalk.green.bold('\n✅ 任务已成功创建'));
        printSeparator();
        console.log(chalk.white(`任务ID: ${taskId}`));
        console.log(chalk.white(`模式: 异步（队列）`));
        console.log(chalk.white(`状态: 等待 Worker 处理`));
        printSeparator();

        console.log(chalk.yellow.bold('\n💡 后续操作：'));
        console.log(chalk.white('1. 查询任务状态：'));
        console.log(chalk.gray(`   pnpm run cli result --task-id ${taskId}`));
        console.log(chalk.white('\n2. 确保 Worker 正在运行：'));
        console.log(chalk.gray('   pnpm run worker'));
        console.log(chalk.white('\n3. 查看监控面板：'));
        console.log(chalk.gray('   pnpm run monitor'));
        printSeparator();

        logger.info('Task created via async mode', {
          taskId,
          mode: 'async',
          topic: options.topic,
        });

      } else {
        // ==================== 同步模式：使用 SyncExecutor ====================
        // 为 SQLite 模式创建结果和质检仓储
        if (config.database.type === 'sqlite') {
          const { SQLiteResultRepository } = await import('../../../infrastructure/database/SQLiteResultRepository.js');
          const { SQLiteQualityCheckRepository } = await import('../../../infrastructure/database/SQLiteQualityCheckRepository.js');
          resultRepo = new SQLiteResultRepository();
          qualityCheckRepo = new SQLiteQualityCheckRepository();
        }

        const executor = createSyncExecutor(taskRepo, {
          databaseType: config.database.type,
          enableLogging: true,
          logLevel: 'info',
        });

        // 设置结果仓储（如果可用）
        if (resultRepo) {
          executor.setResultRepository(resultRepo);
        }
        if (qualityCheckRepo) {
          executor.setQualityCheckRepository(qualityCheckRepo);
        }

        // 创建进度spinner
        const spinner = ora('初始化中...').start();

        // 添加进度回调
        const taskId = uuidv4();
        executor.onProgress(taskId, (progress) => {
          spinner.text = `${progress.message} (${progress.percentage}%)`;
        });

        // 执行任务
        spinner.text = '执行任务中...';
        const result = await executor.execute({
          mode: ExecutionMode.SYNC,
          topic: options.topic,
          requirements: options.requirements,
          targetAudience: options.audience,
          keywords,
          tone: options.tone,
          hardConstraints: {
            minWords: parseInt(options.minWords) || undefined,
            maxWords: parseInt(options.maxWords) || undefined,
          },
          priority: parsePriority(options.priority),
          idempotencyKey: taskId,
        });

        spinner.succeed('任务执行完成!');

        // 显示结果
        console.log(chalk.green.bold('\n✅ 执行成功'));
        printSeparator();
        console.log(chalk.white(`任务ID: ${result.taskId}`));
        console.log(chalk.white(`状态: ${getStatusDisplay(result.status)}`));
        console.log(chalk.white(`耗时: ${formatDuration(result.duration)}`));
        console.log(chalk.white(`步骤: ${result.metadata.stepsCompleted.join(' → ')}`));
        console.log(chalk.white(`Token: ${formatTokens(result.metadata.tokensUsed)}`));
        console.log(chalk.white(`成本: ${formatCost(result.metadata.cost)}`));
        printSeparator();

        // 显示生成的内容
        if (result.finalState.articleContent) {
          console.log(chalk.white.bold('\n📝 生成的内容:'));
          printSeparator();
          console.log(result.finalState.articleContent);
          printSeparator();
        }

        // 显示生成的图片
        if (result.finalState.images && result.finalState.images.length > 0) {
          console.log(chalk.white.bold('\n🖼️ 生成的配图:'));
          printSeparator();
          result.finalState.images.forEach((img: any) => {
            console.log(chalk.cyan(img.url));
          });
          printSeparator();
        }

        // 显示质检结果
        if (result.finalState.textQualityReport) {
          const qr = result.finalState.textQualityReport;
          console.log(chalk.white.bold('\n🔍 文本质检:'));
        printSeparator();
        console.log(chalk.white(`状态: ${qr.passed ? chalk.green('通过') : chalk.red('未通过')}`));
        if (qr.score !== undefined) {
          console.log(chalk.white(`评分: ${qr.score}/100`));
        }
        if (qr.fixSuggestions && qr.fixSuggestions.length > 0) {
          console.log(chalk.gray(`建议: ${qr.fixSuggestions.join(', ')}`));
        }
        printSeparator();

        // 🔧 保存质检报告到数据库（变通方案）
        if (qualityCheckRepo) {
          try {
            await qualityCheckRepo.create({
              taskId: result.taskId,
              checkType: 'text',
              score: qr.score || 0,
              passed: qr.passed,
              hardConstraintsPassed: qr.hardConstraintsPassed || false,
              details: qr.details || {},
              fixSuggestions: qr.fixSuggestions || [],
              rubricVersion: '1.0',
              modelName: qr.modelName,
            });
            logger.info('Text quality check saved to database (workaround)', {
              taskId: result.taskId,
              score: qr.score,
              passed: qr.passed,
            });
          } catch (error) {
            logger.error('Failed to save text quality check (workaround)', {
              taskId: result.taskId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // 🔧 同样保存图片质检报告（变通方案）
      if (result.finalState.imageQualityReport && qualityCheckRepo) {
        try {
          const qr = result.finalState.imageQualityReport;
          await qualityCheckRepo.create({
            taskId: result.taskId,
            checkType: 'image',
            score: qr.score || 0,
            passed: qr.passed,
            hardConstraintsPassed: qr.hardConstraintsPassed || false,
            details: qr.details || {},
            fixSuggestions: qr.fixSuggestions || [],
            rubricVersion: '1.0',
            modelName: qr.modelName,
          });
          logger.info('Image quality check saved to database (workaround)', {
            taskId: result.taskId,
            score: qr.score,
            passed: qr.passed,
          });
        } catch (error) {
          logger.error('Failed to save image quality check (workaround)', {
            taskId: result.taskId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

        logger.info('Task completed via CLI', {
          taskId: result.taskId,
          status: result.status,
          duration: result.duration
        });
      } // 结束同步模式的 else 块

      // 任务完成后明确退出
      process.exit(0);
    } catch (error) {
      logger.error('Create command failed', error as Error);
      console.error(chalk.red(`\n❌ 错误: ${error instanceof Error ? error.message : String(error)}`));

      if (error instanceof Error && error.stack) {
        console.error(chalk.gray('\n堆栈信息:'));
        console.error(chalk.gray(error.stack));
      }

      process.exit(1);
    } finally {
      // ==================== 第四阶段：资源清理 ====================
      // 仅在服务已初始化的情况下清理
      if (resources.servicesInitialized) {
        logger.debug('Starting resource cleanup...');

        // 1. 停止 Metrics 服务定时器
        try {
          metricsService.stop();
          console.log('Metrics service stopped');
        } catch (error) {
          console.log('Error stopping metrics service (ignored):', error);
        }

        // 2. 关闭 Redis 客户端连接
        try {
          await redisClient.disconnect();
          console.log('Redis client disconnected');
        } catch (error) {
          console.log('Error disconnecting Redis (ignored):', error);
        }

        // 3. 关闭 PostgreSQL 连接池
        try {
          if (resources.pool) {
            await resources.pool.end();
            console.log('PostgreSQL connection pool closed');
          }
        } catch (error) {
          console.log('Error closing PostgreSQL pool (ignored):', error);
        }

        // 4. 关闭 Logger（必须在最后）
        try {
          await closeLogger();
          logger.debug('Logger closed');
        } catch (error) {
          console.log('Error closing logger (ignored):', error);
        }

        console.log('Resource cleanup completed');
      }
    }
  });

function parsePriority(priority: string): TaskPriority {
  const priorityMap: Record<string, TaskPriority> = {
    'low': TaskPriority.LOW,
    'normal': TaskPriority.NORMAL,
    'high': TaskPriority.HIGH,
    'urgent': TaskPriority.URGENT,
  };
  return priorityMap[priority] || TaskPriority.NORMAL;
}

/**
 * 将优先级字符串转换为数字（用于 TaskScheduler）
 * TaskScheduler 使用数字优先级（1-10，数字越小优先级越高）
 */
function parsePriorityToNumber(priority: string): number {
  const priorityMap: Record<string, number> = {
    'low': 5,      // 低优先级
    'normal': 7,   // 普通优先级（默认）
    'high': 3,     // 高优先级
    'urgent': 1,   // 紧急优先级
  };
  return priorityMap[priority] || 7; // 默认为 normal (7)
}

function getStatusDisplay(status: string): string {
  const statusMap: Record<string, string> = {
    'completed': chalk.green('已完成'),
    'failed': chalk.red('失败'),
    'cancelled': chalk.gray('已取消'),
  };
  return statusMap[status] || status;
}
