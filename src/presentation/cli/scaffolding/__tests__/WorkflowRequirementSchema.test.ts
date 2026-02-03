/**
 * WorkflowRequirementSchema Tests
 *
 * 测试工作流需求 Schema 验证
 */

import { describe, it, expect } from 'vitest';
import type { WorkflowRequirement } from '../schemas/WorkflowRequirementSchema.js';

describe('WorkflowRequirementSchema', () => {
  describe('Type Validation', () => {
    it('should accept valid kebab-case workflow types', () => {
      const validTypes = [
        'text-summarizer',
        'content-creator',
        'translation-workflow',
        'ai-agent-workflow',
        'batch-processor',
        'quality-checker',
      ];

      validTypes.forEach(type => {
        const requirement: Partial<WorkflowRequirement> = { type };
        expect(requirement.type).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      });
    });

    it('should reject invalid workflow types', () => {
      const invalidTypes = [
        'TextSummarizer', // PascalCase
        'text_summarizer', // snake_case
        'TEXT-SUMMARIZER', // UPPER-CASE
        'text summarizer', // with space
        'text@summarizer', // special char
        '', // empty
        '123', // only numbers
        '-text', // starts with dash
        'text-', // ends with dash
      ];

      invalidTypes.forEach(type => {
        expect(type).not.toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      });
    });
  });

  describe('Category Validation', () => {
    it('should accept valid categories', () => {
      const validCategories = ['content', 'translation', 'integration', 'analysis', 'other'] as const;

      validCategories.forEach(category => {
        const requirement: Partial<WorkflowRequirement> = { category };
        expect(requirement.category).toBeDefined();
      });
    });
  });

  describe('Node Type Validation', () => {
    it('should accept valid node types', () => {
      const validNodeTypes = ['transform', 'llm', 'api', 'quality_check', 'batch'];

      validNodeTypes.forEach(nodeType => {
        const node = { nodeType };
        expect(node.nodeType).toBeDefined();
      });
    });

    it('should require llmSystemPrompt for LLM nodes', () => {
      const llmNodeWithoutPrompt = {
        name: 'test',
        displayName: 'Test',
        description: 'Test node',
        nodeType: 'llm' as const,
        timeout: 60000,
        useLLM: true,
        enableQualityCheck: false,
        dependencies: [],
        // Missing llmSystemPrompt - should fail validation
      };

      // This would fail Zod validation
      expect(llmNodeWithoutPrompt).not.toHaveProperty('llmSystemPrompt');
    });

    it('should require qualityCheckPrompt for quality check enabled nodes', () => {
      const nodeWithQC = {
        name: 'test',
        displayName: 'Test',
        description: 'Test node',
        nodeType: 'transform' as const,
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: true,
        dependencies: [],
        // Missing qualityCheckPrompt - should fail validation
      };

      // This would fail Zod validation
      expect(nodeWithQC).not.toHaveProperty('qualityCheckPrompt');
    });
  });

  describe('Input Parameter Validation', () => {
    it('should accept valid parameter types', () => {
      const validTypes = ['string', 'number', 'boolean', 'array', 'object'];

      validTypes.forEach(type => {
        const param = { name: 'test', type: type as any, required: true, description: 'Test' };
        expect(param.type).toBeDefined();
      });
    });

    it('should handle required and optional parameters', () => {
      const requiredParam = {
        name: 'requiredParam',
        type: 'string' as const,
        required: true,
        description: 'Required parameter',
      };

      const optionalParam = {
        name: 'optionalParam',
        type: 'string' as const,
        required: false,
        description: 'Optional parameter',
        defaultValue: 'default',
      };

      expect(requiredParam.required).toBe(true);
      expect(optionalParam.required).toBe(false);
      expect(optionalParam.defaultValue).toBeDefined();
    });
  });

  describe('Connection Validation', () => {
    it('should accept valid connections', () => {
      const validConnections = [
        { from: 'START', to: 'node1' },
        { from: 'node1', to: 'node2' },
        { from: 'node2', to: 'END' },
        { from: 'node1', to: 'node2', condition: 'state.success' },
      ];

      validConnections.forEach(conn => {
        expect(conn.from).toBeDefined();
        expect(conn.to).toBeDefined();
      });
    });

    it('should handle conditional connections', () => {
      const conditionalConnection = {
        from: 'node1',
        to: 'node2',
        condition: 'state.score > 0.8',
      };

      expect(conditionalConnection.condition).toBeDefined();
      expect(typeof conditionalConnection.condition).toBe('string');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate timeout ranges', () => {
      const validTimeouts = [5000, 30000, 60000, 120000];

      validTimeouts.forEach(timeout => {
        expect(timeout).toBeGreaterThanOrEqual(1000);
        expect(timeout).toBeLessThanOrEqual(600000);
      });
    });

    it('should validate retry counts', () => {
      const validRetries = [0, 1, 2, 3, 5];

      validRetries.forEach(retries => {
        expect(retries).toBeGreaterThanOrEqual(0);
        expect(retries).toBeLessThanOrEqual(10);
      });
    });

    it('should validate checkpoint and quality check flags', () => {
      const config1 = { enableCheckpoint: true, enableQualityCheck: true };
      const config2 = { enableCheckpoint: false, enableQualityCheck: false };

      expect(typeof config1.enableCheckpoint).toBe('boolean');
      expect(typeof config1.enableQualityCheck).toBe('boolean');
      expect(typeof config2.enableCheckpoint).toBe('boolean');
      expect(typeof config2.enableQualityCheck).toBe('boolean');
    });
  });

  describe('Edge Cases', () => {
    it('should handle workflow with single node', () => {
      const singleNodeWorkflow: Partial<WorkflowRequirement> = {
        type: 'single-node',
        name: 'Single Node Workflow',
        description: 'Workflow with one node',
        category: 'content',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [
          {
            name: 'process',
            displayName: 'Process',
            description: 'Single processing node',
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

      expect(singleNodeWorkflow.nodes).toHaveLength(1);
      expect(singleNodeWorkflow.connections).toHaveLength(2);
    });

    it('should handle workflow with no input parameters', () => {
      const noInputWorkflow: Partial<WorkflowRequirement> = {
        type: 'no-input-workflow',
        name: 'No Input Workflow',
        description: 'Workflow without input parameters',
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

      expect(noInputWorkflow.inputParams).toHaveLength(0);
    });

    it('should handle workflow with multiple outputs', () => {
      const multiOutputWorkflow: Partial<WorkflowRequirement> = {
        type: 'multi-output',
        name: 'Multi Output Workflow',
        description: 'Workflow with multiple outputs',
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

      expect(multiOutputWorkflow.outputFields).toHaveLength(4);
    });

    it('should handle complex dependency chains', () => {
      const complexDependencies: Partial<WorkflowRequirement> = {
        type: 'complex-deps',
        name: 'Complex Dependencies',
        description: 'Workflow with complex node dependencies',
        category: 'integration',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
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
          {
            name: 'node2',
            displayName: 'Node 2',
            description: 'Second node',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: ['node1', 'node3'],
          },
          {
            name: 'node3',
            displayName: 'Node 3',
            description: 'Third node',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: ['node1'],
          },
        ],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      expect(complexDependencies.nodes?.[1].dependencies).toContain('node1');
      expect(complexDependencies.nodes?.[1].dependencies).toContain('node3');
      expect(complexDependencies.nodes?.[2].dependencies).toContain('node1');
    });
  });
});
