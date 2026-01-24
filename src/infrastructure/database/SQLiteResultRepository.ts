/**
 * SQLite Result Repository
 *
 * 使用 better-sqlite3 实现的轻量级结果数据访问层
 * 适合开发和测试环境
 */

import Database from 'better-sqlite3';
import { createLogger } from '../../infrastructure/logging/logger.js';
import type { IResultRepository, CreateResultParams, ResultRecord } from '../../domain/repositories/ResultRepository.js';

const logger = createLogger('SQLite:ResultRepository');

/**
 * SQLite Result Repository 实现
 */
export class SQLiteResultRepository implements IResultRepository {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const actualDbPath = dbPath || './data/content-creator.db';
    this.db = new Database(actualDbPath);
    logger.info('SQLite result repository initialized', { dbPath: actualDbPath });
  }

  /**
   * 创建结果记录
   */
  async create(params: CreateResultParams): Promise<void> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO results (
        id, task_id, result_type, content, file_path, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const metadata = params.metadata ? JSON.stringify(params.metadata) : null;

    try {
      stmt.run(
        `${params.taskId}_${params.resultType}_${Date.now()}`, // 使用更可靠的 ID 生成方式
        params.taskId,
        params.resultType,
        params.content || null,
        params.filePath || null,
        metadata,
        now
      );

      logger.info('Result created', {
        taskId: params.taskId,
        resultType: params.resultType,
      });
    } catch (error) {
      logger.error('Failed to create result', { error: error as any, params });
      throw error;
    }
  }

  /**
   * 根据任务 ID 查询结果
   */
  async findByTaskId(taskId: string): Promise<ResultRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM results WHERE task_id = ? ORDER BY result_type');
    const rows = stmt.all(taskId) as any[];

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      resultType: row.result_type,
      content: row.content,
      filePath: row.file_path,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at),
    })) as ResultRecord[];
  }

  /**
   * 删除任务的所有结果
   */
  async deleteByTaskId(taskId: string): Promise<void> {
    const stmt = this.db.prepare('DELETE FROM results WHERE task_id = ?');
    stmt.run(taskId);
    logger.info('Results deleted', { taskId });
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    logger.info('SQLite result repository connection closed');
  }
}
