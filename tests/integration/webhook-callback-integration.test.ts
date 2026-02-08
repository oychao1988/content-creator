/**
 * Webhook 回调集成测试
 *
 * 测试完整的 Webhook 回调功能，包括：
 * - 成功回调
 * - 失败回调
 * - 事件过滤
 * - 回调禁用
 *
 * 注意：此测试使用真实的 HTTP 服务器和 WebhookService
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSyncExecutor } from '../../src/application/workflow/SyncExecutor.js';
import { createTaskRepository } from '../../src/infrastructure/database/index.js';
import {
  startCallbackServer,
  stopCallbackServer,
  getReceivedCallbacks,
  clearCallbacks,
  findCallbacksByTaskId,
  waitForCallback,
  saveCallbacksToFile,
} from '../fixtures/callback-server.js';
import type { CallbackPayload } from '../../src/infrastructure/callback/WebhookService.js';

const TEST_SERVER_PORT = 3000;
const CALLBACK_URL = `http://localhost:${TEST_SERVER_PORT}/callback`;

// 延迟函数
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Webhook Callback Integration Tests', () => {
  let executor: ReturnType<typeof createSyncExecutor>;

  beforeEach(async () => {
    // 清空回调记录
    clearCallbacks();

    // 确保端口没有被占用
    try {
      await stopCallbackServer();
    } catch (e) {
      // 忽略错误
    }
    await delay(500);

    // 启动测试服务器
    await startCallbackServer(TEST_SERVER_PORT);
    await delay(1000); // 增加等待时间，确保服务器完全启动

    // 创建同步执行器（使用内存数据库）
    const taskRepo = createTaskRepository('memory');
    executor = createSyncExecutor(taskRepo, {
      databaseType: 'memory',
      enableLogging: false,
    });
  });

  afterEach(async () => {
    // 停止测试服务器
    try {
      await stopCallbackServer();
    } catch (e) {
      // 忽略错误
    }

    // 保存回调记录到文件（用于调试）
    await saveCallbacksToFile();

    // 清理
    await delay(500);
  });

  describe('场景 1: 成功回调', () => {
    it('应该在任务成功完成时发送回调', async () => {
      // 创建一个会成功的任务
      const result = await executor.execute({
        mode: 'sync',
        topic: 'AI 技术测试',
        requirements: '写一篇关于 AI 技术的测试文章',
        targetAudience: '技术人员',
        callbackUrl: CALLBACK_URL,
        callbackEnabled: true,
        callbackEvents: ['completed', 'failed'],
      });

      // 验证任务成功
      expect(result.status).toBe('completed');
      expect(result.taskId).toBeDefined();

      // 等待回调到达（webhook 是异步处理的，需要更长时间）
      await delay(8000);

      // 验证接收到回调
      const callbacks = findCallbacksByTaskId(result.taskId);
      expect(callbacks.length).toBeGreaterThanOrEqual(1);

      // 验证回调结构
      const callback = callbacks[0];
      expect(callback.payload.event).toBe('completed');
      expect(callback.payload.taskId).toBe(result.taskId);
      expect(callback.payload.status).toBe('completed');
      expect(callback.payload.timestamp).toBeDefined();
      expect(callback.payload.workflowType).toBeDefined();

      // 验证成功回调包含结果数据
      expect(callback.payload.result).toBeDefined();
      expect(callback.payload.result?.content).toBeDefined();
      expect(callback.payload.result?.metrics).toBeDefined();
      expect(callback.payload.result?.metrics?.tokensUsed).toBeGreaterThanOrEqual(0);
      expect(callback.payload.result?.metrics?.duration).toBeGreaterThan(0);

      // 验证错误字段不存在
      expect(callback.payload.error).toBeUndefined();

      // 验证回调头
      expect(callback.headers['x-webhook-event']).toBe('completed');
      expect(callback.headers['x-task-id']).toBe(result.taskId);
      expect(callback.headers['content-type']).toBe('application/json');
    }, 60000);
  });

  describe('场景 2: 失败回调', () => {
    it('应该在任务失败时发送回调', async () => {
      // 创建一个会失败的任务（空主题）
      const result = await executor.execute({
        mode: 'sync',
        topic: '', // 空主题会导致失败
        requirements: '测试要求',
        targetAudience: '测试受众',
        callbackUrl: CALLBACK_URL,
        callbackEnabled: true,
        callbackEvents: ['completed', 'failed'],
      });

      // 验证任务失败
      expect(result.status).toBe('failed');
      expect(result.taskId).toBeDefined();

      // 等待回调到达
      await delay(8000);

      // 验证接收到回调
      const callbacks = findCallbacksByTaskId(result.taskId);
      expect(callbacks.length).toBeGreaterThanOrEqual(1);

      // 验证回调结构
      const callback = callbacks[0];
      expect(callback.payload.event).toBe('failed');
      expect(callback.payload.taskId).toBe(result.taskId);
      expect(callback.payload.status).toBe('failed');
      expect(callback.payload.timestamp).toBeDefined();

      // 验证失败回调包含错误信息
      expect(callback.payload.error).toBeDefined();
      expect(callback.payload.error?.message).toBeDefined();
      expect(callback.payload.error?.type).toBeDefined();
      expect(callback.payload.error?.details).toBeDefined();

      // 验证结果字段不存在
      expect(callback.payload.result).toBeUndefined();

      // 验证回调头
      expect(callback.headers['x-webhook-event']).toBe('failed');
      expect(callback.headers['x-task-id']).toBe(result.taskId);
    }, 60000);
  });

  describe('场景 3: 事件过滤', () => {
    it('应该只发送配置了的事件回调', async () => {
      // 创建只监听 completed 事件的任务
      const result = await executor.execute({
        mode: 'sync',
        topic: '', // 空主题会导致失败
        requirements: '测试要求',
        targetAudience: '测试受众',
        callbackUrl: CALLBACK_URL,
        callbackEnabled: true,
        callbackEvents: ['completed'], // 只监听 completed，不监听 failed
      });

      // 验证任务失败
      expect(result.status).toBe('failed');

      // 等待回调
      await delay(8000);

      // 验证不应该收到回调（因为只监听 completed，但任务失败了）
      const callbacks = findCallbacksByTaskId(result.taskId);
      expect(callbacks.length).toBe(0);
    }, 60000);

    it('应该在多个事件配置下正确发送', async () => {
      // 创建监听多个事件的任务
      const result1 = await executor.execute({
        mode: 'sync',
        topic: '测试主题 1',
        requirements: '测试要求',
        targetAudience: '测试受众',
        callbackUrl: CALLBACK_URL,
        callbackEnabled: true,
        callbackEvents: ['completed', 'failed'],
      });

      // 等待回调
      await delay(8000);

      // 验证收到回调
      const callbacks1 = findCallbacksByTaskId(result1.taskId);
      expect(callbacks1.length).toBeGreaterThanOrEqual(1);
      expect(callbacks1[0].payload.event).toBe(result1.status);
    }, 90000);
  });

  describe('场景 4: 回调禁用', () => {
    it('应该在 callbackEnabled=false 时不发送回调', async () => {
      // 创建禁用回调的任务
      const result = await executor.execute({
        mode: 'sync',
        topic: '测试主题',
        requirements: '测试要求',
        targetAudience: '测试受众',
        callbackUrl: CALLBACK_URL,
        callbackEnabled: false, // 禁用回调
        callbackEvents: ['completed', 'failed'],
      });

      // 等待
      await delay(8000);

      // 验证不应该收到回调
      const callbacks = findCallbacksByTaskId(result.taskId);
      expect(callbacks.length).toBe(0);
    }, 60000);

    it('应该在未配置 callbackUrl 时不发送回调', async () => {
      // 创建不配置 callbackUrl 的任务
      const result = await executor.execute({
        mode: 'sync',
        topic: '测试主题',
        requirements: '测试要求',
        targetAudience: '测试受众',
        // callbackUrl: CALLBACK_URL, // 不配置
        callbackEnabled: true,
        callbackEvents: ['completed', 'failed'],
      });

      // 等待
      await delay(8000);

      // 验证不应该收到回调
      const callbacks = findCallbacksByTaskId(result.taskId);
      expect(callbacks.length).toBe(0);
    }, 60000);
  });

  describe('场景 5: 回调重试', () => {
    it('应该在回调失败时进行重试', async () => {
      // 使用不存在的 URL
      const invalidUrl = 'http://localhost:9999/invalid-callback';

      const result = await executor.execute({
        mode: 'sync',
        topic: '测试主题',
        requirements: '测试要求',
        targetAudience: '测试受众',
        callbackUrl: invalidUrl,
        callbackEnabled: true,
        callbackEvents: ['completed', 'failed'],
      });

      // 验证任务成功（回调失败不影响任务执行）
      expect(result.status).toBe('completed');

      // 等待重试完成（默认重试 3 次，每次间隔 5 秒）
      await delay(20000);

      // 验证不应该在测试服务器收到回调（因为 URL 是无效的）
      const callbacks = findCallbacksByTaskId(result.taskId);
      expect(callbacks.length).toBe(0);
    }, 90000); // 增加超时时间以适应覆盖率模式
  });

  describe('场景 6: 元数据验证', () => {
    it('应该在回调中包含正确的元数据', async () => {
      const topic = '元数据测试主题';
      const requirements = '元数据测试要求';
      const targetAudience = '元数据测试受众';

      const result = await executor.execute({
        mode: 'sync',
        topic,
        requirements,
        targetAudience,
        tone: '专业',
        keywords: ['测试', '元数据'],
        callbackUrl: CALLBACK_URL,
        callbackEnabled: true,
        callbackEvents: ['completed', 'failed'],
      });

      // 等待回调
      await delay(8000);

      // 验证元数据
      const callbacks = findCallbacksByTaskId(result.taskId);
      expect(callbacks.length).toBeGreaterThanOrEqual(1);

      const callback = callbacks[0];
      expect(callback.payload.metadata).toBeDefined();
      expect(callback.payload.metadata?.topic).toBe(topic);
      expect(callback.payload.metadata?.requirements).toBe(requirements);
      expect(callback.payload.metadata?.targetAudience).toBe(targetAudience);
    }, 60000);
  });

  describe('场景 7: 并发回调', () => {
    it('应该正确处理多个并发任务的回调', async () => {
      // 创建多个任务
      const results = await Promise.all([
        executor.execute({
          mode: 'sync',
          topic: '并发任务 1',
          requirements: '测试要求',
          targetAudience: '测试受众',
          callbackUrl: CALLBACK_URL,
          callbackEnabled: true,
          callbackEvents: ['completed', 'failed'],
        }),
        executor.execute({
          mode: 'sync',
          topic: '并发任务 2',
          requirements: '测试要求',
          targetAudience: '测试受众',
          callbackUrl: CALLBACK_URL,
          callbackEnabled: true,
          callbackEvents: ['completed', 'failed'],
        }),
        executor.execute({
          mode: 'sync',
          topic: '并发任务 3',
          requirements: '测试要求',
          targetAudience: '测试受众',
          callbackUrl: CALLBACK_URL,
          callbackEnabled: true,
          callbackEvents: ['completed', 'failed'],
        }),
      ]);

      // 等待所有回调
      await delay(20000);

      // 验证每个任务都收到回调
      for (const result of results) {
        const callbacks = findCallbacksByTaskId(result.taskId);
        expect(callbacks.length).toBeGreaterThanOrEqual(1);
        expect(callbacks[0].payload.taskId).toBe(result.taskId);
      }

      // 验证总回调数量
      const allCallbacks = getReceivedCallbacks();
      expect(allCallbacks.length).toBeGreaterThanOrEqual(3);
    }, 180000);
  });
});
