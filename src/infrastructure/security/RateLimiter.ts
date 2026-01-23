/**
 * 速率限制服务
 *
 * 提供滑动窗口、令牌桶等速率限制算法
 * 支持基于 IP、用户、API Key 的限流
 */

import Redis from 'ioredis';
import { redisClient } from '../redis/connection.js';
import { createLogger } from '../logging/logger.js';
import { metricsService } from '../monitoring/MetricsService.js';

const logger = createLogger('RateLimiter');

/**
 * 速率限制结果
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: Date;
  retryAfter?: number;  // 秒
}

/**
 * 速率限制配置
 */
export interface RateLimitConfig {
  limit: number;        // 限制次数
  window: number;       // 时间窗口（秒）
  burst?: number;       // 突发容量（可选，用于令牌桶算法）
}

/**
 * 速率限制器类型
 */
export type RateLimiterType = 'sliding-window' | 'token-bucket' | 'fixed-window';

/**
 * 速率限制服务类
 */
export class RateLimiter {
  private redisClientWrapper = redisClient;
  private redis: Redis | null = null;

  /**
   * 获取 Redis 客户端
   */
  private async getRedis(): Promise<Redis> {
    if (!this.redis) {
      this.redis = await this.redisClientWrapper.getClient();
    }
    return this.redis;
  }

