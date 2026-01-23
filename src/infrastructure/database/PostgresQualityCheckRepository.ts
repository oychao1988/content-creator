/**
 * Quality Check Repository
 *
 * 负责质量检查结果的数据库操作
 */

import { Pool } from 'pg';
import { createLogger } from '../logging/logger.js';
import type {
  IQualityCheckRepository,
  CreateQualityCheckParams,
} from '../../domain/repositories/QualityCheckRepository.js';

const logger = createLogger('QualityCheckRepository');

/**
 * PostgreSQL Quality Check Repository 实现
 */
export class PostgresQualityCheckRepository implements IQualityCheckRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 创建质量检查记录
   */
  async create(params: CreateQualityCheckParams): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO quality_checks
           (task_id, check_type, score, passed, hard_constraints_passed,
            details, fix_suggestions, rubric_version, model_name, prompt_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          params.taskId,
          params.checkType,
          params.score,
          params.passed,
          params.hardConstraintsPassed,
          JSON.stringify(params.details || {}),
          params.fixSuggestions || null,
          params.rubricVersion || null,
          params.modelName || null,
          params.promptHash || null,
        ]
      );

      logger.info('Quality check created', {
        taskId: params.taskId,
        checkType: params.checkType,
        score: params.score,
        passed: params.passed,
      });
    } catch (error) {
      logger.error('Failed to create quality check', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 根据任务 ID 查询质量检查
   */
  async findByTaskId(taskId: string): Promise<Array<{
    id: number;
    taskId: string;
    checkType: string;
    score: number;
    passed: boolean;
    hardConstraintsPassed: boolean;
    details: any;
    fixSuggestions: string[] | null;
    rubricVersion: string | null;
    modelName: string | null;
    promptHash: string | null;
    createdAt: Date;
  }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, task_id, check_type, score, passed, hard_constraints_passed,
                details, fix_suggestions, rubric_version, model_name, prompt_hash, created_at
         FROM quality_checks
         WHERE task_id = $1
         ORDER BY created_at DESC`,
        [taskId]
      );

      return result.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        checkType: row.check_type,
        score: row.score,
        passed: row.passed,
        hardConstraintsPassed: row.hard_constraints_passed,
        details: row.details ? JSON.parse(row.details) : null,
        fixSuggestions: row.fix_suggestions,
        rubricVersion: row.rubric_version,
        modelName: row.model_name,
        promptHash: row.prompt_hash,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Failed to query quality checks', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }
}
