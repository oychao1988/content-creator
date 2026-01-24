/**
 * PostgresTaskRepository - 任务数据访问实现
 *
 * 使用 PostgreSQL 实现任务数据持久化
 * 支持乐观锁并发控制和 Worker 抢占机制
 */

import { BaseRepository } from './BaseRepository.js';
import type { ITaskRepository, CreateTaskInput, TaskFilter, Pagination } from '../../domain/repositories/TaskRepository.js';
import type { Task } from '../../domain/entities/Task.js';
import { TaskStatus, ExecutionMode } from '../../domain/entities/Task.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * PostgreSQL 任务仓储实现
 */
export class PostgresTaskRepository extends BaseRepository implements ITaskRepository {

  /**
   * 创建任务
   */
  async create(input: CreateTaskInput): Promise<Task> {
    // 使用幂等键作为 taskId，或者生成新的 UUID
    const taskId = input.idempotencyKey || uuidv4();

    const query = `
      INSERT INTO tasks (
        task_id, user_id, mode, topic, requirements,
        hard_constraints, idempotency_key
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (task_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        mode = EXCLUDED.mode,
        topic = EXCLUDED.topic,
        requirements = EXCLUDED.requirements,
        hard_constraints = EXCLUDED.hard_constraints,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      taskId,
      input.userId || null,
      input.mode,
      input.topic,
      input.requirements,
      JSON.stringify(input.hardConstraints || {}),
      input.idempotencyKey || null,
    ];

    const result = await this.query<any>(query, values);
    return this.mapToTask(result.rows[0]);
  }

  /**
   * 根据 taskId 查询任务
   */
  async findById(taskId: string): Promise<Task | null> {
    const query = 'SELECT * FROM tasks WHERE task_id = $1 AND deleted_at IS NULL';
    const result = await this.query<any>(query, [taskId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToTask(result.rows[0]);
  }

  /**
   * 根据 idempotencyKey 查询任务
   */
  async findByIdempotencyKey(idempotencyKey: string): Promise<Task | null> {
    const query = 'SELECT * FROM tasks WHERE idempotency_key = $1 AND deleted_at IS NULL';
    const result = await this.query<any>(query, [idempotencyKey]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToTask(result.rows[0]);
  }

  /**
   * 根据 userId 查询任务列表
   */
  async findByUserId(userId: string, pagination: Pagination = {}): Promise<Task[]> {
    const { limit = 10, offset = 0 } = pagination;

    const query = `
      SELECT * FROM tasks
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await this.query<any>(query, [userId, limit, offset]);
    return result.rows.map(row => this.mapToTask(row));
  }

