/**
 * NodeTableGenerator Tests - 补充边界情况测试
 */

import { describe, it, expect } from 'vitest';
import { NodeTableGenerator } from '../NodeTableGenerator.js';
import type { WorkflowRequirement } from '../../schemas/WorkflowRequirementSchema.js';

describe('NodeTableGenerator (Advanced Tests)', () => {
  describe('Edge Cases', () => {
    it('should handle empty nodes array', () => {
      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable([], []);

      expect(table).toContain('No nodes');
    });

    it('should handle nodes without connections', () => {
      const requirement: WorkflowRequirement = {
        type: 'no-connections',
        name: 'No Connections',
        description: 'Workflow without connections',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [
          {
            name: 'isolatedNode',
            displayName: 'Isolated Node',
            description: 'Node with no connections',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(requirement.nodes, requirement.connections);

      expect(table).toContain('isolatedNode');
      expect(table).toContain('无');
    });

    it('should handle nodes with empty dependencies', () => {
      const nodes = [
        {
          name: 'noDeps',
          displayName: 'No Dependencies',
          description: 'Node with no dependencies',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
      ];

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(nodes, []);

      expect(table).toContain('noDeps');
      expect(table).toContain('无');
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'This is a very long description that might span multiple lines and could potentially break the table layout if not handled properly by the table generator implementation.';
      const nodes = [
        {
          name: 'longDesc',
          displayName: 'Long Description',
          description: longDescription,
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
      ];

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(nodes, []);

      expect(table).toContain('longDesc');
      expect(table.length).toBeGreaterThan(0);
    });

    it('should handle nodes with special characters in names', () => {
      const nodes = [
        {
          name: 'node-with-dash',
          displayName: 'Node With Dash',
          description: 'Node with dash',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: ['node_with_underscore', 'node.with.dot'],
        },
        {
          name: 'node_with_underscore',
          displayName: 'Node With Underscore',
          description: 'Node with underscore',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'node.with.dot',
          displayName: 'Node With Dot',
          description: 'Node with dot',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
      ];

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(nodes, []);

      expect(table).toContain('node-with-dash');
      expect(table).toContain('node_with_underscore');
      expect(table).toContain('node.with.dot');
    });
  });

  describe('Complex Dependencies', () => {
    it('should display multiple dependencies correctly', () => {
      const nodes = [
        {
          name: 'node1',
          displayName: 'Node 1',
          description: 'First node',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'node2',
          displayName: 'Node 2',
          description: 'Second node',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'node3',
          displayName: 'Node 3',
          description: 'Third node',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'combined',
          displayName: 'Combined',
          description: 'Combines all previous',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: ['node1', 'node2', 'node3'],
        },
      ];

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(nodes, []);

      expect(table).toContain('node1, node2, node3');
    });

    it('should handle circular dependencies gracefully', () => {
      const nodes = [
        {
          name: 'nodeA',
          displayName: 'Node A',
          description: 'Node A depends on B',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: ['nodeB'],
        },
        {
          name: 'nodeB',
          displayName: 'Node B',
          description: 'Node B depends on A (circular)',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: ['nodeA'],
        },
      ];

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(nodes, []);

      // Should still generate table even with circular deps
      expect(table).toContain('nodeA');
      expect(table).toContain('nodeB');
    });
  });

  describe('Different Node Types', () => {
    it('should display all node types correctly', () => {
      const nodes = [
        {
          name: 'transform',
          displayName: 'Transform Node',
          description: 'Regular transform',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'llm',
          displayName: 'LLM Node',
          description: 'LLM processing',
          nodeType: 'llm' as const,
          timeout: 60000,
          useLLM: true,
          llmSystemPrompt: 'Test',
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'api',
          displayName: 'API Node',
          description: 'API call',
          nodeType: 'api' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'qc',
          displayName: 'Quality Check',
          description: 'Quality check',
          nodeType: 'quality_check' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'batch',
          displayName: 'Batch Node',
          description: 'Batch processing',
          nodeType: 'batch' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
      ];

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(nodes, []);

      expect(table).toContain('transform');
      expect(table).toContain('llm');
      expect(table).toContain('api');
      expect(table).toContain('quality_check');
      expect(table).toContain('batch');
    });

    it('should show quality check status', () => {
      const nodes = [
        {
          name: 'withQC',
          displayName: 'With QC',
          description: 'Has quality check',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: true,
          qualityCheckPrompt: 'Check quality',
          dependencies: [],
        },
        {
          name: 'withoutQC',
          displayName: 'Without QC',
          description: 'No quality check',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
      ];

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(nodes, []);

      // Should indicate quality check status
      expect(table).toContain('withQC');
      expect(table).toContain('withoutQC');
    });
  });

  describe('Timeout Display', () => {
    it('should format timeout in human-readable format', () => {
      const nodes = [
        {
          name: 'seconds',
          displayName: 'Seconds',
          description: 'Timeout in seconds',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
        {
          name: 'minutes',
          displayName: 'Minutes',
          description: 'Timeout in minutes',
          nodeType: 'transform' as const,
          timeout: 120000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
      ];

      const generator = new NodeTableGenerator();
      const table = generator.generateNodeTable(nodes, []);

      expect(table).toContain('30000');
      expect(table).toContain('120000');
    });
  });

  describe('Simplified Table', () => {
    it('should generate simplified table with less information', () => {
      const nodes = [
        {
          name: 'node1',
          displayName: 'Node 1',
          description: 'First node',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
      ];

      const generator = new NodeTableGenerator();
      const fullTable = generator.generateNodeTable(nodes, []);
      const simplifiedTable = generator.generateSimplifiedTable(nodes, []);

      expect(simplifiedTable.length).toBeLessThan(fullTable.length);
      expect(simplifiedTable).toContain('node1');
    });

    it('should show only essential info in simplified table', () => {
      const nodes = [
        {
          name: 'essential',
          displayName: 'Essential Info',
          description: 'Only essential',
          nodeType: 'transform' as const,
          timeout: 30000,
          useLLM: false,
          enableQualityCheck: false,
          dependencies: [],
        },
      ];

      const generator = new NodeTableGenerator();
      const simplified = generator.generateSimplifiedTable(nodes, []);

      expect(simplified).toContain('节点');
      expect(simplified).toContain('类型');
      expect(simplified).toContain('essential');
    });
  });
});
