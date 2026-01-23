/**
 * 数据库层导出
 *
 * 根据环境自动选择合适的实现
 */

import { config } from '../../config/index.js';
import { MemoryTaskRepository } from './MemoryTaskRepository.js';

// 导出类型
export type { Task, TaskCreateParams, TaskUpdateParams, TaskListFilters, PaginatedResult } from '../../domain/repositories/TaskRepository.js';

/**
 * 创建 Task Repository
 *
 * 根据配置自动选择合适的实现：
 * - development/postgres: PostgreSQL (需要数据库)
 * - development/memory: Memory (默认，适合测试)
 * - test: Memory
 * - production: PostgreSQL
 *
 * @param pool - 可选的 PostgreSQL 连接池（仅 postgres 模式使用）
 */
export function createTaskRepository(pool?: any) {
  const dbType = config.database.type || 'memory';

  if (dbType === 'memory') {
    // 内存版本（适合快速测试）
    // 不创建任何数据库连接
    return new MemoryTaskRepository();
  }

  if (dbType === 'postgres') {
    // PostgreSQL 版本（需要数据库连接）
    // 动态导入以避免在不需要时加载 pg
    try {
      const { PostgresTaskRepository } = require('./PostgresTaskRepository.js');
      // 如果提供了 pool，使用提供的；否则由 BaseRepository 自动创建
      return new PostgresTaskRepository(pool);
    } catch (error) {
      console.warn('PostgreSQL not available, falling back to memory repository');
      return new MemoryTaskRepository();
    }
  }

  // 默认使用内存版本
  return new MemoryTaskRepository();
}

// 导出具体的 Repository 类（可选使用）
export { MemoryTaskRepository } from './MemoryTaskRepository.js';
export { PostgresTaskRepository } from './PostgresTaskRepository.js';

// 导出单例（全局使用）
export const taskRepository = createTaskRepository();
