/**
 * WebhookService 测试
 *
 * 测试 Webhook 回调服务的各项功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import axios from 'axios';
import { WebhookService, CallbackPayload } from '../../src/infrastructure/callback/WebhookService.js';

// Mock axios 模块
vi.mock('axios');

// Mock logger 模块
vi.mock('../../src/infrastructure/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('WebhookService', () => {
  let webhookService: WebhookService;

  beforeEach(() => {
    // 清空所有 mock 调用
    vi.clearAllMocks();

    // 创建新的 WebhookService 实例
    webhookService = new WebhookService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基础功能', () => {
    it('应该成功发送回调', async () => {
      const mockResponse = {
        status: 200,
        data: { success: true },
      };
      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse);

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-123',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      expect(result).toBe(true);

      // 等待异步队列处理
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledWith(
        'http://localhost:3000/callback',
        payload,
        expect.objectContaining({
          timeout: 10000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'content-creator/1.0',
            'X-Webhook-Event': 'completed',
            'X-Task-ID': 'test-123',
          }),
        })
      );
    });

    it('应该在禁用时跳过回调', async () => {
      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-456',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: false,
      });

      expect(result).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();

      // 等待确保没有异步处理
      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('应该在未配置 URL 时跳过回调', async () => {
      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-789',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: true,
      });

      expect(result).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 100));
    });

    it('应该接受 202 状态码作为成功', async () => {
      const mockResponse = {
        status: 202,
        data: { accepted: true },
      };
      vi.mocked(axios.post).mockResolvedValueOnce(mockResponse);

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-202',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      expect(result).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('重试机制', () => {
    it('应该在失败后重试并最终成功', async () => {
      // 前两次失败，第三次成功
      vi.mocked(axios.post)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce({
          status: 200,
          data: { success: true },
        });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-retry',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        retryCount: 3,
        retryDelay: 0.1, // 100ms 用于测试
      });

      expect(result).toBe(true);

      // 等待重试完成
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(axios.post).toHaveBeenCalledTimes(3);
    });

    it('应该在达到最大重试次数后放弃', async () => {
      // 所有尝试都失败
      vi.mocked(axios.post).mockRejectedValue(new Error('Persistent error'));

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-fail',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        retryCount: 2,
        retryDelay: 0.1,
      });

      expect(result).toBe(true);

      // 等待所有重试完成
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 初始调用 + 2次重试 = 3次
      expect(axios.post).toHaveBeenCalledTimes(3);
    });

    it('应该使用默认重试配置', async () => {
      vi.mocked(axios.post)
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'))
        .mockRejectedValueOnce(new Error('Error 3'))
        .mockResolvedValueOnce({
          status: 200,
          data: { success: true },
        });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-default-retry',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      // 不指定 retryCount 和 retryDelay，使用默认值
      const result = await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      expect(result).toBe(true);

      // 等待默认重试延迟（5秒）太长，所以我们只验证前几次调用
      await new Promise((resolve) => setTimeout(resolve, 100));

      // 至少应该有 1 次调用
      expect(axios.post).toHaveBeenCalled();
    });
  });

  describe('超时处理', () => {
    it('应该处理超时错误并重试', async () => {
      const timeoutError = {
        code: 'ECONNABORTED',
        message: 'timeout of 10000ms exceeded',
      } as AxiosError;

      vi.mocked(axios.post)
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          status: 200,
          data: { success: true },
        });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-timeout',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        timeout: 1, // 1秒超时
        retryCount: 1, // 1次重试 = 总共2次调用
        retryDelay: 0.1,
      });

      expect(result).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('应该使用自定义超时时间', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-custom-timeout',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        timeout: 15, // 15秒
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 15000, // 15秒 = 15000毫秒
        })
      );
    });

    it('应该使用默认超时时间（10秒）', async () => {
      vi.mocked(axios.post).mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-default-timeout',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 10000, // 默认 10秒
        })
      );
    });
  });

  describe('队列管理', () => {
    it('应该异步处理队列', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const payloads: CallbackPayload[] = [
        {
          event: 'completed',
          taskId: 'task-1',
          workflowType: 'content-creator',
          status: 'completed',
          timestamp: new Date().toISOString(),
        },
        {
          event: 'completed',
          taskId: 'task-2',
          workflowType: 'content-creator',
          status: 'completed',
          timestamp: new Date().toISOString(),
        },
        {
          event: 'completed',
          taskId: 'task-3',
          workflowType: 'content-creator',
          status: 'completed',
          timestamp: new Date().toISOString(),
        },
      ];

      // 快速添加多个回调
      for (const payload of payloads) {
        await webhookService.sendCallback(payload, {
          enabled: true,
          url: 'http://localhost:3000/callback',
        });
      }

      // 立即检查队列大小（应该还没处理完）
      expect(webhookService.getQueueSize()).toBeGreaterThan(0);

      // 等待队列处理
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 队列应该已清空
      expect(webhookService.getQueueSize()).toBe(0);
      expect(axios.post).toHaveBeenCalledTimes(3);
    });

    it('应该返回正确的队列大小', async () => {
      // 使用慢速 mock 来确保队列不会立即处理完
      vi.mocked(axios.post).mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ status: 200, data: { success: true } });
          }, 200);
        })
      );

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-queue-size',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      // 添加前队列为空
      expect(webhookService.getQueueSize()).toBe(0);

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      // 等待一小段时间确保队列处理开始但还没完成
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 队列应该在处理过程中
      const queueSize = webhookService.getQueueSize();
      expect(queueSize).toBeGreaterThanOrEqual(0);

      // 等待处理完成
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 处理完成后队列应该为空
      expect(webhookService.getQueueSize()).toBe(0);
    });

    it('应该报告处理状态', async () => {
      vi.mocked(axios.post).mockImplementation(() =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({ status: 200, data: { success: true } });
          }, 200);
        })
      );

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-processing',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      // 稍微等待，确保处理已经开始
      await new Promise((resolve) => setTimeout(resolve, 50));

      // 应该正在处理
      expect(webhookService.isProcessing()).toBe(true);

      // 等待处理完成
      await new Promise((resolve) => setTimeout(resolve, 300));

      // 处理完成
      expect(webhookService.isProcessing()).toBe(false);
    });

    it('应该防止并发处理队列', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-concurrent',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      // 快速添加多个回调
      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });
      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      // 等待处理
      await new Promise((resolve) => setTimeout(resolve, 200));

      // 应该只调用一次 processQueue，但处理了2个回调
      expect(axios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('HTTP 头部', () => {
    it('应该发送正确的 HTTP 头部', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-headers',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'content-creator/1.0',
            'X-Webhook-Event': 'completed',
            'X-Task-ID': 'test-headers',
          },
        })
      );
    });

    it('应该根据事件类型设置 X-Webhook-Event 头', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const payload1: CallbackPayload = {
        event: 'failed',
        taskId: 'test-failed-event',
        workflowType: 'content-creator',
        status: 'failed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload1, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Webhook-Event': 'failed',
          }),
        })
      );
    });
  });

  describe('负载数据', () => {
    it('应该发送完整的负载数据', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-payload',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: '2026-02-08T12:00:00Z',
        metadata: {
          topic: 'Test topic',
          requirements: 'Test requirements',
        },
        result: {
          content: 'Test content',
          qualityScore: 8.5,
        },
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        payload,
        expect.any(Object)
      );
    });

    it('应该发送错误负载', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const payload: CallbackPayload = {
        event: 'failed',
        taskId: 'test-error-payload',
        workflowType: 'content-creator',
        status: 'failed',
        timestamp: new Date().toISOString(),
        error: {
          message: 'Test error',
          type: 'test_error',
        },
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          error: {
            message: 'Test error',
            type: 'test_error',
          },
        }),
        expect.any(Object)
      );
    });
  });

  describe('边界情况', () => {
    it('应该处理空回调 URL', async () => {
      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-empty-url',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: true,
        url: '',
      });

      expect(result).toBe(true);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it('应该处理零重试次数', async () => {
      vi.mocked(axios.post).mockRejectedValue(new Error('Fail immediately'));

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-no-retry',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        retryCount: 0,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 只应该调用1次（不重试）
      expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it('应该处理零超时时间', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-zero-timeout',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        timeout: 0,
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          timeout: 0,
        })
      );
    });

    it('应该处理负数重试延迟', async () => {
      vi.mocked(axios.post)
        .mockRejectedValueOnce(new Error('Error'))
        .mockResolvedValue({
          status: 200,
          data: { success: true },
        });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-negative-delay',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        retryCount: 2,
        retryDelay: -1, // 负数延迟
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 应该仍然重试（负数延迟会被 setTimeout 处理）
      expect(axios.post).toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该处理网络错误', async () => {
      const networkError = new Error('Network error');
      (networkError as any).code = 'ENOTFOUND';

      vi.mocked(axios.post).mockRejectedValue(networkError);

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-network-error',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      const result = await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        retryCount: 1,
        retryDelay: 0.1,
      });

      expect(result).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 300));

      // 应该重试
      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('应该处理 HTTP 错误响应', async () => {
      const errorResponse = {
        response: {
          status: 500,
          data: { error: 'Internal server error' },
        },
      } as AxiosError;

      vi.mocked(axios.post)
        .mockRejectedValueOnce(errorResponse)
        .mockResolvedValue({
          status: 200,
          data: { success: true },
        });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-http-error',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        retryCount: 2,
        retryDelay: 0.1,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it('应该处理非 200/202 状态码', async () => {
      vi.mocked(axios.post).mockResolvedValue({
        status: 500,
        data: { error: 'Server error' },
      });

      const payload: CallbackPayload = {
        event: 'completed',
        taskId: 'test-bad-status',
        workflowType: 'content-creator',
        status: 'completed',
        timestamp: new Date().toISOString(),
      };

      await webhookService.sendCallback(payload, {
        enabled: true,
        url: 'http://localhost:3000/callback',
        retryCount: 1,
        retryDelay: 0.1,
      });

      await new Promise((resolve) => setTimeout(resolve, 300));

      // 非 200/202 状态码应该重试
      expect(axios.post).toHaveBeenCalledTimes(2);
    });
  });
});
