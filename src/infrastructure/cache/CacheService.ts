/**
 * Redis 缓存服务
 *
 * 基于 ioredis 和 cache-manager 的缓存服务
 * 提供高性能的缓存功能，支持 LLM 响应缓存、搜索结果缓存等
 */

import { createLogger } from '../logging/logger.js';
import { redisClient } from '../redis/connection.js';
import { metricsService } from '../monitoring/MetricsService.js';

const logger = createLogger('Cache');

/**
 * 缓存配置选项
 */
export interface CacheOptions {
  ttl?: number;          // 默认过期时间（秒）
  prefix?: string;       // 键前缀
  maxSize?: number;      // 最大缓存条目数
}

/**
 * 缓存统计信息
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
}

/**
 * 缓存服务类
 */
export class CacheService {
  private redisClientWrapper = redisClient;
  private redis: any | null = null;
  private prefix: string;
  private defaultTTL: number;
  private stats: Map<string, { hits: number; misses: number }>;
  private enabled: boolean;

  constructor(options?: CacheOptions) {
    this.prefix = options?.prefix || 'cc';
    this.defaultTTL = options?.ttl || 3600; // 默认 1 小时
    this.stats = new Map();
    this.enabled = this.redisClientWrapper.isEnabled();

    if (!this.enabled) {
      logger.info('Cache service initialized (Redis disabled, cache will be no-op)');
    } else {
      // 异步初始化 Redis 客户端
      this.initializeRedis();

      logger.info('Cache service initialized', {
        prefix: this.prefix,
        defaultTTL: this.defaultTTL,
      });
    }
  }

  /**
   * 检查缓存是否启用
   */
  isCacheEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 初始化 Redis 客户端
   */
  private async initializeRedis(): Promise<void> {
    if (!this.enabled) {
      return;
    }
    if (!this.redis) {
      try {
        this.redis = await this.redisClientWrapper.getClient();
      } catch (error) {
        logger.warn('Failed to initialize Redis client, cache will be disabled', error as Error);
        this.enabled = false;
      }
    }
  }

  /**
   * 获取 Redis 客户端
   */
  private async getRedis(): Promise<any> {
    if (!this.enabled) {
      throw new Error('Cache is disabled');
    }
    if (!this.redis) {
      await this.initializeRedis();
    }
    return this.redis!;
  }

  /**
   * 生成完整的键
   */
  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * 生成哈希键
   */
  private hashKey(key: string): string {
    // 简单的哈希函数
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled) {
      // 缓存禁用时直接返回 null
      return null;
    }

    const fullKey = this.buildKey(key);

