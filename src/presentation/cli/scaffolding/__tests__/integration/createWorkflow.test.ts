/**
 * Integration Test: Create Workflow - 创建工作流集成测试
 *
 * 测试完整的工作流创建流程
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { buildProjectContext } from '../../utils/contextBuilder.js';
import { AINeuralUnderstandingEngine } from '../../ai/AINeuralUnderstandingEngine.js';
import { AICodeGenerator } from '../../ai/AICodeGenerator.js';
import { AutoValidatorOptimizer } from '../../validation/AutoValidatorOptimizer.js';
import { VisualizationPreviewSystem } from '../../visualization/VisualizationPreviewSystem.js';
import type { ILLMService } from '../../../../../services/llm/ILLMService.js';
import type { WorkflowRequirement } from '../../schemas/WorkflowRequirementSchema.js';

// Mock LLM Service
const createMockLLMService = () => {
  return {
    chat: vi.fn().mockImplementation(async (request) => {
      const userPrompt = request.messages[request.messages.length - 1].content;

      // 需求理解
      if (userPrompt.includes('理解以下工作流需求')) {
        return {
          content: JSON.stringify({
            requirement: {
              type: 'text-summarizer',
              name: 'Text Summarizer',
              description: 'Summarizes text content',
              category: 'content',
              tags: ['summarization', 'nlp'],
              inputParams: [
                {
                  name: 'sourceText',
                  type: 'string',
                  required: true,
                  description: 'Source text to summarize',
                },
              ],
              outputFields: ['summary', 'keyPoints'],
              nodes: [
                {
                  name: 'summarizeNode',
                  displayName: 'Summarize',
                  description: 'Summarize the text',
                  nodeType: 'llm',
                  useLLM: true,
                  llmSystemPrompt: 'Summarize the following text',
                  dependencies: [],
                },
              ],
              connections: [
                { from: 'START', to: 'summarizeNode' },
                { from: 'summarizeNode', to: 'END' },
              ],
              enableQualityCheck: true,
              maxRetries: 3,
              enableCheckpoint: true,
            },
            confidence: 0.9,
            suggestions: [],
          }),
          usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        };
      }

      // 代码生成
      if (userPrompt.includes('生成状态接口')) {
        return {
          content: `
export interface TextSummarizerState extends BaseWorkflowState {
  sourceText: string;
  summary?: string;
  keyPoints?: string[];
}
          `,
          usage: { promptTokens: 300, completionTokens: 100, totalTokens: 400 },
        };
      }

      if (userPrompt.includes('生成节点类')) {
        return {
          content: `
export class SummarizeNode extends BaseNode<TextSummarizerState> {
  async executeLogic(state: TextSummarizerState): Promise<Partial<TextSummarizerState>> {
    const response = await this.llmService.chat({
      messages: [{ role: 'user', content: state.sourceText }]
    });
    return { summary: response.content };
  }
}
          `,
          usage: { promptTokens: 500, completionTokens: 200, totalTokens: 700 },
        };
      }

      if (userPrompt.includes('生成工作流图')) {
        return {
          content: `
export const createTextSummarizerGraph = () => {
  const graph = new StateGraph(TextSummarizerState);
  graph.addNode('summarizeNode', new SummarizeNode());
  graph.setEntryPoint('summarizeNode');
  graph.setExitPoint('summarizeNode');
  return graph.compile();
};
          `,
          usage: { promptTokens: 400, completionTokens: 150, totalTokens: 550 },
        };
      }

      if (userPrompt.includes('生成工厂类')) {
        return {
          content: `
export class TextSummarizerWorkflowFactory implements WorkflowFactory {
  public readonly type = 'text-summarizer';
  public readonly name = 'Text Summarizer';
  public readonly description = 'Summarizes text content';

  createGraph() {
    return createTextSummarizerGraph();
  }

  createState(params: any) {
    return { sourceText: params.sourceText };
  }

  validateParams(params: any) {
    return typeof params.sourceText === 'string';
  }
}
          `,
          usage: { promptTokens: 300, completionTokens: 200, totalTokens: 500 },
        };
      }

      // 代码验证
      if (userPrompt.includes('代码审查专家')) {
        return {
          content: JSON.stringify({
            summary: { overallScore: 85, pass: true, passThreshold: 70 },
            dimensions: {
              typeSafety: { score: 90, issues: [], suggestions: [] },
              codeStyle: { score: 85, issues: [], suggestions: [] },
              bestPractices: { score: 80, issues: [], suggestions: [] },
              performance: { score: 95, issues: [], suggestions: [] },
              maintainability: { score: 88, issues: [], suggestions: [] },
              errorHandling: { score: 75, issues: [], suggestions: [] },
            },
            criticalIssues: [],
            improvements: [],
            autoFixable: [],
          }),
          usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        };
      }

      return {
        content: 'Default response',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };
    }),
    healthCheck: vi.fn().mockResolvedValue(true),
    estimateTokens: vi.fn().mockReturnValue(100),
    estimateCost: vi.fn().mockReturnValue(0.001),
  };
};

describe('Create Workflow Integration Test', () => {
  let mockLLMService: ILLMService;
  let understandingEngine: AINeuralUnderstandingEngine;
  let codeGenerator: AICodeGenerator;
  let validatorOptimizer: AutoValidatorOptimizer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLLMService = createMockLLMService();
    understandingEngine = new AINeuralUnderstandingEngine(mockLLMService);
    codeGenerator = new AICodeGenerator(mockLLMService);
    validatorOptimizer = new AutoValidatorOptimizer(mockLLMService);
  });

  describe('End-to-End Workflow Creation', () => {
    it('should create a complete workflow from natural language', async () => {
      // Arrange
      const description = 'Create a workflow that summarizes text';
      const context = await buildProjectContext();

      // Act: 1. Understand requirement
      const understanding = await understandingEngine.understandRequirement(description, context);
      expect(understanding.requirement).toBeDefined();
      expect(understanding.requirement.type).toBe('text-summarizer');

      // Act: 2. Optimize requirement
      const optimized = await understandingEngine.optimizeRequirement(
        understanding.requirement,
        understanding.suggestions,
        context
      );
      expect(optimized.requirement).toBeDefined();

      // Act: 3. Generate visualization
      const preview = VisualizationPreviewSystem.displayPreview(
        optimized.requirement,
        context
      );
      expect(preview).toContain('Text Summarizer');
      expect(preview).toContain('mermaid');

      // Act: 4. Generate code
      const generatedFiles = await codeGenerator.generateWorkflow(
        optimized.requirement,
        context
      );
      expect(generatedFiles.state).toBeDefined();
      expect(generatedFiles.nodes.size).toBeGreaterThan(0);
      expect(generatedFiles.factory).toBeDefined();

      // Act: 5. Validate code
      const validation = await validatorOptimizer.validateCode(
        generatedFiles,
        context.codePatterns,
        context.bestPractices
      );
      expect(validation.overallScore).toBeGreaterThan(0);
      expect(validation.stats.totalFiles).toBeGreaterThan(0);
    });

    it('should handle validation and auto-fix cycle', async () => {
      // Arrange
      const context = await buildProjectContext();
      const requirement: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        category: 'other',
        tags: [],
        inputParams: [
          {
            name: 'input',
            type: 'string',
            required: true,
            description: 'Input parameter',
          },
        ],
        outputFields: ['output'],
        nodes: [
          {
            name: 'testNode',
            displayName: 'Test',
            description: 'Test node',
            nodeType: 'custom',
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'testNode' },
          { from: 'testNode', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 1,
        enableCheckpoint: true,
      };

      // Act: Generate code
      const generatedFiles = await codeGenerator.generateWorkflow(requirement, context);

      // Act: Validate and fix
      const { files: fixedFiles, result } = await validatorOptimizer.validateAndFix(
        generatedFiles,
        context.codePatterns,
        context.bestPractices,
        {
          enableESLintFix: true,
          maxRetries: 1,
        }
      );

      // Assert
      expect(fixedFiles).toBeDefined();
      expect(result).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle LLM service failures gracefully', async () => {
      // Arrange
      const failingLLMService: ILLMService = {
        chat: vi.fn().mockRejectedValue(new Error('LLM service unavailable')),
        healthCheck: vi.fn().mockResolvedValue(false),
        estimateTokens: vi.fn().mockReturnValue(0),
        estimateCost: vi.fn().mockReturnValue(0),
      };

      const engine = new AINeuralUnderstandingEngine(failingLLMService);
      const context = await buildProjectContext();

      // Act & Assert
      await expect(
        engine.understandRequirement('test description', context)
      ).rejects.toThrow();
    });

    it('should handle invalid workflow requirements', async () => {
      // Arrange
      const invalidRequirement = {
        type: 'invalid-type-with-spaces',
        name: '',
        description: 'Too short',
        // Missing required fields
      };

      const context = await buildProjectContext();

      // Act & Assert
      const generatedFiles = await codeGenerator.generateWorkflow(
        invalidRequirement as any,
        context
      );

      // Should still generate something, even if incomplete
      expect(generatedFiles).toBeDefined();
    });
  });
});
