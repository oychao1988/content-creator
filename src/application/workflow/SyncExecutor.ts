/**
 * SyncExecutor - 同步执行器
 *
 * 负责任务的端到端同步执行
 */

import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../infrastructure/logging/logger.js';
import type { ITaskRepository } from '../../domain/repositories/TaskRepository.js';
import type { IResultRepository } from '../../domain/repositories/ResultRepository.js';
import type { IQualityCheckRepository } from '../../domain/repositories/QualityCheckRepository.js';
import type { CreateTaskParams } from '../../domain/entities/Task.js';
import { TaskStatus, ExecutionMode } from '../../domain/entities/Task.js';
import type { WorkflowState } from '../../domain/workflow/State.js';
import type { BaseWorkflowState } from '../../domain/workflow/BaseWorkflowState.js';
import { WorkflowRegistry } from '../../domain/workflow/WorkflowRegistry.js';
import { contentCreatorWorkflowAdapter } from '../../domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';
import { translationWorkflowFactory } from '../../domain/workflow/examples/TranslationWorkflow.js';
import type {
  ExecutorConfig,
  ExecutionResult,
  ProgressCallback,
} from './types.js';

const logger = createLogger('SyncExecutor');

/**
 * 同步执行器类
 */
export class SyncExecutor {
  private taskRepo: ITaskRepository;
  private resultRepo?: IResultRepository;
  private qualityCheckRepo?: IQualityCheckRepository;
  private config: Required<ExecutorConfig>;
  private progressCallbacks: Map<string, ProgressCallback[]> = new Map();

  constructor(
    taskRepo: ITaskRepository,
    config: Partial<ExecutorConfig> = {}
  ) {
    this.taskRepo = taskRepo;
    this.config = {
      databaseType: config.databaseType || 'sqlite',
      timeout: config.timeout || 60000,         // 默认单步超时60秒
      totalTimeout: config.totalTimeout || 300000,  // 默认总超时5分钟
      maxRetries: config.maxRetries || 3,
      enableLogging: config.enableLogging ?? true,
      logLevel: config.logLevel || 'info',
    };

    // 注册工作流（如果尚未注册）
    if (!WorkflowRegistry.has('content-creator')) {
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);
    }
    if (!WorkflowRegistry.has('translation')) {
      WorkflowRegistry.register(translationWorkflowFactory);
    }

