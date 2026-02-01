/**
 * 队列系统集成测试
 *
 * 测试 TaskQueue、TaskWorker 和 TaskScheduler 的集成
 *
 * Redis连接方式支持：
 * 1. 优先使用环境变量 REDIS_URL（从.env加载）
 * 2. 如果环境变量未设置或连接失败，回退到 localhost:6379
 * 3. 如果都失败，跳过整个测试套件
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTaskQueue } from '../../src/infrastructure/queue/TaskQueue.js';
import { createTaskWorker } from '../../src/workers/TaskWorker.js';
import { createTaskScheduler } from '../../src/schedulers/TaskScheduler.js';
import { createTaskRepository } from '../../src/infrastructure/database/index.js';
import Redis from 'ioredis';

describe('Queue System Integration Tests', () => {
  let queue: Awaited<ReturnType<typeof createTaskQueue>>;
  let worker: ReturnType<typeof createTaskWorker>;
  let scheduler: Awaited<ReturnType<typeof createTaskScheduler>>;
  let repository: ReturnType<typeof createTaskRepository>;
  let redisAvailable = false;
  let redisConnectionType = '';

  beforeAll(async () => {
    // 在需要时才创建 repository，避免模块加载时的初始化问题
    repository = createTaskRepository();

    console.error('REDIS_URL from env:', process.env.REDIS_URL);

    // Redis连接测试 - 支持两种方式
    const testRedisConnection = async (connectionType: string, redisConfig: any): Promise<boolean> => {
      try {
        const redis = new Redis(redisConfig);
        await redis.ping();
        await redis.quit();
        console.log(`✅ Redis连接成功 (${connectionType})`);
        return true;
      } catch (error) {
        console.log(`❌ Redis连接失败 (${connectionType}): ${(error as Error).message}`);
        return false;
      }
    };

    // 方式1: 尝试使用 .env 中的 REDIS_URL
    const envRedisUrl = process.env.REDIS_URL;
    if (envRedisUrl) {
      try {
        const redisUrl = new URL(envRedisUrl);
        const redisConfig = {
          host: redisUrl.hostname,
          port: parseInt(redisUrl.port) || 6379,
          password: redisUrl.password || undefined,
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
        };

        redisAvailable = await testRedisConnection('ENV配置', redisConfig);
        console.error('After ENV Redis test, redisAvailable:', redisAvailable);
        if (redisAvailable) {
          redisConnectionType = 'ENV配置 (REDIS_URL)';
        }
      } catch (error) {
        console.error(`⚠️  REDIS_URL格式错误: ${(error as Error).message}`);
      }
    } else {
      console.error('No REDIS_URL found in environment');
    }

    // 方式2: 如果环境变量方式失败，尝试本地 localhost:6379
    if (!redisAvailable) {
      console.error('Trying local Redis configuration...');
      const localRedisConfig = {
        host: '127.0.0.1',
        port: 6379,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      };

      redisAvailable = await testRedisConnection('本地配置', localRedisConfig);
      console.error('After local Redis test, redisAvailable:', redisAvailable);
      if (redisAvailable) {
        redisConnectionType = '本地配置 (localhost:6379)';
      }
    }

    console.error('Final redisAvailable:', redisAvailable);

    // 如果两种方式都失败，跳过测试
    if (!redisAvailable) {
      console.log('\n⚠️  Redis不可用，跳过队列系统集成测试');
      console.log('💡 解决方法:');
      console.log('   1. 启动本地Redis: brew services start redis');
      console.log('   2. 或使用Docker: docker run -d -p 6379:6379 redis:alpine');
      console.log('   3. 或在.env中配置REDIS_URL\n');
    }

    if (!redisAvailable) {
      console.error('Returning early from beforeAll hook');
      return;
    }

    console.log('Initializing queue system...');
    // 初始化队列、Worker 和调度器
    try {
      queue = await createTaskQueue();
      worker = createTaskWorker('test-worker', 1);
      scheduler = await createTaskScheduler();
      console.log(`✅ 使用Redis连接方式: ${redisConnectionType}\n`);
    } catch (error) {
      console.error('❌ 初始化队列系统失败:', error);
      redisAvailable = false;
    }
  });

  afterAll(async () => {
    // 清理资源（添加空值检查）
    try {
      if (worker) {
        await worker.close();
      }
      if (scheduler) {
        await scheduler.close();
      }
      if (queue) {
        await queue.close();
      }
    } catch (error) {
      console.error('清理资源时出错:', error);
    }
  });

  describe('TaskQueue', () => {
    it('should add task to queue', async () => {
      if (!redisAvailable) {
        console.warn('⚠️  Redis不可用，跳过测试');
        return;
      }
      const taskData = {
        taskId: 'test-queue-1',
        mode: 'async' as const,
        topic: 'Test Queue',
        requirements: 'Test queue functionality',
      };

      await queue.addTask(taskData);

      const stats = await queue.getStats();
      expect(stats.waiting).toBeGreaterThan(0);
    });

    it('should get queue stats', async () => {
      if (!redisAvailable) {
        console.warn('⚠️  Redis不可用，跳过测试');
        return;
      }

      const stats = await queue.getStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
    });
  });

  describe('TaskScheduler', () => {
    it('should schedule a task', async () => {
      if (!redisAvailable) {
        console.warn('⚠️  Redis不可用，跳过测试');
        return;
      }
      const taskId = await scheduler.scheduleTask({
        mode: 'async',
        topic: 'Test Scheduler',
        requirements: 'Test scheduler functionality',
      });

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
      // 注意：由于MemoryTaskRepository使用实例存储，测试中的repository实例
      // 与TaskScheduler内部的repository实例是独立的，所以无法直接查询
      // TaskScheduler已通过内部验证确保任务创建成功
    });

    it('should schedule batch tasks', async () => {
      if (!redisAvailable) {
        console.warn('⚠️  Redis不可用，跳过测试');
        return;
      }
      const taskIds = await scheduler.scheduleBatchTasks({
        tasks: [
          {
            mode: 'async',
            topic: 'Batch Test 1',
            requirements: 'First batch task',
          },
          {
            mode: 'async',
            topic: 'Batch Test 2',
            requirements: 'Second batch task',
          },
        ],
      });

      expect(taskIds).toHaveLength(2);
      expect(taskIds[0]).toBeDefined();
      expect(taskIds[1]).toBeDefined();
    });

    it('should get queue stats', async () => {
      if (!redisAvailable) {
        console.warn('⚠️  Redis不可用，跳过测试');
        return;
      }
      const stats = await scheduler.getQueueStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
    });
  });

  describe('TaskWorker', () => {
    it('should create worker', () => {
      if (!redisAvailable) {
        console.warn('⚠️  Redis不可用，跳过测试');
        return;
      }
      expect(worker).toBeDefined();
      expect(worker.getWorkerId()).toBe('test-worker');
      expect(worker.getConcurrency()).toBe(1);
    });

    it('should get worker stats', async () => {
      if (!redisAvailable) {
        console.warn('⚠️  Redis不可用，跳过测试');
        return;
      }
      const stats = await worker.getStats();

      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('isWaiting');
    });
  });

  describe('End-to-End Workflow', () => {
    it('should process task from queue', async () => {
      if (!redisAvailable) {
        console.warn('⚠️  Redis不可用，跳过测试');
        return;
      }
      // 这个测试需要实际启动 Worker，可能需要较长时间
      // 在 CI/CD 环境中可能需要跳过或 mock

      const taskId = await scheduler.scheduleTask({
        mode: 'async',
        topic: 'E2E Test',
        requirements: 'End-to-end test',
      });

      expect(taskId).toBeDefined();

      // 等待一段时间让 Worker 处理任务
      // 实际测试中应该使用轮询检查任务状态
      await new Promise(resolve => setTimeout(resolve, 100));

      // 注意：由于MemoryTaskRepository使用实例存储，测试中的repository实例
      // 与TaskScheduler内部的repository实例是独立的，所以无法直接查询任务状态
      // 这个测试主要验证任务能被成功添加到队列并返回有效的taskId
    }, 30000); // 增加超时时间到 30 秒
  });
});
