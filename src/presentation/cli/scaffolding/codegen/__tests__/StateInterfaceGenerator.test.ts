/**
 * StateInterfaceGenerator Tests - 状态接口生成器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StateInterfaceGenerator } from '../StateInterfaceGenerator.js';
import type { WorkflowRequirement } from '../../schemas/WorkflowRequirementSchema.js';
import type { ILLMService } from '../../../../../../../services/llm/ILLMService.js';

const mockLLMService: ILLMService = {
  chat: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  estimateCost: vi.fn(() => 0.001),
};

describe('StateInterfaceGenerator', () => {
  let generator: StateInterfaceGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new StateInterfaceGenerator(mockLLMService);
  });

  describe('generate', () => {
    it('should generate state interface with input parameters', async () => {
      const requirement: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'Test workflow',
        category: 'content',
        tags: [],
        inputParams: [
          {
            name: 'inputText',
            type: 'string',
            required: true,
            description: 'Input text',
          },
          {
            name: 'maxLength',
            type: 'number',
            required: false,
            description: 'Max length',
            defaultValue: 100,
          },
        ],
        outputFields: ['result'],
        nodes: [],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
export interface TestWorkflowState extends BaseWorkflowState {
  // Input parameters
  inputText: string;
  maxLength?: number;

  // Output fields
  result?: string;
}
\`\`\`
        `,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        cost: 0.001,
      });

      const code = await generator.generate(requirement);

      expect(code).toContain('interface TestWorkflowState');
      expect(code).toContain('extends BaseWorkflowState');
      expect(code).toContain('inputText: string');
      expect(code).toContain('maxLength?: number');
    });

    it('should handle workflows with no input parameters', async () => {
      const requirement: WorkflowRequirement = {
        type: 'no-input-workflow',
        name: 'No Input Workflow',
        description: 'Workflow without input',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
export interface NoInputWorkflowState extends BaseWorkflowState {
  result?: string;
}
\`\`\`
        `,
        usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        cost: 0.0005,
      });

      const code = await generator.generate(requirement);

      expect(code).toContain('interface NoInputWorkflowState');
      expect(code).toContain('extends BaseWorkflowState');
    });

    it('should include all output fields in state', async () => {
      const requirement: WorkflowRequirement = {
        type: 'multi-output',
        name: 'Multi Output',
        description: 'Multiple outputs',
        category: 'content',
        tags: [],
        inputParams: [],
        outputFields: ['result1', 'result2', 'result3', 'metadata'],
        nodes: [],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
export interface MultiOutputState extends BaseWorkflowState {
  result1?: string;
  result2?: string;
  result3?: string;
  metadata?: Record<string, any>;
}
\`\`\`
        `,
        usage: { promptTokens: 80, completionTokens: 60, totalTokens: 140 },
        cost: 0.001,
      });

      const code = await generator.generate(requirement);

      expect(code).toContain('result1');
      expect(code).toContain('result2');
      expect(code).toContain('result3');
      expect(code).toContain('metadata');
    });

    it('should add quality check fields when enabled', async () => {
      const requirement: WorkflowRequirement = {
        type: 'qc-workflow',
        name: 'QC Workflow',
        description: 'With quality check',
        category: 'content',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [],
        connections: [],
        enableQualityCheck: true,
        maxRetries: 3,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
export interface QcWorkflowState extends BaseWorkflowState {
  result?: string;
  qualityScore?: number;
  retryCount: number;
  lastError?: string;
}
\`\`\`
        `,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        cost: 0.001,
      });

      const code = await generator.generate(requirement);

      expect(code).toContain('qualityScore');
      expect(code).toContain('retryCount');
    });

    it('should handle different parameter types', async () => {
      const requirement: WorkflowRequirement = {
        type: 'typed-workflow',
        name: 'Typed Workflow',
        description: 'Different param types',
        category: 'integration',
        tags: [],
        inputParams: [
          { name: 'text', type: 'string', required: true, description: 'String' },
          { name: 'count', type: 'number', required: true, description: 'Number' },
          { name: 'flag', type: 'boolean', required: true, description: 'Boolean' },
          { name: 'items', type: 'array', required: false, description: 'Array' },
          { name: 'config', type: 'object', required: false, description: 'Object' },
        ],
        outputFields: ['result'],
        nodes: [],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
export interface TypedWorkflowState extends BaseWorkflowState {
  text: string;
  count: number;
  flag: boolean;
  items?: any[];
  config?: Record<string, any>;
  result?: string;
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230 },
        cost: 0.002,
      });

      const code = await generator.generate(requirement);

      expect(code).toContain('text: string');
      expect(code).toContain('count: number');
      expect(code).toContain('flag: boolean');
      expect(code).toContain('items?: any[]');
      expect(code).toContain('config?: Record<string, any>');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when LLM fails', async () => {
      const requirement: WorkflowRequirement = {
        type: 'error-workflow',
        name: 'Error Workflow',
        description: 'Test error handling',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockRejectedValue(new Error('LLM failed'));

      await expect(generator.generate(requirement)).rejects.toThrow('Failed to generate state interface');
    });

    it('should extract code from markdown code blocks', async () => {
      const requirement: WorkflowRequirement = {
        type: 'code-block',
        name: 'Code Block',
        description: 'Test code block extraction',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
Here is the generated state interface:

\`\`\`typescript
export interface CodeBlockState extends BaseWorkflowState {
  result?: string;
}
\`\`\`

This interface includes all necessary fields.
        `,
        usage: { promptTokens: 80, completionTokens: 40, totalTokens: 120 },
        cost: 0.001,
      });

      const code = await generator.generate(requirement);

      expect(code).toContain('interface CodeBlockState');
      expect(code).not.toContain('Here is the generated');
      expect(code).not.toContain('```');
    });
  });
});
