/**
 * CheckpointManager - 检查点管理器
 *
 * 负责工作流状态的保存和恢复：
 * - 每个 Node 执行完成后保存 State 到数据库
 * - 崩溃后从数据库恢复 State
 * - 支持断点续传
 */

import type { WorkflowState } from './State.js';
import { StateSnapshotManager } from './State.js';
import { PostgresTaskRepository } from '../../infrastructure/database/PostgresTaskRepository.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('CheckpointManager');

/**
 * 检查点信息
 */
export interface Checkpoint {
  taskId: string;
  stepName: string;
  state: Partial<WorkflowState>;
  timestamp: Date;
}

/**
 * 检查点管理器
 */
export class CheckpointManager {
  private taskRepo: PostgresTaskRepository;
  private checkpoints: Map<string, Checkpoint> = new Map();

  constructor(taskRepo?: PostgresTaskRepository) {
    this.taskRepo = taskRepo || new PostgresTaskRepository();
  }

  /**
   * 保存检查点
   *
   * @param taskId - 任务 ID
   * @param stepName - 步骤名称
   * @param state - 当前工作流状态
   */
  async saveCheckpoint(
    taskId: string,
    stepName: string,
    state: WorkflowState
  ): Promise<void> {
    try {
      logger.debug('Saving checkpoint', {
        taskId,
        stepName,
      });

      // 创建检查点快照（只保存必要字段）
      const snapshot = StateSnapshotManager.createCheckpoint(state);

      // 保存到数据库（使用 State 快照）
      await this.taskRepo.saveStateSnapshot(
        taskId,
        snapshot,
        state.version
      );

      // 同时保存到内存（快速访问）
      this.checkpoints.set(taskId, {
        taskId,
        stepName,
        state: snapshot,
        timestamp: new Date(),
      });

      logger.info('Checkpoint saved', {
        taskId,
        stepName,
        keys: Object.keys(snapshot),
      });
    } catch (error) {
      logger.error('Failed to save checkpoint', {
        taskId,
        stepName,
        error: error instanceof Error ? error.message : String(error),
      });
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 加载检查点
   *
   * @param taskId - 任务 ID
   * @returns 检查点快照，如果不存在则返回 null
   */
  async loadCheckpoint(taskId: string): Promise<Checkpoint | null> {
    try {
      logger.debug('Loading checkpoint', { taskId });

      // 先从内存查找
      const memoryCheckpoint = this.checkpoints.get(taskId);
      if (memoryCheckpoint) {
        logger.info('Checkpoint loaded from memory', {
          taskId,
          stepName: memoryCheckpoint.stepName,
        });
        return memoryCheckpoint;
      }

      // 从数据库加载
      const task = await this.taskRepo.findById(taskId);
      if (!task || !task.stateSnapshot) {
        logger.warn('No checkpoint found', { taskId });
        return null;
      }

      // 创建检查点
      const checkpoint: Checkpoint = {
        taskId,
        stepName: task.currentStep || 'unknown',
        state: task.stateSnapshot,
        timestamp: task.updatedAt,
      };

      // 保存到内存
      this.checkpoints.set(taskId, checkpoint);

      logger.info('Checkpoint loaded from database', {
        taskId,
        stepName: checkpoint.stepName,
      });

      return checkpoint;
    } catch (error) {
      logger.error('Failed to load checkpoint', {
        taskId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * 删除检查点
   *
   * @param taskId - 任务 ID
   */
  async removeCheckpoint(taskId: string): Promise<void> {
    logger.debug('Removing checkpoint', { taskId });

    // 从内存删除
    this.checkpoints.delete(taskId);

    // 数据库中的 State 会在任务完成时自动清理
  }

  /**
   * 清理所有检查点（内存）
   */
  clearAll(): void {
    logger.info('Clearing all checkpoints from memory', {
      count: this.checkpoints.size,
    });

    this.checkpoints.clear();
  }

  /**
   * 获取所有检查点信息
   *
   * @returns 所有检查点的列表
   */
  getAllCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values());
  }

  /**
   * 检查是否有检查点
   *
   * @param taskId - 任务 ID
   * @returns 是否存在检查点
   */
  hasCheckpoint(taskId: string): boolean {
    return this.checkpoints.has(taskId);
  }

  /**
   * 从检查点恢复状态
   *
   * @param taskId - 任务 ID
   * @param initialState - 初始状态（如果无检查点）
   * @returns 恢复后的状态
   */
  async restoreState(
    taskId: string,
    initialState: WorkflowState
  ): Promise<WorkflowState> {
    logger.debug('Restoring state from checkpoint', { taskId });

    const checkpoint = await this.loadCheckpoint(taskId);

    if (!checkpoint) {
      logger.info('No checkpoint found, using initial state', { taskId });
      return initialState;
    }

    // 合并初始状态和检查点状态
    const restoredState: WorkflowState = {
      ...initialState,
      ...checkpoint.state,
      // 确保关键字段不被覆盖
      taskId: initialState.taskId,
      mode: initialState.mode,
      topic: initialState.topic,
      requirements: initialState.requirements,
      hardConstraints: initialState.hardConstraints,
    };

    logger.info('State restored from checkpoint', {
      taskId,
      stepName: checkpoint.stepName,
      currentStep: restoredState.currentStep,
    });

    return restoredState;
  }

  /**
   * 验证检查点完整性
   *
   * @param checkpoint - 检查点
   * @returns 是否有效
   */
  validateCheckpoint(checkpoint: Checkpoint): boolean {
    if (!checkpoint.taskId) {
      logger.warn('Invalid checkpoint: missing taskId');
      return false;
    }

    if (!checkpoint.stepName) {
      logger.warn('Invalid checkpoint: missing stepName', {
        taskId: checkpoint.taskId,
      });
      return false;
    }

    if (!checkpoint.state || Object.keys(checkpoint.state).length === 0) {
      logger.warn('Invalid checkpoint: empty state', {
        taskId: checkpoint.taskId,
      });
      return false;
    }

    return true;
  }

  /**
   * 获取检查点统计信息
   *
   * @returns 统计信息
   */
  getStats(): {
    totalCount: number;
    checkpointsByStep: Record<string, number>;
  } {
    const checkpoints = this.getAllCheckpoints();
    const checkpointsByStep: Record<string, number> = {};

    for (const checkpoint of checkpoints) {
      checkpointsByStep[checkpoint.stepName] =
        (checkpointsByStep[checkpoint.stepName] || 0) + 1;
    }

    return {
      totalCount: checkpoints.length,
      checkpointsByStep,
    };
  }
}

/**
 * 检查点管理器单例
 */
export const checkpointManager = new CheckpointManager();
