/**
 * CLI create命令
 *
 * 统一的工作流创建命令，支持任意类型的工作流
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
import { WorkflowRegistry } from '../../../domain/workflow/WorkflowRegistry.js';
import { workflowParameterMapper } from '../utils/WorkflowParameterMapper.js';

const logger = createLogger('CLI:Create');

export const createCommand = new Command('create')
  .description('创建并执行工作流任务')
  .option('--type <type>', '工作流类型', 'content-creator')
  .option('--mode <mode>', '执行模式 (sync|async)', 'sync')
  .option('--priority <priority>', '优先级 (low|normal|high|urgent)', 'normal')
  .option('--sync', '同步执行（等待结果）', false)
  .allowUnknownOption()  // 允许未知选项（用于动态工作流参数）
  .allowExcessArguments(true)  // 允许额外参数
  .action(async (options, cmd: any) => {
    // ==================== 阶段 1: 验证工作流类型 ====================
    try {
      if (!WorkflowRegistry.has(options.type)) {
        console.error(chalk.red(`❌ 错误: 未知的工作流类型 "${options.type}"`));
        console.log();
        console.log(chalk.white('💡 可用的工作流类型:'));
        WorkflowRegistry.listWorkflows().forEach(w => {
          console.log(chalk.gray(`  • ${w.type} - ${w.name}`));
        });
        console.log();
        console.log(chalk.white('使用以下命令查看所有工作流:'));
        console.log(chalk.gray('  pnpm run cli workflow list'));
        console.log();
        process.exit(1);
      }

      // 获取工作流元数据
      const metadata = WorkflowRegistry.getMetadata(options.type);

      // ==================== 阶段 2: 解析和映射参数 ====================
      // 解析剩余的命令行参数
      const parsedOptions = { ...options };
      const args = cmd.args;
      const unknownOptions = cmd.optsWithGlobals();

      // 直接解析命令行参数
      const commandLineArgs = process.argv.slice(2); // 移除 node 和 script 路径

      // 解析 --key value 或 --key=value 格式的参数
      for (let i = 0; i < commandLineArgs.length; i++) {
        const arg = commandLineArgs[i];
        if (arg.startsWith('--')) {
          let key = arg.slice(2); // 去除 --
          let value: string | boolean = true; // 默认值为 true（如果没有跟随值）

          // 检查是否是 --key=value 格式
          const equalsIndex = key.indexOf('=');
          if (equalsIndex !== -1) {
            value = key.slice(equalsIndex + 1);
            key = key.slice(0, equalsIndex);
          } else {
            // 检查下一个参数是否是值（不以 -- 开头）
            if (i + 1 < commandLineArgs.length && !commandLineArgs[i + 1].startsWith('--')) {
              value = commandLineArgs[i + 1];
              i++;
            }
          }

          // 只添加工作流特定的参数（避免重复添加通用参数）
          const isCommonParam = ['type', 'mode', 'priority', 'sync'].includes(key);
          if (!isCommonParam) {
            parsedOptions[key] = value;
          }
        }
      }

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        options.type,
        parsedOptions
      );

      if (errors.length > 0) {
        console.error(chalk.red('❌ 参数错误:'));
        errors.forEach(error => {
          console.error(chalk.red(`  • ${error}`));
        });
        console.log();

        // 提取缺少的必需参数
        const missingParams = errors
          .filter(e => e.includes('缺少必需参数'))
          .map(e => e.replace('缺少必需参数: ', ''));

        if (missingParams.length > 0) {
          console.log(workflowParameterMapper.formatMissingParamsError(
            options.type,
            missingParams
          ));
        }
        process.exit(1);
      }

      // ==================== 阶段 3: 使用工作流验证 ====================
      const factory = WorkflowRegistry.getFactory(options.type);
      if (!factory.validateParams(params)) {
        console.error(chalk.red('❌ 参数验证失败'));
        console.log();
        const requiredParams = metadata.requiredParams || [];
        console.log(workflowParameterMapper.formatMissingParamsError(
          options.type,
          requiredParams.filter(p => !params[p])
        ));
        process.exit(1);
      }

      // ==================== 阶段 4: 显示任务信息 ====================
      console.log(chalk.blue.bold('\n🚀 创建工作流任务'));
      printSeparator();
      console.log(chalk.white(`工作流类型: ${metadata.name} (${options.type})`));
      console.log(chalk.white(`描述: ${metadata.description}`));
      console.log(chalk.white(`执行模式: ${params.mode}`));
      console.log(chalk.white(`优先级: ${options.priority}`));

      // 显示工作流特定参数
      metadata.paramDefinitions?.forEach(param => {
        if (params[param.name] !== undefined) {
          const displayValue = Array.isArray(params[param.name])
            ? params[param.name].join(', ')
            : params[param.name];
          console.log(chalk.white(`${param.description}: ${displayValue}`));
        }
      });
      printSeparator();

      // ==================== 阶段 5: 执行任务 ====================
      await executeTask(options.type, params, options.priority);

    } catch (error) {
      logger.error('Create command failed', error as Error);
      console.error(chalk.red(`\n❌ 错误: ${error instanceof Error ? error.message : String(error)}`));

      if (error instanceof Error && error.stack) {
        console.error(chalk.gray('\n堆栈信息:'));
        console.error(chalk.gray(error.stack));
      }

      process.exit(1);
    }
  });

/**
 * 执行任务
 */