  /**
   * 滑动窗口速率限制
   */
  async slidingWindow(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const key = `ratelimit:sliding:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.window * 1000;

    try {
      const redis = await this.getRedis();

      // 使用 Redis 事务
      const pipeline = redis.pipeline();

      // 移除窗口外的记录
      pipeline.zremrangebyscore(key, 0, windowStart);

      // 添加当前请求
      pipeline.zadd(key, now, `${now}:${Math.random()}`);

      // 设置过期时间
      pipeline.expire(key, config.window + 1);

      // 统计当前窗口内的请求数
      pipeline.zcard(key);

      const results = await pipeline.exec();
      const count = results?.[2][1] as number || 0;

      const allowed = count <= config.limit;
      const remaining = Math.max(0, config.limit - count);
      const resetTime = new Date(windowStart + config.window * 1000 + config.window * 1000);

      if (!allowed) {
        // 计算需要等待的时间
        const oldestResult = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const oldestTimestamp = oldestResult.length > 1 ? parseInt(oldestResult[1]) : now;
        const retryAfter = Math.ceil((oldestTimestamp + config.window * 1000 - now) / 1000);

        logger.warn('Rate limit exceeded', {
          identifier,
          count,
          limit: config.limit,
          retryAfter,
        });

        metricsService.recordCacheMiss('ratelimit');

        return {
          allowed: false,
          limit: config.limit,
          remaining: 0,
          resetTime,
          retryAfter,
        };
      }

      logger.debug('Rate limit check passed', {
        identifier,
        count,
        limit: config.limit,
      });

      metricsService.recordCacheHit('ratelimit');

      return {
        allowed: true,
        limit: config.limit,
        remaining,
        resetTime,
      };
    } catch (error) {
      logger.error('Failed to check rate limit (sliding window)', error as Error, { identifier });
      // 出错时默认允许
      return {
        allowed: true,
        limit: config.limit,
        remaining: config.limit,
        resetTime: new Date(Date.now() + config.window * 1000),
      };
    }
  }

  /**
   * 令牌桶速率限制
   */
  async tokenBucket(
    identifier: string,
    config: Required<RateLimitConfig>
  ): Promise<RateLimitResult> {
    const key = `ratelimit:tokenbucket:${identifier}`;
    const now = Date.now();

    try {
      const redis = await this.getRedis();

      // 获取当前状态
      const current = await redis.get(key);
      let tokens = config.burst;
      let lastRefill = now;

      if (current) {
        const data = JSON.parse(current);
        tokens = data.tokens;
        lastRefill = data.lastRefill;

        // 计算需要补充的令牌数
        const elapsed = (now - lastRefill) / 1000; // 秒
        const refillRate = config.limit / config.window; // 每秒补充的令牌数
        const tokensToAdd = Math.floor(elapsed * refillRate);
        tokens = Math.min(config.burst, tokens + tokensToAdd);
      }

      const allowed = tokens >= 1;
      let retryAfter: number | undefined;

      if (allowed) {
        tokens -= 1;
        await redis.set(
          key,
          JSON.stringify({ tokens, lastRefill: now }),
          'EX',
          config.window + 1
        );

        logger.debug('Token bucket rate limit check passed', {
          identifier,
          tokens,
          limit: config.limit,
        });
      } else {
        // 计算需要等待的时间
        const refillRate = config.limit / config.window;
        retryAfter = Math.ceil((1 - tokens) / refillRate);

        logger.warn('Token bucket rate limit exceeded', {
          identifier,
          tokens,
          limit: config.limit,
          retryAfter,
        });
      }

      return {
        allowed,
        limit: config.limit,
        remaining: tokens,
        resetTime: new Date(now + retryAfter ? retryAfter * 1000 : config.window * 1000),
        retryAfter,
      };
    } catch (error) {
      logger.error('Failed to check rate limit (token bucket)', error as Error, { identifier });
      // 出错时默认允许
      return {
        allowed: true,
        limit: config.limit,
        remaining: config.burst,
        resetTime: new Date(Date.now() + config.window * 1000),
      };
    }
  }

  /**
   * 固定窗口速率限制
   */
  async fixedWindow(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = Math.floor(now / (config.window * 1000)) * (config.window * 1000);
    const key = `ratelimit:fixed:${identifier}:${windowStart}`;

    try {
      const redis = await this.getRedis();

      // 增加计数
      const count = await redis.incr(key);

      // 设置过期时间
      if (count === 1) {
        await redis.expire(key, config.window + 1);
      }

      const allowed = count <= config.limit;
      const remaining = Math.max(0, config.limit - count);
      const resetTime = new Date(windowStart + config.window * 1000);
      const retryAfter = allowed ? undefined : Math.ceil((resetTime.getTime() - now) / 1000);

      if (!allowed) {
        logger.warn('Fixed window rate limit exceeded', {
          identifier,
          count,
          limit: config.limit,
          retryAfter,
        });
      }

      return {
        allowed,
        limit: config.limit,
        remaining,
        resetTime,
        retryAfter,
      };
    } catch (error) {
      logger.error('Failed to check rate limit (fixed window)', error as Error, { identifier });
      // 出错时默认允许
      return {
        allowed: true,
        limit: config.limit,
        remaining: config.limit,
        resetTime: new Date(windowStart + config.window * 1000),
      };
    }
  }

  /**
   * 通用速率限制检查
   */
  async checkLimit(
    identifier: string,
    config: RateLimitConfig,
    type: RateLimiterType = 'sliding-window'
  ): Promise<RateLimitResult> {
    switch (type) {
      case 'sliding-window':
        return this.slidingWindow(identifier, config);
      case 'token-bucket':
        return this.tokenBucket(identifier, { ...config, burst: config.burst || config.limit * 2 });
      case 'fixed-window':
        return this.fixedWindow(identifier, config);
      default:
        throw new Error(`Unknown rate limiter type: ${type}`);
    }
  }

  /**
   * 重置速率限制
   */
  async resetLimit(identifier: string, type: RateLimiterType = 'sliding-window'): Promise<void> {
    try {
      const redis = await this.getRedis();
      const prefix = `ratelimit:${type === 'sliding-window' ? 'sliding' : type === 'token-bucket' ? 'tokenbucket' : 'fixed'}`;
      const pattern = `${prefix}:${identifier}*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        await redis.del(...keys);
        logger.info('Rate limit reset', { identifier, count: keys.length });
      }
    } catch (error) {
      logger.error('Failed to reset rate limit', error as Error, { identifier });
    }
  }

  /**
   * 获取当前速率限制状态
   */
  async getStatus(
    identifier: string,
    type: RateLimiterType = 'sliding-window'
  ): Promise<{ count: number; limit: number } | null> {
    try {
      const redis = await this.getRedis();
      const key = `ratelimit:${type === 'sliding-window' ? 'sliding' : type}:${identifier}`;

      if (type === 'sliding-window') {
        const count = await redis.zcard(key);
        return { count, limit: 0 }; // 无法获取原始限制
      } else if (type === 'token-bucket') {
        const current = await redis.get(key);
        if (current) {
          const data = JSON.parse(current);
          return { count: data.tokens, limit: 0 };
        }
      } else if (type === 'fixed-window') {
        const now = Date.now();
        const windowSize = 60000; // 假设 1 分钟窗口
        const windowStart = Math.floor(now / windowSize) * windowSize;
        const fixedKey = `${key}:${windowStart}`;
        const count = parseInt((await redis.get(fixedKey)) || '0');
        return { count, limit: 0 };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get rate limit status', error as Error, { identifier });
      return null;
    }
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
      logger.error('Rate limiter health check failed', error as Error);
      return false;
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    try {
      const redis = await this.getRedis();
      await redis.quit();
      logger.info('Rate limiter closed');
    } catch (error) {
      logger.error('Failed to close rate limiter', error as Error);
    }
  }
}

/**
 * 速率限制服务单例
 */
export const rateLimiter = new RateLimiter();

/**
 * 预定义的速率限制配置
 */
export const RateLimitPresets = {
  // API 请求限制
  api: {
    limit: 100,
    window: 60, // 100 请求/分钟
  },

  // 严格限制
  strict: {
    limit: 10,
    window: 60, // 10 请求/分钟
  },

  // 宽松限制
  loose: {
    limit: 1000,
    window: 60, // 1000 请求/分钟
  },

  // 任务创建限制
  taskCreation: {
    limit: 10,
    window: 3600, // 10 任务/小时
  },

  // LLM 调用限制
  llmCall: {
    limit: 50,
    window: 60, // 50 调用/分钟
  },
};
