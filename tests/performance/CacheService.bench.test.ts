/**
 * CacheService 性能基准测试
 *
 * 测试缓存服务在各种负载下的性能表现
 * 运行方式: pnpm test CacheService.bench.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CacheService } from '../../src/infrastructure/cache/CacheService.js';
import { performanceFixtures } from '../fixtures/common-fixtures.js';

describe('@performance CacheService Benchmarks', () => {
  let cacheService: CacheService;

  beforeAll(async () => {
    cacheService = new CacheService({ prefix: 'bench', ttl: 60 });
    await cacheService.initialize?.();
  });

  afterAll(async () => {
    await cacheService.close();
  });

  describe('Single Operation Performance', () => {
    it('should complete 1000 SET operations in < 50 seconds', async () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        await cacheService.set(`key${i}`, `value${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50000);

      console.log(`✅ 1000 SET operations: ${duration}ms (${(duration / 1000).toFixed(2)}ms/op)`);
    });

    it('should complete 1000 GET operations in < 50 seconds', async () => {
      // 先设置数据
      for (let i = 0; i < 1000; i++) {
        await cacheService.set(`key${i}`, `value${i}`);
      }

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        await cacheService.get(`key${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50000);

      console.log(`✅ 1000 GET operations: ${duration}ms (${(duration / 1000).toFixed(2)}ms/op)`);
    });

    it('should complete 1000 DELETE operations in < 50 seconds', async () => {
      // 先设置数据
      for (let i = 0; i < 1000; i++) {
        await cacheService.set(`key${i}`, `value${i}`);
      }

      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        await cacheService.delete(`key${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50000);

      console.log(`✅ 1000 DELETE operations: ${duration}ms (${(duration / 1000).toFixed(2)}ms/op)`);
    });
  });

  describe('Batch Operation Performance', () => {
    it('should complete batch SET of 100 items in < 5000ms', async () => {
      const items = new Map(
        Array.from({ length: 100 }, (_, i) => [`batch-key${i}`, `batch-value${i}`])
      );

      const start = Date.now();
      await cacheService.setMany(items);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
      console.log(`✅ Batch SET 100 items: ${duration}ms (${(duration / 100).toFixed(2)}ms/item)`);
    });

    it('should complete batch GET of 100 items in < 5000ms', async () => {
      const keys = Array.from({ length: 100 }, (_, i) => `batch-key${i}`);

      const start = Date.now();
      await cacheService.getMany(keys);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(5000);
      console.log(`✅ Batch GET 100 items: ${duration}ms (${(duration / 100).toFixed(2)}ms/item)`);
    });
  });

  describe('Concurrent Operation Performance', () => {
    it('should handle 100 concurrent SET operations in < 10000ms', async () => {
      const start = Date.now();

      const promises = Array.from({ length: 100 }, (_, i) =>
        cacheService.set(`concurrent-key${i}`, `concurrent-value${i}`)
      );

      await Promise.all(promises);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10000);

      console.log(`✅ 100 concurrent SET: ${duration}ms`);
    });

    it('should handle 100 concurrent GET operations in < 10000ms', async () => {
      // 先设置数据
      for (let i = 0; i < 100; i++) {
        await cacheService.set(`concurrent-get-key${i}`, `value${i}`);
      }

      const start = Date.now();

      const promises = Array.from({ length: 100 }, (_, i) =>
        cacheService.get(`concurrent-get-key${i}`)
      );

      await Promise.all(promises);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10000);

      console.log(`✅ 100 concurrent GET: ${duration}ms`);
    });

    it('should handle mixed concurrent operations in < 20000ms', async () => {
      const start = Date.now();

      const promises = [];

      // 50 SET operations
      for (let i = 0; i < 50; i++) {
        promises.push(cacheService.set(`mixed-key${i}`, `value${i}`));
      }

      // 50 GET operations
      for (let i = 0; i < 50; i++) {
        promises.push(cacheService.get(`mixed-key${i}`));
      }

      await Promise.all(promises);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(20000);

      console.log(`✅ 100 mixed concurrent operations: ${duration}ms`);
    });
  });

  describe('Data Size Performance', () => {
    it('should handle small data (1KB) efficiently', async () => {
      const smallData = 'x'.repeat(1024);
      const iterations = 100;

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await cacheService.set(`small-${i}`, smallData);
        await cacheService.get(`small-${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(10000);

      console.log(`✅ ${iterations} small data (1KB) operations: ${duration}ms`);
    });

    it('should handle medium data (100KB) efficiently', async () => {
      const mediumData = 'x'.repeat(100 * 1024);
      const iterations = 50;

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await cacheService.set(`medium-${i}`, mediumData);
        await cacheService.get(`medium-${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(20000);

      console.log(`✅ ${iterations} medium data (100KB) operations: ${duration}ms`);
    });

    it('should handle large data (1MB) without excessive slowdown', async () => {
      const largeData = 'x'.repeat(1024 * 1024);
      const iterations = 10;

      const start = Date.now();

      for (let i = 0; i < iterations; i++) {
        await cacheService.set(`large-${i}`, largeData);
        await cacheService.get(`large-${i}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(35000);

      console.log(`✅ ${iterations} large data (1MB) operations: ${duration}ms`);
    });
  });

  describe('Memory Efficiency', () => {
    it('should maintain stable memory usage with 1000 operations', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // 执行大量操作
      for (let i = 0; i < 1000; i++) {
        await cacheService.set(`mem-test-${i}`, { data: 'x'.repeat(100) });
        await cacheService.get(`mem-test-${i}`);
        if (i % 100 === 0) {
          await cacheService.delete(`mem-test-${i}`);
        }
      }

      // 强制垃圾回收 (如果可用)
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      // 内存增长应该小于 50MB
      expect(memoryIncrease).toBeLessThan(50);

      console.log(`✅ Memory increase after 1000 operations: ${memoryIncrease.toFixed(2)}MB`);
    });
  });

  describe('Cache Hit Rate Performance', () => {
    it('should demonstrate > 90% hit rate with proper caching strategy', async () => {
      const totalRequests = 1000;
      const uniqueKeys = 100;

      // 设置初始缓存
      for (let i = 0; i < uniqueKeys; i++) {
        await cacheService.set(`hit-rate-${i}`, `value-${i}`);
      }

      let hits = 0;
      const start = Date.now();

      // 执行请求 (大部分会命中)
      for (let i = 0; i < totalRequests; i++) {
        const key = `hit-rate-${i % uniqueKeys}`;
        const result = await cacheService.get(key);
        if (result) hits++;
      }

      const duration = Date.now() - start;
      const hitRate = (hits / totalRequests) * 100;

      expect(hitRate).toBeGreaterThan(90);
      expect(duration).toBeLessThan(50000);

      console.log(`✅ Hit rate: ${hitRate.toFixed(2)}%, Duration: ${duration}ms`);
    });
  });
});
