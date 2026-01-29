/**
 * TranslationWorkflow 单元测试
 *
 * 测试翻译工作流的核心功能：
 * - 工作流工厂功能
 * - 状态创建和验证
 * - 参数验证
 * - 元数据获取
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TranslationWorkflowFactory } from '../TranslationWorkflow.js';
import type { TranslationState } from '../TranslationWorkflow.js';
import { ExecutionMode } from '../../../entities/Task.js';

// Mock WorkflowRegistry to avoid registration issues
vi.mock('../../WorkflowRegistry.js', () => ({
  WorkflowRegistry: {
    has: vi.fn(() => true),
    register: vi.fn(),
    get: vi.fn(),
    clear: vi.fn(),
  },
  getWorkflowMetadata: vi.fn(),
}));

describe('TranslationWorkflow', () => {
  let factory: TranslationWorkflowFactory;

  // Helper function to create valid params with default mode
  const createParams = (params: any): any => ({
    mode: ExecutionMode.SYNC,
    ...params,
  });

  beforeEach(() => {
    factory = new TranslationWorkflowFactory();
  });

  describe('TranslationWorkflowFactory', () => {
    it('should have correct metadata', () => {
      expect(factory.type).toBe('translation');
      expect(factory.version).toBe('1.0.0');
      expect(factory.name).toBe('翻译工作流');
      expect(factory.description).toContain('翻译');
    });

    it('should create a graph', () => {
      const graph = factory.createGraph();
      expect(graph).toBeDefined();
      expect(graph).toHaveProperty('nodes');
    });

    it('should return complete metadata', () => {
      const metadata = factory.getMetadata();

      expect(metadata.type).toBe('translation');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.name).toBe('翻译工作流');
      expect(metadata.category).toBe('translation');
      expect(metadata.tags).toContain('translation');
      expect(metadata.tags).toContain('llm');
      expect(metadata.tags).toContain('quality-check');
      expect(metadata.requiredParams).toContain('sourceText');
      expect(metadata.requiredParams).toContain('sourceLanguage');
      expect(metadata.requiredParams).toContain('targetLanguage');
      expect(metadata.optionalParams).toContain('translationStyle');
      expect(metadata.optionalParams).toContain('domain');
      expect(metadata.examples).toHaveLength(2);
    });

    it('should have paramDefinitions in metadata', () => {
      const metadata = factory.getMetadata();

      expect(metadata.paramDefinitions).toBeDefined();
      expect(metadata.paramDefinitions?.length).toBe(5);

      // 验证 sourceText 参数定义
      const sourceTextParam = metadata.paramDefinitions?.find(p => p.name === 'sourceText');
      expect(sourceTextParam).toBeDefined();
      expect(sourceTextParam?.description).toBe('待翻译的文本');
      expect(sourceTextParam?.type).toBe('string');
      expect(sourceTextParam?.required).toBe(true);

      // 验证 sourceLanguage 参数定义
      const sourceLanguageParam = metadata.paramDefinitions?.find(p => p.name === 'sourceLanguage');
      expect(sourceLanguageParam).toBeDefined();
      expect(sourceLanguageParam?.type).toBe('string');
      expect(sourceLanguageParam?.required).toBe(true);
      expect(sourceLanguageParam?.examples).toContain('en');
      expect(sourceLanguageParam?.examples).toContain('zh');

      // 验证 targetLanguage 参数定义
      const targetLanguageParam = metadata.paramDefinitions?.find(p => p.name === 'targetLanguage');
      expect(targetLanguageParam).toBeDefined();
      expect(targetLanguageParam?.type).toBe('string');
      expect(targetLanguageParam?.required).toBe(true);

      // 验证可选参数
      const translationStyleParam = metadata.paramDefinitions?.find(p => p.name === 'translationStyle');
      expect(translationStyleParam).toBeDefined();
      expect(translationStyleParam?.required).toBe(false);
      expect(translationStyleParam?.examples).toContain('formal');
    });

    it('should have stepNames in metadata', () => {
      const metadata = factory.getMetadata();

      expect(metadata.stepNames).toBeDefined();
      expect(metadata.stepNames?.['translate']).toBe('翻译');
      expect(metadata.stepNames?.['checkQuality']).toBe('质检');
    });

    it('should have retryFields in metadata', () => {
      const metadata = factory.getMetadata();

      expect(metadata.retryFields).toBeDefined();
      expect(metadata.retryFields?.length).toBe(1);
      expect(metadata.retryFields?.[0].name).toBe('translationRetryCount');
      expect(metadata.retryFields?.[0].displayName).toBe('翻译重试');
    });

    describe('validateParams', () => {
      it('should validate valid parameters', () => {
        const params = createParams({
          taskId: 'task-123',
          sourceText: 'Hello world',
          sourceLanguage: 'en',
          targetLanguage: 'zh',
        });

        expect(factory.validateParams(params)).toBe(true);
      });

      it('should reject missing required parameters', () => {
        const params1 = createParams({
          taskId: 'task-123',
          sourceText: 'Hello',
          sourceLanguage: 'en',
          // 缺少 targetLanguage
        });
        expect(factory.validateParams(params1)).toBe(false);

        const params2 = createParams({
          taskId: 'task-123',
          sourceText: 'Hello',
          // 缺少 sourceLanguage 和 targetLanguage
        });
        expect(factory.validateParams(params2)).toBe(false);
      });

      it('should reject empty source text', () => {
        const params = createParams({
          taskId: 'task-123',
          sourceText: '   ',  // 只有空格
          sourceLanguage: 'en',
          targetLanguage: 'zh',
        });

        expect(factory.validateParams(params)).toBe(false);
      });

      it('should reject same source and target language', () => {
        const params = createParams({
          taskId: 'task-123',
          sourceText: 'Hello world',
          sourceLanguage: 'en',
          targetLanguage: 'EN',  // 相同语言（大小写不同）
        });

        expect(factory.validateParams(params)).toBe(false);
      });

      it('should accept valid optional parameters', () => {
        const params = createParams({
          taskId: 'task-123',
          sourceText: 'Hello world',
          sourceLanguage: 'en',
          targetLanguage: 'zh',
          translationStyle: 'formal',
          domain: 'technology',
        });

        expect(factory.validateParams(params)).toBe(true);
      });
    });

    describe('createState', () => {
      it('should create a valid translation state', () => {
        const params = createParams({
          taskId: 'task-123',
          sourceText: 'Hello world',
          sourceLanguage: 'en',
          targetLanguage: 'zh',
          translationStyle: 'formal',
          domain: 'technology',
        });

        const state = factory.createState(params);

        expect(state.taskId).toBe('task-123');
        expect(state.workflowType).toBe('translation');
        expect(state.sourceText).toBe('Hello world');
        expect(state.sourceLanguage).toBe('en');
        expect(state.targetLanguage).toBe('zh');
        expect(state.translationStyle).toBe('formal');
        expect(state.domain).toBe('technology');
        expect(state.translationRetryCount).toBe(0);
      });

      it('should create state with default values', () => {
        const params = createParams({
          taskId: 'task-456',
          sourceText: 'Test text',
          sourceLanguage: 'zh',
          targetLanguage: 'en',
        });

        const state = factory.createState(params);

        expect(state.taskId).toBe('task-456');
        expect(state.workflowType).toBe('translation');
        expect(state.mode).toBe(ExecutionMode.SYNC);  // 默认值
        expect(state.translationStyle).toBeUndefined();
        expect(state.domain).toBeUndefined();
        expect(state.translationRetryCount).toBe(0);
      });

      it('should throw error for missing sourceText', () => {
        const params = createParams({
          taskId: 'task-123',
          sourceLanguage: 'en',
          targetLanguage: 'zh',
        } as any);

        expect(() => factory.createState(params)).toThrow('Missing required parameter: sourceText');
      });

      it('should throw error for missing sourceLanguage', () => {
        const params = createParams({
          taskId: 'task-123',
          sourceText: 'Hello',
          targetLanguage: 'zh',
        } as any);

        expect(() => factory.createState(params)).toThrow('Missing required parameter: sourceLanguage');
      });

      it('should throw error for missing targetLanguage', () => {
        const params = createParams({
          taskId: 'task-123',
          sourceText: 'Hello',
          sourceLanguage: 'en',
        } as any);

        expect(() => factory.createState(params)).toThrow('Missing required parameter: targetLanguage');
      });
    });
  });

  describe('TranslationState structure', () => {
    it('should have all required fields', () => {
      const params = createParams({
        taskId: 'task-123',
        sourceText: 'Test',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      });

      const state = factory.createState(params);

      // 基础字段
      expect(state).toHaveProperty('taskId');
      expect(state).toHaveProperty('workflowType');
      expect(state).toHaveProperty('mode');
      expect(state).toHaveProperty('retryCount');
      expect(state).toHaveProperty('currentStep');
      expect(state).toHaveProperty('startTime');
      expect(state).toHaveProperty('version');

      // 输入参数
      expect(state).toHaveProperty('sourceText');
      expect(state).toHaveProperty('sourceLanguage');
      expect(state).toHaveProperty('targetLanguage');
      expect(state).toHaveProperty('translationStyle');
      expect(state).toHaveProperty('domain');

      // 流程数据（这些字段在状态创建时可能为 undefined）
      expect(state.translatedText).toBeUndefined();
      expect(state.previousTranslation).toBeUndefined();

      // 质检数据（可选字段，初始状态可能不存在）
      expect(state.qualityReport).toBeUndefined();

      // 控制数据
      expect(state).toHaveProperty('translationRetryCount');
    });
  });

  describe('Examples in metadata', () => {
    it('should have valid example 1 (Chinese to English)', () => {
      const metadata = factory.getMetadata();
      expect(metadata.examples).toBeDefined();
      expect(metadata.examples?.length).toBeGreaterThanOrEqual(1);

      const example1 = metadata.examples?.[0];
      expect(example1).toBeDefined();

      expect(example1?.name).toBe('中英翻译');
      expect(example1?.description).toContain('中文');
      expect(example1?.params.sourceText).toBe('人工智能正在改变世界');
      expect(example1?.params.sourceLanguage).toBe('zh');
      expect(example1?.params.targetLanguage).toBe('en');
      expect(example1?.params.translationStyle).toBe('formal');
      expect(example1?.params.domain).toBe('technology');
    });

    it('should have valid example 2 (English to Japanese)', () => {
      const metadata = factory.getMetadata();
      expect(metadata.examples).toBeDefined();
      expect(metadata.examples?.length).toBeGreaterThanOrEqual(2);

      const example2 = metadata.examples?.[1];
      expect(example2).toBeDefined();

      expect(example2?.name).toBe('英日翻译');
      expect(example2?.description).toContain('英文');
      expect(example2?.params.sourceText).toBe('Machine learning is revolutionizing many industries');
      expect(example2?.params.sourceLanguage).toBe('en');
      expect(example2?.params.targetLanguage).toBe('ja');
      expect(example2?.params.translationStyle).toBe('technical');
      expect(example2?.params.domain).toBe('technology');
    });
  });

  describe('State mutations', () => {
    it('should allow updating translatedText', () => {
      const params = createParams({
        taskId: 'task-123',
        sourceText: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      });

      const state = factory.createState(params);
      expect(state.translatedText).toBeUndefined();

      const updatedState: Partial<TranslationState> = {
        ...state,
        translatedText: '你好',
      };

      expect(updatedState.translatedText).toBe('你好');
    });

    it('should allow setting qualityReport', () => {
      const params = createParams({
        taskId: 'task-123',
        sourceText: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      });

      const state = factory.createState(params);
      expect(state.qualityReport).toBeUndefined();

      const qualityReport = {
        score: 9.0,
        passed: true,
        fixSuggestions: [] as string[],
        checkedAt: Date.now(),
      };

      const updatedState: Partial<TranslationState> = {
        ...state,
        qualityReport,
      };

      expect(updatedState.qualityReport).toEqual(qualityReport);
    });

    it('should allow incrementing translationRetryCount', () => {
      const params = createParams({
        taskId: 'task-123',
        sourceText: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      });

      const state = factory.createState(params);
      expect(state.translationRetryCount).toBe(0);

      const updatedState: Partial<TranslationState> = {
        ...state,
        translationRetryCount: state.translationRetryCount + 1,
      };

      expect(updatedState.translationRetryCount).toBe(1);
    });
  });
});
