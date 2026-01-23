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
import { TaskStatus, TaskType } from '../../domain/entities/Task.js';

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
        check_category TEXT NOT NULL,
        score REAL,
        passed BOOLEAN NOT NULL DEFAULT 0,
        details TEXT,
        fix_suggestions TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS results (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        result_type TEXT NOT NULL,
        content TEXT,
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
      logger.error('Failed to create task', { error, params });
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
      logger.error('Failed to update task', { error, taskId: id, params });
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
      logger.error('Failed to claim tasks', { error, workerId });
      throw error;
    }
  }

  /**
   * 保存状态快照（用于崩溃恢复）
   */
  async saveStateSnapshot(taskId: string, step: string, state: any): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO task_steps (id, task_id, step_type, status, output_data, updated_at)
      VALUES (?, ?, ?, 'completed', ?, datetime('now'))
    `);

    try {
      stmt.run(`${taskId}_${step}_${Date.now()}`, taskId, step, JSON.stringify(state));
      logger.debug('State snapshot saved', { taskId, step });
    } catch (error) {
      logger.error('Failed to save state snapshot', { error, taskId, step });
      throw error;
    }
  }

  /**
   * 恢复状态快照
   */
  async loadStateSnapshot(taskId: string): Promise<any | null> {
    const stmt = this.db.prepare(`
      SELECT output_data FROM task_steps
      WHERE task_id = ? AND status = 'completed'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    try {
      const row = stmt.get(taskId) as any;
      if (!row) {
        return null;
      }

      return JSON.parse(row.output_data);
    } catch (error) {
      logger.error('Failed to load state snapshot', { error, taskId });
      return null;
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
   * 删除任务
   */
  async delete(id: string): Promise<boolean> {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);

    return result.changes > 0;
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
      logger.error('Database health check failed', { error });
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
      traceId: row.trace_id,
      mode: row.mode,
      type: row.type,
      topic: row.topic,
      requirements: row.requirements,
      hardConstraints: row.hard_constraints
        ? JSON.parse(row.hard_constraints)
        : undefined,
      status: row.status,
      currentStep: row.current_step,
      errorMessage: row.error_message,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      priority: row.priority,
      version: row.version,
      workerId: row.worker_id,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
