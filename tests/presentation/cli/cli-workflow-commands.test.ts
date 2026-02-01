/**
 * CLI Workflow Commands 单元测试
 *
 * 测试工作流管理命令的核心功能：
 * - workflow list
 * - workflow info
 * - 过滤功能
 * - JSON 输出格式
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowRegistry } from '../../../src/domain/workflow/WorkflowRegistry.js';
import { contentCreatorWorkflowAdapter } from '../../../src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';
import { translationWorkflowFactory } from '../../../src/domain/workflow/examples/TranslationWorkflow.js';

describe('CLI Workflow Commands Unit Tests', () => {
  beforeEach(() => {
    // 初始化注册表（如果尚未注册）
    if (!WorkflowRegistry.has('content-creator')) {
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);
    }
    if (!WorkflowRegistry.has('translation')) {
      WorkflowRegistry.register(translationWorkflowFactory);
    }
  });

  describe('WorkflowRegistry functionality', () => {
    it('should list all registered workflows', () => {
      const workflows = WorkflowRegistry.listWorkflows();

      expect(workflows.length).toBeGreaterThanOrEqual(2);

      const contentCreator = workflows.find((w: any) => w.type === 'content-creator');
      expect(contentCreator).toBeDefined();
      expect(contentCreator?.name).toBe('Content Creator');

      const translation = workflows.find((w: any) => w.type === 'translation');
      expect(translation).toBeDefined();
      expect(translation?.name).toBe('翻译工作流');
    });

    it('should filter by category', () => {
      const workflows = WorkflowRegistry.listWorkflows({ category: 'translation' });

      expect(workflows.length).toBeGreaterThanOrEqual(1);
      workflows.forEach((w: any) => {
        expect(w.category).toBe('translation');
      });
    });

    it('should filter by tag', () => {
      const workflows = WorkflowRegistry.listWorkflows({ tags: ['llm'] });

      expect(workflows.length).toBeGreaterThanOrEqual(1);
      workflows.forEach((w: any) => {
        expect(w.tags).toContain('llm');
      });
    });

    it('should filter by multiple tags', () => {
      const workflows = WorkflowRegistry.listWorkflows({ tags: ['translation', 'quality-check'] });

      // translation workflow has both tags
      const translation = workflows.find((w: any) => w.type === 'translation');
      expect(translation).toBeDefined();
    });

    it('should get workflow metadata for content-creator', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe('content-creator');
      expect(metadata?.name).toBe('Content Creator');
      expect(metadata?.requiredParams).toBeDefined();
      expect(metadata?.optionalParams).toBeDefined();
      expect(metadata?.examples).toBeDefined();
    });

    it('should get workflow metadata for translation', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');

      expect(metadata).toBeDefined();
      expect(metadata?.type).toBe('translation');
      expect(metadata?.name).toBe('翻译工作流');
      expect(metadata?.requiredParams).toContain('sourceText');
      expect(metadata?.requiredParams).toContain('sourceLanguage');
      expect(metadata?.requiredParams).toContain('targetLanguage');
    });

    it('should return undefined for non-existent workflow', () => {
      expect(() => {
        WorkflowRegistry.getMetadata('non-existent');
      }).toThrow('Unknown workflow type: non-existent');
    });

    it('should check if workflow exists', () => {
      expect(WorkflowRegistry.has('content-creator')).toBe(true);
      expect(WorkflowRegistry.has('translation')).toBe(true);
      expect(WorkflowRegistry.has('non-existent')).toBe(false);
    });

    it('should list workflow types', () => {
      const types = WorkflowRegistry.listWorkflowTypes();

      expect(types).toContain('content-creator');
      expect(types).toContain('translation');
      expect(types.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Workflow metadata validation', () => {
    it('should have complete content-creator metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata?.type).toBe('content-creator');
      expect(metadata?.version).toBeDefined();
      expect(metadata?.name).toBeDefined();
      expect(metadata?.description).toBeDefined();
      expect(metadata?.category).toBeDefined();
      expect(metadata?.tags).toBeDefined();
      expect(Array.isArray(metadata?.tags)).toBe(true);
      expect(metadata?.requiredParams).toBeDefined();
      expect(metadata?.optionalParams).toBeDefined();
      expect(metadata?.examples).toBeDefined();
      expect(Array.isArray(metadata?.examples)).toBe(true);
    });

    it('should have complete translation metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');

      expect(metadata?.type).toBe('translation');
      expect(metadata?.version).toBeDefined();
      expect(metadata?.name).toBeDefined();
      expect(metadata?.description).toBeDefined();
      expect(metadata?.category).toBe('translation');
      expect(metadata?.tags).toContain('translation');
      expect(metadata?.tags).toContain('llm');
      expect(metadata?.tags).toContain('quality-check');
      expect(metadata?.requiredParams).toEqual(['sourceText', 'sourceLanguage', 'targetLanguage']);
      expect(metadata?.optionalParams).toEqual(['translationStyle', 'domain']);
      expect(metadata?.examples.length).toBe(2);
    });

    it('should have valid examples in translation metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');
      const examples = metadata?.examples || [];

      expect(examples.length).toBe(2);

      const example1 = examples[0];
      expect(example1.name).toBe('中英翻译');
      expect(example1.description).toBeDefined();
      expect(example1.params).toBeDefined();
      expect(example1.params.sourceText).toBeDefined();
      expect(example1.params.sourceLanguage).toBe('zh');
      expect(example1.params.targetLanguage).toBe('en');

      const example2 = examples[1];
      expect(example2.name).toBe('英日翻译');
      expect(example2.description).toBeDefined();
      expect(example2.params).toBeDefined();
      expect(example2.params.sourceText).toBeDefined();
      expect(example2.params.sourceLanguage).toBe('en');
      expect(example2.params.targetLanguage).toBe('ja');
    });

    it('should have paramDefinitions in content-creator metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata?.paramDefinitions).toBeDefined();
      expect(metadata?.paramDefinitions?.length).toBeGreaterThan(0);

      // 验证 topic 参数
      const topicParam = metadata?.paramDefinitions?.find(p => p.name === 'topic');
      expect(topicParam).toBeDefined();
      expect(topicParam?.type).toBe('string');
      expect(topicParam?.required).toBe(true);
      expect(topicParam?.description).toContain('主题');

      // 验证 requirements 参数
      const requirementsParam = metadata?.paramDefinitions?.find(p => p.name === 'requirements');
      expect(requirementsParam).toBeDefined();
      expect(requirementsParam?.type).toBe('string');
      expect(requirementsParam?.required).toBe(true);

      // 验证可选参数
      const keywordsParam = metadata?.paramDefinitions?.find(p => p.name === 'keywords');
      expect(keywordsParam).toBeDefined();
      expect(keywordsParam?.type).toBe('array');
      expect(keywordsParam?.required).toBe(false);
    });

    it('should have paramDefinitions in translation metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');

      expect(metadata?.paramDefinitions).toBeDefined();
      expect(metadata?.paramDefinitions?.length).toBe(5);

      // 验证必需参数
      const sourceTextParam = metadata?.paramDefinitions?.find(p => p.name === 'sourceText');
      expect(sourceTextParam?.required).toBe(true);

      const sourceLanguageParam = metadata?.paramDefinitions?.find(p => p.name === 'sourceLanguage');
      expect(sourceLanguageParam?.required).toBe(true);

      const targetLanguageParam = metadata?.paramDefinitions?.find(p => p.name === 'targetLanguage');
      expect(targetLanguageParam?.required).toBe(true);

      // 验证可选参数
      const translationStyleParam = metadata?.paramDefinitions?.find(p => p.name === 'translationStyle');
      expect(translationStyleParam?.required).toBe(false);
    });

    it('should have stepNames in content-creator metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata?.stepNames).toBeDefined();
      expect(metadata?.stepNames?.['search']).toBe('搜索内容');
      expect(metadata?.stepNames?.['organize']).toBe('组织信息');
      expect(metadata?.stepNames?.['write']).toBe('撰写内容');
      expect(metadata?.stepNames?.['check_text']).toBe('文本质检');
      expect(metadata?.stepNames?.['generate_image']).toBe('生成配图');
      expect(metadata?.stepNames?.['check_image']).toBe('图片质检');
    });

    it('should have stepNames in translation metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');

      expect(metadata?.stepNames).toBeDefined();
      expect(metadata?.stepNames?.['translate']).toBe('翻译');
      expect(metadata?.stepNames?.['checkQuality']).toBe('质检');
    });

    it('should have retryFields in content-creator metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata?.retryFields).toBeDefined();
      expect(metadata?.retryFields?.length).toBe(2);

      const textRetryField = metadata?.retryFields?.find(f => f.name === 'textRetryCount');
      expect(textRetryField).toBeDefined();
      expect(textRetryField?.displayName).toBe('文本重试');

      const imageRetryField = metadata?.retryFields?.find(f => f.name === 'imageRetryCount');
      expect(imageRetryField).toBeDefined();
      expect(imageRetryField?.displayName).toBe('图片重试');
    });

    it('should have retryFields in translation metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');

      expect(metadata?.retryFields).toBeDefined();
      expect(metadata?.retryFields?.length).toBe(1);
      expect(metadata?.retryFields?.[0].name).toBe('translationRetryCount');
      expect(metadata?.retryFields?.[0].displayName).toBe('翻译重试');
    });
  });

  describe('Workflow factory methods', () => {
    it('should get content-creator factory', () => {
      const factory = WorkflowRegistry.getFactory('content-creator');

      expect(factory).toBeDefined();
      expect(factory?.type).toBe('content-creator');
      expect(factory?.version).toBeDefined();
      expect(factory?.name).toBeDefined();
      expect(factory?.createGraph).toBeDefined();
      expect(factory?.createState).toBeDefined();
      expect(factory?.validateParams).toBeDefined();
      expect(factory?.getMetadata).toBeDefined();
    });

    it('should get translation factory', () => {
      const factory = WorkflowRegistry.getFactory('translation');

      expect(factory).toBeDefined();
      expect(factory?.type).toBe('translation');
      expect(factory?.version).toBe('1.0.0');
      expect(factory?.name).toBe('翻译工作流');
    });

    it('should return undefined for non-existent factory', () => {
      expect(() => {
        WorkflowRegistry.getFactory('non-existent');
      }).toThrow(/Unknown workflow type: non-existent/);
    });
  });

  describe('State creation', () => {
    it('should create content-creator state', () => {
      const state = WorkflowRegistry.createState('content-creator', {
        taskId: 'task-123',
        mode: 'sync',
        topic: 'Test topic',
        requirements: 'Test requirements',
      });

      expect(state.taskId).toBe('task-123');
      expect(state.workflowType).toBe('content-creator');
      expect(state.topic).toBe('Test topic');
      expect(state.requirements).toBe('Test requirements');
    });

    it('should create translation state', () => {
      const state = WorkflowRegistry.createState('translation', {
        taskId: 'task-456',
        mode: 'sync',
        sourceText: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      });

      expect(state.taskId).toBe('task-456');
      expect(state.workflowType).toBe('translation');
      expect(state.sourceText).toBe('Hello world');
      expect(state.sourceLanguage).toBe('en');
      expect(state.targetLanguage).toBe('zh');
    });

    it('should throw error for non-existent workflow type', () => {
      expect(() => {
        WorkflowRegistry.createState('non-existent', {
          taskId: 'task-789',
        } as any);
      }).toThrow();
    });
  });

  describe('Graph creation', () => {
    it('should create content-creator graph', () => {
      const graph = WorkflowRegistry.createGraph('content-creator');

      expect(graph).toBeDefined();
      expect(graph).toHaveProperty('nodes');
    });

    it('should create translation graph', () => {
      const graph = WorkflowRegistry.createGraph('translation');

      expect(graph).toBeDefined();
      expect(graph).toHaveProperty('nodes');
    });
  });
});
