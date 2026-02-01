/**
 * 翻译工作流集成测试
 *
 * 测试翻译工作流的完整流程：
 * - 工作流注册表注册和发现翻译工作流
 * - 翻译工作流状态创建
 * - 翻译工作流图创建
 * - 翻译工作流执行
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkflowRegistry } from '../../src/domain/workflow/WorkflowRegistry.js';
import { translationWorkflowFactory } from '../../src/domain/workflow/examples/TranslationWorkflow.js';

// Mock 日志模块
vi.mock('../../src/infrastructure/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('TranslationWorkflow - 集成测试', () => {
  beforeEach(() => {
    // 清空注册表（确保干净状态）
    WorkflowRegistry.clear();
    vi.clearAllMocks();
  });

  describe('工作流注册表集成', () => {
    it('应正确注册翻译工作流', () => {
      // 注册翻译工作流
      WorkflowRegistry.register(translationWorkflowFactory);

      // 验证工作流是否已注册
      expect(WorkflowRegistry.has('translation')).toBe(true);

      // 验证工作流元数据
      const metadata = WorkflowRegistry.getMetadata('translation');
      expect(metadata).toBeDefined();
      expect(metadata.name).toBe('翻译工作流');
      expect(metadata.description).toBe('基于 LLM 的文本翻译工作流，包含翻译和质量检查');
      expect(metadata.version).toBe('1.0.0');
    });

    it('应能创建翻译工作流状态', () => {
      // 注册翻译工作流
      WorkflowRegistry.register(translationWorkflowFactory);

      // 创建工作流状态
      const state = WorkflowRegistry.createState('translation', {
        taskId: 'test-translation-task',
        mode: 'sync',
        sourceText: 'Hello, world!',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        translationStyle: 'formal',
        domain: 'technology',
      });

      // 验证状态是否正确创建
      expect(state.taskId).toBe('test-translation-task');
      expect(state.sourceText).toBe('Hello, world!');
      expect(state.sourceLanguage).toBe('en');
      expect(state.targetLanguage).toBe('zh');
      expect(state.translationStyle).toBe('formal');
      expect(state.domain).toBe('technology');
      expect(state.translationRetryCount).toBe(0);
    });

    it('应能验证翻译工作流参数', () => {
      // 注册翻译工作流
      WorkflowRegistry.register(translationWorkflowFactory);

      // 验证有效参数
      const validParams = {
        taskId: 'test-task',
        mode: 'sync',
        sourceText: 'Hello, world!',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      };
      expect(WorkflowRegistry.validateParams('translation', validParams)).toBe(true);

      // 验证无效参数（缺少必要参数）
      const invalidParams = {
        taskId: 'test-task',
        mode: 'sync',
        sourceText: 'Hello, world!',
        sourceLanguage: 'en',
      };
      expect(WorkflowRegistry.validateParams('translation', invalidParams)).toBe(false);

      // 验证无效参数（源语言和目标语言相同）
      const sameLanguageParams = {
        taskId: 'test-task',
        mode: 'sync',
        sourceText: 'Hello, world!',
        sourceLanguage: 'en',
        targetLanguage: 'en',
      };
      expect(WorkflowRegistry.validateParams('translation', sameLanguageParams)).toBe(false);
    });

    it('应能创建翻译工作流图', () => {
      // 注册翻译工作流
      WorkflowRegistry.register(translationWorkflowFactory);

      // 创建工作流图
      const graph = WorkflowRegistry.createGraph('translation');

      // 验证图是否正确创建
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });
  });
});
