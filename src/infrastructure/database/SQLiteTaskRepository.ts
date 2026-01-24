/**
 * SQLite Task Repository
 *
 * 使用 better-sqlite3 实现的轻量级数据库访问层
 * 适合开发和测试环境
 */

import Database from 'better-sqlite3';
import { createLogger } from '../../infrastructure/logging/logger.js';
import type {
  Task,
  TaskCreateParams,
  TaskUpdateParams,
  TaskListFilters,
  PaginatedResult,
} from '../../domain/repositories/TaskRepository.js';
import { TaskStatus } from '../../domain/entities/Task.js';

const logger = createLogger('SQLite:TaskRepository');

/**
 * SQLite Task Repository 实现
 */
export class SQLiteTaskRepository {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || './data/content-creator.db';
    this.db = new Database(this.dbPath);

    // 启用 WAL 模式（更好的并发性能）
    this.db.pragma('journal_mode = WAL');

    // 初始化数据库表
    this.initializeTables();

    logger.info('SQLite database connected', { dbPath: this.dbPath });
  }

  /**
   * 初始化数据库表
   */
  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        trace_id TEXT,
        mode TEXT NOT NULL,
        type TEXT NOT NULL,
        topic TEXT NOT NULL,
        requirements TEXT NOT NULL,
        hard_constraints TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        current_step TEXT,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        priority INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        worker_id TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS task_steps (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        step_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        input_data TEXT,
        output_data TEXT,
        error_message TEXT,
        started_at TEXT,
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS quality_checks (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        check_type TEXT NOT NULL,
        score REAL,
        passed BOOLEAN NOT NULL DEFAULT 0,
        hard_constraints_passed BOOLEAN NOT NULL DEFAULT 0,
        details TEXT,
        fix_suggestions TEXT,
        rubric_version TEXT,
        model_name TEXT,
        prompt_hash TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS results (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        result_type TEXT NOT NULL,
        content TEXT,
        file_path TEXT,
        metadata TEXT,
        quality_score REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_worker_id ON tasks(worker_id);
      CREATE INDEX IF NOT EXISTS idx_task_steps_task_id ON task_steps(task_id);
      CREATE INDEX IF NOT EXISTS idx_quality_checks_task_id ON quality_checks(task_id);
      CREATE INDEX IF NOT EXISTS idx_results_task_id ON results(task_id);
    `);

    logger.debug('Database tables initialized');
  }

  /**
   * 创建任务
   */
  async create(params: TaskCreateParams): Promise<Task> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, trace_id, mode, type, topic, requirements,
        hard_constraints, status, priority, version,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const hardConstraints = params.hardConstraints
      ? JSON.stringify(params.hardConstraints)
      : null;

    try {
      stmt.run(
        params.id,
        params.traceId || null,
        params.mode,
        params.type,
        params.topic,
        params.requirements,
        hardConstraints,
        TaskStatus.PENDING,
        params.priority || 0,
        1,
        now,
        now
      );

      const task = await this.findById(params.id);
      if (!task) {
        throw new Error('Failed to create task');
      }

      logger.info('Task created', { taskId: params.id, topic: params.topic });
      return task;
    } catch (error) {
      logger.error('Failed to create task', { error: error as any, params });
      throw error;
    }
  }

  /**
   * 根据 ID 查找任务
   */
  async findById(id: string): Promise<Task | null> {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    return this.mapRowToTask(row);
  }

  /**
   * 更新任务
   */
  async update(id: string, params: TaskUpdateParams): Promise<Task> {
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    if (params.status !== undefined) {
      updates.push('status = ?');
      values.push(params.status);
    }
    if (params.currentStep !== undefined) {
      updates.push('current_step = ?');
      values.push(params.currentStep);
    }
    if (params.errorMessage !== undefined) {
      updates.push('error_message = ?');
      values.push(params.errorMessage);
    }
    if (params.retryCount !== undefined) {
      updates.push('retry_count = ?');
      values.push(params.retryCount);
    }
    if (params.workerId !== undefined) {
      updates.push('worker_id = ?');
      values.push(params.workerId);
    }
    if (params.startedAt !== undefined) {
      updates.push('started_at = ?');
      values.push(params.startedAt);
    }
    if (params.completedAt !== undefined) {
      updates.push('completed_at = ?');
      values.push(params.completedAt);
    }
    if (params.version !== undefined) {
      updates.push('version = ?');
      values.push(params.version);
    }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const stmt = this.db.prepare(`
      UPDATE tasks SET ${updates.join(', ')} WHERE id = ?
    `);

    try {
      stmt.run(...values);
      const task = await this.findById(id);
      if (!task) {
        throw new Error('Task not found after update');
      }

      logger.debug('Task updated', { taskId: id, updates: Object.keys(params) });
      return task;
    } catch (error) {
      logger.error('Failed to update task', { error: error as any, taskId: id, params });
      throw error;
    }
  }

  /**
   * 抢占任务（Worker 抢占机制）
   */
  async claimForProcessing(
    workerId: string,
    limit: number = 1
  ): Promise<Task[]> {
    const now = new Date().toISOString();

    // 使用事务确保原子性
    const claimStmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?,
          worker_id = ?,
          started_at = ?,
          updated_at = ?,
          version = version + 1
      WHERE id IN (
        SELECT id FROM tasks
        WHERE status = 'pending'
          OR (status = 'waiting' AND datetime(updated_at) < datetime('now', '-5 minutes'))
        ORDER BY priority DESC, created_at ASC
        LIMIT ?
      )
      RETURNING *
    `);

    try {
      const rows = claimStmt.all(
        TaskStatus.RUNNING,
        workerId,
        now,
        now,
        limit
      ) as any[];

      const tasks = rows.map((row) => this.mapRowToTask(row));

      if (tasks.length > 0) {
        logger.info('Tasks claimed for processing', {
          workerId,
          count: tasks.length,
          taskIds: tasks.map((t) => t.id),
        });
      }

      return tasks;
    } catch (error) {
      logger.error('Failed to claim tasks', { error: error as any, workerId });
      throw error;
    }
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
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = filters;

    const conditions: string[] = [];
    const values: any[] = [];

    if (status) {
      conditions.push('status = ?');
      values.push(status);
    }
    if (workerId) {
      conditions.push('worker_id = ?');
      values.push(workerId);
    }
    if (type) {
      conditions.push('type = ?');
      values.push(type);
    }

    const whereClause = conditions.length > 0
      ? 'WHERE ' + conditions.join(' AND ')
      : '';

    // 获取总数
    const countStmt = this.db.prepare(
      `SELECT COUNT(*) as count FROM tasks ${whereClause}`
    );
    const countResult = countStmt.get(...values) as { count: number };
    const total = countResult.count;

    // 获取分页数据
    const dataStmt = this.db.prepare(`
      SELECT * FROM tasks
      ${whereClause}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ? OFFSET ?
    `);

    const rows = dataStmt.all(...values, limit, offset) as any[];
    const tasks = rows.map((row) => this.mapRowToTask(row));

    return {
      data: tasks,
      total,
      limit,
      offset,
    };
  }

  /**
   * 更新任务状态（带乐观锁）
   */
  async updateStatus(taskId: string, status: TaskStatus, version: number): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = stmt.run(status, now, taskId, version);
    const updated = result.changes > 0;

    if (updated) {
      logger.debug('Task status updated', { taskId, status });
    } else {
      logger.warn('Task status update failed (version mismatch)', { taskId, expectedVersion: version });
    }

    return updated;
  }

  /**
   * 更新当前步骤（带乐观锁）
   */
  async updateCurrentStep(taskId: string, step: string, version: number): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET current_step = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = stmt.run(step, now, taskId, version);
    const updated = result.changes > 0;

    if (updated) {
      logger.debug('Task current step updated', { taskId, step });
    } else {
      logger.warn('Task current step update failed (version mismatch)', { taskId, expectedVersion: version });
    }

    return updated;
  }

  /**
   * 抢占任务（Worker 抢占机制）
   */
  async claimTask(taskId: string, workerId: string, version: number): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?,
          worker_id = ?,
          started_at = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ? AND status = ?
    `);

    const result = stmt.run(TaskStatus.RUNNING, workerId, now, now, taskId, version, TaskStatus.PENDING);
    const claimed = result.changes > 0;

    if (claimed) {
      logger.info('Task claimed', { taskId, workerId });
    } else {
      logger.warn('Task claim failed (version mismatch or not pending)', { taskId, workerId, expectedVersion: version });
    }

    return claimed;
  }

  /**
   * 增加重试计数（带乐观锁）
   */
  async incrementRetryCount(taskId: string, type: 'text' | 'image', version: number): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET retry_count = retry_count + 1,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = stmt.run(now, taskId, version);
    const updated = result.changes > 0;

    if (updated) {
      logger.debug('Task retry count incremented', { taskId, type });
    } else {
      logger.warn('Task retry count increment failed (version mismatch)', { taskId, type, expectedVersion: version });
    }

    return updated;
  }

  /**
   * 保存状态快照（带乐观锁）
   */
  async saveStateSnapshot(taskId: string, snapshot: object, _version: number): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO task_steps (id, task_id, step_type, status, output_data, created_at, updated_at)
      VALUES (?, ?, ?, 'completed', ?, ?, ?)
    `);

    try {
      stmt.run(`${taskId}_${Date.now()}`, taskId, 'state', JSON.stringify(snapshot), now, now);
      logger.debug('State snapshot saved', { taskId });
      return true;
    } catch (error) {
      logger.error('Failed to save state snapshot', { error: error as any, taskId });
      return false;
    }
  }

  /**
   * 标记任务完成（带乐观锁）
   */
  async markAsCompleted(taskId: string, version: number): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?,
          completed_at = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = stmt.run(TaskStatus.COMPLETED, now, now, taskId, version);
    const updated = result.changes > 0;

    if (updated) {
      logger.info('Task marked as completed', { taskId });
    } else {
      logger.warn('Task mark as completed failed (version mismatch)', { taskId, expectedVersion: version });
    }

    return updated;
  }

  /**
   * 标记任务失败（带乐观锁）
   */
  async markAsFailed(taskId: string, errorMessage: string, version: number): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?,
          error_message = ?,
          completed_at = ?,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ?
    `);

    const result = stmt.run(TaskStatus.FAILED, errorMessage, now, now, taskId, version);
    const updated = result.changes > 0;

    if (updated) {
      logger.info('Task marked as failed', { taskId, errorMessage });
    } else {
      logger.warn('Task mark as failed failed (version mismatch)', { taskId, expectedVersion: version });
    }

    return updated;
  }

  /**
   * 释放 Worker 占用（用于任务崩溃时）
   */
  async releaseWorker(taskId: string, workerId: string, version: number): Promise<boolean> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?,
          worker_id = NULL,
          version = version + 1,
          updated_at = ?
      WHERE id = ? AND version = ? AND worker_id = ?
    `);

    const result = stmt.run(TaskStatus.PENDING, now, taskId, version, workerId);
    const released = result.changes > 0;

    if (released) {
      logger.info('Task worker released', { taskId, workerId });
    } else {
      logger.warn('Task worker release failed', { taskId, workerId, expectedVersion: version });
    }

    return released;
  }

  /**
   * 软删除任务
   */
  async softDelete(taskId: string): Promise<boolean> {
    // SQLite 不支持软删除，直接删除
    return this.delete(taskId);
  }

  /**
   * 永久删除任务
   */
  async delete(taskId: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(taskId);

    return result.changes > 0;
  }

  /**
   * 获取待处理任务队列（用于 Worker 获取任务）
   */
  async getPendingTasks(limit: number = 10): Promise<Task[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = ?
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `);

    const rows = stmt.all(TaskStatus.PENDING, limit) as any[];
    return rows.map((row) => this.mapRowToTask(row));
  }

  /**
   * 获取 Worker 的活跃任务
   */
  async getActiveTasksByWorker(workerId: string): Promise<Task[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM tasks
      WHERE status = ? AND worker_id = ?
    `);

    const rows = stmt.all(TaskStatus.RUNNING, workerId) as any[];
    return rows.map((row) => this.mapRowToTask(row));
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const stmt = this.db.prepare('SELECT 1');
      stmt.get();
      return true;
    } catch (error) {
      logger.error('Database health check failed', { error: error as any });
      return false;
    }
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    logger.info('SQLite database connection closed');
  }

  /**
   * 将数据库行映射为 Task 对象
   */
  private mapRowToTask(row: any): Task {
    return {
      id: row.id,
      taskId: row.id,
      mode: row.mode as any,
      type: row.type as any,
      topic: row.topic,
      requirements: row.requirements,
      hardConstraints: row.hard_constraints
        ? JSON.parse(row.hard_constraints)
        : undefined,
      status: row.status,
      priority: row.priority || 2,
      version: row.version || 1,
      textRetryCount: row.retry_count || 0,
      imageRetryCount: 0,
      targetAudience: 'general',
      currentStep: row.current_step,
      errorMessage: row.error_message,
      workerId: row.worker_id,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
