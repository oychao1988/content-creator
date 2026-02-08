/**
 * SyncExecutor Webhook 集成测试
 *
 * 测试 SyncExecutor 与 WebhookService 的集成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncExecutor } from '../../../src/application/workflow/SyncExecutor.js';
import { WebhookService } from '../../../src/infrastructure/callback/WebhookService.js';
import type { ITaskRepository } from '../../../src/domain/repositories/TaskRepository.js';
import { TaskStatus, ExecutionMode } from '../../../src/domain/entities/Task.js';
import type { CreateTaskParams } from '../../../src/domain/entities/Task.js';

// Mock WebhookService
vi.mock('../../../src/infrastructure/callback/WebhookService.js');

// Mock logger
vi.mock('../../../src/infrastructure/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('SyncExecutor Webhook Integration', () => {
  let executor: SyncExecutor;
  let mockTaskRepo: ITaskRepository;
  let mockSendCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock TaskRepository
    mockTaskRepo = {
      create: vi.fn().mockResolvedValue({
        taskId: 'test-task-id',
        status: TaskStatus.PENDING,
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        priority: 2,
        textRetryCount: 0,
        imageRetryCount: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findById: vi.fn().mockResolvedValue({
        taskId: 'test-task-id',
        status: TaskStatus.RUNNING,
        version: 1,
      }),
      updateStatus: vi.fn().mockResolvedValue(true),
      markAsCompleted: vi.fn().mockResolvedValue(true),
      markAsFailed: vi.fn().mockResolvedValue(true),
    } as unknown as ITaskRepository;

    // Mock sendCallback method
    mockSendCallback = vi.fn().mockResolvedValue(true);

    // Mock WebhookService class
    vi.mocked(WebhookService).mockImplementation(function() {
      return {
        sendCallback: mockSendCallback,
      } as unknown as WebhookService;
    });

    // Create executor
    executor = new SyncExecutor(mockTaskRepo, {
      databaseType: 'memory',
      timeout: 10000,
      totalTimeout: 30000,
    });
  });

  describe('Webhook 回调参数', () => {
    it('应该在 CreateTaskParams 中包含 webhook 参数', () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: true,
        callbackEvents: ['completed', 'failed'],
      };

      expect(params.callbackUrl).toBe('http://example.com/callback');
      expect(params.callbackEnabled).toBe(true);
      expect(params.callbackEvents).toContain('completed');
      expect(params.callbackEvents).toContain('failed');
    });

    it('应该支持可选的 webhook 参数', () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
      };

      expect(params.callbackUrl).toBeUndefined();
      expect(params.callbackEnabled).toBeUndefined();
      expect(params.callbackEvents).toBeUndefined();
    });
  });

  describe('WebhookService 集成', () => {
    it('应该在构造函数中初始化 WebhookService', () => {
      // Verify WebhookService constructor was called
      expect(WebhookService).toHaveBeenCalled();
    });

    it('应该在任务成功时调用 sendCallback', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: true,
        callbackEvents: ['completed'],
      };

      // Mock workflow execution to succeed
      vi.spyOn(executor as any, 'executeWorkflow').mockResolvedValue({
        articleContent: 'Test content',
        finalArticleContent: '<p>Test content</p>',
        images: [],
        textQualityReport: { score: 8.5, passed: true },
      });

      // Execute task
      await executor.execute(params);

      // Verify sendCallback was called
      expect(mockSendCallback).toHaveBeenCalled();

      // Get the payload that was sent
      const callArgs = mockSendCallback.mock.calls[0];
      const payload = callArgs[0];
      const options = callArgs[1];

      // Verify payload structure
      expect(payload.event).toBe('completed');
      expect(payload.taskId).toBeDefined();
      expect(payload.workflowType).toBeDefined();
      expect(payload.status).toBe('completed');
      expect(payload.timestamp).toBeDefined();
      expect(payload.metadata).toBeDefined();
      expect(payload.result).toBeDefined();
      expect(payload.error).toBeUndefined();

      // Verify options
      expect(options.enabled).toBe(true);
      expect(options.url).toBe('http://example.com/callback');
    });

    it('应该在任务失败时调用 sendCallback', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: true,
        callbackEvents: ['failed'],
      };

      // Mock workflow execution to fail
      vi.spyOn(executor as any, 'executeWorkflow').mockRejectedValue(
        new Error('Test error')
      );

      // Execute task (will fail)
      await executor.execute(params);

      // Verify sendCallback was called
      expect(mockSendCallback).toHaveBeenCalled();

      // Get the payload that was sent
      const callArgs = mockSendCallback.mock.calls[0];
      const payload = callArgs[0];

      // Verify payload structure
      expect(payload.event).toBe('failed');
      expect(payload.status).toBe('failed');
      expect(payload.error).toBeDefined();
      expect(payload.result).toBeUndefined();
      expect(payload.error?.message).toBeDefined();
    });

    it('应该在 callbackEnabled=false 时跳过 webhook', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: false,
      };

      vi.spyOn(executor as any, 'executeWorkflow').mockResolvedValue({
        articleContent: 'Test content',
      });

      await executor.execute(params);

      // Verify sendCallback was NOT called
      expect(mockSendCallback).not.toHaveBeenCalled();
    });

    it('应该在未配置 callbackUrl 时跳过 webhook', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackEnabled: true,
      };

      vi.spyOn(executor as any, 'executeWorkflow').mockResolvedValue({
        articleContent: 'Test content',
      });

      await executor.execute(params);

      // Verify sendCallback was NOT called
      expect(mockSendCallback).not.toHaveBeenCalled();
    });

    it('应该根据 callbackEvents 过滤事件', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: true,
        callbackEvents: ['completed'], // Only completed events
      };

      vi.spyOn(executor as any, 'executeWorkflow').mockRejectedValue(
        new Error('Test error')
      );

      await executor.execute(params);

      // Verify sendCallback was NOT called (because failed is not in callbackEvents)
      expect(mockSendCallback).not.toHaveBeenCalled();
    });

    it('应该使用默认的 callbackEvents', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        // callbackEvents not specified, should default to ['completed', 'failed']
      };

      vi.spyOn(executor as any, 'executeWorkflow').mockResolvedValue({
        articleContent: 'Test content',
      });

      await executor.execute(params);

      // Should send callback because 'completed' is in default events
      expect(mockSendCallback).toHaveBeenCalled();
    });
  });

  describe('Webhook 失容错', () => {
    it('应该在 webhook 失败时不影响任务执行结果', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: true,
      };

      vi.spyOn(executor as any, 'executeWorkflow').mockResolvedValue({
        articleContent: 'Test content',
      });

      // Mock sendCallback to throw error
      mockSendCallback.mockRejectedValue(
        new Error('Webhook failed')
      );

      // Task should still complete successfully
      const result = await executor.execute(params);

      expect(result.status).toBe('completed');
      expect(mockSendCallback).toHaveBeenCalled();
    });
  });

  describe('Payload 数据结构', () => {
    it('应该包含正确的成功负载结构', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: true,
      };

      vi.spyOn(executor as any, 'executeWorkflow').mockResolvedValue({
        articleContent: 'Test article content',
        finalArticleContent: '<p>Test article content</p>',
        images: [
          {
            url: 'http://example.com/image1.jpg',
            localPath: '/tmp/image1.jpg',
            prompt: 'Test image prompt',
            width: 1920,
            height: 1080,
          },
        ],
        textQualityReport: {
          score: 8.5,
          passed: true,
          details: {},
        },
      });

      await executor.execute(params);

      const payload = mockSendCallback.mock.calls[0][0];

      // Verify result structure
      expect(payload.result).toBeDefined();
      expect(payload.result?.content).toBe('Test article content');
      expect(payload.result?.htmlContent).toBe('<p>Test article content</p>');
      expect(payload.result?.images).toHaveLength(1);
      expect(payload.result?.qualityScore).toBe(8.5);
      expect(payload.result?.wordCount).toBeGreaterThan(0);
      expect(payload.result?.metrics).toBeDefined();
      expect(payload.result?.metrics?.tokensUsed).toBeDefined();
      expect(payload.result?.metrics?.cost).toBeDefined();
      expect(payload.result?.metrics?.duration).toBeDefined();
      expect(payload.result?.metrics?.stepsCompleted).toBeDefined();
    });

    it('应该包含正确的失败负载结构', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: true,
      };

      vi.spyOn(executor as any, 'executeWorkflow').mockRejectedValue(
        new Error('Execution failed')
      );

      await executor.execute(params);

      const payload = mockSendCallback.mock.calls[0][0];

      // Verify error structure
      expect(payload.error).toBeDefined();
      expect(payload.error?.message).toBe('Execution failed');
      expect(payload.error?.type).toBe('execution_error');
      expect(payload.error?.details).toBeDefined();
      expect(payload.result).toBeUndefined();
    });

    it('应该包含正确的元数据', async () => {
      const params: CreateTaskParams = {
        mode: ExecutionMode.SYNC,
        topic: 'Test topic',
        requirements: 'Test requirements',
        targetAudience: 'Test audience',
        callbackUrl: 'http://example.com/callback',
        callbackEnabled: true,
      };

      vi.spyOn(executor as any, 'executeWorkflow').mockResolvedValue({
        articleContent: 'Test content',
      });

      await executor.execute(params);

      const payload = mockSendCallback.mock.calls[0][0];

      // Verify metadata
      expect(payload.metadata).toBeDefined();
      expect(payload.metadata?.topic).toBe('Test topic');
      expect(payload.metadata?.requirements).toBe('Test requirements');
      expect(payload.metadata?.targetAudience).toBe('Test audience');
    });
  });
});
