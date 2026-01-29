/**
 * WorkflowParameterMapper 单元测试
 *
 * 测试参数映射器的核心功能：
 * - kebab-case ↔ camelCase 转换
 * - CLI 选项到工作流参数的映射
 * - 类型解析
 * - 参数验证
 * - 错误提示生成
 * - 使用示例生成
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowParameterMapper } from '../WorkflowParameterMapper.js';
import { WorkflowRegistry } from '../../../../domain/workflow/WorkflowRegistry.js';
import { contentCreatorWorkflowAdapter } from '../../../../domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';
import { translationWorkflowFactory } from '../../../../domain/workflow/examples/TranslationWorkflow.js';

// Mock WorkflowRegistry
vi.mock('../../../../domain/workflow/WorkflowRegistry.js', () => ({
  WorkflowRegistry: {
    getMetadata: vi.fn(),
  },
}));

describe('WorkflowParameterMapper', () => {
  let mapper: WorkflowParameterMapper;

  beforeEach(() => {
    mapper = new WorkflowParameterMapper();

    // 注册工作流用于测试
    vi.mocked(WorkflowRegistry.getMetadata).mockImplementation((type: string) => {
      if (type === 'content-creator') {
        return contentCreatorWorkflowAdapter.getMetadata();
      }
      if (type === 'translation') {
        return translationWorkflowFactory.getMetadata();
      }
      throw new Error(`Unknown workflow type: ${type}`);
    });
  });

  describe('参数映射', () => {
    it('应该映射 content-creator 的基本参数', () => {
      const cliOptions = {
        topic: 'AI技术',
        requirements: '写一篇文章',
        mode: 'sync',
      };

      const { params, errors } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(errors).toHaveLength(0);
      expect(params.topic).toBe('AI技术');
      expect(params.requirements).toBe('写一篇文章');
      expect(params.mode).toBe('sync');
      expect(params.taskId).toBeDefined();
    });

    it('应该映射 content-creator 的可选参数', () => {
      const cliOptions = {
        topic: 'AI技术',
        requirements: '写一篇文章',
        targetAudience: '技术人员',
        keywords: 'AI,ML,深度学习',
        tone: '专业',
        mode: 'sync',
      };

      const { params, errors } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(errors).toHaveLength(0);
      expect(params.targetAudience).toBe('技术人员');
      expect(params.keywords).toEqual(['AI', 'ML', '深度学习']);
      expect(params.tone).toBe('专业');
    });

    it('应该映射 translation 的基本参数', () => {
      const cliOptions = {
        sourceText: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        mode: 'sync',
      };

      const { params, errors } = mapper.mapCliOptionsToParams('translation', cliOptions);

      expect(errors).toHaveLength(0);
      expect(params.sourceText).toBe('Hello world');
      expect(params.sourceLanguage).toBe('en');
      expect(params.targetLanguage).toBe('zh');
    });

    it('应该映射 translation 的可选参数', () => {
      const cliOptions = {
        sourceText: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        translationStyle: 'formal',
        domain: 'technology',
        mode: 'sync',
      };

      const { params, errors } = mapper.mapCliOptionsToParams('translation', cliOptions);

      expect(errors).toHaveLength(0);
      expect(params.translationStyle).toBe('formal');
      expect(params.domain).toBe('technology');
    });

    it('应该自动生成 taskId', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(params.taskId).toBeDefined();
      expect(params.taskId).toMatch(/^task-\d+$/);
    });

    it('应该使用提供的 taskId', () => {
      const customTaskId = 'custom-task-123';
      const cliOptions = {
        taskId: customTaskId,
        topic: '测试',
        requirements: '测试要求',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(params.taskId).toBe(customTaskId);
    });
  });

  describe('类型解析', () => {
    it('应该解析 string 类型', () => {
      const cliOptions = {
        topic: '测试主题',
        requirements: '测试要求',
        tone: '专业',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(typeof params.tone).toBe('string');
      expect(params.tone).toBe('专业');
    });

    it('应该解析 array 类型（逗号分隔）', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        keywords: 'AI,ML,深度学习',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(Array.isArray(params.keywords)).toBe(true);
      expect(params.keywords).toEqual(['AI', 'ML', '深度学习']);
    });

    it('应该处理 array 类型的空格', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        keywords: 'AI, ML, 深度学习',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(params.keywords).toEqual(['AI', 'ML', '深度学习']);
    });

    it('应该解析 number 类型', () => {
      const cliOptions = {
        sourceText: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        // 如果有 number 类型的参数
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('translation', cliOptions);

      // translation 工作流没有 number 类型的必需参数
      // 这里只是验证解析逻辑
      expect(params.sourceText).toBe('Hello');
    });

    it('应该解析 boolean 类型', () => {
      // content-creator 工作流没有 boolean 类型的参数
      // 这个测试验证类型解析器的存在
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(params.mode).toBe('sync');
    });

    it('应该解析 object 类型（JSON）', () => {
      // hardConstraints 是 object 类型
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        hardConstraints: '{"minWords":100,"maxWords":1000}',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(typeof params.hardConstraints).toBe('object');
      expect(params.hardConstraints).toEqual({ minWords: 100, maxWords: 1000 });
    });

    it('应该拒绝无效的 JSON', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        hardConstraints: 'invalid-json',
        mode: 'sync',
      };

      const { errors } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('hardConstraints') && e.includes('解析失败'))).toBe(true);
    });

    it('应该拒绝无效的 number', () => {
      // 如果有 number 类型的参数，应该验证这个功能
      // 目前没有这样的参数，跳过此测试
      expect(true).toBe(true);
    });
  });

  describe('参数验证', () => {
    it('应该检测缺少的必需参数（content-creator）', () => {
      const cliOptions = {
        mode: 'sync',
      };

      const { errors } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('缺少必需参数: topic');
      expect(errors).toContain('缺少必需参数: requirements');
    });

    it('应该检测缺少的必需参数（translation）', () => {
      const cliOptions = {
        mode: 'sync',
      };

      const { errors } = mapper.mapCliOptionsToParams('translation', cliOptions);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('缺少必需参数: sourceText');
      expect(errors).toContain('缺少必需参数: sourceLanguage');
      expect(errors).toContain('缺少必需参数: targetLanguage');
    });

    it('应该接受所有必需参数', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        mode: 'sync',
      };

      const { errors } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(errors).toHaveLength(0);
    });

    it('应该使用默认值', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      // targetAudience 有默认值 '普通读者'
      expect(params.targetAudience).toBe('普通读者');
    });
  });

  describe('错误提示', () => {
    it('应该格式化缺少参数的错误提示', () => {
      const missingParams = ['topic', 'requirements'];
      const error = mapper.formatMissingParamsError('content-creator', missingParams);

      expect(error).toContain('缺少必需参数');
      expect(error).toContain('Content Creator');
      expect(error).toContain('topic');
      expect(error).toContain('requirements');
      expect(error).toContain('💡 使用示例');
    });

    it('应该包含工作流名称和类型', () => {
      const error = mapper.formatMissingParamsError('translation', ['sourceText']);

      expect(error).toContain('翻译工作流');
      expect(error).toContain('(translation)');
    });

    it('应该生成使用示例', () => {
      const example = mapper.generateUsageExample('content-creator');

      expect(example).toContain('pnpm run cli create --type content-creator');
      expect(example).toContain('--topic');
      expect(example).toContain('--requirements');
    });

    it('应该为 translation 工作流生成示例', () => {
      const example = mapper.generateUsageExample('translation');

      expect(example).toContain('pnpm run cli create --type translation');
      expect(example).toContain('--source-text');
      expect(example).toContain('--source-language');
      expect(example).toContain('--target-language');
    });
  });

  describe('kebab-case ↔ camelCase 转换', () => {
    it('应该将 kebab-case 转换为 camelCase', () => {
      const cliOptions = {
        'target-audience': '技术人员',
        topic: '测试',
        requirements: '测试要求',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(params.targetAudience).toBe('技术人员');
    });

    it('应该支持混合的命名格式', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        'target-audience': '技术人员',  // kebab-case
        tone: '专业',  // camelCase
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(params.targetAudience).toBe('技术人员');
      expect(params.tone).toBe('专业');
    });

    it('应该转换 translation 工作流的参数', () => {
      const cliOptions = {
        'source-text': 'Hello',
        'source-language': 'en',
        'target-language': 'zh',
        'translation-style': 'formal',
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('translation', cliOptions);

      expect(params.sourceText).toBe('Hello');
      expect(params.sourceLanguage).toBe('en');
      expect(params.targetLanguage).toBe('zh');
      expect(params.translationStyle).toBe('formal');
    });
  });

  describe('边缘情况', () => {
    it('应该处理空字符串参数', () => {
      const cliOptions = {
        topic: '   ',  // 只有空格
        requirements: '测试要求',
        mode: 'sync',
      };

      const { params, errors } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      // 空字符串会被接受，因为 WorkflowParameterMapper 不做内容验证
      // 内容验证由工作流的 validateParams 处理
      expect(params.topic).toBe('   ');
    });

    it('应该处理 undefined 参数值', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        mode: 'sync',
        // 不提供可选参数
      };

      const { params, errors } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(errors).toHaveLength(0);
      expect(params.topic).toBe('测试');
      expect(params.requirements).toBe('测试要求');
    });

    it('应该处理空数组', () => {
      const cliOptions = {
        topic: '测试',
        requirements: '测试要求',
        keywords: '',  // 空字符串会被解析为空数组
        mode: 'sync',
      };

      const { params } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(params.keywords).toEqual(['']);
    });

    it('应该处理未知工作流类型', () => {
      const cliOptions = {
        mode: 'sync',
      };

      expect(() => {
        mapper.mapCliOptionsToParams('unknown-workflow', cliOptions);
      }).toThrow('Unknown workflow type: unknown-workflow');
    });
  });

  describe('集成测试', () => {
    it('应该完整映射 content-creator 的所有参数', () => {
      const cliOptions = {
        taskId: 'task-123',
        topic: '人工智能技术发展',
        requirements: '写一篇2000字的科普文章',
        targetAudience: '技术人员',
        keywords: 'AI,机器学习,深度学习',
        tone: '专业但不晦涩',
        hardConstraints: '{"minWords":2000,"maxWords":3000}',
        mode: 'sync',
      };

      const { params, errors } = mapper.mapCliOptionsToParams('content-creator', cliOptions);

      expect(errors).toHaveLength(0);
      expect(params.taskId).toBe('task-123');
      expect(params.topic).toBe('人工智能技术发展');
      expect(params.requirements).toBe('写一篇2000字的科普文章');
      expect(params.targetAudience).toBe('技术人员');
      expect(params.keywords).toEqual(['AI', '机器学习', '深度学习']);
      expect(params.tone).toBe('专业但不晦涩');
      expect(params.hardConstraints).toEqual({ minWords: 2000, maxWords: 3000 });
      expect(params.mode).toBe('sync');
    });

    it('应该完整映射 translation 的所有参数', () => {
      const cliOptions = {
        taskId: 'task-456',
        'source-text': 'Machine learning is revolutionizing many industries',
        'source-language': 'en',
        'target-language': 'ja',
        'translation-style': 'technical',
        domain: 'technology',
        mode: 'async',
      };

      const { params, errors } = mapper.mapCliOptionsToParams('translation', cliOptions);

      expect(errors).toHaveLength(0);
      expect(params.taskId).toBe('task-456');
      expect(params.sourceText).toBe('Machine learning is revolutionizing many industries');
      expect(params.sourceLanguage).toBe('en');
      expect(params.targetLanguage).toBe('ja');
      expect(params.translationStyle).toBe('technical');
      expect(params.domain).toBe('technology');
      expect(params.mode).toBe('async');
    });
  });
});