  /**
   * 查询任务列表（支持过滤和分页）
   */
  async findMany(filter: TaskFilter = {}, pagination: Pagination = {}): Promise<Task[]> {
    const { limit = 10, offset = 0 } = pagination;
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filter.userId);
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }

    if (filter.mode) {
      conditions.push(`mode = $${paramIndex++}`);
      params.push(filter.mode);
    }

    if (filter.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filter.endDate);
    }

    const whereClause = conditions.join(' AND ');
    const query = `
      SELECT * FROM tasks
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const result = await this.query<any>(query, params);
    return result.rows.map(row => this.mapToTask(row));
  }

  /**
   * 统计任务数量
   */
  // @ts-ignore - Method signature differs from base class
  async count(filter: TaskFilter = {}): Promise<number> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(filter.userId);
    }

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(filter.status);
    }

    if (filter.mode) {
      conditions.push(`mode = $${paramIndex++}`);
      params.push(filter.mode);
    }

    const whereClause = conditions.join(' AND ');
    const query = `SELECT COUNT(*) as count FROM tasks WHERE ${whereClause}`;

    const result = await this.query<{ count: string }>(query, params);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * 更新任务状态（带乐观锁）
   */
  async updateStatus(taskId: string, status: TaskStatus, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET status = $1,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $2 AND version = $3 AND deleted_at IS NULL
      RETURNING version
    `;

    const result = await this.query(query, [status, taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 更新当前步骤（带乐观锁）
   */
  async updateCurrentStep(taskId: string, step: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET current_step = $1,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $2 AND version = $3 AND deleted_at IS NULL
      RETURNING version
    `;

    const result = await this.query(query, [step, taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * Worker 抢占任务（乐观锁）
   *
   * 只有状态为 pending 且版本号匹配的任务才能被抢占
   */
  async claimTask(taskId: string, workerId: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET worker_id = $1,
          status = 'running',
          started_at = CURRENT_TIMESTAMP,
          current_step = 'claimed',
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $2
        AND version = $3
        AND status = 'pending'
        AND deleted_at IS NULL
      RETURNING version
    `;

    const result = await this.query(query, [workerId, taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 增加重试计数（带乐观锁）
   */
  async incrementRetryCount(
    taskId: string,
    type: 'text' | 'image',
    version: number
  ): Promise<boolean> {
    const column = type === 'text' ? 'text_retry_count' : 'image_retry_count';

    const query = `
      UPDATE tasks
      SET ${column} = ${column} + 1,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $1 AND version = $2 AND deleted_at IS NULL
      RETURNING version
    `;

    const result = await this.query(query, [taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 保存 State 快照（带乐观锁）
   */
  async saveStateSnapshot(taskId: string, snapshot: object, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET state_snapshot = $1,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $2 AND version = $3 AND deleted_at IS NULL
      RETURNING version
    `;

    const result = await this.query(query, [JSON.stringify(snapshot), taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 标记任务完成（带乐观锁）
   */
  async markAsCompleted(taskId: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET status = 'completed',
          completed_at = CURRENT_TIMESTAMP,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $1 AND version = $2 AND deleted_at IS NULL
      RETURNING version
    `;

    const result = await this.query(query, [taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 标记任务失败（带乐观锁）
   */
  async markAsFailed(taskId: string, errorMessage: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET status = 'failed',
          error_message = $1,
          completed_at = CURRENT_TIMESTAMP,
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $2 AND version = $3 AND deleted_at IS NULL
      RETURNING version
    `;

    const result = await this.query(query, [errorMessage, taskId, version]);
    return result.rowCount === 1;
  }

  /**
   * 释放 Worker 占用（用于任务崩溃时）
   */
  async releaseWorker(taskId: string, workerId: string, version: number): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET worker_id = NULL,
          status = 'pending',
          version = version + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $1
        AND worker_id = $2
        AND version = $3
        AND deleted_at IS NULL
      RETURNING version
    `;

    const result = await this.query(query, [taskId, workerId, version]);
    return result.rowCount === 1;
  }

  /**
   * 软删除任务
   */
  async softDelete(taskId: string): Promise<boolean> {
    const query = `
      UPDATE tasks
      SET deleted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE task_id = $1 AND deleted_at IS NULL
      RETURNING task_id
    `;

    const result = await this.query(query, [taskId]);
    return result.rowCount === 1;
  }

  /**
   * 永久删除任务
   */
  async delete(taskId: string): Promise<boolean> {
    const query = 'DELETE FROM tasks WHERE task_id = $1 RETURNING task_id';
    const result = await this.query(query, [taskId]);
    return result.rowCount === 1;
  }

  /**
   * 获取待处理任务队列（用于 Worker 获取任务）
   */
  async getPendingTasks(limit: number = 10): Promise<Task[]> {
    const query = `
      SELECT * FROM tasks
      WHERE status = 'pending' AND deleted_at IS NULL
      ORDER BY priority DESC, created_at ASC
      LIMIT $1
    `;

    const result = await this.query<any>(query, [limit]);
    return result.rows.map(row => this.mapToTask(row));
  }

  /**
   * 获取 Worker 的活跃任务
   */
  async getActiveTasksByWorker(workerId: string): Promise<Task[]> {
    const query = `
      SELECT * FROM tasks
      WHERE worker_id = $1
        AND status = 'running'
        AND deleted_at IS NULL
      ORDER BY started_at DESC
    `;

    const result = await this.query<any>(query, [workerId]);
    return result.rows.map(row => this.mapToTask(row));
  }

  /**
   * 映射数据库行到 Task 实体
   */
  private mapToTask(row: any): Task {
    return {
      taskId: row.task_id,
      id: row.task_id, // 别名
      userId: row.user_id || undefined,
      mode: row.mode as ExecutionMode,
      topic: row.topic,
      requirements: row.requirements,
      targetAudience: '', // 默认值，向后兼容
      hardConstraints: row.hard_constraints || {},
      status: row.status as TaskStatus,
      currentStep: row.current_step || undefined,
      workerId: row.worker_id || undefined,
      assignedWorkerId: row.worker_id || undefined, // 别名
      textRetryCount: row.text_retry_count || 0,
      imageRetryCount: row.image_retry_count || 0,
      version: row.version,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      updatedAt: new Date(row.updated_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      claimedAt: row.started_at ? new Date(row.started_at) : undefined, // 别名
      errorMessage: row.error_message || undefined,
      stateSnapshot: row.state_snapshot || undefined,
      idempotencyKey: row.idempotency_key || undefined,
      priority: 2, // 默认 NORMAL
    };
  }
}
