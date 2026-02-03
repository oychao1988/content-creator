/**
 * AI Code Generator Tests - AI 代码生成器测试
 *
 * 测试代码生成的各个组件
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AICodeGenerator } from '../../ai/AICodeGenerator.js';
import type { WorkflowRequirement, ProjectContext } from '../../schemas/WorkflowRequirementSchema.js';
import type { ILLMService } from '../../../../../../services/llm/ILLMService.js';

// Mock LLM Service
const mockLLMService: ILLMService = {
  chat: vi.fn(),
  healthCheck: vi.fn(async () => true),
  estimateTokens: vi.fn((text: string) => text.length / 4),
  estimateCost: vi.fn(() => 0.001),
};

// 测试用工作流需求
const testRequirement: WorkflowRequirement = {
  type: 'test-workflow',
  name: 'Test Workflow',
  description: 'A simple test workflow for unit testing',
  category: 'other',
  tags: ['test'],
  inputParams: [
    {
      name: 'inputText',
      type: 'string',
      required: true,
      description: 'Input text to process',
      examples: ['Hello, world!'],
    },
    {
      name: 'maxLength',
      type: 'number',
      required: false,
      description: 'Maximum length of output',
      defaultValue: 1000,
    },
  ],
  outputFields: ['processedText', 'qualityScore'],
  nodes: [
    {
      name: 'process',
      displayName: 'Process Text',
      description: 'Process the input text',
      nodeType: 'llm',
      timeout: 60000,
      useLLM: true,
      llmSystemPrompt: 'You are a text processor. Process the given text.',
      enableQualityCheck: false,
      dependencies: [],
    },
    {
      name: 'checkQuality',
      displayName: 'Check Quality',
      description: 'Check the quality of processed text',
      nodeType: 'quality_check',
      timeout: 30000,
      useLLM: false,
      enableQualityCheck: true,
      qualityCheckPrompt: 'Evaluate the quality of the text',
      dependencies: ['process'],
    },
  ],
  connections: [
    { from: 'START', to: 'process' },
    { from: 'process', to: 'checkQuality' },
    {
      from: 'checkQuality',
      to: 'process',
      condition: 'state.qualityScore < 8 && state.retryCount < 3',
    },
    { from: 'checkQuality', to: 'END' },
  ],
  enableQualityCheck: true,
  maxRetries: 3,
  enableCheckpoint: true,
};

// 测试用项目上下文
const testContext: ProjectContext = {
  existingWorkflows: [],
  codePatterns: '',
  bestPractices: '',
  commonNodes: '',
};

describe('AICodeGenerator', () => {
  let generator: AICodeGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new AICodeGenerator(mockLLMService, {
      enablePostProcess: false, // 禁用后处理以加速测试
      parallelNodes: false, // 串行生成以便测试
    });
  });

  describe('generateWorkflow', () => {
    it('should generate complete workflow files', async () => {
      // Mock LLM 响应
      (mockLLMService.chat as any).mockResolvedValue({
        content: `
\`\`\`typescript
export interface TestWorkflowState extends BaseWorkflowState {
  inputText: string;
  maxLength?: number;
  processedText?: string;
  qualityScore?: number;
  retryCount: number;
}
\`\`\`
        `,
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
        cost: 0.001,
      });

      const files = await generator.generateWorkflow(testRequirement, testContext);

      // 验证生成了所有文件
      expect(files.state).toBeTruthy();
      expect(files.state).toContain('interface TestWorkflowState');
      expect(files.nodes.size).toBe(2); // 两个节点
      expect(files.routeFunctions).toBeTruthy();
      expect(files.graph).toBeTruthy();
      expect(files.factory).toBeTruthy();
      expect(files.index).toBeTruthy();
    });

    it('should handle LLM errors gracefully', async () => {
      // Mock LLM 错误
      (mockLLMService.chat as any).mockRejectedValue(new Error('LLM service unavailable'));

      await expect(
        generator.generateWorkflow(testRequirement, testContext)
      ).rejects.toThrow('Failed to generate workflow code');
    });
  });

  describe('generateFile', () => {
    it('should generate state interface', async () => {
      (mockLLMService.chat as any).mockResolvedValue({
        content: 'export interface TestWorkflowState extends BaseWorkflowState { inputText: string; }',
        usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
        cost: 0.0005,
      });

      const code = await generator.generateFile('state', testRequirement, testContext);

      expect(code).toContain('interface TestWorkflowState');
      expect(code).toContain('extends BaseWorkflowState');
      expect(mockLLMService.chat).toHaveBeenCalledTimes(1);
    });

    it('should generate node class', async () => {
      (mockLLMService.chat as any).mockResolvedValue({
        content: `
\`\`\`typescript
class ProcessNode extends BaseNode<TestWorkflowState> {
  protected async executeLogic(state: TestWorkflowState): Promise<Partial<TestWorkflowState>> {
    return { processedText: 'processed' };
  }
}
\`\`\`
        `,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        cost: 0.001,
      });

      const code = await generator.generateFile('node', testRequirement, testContext);

      expect(code).toContain('class ProcessNode');
      expect(code).toContain('extends BaseNode');
    });

    it('should throw error for unknown file type', async () => {
      await expect(
        generator.generateFile('unknown', testRequirement, testContext)
      ).rejects.toThrow('Unknown file type: unknown');
    });
  });

  describe('calculateQualityScore', () => {
    it('should calculate average quality score', async () => {
      const files = {
        state: 'export interface TestState {}',
        nodes: new Map([['process', 'class ProcessNode {}']]),
        routeFunctions: '',
        graph: 'export function createTestGraph() {}',
        factory: 'class TestWorkflowFactory {}',
        index: 'export {}',
      };

      // Mock 计算质量分数（禁用后处理时返回默认值）
      const score = await generator.calculateQualityScore(files);

      // 由于禁用了后处理，应该返回合理的分数
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});

describe('StateInterfaceGenerator', () => {
  // TODO: 添加 StateInterfaceGenerator 的单元测试
  it('should be implemented', () => {
    expect(true).toBe(true);
  });
});

describe('NodeClassGenerator', () => {
  // TODO: 添加 NodeClassGenerator 的单元测试
  it('should be implemented', () => {
    expect(true).toBe(true);
  });
});

describe('RouteFunctionGenerator', () => {
  // TODO: 添加 RouteFunctionGenerator 的单元测试
  it('should be implemented', () => {
    expect(true).toBe(true);
  });
});

describe('WorkflowGraphGenerator', () => {
  // TODO: 添加 WorkflowGraphGenerator 的单元测试
  it('should be implemented', () => {
    expect(true).toBe(true);
  });
});

describe('FactoryClassGenerator', () => {
  // TODO: 添加 FactoryClassGenerator 的单元测试
  it('should be implemented', () => {
    expect(true).toBe(true);
  });
});

describe('CodePostProcessor', () => {
  // TODO: 添加 CodePostProcessor 的单元测试
  it('should be implemented', () => {
    expect(true).toBe(true);
  });
});
