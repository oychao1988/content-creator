/**
 * QualityCheck Cache - 质量检查缓存服务
 *
 * 缓存质检结果，避免重复的 LLM 调用
 * 支持 Memory 和 Redis 两种存储实现
 */

import { createLogger } from '../../infrastructure/logging/logger.js';
import type { QualityReport } from '../State.js';

const logger = createLogger('QualityCheckCache');

/**
 * 缓存条目
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // 过期时间（秒）
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  type: 'memory' | 'redis';
  ttl?: number; // 默认 TTL：24 小时
  maxSize?: number; // Memory 缓存最大条目数
  redisUrl?: string; // Redis 连接 URL
}

/**
 * 缓存统计
 */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number; // 命中率 (0-1)
}

/**
 * 质量检查缓存接口
 */
export interface IQualityCheckCache {
  get(key: string): Promise<QualityReport | null>;
  set(key: string, value: QualityReport): Promise<void>;
  clear(): Promise<void>;
  getStats(): Promise<CacheStats>;
}

/**
 * Memory 缓存实现
 */
export class MemoryQualityCheckCache implements IQualityCheckCache {
  private cache = new Map<string, CacheEntry<QualityReport>>();
  private hits = 0;
  private misses = 0;
  private ttl: number;
  private maxSize: number;

  constructor(config: CacheConfig = { type: 'memory' }) {
    this.ttl = config.ttl || 24 * 3600; // 默认 24 小时
    this.maxSize = config.maxSize || 1000; // 默认最多 1000 条

    logger.info('Memory cache initialized', {
      ttl: this.ttl,
      maxSize: this.maxSize,
    });
  }

  async get(key: string): Promise<QualityReport | null> {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      logger.debug('Cache miss', { key });
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    const age = (now - entry.timestamp) / 1000; // 秒

    if (age > entry.ttl) {
      this.cache.delete(key);
      this.misses++;
      logger.debug('Cache entry expired', { key, age });
      return null;
    }

    this.hits++;
    logger.debug('Cache hit', { key, age: Math.round(age) });
    return entry.data;
  }

  async set(key: string, value: QualityReport): Promise<void> {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        logger.debug('Cache full, evicted oldest entry', { key: firstKey });
      }
    }

    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl: this.ttl,
    });

    logger.debug('Cache entry added', { key, cacheSize: this.cache.size });
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    logger.info('Cache cleared');
  }

  async getStats(): Promise<CacheStats> {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate,
    };
  }
}

/**
 * Redis 缓存实现（占位符，实际使用时需要安装 ioredis）
 */
export class RedisQualityCheckCache implements IQualityCheckCache {
  private ttl: number;
  private redisUrl: string;

  constructor(config: CacheConfig) {
    this.ttl = config.ttl || 24 * 3600;
    this.redisUrl = config.redisUrl || 'redis://localhost:6379';

    logger.info('Redis cache initialized', {
      ttl: this.ttl,
      redisUrl: this.redisUrl,
    });
  }

  async get(_key: string): Promise<QualityReport | null> {
    // TODO: 实现 Redis 缓存
    logger.warn('Redis cache not implemented, using no-op');
    return null;
  }

  async set(_key: string, _value: QualityReport): Promise<void> {
    // TODO: 实现 Redis 缓存
    logger.warn('Redis cache not implemented, ignoring set');
  }

  async clear(): Promise<void> {
    // TODO: 实现 Redis 缓存
    logger.warn('Redis cache not implemented, ignoring clear');
  }

  async getStats(): Promise<CacheStats> {
    // TODO: 实现 Redis 缓存
    return {
      hits: 0,
      misses: 0,
      size: 0,
      hitRate: 0,
    };
  }
}

/**
 * 创建缓存实例
 */
export function createQualityCheckCache(config: CacheConfig = { type: 'memory' }): IQualityCheckCache {
  if (config.type === 'redis') {
    return new RedisQualityCheckCache(config);
  }

  return new MemoryQualityCheckCache(config);
}

/**
 * 生成缓存键
 *
 * 基于文章内容的 MD5 hash
 */
export async function generateCacheKey(content: string, checkType: string): Promise<string> {
  // 使用简单的 hash 算法（实际生产环境建议使用 crypto）
  const hash = simpleHash(content);
  return `${checkType}:${hash}`;
}

/**
 * 简单的字符串 hash 函数（用于生成缓存键）
 *
 * 注意：这不是加密安全的 hash，仅用于缓存键生成
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 装饰器：为 CheckText 添加缓存功能
 */
export function withCache<T extends (...args: any[]) => Promise<QualityReport>>(
  fn: T,
  cache: IQualityCheckCache,
  getCacheKey: (...args: Parameters<T>) => Promise<string>
): T {
  return (async (...args: Parameters<T>) => {
    // 生成缓存键
    const key = await getCacheKey(...args);

    // 尝试从缓存获取
    const cached = await cache.get(key);
    if (cached) {
      logger.info('Cache hit for quality check', { key });
      return cached;
    }

    // 缓存未命中，执行原函数
    const result = await fn(...args);

    // 保存到缓存
    await cache.set(key, result);

    return result;
  }) as T;
}
