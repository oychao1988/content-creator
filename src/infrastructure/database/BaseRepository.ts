/**
 * BaseRepository - Repository 基类
 *
 * 提供通用的数据库操作和事务管理
 * 所有具体 Repository 应该继承此类
 */

import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { Pool as PoolClass } from 'pg';
import { config } from '../../config/index.js';

/**
 * 查询统计信息
 */
export interface QueryStats {
  text: string;
  duration: number;
  rows: number;
}

/**
 * Repository 基类
 */
export abstract class BaseRepository {
  protected pool: Pool;

  constructor(pool?: Pool) {
    this.pool = pool || new PoolClass({
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
      user: config.database.user,
      password: config.database.password,
      max: 20, // 连接池大小
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // 监听连接池错误
    this.pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  /**
   * 执行查询
   *
   * @param text - SQL 查询语句
   * @param params - 查询参数
   * @returns 查询结果
   */
  protected async query<T extends QueryResultRow>(text: string, params?: any[]): Promise<QueryResult<T>> {
    const start = Date.now();

    try {
      const res = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      // 记录查询统计（开发环境）
      if (process.env.NODE_ENV !== 'production') {
        this.logQuery({ text, duration, rows: res.rowCount || 0 });
      }

      return res;
    } catch (error) {
      console.error('Query error', { text, error });
      throw error;
    }
  }

  /**
   * 获取数据库连接（用于事务）
   *
   * @returns 数据库连接
   */
  protected async getConnection(): Promise<PoolClient> {
    return await this.pool.connect();
  }

  /**
   * 执行事务
   *
   * @param callback - 事务回调函数
   * @returns 回调函数的返回值
   */
  protected async transaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getConnection();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 批量执行查询（在单个事务中）
   *
   * @param queries - 查询数组
   * @returns 所有查询的结果数组
   */
  protected async batchQuery<T extends QueryResultRow>(queries: Array<{
    text: string;
    params?: any[];
  }>): Promise<QueryResult<T>[]> {
    return this.transaction(async (client) => {
      const results: QueryResult<T>[] = [];

      for (const query of queries) {
        const result = await client.query<T>(query.text, query.params);
        results.push(result);
      }

      return results;
    });
  }

  /**
   * 检查记录是否存在
   *
   * @param table - 表名
   * @param field - 字段名
   * @param value - 字段值
   * @returns 是否存在
   */
  protected async exists(
    table: string,
    field: string,
    value: any
  ): Promise<boolean> {
    const text = `SELECT EXISTS(SELECT 1 FROM ${table} WHERE ${field} = $1)`;
    const result = await this.query<{ exists: boolean }>(text, [value]);
    return result.rows[0]?.exists ?? false;
  }

  /**
   * 计数查询
   *
   * @param table - 表名
   * @param where - WHERE 条件（可选）
   * @returns 记录数
   */
  protected async count(table: string, where: string = 'TRUE'): Promise<number> {
    const text = `SELECT COUNT(*) as count FROM ${table} WHERE ${where}`;
    const result = await this.query<{ count: string }>(text);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  /**
   * 记录查询日志
   *
   * @param stats - 查询统计信息
   */
  private logQuery(stats: QueryStats): void {
    const { text, duration, rows } = stats;

    // 截断过长的查询语句
    const truncatedText =
      text.length > 100 ? text.substring(0, 100) + '...' : text;

    console.log(`[Query] ${truncatedText} - ${duration}ms - ${rows} rows`);
  }

  /**
   * 获取连接池统计信息
   *
   * @returns 连接池统计信息
   */
  getPoolStats(): { totalCount: number; idleCount: number; waitingCount: number } {
    return {
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }

  /**
   * 关闭连接池
   * 应该在应用关闭时调用
   */
  async close(): Promise<void> {
    try {
      await this.pool.end();
      console.log('Database connection pool closed');
    } catch (error) {
      console.error('Error closing database connection pool:', error);
      throw error;
    }
  }

  /**
   * 健康检查
   *
   * @returns 数据库是否健康
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}
