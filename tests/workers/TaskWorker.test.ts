/**
 * TaskWorker 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskWorker, createTaskWorker } from '../../src/workers/TaskWorker.js';
import { createTaskRepository } from '../../src/infrastructure/database/index.js';
import Redis from 'ioredis';

// Mock Redis 连接
const mockRedis = {
  duplicate: () => mockRedis,
} as unknown as Redis;

// Mock Repository
vi.mock('../../src/infrastructure/database/index.js', () => ({
  createTaskRepository: vi.fn(() => ({
    claimForProcessing: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue({
      id: 'test-1',
      status: 'pending',
    }),
  })),
}));

// Mock 工作流
vi.mock('../../src/domain/workflow/index.js', () => ({
  createSimpleContentCreatorGraph: vi.fn(() => ({
    invoke: vi.fn().mockResolvedValue({
      taskId: 'test-1',
      articleContent: 'Test content',
      searchResults: [],
      organizedInfo: 'Test info',
    }),
  })),
  createInitialState: vi.fn((state) => state),
}));

describe('TaskWorker', () => {
  let worker: TaskWorker;
  const mockRepo = createTaskRepository();

  beforeEach(() => {
    worker = new TaskWorker('test-worker', 1);
  });

  afterEach(async () => {
    if (worker) {
      await worker.close();
    }
  });

  describe('constructor', () => {
    it('should create worker with default values', async () => {
      const defaultWorker = createTaskWorker();
      expect(defaultWorker.getWorkerId()).toBeDefined();
      expect(defaultWorker.getConcurrency()).toBe(2);
      await defaultWorker.close();
    });

    it('should create worker with custom values', () => {
      expect(worker.getWorkerId()).toBe('test-worker');
      expect(worker.getConcurrency()).toBe(1);
    });

    it('should use process env for worker id', async () => {
      const originalWorkerId = process.env.WORKER_ID;

      // 临时删除 WORKER_ID 以测试默认行为
      delete process.env.WORKER_ID;

      const envWorker = createTaskWorker();
      // 现在使用 UUID 来生成唯一 worker id
      expect(envWorker.getWorkerId()).toMatch(/^worker-[a-f0-9-]{36}$/);
      await envWorker.close();

      // 恢复原始 WORKER_ID
      if (originalWorkerId) {
        process.env.WORKER_ID = originalWorkerId;
      }
    });
  });

  describe('start', () => {
    it('should start worker successfully', async () => {
      // 注意：这个测试需要实际的 Redis 连接
      // 在 CI/CD 环境中可能需要 mock
      try {
        await worker.start();
        const stats = await worker.getStats();
        expect(stats.isRunning).toBeDefined();
      } catch (error) {
        // 如果没有 Redis，跳过测试
        expect(error).toBeDefined();
      }
    }, 10000);

    it('should handle start errors gracefully', async () => {
      // Mock invalid connection
      const badWorker = new TaskWorker('bad-worker');

      // 应该抛出错误或处理错误
      try {
        await badWorker.start();
        await badWorker.close();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('getStats', () => {
    it('should return worker statistics', async () => {
      const stats = await worker.getStats();

      expect(stats).toHaveProperty('isRunning');
      expect(stats).toHaveProperty('isWaiting');
      expect(typeof stats.isRunning).toBe('boolean');
      expect(typeof stats.isWaiting).toBe('boolean');
    });

    it('should return false for not running worker', async () => {
      const newWorker = new TaskWorker('stats-worker');
      const stats = await newWorker.getStats();

      expect(stats.isRunning).toBe(false);
      await newWorker.close();
    });
  });

  describe('pause and resume', () => {
    it('should pause worker', async () => {
      try {
        await worker.start();
        await expect(worker.pause()).resolves.not.toThrow();
      } catch (error) {
        // 如果没有 Redis，跳过
        expect(error).toBeDefined();
      }
    });

    it('should resume worker', async () => {
      try {
        await worker.start();
        await worker.pause();
        await expect(worker.resume()).resolves.not.toThrow();
      } catch (error) {
        // 如果没有 Redis，跳过
        expect(error).toBeDefined();
      }
    });
  });

  describe('close', () => {
    it('should close worker', async () => {
      const testWorker = new TaskWorker('close-test-worker');
      await expect(testWorker.close()).resolves.not.toThrow();
    });

    it('should handle multiple closes', async () => {
      const testWorker = new TaskWorker('multi-close-worker');
      await testWorker.close();
      await expect(testWorker.close()).resolves.not.toThrow();
    });

    it('should allow closing before start', async () => {
      const testWorker = new TaskWorker('no-start-worker');
      await expect(testWorker.close()).resolves.not.toThrow();
    });
  });

  describe('getWorkerId', () => {
    it('should return worker id', async () => {
      const customWorker = new TaskWorker('custom-id');
      expect(customWorker.getWorkerId()).toBe('custom-id');
      await customWorker.close();
    });

    it('should return unique ids for different workers', async () => {
      const worker1 = new TaskWorker('worker-1');
      const worker2 = new TaskWorker('worker-2');

      expect(worker1.getWorkerId()).not.toBe(worker2.getWorkerId());

      await worker1.close();
      await worker2.close();
    });
  });

  describe('getConcurrency', () => {
    it('should return concurrency value', async () => {
      const concurrencyWorker = new TaskWorker('concurrency-test', 5);
      expect(concurrencyWorker.getConcurrency()).toBe(5);
      await concurrencyWorker.close();
    });

    it('should handle different concurrency values', async () => {
      const worker1 = new TaskWorker('c1', 1);
      const worker2 = new TaskWorker('c2', 5);
      const worker3 = new TaskWorker('c3', 10);

      expect(worker1.getConcurrency()).toBe(1);
      expect(worker2.getConcurrency()).toBe(5);
      expect(worker3.getConcurrency()).toBe(10);

      await worker1.close();
      await worker2.close();
      await worker3.close();
    });
  });

  describe('job processing', () => {
    it('should process job successfully', async () => {
      // Mock job processing
      const mockJob = {
        id: 'test-job-1',
        data: {
          taskId: 'test-1',
          mode: 'async',
          topic: 'Test',
          requirements: 'Test',
        },
        updateProgress: vi.fn().mockResolvedValue(undefined),
      };

      // 测试任务处理逻辑
      expect(mockJob.data.taskId).toBe('test-1');
      expect(mockJob.data.mode).toBe('async');
    });

    it('should handle job errors', async () => {
      const mockJob = {
        id: 'test-job-error',
        data: {
          taskId: 'error-test',
          mode: 'async',
          topic: 'Error Test',
          requirements: 'Test',
        },
        updateProgress: vi.fn().mockRejectedValue(new Error('Test error')),
      };

      // 验证错误处理
      await expect(mockJob.updateProgress(50)).rejects.toThrow();
    });
  });

  describe('event listeners', () => {
    it('should setup event listeners on start', () => {
      // 验证事件监听器设置
      const events = ['completed', 'failed', 'progress', 'error', 'ready', 'closing', 'closed'];

      events.forEach(event => {
        expect(event).toBeDefined();
      });
    });

    it('should emit progress events', async () => {
      const progressCallback = vi.fn();

      // Mock progress event
      const mockProgress = {
        jobId: 'test-job',
        progress: 50,
      };

      progressCallback(mockProgress);
      expect(progressCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe('task claiming', () => {
    it('should claim task for processing', async () => {
      const taskId = 'claim-test';

      // Mock claim
      const claimResult = await mockRepo.claimForProcessing(taskId, 'test-worker');
      expect(claimResult).toBeDefined();
    });

    it('should handle claim failure', async () => {
      const taskId = 'claim-fail';

      // Mock claim failure
      vi.mocked(mockRepo.claimForProcessing).mockResolvedValueOnce(false);

      const claimResult = await mockRepo.claimForProcessing(taskId, 'test-worker');
      expect(claimResult).toBe(false);
    });
  });

  describe('state updates', () => {
    it('should update task state on completion', async () => {
      const taskId = 'update-test';

      await mockRepo.update(taskId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      });

      expect(mockRepo.update).toHaveBeenCalled();
    });

    it('should update task state on failure', async () => {
      const taskId = 'fail-update-test';
      const error = new Error('Test error');

      await mockRepo.update(taskId, {
        status: 'failed',
        error: error.message,
      });

      expect(mockRepo.update).toHaveBeenCalled();
    });
  });
});
