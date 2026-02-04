/**
 * CLI Workflows Integration Tests
 *
 * 端到端测试 CLI 对所有已注册工作流的支持：
 * - content-creator（内容创作工作流）
 * - content-creator-agent（ReAct Agent 工作流）
 * - translation（翻译工作流）
 *
 * 测试重点：
 * - workflow list 命令
 * - workflow info 命令
 * - 参数映射和验证
 * - 不同工作流的 CLI 支持
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowRegistry } from '../../../src/domain/workflow/WorkflowRegistry.js';
import { ensureWorkflowsInitialized } from '../../../src/domain/workflow/initialize.js';
import { workflowParameterMapper } from '../../../src/presentation/cli/utils/WorkflowParameterMapper.js';
import { MockTaskRepository, MockResultRepository } from '../../helpers/TestHelpers.js';

describe('CLI Workflows Integration Tests', () => {
  beforeEach(() => {
    // 确保工作流已初始化
    ensureWorkflowsInitialized();
  });

  afterEach(() => {
    // 清理
  });

  describe('Workflow Listing', () => {
    it('should list all registered workflows', () => {
      const workflows = WorkflowRegistry.listWorkflows();

      expect(workflows.length).toBeGreaterThanOrEqual(3);

      const workflowTypes = workflows.map((w: any) => w.type);
      expect(workflowTypes).toContain('content-creator');
      expect(workflowTypes).toContain('content-creator-agent');
      expect(workflowTypes).toContain('translation');
    });

    it('should have complete metadata for each workflow', () => {
      const workflows = WorkflowRegistry.listWorkflows();

      workflows.forEach((workflow: any) => {
        expect(workflow.type).toBeDefined();
        expect(workflow.version).toBeDefined();
        expect(workflow.name).toBeDefined();
        expect(workflow.description).toBeDefined();
        expect(workflow.requiredParams).toBeDefined();
        expect(workflow.optionalParams).toBeDefined();
        expect(workflow.paramDefinitions).toBeDefined();
      });
    });

    it('should filter workflows by category', () => {
      const translationWorkflows = WorkflowRegistry.listWorkflows({ category: 'translation' });

      expect(translationWorkflows.length).toBeGreaterThanOrEqual(1);
      translationWorkflows.forEach((w: any) => {
        expect(w.category).toBe('translation');
      });
    });

    it('should filter workflows by tags', () => {
      const llmWorkflows = WorkflowRegistry.listWorkflows({ tags: ['llm'] });

      expect(llmWorkflows.length).toBeGreaterThanOrEqual(1);
      llmWorkflows.forEach((w: any) => {
        expect(w.tags).toContain('llm');
      });
    });
  });

  describe('Workflow Info Command', () => {
    it('should get content-creator workflow info', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata.type).toBe('content-creator');
      expect(metadata.name).toBe('Content Creator');
      expect(metadata.description).toBeDefined();
      expect(metadata.requiredParams).toContain('topic');
      expect(metadata.requiredParams).toContain('requirements');
      expect(metadata.paramDefinitions).toBeDefined();
    });

    it('should get content-creator-agent workflow info', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator-agent');

      expect(metadata.type).toBe('content-creator-agent');
      expect(metadata.name).toBe('Content Creator Agent');
      expect(metadata.description).toBeDefined();
      expect(metadata.requiredParams).toContain('topic');
      expect(metadata.requiredParams).toContain('requirements');
    });

    it('should get translation workflow info', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');

      expect(metadata.type).toBe('translation');
      expect(metadata.name).toBe('翻译工作流');
      expect(metadata.description).toBeDefined();
      expect(metadata.requiredParams).toEqual(['sourceText', 'sourceLanguage', 'targetLanguage']);
      expect(metadata.optionalParams).toContain('translationStyle');
      expect(metadata.optionalParams).toContain('domain');
    });

    it('should have paramDefinitions for all workflows', () => {
      const workflows = WorkflowRegistry.listWorkflows();

      workflows.forEach((workflow: any) => {
        expect(workflow.paramDefinitions).toBeDefined();
        expect(workflow.paramDefinitions.length).toBeGreaterThan(0);

        // 验证每个参数定义的完整性
        workflow.paramDefinitions.forEach((param: any) => {
          expect(param.name).toBeDefined();
          expect(param.description).toBeDefined();
          expect(param.type).toBeDefined();
          expect(typeof param.required).toBe('boolean');
        });
      });
    });

    it('should have examples for all workflows', () => {
      const workflows = WorkflowRegistry.listWorkflows();

      workflows.forEach((workflow: any) => {
        expect(workflow.examples).toBeDefined();
        expect(Array.isArray(workflow.examples)).toBe(true);

        if (workflow.examples.length > 0) {
          const example = workflow.examples[0];
          expect(example.name).toBeDefined();
          expect(example.description).toBeDefined();
          expect(example.params).toBeDefined();
        }
      });
    });
  });

  describe('Parameter Mapping - content-creator', () => {
    it('should map basic parameters for content-creator', () => {
      const cliOptions = {
        topic: 'AI Technology',
        requirements: 'Write an article',
        mode: 'sync',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      expect(errors).toHaveLength(0);
      expect(params.topic).toBe('AI Technology');
      expect(params.requirements).toBe('Write an article');
      expect(params.mode).toBe('sync');
    });

    it('should map array parameters for content-creator', () => {
      const cliOptions = {
        topic: 'Test',
        requirements: 'Test requirements',
        keywords: 'AI,machine learning,deep learning',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      expect(errors).toHaveLength(0);
      expect(params.keywords).toEqual(['AI', 'machine learning', 'deep learning']);
    });

    it('should validate required parameters for content-creator', () => {
      const cliOptions = {
        mode: 'sync',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('topic'))).toBe(true);
      expect(errors.some(e => e.includes('requirements'))).toBe(true);
    });

    it('should support kebab-case parameter names', () => {
      const cliOptions = {
        topic: 'Test',
        requirements: 'Test',
        'target-audience': 'developers',
        'image-size': '1024x1024',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      expect(errors).toHaveLength(0);
      expect(params.targetAudience).toBe('developers');
      expect(params.imageSize).toBe('1024x1024');
    });
  });

  describe('Parameter Mapping - content-creator-agent', () => {
    it('should map basic parameters for content-creator-agent', () => {
      const cliOptions = {
        topic: 'AI Technology',
        requirements: 'Write an article using Agent',
        mode: 'sync',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator-agent',
        cliOptions
      );

      expect(errors).toHaveLength(0);
      expect(params.topic).toBe('AI Technology');
      expect(params.requirements).toBe('Write an article using Agent');
      expect(params.mode).toBe('sync');
    });

    it('should validate required parameters for content-creator-agent', () => {
      const cliOptions = {
        mode: 'sync',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator-agent',
        cliOptions
      );

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('topic'))).toBe(true);
      expect(errors.some(e => e.includes('requirements'))).toBe(true);
    });

    it('should map optional parameters for content-creator-agent', () => {
      const cliOptions = {
        topic: 'Test',
        requirements: 'Test',
        tone: 'professional',
        'target-audience': 'developers',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator-agent',
        cliOptions
      );

      expect(errors).toHaveLength(0);
      expect(params.tone).toBe('professional');
      expect(params.targetAudience).toBe('developers');
    });
  });

  describe('Parameter Mapping - translation', () => {
    it('should map required parameters for translation', () => {
      const cliOptions = {
        sourceText: 'Hello world',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        mode: 'sync',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'translation',
        cliOptions
      );

      expect(errors).toHaveLength(0);
      expect(params.sourceText).toBe('Hello world');
      expect(params.sourceLanguage).toBe('en');
      expect(params.targetLanguage).toBe('zh');
    });

    it('should map optional parameters for translation', () => {
      const cliOptions = {
        sourceText: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
        'translation-style': 'formal',
        domain: 'technology',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'translation',
        cliOptions
      );

      expect(errors).toHaveLength(0);
      expect(params.translationStyle).toBe('formal');
      expect(params.domain).toBe('technology');
    });

    it('should validate required parameters for translation', () => {
      const cliOptions = {
        sourceText: 'Hello',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'translation',
        cliOptions
      );

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('sourceLanguage'))).toBe(true);
      expect(errors.some(e => e.includes('targetLanguage'))).toBe(true);
    });

    it('should support language code validation', () => {
      const cliOptions = {
        sourceText: 'Test',
        sourceLanguage: 'invalid',
        targetLanguage: 'zh',
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'translation',
        cliOptions
      );

      // 参数解析应该成功（类型验证由工作流负责）
      expect(params.sourceLanguage).toBe('invalid');
      expect(params.targetLanguage).toBe('zh');
    });
  });

  describe('Type Conversion and Validation', () => {
    it('should convert string to array', () => {
      const cliOptions = {
        topic: 'Test',
        requirements: 'Test',
        keywords: 'AI,ML,DL',
      };

      const { params } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      expect(params.keywords).toEqual(['AI', 'ML', 'DL']);
      expect(Array.isArray(params.keywords)).toBe(true);
    });

    it('should convert JSON string to object', () => {
      const cliOptions = {
        topic: 'Test',
        requirements: 'Test',
        'hard-constraints': '{"minWords":100,"maxWords":500}',
      };

      const { params } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      expect(params.hardConstraints).toEqual({ minWords: 100, maxWords: 500 });
      expect(typeof params.hardConstraints).toBe('object');
    });

    it('should handle invalid JSON conversion', () => {
      const cliOptions = {
        topic: 'Test',
        requirements: 'Test',
        'hard-constraints': 'invalid-json',
      };

      const { errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some(e => e.includes('hardConstraints') || e.includes('hard-constraints'))).toBe(true);
    });

    it('should handle invalid JSON with partial valid data', () => {
      const cliOptions = {
        topic: 'Test',
        requirements: 'Test',
        'hard-constraints': '{incomplete',
      };

      const { errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      // Should have error for invalid JSON
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('Usage Example Generation', () => {
    it('should generate usage example for content-creator', () => {
      const example = workflowParameterMapper.generateUsageExample('content-creator');

      expect(example).toContain('content-creator');
      expect(example).toContain('--topic');
      expect(example).toContain('--requirements');
    });

    it('should generate usage example for translation', () => {
      const example = workflowParameterMapper.generateUsageExample('translation');

      expect(example).toContain('translation');
      expect(example).toContain('--source-text');
      expect(example).toContain('--source-language');
      expect(example).toContain('--target-language');
    });

    it('should format missing params error correctly', () => {
      const error = workflowParameterMapper.formatMissingParamsError(
        'content-creator',
        ['topic', 'requirements']
      );

      expect(error).toContain('缺少必需参数');
      expect(error).toContain('topic');
      expect(error).toContain('requirements');
      expect(error).toContain('Content Creator');
      expect(error).toContain('使用示例');
    });
  });

  describe('Workflow Factory Integration', () => {
    it('should create state for content-creator', () => {
      const params = {
        taskId: 'test-123',
        mode: 'sync' as const,
        topic: 'Test',
        requirements: 'Test requirements',
      };

      const state = WorkflowRegistry.createState('content-creator', params);

      expect(state.taskId).toBe('test-123');
      expect(state.workflowType).toBe('content-creator');
      expect(state.topic).toBe('Test');
      expect(state.requirements).toBe('Test requirements');
    });

    it('should create state for content-creator-agent', () => {
      const params = {
        taskId: 'test-456',
        mode: 'sync' as const,
        topic: 'Agent Test',
        requirements: 'Agent requirements',
      };

      const state = WorkflowRegistry.createState('content-creator-agent', params);

      expect(state.taskId).toBe('test-456');
      expect(state.workflowType).toBe('content-creator-agent');
      expect(state.topic).toBe('Agent Test');
      expect(state.requirements).toBe('Agent requirements');
    });

    it('should create state for translation', () => {
      const params = {
        taskId: 'test-789',
        mode: 'sync' as const,
        sourceText: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      };

      const state = WorkflowRegistry.createState('translation', params);

      expect(state.taskId).toBe('test-789');
      expect(state.workflowType).toBe('translation');
      expect(state.sourceText).toBe('Hello');
      expect(state.sourceLanguage).toBe('en');
      expect(state.targetLanguage).toBe('zh');
    });

    it('should validate params through factory', () => {
      const factory = WorkflowRegistry.getFactory('content-creator');

      const validParams = {
        taskId: 'test-123',
        mode: 'sync' as const,
        topic: 'Test',
        requirements: 'Test',
      };

      expect(factory.validateParams(validParams)).toBe(true);

      const invalidParams = {
        taskId: 'test-123',
        mode: 'sync' as const,
        // missing topic and requirements
      };

      expect(factory.validateParams(invalidParams)).toBe(false);
    });

    it('should create graph for all workflows', () => {
      const workflows = WorkflowRegistry.listWorkflows();

      workflows.forEach((workflow: any) => {
        const graph = WorkflowRegistry.createGraph(workflow.type);
        expect(graph).toBeDefined();
        expect(graph).toHaveProperty('nodes');
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown workflow type', () => {
      expect(() => {
        WorkflowRegistry.getMetadata('unknown-workflow');
      }).toThrow('Unknown workflow type: unknown-workflow');
    });

    it('should handle missing optional parameters', () => {
      const cliOptions = {
        topic: 'Test',
        requirements: 'Test',
        // optional parameters omitted
      };

      const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
        'content-creator',
        cliOptions
      );

      expect(errors).toHaveLength(0);
      expect(params.topic).toBe('Test');
      expect(params.requirements).toBe('Test');
    });

    it('should use default values when provided', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');
      const targetAudienceParam = metadata.paramDefinitions?.find(p => p.name === 'targetAudience');

      if (targetAudienceParam?.defaultValue) {
        const cliOptions = {
          topic: 'Test',
          requirements: 'Test',
        };

        const { params } = workflowParameterMapper.mapCliOptionsToParams(
          'content-creator',
          cliOptions
        );

        expect(params.targetAudience).toBe(targetAudienceParam.defaultValue);
      }
    });
  });

  describe('Workflow Statistics', () => {
    it('should provide workflow statistics', () => {
      const stats = WorkflowRegistry.getStats();

      expect(stats.totalWorkflows).toBeGreaterThanOrEqual(3);
      expect(stats.versions).toBeDefined();
      expect(stats.categories).toBeDefined();

      // 验证版本记录
      expect(stats.versions['content-creator']).toBeDefined();
      expect(stats.versions['content-creator-agent']).toBeDefined();
      expect(stats.versions['translation']).toBeDefined();
    });

    it('should count workflows correctly', () => {
      const count = WorkflowRegistry.count();

      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Cross-Workflow Compatibility', () => {
    it('should support common parameters across workflows', () => {
      const commonParams = {
        taskId: 'test-123',
        mode: 'sync' as const,
      };

      // 所有工作流都应该支持 taskId 和 mode
      const workflows = ['content-creator', 'content-creator-agent', 'translation'];

      workflows.forEach(workflowType => {
        const metadata = WorkflowRegistry.getMetadata(workflowType);
        expect(metadata.paramDefinitions).toBeDefined();

        const { params, errors } = workflowParameterMapper.mapCliOptionsToParams(
          workflowType,
          commonParams
        );

        expect(params.taskId).toBeDefined();
        expect(params.mode).toBeDefined();
      });
    });

    it('should validate workflow-specific parameters independently', () => {
      // content-creator 需要 topic 和 requirements
      const creatorParams = {
        taskId: 'test-1',
        mode: 'sync' as const,
        topic: 'Test',
        requirements: 'Test',
      };

      const { params: creatorP, errors: creatorE } =
        workflowParameterMapper.mapCliOptionsToParams('content-creator', creatorParams);

      expect(creatorE).toHaveLength(0);
      expect(creatorP.topic).toBe('Test');

      // translation 需要 sourceText, sourceLanguage, targetLanguage
      const translationParams = {
        taskId: 'test-2',
        mode: 'sync' as const,
        sourceText: 'Hello',
        sourceLanguage: 'en',
        targetLanguage: 'zh',
      };

      const { params: transP, errors: transE } =
        workflowParameterMapper.mapCliOptionsToParams('translation', translationParams);

      expect(transE).toHaveLength(0);
      expect(transP.sourceText).toBe('Hello');
    });
  });

  describe('Step Names Mapping', () => {
    it('should have stepNames for content-creator', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata.stepNames).toBeDefined();
      expect(metadata.stepNames?.['search']).toBe('搜索内容');
      expect(metadata.stepNames?.['organize']).toBe('组织信息');
      expect(metadata.stepNames?.['write']).toBe('撰写内容');
      expect(metadata.stepNames?.['check_text']).toBe('文本质检');
      expect(metadata.stepNames?.['generate_image']).toBe('生成配图');
      expect(metadata.stepNames?.['check_image']).toBe('图片质检');
    });

    it('should have stepNames for translation', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');

      expect(metadata.stepNames).toBeDefined();
      expect(metadata.stepNames?.['translate']).toBe('翻译');
      expect(metadata.stepNames?.['checkQuality']).toBe('质检');
    });
  });

  describe('Retry Fields Mapping', () => {
    it('should have retryFields for content-creator', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata.retryFields).toBeDefined();
      expect(metadata.retryFields?.length).toBeGreaterThanOrEqual(1);

      const textRetry = metadata.retryFields?.find(f => f.name === 'textRetryCount');
      expect(textRetry).toBeDefined();
      expect(textRetry?.displayName).toBe('文本重试');

      const imageRetry = metadata.retryFields?.find(f => f.name === 'imageRetryCount');
      expect(imageRetry).toBeDefined();
      expect(imageRetry?.displayName).toBe('图片重试');
    });

    it('should have retryFields for translation', () => {
      const metadata = WorkflowRegistry.getMetadata('translation');

      expect(metadata.retryFields).toBeDefined();
      expect(metadata.retryFields?.length).toBeGreaterThanOrEqual(1);

      const translationRetry = metadata.retryFields?.find(f => f.name === 'translationRetryCount');
      expect(translationRetry).toBeDefined();
      expect(translationRetry?.displayName).toBe('翻译重试');
    });
  });
});
