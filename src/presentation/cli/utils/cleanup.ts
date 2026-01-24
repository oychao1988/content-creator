/**
 * CLI 资源清理工具
 *
 * 确保所有 CLI 命令执行后正确清理资源，避免进程挂起
 */

import { closeLogger } from '../../../infrastructure/logging/logger.js';

/**
 * 清理所有 CLI 资源
 *
 * @param repositories - 需要关闭的 Repository 数组
 */
export async function cleanupResources(...repositories: Array<any>): Promise<void> {
  const errors: Array<Error> = [];

  // 1. 关闭所有 Repository 连接池
  for (const repo of repositories) {
    if (repo && typeof repo.close === 'function') {
      try {
        await repo.close();
      } catch (error) {
        errors.push(error as Error);
      }
    }
  }

  // 2. 停止 Metrics 服务（如果有定时器在运行）
  try {
    const { metricsService } = await import('../../../infrastructure/monitoring/MetricsService.js');
    metricsService.stop();
  } catch (error) {
    // Metrics 服务可能未初始化，忽略错误
  }

  // 3. 关闭 Redis 连接
  try {
    const { redisClient } = await import('../../../infrastructure/redis/connection.js');
    await redisClient.disconnect();
  } catch (error) {
    // Redis 可能未连接，忽略错误
  }

  // 4. 关闭 Logger（必须在最后）
  try {
    await closeLogger();
  } catch (error) {
    // 忽略 logger 关闭错误
    errors.push(error as Error);
  }

  // 5. 如果有错误，输出但不要抛出
  if (errors.length > 0) {
    console.warn(`⚠️  资源清理时发生 ${errors.length} 个错误（已忽略）`);
    errors.forEach((err, index) => {
      console.warn(`  ${index + 1}. ${err.message}`);
    });
  }

  // 6. 强制退出进程，确保没有任何定时器或事件阻止退出
  // 注意：这是最后手段，正常情况下不需要
  setTimeout(() => {
    process.exit(0);
  }, 100);
}
