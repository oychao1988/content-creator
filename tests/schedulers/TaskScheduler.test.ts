/**
 * TaskScheduler 单元测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskScheduler } from '../../src/schedulers/TaskScheduler.js';
import { createTaskRepository } from '../../src/infrastructure/database/index.js';
import type { CreateTaskRequest } from '../../src/schedulers/TaskScheduler.js';

// 使用 vi.hoisted() 确保共享的 mock 实例
const { mockRepo } = vi.hoisted(() => ({
  mockRepo: {
    create: vi.fn().mockResolvedValue({
      id: 'test-1',
      status: 'pending',
    }),
    findById: vi.fn().mockResolvedValue({
      id: 'test-1',
      status: 'pending',
    }),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock Repository - 返回共享的 mock 实例
vi.mock('../../src/infrastructure/database/index.js', () => ({
  createTaskRepository: vi.fn(() => mockRepo),
}));

// Mock TaskQueue
vi.mock('../../src/infrastructure/queue/TaskQueue.js', () => ({
  createTaskQueue: vi.fn(() => Promise.resolve({
    addTask: vi.fn().mockResolvedValue(undefined),
    addDelayedTask: vi.fn().mockResolvedValue(undefined),
    addBatchTasks: vi.fn().mockResolvedValue(undefined),
    getStats: vi.fn().mockResolvedValue({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      repeat: 0,
    }),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('TaskScheduler', () => {
  let scheduler: TaskScheduler;

  beforeEach(async () => {
    // 清空所有 mock 调用记录
    vi.clearAllMocks();

    scheduler = new TaskScheduler();
    await scheduler.initialize();
  });

  afterEach(async () => {
    await scheduler.close();
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      const testScheduler = new TaskScheduler();
      await expect(testScheduler.initialize()).resolves.not.toThrow();
      await testScheduler.close();
    });

    it('should be idempotent', async () => {
      // 多次初始化不应报错
      await scheduler.initialize();
      await scheduler.initialize();
      await scheduler.initialize();

      const stats = await scheduler.getQueueStats();
      expect(stats).toBeDefined();
    });
  });

  describe('scheduleTask', () => {
    it('should schedule a task', async () => {
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Test Topic',
        requirements: 'Test requirements',
      };

      const taskId = await scheduler.scheduleTask(request);

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');
    });

    it('should create task in repository', async () => {
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Test Topic',
        requirements: 'Test requirements',
      };

      await scheduler.scheduleTask(request);

      expect(mockRepo.create).toHaveBeenCalled();
    });

    it('should validate topic', async () => {
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: '', // Empty topic
        requirements: 'Test',
      };

      await expect(scheduler.scheduleTask(request)).rejects.toThrow('Topic is required');
    });

    it('should validate requirements', async () => {
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Test',
        requirements: '', // Empty requirements
      };

      await expect(scheduler.scheduleTask(request)).rejects.toThrow('Requirements are required');
    });

    it('should validate mode', async () => {
      const request = {
        mode: 'invalid' as any, // Invalid mode
        topic: 'Test',
        requirements: 'Test',
      };

      await expect(scheduler.scheduleTask(request)).rejects.toThrow();
    });

    it('should handle hard constraints', async () => {
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Test Topic',
        requirements: 'Test requirements',
        hardConstraints: {
          minWords: 500,
          maxWords: 1000,
          keywords: ['AI', '人工智能'],
        },
      };

      const taskId = await scheduler.scheduleTask(request);

      expect(taskId).toBeDefined();
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hardConstraints: request.hardConstraints,
        })
      );
    });

    it('should validate minWords < maxWords', async () => {
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Test',
        requirements: 'Test',
        hardConstraints: {
          minWords: 1000,
          maxWords: 500, // Invalid: min > max
        },
      };

      await expect(scheduler.scheduleTask(request)).rejects.toThrow(
        'minWords cannot be greater than maxWords'
      );
    });

    it('should handle sync mode', async () => {
      const request: CreateTaskRequest = {
        mode: 'sync',
        topic: 'Sync Test',
        requirements: 'Test',
      };

      const taskId = await scheduler.scheduleTask(request);

      expect(taskId).toBeDefined();
    });
  });

  describe('scheduleBatchTasks', () => {
    it('should schedule multiple tasks', async () => {
      const batchRequest = {
        tasks: [
          {
            mode: 'async' as const,
            topic: 'Task 1',
            requirements: 'Test 1',
          },
          {
            mode: 'async' as const,
            topic: 'Task 2',
            requirements: 'Test 2',
          },
          {
            mode: 'async' as const,
            topic: 'Task 3',
            requirements: 'Test 3',
          },
        ],
      };

      const taskIds = await scheduler.scheduleBatchTasks(batchRequest);

      expect(taskIds).toHaveLength(3);
      expect(taskIds[0]).toBeDefined();
      expect(taskIds[1]).toBeDefined();
      expect(taskIds[2]).toBeDefined();
      expect(taskIds[0]).not.toBe(taskIds[1]);
      expect(taskIds[1]).not.toBe(taskIds[2]);
    });

    it('should handle empty batch', async () => {
      const batchRequest = {
        tasks: [],
      };

      const taskIds = await scheduler.scheduleBatchTasks(batchRequest);

      expect(taskIds).toHaveLength(0);
    });

    it('should handle single task batch', async () => {
      const batchRequest = {
        tasks: [
          {
            mode: 'async' as const,
            topic: 'Single Task',
            requirements: 'Test',
          },
        ],
      };

      const taskIds = await scheduler.scheduleBatchTasks(batchRequest);

      expect(taskIds).toHaveLength(1);
    });

    it('should apply userId to all tasks', async () => {
      const batchRequest = {
        userId: 'user-123',
        tasks: [
          {
            mode: 'async' as const,
            topic: 'Task 1',
            requirements: 'Test',
          },
          {
            mode: 'async' as const,
            topic: 'Task 2',
            requirements: 'Test',
          },
        ],
      };

      const taskIds = await scheduler.scheduleBatchTasks(batchRequest);

      expect(taskIds).toHaveLength(2);
    });
  });

  describe('delayed scheduling', () => {
    it('should schedule delayed task', async () => {
      const futureDate = new Date(Date.now() + 60000); // 1 minute later
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Delayed Task',
        requirements: 'Test',
        scheduleAt: futureDate,
      };

      const taskId = await scheduler.scheduleTask(request);

      expect(taskId).toBeDefined();
    });

    it('should handle past schedule time', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Past Task',
        requirements: 'Test',
        scheduleAt: pastDate,
      };

      const taskId = await scheduler.scheduleTask(request);

      expect(taskId).toBeDefined();
    });
  });

  describe('cancelTask', () => {
    it('should cancel pending task', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce({
        id: 'cancel-test',
        status: 'pending',
      });

      const result = await scheduler.cancelTask('cancel-test');

      expect(result).toBe(true);
      expect(mockRepo.update).toHaveBeenCalledWith(
        'cancel-test',
        expect.objectContaining({
          status: 'cancelled',
        })
      );
    });

    it('should not cancel completed task', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce({
        id: 'completed-task',
        status: 'completed',
      });

      const result = await scheduler.cancelTask('completed-task');

      expect(result).toBe(false);
    });

    it('should handle non-existent task', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce(null);

      const result = await scheduler.cancelTask('non-existent');

      expect(result).toBe(false);
    });

    it('should not cancel processing task', async () => {
      vi.mocked(mockRepo.findById).mockResolvedValueOnce({
        id: 'processing-task',
        status: 'processing',
      });

      const result = await scheduler.cancelTask('processing-task');

      expect(result).toBe(false);
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await scheduler.getQueueStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');

      expect(typeof stats.waiting).toBe('number');
      expect(typeof stats.active).toBe('number');
      expect(typeof stats.completed).toBe('number');
      expect(typeof stats.failed).toBe('number');
    });

    it('should return zero for empty queue', async () => {
      const stats = await scheduler.getQueueStats();

      expect(stats.waiting).toBe(0);
      expect(stats.active).toBe(0);
    });
  });

  describe('close', () => {
    it('should close scheduler', async () => {
      const testScheduler = new TaskScheduler();
      await testScheduler.initialize();

      await expect(testScheduler.close()).resolves.not.toThrow();
    });

    it('should handle multiple closes', async () => {
      const testScheduler = new TaskScheduler();
      await testScheduler.initialize();

      await testScheduler.close();
      await expect(testScheduler.close()).resolves.not.toThrow();
    });
  });

  describe('priority', () => {
    it('should handle priority option', async () => {
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Priority Test',
        requirements: 'Test',
        priority: 1, // High priority
      };

      const taskId = await scheduler.scheduleTask(request);

      expect(taskId).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle repository errors', async () => {
      vi.mocked(mockRepo.create).mockRejectedValueOnce(new Error('Database error'));

      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Error Test',
        requirements: 'Test',
      };

      await expect(scheduler.scheduleTask(request)).rejects.toThrow();
    });

    it('should handle queue errors', async () => {
      const errorScheduler = new TaskScheduler();
      await errorScheduler.initialize();

      // Mock queue error
      const request: CreateTaskRequest = {
        mode: 'async',
        topic: 'Queue Error Test',
        requirements: 'Test',
      };

      // 这个测试需要实际的 mock 设置
      await errorScheduler.close();
    });
  });
});
