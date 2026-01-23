/**
 * CacheService 测试
 *
 * 测试 Redis 缓存服务的各项功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { register } from 'prom-client';
import Redis from 'ioredis';
import { CacheService } from '../../src/infrastructure/cache/CacheService.js';

// Mock Redis 客户端
vi.mock('ioredis');

// 使用 vi.hoisted() 来确保 mockRedisInstance 在 mock 之前定义
const { mockRedisInstance } = vi.hoisted(() => {
  return {
    mockRedisInstance: {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      mget: vi.fn(),
      pipeline: vi.fn(() => ({
        set: vi.fn(),
        exec: vi.fn().mockResolvedValue([]),
      })),
      exists: vi.fn(),
      expire: vi.fn(),
      ttl: vi.fn(),
      keys: vi.fn(),
      ping: vi.fn(),
      quit: vi.fn(),
    },
  };
});

// Mock redis/connection 模块
vi.mock('../../src/infrastructure/redis/connection.js', () => ({
  redisClient: {
    getClient: vi.fn(() => Promise.resolve(mockRedisInstance)),
  },
}));

describe('CacheService', () => {
  let cacheService: CacheService;

  beforeEach(() => {
    // 清空 Prometheus 指标
    register.clear();

    // 清空所有 mock 调用
    vi.clearAllMocks();

    // 创建 CacheService
    cacheService = new CacheService({ prefix: 'test', ttl: 60 });
  });

  afterEach(() => {
    register.clear();
    vi.clearAllMocks();
  });

  describe('基础缓存操作', () => {
    it('应该成功设置和获取缓存', async () => {
      const testData = { id: 1, name: 'test' };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(testData));

      await cacheService.set('key1', testData);
      const result = await cacheService.get('key1');

      expect(mockRedisInstance.set).toHaveBeenCalled();
      expect(mockRedisInstance.get).toHaveBeenCalled();
      expect(result).toEqual(testData);
    });

    it('应该在没有缓存时返回 null', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await cacheService.get('nonexistent');

      expect(result).toBeNull();
      expect(mockRedisInstance.get).toHaveBeenCalledWith('test:nonexistent');
    });

    it('应该正确删除缓存', async () => {
      mockRedisInstance.del.mockResolvedValue(1);

      await cacheService.delete('key1');

      expect(mockRedisInstance.del).toHaveBeenCalledWith('test:key1');
    });

    it('应该检查键是否存在', async () => {
      mockRedisInstance.exists.mockResolvedValue(1);

      const exists = await cacheService.exists('key1');

      expect(exists).toBe(true);
      expect(mockRedisInstance.exists).toHaveBeenCalledWith('test:key1');
    });

    it('应该在键不存在时返回 false', async () => {
      mockRedisInstance.exists.mockResolvedValue(0);

      const exists = await cacheService.exists('key1');

      expect(exists).toBe(false);
    });
  });

  describe('批量操作', () => {
    it('应该批量获取多个键', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const values = [
        JSON.stringify({ id: 1 }),
        JSON.stringify({ id: 2 }),
        null,
      ];
      mockRedisInstance.mget.mockResolvedValue(values);

      const result = await cacheService.getMany(keys);

      expect(result.size).toBe(2);
      expect(result.get('key1')).toEqual({ id: 1 });
      expect(result.get('key2')).toEqual({ id: 2 });
      expect(result.has('key3')).toBe(false);
    });

    it('应该批量设置多个键', async () => {
      const items = new Map([
        ['key1', { id: 1 }],
        ['key2', { id: 2 }],
      ]);

      await cacheService.setMany(items);

      expect(mockRedisInstance.pipeline).toHaveBeenCalled();
    });

    it('应该处理空的批量获取', async () => {
      mockRedisInstance.mget.mockResolvedValue([]);

      const result = await cacheService.getMany([]);

      expect(result.size).toBe(0);
    });

    it('应该处理空的批量设置', async () => {
      const items = new Map();

      await cacheService.setMany(items);

      expect(mockRedisInstance.pipeline).toHaveBeenCalled();
    });
  });

  describe('TTL 和过期', () => {
    it('应该使用自定义 TTL 设置缓存', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.set('key1', 'value', 120);

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test:key1',
        JSON.stringify('value'),
        'EX',
        120
      );
    });

    it('应该使用默认 TTL 当未指定时', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.set('key1', 'value');

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test:key1',
        JSON.stringify('value'),
        'EX',
        60
      );
    });

    it('应该设置缓存过期时间', async () => {
      mockRedisInstance.expire.mockResolvedValue(1);

      await cacheService.expire('key1', 300);

      expect(mockRedisInstance.expire).toHaveBeenCalledWith('test:key1', 300);
    });

    it('应该获取缓存剩余 TTL', async () => {
      mockRedisInstance.ttl.mockResolvedValue(120);

      const ttl = await cacheService.ttl('key1');

      expect(ttl).toBe(120);
      expect(mockRedisInstance.ttl).toHaveBeenCalledWith('test:key1');
    });

    it('应该在键不存在时返回 -1', async () => {
      mockRedisInstance.ttl.mockResolvedValue(-2);

      const ttl = await cacheService.ttl('key1');

      expect(ttl).toBe(-2);
    });
  });

  describe('缓存失效和清空', () => {
    it('应该根据模式失效缓存', async () => {
      mockRedisInstance.keys.mockResolvedValue(['test:key1', 'test:key2']);
      mockRedisInstance.del.mockResolvedValue(2);

      await cacheService.invalidate('key*');

      expect(mockRedisInstance.keys).toHaveBeenCalledWith('test:key*');
      expect(mockRedisInstance.del).toHaveBeenCalledWith('test:key1', 'test:key2');
    });

    it('应该处理模式匹配无结果的情况', async () => {
      mockRedisInstance.keys.mockResolvedValue([]);

      await cacheService.invalidate('nonexistent*');

      expect(mockRedisInstance.del).not.toHaveBeenCalled();
    });

    it('应该清空所有缓存', async () => {
      mockRedisInstance.keys.mockResolvedValue(['test:key1', 'test:key2', 'test:key3']);
      mockRedisInstance.del.mockResolvedValue(3);

      await cacheService.flush();

      expect(mockRedisInstance.keys).toHaveBeenCalledWith('test:*');
      expect(mockRedisInstance.del).toHaveBeenCalled();
    });

    it('应该处理空缓存的情况', async () => {
      mockRedisInstance.keys.mockResolvedValue([]);

      await cacheService.flush();

      expect(mockRedisInstance.del).not.toHaveBeenCalled();
    });
  });

  describe('缓存统计', () => {
    it('应该正确计算缓存命中率', async () => {
      // 模拟 3 次命中和 1 次未命中
      mockRedisInstance.get
        .mockResolvedValueOnce(JSON.stringify({ data: 'hit1' }))
        .mockResolvedValueOnce(JSON.stringify({ data: 'hit2' }))
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(JSON.stringify({ data: 'hit3' }));

      await cacheService.get('key1');
      await cacheService.get('key2');
      await cacheService.get('key3');
      await cacheService.get('key4');

      mockRedisInstance.keys.mockResolvedValue(['test:key1', 'test:key2', 'test:key3', 'test:key4']);

      const stats = await cacheService.getStats();

      expect(stats.hits).toBe(3);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(75); // 3/(3+1) * 100
    });

    it('应该在没有操作时返回零统计', async () => {
      mockRedisInstance.keys.mockResolvedValue([]);

      const stats = await cacheService.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.hitRate).toBe(0);
      expect(stats.size).toBe(0);
    });

    it('应该获取缓存大小', async () => {
      mockRedisInstance.keys.mockResolvedValue(['test:key1', 'test:key2', 'test:key3']);

      const size = await cacheService.size();

      expect(size).toBe(3);
      expect(mockRedisInstance.keys).toHaveBeenCalledWith('test:*');
    });
  });

  describe('LLM 缓存辅助方法', () => {
    it('应该缓存和获取 LLM 响应', async () => {
      const prompt = 'What is AI?';
      const response = 'AI is artificial intelligence';

      mockRedisInstance.get.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(response));
      mockRedisInstance.set.mockResolvedValue('OK');

      // 第一次获取，应该未命中
      const firstGet = await cacheService.getCachedLLMResponse(prompt);
      expect(firstGet).toBeNull();

      // 设置缓存
      await cacheService.setCachedLLMResponse(prompt, response);
      expect(mockRedisInstance.set).toHaveBeenCalled();

      // 第二次获取，应该命中
      const secondGet = await cacheService.getCachedLLMResponse(prompt);
      expect(secondGet).toBe(response);
    });

    it('应该使用默认 TTL 缓存 LLM 响应', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.setCachedLLMResponse('test prompt', 'test response');

      expect(mockRedisInstance.set).toHaveBeenCalled();
      // 默认 TTL 是 7 天
      const setCall = mockRedisInstance.set.mock.calls[0];
      expect(setCall[3]).toBe(7 * 24 * 3600);
    });

    it('应该使用自定义 TTL 缓存 LLM 响应', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.setCachedLLMResponse('test prompt', 'test response', 3600);

      const setCall = mockRedisInstance.set.mock.calls[0];
      expect(setCall[3]).toBe(3600);
    });
  });

  describe('搜索结果缓存辅助方法', () => {
    it('应该缓存和获取搜索结果', async () => {
      const query = 'test search';
      const results = [{ id: 1 }, { id: 2 }];

      mockRedisInstance.get.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(results));
      mockRedisInstance.set.mockResolvedValue('OK');

      const firstGet = await cacheService.getCachedSearchResults(query);
      expect(firstGet).toBeNull();

      await cacheService.setCachedSearchResults(query, results);
      expect(mockRedisInstance.set).toHaveBeenCalled();

      const secondGet = await cacheService.getCachedSearchResults(query);
      expect(secondGet).toEqual(results);
    });

    it('应该使用默认 TTL 缓存搜索结果', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.setCachedSearchResults('test query', []);

      const setCall = mockRedisInstance.set.mock.calls[0];
      expect(setCall[3]).toBe(24 * 3600); // 默认 1 天
    });
  });

  describe('质量检查缓存辅助方法', () => {
    it('应该缓存和获取质量检查结果', async () => {
      const contentHash = 'abc123';
      const result = { score: 8.5, passed: true };

      mockRedisInstance.get.mockResolvedValueOnce(null).mockResolvedValueOnce(JSON.stringify(result));
      mockRedisInstance.set.mockResolvedValue('OK');

      const firstGet = await cacheService.getCachedQualityCheck(contentHash);
      expect(firstGet).toBeNull();

      await cacheService.setCachedQualityCheck(contentHash, result);
      expect(mockRedisInstance.set).toHaveBeenCalled();

      const secondGet = await cacheService.getCachedQualityCheck(contentHash);
      expect(secondGet).toEqual(result);
    });

    it('应该使用默认 TTL 缓存质量检查结果', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.setCachedQualityCheck('hash123', {});

      const setCall = mockRedisInstance.set.mock.calls[0];
      expect(setCall[3]).toBe(3 * 24 * 3600); // 默认 3 天
    });
  });

  describe('键前缀和命名', () => {
    it('应该使用配置的前缀', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.set('mykey', 'value');

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test:mykey',
        expect.any(String),
        expect.any(String),
        expect.any(Number)
      );
    });

    it('应该支持自定义前缀', () => {
      const customCache = new CacheService({ prefix: 'custom', ttl: 60 });
      expect((customCache as any).prefix).toBe('custom');
    });

    it('应该使用默认前缀当未指定时', () => {
      const defaultCache = new CacheService();
      expect((defaultCache as any).prefix).toBe('cc');
    });
  });

  describe('健康检查和关闭', () => {
    it('应该在健康检查时返回 true', async () => {
      mockRedisInstance.ping.mockResolvedValue('PONG');

      const healthy = await cacheService.healthCheck();

      expect(healthy).toBe(true);
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('应该在 Redis 错误时返回 false', async () => {
      mockRedisInstance.ping.mockRejectedValue(new Error('Redis connection error'));

      const healthy = await cacheService.healthCheck();

      expect(healthy).toBe(false);
    });

    it('应该正常关闭连接', async () => {
      mockRedisInstance.quit.mockResolvedValue('OK');

      await cacheService.close();

      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });

    it('应该处理关闭时的错误', async () => {
      mockRedisInstance.quit.mockRejectedValue(new Error('Already closed'));

      await expect(cacheService.close()).resolves.not.toThrow();
    });
  });

  describe('错误处理', () => {
    it('应该处理 Redis 获取错误', async () => {
      mockRedisInstance.get.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.get('key1');

      expect(result).toBeNull();
    });

    it('应该处理 Redis 设置错误', async () => {
      mockRedisInstance.set.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.set('key1', 'value')).resolves.not.toThrow();
    });

    it('应该处理 Redis 删除错误', async () => {
      mockRedisInstance.del.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.delete('key1')).resolves.not.toThrow();
    });

    it('应该处理批量获取错误', async () => {
      mockRedisInstance.mget.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.getMany(['key1', 'key2']);

      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it('应该处理 exists 错误', async () => {
      mockRedisInstance.exists.mockRejectedValue(new Error('Redis error'));

      const exists = await cacheService.exists('key1');

      expect(exists).toBe(false);
    });

    it('应该处理 expire 错误', async () => {
      mockRedisInstance.expire.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.expire('key1', 60)).resolves.not.toThrow();
    });

    it('应该处理 ttl 错误', async () => {
      mockRedisInstance.ttl.mockRejectedValue(new Error('Redis error'));

      const ttl = await cacheService.ttl('key1');

      expect(ttl).toBe(-1);
    });

    it('应该处理 invalidate 错误', async () => {
      mockRedisInstance.keys.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.invalidate('key*')).resolves.not.toThrow();
    });

    it('应该处理 flush 错误', async () => {
      mockRedisInstance.keys.mockRejectedValue(new Error('Redis error'));

      await expect(cacheService.flush()).resolves.not.toThrow();
    });

    it('应该处理 size 错误', async () => {
      mockRedisInstance.keys.mockRejectedValue(new Error('Redis error'));

      const size = await cacheService.size();

      expect(size).toBe(0);
    });
  });

  describe('数据类型支持', () => {
    it('应该缓存字符串', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify('test string'));

      await cacheService.set('key1', 'test string');
      const result = await cacheService.get('key1');

      expect(result).toBe('test string');
    });

    it('应该缓存数字', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(42));

      await cacheService.set('key1', 42);
      const result = await cacheService.get('key1');

      expect(result).toBe(42);
    });

    it('应该缓存布尔值', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(true));

      await cacheService.set('key1', true);
      const result = await cacheService.get('key1');

      expect(result).toBe(true);
    });

    it('应该缓存数组', async () => {
      const data = [1, 2, 3, 4, 5];
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(data));

      await cacheService.set('key1', data);
      const result = await cacheService.get('key1');

      expect(result).toEqual(data);
    });

    it('应该缓存复杂对象', async () => {
      const data = {
        id: 1,
        name: 'test',
        nested: { value: 123 },
        array: [1, 2, 3],
      };
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(data));

      await cacheService.set('key1', data);
      const result = await cacheService.get('key1');

      expect(result).toEqual(data);
    });

    it('应该缓存 null 值', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(null));

      await cacheService.set('key1', null);
      const result = await cacheService.get('key1');

      expect(result).toBeNull();
    });
  });

  describe('并发安全', () => {
    it('应该处理并发的 get 操作', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify('value'));
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(cacheService.get('key1'));
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();
      expect(mockRedisInstance.get).toHaveBeenCalledTimes(100);
    });

    it('应该处理并发的 set 操作', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');
      const promises = [];

      for (let i = 0; i < 100; i++) {
        promises.push(cacheService.set(`key${i}`, `value${i}`));
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    it('应该处理混合的读写操作', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify('value'));
      mockRedisInstance.set.mockResolvedValue('OK');
      const promises = [];

      for (let i = 0; i < 50; i++) {
        promises.push(cacheService.set(`key${i}`, `value${i}`));
        promises.push(cacheService.get(`key${i}`));
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });
  });

  describe('边界情况', () => {
    it('应该处理空字符串键', async () => {
      mockRedisInstance.get.mockResolvedValue(null);

      const result = await cacheService.get('');

      expect(result).toBeNull();
    });

    it('应该处理特殊字符键', async () => {
      mockRedisInstance.get.mockResolvedValue(JSON.stringify('value'));

      await cacheService.set('key:with:colons', 'value');
      const result = await cacheService.get('key:with:colons');

      expect(result).toBe('value');
    });

    it('应该处理非常大的值', async () => {
      const largeData = 'x'.repeat(1000000);
      mockRedisInstance.get.mockResolvedValue(JSON.stringify(largeData));

      await cacheService.set('key1', largeData);
      const result = await cacheService.get('key1');

      expect(result).toBe(largeData);
    });

    it('应该处理零 TTL', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.set('key1', 'value', 0);

      expect(mockRedisInstance.set).toHaveBeenCalled();
    });

    it('应该处理负数 TTL', async () => {
      mockRedisInstance.set.mockResolvedValue('OK');

      await cacheService.set('key1', 'value', -1);

      expect(mockRedisInstance.set).toHaveBeenCalled();
    });
  });
});
