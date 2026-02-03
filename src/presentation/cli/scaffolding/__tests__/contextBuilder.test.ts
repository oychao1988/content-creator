/**
 * ContextBuilder Tests
 *
 * 测试上下文构建器的功能
 */

import { describe, it, expect } from 'vitest';
import { buildContext } from '../utils/contextBuilder.js';
import type { WorkflowRequirement } from '../schemas/WorkflowRequirementSchema.js';
import type { ILLMService } from '../../../../services/llm/ILLMService.js';

describe('ContextBuilder', () => {
  describe('buildContext', () => {
    it('should build context from existing workflows', () => {
      const existingWorkflows: WorkflowRequirement[] = [
        {
          type: 'test-workflow-1',
          name: 'Test Workflow 1',
          description: 'First test workflow',
          category: 'content',
          tags: ['test'],
          inputParams: [
            {
              name: 'input',
              type: 'string',
              required: true,
              description: 'Input',
            },
          ],
          outputFields: ['result'],
          nodes: [
            {
              name: 'process',
              displayName: 'Process',
              description: 'Process node',
              nodeType: 'transform',
              timeout: 30000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: [],
            },
          ],
          connections: [
            { from: 'START', to: 'process' },
            { from: 'process', to: 'END' },
          ],
          enableQualityCheck: false,
          maxRetries: 2,
          enableCheckpoint: true,
        },
      ];

      const context = buildContext(existingWorkflows);

      expect(context).toBeDefined();
      expect(context.codePatterns).toBeDefined();
      expect(context.bestPractices).toBeDefined();
      expect(context.commonNodes).toBeDefined();
    });

    it('should handle empty workflows list', () => {
      const context = buildContext([]);

      expect(context).toBeDefined();
      expect(context.codePatterns).toContain('暂无现有工作流');
      expect(context.bestPractices).toContain('暂无特定最佳实践');
    });

    it('should extract code patterns from workflows', () => {
      const workflows: WorkflowRequirement[] = [
        {
          type: 'pattern-workflow',
          name: 'Pattern Workflow',
          description: 'Workflow with patterns',
          category: 'content',
          tags: [],
          inputParams: [
            {
              name: 'text',
              type: 'string',
              required: true,
              description: 'Text',
            },
          ],
          outputFields: ['output'],
          nodes: [
            {
              name: 'llmNode',
              displayName: 'LLM Node',
              description: 'LLM processing',
              nodeType: 'llm',
              timeout: 60000,
              useLLM: true,
              llmSystemPrompt: 'Test prompt',
              enableQualityCheck: false,
              dependencies: [],
            },
          ],
          connections: [
            { from: 'START', to: 'llmNode' },
            { from: 'llmNode', to: 'END' },
          ],
          enableQualityCheck: false,
          maxRetries: 2,
          enableCheckpoint: true,
        },
      ];

      const context = buildContext(workflows);

      expect(context.codePatterns).toContain('LLM 节点模式');
      expect(context.commonNodes).toContain('llmNode');
    });

    it('should identify quality check patterns', () => {
      const workflows: WorkflowRequirement[] = [
        {
          type: 'qc-workflow',
          name: 'QC Workflow',
          description: 'Workflow with quality check',
          category: 'content',
          tags: [],
          inputParams: [
            {
              name: 'input',
              type: 'string',
              required: true,
              description: 'Input',
            },
          ],
          outputFields: ['result'],
          nodes: [
            {
              name: 'process',
              displayName: 'Process',
              description: 'Process node',
              nodeType: 'transform',
              timeout: 30000,
              useLLM: false,
              enableQualityCheck: true,
              qualityCheckPrompt: 'Check quality',
              dependencies: [],
            },
          ],
          connections: [
            { from: 'START', to: 'process' },
            { from: 'process', to: 'END' },
          ],
          enableQualityCheck: true,
          maxRetries: 3,
          enableCheckpoint: true,
        },
      ];

      const context = buildContext(workflows);

      expect(context.bestPractices).toContain('质量检查');
      expect(context.bestPractices).toContain('maxRetries: 3');
    });

    it('should extract conditional routing patterns', () => {
      const workflows: WorkflowRequirement[] = [
        {
          type: 'conditional-workflow',
          name: 'Conditional Workflow',
          description: 'Workflow with conditions',
          category: 'content',
          tags: [],
          inputParams: [
            {
              name: 'input',
              type: 'string',
              required: true,
              description: 'Input',
            },
          ],
          outputFields: ['result'],
          nodes: [
            {
              name: 'decide',
              displayName: 'Decide',
              description: 'Decision node',
              nodeType: 'transform',
              timeout: 30000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: [],
            },
          ],
          connections: [
            { from: 'START', to: 'decide' },
            { from: 'decide', to: 'END', condition: 'state.success' },
            { from: 'decide', to: 'START', condition: '!state.success' },
          ],
          enableQualityCheck: false,
          maxRetries: 2,
          enableCheckpoint: true,
        },
      ];

      const context = buildContext(workflows);

      expect(context.codePatterns).toContain('条件路由');
      expect(context.codePatterns).toContain('condition');
    });

    it('should handle multiple workflows comprehensively', () => {
      const workflows: WorkflowRequirement[] = [
        {
          type: 'workflow-1',
          name: 'Workflow 1',
          description: 'Simple workflow',
          category: 'content',
          tags: ['simple'],
          inputParams: [],
          outputFields: [],
          nodes: [
            {
              name: 'node1',
              displayName: 'Node 1',
              description: 'First node',
              nodeType: 'transform',
              timeout: 30000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: [],
            },
          ],
          connections: [
            { from: 'START', to: 'node1' },
            { from: 'node1', to: 'END' },
          ],
          enableQualityCheck: false,
          maxRetries: 2,
          enableCheckpoint: true,
        },
        {
          type: 'workflow-2',
          name: 'Workflow 2',
          description: 'Complex workflow',
          category: 'translation',
          tags: ['complex'],
          inputParams: [],
          outputFields: [],
          nodes: [
            {
              name: 'llmNode',
              displayName: 'LLM Node',
              description: 'LLM processing',
              nodeType: 'llm',
              timeout: 60000,
              useLLM: true,
              llmSystemPrompt: 'Translate',
              enableQualityCheck: true,
              dependencies: [],
            },
          ],
          connections: [
            { from: 'START', to: 'llmNode' },
            { from: 'llmNode', to: 'END' },
          ],
          enableQualityCheck: true,
          maxRetries: 3,
          enableCheckpoint: true,
        },
      ];

      const context = buildContext(workflows);

      expect(context.codePatterns).toBeDefined();
      expect(context.bestPractices).toBeDefined();
      expect(context.commonNodes).toContain('node1');
      expect(context.commonNodes).toContain('llmNode');
      expect(context.codePatterns).toContain('2 个现有工作流');
    });

    it('should handle workflows with API nodes', () => {
      const workflows: WorkflowRequirement[] = [
        {
          type: 'api-workflow',
          name: 'API Workflow',
          description: 'Workflow with API calls',
          category: 'integration',
          tags: ['api'],
          inputParams: [],
          outputFields: [],
          nodes: [
            {
              name: 'fetchData',
              displayName: 'Fetch Data',
              description: 'Fetch from API',
              nodeType: 'api',
              timeout: 30000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: [],
            },
          ],
          connections: [
            { from: 'START', to: 'fetchData' },
            { from: 'fetchData', to: 'END' },
          ],
          enableQualityCheck: false,
          maxRetries: 2,
          enableCheckpoint: true,
        },
      ];

      const context = buildContext(workflows);

      expect(context.commonNodes).toContain('fetchData');
      expect(context.codePatterns).toContain('API 节点');
    });
  });
});
