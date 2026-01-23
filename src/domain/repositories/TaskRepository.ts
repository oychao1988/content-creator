/**
 * TaskRepository 接口
 *
 * 定义任务数据访问层的契约
 */

import type { Task } from '../entities/Task.js';
import { TaskStatus, ExecutionMode } from '../entities/Task.js';

/**
 * 创建任务输入参数
 */
export interface CreateTaskInput {
  userId?: string;
  mode: ExecutionMode;
  topic: string;
  requirements: string;
  hardConstraints?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
  };
  idempotencyKey?: string;
}

/**
 * 查询任务列表的过滤器
 */
export interface TaskFilter {
  userId?: string;
  status?: TaskStatus;
  mode?: ExecutionMode;
  startDate?: Date;
  endDate?: Date;
}

/**
 * 分页参数
 */
export interface Pagination {
  limit?: number;
  offset?: number;
}

/**
 * TaskRepository 接口
 */
export interface ITaskRepository {
  /**
   * 创建任务
   *
   * @param input - 创建任务输入参数
   * @returns 创建的任务
   */
  create(input: CreateTaskInput): Promise<Task>;

  /**
   * 根据 taskId 查询任务
   *
   * @param taskId - 任务 ID
   * @returns 任务或 null
   */
  findById(taskId: string): Promise<Task | null>;

  /**
   * 根据 idempotencyKey 查询任务
   *
   * @param idempotencyKey - 幂等键
   * @returns 任务或 null
   */
  findByIdempotencyKey(idempotencyKey: string): Promise<Task | null>;

  /**
   * 根据 userId 查询任务列表
   *
   * @param userId - 用户 ID
   * @param pagination - 分页参数
   * @returns 任务列表
   */
  findByUserId(userId: string, pagination?: Pagination): Promise<Task[]>;

  /**
   * 查询任务列表（支持过滤和分页）
   *
   * @param filter - 过滤条件
   * @param pagination - 分页参数
   * @returns 任务列表
   */
  findMany(filter?: TaskFilter, pagination?: Pagination): Promise<Task[]>;

  /**
   * 统计任务数量
   *
   * @param filter - 过滤条件
   * @returns 任务数量
   */
  count(filter?: TaskFilter): Promise<number>;

  /**
   * 更新任务状态（带乐观锁）
   *
   * @param taskId - 任务 ID
   * @param status - 新状态
   * @param version - 当前版本号
   * @returns 是否更新成功
   */
  updateStatus(taskId: string, status: TaskStatus, version: number): Promise<boolean>;

  /**
   * 更新当前步骤（带乐观锁）
   *
   * @param taskId - 任务 ID
   * @param step - 当前步骤名称
   * @param version - 当前版本号
   * @returns 是否更新成功
   */
  updateCurrentStep(taskId: string, step: string, version: number): Promise<boolean>;

  /**
   * Worker 抢占任务（乐观锁）
   *
   * 只有状态为 pending 且版本号匹配的任务才能被抢占
   *
   * @param taskId - 任务 ID
   * @param workerId - Worker ID
   * @param version - 当前版本号
   * @returns 是否抢占成功
   */
  claimTask(taskId: string, workerId: string, version: number): Promise<boolean>;

  /**
   * 增加重试计数（带乐观锁）
   *
   * @param taskId - 任务 ID
   * @param type - 重试类型（text/image）
   * @param version - 当前版本号
   * @returns 是否更新成功
   */
  incrementRetryCount(
    taskId: string,
    type: 'text' | 'image',
    version: number
  ): Promise<boolean>;

  /**
   * 保存 State 快照（带乐观锁）
   *
   * @param taskId - 任务 ID
   * @param snapshot - State 快照对象
   * @param version - 当前版本号
   * @returns 是否更新成功
   */
  saveStateSnapshot(taskId: string, snapshot: object, version: number): Promise<boolean>;

  /**
   * 标记任务完成（带乐观锁）
   *
   * @param taskId - 任务 ID
   * @param version - 当前版本号
   * @returns 是否更新成功
   */
  markAsCompleted(taskId: string, version: number): Promise<boolean>;

  /**
   * 标记任务失败（带乐观锁）
   *
   * @param taskId - 任务 ID
   * @param errorMessage - 错误信息
   * @param version - 当前版本号
   * @returns 是否更新成功
   */
  markAsFailed(taskId: string, errorMessage: string, version: number): Promise<boolean>;

  /**
   * 释放 Worker 占用（用于任务崩溃时）
   *
   * @param taskId - 任务 ID
   * @param workerId - Worker ID（用于验证）
   * @param version - 当前版本号
   * @returns 是否释放成功
   */
  releaseWorker(taskId: string, workerId: string, version: number): Promise<boolean>;

  /**
   * 软删除任务
   *
   * @param taskId - 任务 ID
   * @returns 是否删除成功
   */
  softDelete(taskId: string): Promise<boolean>;

  /**
   * 永久删除任务
   *
   * @param taskId - 任务 ID
   * @returns 是否删除成功
   */
  delete(taskId: string): Promise<boolean>;

  /**
   * 获取待处理任务队列（用于 Worker 获取任务）
   *
   * @param limit - 获取数量限制
   * @returns 待处理任务列表
   */
  getPendingTasks(limit?: number): Promise<Task[]>;

  /**
   * 获取 Worker 的活跃任务
   *
   * @param workerId - Worker ID
   * @returns 活跃任务列表
   */
  getActiveTasksByWorker(workerId: string): Promise<Task[]>;
}