    try {
      const redis = await this.getRedis();
      const value = await redis.get(fullKey);

      if (value !== null) {
        // 记录命中
        this.incrementHits(key);
        metricsService.recordCacheHit('default');

        logger.debug('Cache hit', { key });
        return JSON.parse(value) as T;
      }

      // 记录未命中
      this.incrementMisses(key);
      metricsService.recordCacheMiss('default');

      logger.debug('Cache miss', { key });
      return null;
    } catch (error) {
      logger.error('Failed to get cache', error as Error, { key });
      return null;
    }
  }

  /**
   * 设置缓存
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.enabled) {
      // 缓存禁时时静默返回
      return;
    }

    const fullKey = this.buildKey(key);
    const expire = ttl ?? this.defaultTTL;

    try {
      const redis = await this.getRedis();
      const serialized = JSON.stringify(value);
      await redis.set(fullKey, serialized, 'EX', expire);

      metricsService.recordCacheSet('default');

      logger.debug('Cache set', { key, ttl: expire });
    } catch (error) {
      logger.error('Failed to set cache', error as Error, { key });
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.buildKey(key);

    try {
      const redis = await this.getRedis();
      await redis.del(fullKey);

      metricsService.recordCacheDelete('default');

      logger.debug('Cache deleted', { key });
    } catch (error) {
      logger.error('Failed to delete cache', error as Error, { key });
    }
  }

  /**
   * 批量获取
   */
  async getMany<T>(keys: string[]): Promise<Map<string, T>> {
    const result = new Map<string, T>();

    try {
      const redis = await this.getRedis();
      const fullKeys = keys.map(key => this.buildKey(key));
      const values = await redis.mget(...fullKeys);

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = values[i];

        if (value !== null && value !== undefined) {
          result.set(key!, JSON.parse(String(value)) as T);
          if (key) this.incrementHits(key!);
          metricsService.recordCacheHit('default');
        } else {
          if (key) this.incrementMisses(key!);
          metricsService.recordCacheMiss('default');
        }
      }

      logger.debug('Batch cache get', {
        requested: keys.length,
        found: result.size,
      });
    } catch (error) {
      logger.error('Failed to batch get cache', error as Error);
    }

    return result;
  }

  /**
   * 批量设置
   */
  async setMany(items: Map<string, any>, ttl?: number): Promise<void> {
    try {
      const redis = await this.getRedis();
      const pipeline = redis.pipeline();
      const expire = ttl ?? this.defaultTTL;

      for (const [key, value] of items.entries()) {
        const fullKey = this.buildKey(key);
        const serialized = JSON.stringify(value);
        pipeline.set(fullKey, serialized, 'EX', expire);
      }

      await pipeline.exec();

      metricsService.recordCacheSet('default');

      logger.debug('Batch cache set', { count: items.size });
    } catch (error) {
      logger.error('Failed to batch set cache', error as Error);
    }
  }

  /**
   * 检查键是否存在
   */
  async exists(key: string): Promise<boolean> {
    const fullKey = this.buildKey(key);

    try {
      const redis = await this.getRedis();
      const result = await redis.exists(fullKey);
      return result === 1;
    } catch (error) {
      logger.error('Failed to check cache existence', error as Error, { key });
      return false;
    }
  }

  /**
   * 设置过期时间
   */
  async expire(key: string, ttl: number): Promise<void> {
    const fullKey = this.buildKey(key);

    try {
      const redis = await this.getRedis();
      await redis.expire(fullKey, ttl);
      logger.debug('Cache expiration set', { key, ttl });
    } catch (error) {
      logger.error('Failed to set cache expiration', error as Error, { key });
    }
  }

  /**
   * 获取剩余过期时间
   */
  async ttl(key: string): Promise<number> {
    const fullKey = this.buildKey(key);

    try {
      const redis = await this.getRedis();
      return await redis.ttl(fullKey);
    } catch (error) {
      logger.error('Failed to get cache TTL', error as Error, { key });
      return -1;
    }
  }

  /**
   * 清空所有匹配前缀的缓存
   */
  async invalidate(pattern: string): Promise<void> {
    try {
      const redis = await this.getRedis();
      const fullPattern = this.buildKey(pattern);
      const keys = await redis.keys(fullPattern);

      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info('Cache invalidated', { pattern, count: keys.length });
      }
    } catch (error) {
      logger.error('Failed to invalidate cache', error as Error, { pattern });
    }
  }

  /**
   * 清空所有缓存
   */
  async flush(): Promise<void> {
    try {
      const redis = await this.getRedis();
      const pattern = this.buildKey('*');
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info('Cache flushed', { count: keys.length });
      }
    } catch (error) {
      logger.error('Failed to flush cache', error as Error);
    }
  }

  /**
   * 获取缓存大小
   */
  async size(): Promise<number> {
    try {
      const redis = await this.getRedis();
      const pattern = this.buildKey('*');
      const keys = await redis.keys(pattern);
      return keys.length;
    } catch (error) {
      logger.error('Failed to get cache size', error as Error);
      return 0;
    }
  }

  /**
   * 获取缓存统计
   */
  async getStats(): Promise<CacheStats> {
    try {
      const cacheSize = await this.size();

      let totalHits = 0;
      let totalMisses = 0;

      for (const stats of this.stats.values()) {
        totalHits += stats.hits;
        totalMisses += stats.misses;
      }

      const hitRate = totalHits + totalMisses > 0
        ? (totalHits / (totalHits + totalMisses)) * 100
        : 0;

      return {
        hits: totalHits,
        misses: totalMisses,
        hitRate,
        size: cacheSize,
      };
    } catch (error) {
      logger.error('Failed to get cache stats', error as Error);
      return {
        hits: 0,
        misses: 0,
        hitRate: 0,
        size: 0,
      };
    }
  }

  /**
   * 增加命中计数
   */
  private incrementHits(key: string): void {
    const stats = this.stats.get(key) || { hits: 0, misses: 0 };
    stats.hits++;
    this.stats.set(key, stats);
  }

  /**
   * 增加未命中计数
   */
  private incrementMisses(key: string): void {
    const stats = this.stats.get(key) || { hits: 0, misses: 0 };
    stats.misses++;
    this.stats.set(key, stats);
  }

  /**
   * LLM 响应缓存辅助方法
   */
  async getCachedLLMResponse(prompt: string): Promise<string | null> {
    const key = this.hashKey(`llm:response:${prompt}`);
    return this.get<string>(key);
  }

  async setCachedLLMResponse(prompt: string, response: string, ttl: number = 7 * 24 * 3600): Promise<void> {
    const key = this.hashKey(`llm:response:${prompt}`);
    return this.set(key, response, ttl);
  }

  /**
   * 搜索结果缓存辅助方法
   */
  async getCachedSearchResults(query: string): Promise<any | null> {
    const key = this.hashKey(`search:result:${query}`);
    return this.get<any>(key);
  }

  async setCachedSearchResults(query: string, results: any, ttl: number = 24 * 3600): Promise<void> {
    const key = this.hashKey(`search:result:${query}`);
    return this.set(key, results, ttl);
  }

  /**
   * 质量检查缓存辅助方法
   */
  async getCachedQualityCheck(contentHash: string): Promise<any | null> {
    const key = `quality:check:${contentHash}`;
    return this.get<any>(key);
  }

  async setCachedQualityCheck(contentHash: string, result: any, ttl: number = 3 * 24 * 3600): Promise<void> {
    const key = `quality:check:${contentHash}`;
    return this.set(key, result, ttl);
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const redis = await this.getRedis();
      await redis.ping();
      return true;
    } catch (error) {
      logger.error('Cache health check failed', error as Error);
      return false;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.quit();
      }
      logger.info('Cache service closed');
    } catch (error) {
      logger.error('Failed to close cache service', error as Error);
    }
  }
}

/**
 * 缓存服务单例
 */
export const cacheService = new CacheService();
