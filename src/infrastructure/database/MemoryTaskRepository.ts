/**
 * Memory Task Repository
 *
 * 内存版本的 Task Repository，用于测试和开发
 * 数据不持久化，适合快速测试工作流
 */

import { createLogger } from '../../infrastructure/logging/logger.js';
import type {
  Task,
  TaskCreateParams,
  TaskUpdateParams,
  TaskListFilters,
  PaginatedResult,
} from '../../domain/repositories/TaskRepository.js';
import { TaskStatus } from '../../domain/entities/Task.js';

const logger = createLogger('Memory:TaskRepository');

/**
 * 内存 Task Repository 实现
 */
export class MemoryTaskRepository {
  private tasks: Map<string, Task> = new Map();
  private snapshots: Map<string, any> = new Map();

  constructor() {
    logger.info('Memory repository initialized (no persistence)');
  }

  /**
   * 创建任务
   */
  async create(params: TaskCreateParams): Promise<Task> {
    const now = new Date();

    const task: Task = {
      id: params.id,
      taskId: params.id,
      mode: params.mode as any,
      type: params.type as any,
      topic: params.topic,
      requirements: params.requirements,
      hardConstraints: params.hardConstraints,
      status: TaskStatus.PENDING,
      priority: 2, // NORMAL
      version: 1,
      textRetryCount: 0,
      imageRetryCount: 0,
      targetAudience: 'general',
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);

    logger.info('Task created (memory)', { taskId: task.id, topic: task.topic });
    return task;
  }

  /**
   * 根据 ID 查找任务
   */
  async findById(id: string): Promise<Task | null> {
    const task = this.tasks.get(id);
    return task || null;
  }

  /**
   * 更新任务
   */
  async update(id: string, params: TaskUpdateParams): Promise<Task> {
    const task = this.tasks.get(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      ...(params.status !== undefined && { status: params.status as any }),
      ...(params.currentStep !== undefined && { currentStep: params.currentStep }),
      ...(params.errorMessage !== undefined && { errorMessage: params.errorMessage }),
      ...(params.workerId !== undefined && { workerId: params.workerId }),
      ...(params.startedAt !== undefined && { startedAt: params.startedAt ? new Date(params.startedAt) : undefined }),
      ...(params.completedAt !== undefined && { completedAt: params.completedAt ? new Date(params.completedAt) : undefined }),
      ...(params.version !== undefined && { version: params.version }),
      updatedAt: now,
    };

    this.tasks.set(id, updatedTask);

    logger.debug('Task updated (memory)', { taskId: id, updates: Object.keys(params) });
    return updatedTask;
  }

  /**
   * 更新任务状态（带乐观锁）
   */
  async updateStatus(taskId: string, status: TaskStatus, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // 检查版本号（乐观锁）
    if (task.version !== version) {
      logger.warn('Task version mismatch for updateStatus', { taskId, expectedVersion: version, actualVersion: task.version });
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      status,
      version: version + 1,
      updatedAt: now,
      ...(status === TaskStatus.RUNNING && { startedAt: now }),
      ...(status === TaskStatus.COMPLETED && { completedAt: now }),
      ...(status === TaskStatus.FAILED && { completedAt: now }),
      ...(status === TaskStatus.CANCELLED && { completedAt: now }),
    };

    this.tasks.set(taskId, updatedTask);
    logger.debug('Task status updated (memory)', { taskId, status, newVersion: updatedTask.version });
    return true;
  }

