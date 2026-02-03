/**
 * MermaidDiagramGenerator Tests - 补充复杂图表测试
 */

import { describe, it, expect } from 'vitest';
import { MermaidDiagramGenerator } from '../MermaidDiagramGenerator.js';
import type { WorkflowRequirement } from '../../schemas/WorkflowRequirementSchema.js';

describe('MermaidDiagramGenerator (Advanced Tests)', () => {
  describe('Complex Workflows', () => {
    it('should handle workflow with multiple branches', () => {
      const requirement: WorkflowRequirement = {
        type: 'multi-branch-workflow',
        name: 'Multi-Branch Workflow',
        description: 'Workflow with multiple conditional branches',
        category: 'content',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [
          {
            name: 'start',
            displayName: 'Start',
            description: 'Start node',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'branch1',
            displayName: 'Branch 1',
            description: 'First branch',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'branch2',
            displayName: 'Branch 2',
            description: 'Second branch',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'branch3',
            displayName: 'Branch 3',
            description: 'Third branch',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'start' },
          { from: 'start', to: 'branch1', condition: 'type == 1' },
          { from: 'start', to: 'branch2', condition: 'type == 2' },
          { from: 'start', to: 'branch3', condition: 'type == 3' },
          { from: 'branch1', to: 'END' },
          { from: 'branch2', to: 'END' },
          { from: 'branch3', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const generator = new MermaidDiagramGenerator({ showConditions: true });
      const mermaidCode = generator.generateMermaidDiagram(requirement);

      expect(mermaidCode).toContain('branch1');
      expect(mermaidCode).toContain('branch2');
      expect(mermaidCode).toContain('branch3');
      expect(mermaidCode).toContain('type == 1');
      expect(mermaidCode).toContain('type == 2');
      expect(mermaidCode).toContain('type == 3');
    });

    it('should handle workflow with loops', () => {
      const requirement: WorkflowRequirement = {
        type: 'loop-workflow',
        name: 'Loop Workflow',
        description: 'Workflow with retry loops',
        category: 'content',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [
          {
            name: 'process',
            displayName: 'Process',
            description: 'Process with retry',
            nodeType: 'llm',
            timeout: 60000,
            useLLM: true,
            llmSystemPrompt: 'Process',
            enableQualityCheck: true,
            qualityCheckPrompt: 'Check quality',
            dependencies: [],
          },
          {
            name: 'validate',
            displayName: 'Validate',
            description: 'Validate result',
            nodeType: 'quality_check',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: ['process'],
          },
        ],
        connections: [
          { from: 'START', to: 'process' },
          { from: 'process', to: 'validate' },
          { from: 'validate', to: 'process', condition: 'fail && retryCount < 3' },
          { from: 'validate', to: 'END', condition: 'success || retryCount >= 3' },
        ],
        enableQualityCheck: true,
        maxRetries: 3,
        enableCheckpoint: true,
      };

      const generator = new MermaidDiagramGenerator({ showConditions: true });
      const mermaidCode = generator.generateMermaidDiagram(requirement);

      expect(mermaidCode).toContain('validate-->|fail && retryCount < 3|process');
      expect(mermaidCode).toContain('validate-->|success||retryCount >= 3|END');
    });

    it('should handle complex nested dependencies', () => {
      const requirement: WorkflowRequirement = {
        type: 'nested-deps-workflow',
        name: 'Nested Dependencies',
        description: 'Workflow with nested node dependencies',
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
            description: 'Depends on node1',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: ['node1'],
          },
          {
            name: 'node3',
            displayName: 'Node 3',
            description: 'Depends on node1 and node2',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: ['node1', 'node2'],
          },
          {
            name: 'node4',
            displayName: 'Node 4',
            description: 'Depends on node2',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: ['node2'],
          },
          {
            name: 'final',
            displayName: 'Final',
            description: 'Final node depends on all',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: ['node3', 'node4'],
          },
        ],
        connections: [
          { from: 'START', to: 'node1' },
          { from: 'START', to: 'node2' },
          { from: 'node1', to: 'node3' },
          { from: 'node2', to: 'node3' },
          { from: 'node2', to: 'node4' },
          { from: 'node3', to: 'final' },
          { from: 'node4', to: 'final' },
          { from: 'final', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const generator = new MermaidDiagramGenerator();
      const mermaidCode = generator.generateMermaidDiagram(requirement);

      expect(mermaidCode).toContain('node1');
      expect(mermaidCode).toContain('node2');
      expect(mermaidCode).toContain('node3');
      expect(mermaidCode).toContain('node4');
      expect(mermaidCode).toContain('final');
    });
  });

  describe('Edge Cases', () => {
    it('should handle workflow with only START and END', () => {
      const requirement: WorkflowRequirement = {
        type: 'empty-workflow',
        name: 'Empty Workflow',
        description: 'Workflow with no nodes',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [{ from: 'START', to: 'END' }],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const generator = new MermaidDiagramGenerator();
      const mermaidCode = generator.generateMermaidDiagram(requirement);

      expect(mermaidCode).toContain('START');
      expect(mermaidCode).toContain('END');
      expect(mermaidCode).toContain('START-->END');
    });

    it('should handle special characters in node names', () => {
      const requirement: WorkflowRequirement = {
        type: 'special-chars',
        name: 'Special Characters',
        description: 'Workflow with special characters',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [
          {
            name: 'node-with-dash',
            displayName: 'Node With Dash',
            description: 'Node with dash in name',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'node_with_underscore',
            displayName: 'Node With Underscore',
            description: 'Node with underscore',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'node-with-dash' },
          { from: 'node-with-dash', to: 'node_with_underscore' },
          { from: 'node_with_underscore', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const generator = new MermaidDiagramGenerator();
      const mermaidCode = generator.generateMermaidDiagram(requirement);

      expect(mermaidCode).toContain('node-with-dash');
      expect(mermaidCode).toContain('node_with_underscore');
    });

    it('should handle very long node names', () => {
      const longName = 'this_is_a_very_long_node_name_that_might_break_visualization';
      const requirement: WorkflowRequirement = {
        type: 'long-names',
        name: 'Long Names Workflow',
        description: 'Workflow with long names',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [
          {
            name: longName,
            displayName: 'Very Long Node Name That Might Display Poorly',
            description: 'Node with long name',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: longName },
          { from: longName, to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const generator = new MermaidDiagramGenerator();
      const mermaidCode = generator.generateMermaidDiagram(requirement);

      expect(mermaidCode).toContain(longName);
    });
  });

  describe('Different Graph Directions', () => {
    it('should generate LR (Left to Right) diagram', () => {
      const generator = new MermaidDiagramGenerator({ direction: 'LR' });
      const mermaidCode = generator.generateMermaidDiagram({
        type: 'test',
        name: 'Test',
        description: 'Test',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [{ from: 'START', to: 'END' }],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      });

      expect(mermaidCode).toContain('graph LR');
    });

    it('should generate RL (Right to Left) diagram', () => {
      const generator = new MermaidDiagramGenerator({ direction: 'RL' });
      const mermaidCode = generator.generateMermaidDiagram({
        type: 'test',
        name: 'Test',
        description: 'Test',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [{ from: 'START', to: 'END' }],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      });

      expect(mermaidCode).toContain('graph RL');
    });

    it('should generate TD (Top to Down) diagram', () => {
      const generator = new MermaidDiagramGenerator({ direction: 'TD' });
      const mermaidCode = generator.generateMermaidDiagram({
        type: 'test',
        name: 'Test',
        description: 'Test',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [{ from: 'START', to: 'END' }],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      });

      expect(mermaidCode).toContain('graph TD');
    });

    it('should generate BT (Bottom to Top) diagram', () => {
      const generator = new MermaidDiagramGenerator({ direction: 'BT' });
      const mermaidCode = generator.generateMermaidDiagram({
        type: 'test',
        name: 'Test',
        description: 'Test',
        category: 'other',
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [{ from: 'START', to: 'END' }],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      });

      expect(mermaidCode).toContain('graph BT');
    });
  });

  describe('Subgraphs and Styling', () => {
    it('should apply custom styles to different node types', () => {
      const requirement: WorkflowRequirement = {
        type: 'styled-workflow',
        name: 'Styled Workflow',
        description: 'Workflow with different node types',
        category: 'content',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [
          {
            name: 'llmNode',
            displayName: 'LLM Node',
            description: 'LLM processing',
            nodeType: 'llm',
            timeout: 60000,
            useLLM: true,
            llmSystemPrompt: 'Test',
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'apiNode',
            displayName: 'API Node',
            description: 'API call',
            nodeType: 'api',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'qcNode',
            displayName: 'QC Node',
            description: 'Quality check',
            nodeType: 'quality_check',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'llmNode' },
          { from: 'llmNode', to: 'apiNode' },
          { from: 'apiNode', to: 'qcNode' },
          { from: 'qcNode', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const generator = new MermaidDiagramGenerator();
      const mermaidCode = generator.generateMermaidDiagram(requirement);

      // Check for style definitions
      expect(mermaidCode).toContain('classDef llmNode');
      expect(mermaidCode).toContain('classDef apiNode');
      expect(mermaidCode).toContain('classDef qualityNode');
      expect(mermaidCode).toContain('classDef transformNode');

      // Check for style applications
      expect(mermaidCode).toContain('class llmNode llmNode');
      expect(mermaidCode).toContain('class apiNode apiNode');
      expect(mermaidCode).toContain('class qcNode qualityNode');
    });
  });
});
