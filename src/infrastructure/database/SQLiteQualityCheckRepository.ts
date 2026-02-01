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

    // 确保所有参数都是 SQLite 支持的类型
    const safeDetails = (params.details && Object.keys(params.details).length > 0)
      ? JSON.stringify(params.details)
      : null;

    const safeFixSuggestions = (params.fixSuggestions && Array.isArray(params.fixSuggestions) && params.fixSuggestions.length > 0)
      ? JSON.stringify(params.fixSuggestions)
      : null;

    // 确保 score 是有效的数字
    const safeScore = Number.isFinite(params.score) ? params.score : 0;

    // SQLite 不支持 BOOLEAN 类型，需要转换为 0/1
    const safePassed = params.passed ? 1 : 0;
    const safeHardConstraintsPassed = params.hardConstraintsPassed ? 1 : 0;

    try {
      stmt.run(
        uuidv4(), // 使用 UUID v4 确保唯一性
        String(params.taskId || ''), // 确保 taskId 是字符串
        String(params.checkType || 'text'), // 确保 checkType 是字符串
        safeScore,
        safePassed,
        safeHardConstraintsPassed,
        safeDetails,
        safeFixSuggestions,
        params.rubricVersion ? String(params.rubricVersion) : null,
        params.modelName ? String(params.modelName) : null,
        params.promptHash ? String(params.promptHash) : null,
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
      passed: Boolean(row.passed),
      hardConstraintsPassed: Boolean(row.hard_constraints_passed),
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
