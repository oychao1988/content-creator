/**
 * RateLimiter 测试
 *
 * 测试速率限制服务的各项功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RateLimiter } from '../../src/infrastructure/security/RateLimiter.js';

// Mock Redis
vi.mock('ioredis');

// Mock redisClient
const mockRedisInstance = {
  zremrangebyscore: vi.fn(),
  zadd: vi.fn(),
  expire: vi.fn(),
  zcard: vi.fn(),
  zrange: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  incr: vi.fn(),
  keys: vi.fn(),
  del: vi.fn(),
  ping: vi.fn(),
  quit: vi.fn(),
  pipeline: vi.fn(() => ({
    zremrangebyscore: vi.fn(),
    zadd: vi.fn(),
    expire: vi.fn(),
    zcard: vi.fn(),
    exec: vi.fn().mockResolvedValue([]),
  })),
};

vi.mock('../../src/infrastructure/redis/connection.js', () => ({
  redisClient: {
    getClient: vi.fn(() => Promise.resolve(mockRedisInstance)),
  },
}));

// Mock logger
vi.mock('../../src/infrastructure/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock MetricsService
vi.mock('../../src/infrastructure/monitoring/MetricsService.js', () => ({
  metricsService: {
    recordCacheHit: vi.fn(),
    recordCacheMiss: vi.fn(),
  },
}));

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    vi.clearAllMocks();
    rateLimiter = new RateLimiter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('滑动窗口速率限制', () => {
    it('应该在限制内允许请求', async () => {
      // Mock pipeline.exec() 返回格式: [[err, result], ...]
      // [2][1] 是第3个操作(zcard)的结果
      const mockPipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1], // zremrangebyscore result
          [null, 1], // zadd result
          [null, 5], // zcard result - 当前窗口内有 5 个请求
        ]),
      };
      mockRedisInstance.pipeline.mockReturnValue(mockPipeline as any);

      const result = await rateLimiter.slidingWindow('user-123', { limit: 10, window: 60 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5); // 10 - 5
      expect(result.limit).toBe(10);
    });

    it('应该在超出限制时拒绝请求', async () => {
      const mockPipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1],
          [null, 1],
          [null, 15], // zcard result - 超过限制
        ]),
      };
      mockRedisInstance.pipeline.mockReturnValue(mockPipeline as any);

      // Mock zrange 返回最早的时间戳
      const now = Date.now();
      mockRedisInstance.zrange.mockResolvedValue([
        `${now - 5000}:0.5`, // 5秒前的请求
        String(now - 5000),  // 时间戳
      ]);

      const result = await rateLimiter.slidingWindow('user-123', { limit: 10, window: 60 });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });

    it('应该在错误时默认允许请求', async () => {
      mockRedisInstance.pipeline.mockImplementation(() => {
        throw new Error('Redis error');
      });

      const result = await rateLimiter.slidingWindow('user-123', { limit: 10, window: 60 });

      expect(result.allowed).toBe(true);
    });
  });

  describe('令牌桶速率限制', () => {
    it('应该在有令牌时允许请求', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ tokens: 5, lastRefill: Date.now() }));

      const result = await rateLimiter.tokenBucket('user-123', { limit: 10, window: 60, burst: 10 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeGreaterThanOrEqual(0);
    });

    it('应该在没有令牌时拒绝请求', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ tokens: 0, lastRefill: Date.now() }));

      const result = await rateLimiter.tokenBucket('user-123', { limit: 10, window: 60, burst: 10 });

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeDefined();
    });

    it('应该在首次使用时使用突发容量', async () => {
      mockRedisInstance.get.mockResolvedValue(null);
      mockRedisInstance.set.mockResolvedValue('OK');

      const result = await rateLimiter.tokenBucket('user-123', { limit: 10, window: 60, burst: 10 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9); // burst 10 - 1
    });

    it('应该在错误时默认允许请求', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('Redis error'));

      const result = await rateLimiter.tokenBucket('user-123', { limit: 10, window: 60, burst: 10 });

      expect(result.allowed).toBe(true);
    });
  });

  describe('固定窗口速率限制', () => {
    it('应该在限制内允许请求', async () => {
      mockRedisInstance.incr.mockResolvedValue(5);

      const result = await rateLimiter.fixedWindow('user-123', { limit: 10, window: 60 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5); // 10 - 5
    });

    it('应该在超出限制时拒绝请求', async () => {
      mockRedisInstance.incr.mockResolvedValue(15);

      const result = await rateLimiter.fixedWindow('user-123', { limit: 10, window: 60 });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
    });

    it('应该在错误时默认允许请求', async () => {
      mockRedisInstance.incr.mockRejectedValue(new Error('Redis error'));

      const result = await rateLimiter.fixedWindow('user-123', { limit: 10, window: 60 });

      expect(result.allowed).toBe(true);
    });
  });

  describe('通用速率限制检查', () => {
    it('应该支持滑动窗口类型', async () => {
      mockRedisInstance.zcard.mockResolvedValue(5);

      const result = await rateLimiter.checkLimit('user-123', { limit: 10, window: 60 }, 'sliding-window');

      expect(result.allowed).toBe(true);
    });

    it('应该支持令牌桶类型', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ tokens: 5, lastRefill: Date.now() }));

      const result = await rateLimiter.checkLimit('user-123', { limit: 10, window: 60, burst: 10 }, 'token-bucket');

      expect(result.allowed).toBe(true);
    });

    it('应该支持固定窗口类型', async () => {
      mockRedisInstance.incr.mockResolvedValue(5);

      const result = await rateLimiter.checkLimit('user-123', { limit: 10, window: 60 }, 'fixed-window');

      expect(result.allowed).toBe(true);
    });

    it('应该拒绝未知类型', async () => {
      await expect(
        rateLimiter.checkLimit('user-123', { limit: 10, window: 60 }, 'unknown' as any)
      ).rejects.toThrow('Unknown rate limiter type');
    });
  });

  describe('重置速率限制', () => {
    it('应该成功重置滑动窗口限制', async () => {
      mockRedisInstance.keys.mockResolvedValue(['ratelimit:sliding:user-123:key1']);
      mockRedisInstance.del.mockResolvedValue(1);

      await expect(rateLimiter.resetLimit('user-123', 'sliding-window')).resolves.not.toThrow();
    });

    it('应该成功重置令牌桶限制', async () => {
      mockRedisInstance.keys.mockResolvedValue(['ratelimit:tokenbucket:user-123:key1']);
      mockRedisInstance.del.mockResolvedValue(1);

      await expect(rateLimiter.resetLimit('user-123', 'token-bucket')).resolves.not.toThrow();
    });

    it('应该在错误时不抛出异常', async () => {
      mockRedisInstance.keys.mockRejectedValue(new Error('Redis error'));

      await expect(rateLimiter.resetLimit('user-123')).resolves.not.toThrow();
    });
  });

  describe('获取速率限制状态', () => {
    it('应该获取滑动窗口状态', async () => {
      mockRedisInstance.zcard.mockResolvedValue(5);

      const status = await rateLimiter.getStatus('user-123', 'sliding-window');

      expect(status).not.toBeNull();
      expect(status?.count).toBe(5);
    });

    it('应该获取令牌桶状态', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ tokens: 5, lastRefill: Date.now() }));

      const status = await rateLimiter.getStatus('user-123', 'token-bucket');

      expect(status).not.toBeNull();
      expect(status?.count).toBe(5);
    });

    it('应该在没有数据时返回 null', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const status = await rateLimiter.getStatus('user-123', 'token-bucket');

      expect(status).toBeNull();
    });

    it('应该在错误时返回 null', async () => {
      mockRedisInstance.zcard.mockRejectedValue(new Error('Redis error'));

      const status = await rateLimiter.getStatus('user-123', 'sliding-window');

      expect(status).toBeNull();
    });
  });

  describe('健康检查', () => {
    it('应该在 Redis 正常时返回 true', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      const result = await rateLimiter.healthCheck();

      expect(result).toBe(true);
    });

    it('应该在 Redis 错误时返回 false', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Redis connection failed'));

      const result = await rateLimiter.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('关闭连接', () => {
    it('应该正常关闭连接', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');

      await expect(rateLimiter.close()).resolves.not.toThrow();
    });

    it('应该在错误时不抛出异常', async () => {
      mockRedisInstance.quit.mockRejectedValue(new Error('Already closed'));

      await expect(rateLimiter.close()).resolves.not.toThrow();
    });
  });

  describe('边界情况', () => {
    it('应该处理零限制', async () => {
      mockRedisInstance.zcard.mockResolvedValue(0);

      const result = await rateLimiter.slidingWindow('user-123', { limit: 0, window: 60 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
    });

    it('应该处理零窗口时间', async () => {
      mockRedisInstance.incr.mockResolvedValue(1);

      const result = await rateLimiter.fixedWindow('user-123', { limit: 10, window: 0 });

      expect(result).toBeDefined();
    });

    it('应该处理大限制值', async () => {
      const mockPipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1],
          [null, 1],
          [null, 1000], // 当前窗口内有 1000 个请求
        ]),
      };
      mockRedisInstance.pipeline.mockReturnValue(mockPipeline as any);

      const result = await rateLimiter.slidingWindow('user-123', { limit: 10000, window: 60 });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9000); // 10000 - 1000
    });
  });

  describe('并发安全', () => {
    it('应该处理并发的速率限制检查', async () => {
      const mockPipeline = {
        zremrangebyscore: vi.fn().mockReturnThis(),
        zadd: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        zcard: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([
          [null, 1],
          [null, 1],
          [null, 5], // 当前窗口内有 5 个请求
        ]),
      };
      mockRedisInstance.pipeline.mockReturnValue(mockPipeline as any);

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(rateLimiter.slidingWindow('user-123', { limit: 100, window: 60 }));
      }

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toHaveProperty('allowed');
        expect(typeof result.allowed).toBe('boolean');
      });
    });

    it('应该处理并发的令牌桶请求', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify({ tokens: 50, lastRefill: Date.now() }));
      mockRedisInstance.set.mockResolvedValue('OK');

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(rateLimiter.tokenBucket('user-123', { limit: 10, window: 60, burst: 50 }));
      }

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toHaveProperty('allowed');
      });
    });
  });
});
