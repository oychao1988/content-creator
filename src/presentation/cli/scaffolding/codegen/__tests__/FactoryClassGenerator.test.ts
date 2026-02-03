/**
 * FactoryClassGenerator Tests - 工厂类生成器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FactoryClassGenerator } from '../FactoryClassGenerator.js';
import type { WorkflowRequirement } from '../../schemas/WorkflowRequirementSchema.js';
import type { ILLMService } from '../../../../../../../services/llm/ILLMService.js';

const mockLLMService: ILLMService = {
  chat: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  estimateCost: vi.fn(() => 0.001),
};

describe('FactoryClassGenerator', () => {
  let generator: FactoryClassGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new FactoryClassGenerator(mockLLMService);
  });

  describe('generate', () => {
    it('should generate factory class with all required methods', async () => {
      const requirement: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'Test workflow description',
        category: 'content',
        tags: ['test', 'example'],
        inputParams: [
          {
            name: 'inputText',
            type: 'string',
            required: true,
            description: 'Input text parameter',
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
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
import type { WorkflowFactory, WorkflowGraph, WorkflowMetadata } from '../../../../domain/workflow/WorkflowRegistry.js';
import type { TestWorkflowState } from './TestWorkflowState.js';
import { createTestWorkflowGraph } from './TestWorkflowGraph.js';
import { ProcessNode } from './nodes/ProcessNode.js';

export class TestWorkflowFactory implements WorkflowFactory {
  readonly type = 'test-workflow';

  createGraph(): WorkflowGraph {
    return createTestWorkflowGraph();
  }

  createState(params: Record<string, any>): TestWorkflowState {
    return {
      ...params,
      retryCount: 0,
    };
  }

  validateParams(params: Record<string, any>): boolean {
    if (!params.inputText) {
      return false;
    }
    return true;
  }

  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      name: 'Test Workflow',
      description: 'Test workflow description',
      category: 'content',
      tags: ['test', 'example'],
      version: '1.0.0',
      author: 'AI Workflow Scaffolder',
    };
  }
}
\`\`\`
        `,
        usage: { promptTokens: 200, completionTokens: 150, totalTokens: 350 },
        cost: 0.003,
      });

      const code = await generator.generate(requirement, 'TestWorkflowState');

      expect(code).toContain('class TestWorkflowFactory');
      expect(code).toContain('implements WorkflowFactory');
      expect(code).toContain("readonly type = 'test-workflow'");
      expect(code).toContain('createGraph()');
      expect(code).toContain('createState()');
      expect(code).toContain('validateParams()');
      expect(code).toContain('getMetadata()');
    });

    it('should include validation logic for input parameters', async () => {
      const requirement: WorkflowRequirement = {
        type: 'validated-workflow',
        name: 'Validated Workflow',
        description: 'Workflow with validation',
        category: 'content',
        tags: [],
        inputParams: [
          {
            name: 'text',
            type: 'string',
            required: true,
            description: 'Text input',
          },
          {
            name: 'count',
            type: 'number',
            required: true,
            description: 'Count input',
          },
          {
            name: 'flag',
            type: 'boolean',
            required: false,
            description: 'Flag input',
            defaultValue: false,
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
export class ValidatedWorkflowFactory implements WorkflowFactory {
  readonly type = 'validated-workflow';

  validateParams(params: Record<string, any>): boolean {
    // Check required parameters
    if (typeof params.text !== 'string') {
      return false;
    }
    if (typeof params.count !== 'number') {
      return false;
    }
    // Optional parameter with default
    if (params.flag !== undefined && typeof params.flag !== 'boolean') {
      return false;
    }
    return true;
  }

  // ... other methods
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
        cost: 0.002,
      });

      const code = await generator.generate(requirement, 'ValidatedWorkflowState');

      expect(code).toContain('validateParams');
      expect(code).toContain('typeof params.text !== \'string\'');
      expect(code).toContain('typeof params.count !== \'number\'');
    });

    it('should include metadata with all information', async () => {
      const requirement: WorkflowRequirement = {
        type: 'metadata-workflow',
        name: 'Metadata Workflow',
        description: 'Workflow demonstrating metadata',
        category: 'integration',
        tags: ['metadata', 'example', 'test'],
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
\`\`\`typescript
export class MetadataWorkflowFactory implements WorkflowFactory {
  readonly type = 'metadata-workflow';

  getMetadata(): WorkflowMetadata {
    return {
      type: 'metadata-workflow',
      name: 'Metadata Workflow',
      description: 'Workflow demonstrating metadata',
      category: 'integration',
      tags: ['metadata', 'example', 'test'],
      version: '1.0.0',
      author: 'AI Workflow Scaffolder',
      createdAt: new Date().toISOString(),
    };
  }

  // ... other methods
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
        cost: 0.002,
      });

      const code = await generator.generate(requirement, 'MetadataWorkflowState');

      expect(code).toContain('getMetadata()');
      expect(code).toContain('name: \'Metadata Workflow\'');
      expect(code).toContain('description: \'Workflow demonstrating metadata\'');
      expect(code).toContain('category: \'integration\'');
      expect(code).toContain('tags: [\'metadata\', \'example\', \'test\']');
    });

    it('should handle quality check settings in metadata', async () => {
      const requirement: WorkflowRequirement = {
        type: 'qc-workflow',
        name: 'QC Workflow',
        description: 'Workflow with quality check',
        category: 'content',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [],
        enableQualityCheck: true,
        maxRetries: 5,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
export class QcWorkflowFactory implements WorkflowFactory {
  readonly type = 'qc-workflow';

  getMetadata(): WorkflowMetadata {
    return {
      type: 'qc-workflow',
      name: 'QC Workflow',
      description: 'Workflow with quality check',
      category: 'content',
      tags: [],
      version: '1.0.0',
      author: 'AI Workflow Scaffolder',
      settings: {
        enableQualityCheck: true,
        maxRetries: 5,
        enableCheckpoint: true,
      },
    };
  }

  // ... other methods
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
        cost: 0.002,
      });

      const code = await generator.generate(requirement, 'QcWorkflowState');

      expect(code).toContain('enableQualityCheck: true');
      expect(code).toContain('maxRetries: 5');
      expect(code).toContain('enableCheckpoint: true');
    });
  });

  describe('State Initialization', () => {
    it('should initialize state with default values', async () => {
      const requirement: WorkflowRequirement = {
        type: 'default-state',
        name: 'Default State',
        description: 'Workflow with default state values',
        category: 'content',
        tags: [],
        inputParams: [
          {
            name: 'text',
            type: 'string',
            required: true,
            description: 'Text',
          },
          {
            name: 'optional',
            type: 'number',
            required: false,
            description: 'Optional number',
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
export class DefaultStateFactory implements WorkflowFactory {
  createState(params: Record<string, any>): DefaultStateState {
    return {
      text: params.text,
      optional: params.optional ?? 100,
      retryCount: 0,
    };
  }

  // ... other methods
}
\`\`\`
        `,
        usage: { promptTokens: 120, completionTokens: 80, totalTokens: 200 },
        cost: 0.002,
      });

      const code = await generator.generate(requirement, 'DefaultStateState');

      expect(code).toContain('createState');
      expect(code).toContain('params.optional ?? 100');
      expect(code).toContain('retryCount: 0');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when LLM fails', async () => {
      const requirement: WorkflowRequirement = {
        type: 'error',
        name: 'Error',
        description: 'Test error',
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

      await expect(generator.generate(requirement, 'TestState')).rejects.toThrow('Failed to generate factory class');
    });

    it('should extract code from markdown blocks', async () => {
      const requirement: WorkflowRequirement = {
        type: 'code-block',
        name: 'Code Block',
        description: 'Test code block',
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
Here is the factory class:

\`\`\`typescript
export class CodeBlockFactory implements WorkflowFactory {
  readonly type = 'code-block';
  // ... implementation
}
\`\`\`

Let me know if you need changes.
        `,
        usage: { promptTokens: 80, completionTokens: 50, totalTokens: 130 },
        cost: 0.001,
      });

      const code = await generator.generate(requirement, 'CodeBlockState');

      expect(code).toContain('class CodeBlockFactory');
      expect(code).not.toContain('Here is the factory');
      expect(code).not.toContain('```');
    });
  });
});
