/**
 * Result Repository
 *
 * 负责任务结果的数据库操作
 */

import { Pool } from 'pg';
import { createLogger } from '../logging/logger.js';
import type { IResultRepository } from '../../domain/repositories/ResultRepository.js';

const logger = createLogger('ResultRepository');

/**
 * PostgreSQL Result Repository 实现
 */
export class PostgresResultRepository implements IResultRepository {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * 创建结果记录
   */
  async create(params: {
    taskId: string;
    resultType: 'article' | 'image' | 'text';
    content?: string;
    filePath?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO results (task_id, result_type, content, file_path, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [params.taskId, params.resultType, params.content, params.filePath, JSON.stringify(params.metadata || {})]
      );

      logger.info('Result created', {
        taskId: params.taskId,
        resultType: params.resultType,
      });
    } catch (error) {
      logger.error('Failed to create result', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 根据任务 ID 查询结果
   */
  async findByTaskId(taskId: string): Promise<Array<{
    id: number;
    taskId: string;
    resultType: string;
    content: string | null;
    filePath: string | null;
    metadata: any;
    createdAt: Date;
  }>> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT id, task_id, result_type, content, file_path, metadata, created_at
         FROM results
         WHERE task_id = $1
         ORDER BY result_type`,
        [taskId]
      );

      return result.rows.map(row => ({
        id: row.id,
        taskId: row.task_id,
        resultType: row.result_type,
        content: row.content,
        filePath: row.file_path,
        // jsonb 类型已被 pg driver 自动解析，无需 JSON.parse
        metadata: row.metadata || null,
        createdAt: row.created_at,
      }));
    } catch (error) {
      logger.error('Failed to query results', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 删除任务的所有结果
   */
  async deleteByTaskId(taskId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `DELETE FROM results WHERE task_id = $1`,
        [taskId]
      );

      logger.info('Results deleted', { taskId });
    } catch (error) {
      logger.error('Failed to delete results', error as Error);
      throw error;
    } finally {
      client.release();
    }
  }
}