  /**
   * 抢占任务（Worker 抢占机制）- 按任务ID抢占
   */
  async claimTask(taskId: string, workerId: string, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // 检查版本号（乐观锁）
    if (task.version !== version || task.status !== TaskStatus.PENDING) {
      logger.warn('Task claim failed (version mismatch or not pending)', {
        taskId,
        expectedVersion: version,
        actualVersion: task.version,
        status: task.status
      });
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      status: TaskStatus.RUNNING,
      workerId,
      startedAt: now,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    logger.info('Task claimed (memory)', { taskId, workerId });
    return true;
  }

  /**
   * 抢占任务（Worker 抢占机制）- 批量抢占
   */
  async claimForProcessing(workerId: string, limit: number = 1): Promise<Task[]> {
    const now = new Date();
    const claimedTasks: Task[] = [];

    // 找出待处理任务
    const pendingTasks = Array.from(this.tasks.values())
      .filter(
        (task) =>
          task.status === TaskStatus.PENDING ||
          (task.status === TaskStatus.WAITING &&
            new Date(task.updatedAt).getTime() < Date.now() - 5 * 60 * 1000)
      )
      .sort((a, b) => {
        // 按优先级降序，然后按创建时间升序
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      })
      .slice(0, limit);

    // 更新任务状态
    for (const task of pendingTasks) {
      const updatedTask = await this.update(task.id, {
        status: TaskStatus.RUNNING,
        workerId,
        startedAt: now.toISOString(),
      });
      claimedTasks.push(updatedTask);
    }

    if (claimedTasks.length > 0) {
      logger.info('Tasks claimed for processing (memory)', {
        workerId,
        count: claimedTasks.length,
        taskIds: claimedTasks.map((t) => t.id),
      });
    }

    return claimedTasks;
  }

  /**
   * 保存状态快照（用于崩溃恢复）
   */
  async saveStateSnapshot(taskId: string, step: string, state: any): Promise<void> {
    const key = `${taskId}_${step}`;
    this.snapshots.set(key, {
      taskId,
      step,
      state,
      savedAt: new Date(),
    });

    logger.debug('State snapshot saved (memory)', { taskId, step });
  }

  /**
   * 恢复状态快照
   */
  async loadStateSnapshot(taskId: string): Promise<any | null> {
    // 找到最新的快照
    const snapshots = Array.from(this.snapshots.values())
      .filter((s) => s.taskId === taskId)
      .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

    if (snapshots.length === 0) {
      return null;
    }

    return snapshots[0].state;
  }

  /**
   * 列出任务（带过滤和分页）
   */
  async list(filters: TaskListFilters = {}): Promise<PaginatedResult<Task>> {
    const {
      status,
      workerId,
      type,
      limit = 50,
      offset = 0,
      sortBy = 'createdAt',
      sortOrder = 'DESC',
    } = filters;

    let tasks = Array.from(this.tasks.values());

    // 应用过滤
    if (status) {
      tasks = tasks.filter((t) => t.status === status);
    }
    if (workerId) {
      tasks = tasks.filter((t) => t.workerId === workerId);
    }
    if (type) {
      tasks = tasks.filter((t) => t.type === type);
    }

    const total = tasks.length;

    // 排序
    tasks.sort((a, b) => {
      const aVal = (a as any)[sortBy];
      const bVal = (b as any)[sortBy];
      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'DESC' ? -comparison : comparison;
    });

    // 分页
    const data = tasks.slice(offset, offset + limit);

    return {
      data,
      total,
      limit,
      offset,
    };
  }

  /**
   * 删除任务
   */
  async delete(id: string): Promise<boolean> {
    const existed = this.tasks.has(id);
    this.tasks.delete(id);

    // 清理相关快照
    for (const [key, snapshot] of this.snapshots.entries()) {
      if (snapshot.taskId === id) {
        this.snapshots.delete(key);
      }
    }

    return existed;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return true; // 内存版本永远健康
  }

  /**
   * 更新当前步骤（带乐观锁）
   */
  async updateCurrentStep(taskId: string, step: string, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // 检查版本号（乐观锁）
    if (task.version !== version) {
      logger.warn('Task version mismatch for updateCurrentStep', { taskId, expectedVersion: version, actualVersion: task.version });
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      currentStep: step,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    logger.debug('Task currentStep updated (memory)', { taskId, step });
    return true;
  }

  /**
   * 标记任务完成（带乐观锁）
   */
  async markAsCompleted(taskId: string, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // 检查版本号（乐观锁）
    if (task.version !== version) {
      logger.warn('Task version mismatch for markAsCompleted', { taskId, expectedVersion: version, actualVersion: task.version });
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      status: TaskStatus.COMPLETED,
      completedAt: now,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    logger.info('Task marked as completed (memory)', { taskId });
    return true;
  }

  /**
   * 标记任务失败（带乐观锁）
   */
  async markAsFailed(taskId: string, errorMessage: string, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    // 检查版本号（乐观锁）
    if (task.version !== version) {
      logger.warn('Task version mismatch for markAsFailed', { taskId, expectedVersion: version, actualVersion: task.version });
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      status: TaskStatus.FAILED,
      errorMessage,
      completedAt: now,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    logger.info('Task marked as failed (memory)', { taskId, errorMessage });
    return true;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      totalTasks: this.tasks.size,
      snapshots: this.snapshots.size,
      byStatus: Array.from(this.tasks.values()).reduce((acc, task) => {
        acc[task.status] = (acc[task.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    };
  }
}