async function executeTask(workflowType: string, params: any, priority: string) {
  const resources = {
    pool: null as any,
    servicesInitialized: true,
  };

  try {
    // ==================== 服务初始化 ====================
    const { redisClient } = await import('../../../infrastructure/redis/connection.js');
    const { metricsService } = await import('../../../infrastructure/monitoring/MetricsService.js');

    // 创建执行器
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

      taskRepo = new PostgresTaskRepository(resources.pool);
      resultRepo = new PostgresResultRepository(resources.pool);
      qualityCheckRepo = new PostgresQualityCheckRepository(resources.pool);
      console.log('✅ 使用 PostgreSQL 持久化存储');
    } else if (config.database.type === 'sqlite') {
      taskRepo = new SQLiteTaskRepository();
      console.log('✅ 使用 SQLite 持久化存储');
    } else {
      taskRepo = new MemoryTaskRepository();
      console.log('⚠️  使用内存存储（数据不会持久化）');
    }

    // ==================== 根据执行模式处理 ====================
    const isAsyncMode = params.mode === 'async';

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
        ...params,
        priority: parsePriorityToNumber(priority),
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
        workflowType,
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
      const taskId = params.taskId || uuidv4();
      executor.onProgress(taskId, (progress) => {
        spinner.text = `${progress.message} (${progress.percentage}%)`;
      });

      // 执行任务
      spinner.text = '执行任务中...';
      const result = await executor.execute({
        mode: ExecutionMode.SYNC,
        ...params,
        priority: parsePriority(priority),
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

      // 根据工作流类型显示结果
      displayResult(workflowType, result, qualityCheckRepo);

      logger.info('Task completed via CLI', {
        taskId: result.taskId,
        status: result.status,
        duration: result.duration
      });
    }

    // 任务完成后明确退出
    process.exit(0);
  } finally {
    // ==================== 资源清理 ====================
    if (resources.servicesInitialized) {
      logger.debug('Starting resource cleanup...');

      const { metricsService } = await import('../../../infrastructure/monitoring/MetricsService.js');
      const { redisClient } = await import('../../../infrastructure/redis/connection.js');

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
}

/**
 * 根据工作流类型显示结果
 */
function displayResult(workflowType: string, result: any, qualityCheckRepo: any) {
  const metadata = WorkflowRegistry.getMetadata(workflowType);

  // 如果工作流定义了自定义的结果展示函数，使用它
  if (metadata.resultDisplay) {
    metadata.resultDisplay(result, console);
    return;
  }

  // 默认结果展示逻辑
  const finalState = result.finalState;

  // Content-Creator 工作流的结果展示
  if (workflowType === 'content-creator') {
    // 显示生成的内容（优先显示 finalArticleContent，因为占位符已被替换）
    const contentToDisplay = finalState.finalArticleContent || finalState.articleContent;
    if (contentToDisplay) {
      console.log(chalk.white.bold('\n📝 生成的内容:'));
      printSeparator();
      console.log(contentToDisplay);
      printSeparator();
    }

    // 显示生成的图片（优先显示本地路径）
    if (finalState.images && finalState.images.length > 0) {
      console.log(chalk.white.bold('\n🖼️ 生成的配图:'));
      printSeparator();
      finalState.images.forEach((img: any) => {
        // 优先显示本地路径，因为云端URL会过期
        const imagePath = img.localPath || img.url;
        console.log(chalk.cyan(imagePath));
      });
      printSeparator();
    }

    // 显示质检结果
    if (finalState.textQualityReport) {
      const qr = finalState.textQualityReport;
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

      // 保存质检报告到数据库
      if (qualityCheckRepo) {
        saveQualityCheck(qualityCheckRepo, result.taskId, 'text', qr);
      }
    }

    // 同样保存图片质检报告
    if (finalState.imageQualityReport && qualityCheckRepo) {
      const qr = finalState.imageQualityReport;
      saveQualityCheck(qualityCheckRepo, result.taskId, 'image', qr);
    }
  }

  // Content-Creator-Agent 工作流的结果展示
  if (workflowType === 'content-creator-agent') {
    // 显示生成的内容
    const contentToDisplay = finalState.articleContent;
    if (contentToDisplay) {
      console.log(chalk.white.bold('\n📝 Agent 生成的内容:'));
      printSeparator();
      console.log(contentToDisplay);
      printSeparator();
    }

    // 显示生成的图片
    if (finalState.images && finalState.images.length > 0) {
      console.log(chalk.white.bold('\n🖼️ 生成的配图:'));
      printSeparator();
      finalState.images.forEach((img: any) => {
        const imagePath = img.localPath || img.url;
        console.log(chalk.cyan(imagePath));
      });
      printSeparator();
    }

    // 显示 Agent 对话历史（如果有）
    if (finalState.agentMessages && finalState.agentMessages.length > 0) {
      console.log(chalk.white.bold('\n💭 Agent 思考过程:'));
      printSeparator();
      finalState.agentMessages.slice(-5).forEach((msg: any) => {
        const role = msg.role === 'user' ? '👤 用户' : '🤖 Agent';
        const content = msg.content.slice(0, 200) + (msg.content.length > 200 ? '...' : '');
        console.log(chalk.gray(`${role}: ${content}`));
      });
      printSeparator();
    }
  }

  // Translation 工作流的结果展示
  if (workflowType === 'translation') {
    console.log(chalk.white.bold('\n🌐 翻译结果:'));
    printSeparator();
    console.log(chalk.gray('源文本:'), finalState.sourceText);
    console.log(chalk.white('译文:'), finalState.translatedText);

    if (finalState.qualityReport) {
      const qr = finalState.qualityReport;
      console.log(chalk.white(`\n质检评分: ${qr.score}/10`));
      console.log(chalk.white(`质检状态: ${qr.passed ? chalk.green('通过') : chalk.red('未通过')}`));
      if (qr.fixSuggestions && qr.fixSuggestions.length > 0) {
        console.log(chalk.gray(`改进建议: ${qr.fixSuggestions.join(', ')}`));
      }
    }
    printSeparator();
  }
}

/**
 * 保存质检报告
 */
function saveQualityCheck(qualityCheckRepo: any, taskId: string, checkType: string, qr: any) {
  try {
    qualityCheckRepo.create({
      taskId: taskId,
      checkType: checkType,
      score: qr.score || 0,
      passed: qr.passed,
      hardConstraintsPassed: qr.hardConstraintsPassed || false,
      details: qr.details || {},
      fixSuggestions: qr.fixSuggestions || [],
      rubricVersion: '1.0',
      modelName: qr.modelName,
    });
    logger.info('Quality check saved to database', {
      taskId,
      checkType,
      score: qr.score,
      passed: qr.passed,
    });
  } catch (error) {
    logger.error('Failed to save quality check', {
      taskId,
      checkType,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

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
 */
function parsePriorityToNumber(priority: string): number {
  const priorityMap: Record<string, number> = {
    'low': 5,
    'normal': 7,
    'high': 3,
    'urgent': 1,
  };
  return priorityMap[priority] || 7;
}

function getStatusDisplay(status: string): string {
  const statusMap: Record<string, string> = {
    'completed': chalk.green('已完成'),
    'failed': chalk.red('失败'),
    'cancelled': chalk.gray('已取消'),
  };
  return statusMap[status] || status;
}
