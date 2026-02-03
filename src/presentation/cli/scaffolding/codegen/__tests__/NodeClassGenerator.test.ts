/**
 * NodeClassGenerator Tests - 节点类生成器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NodeClassGenerator } from '../NodeClassGenerator.js';
import type { WorkflowRequirement, WorkflowNode } from '../../schemas/WorkflowRequirementSchema.js';
import type { ILLMService } from '../../../../../../../services/llm/ILLMService.js';

const mockLLMService: ILLMService = {
  chat: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  estimateCost: vi.fn(() => 0.001),
};

describe('NodeClassGenerator', () => {
  let generator: NodeClassGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new NodeClassGenerator(mockLLMService);
  });

  describe('generate', () => {
    it('should generate transform node class', async () => {
      const node: WorkflowNode = {
        name: 'process',
        displayName: 'Process',
        description: 'Process data',
        nodeType: 'transform',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: [],
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
class ProcessNode extends BaseNode<TestWorkflowState> {
  protected async executeLogic(state: TestWorkflowState): Promise<Partial<TestWorkflowState>> {
    // Process the input
    const result = state.inputText + ' processed';

    return {
      result,
    };
  }
}
\`\`\`
        `,
        usage: { promptTokens: 100, completionTokens: 60, totalTokens: 160 },
        cost: 0.001,
      });

      const code = await generator.generate(node, 'TestWorkflowState');

      expect(code).toContain('class ProcessNode');
      expect(code).toContain('extends BaseNode<TestWorkflowState>');
      expect(code).toContain('executeLogic');
      expect(code).toContain('Promise<Partial<TestWorkflowState>>');
    });

    it('should generate LLM node with system prompt', async () => {
      const node: WorkflowNode = {
        name: 'generate',
        displayName: 'Generate',
        description: 'Generate content',
        nodeType: 'llm',
        timeout: 60000,
        useLLM: true,
        llmSystemPrompt: 'You are a helpful assistant.',
        enableQualityCheck: false,
        dependencies: [],
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
class GenerateNode extends BaseNode<TestWorkflowState> {
  private systemPrompt = 'You are a helpful assistant.';

  protected async executeLogic(state: TestWorkflowState): Promise<Partial<TestWorkflowState>> {
    const response = await this.llmService.chat({
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: state.inputText },
      ],
    });

    return {
      generatedContent: response.content,
    };
  }
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 80, totalTokens: 230 },
        cost: 0.002,
      });

      const code = await generator.generate(node, 'TestWorkflowState');

      expect(code).toContain('class GenerateNode');
      expect(code).toContain('systemPrompt');
      expect(code).toContain('llmService.chat');
    });

    it('should generate API node', async () => {
      const node: WorkflowNode = {
        name: 'fetchData',
        displayName: 'Fetch Data',
        description: 'Fetch data from API',
        nodeType: 'api',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: [],
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
class FetchDataNode extends BaseNode<TestWorkflowState> {
  protected async executeLogic(state: TestWorkflowState): Promise<Partial<TestWorkflowState>> {
    const response = await fetch('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: state.inputText }),
    });

    const data = await response.json();

    return {
      apiData: data,
    };
  }
}
\`\`\`
        `,
        usage: { promptTokens: 120, completionTokens: 70, totalTokens: 190 },
        cost: 0.001,
      });

      const code = await generator.generate(node, 'TestWorkflowState');

      expect(code).toContain('class FetchDataNode');
      expect(code).toContain('fetch');
      expect(code).toContain('response.json()');
    });

    it('should generate quality check node', async () => {
      const node: WorkflowNode = {
        name: 'checkQuality',
        displayName: 'Check Quality',
        description: 'Check output quality',
        nodeType: 'quality_check',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: ['generate'],
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
class CheckQualityNode extends BaseNode<TestWorkflowState> {
  protected async executeLogic(state: TestWorkflowState): Promise<Partial<TestWorkflowState>> {
    // Check if quality score meets threshold
    const score = state.qualityScore || 0;

    if (score < 0.8 && state.retryCount < 3) {
      return {
        retryCount: state.retryCount + 1,
        lastError: 'Quality score too low',
      };
    }

    return {
      passed: true,
    };
  }
}
\`\`\`
        `,
        usage: { promptTokens: 130, completionTokens: 80, totalTokens: 210 },
        cost: 0.002,
      });

      const code = await generator.generate(node, 'TestWorkflowState');

      expect(code).toContain('class CheckQualityNode');
      expect(code).toContain('qualityScore');
      expect(code).toContain('retryCount');
    });

    it('should generate batch processing node', async () => {
      const node: WorkflowNode = {
        name: 'batchProcess',
        displayName: 'Batch Process',
        description: 'Process items in batch',
        nodeType: 'batch',
        timeout: 120000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: [],
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
class BatchProcessNode extends BaseNode<TestWorkflowState> {
  protected async executeLogic(state: TestWorkflowState): Promise<Partial<TestWorkflowState>> {
    const items = state.items || [];
    const batchSize = 10;
    const results = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(item => this.processItem(item))
      );
      results.push(...batchResults);
    }

    return {
      processedItems: results,
    };
  }

  private async processItem(item: any): Promise<any> {
    // Process single item
    return item;
  }
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 100, totalTokens: 250 },
        cost: 0.002,
      });

      const code = await generator.generate(node, 'TestWorkflowState');

      expect(code).toContain('class BatchProcessNode');
      expect(code).toContain('batchSize');
      expect(code).toContain('Promise.all');
    });
  });

  describe('Quality Check Integration', () => {
    it('should include quality check when enabled', async () => {
      const node: WorkflowNode = {
        name: 'processWithQC',
        displayName: 'Process With QC',
        description: 'Process with quality check',
        nodeType: 'transform',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: true,
        qualityCheckPrompt: 'Check the quality of the result',
        dependencies: [],
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
class ProcessWithQCNode extends BaseNode<TestWorkflowState> {
  protected async executeLogic(state: TestWorkflowState): Promise<Partial<TestWorkflowState>> {
    const result = this.processData(state.inputText);

    // Quality check
    const qcResponse = await this.llmService.chat({
      messages: [
        { role: 'system', content: 'Check the quality of the result' },
        { role: 'user', content: result },
      ],
    });

    const qualityScore = parseFloat(qcResponse.content) || 0;

    return {
      result,
      qualityScore,
    };
  }

  private processData(input: string): string {
    return input.toUpperCase();
  }
}
\`\`\`
        `,
        usage: { promptTokens: 150, completionTokens: 90, totalTokens: 240 },
        cost: 0.002,
      });

      const code = await generator.generate(node, 'TestWorkflowState');

      expect(code).toContain('qualityScore');
      expect(code).toContain('llmService.chat');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when LLM fails', async () => {
      const node: WorkflowNode = {
        name: 'errorNode',
        displayName: 'Error Node',
        description: 'Test error',
        nodeType: 'transform',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: [],
      };

      vi.mocked(mockLLMService.chat).mockRejectedValue(new Error('LLM failed'));

      await expect(generator.generate(node, 'TestState')).rejects.toThrow('Failed to generate node class');
    });

    it('should extract code from markdown blocks', async () => {
      const node: WorkflowNode = {
        name: 'codeBlockNode',
        displayName: 'Code Block Node',
        description: 'Test code block extraction',
        nodeType: 'transform',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: [],
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
Here is the node class:

\`\`\`typescript
class CodeBlockNode extends BaseNode<TestState> {
  protected async executeLogic(state: TestState): Promise<Partial<TestState>> {
    return { result: 'ok' };
  }
}
\`\`\`

Let me know if you need changes.
        `,
        usage: { promptTokens: 80, completionTokens: 50, totalTokens: 130 },
        cost: 0.001,
      });

      const code = await generator.generate(node, 'TestState');

      expect(code).toContain('class CodeBlockNode');
      expect(code).not.toContain('Here is the node');
      expect(code).not.toContain('```');
    });
  });

  describe('Dependencies', () => {
    it('should handle nodes with dependencies', async () => {
      const node: WorkflowNode = {
        name: 'dependent',
        displayName: 'Dependent Node',
        description: 'Node with dependencies',
        nodeType: 'transform',
        timeout: 30000,
        useLLM: false,
        enableQualityCheck: false,
        dependencies: ['previousNode', 'anotherNode'],
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue({
        content: `
\`\`\`typescript
class DependentNode extends BaseNode<TestWorkflowState> {
  protected async executeLogic(state: TestWorkflowState): Promise<Partial<TestWorkflowState>> {
    // Use outputs from dependencies
    const prevResult = state.previousNodeOutput;
    const anotherResult = state.anotherNodeOutput;

    return {
      combined: prevResult + anotherResult,
    };
  }
}
\`\`\`
        `,
        usage: { promptTokens: 100, completionTokens: 70, totalTokens: 170 },
        cost: 0.001,
      });

      const code = await generator.generate(node, 'TestWorkflowState');

      expect(code).toContain('class DependentNode');
      expect(code).toContain('previousNodeOutput');
      expect(code).toContain('anotherNodeOutput');
    });
  });
});