    logger.info('SyncExecutor initialized', {
      databaseType: this.config.databaseType,
      timeout: this.config.timeout,
      totalTimeout: this.config.totalTimeout,
    });
  }

  /**
   * 设置结果仓储
   */
  setResultRepository(resultRepo: IResultRepository): void {
    this.resultRepo = resultRepo;
  }

  /**
   * 设置质量检查仓储
   */
  setQualityCheckRepository(qualityCheckRepo: IQualityCheckRepository): void {
    this.qualityCheckRepo = qualityCheckRepo;
  }

  /**
   * 创建并执行任务
   */
  async execute(params: CreateTaskParams): Promise<ExecutionResult> {
    const startTime = Date.now();
    // 使用幂等键作为taskId，或生成新的UUID
    const taskId = params.idempotencyKey || uuidv4();

    // 1. 确定工作流类型（默认为 content-creator）
    const workflowType = params.type || 'content-creator';

    logger.info('Starting task execution', {
      taskId,
      workflowType,
      topic: params.topic,
      mode: params.mode
    });

    try {
      // 2. 创建任务记录
      const task = await this.createTask(taskId, params);

      // 3. 从注册表获取工厂方法
      // 4. 使用工厂方法创建工作流状态
      const initialState = WorkflowRegistry.createState<WorkflowState>(workflowType, {
        taskId: task.taskId,
        mode: task.mode === 'sync' ? ExecutionMode.SYNC : ExecutionMode.ASYNC,
        topic: task.topic,
        requirements: task.requirements,
        targetAudience: task.targetAudience,
        keywords: task.keywords,
        tone: task.tone,
        hardConstraints: task.hardConstraints,
      });

      // 5. 更新任务状态为running
      const updated = await this.taskRepo.updateStatus(
        taskId,
        TaskStatus.RUNNING,
        task.version
      );

      if (!updated) {
        throw new Error('Failed to update task status to running');
      }

      // 6. 执行工作流
      const finalState = await this.executeWorkflow(taskId, initialState, workflowType);

      // 7. 保存结果
      await this.saveResults(taskId, finalState);

      // 8. 标记任务完成
      const currentTask = await this.taskRepo.findById(taskId);
      if (currentTask) {
        // 🆕 修复：使用当前版本，不要 +1，避免乐观锁冲突
        // 版本号在重试过程中可能已经更新过
        try {
          await this.taskRepo.markAsCompleted(taskId, currentTask.version);
        } catch (error) {
          // 如果版本冲突，尝试使用 version + 1
          if ((error as Error).message.includes('version')) {
            logger.warn('Version conflict on completion, retrying with version + 1', {
              taskId,
              currentVersion: currentTask.version,
            });
            await this.taskRepo.markAsCompleted(taskId, currentTask.version + 1);
          } else {
            throw error;
          }
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Task completed successfully', {
        taskId,
        workflowType,
        duration,
        stepsCompleted: (finalState as any).stepsCompleted || [],
      });

      return {
        taskId,
        status: 'completed',
        finalState,
        duration,
        metadata: {
          stepsCompleted: (finalState as any).stepsCompleted || [],
          tokensUsed: (finalState as any).totalTokens || 0,
          cost: (finalState as any).totalCost || 0,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('Task execution failed', {
        taskId,
        workflowType,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined
      });

      // 标记任务失败
      try {
        const task = await this.taskRepo.findById(taskId);
        if (task) {
          await this.taskRepo.markAsFailed(
            taskId,
            errorMessage,
            task.version
          );
        }
      } catch (repoError) {
        logger.error('Failed to mark task as failed', {
          taskId,
          error: repoError instanceof Error ? repoError.message : String(repoError)
        });
      }

      return {
        taskId,
        status: 'failed',
        finalState: {} as WorkflowState,
        duration,
        error: errorMessage,
        metadata: {
          stepsCompleted: [],
          tokensUsed: 0,
          cost: 0,
        },
      };
    }
  }

  /**
   * 创建任务
   */
  private async createTask(taskId: string, params: CreateTaskParams) {
    logger.debug('Creating task', { taskId });

    const task = await this.taskRepo.create({
      id: taskId,
      userId: params.userId,
      mode: params.mode,
      type: 'content-creator', // 添加默认类型
      topic: params.topic,
      requirements: params.requirements,
      hardConstraints: params.hardConstraints,
      idempotencyKey: params.idempotencyKey,
    });

    logger.debug('Task created', {
      taskId: task.taskId,
      status: task.status,
      version: task.version
    });

    return task;
  }

  /**
   * 执行工作流
   */
  private async executeWorkflow(
    taskId: string,
    initialState: BaseWorkflowState,
    workflowType: string
  ): Promise<WorkflowState> {
    logger.debug('Executing workflow', { taskId, workflowType });

    const startTime = Date.now();

    try {
      // 从注册表创建工作流图实例
      const graph = WorkflowRegistry.createGraph(workflowType);

      // 使用 invoke 方法执行完整工作流
      logger.info('Invoking workflow graph', { taskId, workflowType });
      const result = await graph.invoke(initialState);
      logger.info('Workflow invocation completed', {
        taskId,
        workflowType,
        finalStep: result.currentStep,
        hasContent: !!result.articleContent,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      logger.error('Workflow execution error', {
        taskId,
        workflowType,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 保存结果
   */
  private async saveResults(taskId: string, state: WorkflowState): Promise<void> {
    logger.info('Saving results', {
      taskId,
      hasArticle: !!state.articleContent,
      hasImage: !!state.images,
      hasResultRepo: !!this.resultRepo,
      hasQualityCheckRepo: !!this.qualityCheckRepo,
    });

    try {
      // 保存文章结果
      if (state.articleContent && this.resultRepo) {
        logger.debug('Saving article result', { taskId });
        await this.resultRepo.create({
          taskId,
          resultType: 'article',
          content: state.articleContent,
          metadata: {
            wordCount: state.articleContent.length,
            generatedAt: new Date().toISOString(),
          },
        });
        logger.info('Article result saved', { taskId });
      }

      // 保存图片结果 - 将所有图片合并到一条记录中
      if (state.images && state.images.length > 0 && this.resultRepo) {
        await this.resultRepo.create({
          taskId,
          resultType: 'image',
          content: JSON.stringify(state.images.map(img => ({
            url: img.localPath || img.url,  // 优先使用本地路径
            prompt: img.prompt,
            width: img.width,
            height: img.height,
          }))),
          metadata: {
            count: state.images.length,
            generatedAt: new Date().toISOString(),
          },
        });
        logger.info('Image results saved', { taskId, count: state.images.length });
      }

      // 保存最终文章内容（图片占位符已替换）
      if (state.finalArticleContent && this.resultRepo) {
        logger.info('Saving final article content', {
          taskId,
          hasPlaceholders: state.finalArticleContent.includes('image-placeholder-'),
          length: state.finalArticleContent.length,
        });
        await this.resultRepo.create({
          taskId,
          resultType: 'finalArticle',
          content: state.finalArticleContent,
          metadata: {
            wordCount: state.finalArticleContent.length,
            generatedAt: new Date().toISOString(),
            hasImages: state.images && state.images.length > 0,
            imageCount: state.images?.length || 0,
          },
        });
        logger.info('Final article result saved', { taskId });
      }

      // 保存质量检查结果
      if (state.textQualityReport && this.qualityCheckRepo) {
        await this.qualityCheckRepo.create({
          taskId,
          checkType: 'text',
          score: state.textQualityReport.score || 0,
          passed: state.textQualityReport.passed,
          hardConstraintsPassed: state.textQualityReport.hardConstraintsPassed || false,
          details: state.textQualityReport.details || {},
          fixSuggestions: state.textQualityReport.fixSuggestions || [],
          rubricVersion: '1.0',
          modelName: state.textQualityReport.modelName,
        });
        logger.info('Text quality check saved', {
          taskId,
          score: state.textQualityReport.score,
          passed: state.textQualityReport.passed,
        });
      }

      // 保存图片质量检查结果
      if (state.imageQualityReport && this.qualityCheckRepo) {
        await this.qualityCheckRepo.create({
          taskId,
          checkType: 'image',
          score: state.imageQualityReport.score || 0,
          passed: state.imageQualityReport.passed,
          hardConstraintsPassed: state.imageQualityReport.hardConstraintsPassed || false,
          details: state.imageQualityReport.details || {},
          fixSuggestions: state.imageQualityReport.fixSuggestions || [],
          rubricVersion: '1.0',
          modelName: state.imageQualityReport.modelName,
        });
        logger.info('Image quality check saved', {
          taskId,
          score: state.imageQualityReport.score,
          passed: state.imageQualityReport.passed,
        });
      }

      logger.info('All results saved successfully', { taskId });
    } catch (error) {
      logger.error('Failed to save results', error as Error);
      // 不抛出错误，避免影响主流程
      // 结果已经返回给用户，数据库保存失败不应该阻断
    }
  }

  /**
   * 注册进度回调
   */
  onProgress(taskId: string, callback: ProgressCallback): void {
    if (!this.progressCallbacks.has(taskId)) {
      this.progressCallbacks.set(taskId, []);
    }
    this.progressCallbacks.get(taskId)!.push(callback);

    logger.debug('Progress callback registered', { taskId });
  }

  /**
   * 移除进度回调
   */
  removeProgressCallback(taskId: string, callback: ProgressCallback): void {
    const callbacks = this.progressCallbacks.get(taskId);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
        logger.debug('Progress callback removed', { taskId });
      }
    }
  }

  /**
   * 计算进度百分比
   */
  private calculateProgress(currentStep: string): number {
    const steps = ['search', 'organize', 'write', 'check_text', 'generate_image', 'check_image'];
    const index = steps.indexOf(currentStep);
    return index >= 0 ? Math.round((index + 1) / steps.length * 100) : 0;
  }

  /**
   * 取消任务执行
   */
  async cancel(taskId: string): Promise<boolean> {
    logger.info('Cancelling task', { taskId });

    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      logger.warn('Task not found', { taskId });
      return false;
    }

    if (task.status !== TaskStatus.RUNNING) {
      logger.warn('Task is not running', { taskId, status: task.status });
      return false;
    }

    await this.taskRepo.updateStatus(taskId, TaskStatus.CANCELLED, task.version);

    // 清理进度回调
    this.progressCallbacks.delete(taskId);

    logger.info('Task cancelled', { taskId });
    return true;
  }

  /**
   * 获取任务状态
   */
  async getStatus(taskId: string): Promise<{
    status: TaskStatus;
    currentStep?: string;
    progress: number;
  } | null> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) {
      return null;
    }

    return {
      status: task.status,
      currentStep: task.currentStep || undefined,
      progress: this.calculateProgress(task.currentStep || ''),
    };
  }
}

/**
 * 创建同步执行器工厂函数
 */
export function createSyncExecutor(
  taskRepo: ITaskRepository,
  config?: Partial<ExecutorConfig>
): SyncExecutor {
  return new SyncExecutor(taskRepo, config);
}
