# 性能优化指南

**版本**: 1.0
**日期**: 2026-01-19
**所属阶段**: 阶段 4

---

## 📋 目录

- [概述](#概述)
- [缓存优化](#缓存优化)
- [数据库优化](#数据库优化)
- [LLM 调用优化](#llm-调用优化)
- [并发优化](#并发优化)
- [内存优化](#内存优化)
- [网络优化](#网络优化)
- [性能测试](#性能测试)

---

## 概述

### 优化目标

- ✅ 减少响应时间（端到端 < 5分钟）
- ✅ 提高吞吐量（日处理 3000+ 任务）
- ✅ 降低资源使用（内存 < 2GB/Worker）
- ✅ 减少 API 调用成本（Token 使用）

### 性能瓶颈分析

```
典型任务耗时分布（总计 ~120秒）
├── 搜索 (2秒) - 1.7%
├── 整理 (28秒) - 23.3%
├── 写作 (36秒) - 30.0%
├── 质检 (114秒) - 95.0%  ← 主要瓶颈
│   ├── LLM 调用 (100秒)
│   └── 硬规则 (14秒)
└── 图片生成 (未配置)
```

**优化重点**: LLM 调用、缓存策略、并发处理

---

## 缓存优化

### 1. Redis 缓存架构

```typescript
// 文件: src/infrastructure/cache/RedisCache.ts

import Redis from 'ioredis';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('RedisCache');

export class RedisCache {
  private redis: Redis;
  private defaultTTL = 7 * 24 * 3600; // 7天

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get failed', { key, error });
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl || this.defaultTTL;

      await this.redis.setex(key, expiry, serialized);

      logger.debug('Cache set', { key, ttl: expiry });
    } catch (error) {
      logger.error('Cache set failed', { key, error });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      logger.debug('Cache deleted', { key });
    } catch (error) {
      logger.error('Cache delete failed', { key, error });
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
        logger.info('Cache pattern invalidated', { pattern, count: keys.length });
      }
    } catch (error) {
      logger.error('Cache invalidate failed', { pattern, error });
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      const values = await this.redis.mget(...keys);
      return values.map(v => v ? JSON.parse(v) : null);
    } catch (error) {
      logger.error('Cache mget failed', { error });
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs: Record<string, any>, ttl?: number): Promise<void> {
    const pipeline = this.redis.pipeline();
    const expiry = ttl || this.defaultTTL;

    for (const [key, value] of Object.entries(keyValuePairs)) {
      const serialized = JSON.stringify(value);
      pipeline.setex(key, expiry, serialized);
    }

    await pipeline.exec();
  }

  // 缓存统计
  async getStats(pattern: string = 'cache:*'): Promise<CacheStats> {
    const keys = await this.redis.keys(pattern);
    const info = await this.redis.info('stats');

    return {
      totalKeys: keys.length,
      hits: parseInt(info.keyspace_hits || '0'),
      misses: parseInt(info.keyspace_misses || '0'),
      hitRate: (parseInt(info.keyspace_hits || '0') /
              (parseInt(info.keyspace_hits || '0') + parseInt(info.keyspace_misses || '1')))
    };
  }
}
```

### 2. 缓存策略

#### LLM 响应缓存

```typescript
// 缓存 LLM 生成结果
export class LLMCacheService {
  private cache: RedisCache;

  async getCachedResponse(prompt: string): Promise<string | null> {
    const key = this.generateKey('llm', prompt);
    return this.cache.get<string>(key);
  }

  async setCachedResponse(prompt: string, response: string): Promise<void> {
    const key = this.generateKey('llm', prompt);
    await this.cache.set(key, response, 7 * 24 * 3600); // 7天
  }

  private generateKey(prefix: string, content: string): string {
    const hash = crypto.createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 16);
    return `${prefix}:${hash}`;
  }
}
```

#### 搜索结果缓存

```typescript
export class SearchCacheService {
  private cache: RedisCache;

  async getCachedResults(query: string): Promise<SearchResult[] | null> {
    const key = this.generateKey('search', query);
    return this.cache.get<SearchResult[]>(key);
  }

  async setCachedResults(query: string, results: SearchResult[]): Promise<void> {
    const key = this.generateKey('search', query);
    await this.cache.set(key, results, 24 * 3600); // 1天
  }
}
```

#### 质量检查缓存

```typescript
export class QualityCacheService {
  private cache: RedisCache;

  async getCachedEvaluation(content: string): Promise<QualityResult | null> {
    const key = this.generateKey('quality', content);
    return this.cache.get<QualityResult>(key);
  }

  async setCachedEvaluation(content: string, result: QualityResult): Promise<void> {
    const key = this.generateKey('quality', content);
    await this.cache.set(key, result, 3 * 24 * 3600); // 3天
  }
}
```

### 3. 缓存预热

```typescript
// 在应用启动时预热常用数据
export class CacheWarmupService {
  async warmup(): Promise<void> {
    logger.info('Starting cache warmup');

    // 预热常见查询的搜索结果
    const commonQueries = [
      '人工智能',
      '机器学习',
      '深度学习',
      '自然语言处理'
    ];

    for (const query of commonQueries) {
      // 异步预热，不阻塞启动
      this.warmupSearch(query).catch(err => {
        logger.warn('Cache warmup failed', { query, error: err });
      });
    }

    logger.info('Cache warmup completed');
  }

  private async warmupSearch(query: string): Promise<void> {
    const results = await this.searchService.search(query);
    await this.searchCache.setCachedResults(query, results);
  }
}
```

---

## 数据库优化

### 1. 索引优化

```sql
-- 任务表索引
CREATE INDEX idx_tasks_status_created ON tasks(status, created_at DESC);
CREATE INDEX idx_tasks_mode_status ON tasks(mode, status) WHERE status IN ('pending', 'processing');

-- 任务步骤表索引
CREATE INDEX idx_task_steps_task_step_status
ON task_steps(task_id, step_name, status);

-- Token 使用表索引
CREATE INDEX idx_token_usage_task_id ON token_usage(task_id);
CREATE INDEX idx_token_usage_created ON token_usage(created_at DESC);

-- 质量检查表索引
CREATE INDEX idx_quality_checks_task_id ON quality_checks(task_id);
CREATE INDEX idx_quality_checks_score ON quality_checks(score) WHERE score < 7;
```

### 2. 查询优化

```typescript
// 使用连接池
import { Pool } from 'pg';

export class DatabaseService {
  private pool = new Pool({
    host: process.env.POSTGRES_HOST,
    port: parseInt(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD,
    max: 20, // 最大连接数
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // 批量查询
  async getTasksWithSteps(taskIds: string[]): Promise<TaskWithSteps[]> {
    const client = await this.pool.connect();

    try {
      // 使用 IN 子查询避免 N+1 问题
      const query = `
        SELECT
          t.*,
          json_agg(
            json_build_object(
              'step_name', ts.step_name,
              'status', ts.status,
              'started_at', ts.started_at,
              'completed_at', ts.completed_at
            )
          ) as steps
        FROM tasks t
        LEFT JOIN task_steps ts ON t.id = ts.task_id
        WHERE t.id = ANY($1)
        GROUP BY t.id
      `;

      const result = await client.query(query, [taskIds]);
      return result.rows;
    } finally {
      client.release();
    }
  }

  // 分页查询
  async getTasksPaginated(page: number, pageSize: number, filters: any): Promise<PaginatedResult> {
    const offset = (page - 1) * pageSize;
    const limit = pageSize;

    const [tasks, countResult] = await Promise.all([
      this.pool.query(
        'SELECT * FROM tasks WHERE $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [filters.whereClause, limit, offset]
      ),
      this.pool.query(
        'SELECT COUNT(*) FROM tasks WHERE $1',
        [filters.whereClause]
      )
    ]);

    return {
      data: tasks.rows,
      total: parseInt(countResult.rows[0].count),
      page,
      pageSize,
      totalPages: Math.ceil(parseInt(countResult.rows[0].count) / pageSize)
    };
  }
}
```

### 3. 连接池配置

```typescript
// 连接池配置
const poolConfig = {
  // 连接数
  max: 20,                    // 最大连接数
  min: 5,                     // 最小空闲连接数
  idle: 10000,                // 空闲连接超时（10秒）

  // 超时
  connectionTimeoutMillis: 2000, // 连接超时
  idleTimeoutMillis: 30000,      // 空闲超时
  statementTimeout: 30000,       // 查询超时（30秒）

  // 重试
  retries: 3,
};

// 性能监控
pool.on('connect', (client) => {
  logger.info('New DB client connected', { totalCount: pool.totalCount });
});

pool.on('error', (err) => {
  logger.error('DB client error', { error: err });
});

pool.on('remove', () => {
  logger.warn('DB client removed');
});

pool.on('wait', (count) => {
  logger.warn('Waiting for available DB connection', { waitingCount: count });
});
```

---

## LLM 调用优化

### 1. 批量处理

```typescript
// 批量生成多个内容
export class BatchLLMService {
  async generateBatch(prompts: string[]): Promise<string[]> {
    const batchSize = 5; // 每批处理5个
    const results: string[] = [];

    for (let i = 0; i < prompts.length; i += batchSize) {
      const batch = prompts.slice(i, i + batchSize);

      // 并发处理批次
      const batchResults = await Promise.all(
        batch.map(prompt => this.llmService.generate(prompt))
      );

      results.push(...batchResults);

      // 批次间延迟，避免速率限制
      if (i + batchSize < prompts.length) {
        await this.delay(1000); // 等待1秒
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2. Prompt 优化

```typescript
// 优化 Prompt 以减少 Token 使用
export class PromptOptimizer {
  optimizePrompt(prompt: string): string {
    // 移除冗余信息
    let optimized = prompt
      .replace(/\s+/g, ' ')  // 多个空格压缩为一个
      .trim();

    // 使用更简洁的表达
    const replacements = [
      ['请', ''], // 移除礼貌用语
      ['帮助我', ''],
      ['我需要你', ''],
      ['你能', ''],
      ['请生成', '生成'],
      ['请提供', '提供']
    ];

    for (const [from, to] of replacements) {
      optimized = optimized.replace(new RegExp(from, 'g'), to);
    }

    return optimized;
  }

  // 估算 Token 数量
  estimateTokens(text: string): number {
    // 中文约 1.5 字符 = 1 token
    // 英文约 4 字符 = 1 token
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishChars = text.length - chineseChars;

    return Math.ceil(chineseChars / 1.5 + englishChars / 4);
  }
}
```

### 3. 流式响应

```typescript
// 使用流式响应减少首字延迟
export class StreamingLLMService {
  async *generateStream(prompt: string): AsyncGenerator<string> {
    const response = await fetch(this.llmBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        stream: true // 启用流式
      })
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          yield data.choices[0].delta.content;
        }
      }
    }
  }

  // 使用示例
  async generateWithStreaming(prompt: string): Promise<string> {
    let fullResponse = '';

    for await (const chunk of this.generateStream(prompt)) {
      fullResponse += chunk;
      // 实时输出到用户
      process.stdout.write(chunk);
    }

    return fullResponse;
  }
}
```

---

## 并发优化

### 1. Worker 并发控制

```typescript
// 每个 Worker 的并发数配置
export class WorkerConcurrencyManager {
  private concurrency: number;
  private runningTasks = 0;
  private queue: Array<() => Promise<any>> = [];

  constructor(concurrency: number = 2) {
    this.concurrency = concurrency;
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    // 如果已满，等待
    while (this.runningTasks >= this.concurrency) {
      await this.delay(100);
    }

    this.runningTasks++;

    try {
      return await task();
    } finally {
      this.runningTasks--;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

### 2. 任务分片

```typescript
// 将大任务拆分为小任务
export class TaskPartitioner {
  partition(content: string, maxLength: number = 3000): string[] {
    const chunks: string[] = [];
    let currentChunk = '';

    // 按段落分割
    const paragraphs = content.split('\n\n');

    for (const paragraph of paragraphs) {
      if (currentChunk.length + paragraph.length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = paragraph;
      } else {
        currentChunk += '\n\n' + paragraph;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }
}
```

### 3. 并行处理独立任务

```typescript
// 并行处理多个独立的质量检查
export class ParallelQualityChecker {
  async checkParallel(content: string): Promise<CheckResult[]> {
    const checkers = [
      new WordCountChecker(),
      new KeywordChecker(),
      new StructureChecker(),
      new ForbiddenWordsChecker()
    ];

    // 并行执行
    const results = await Promise.all(
      checkers.map(checker =>
        this.executeWithTimeout(checker.check(content), 5000)
      )
    );

    return results;
  }

  private async executeWithTimeout<T>(
    fn: Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);
  }
}
```

---

## 内存优化

### 1. 流式处理

```typescript
// 使用流避免大文件占用内存
import { Readable } from 'stream';

export class StreamingContentProcessor {
  async processLargeContent(stream: Readable): Promise<void> {
    const chunks: Buffer[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);

        // 限制内存使用
        const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
        if (totalSize > 10 * 1024 * 1024) { // 10MB
          stream.pause();
          // 处理已接收的数据
          this.processBatch(chunks);
          chunks.length = 0;
          stream.resume();
        }
      });

      stream.on('end', () => {
        this.processBatch(chunks);
        resolve();
      });

      stream.on('error', reject);
    });
  }

  private processBatch(chunks: Buffer[]): void {
    // 处理数据批次
  }
}
```

### 2. 对象池

```typescript
// 复用昂贵对象
export class ObjectPool<T> {
  private pool: T[] = [];
  private factory: () => T;
  private reset?: (obj: T) => void;

  constructor(factory: () => T, reset?: (obj: T) => void, initialSize = 5) {
    this.factory = factory;
    this.reset = reset;

    for (let i = 0; i < initialSize; i++) {
      this.pool.push(factory());
    }
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.factory();
  }

  release(obj: T): void {
    if (this.reset) {
      this.reset(obj);
    }
    this.pool.push(obj);
  }

  get size(): number {
    return this.pool.length;
  }
}

// 使用示例
const bufferPool = new ObjectPool(
  () => new Buffer(1024 * 1024), // 1MB buffer
  (buf) => buf.fill(0),
  5 // 预创建5个
);
```

---

## 网络优化

### 1. HTTP 连接复用

```typescript
// 使用 HTTP Agent 复用连接
import { Agent } from 'https';

const agent = new Agent({
  keepAlive: true,
  keepAliveMsecs: 60000,
  maxSockets: 100,
  maxFreeSockets: 10,
  timeout: 30000,
});

export class OptimizedHTTPClient {
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    return fetch(url, {
      ...options,
      agent, // 复用连接
    });
  }
}
```

### 2. 请求合并

```typescript
// 合并多个请求
export class RequestBatcher {
  private requests: Map<string, Promise<any>> = new Map();
  private pendingTimer?: NodeJS.Timeout;

  async batchRequest<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // 如果已有相同请求在等待，返回同一个 Promise
    if (this.requests.has(key)) {
      return this.requests.get(key);
    }

    // 创建新请求
    const promise = requestFn().finally(() => {
      this.requests.delete(key);
    });

    this.requests.set(key, promise);

    return promise;
  }

  // 延迟执行批量操作
  scheduleBatch(key: string, fn: () => Promise<void>, delay: number = 100) {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
    }

    this.pendingTimer = setTimeout(async () => {
      await fn();
      this.pendingTimer = undefined;
    }, delay);
  }
}
```

---

## 性能测试

### 1. 基准测试

```typescript
// tests/performance/llm.bench.ts
import { Benchmark } from 'vitest';

describe('LLM Performance Benchmarks', () => {
  Benchmark('LLM generation', async (bench) => {
    const llmService = new LLMService();
    const prompt = '测试提示词';

    await bench('warmup', async () => {
      await llmService.generate(prompt);
    }, { iterations: 10, warmupIterations: 5 });

    await bench('normal', async () => {
      await llmService.generate(prompt);
    }, { iterations: 100 });
  });

  Benchmark('Cache performance', async (bench) => {
    const cache = new RedisCache();

    await bench('set', async () => {
      await cache.set('test-key', { data: 'test' });
    }, { iterations: 1000 });

    await bench('get', async () => {
      await cache.get('test-key');
    }, { iterations: 1000 });
  });
});
```

### 2. 负载测试

```typescript
// tests/performance/load.test.ts
import { describe, it } from 'vitest';

describe('Load Tests', () => {
  it('should handle 100 concurrent tasks', async () => {
    const tasks = Array(100).fill(null).map((_, i) => ({
      mode: 'async',
      topic: `测试任务 ${i}`,
      requirements: '测试描述',
    }));

    const startTime = Date.now();

    const results = await Promise.all(
      tasks.map(task => scheduler.scheduleTask(task))
    );

    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(5000); // 5秒内完成
    expect(results).toHaveLength(100);
  });
});
```

### 3. 性能分析

```typescript
// 使用 Node.js profiler
import { performance } from 'perf_hooks';

export class PerformanceProfiler {
  startProfiling(id: string) {
    performance.mark(`${id}-start`);
  }

  endProfiling(id: string): number {
    performance.mark(`${id}-end`);
    performance.measure(id, `${id}-start`, `${id}-end`);

    const measure = performance.getEntriesByName(id)[0];
    return measure.duration;
  }

  // 分析内存使用
  getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  // GC 触发
  forceGC() {
    if (global.gc) {
      global.gc();
    }
  }
}

// 使用示例
const profiler = new PerformanceProfiler();

profiler.startProfiling('task-processing');
await processTask();
const duration = profiler.endProfiling('task-processing');
console.log(`Task took ${duration}ms`);

// 内存分析
const memBefore = profiler.getMemoryUsage();
// ... 执行操作
profiler.forceGC();
const memAfter = profiler.getMemoryUsage();
console.log(`Memory delta: ${memAfter.heapUsed - memBefore.heapUsed} bytes`);
```

---

## 性能指标

### 目标指标

| 指标 | 当前 | 目标 | 方法 |
|------|------|------|------|
| 单任务延迟 | ~120秒 | <90秒 | LLM缓存、并行处理 |
| 并发任务数 | 2 | 10 | 增加Worker并发 |
| 内存占用 | 未知 | <2GB | 流式处理、对象池 |
| 缓存命中率 | 0% | >60% | 多级缓存 |
| API 调用次数 | 未知 | -30% | 结果缓存、Prompt优化 |

### 监控指标

```typescript
// Prometheus 指标
const performanceMetrics = {
  // 响应时间
  taskDuration_p99: 300,      // 99分位 < 5分钟
  llmRequestDuration_p95: 60,  // 95分位 < 1分钟

  // 吞吐量
  tasksPerMinute: 5,          // 5个任务/分钟
  tasksPerDay: 7200,          // 7200个任务/天（理论值）

  // 缓存
  cacheHitRate_llm: 0.4,      // LLM缓存命中率 > 40%
  cacheHitRate_search: 0.6,   // 搜索缓存命中率 > 60%

  // 资源
  memoryUsage_heapUsed: 1024 * 1024 * 1024, // < 1GB
  cpuUsage_percent: 70,                    // < 70%
};
```

---

**文档生成时间**: 2026-01-19
**版本**: 1.0
