/**
 * 数据库层导出
 *
 * 根据环境自动选择合适的实现
 */

import { config } from '../../config/index.js';
import { MemoryTaskRepository } from './MemoryTaskRepository.js';
import { SQLiteTaskRepository } from './SQLiteTaskRepository.js';
import { SQLiteResultRepository } from './SQLiteResultRepository.js';
import { SQLiteQualityCheckRepository } from './SQLiteQualityCheckRepository.js';
import { PostgresTaskRepository } from './PostgresTaskRepository.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('Database:Factory');

// 导出类型
export type { Task, TaskCreateParams, TaskUpdateParams, TaskListFilters, PaginatedResult } from '../../domain/repositories/TaskRepository.js';

/**
 * 创建 Task Repository
 *
 * 根据配置自动选择合适的实现：
 * - development: SQLite (默认，适合开发)
 * - production: PostgreSQL (需要数据库，连接失败时 fallback 到 SQLite)
 * - test: Memory (默认，适合测试)
 *
 * 支持三种类型：
 * - 'memory': 内存存储，适合测试
 * - 'sqlite': SQLite 文件数据库，适合开发
 * - 'postgres': PostgreSQL 数据库，适合生产
 *
 * PostgreSQL Fallback 策略：
 * - 如果配置了 DATABASE_TYPE=postgres 但连接失败，自动 fallback 到 SQLite
 * - 如果未配置 DATABASE_TYPE，根据环境自动选择
 *
 * @param pool - 可选的 PostgreSQL 连接池（仅 postgres 模式使用）
 * @param dbPath - 可选的 SQLite 数据库路径（仅 sqlite 模式使用）
 */
export function createTaskRepository(pool?: any, dbPath?: string) {
  const dbType = config.database.type;

  logger.info('Creating Task Repository', { databaseType: dbType });

  if (dbType === 'memory') {
    // 内存版本（适合快速测试）
    // 不创建任何数据库连接
    logger.info('Using MemoryTaskRepository');
    return new MemoryTaskRepository();
  }

  if (dbType === 'sqlite') {
    // SQLite 版本（适合开发和本地开发）
    logger.info('Using SQLiteTaskRepository', { dbPath: dbPath || './data/content-creator.db' });
    return new SQLiteTaskRepository(dbPath);
  }

  if (dbType === 'postgres') {
    // PostgreSQL 版本（需要数据库连接）
    try {
      // 如果提供了 pool，使用提供的；否则由 BaseRepository 自动创建
      logger.info('Using PostgresTaskRepository');
      return new PostgresTaskRepository(pool);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn('PostgreSQL initialization failed, falling back to SQLite', { error: errorMsg });
      console.warn('⚠️  PostgreSQL not available, falling back to SQLite repository');
      logger.info('Fallback: Using SQLiteTaskRepository', { dbPath: dbPath || './data/content-creator.db' });
      return new SQLiteTaskRepository(dbPath);
    }
  }

  // 不应该到这里，但作为最后的 fallback，使用 SQLite
  logger.warn(`Unknown database type: ${dbType}, falling back to SQLite`);
  return new SQLiteTaskRepository(dbPath);
}

/**
 * 创建 Result Repository
 *
 * 根据配置自动选择合适的实现
 */
export function createResultRepository(_pool?: any, dbPath?: string) {
  const dbType = config.database.type;

  logger.info('Creating Result Repository', { databaseType: dbType });

  // 注意：PostgreSQL 版本需要动态导入，但目前只支持 SQLite
  // 默认使用 SQLiteResultRepository
  logger.info('Using SQLiteResultRepository', { dbPath: dbPath || './data/content-creator.db' });
  return new SQLiteResultRepository(dbPath);
}

/**
 * 创建 Quality Check Repository
 *
 * 根据配置自动选择合适的实现
 */
export function createQualityCheckRepository(_pool?: any, dbPath?: string) {
  const dbType = config.database.type;

  logger.info('Creating Quality Check Repository', { databaseType: dbType });

  // 注意：PostgreSQL 版本需要动态导入，但目前只支持 SQLite
  // 默认使用 SQLiteQualityCheckRepository
  logger.info('Using SQLiteQualityCheckRepository', { dbPath: dbPath || './data/content-creator.db' });
  return new SQLiteQualityCheckRepository(dbPath);
}

// 导出具体的 Repository 类（可选使用）
export { MemoryTaskRepository } from './MemoryTaskRepository.js';
export { PostgresTaskRepository } from './PostgresTaskRepository.js';
export { SQLiteTaskRepository } from './SQLiteTaskRepository.js';
export { PostgresResultRepository } from './ResultRepository.js';
export { SQLiteResultRepository } from './SQLiteResultRepository.js';
export { PostgresQualityCheckRepository } from './PostgresQualityCheckRepository.js';
export { SQLiteQualityCheckRepository } from './SQLiteQualityCheckRepository.js';

// 导出单例（全局使用）
export const taskRepository = createTaskRepository();
