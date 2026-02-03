/**
 * WorkflowGraphGenerator Tests - 工作流图生成器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkflowGraphGenerator } from '../WorkflowGraphGenerator.js';
import type { WorkflowRequirement } from '../../schemas/WorkflowRequirementSchema.js';
import type { ILLMService } from '../../../../../../../services/llm/ILLMService.js';

const mockLLMService: ILLMService = {
  chat: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  estimateCost: vi.fn(() => 0.001),
};

describe('WorkflowGraphGenerator', () => {
  let generator: WorkflowGraphGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new WorkflowGraphGenerator(mockLLMService);
  });

  describe('generate', () => {
    it('should generate simple linear workflow graph', async () => {
      const requirement: WorkflowRequirement = {
        type: 'simple-workflow',
        name: 'Simple Workflow',
        description: 'Simple linear workflow',
        category: 'content',
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
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
import { StateGraph } from '@langchain/langgraph';
import type { WorkflowGraph } from '../../../../domain/workflow/WorkflowRegistry.js';
import { Node1Node } from './nodes/Node1Node.js';
import { Node2Node } from './nodes/Node2Node.js';

export function createSimpleWorkflowGraph(): WorkflowGraph {
  const graph = new StateGraph(SimpleWorkflowState)
    .addNode('node1', new Node1Node())
    .addNode('node2', new Node2Node())
    .addEdge('START', 'node1')
    .addEdge('node1', 'node2')
    .addEdge('node2', 'END');

  return graph.compile();
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
        cost: 0.002,
      });

      const code = await generator.generate(requirement, 'SimpleWorkflowState');

      expect(code).toContain('StateGraph');
      expect(code).toContain("addNode('node1'");
      expect(code).toContain("addNode('node2'");
      expect(code).toContain("addEdge('START', 'node1')");
      expect(code).toContain("addEdge('node1', 'node2')");
      expect(code).toContain("addEdge('node2', 'END')");
      expect(code).toContain('compile()');
    });

    it('should generate workflow with conditional edges', async () => {
      const requirement: WorkflowRequirement = {
        type: 'conditional-workflow',
        name: 'Conditional Workflow',
        description: 'Workflow with conditions',
        category: 'content',
        tags: [],
        inputParams: [],
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
          {
            name: 'processA',
            displayName: 'Process A',
            description: 'Path A',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'processB',
            displayName: 'Process B',
            description: 'Path B',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'decide' },
          { from: 'decide', to: 'processA', condition: 'state.choice === "A"' },
          { from: 'decide', to: 'processB', condition: 'state.choice === "B"' },
          { from: 'processA', to: 'END' },
          { from: 'processB', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
import { StateGraph } from '@langchain/langgraph';

export function createConditionalWorkflowGraph(): WorkflowGraph {
  const graph = new StateGraph(ConditionalWorkflowState)
    .addNode('decide', new DecideNode())
    .addNode('processA', new ProcessANode())
    .addNode('processB', new ProcessBNode())
    .addEdge('START', 'decide')
    .addConditionalEdges(
      'decide',
      (state: ConditionalWorkflowState) => {
        if (state.choice === 'A') return 'processA';
        if (state.choice === 'B') return 'processB';
        return 'END';
      },
      {
        processA: 'processA',
        processB: 'processB',
        END: 'END',
      }
    )
    .addEdge('processA', 'END')
    .addEdge('processB', 'END');

  return graph.compile();
}
\`\`\`
        `,
        usage: { promptTokens: 200, completionTokens: 120, totalTokens: 320 },
        cost: 0.003,
      });

      const code = await generator.generate(requirement, 'ConditionalWorkflowState');

      expect(code).toContain('addConditionalEdges');
      expect(code).toContain('state.choice');
    });

    it('should generate workflow with retry loops', async () => {
      const requirement: WorkflowRequirement = {
        type: 'retry-workflow',
        name: 'Retry Workflow',
        description: 'Workflow with retries',
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
            description: 'Validate output',
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
          { from: 'validate', to: 'process', condition: '!state.passed && state.retryCount < 3' },
          { from: 'validate', to: 'END', condition: 'state.passed || state.retryCount >= 3' },
        ],
        enableQualityCheck: true,
        maxRetries: 3,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
import { StateGraph } from '@langchain/langgraph';

export function createRetryWorkflowGraph(): WorkflowGraph {
  const graph = new StateGraph(RetryWorkflowState)
    .addNode('process', new ProcessNode())
    .addNode('validate', new ValidateNode())
    .addEdge('START', 'process')
    .addEdge('process', 'validate')
    .addConditionalEdges(
      'validate',
      (state: RetryWorkflowState) => {
        if (state.passed || state.retryCount >= 3) return 'END';
        return 'process';
      },
      {
        process: 'process',
        END: 'END',
      }
    );

  return graph.compile();
}
\`\`\`
        `,
        usage: { promptTokens: 180, completionTokens: 110, totalTokens: 290 },
        cost: 0.002,
      });

      const code = await generator.generate(requirement, 'RetryWorkflowState');

      expect(code).toContain('addConditionalEdges');
      expect(code).toContain('retryCount');
    });

    it('should import all node classes', async () => {
      const requirement: WorkflowRequirement = {
        type: 'multi-node',
        name: 'Multi Node',
        description: 'Multiple nodes',
        category: 'content',
        tags: [],
        inputParams: [],
        outputFields: ['result'],
        nodes: [
          {
            name: 'node1',
            displayName: 'Node 1',
            description: 'First',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'node2',
            displayName: 'Node 2',
            description: 'Second',
            nodeType: 'llm',
            timeout: 60000,
            useLLM: true,
            llmSystemPrompt: 'Test',
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'node3',
            displayName: 'Node 3',
            description: 'Third',
            nodeType: 'api',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'node1' },
          { from: 'node1', to: 'node2' },
          { from: 'node2', to: 'node3' },
          { from: 'node3', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
import { Node1Node } from './nodes/Node1Node.js';
import { Node2Node } from './nodes/Node2Node.js';
import { Node3Node } from './nodes/Node3Node.js';

export function createMultiNodeGraph() {
  const graph = new StateGraph(MultiNodeState)
    .addNode('node1', new Node1Node())
    .addNode('node2', new Node2Node())
    .addNode('node3', new Node3Node())
    .addEdge('START', 'node1')
    .addEdge('node1', 'node2')
    .addEdge('node2', 'node3')
    .addEdge('node3', 'END');

  return graph.compile();
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
        cost: 0.002,
      });

      const code = await generator.generate(requirement, 'MultiNodeState');

      expect(code).toContain("from './nodes/Node1Node.js'");
      expect(code).toContain("from './nodes/Node2Node.js'");
      expect(code).toContain("from './nodes/Node3Node.js'");
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

      await expect(generator.generate(requirement, 'TestState')).rejects.toThrow('Failed to generate workflow graph');
    });

    it('should extract code from markdown blocks', async () => {
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
Here is the graph function:

\`\`\`typescript
export function createCodeBlockGraph() {
  return new StateGraph(CodeBlockState).compile();
}
\`\`\`

Done!
        `,
        usage: { promptTokens: 80, completionTokens: 50, totalTokens: 130 },
        cost: 0.001,
      });

      const code = await generator.generate(requirement, 'CodeBlockState');

      expect(code).toContain('createCodeBlockGraph');
      expect(code).not.toContain('Here is the graph');
      expect(code).not.toContain('```');
    });
  });
});
