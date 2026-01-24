/**
 * SQLite Quality Check Repository
 *
 * 使用 better-sqlite3 实现的轻量级质量检查数据访问层
 * 适合开发和测试环境
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '../../infrastructure/logging/logger.js';
import type { IQualityCheckRepository, CreateQualityCheckParams, QualityCheckRecord } from '../../domain/repositories/QualityCheckRepository.js';

const logger = createLogger('SQLite:QualityCheckRepository');

/**
 * SQLite Quality Check Repository 实现
 */
export class SQLiteQualityCheckRepository implements IQualityCheckRepository {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const actualDbPath = dbPath || './data/content-creator.db';
    this.db = new Database(actualDbPath);
    logger.info('SQLite quality check repository initialized', { dbPath: actualDbPath });
  }

  /**
   * 创建质量检查记录
   */
  async create(params: CreateQualityCheckParams): Promise<void> {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO quality_checks (
        id, task_id, check_type, score, passed, hard_constraints_passed,
        details, fix_suggestions, rubric_version, model_name, prompt_hash, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const details = params.details ? JSON.stringify(params.details) : null;
    const fixSuggestions = (params.fixSuggestions && params.fixSuggestions.length > 0)
      ? JSON.stringify(params.fixSuggestions)
      : null;

    try {
      stmt.run(
        uuidv4(), // 使用 UUID v4 确保唯一性
        params.taskId,
        params.checkType,
        params.score,
        params.passed,
        params.hardConstraintsPassed,
        details,
        fixSuggestions,
        params.rubricVersion || null,
        params.modelName || null,
        params.promptHash || null,
        now
      );

      logger.info('Quality check created', {
        taskId: params.taskId,
        checkType: params.checkType,
        score: params.score,
        passed: params.passed,
      });
    } catch (error) {
      logger.error('Failed to create quality check', { error: error as any, params });
      throw error;
    }
  }

  /**
   * 根据任务 ID 查询质量检查
   */
  async findByTaskId(taskId: string): Promise<QualityCheckRecord[]> {
    const stmt = this.db.prepare('SELECT * FROM quality_checks WHERE task_id = ? ORDER BY created_at DESC');
    const rows = stmt.all(taskId) as any[];

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      checkType: row.check_type,
      score: row.score,
      passed: row.passed,
      hardConstraintsPassed: row.hard_constraints_passed,
      details: row.details ? JSON.parse(row.details) : null,
      fixSuggestions: row.fix_suggestions ? JSON.parse(row.fix_suggestions) : null,
      rubricVersion: row.rubric_version,
      modelName: row.model_name,
      promptHash: row.prompt_hash,
      createdAt: new Date(row.created_at),
    })) as QualityCheckRecord[];
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
    logger.info('SQLite quality check repository connection closed');
  }
}
