/**
 * CLI Status 命令测试
 *
 * 测试 status 命令的各种场景（使用 Mock，无需数据库）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockTaskRepository, TestDataFactory, TestEnvironment } from '../../helpers/TestHelpers.js';
import { TaskStatus } from '../../../src/domain/entities/Task.js';
import { getStatusText, formatDate, formatDuration, printSeparator } from '../../../src/presentation/cli/utils/formatter.js';
import chalk from 'chalk';

// We'll test the status command logic directly without going through Commander.js
// This approach is more isolated and testable

describe('@unit CLI Status Command', () => {
  let mockRepo: MockTaskRepository;
  let testEnv: TestEnvironment;
  let consoleOutput: string[] = [];
  let consoleErrorOutput: string[] = [];

  beforeEach(() => {
    // Setup test environment
    mockRepo = new MockTaskRepository();
    testEnv = new TestEnvironment();
    testEnv.setupMemoryDatabase();

    // Capture console output
    consoleOutput = [];
    consoleErrorOutput = [];

    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args: any[]) => {
      consoleOutput.push(args.map(arg =>
        typeof arg === 'string' ? arg : JSON.stringify(arg)
      ).join(' '));
    };

    console.error = (...args: any[]) => {
      consoleErrorOutput.push(args.map(arg =>
        typeof arg === 'string' ? arg : JSON.stringify(arg)
      ).join(' '));
    };

    // Restore original console functions after tests
    return () => {
      console.log = originalLog;
      console.error = originalError;
    };
  });

  afterEach(() => {
    testEnv.cleanup();
  });

  describe('任务查询逻辑', () => {
    it('应该能够找到已创建的任务', async () => {
      const task = TestDataFactory.createTaskWithId('find-test');
      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('find-test');
      expect(foundTask).not.toBeNull();
      expect(foundTask?.id).toBe('find-test');
    });

    it('应该在任务不存在时返回 null', async () => {
      const foundTask = await mockRepo.findById('non-existent');
      expect(foundTask).toBeNull();
    });
  });

  describe('不同状态的任务', () => {
    it('应该能够创建 pending 状态的任务', async () => {
      const task = TestDataFactory.createTaskWithId('pending-test', {
        status: TaskStatus.PENDING,
      });

      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('pending-test');
      expect(foundTask?.status).toBe(TaskStatus.PENDING);
      expect(getStatusText(TaskStatus.PENDING)).toContain('待处理');
    });

    it('应该能够创建 running 状态的任务', async () => {
      await mockRepo.create({
        id: 'running-test',
        mode: 'sync',
        topic: 'Test',
        requirements: 'Test',
        status: TaskStatus.RUNNING,
        currentStep: 'write',
      });

      const foundTask = await mockRepo.findById('running-test');
      expect(foundTask?.status).toBe(TaskStatus.RUNNING);
      expect(foundTask?.currentStep).toBe('write');
    });

    it('应该能够创建 completed 状态的任务', async () => {
      const completedAt = new Date();
      await mockRepo.create({
        id: 'completed-test',
        mode: 'sync',
        topic: 'Test',
        requirements: 'Test',
        status: TaskStatus.COMPLETED,
        completedAt,
      });

      const foundTask = await mockRepo.findById('completed-test');
      expect(foundTask?.status).toBe(TaskStatus.COMPLETED);
      expect(foundTask?.completedAt).toBeDefined();
    });

    it('应该能够创建 failed 状态的任务', async () => {
      await mockRepo.create({
        id: 'failed-test',
        mode: 'sync',
        topic: 'Test',
        requirements: 'Test',
        status: TaskStatus.FAILED,
        errorMessage: 'Test error message',
      });

      const foundTask = await mockRepo.findById('failed-test');
      expect(foundTask?.status).toBe(TaskStatus.FAILED);
      expect(foundTask?.errorMessage).toBe('Test error message');
    });
  });

  describe('状态更新功能', () => {
    it('应该能够更新任务状态（带乐观锁）', async () => {
      const task = TestDataFactory.createTaskWithId('update-test');
      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('update-test');
      expect(foundTask?.version).toBe(1);

      const success = await mockRepo.updateStatus('update-test', TaskStatus.RUNNING, 1);
      expect(success).toBe(true);

      const updatedTask = await mockRepo.findById('update-test');
      expect(updatedTask?.status).toBe(TaskStatus.RUNNING);
      expect(updatedTask?.version).toBe(2);
    });

    it('应该在版本号不匹配时更新失败', async () => {
      const task = TestDataFactory.createTaskWithId('version-test');
      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      // Try to update with wrong version
      const success = await mockRepo.updateStatus('version-test', TaskStatus.RUNNING, 999);
      expect(success).toBe(false);
    });
  });

  describe('重试统计', () => {
    it('应该能够增加文本质检重试次数', async () => {
      const task = TestDataFactory.createTaskWithId('retry-text-test');
      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('retry-text-test');
      expect(foundTask?.textRetryCount).toBe(0);

      await mockRepo.incrementRetryCount('retry-text-test', 'text', 1);

      const updatedTask = await mockRepo.findById('retry-text-test');
      expect(updatedTask?.textRetryCount).toBe(1);
    });

    it('应该能够增加配图质检重试次数', async () => {
      const task = TestDataFactory.createTaskWithId('retry-image-test');
      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('retry-image-test');
      expect(foundTask?.imageRetryCount).toBe(0);

      await mockRepo.incrementRetryCount('retry-image-test', 'image', 1);

      const updatedTask = await mockRepo.findById('retry-image-test');
      expect(updatedTask?.imageRetryCount).toBe(1);
    });
  });

  describe('工具函数测试', () => {
    it('getStatusText 应该返回正确的状态文本', () => {
      expect(getStatusText(TaskStatus.PENDING)).toContain('待处理');
      expect(getStatusText(TaskStatus.RUNNING)).toContain('运行中');
      expect(getStatusText(TaskStatus.COMPLETED)).toContain('已完成');
      expect(getStatusText(TaskStatus.FAILED)).toContain('失败');
      expect(getStatusText(TaskStatus.CANCELLED)).toContain('已取消');
    });

    it('formatDate 应该格式化日期', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatDate(date);
      expect(formatted).toBeDefined();
      expect(formatted.length).toBeGreaterThan(0);
    });

    it('formatDuration 应该格式化时长', () => {
      const duration = 3665000; // 1 hour, 1 minute, 5 seconds
      const formatted = formatDuration(duration);
      expect(formatted).toBeDefined();
      expect(formatted.length).toBeGreaterThan(0);
    });
  });

  describe('优先级显示', () => {
    it('应该正确显示优先级', async () => {
      // Create tasks directly with priority values
      await mockRepo.create({
        id: 'low-priority',
        mode: 'sync',
        topic: 'Low Priority',
        requirements: 'Test',
        priority: 1 as any,
      });

      await mockRepo.create({
        id: 'normal-priority',
        mode: 'sync',
        topic: 'Normal Priority',
        requirements: 'Test',
        priority: 2 as any,
      });

      await mockRepo.create({
        id: 'high-priority',
        mode: 'sync',
        topic: 'High Priority',
        requirements: 'Test',
        priority: 3 as any,
      });

      await mockRepo.create({
        id: 'urgent-priority',
        mode: 'sync',
        topic: 'Urgent Priority',
        requirements: 'Test',
        priority: 4 as any,
      });

      const lowFound = await mockRepo.findById('low-priority');
      const normalFound = await mockRepo.findById('normal-priority');
      const highFound = await mockRepo.findById('high-priority');
      const urgentFound = await mockRepo.findById('urgent-priority');

      expect(lowFound?.priority).toBe(1);
      expect(normalFound?.priority).toBe(2);
      expect(highFound?.priority).toBe(3);
      expect(urgentFound?.priority).toBe(4);
    });
  });

  describe('获取待处理任务', () => {
    it('应该能够获取待处理任务队列', async () => {
      // Create tasks directly
      await mockRepo.create({
        id: 'pending-1',
        mode: 'sync',
        topic: 'Pending 1',
        requirements: 'Test',
        status: TaskStatus.PENDING,
        priority: 3 as any,
      });

      await mockRepo.create({
        id: 'pending-2',
        mode: 'sync',
        topic: 'Pending 2',
        requirements: 'Test',
        status: TaskStatus.PENDING,
        priority: 2 as any,
      });

      await mockRepo.create({
        id: 'running',
        mode: 'sync',
        topic: 'Running',
        requirements: 'Test',
        status: TaskStatus.RUNNING,
      });

      const pendingTasks = await mockRepo.getPendingTasks();
      expect(pendingTasks.length).toBe(2);
      expect(pendingTasks[0].priority).toBeGreaterThan(pendingTasks[1].priority); // Higher priority first
    });
  });
});
