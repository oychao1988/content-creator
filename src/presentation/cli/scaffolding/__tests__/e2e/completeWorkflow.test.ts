/**
 * End-to-End Tests for Workflow Scaffolding
 *
 * 测试完整的工作流脚手架创建流程
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AINeuralUnderstandingEngine } from '../../ai/AINeuralUnderstandingEngine.js';
import { AICodeGenerator } from '../../ai/AICodeGenerator.js';
import { VisualizationPreviewSystem } from '../../visualization/VisualizationPreviewSystem.js';
import { AutoValidatorOptimizer } from '../../validation/AutoValidatorOptimizer.js';
import type { ILLMService } from '../../../../../services/llm/ILLMService.js';

// Mock LLM Service
const createMockLLMService = () => ({
  chat: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  estimateCost: vi.fn(() => 0.001),
});

describe('End-to-End Workflow Scaffolding', () => {
  let mockLLMService: ILLMService;

  beforeEach(() => {
    mockLLMService = createMockLLMService();
    vi.clearAllMocks();
  });

  describe('Scenario 1: Simple Workflow', () => {
    it('should create a simple text summarization workflow', async () => {
      const userRequest = '创建一个文本摘要工作流，输入长文本，输出200字摘要';

      // Mock understanding phase
      mockLLMService.chat = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          type: 'text-summarizer',
          name: '文本摘要工作流',
          description: '使用LLM对输入文本进行摘要处理',
          category: 'content',
          tags: ['摘要', 'NLP'],
          inputParams: [
            {
              name: 'sourceText',
              type: 'string',
              required: true,
              description: '待摘要的源文本',
            },
            {
              name: 'maxLength',
              type: 'number',
              required: false,
              description: '摘要最大长度',
              defaultValue: 200,
            },
          ],
          outputFields: ['summarizedText', 'originalLength', 'summaryLength'],
          nodes: [
            {
              name: 'summarize',
              displayName: '文本摘要',
              description: '使用LLM生成文本摘要',
              nodeType: 'llm',
              timeout: 120000,
              useLLM: true,
              llmSystemPrompt: '请对以下文本进行摘要，控制在{maxLength}字以内',
              enableQualityCheck: false,
              dependencies: [],
            },
            {
              name: 'calculateLength',
              displayName: '计算长度',
              description: '计算原文和摘要长度',
              nodeType: 'transform',
              timeout: 30000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: ['summarize'],
            },
          ],
          connections: [
            { from: 'START', to: 'summarize' },
            { from: 'summarize', to: 'calculateLength' },
            { from: 'calculateLength', to: 'END' },
          ],
          enableQualityCheck: false,
          maxRetries: 2,
          enableCheckpoint: true,
        }),
        usage: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 },
        cost: 0.015,
      });

      const engine = new AINeuralUnderstandingEngine(mockLLMService);
      const understandingResult = await engine.understandRequirement(userRequest);

      expect(understandingResult.success).toBe(true);
      expect(understandingResult.requirement).toBeDefined();
      expect(understandingResult.requirement?.type).toBe('text-summarizer');
      expect(understandingResult.requirement?.nodes).toHaveLength(2);

      // Mock code generation phase
      const codeGenerator = new AICodeGenerator(mockLLMService, {
        enablePostProcess: false,
        parallelNodes: false,
      });

      mockLLMService.chat = vi.fn().mockResolvedValue({
        content: `
\`\`\`typescript
export interface TextSummarizerState extends BaseWorkflowState {
  sourceText: string;
  maxLength?: number;
  summarizedText?: string;
  originalLength?: number;
  summaryLength?: number;
}
\`\`\`
        `,
        usage: { promptTokens: 800, completionTokens: 100, totalTokens: 900 },
        cost: 0.009,
      });

      const files = await codeGenerator.generateWorkflow(
        understandingResult.requirement!,
        { existingWorkflows: [], codePatterns: '', bestPractices: '', commonNodes: '' }
      );

      expect(files.state).toBeTruthy();
      expect(files.nodes.size).toBeGreaterThan(0);
      expect(files.graph).toBeTruthy();
      expect(files.factory).toBeTruthy();
      expect(files.index).toBeTruthy();

      // Verify generated code quality
      expect(files.state).toContain('interface TextSummarizerState');
      expect(files.state).toContain('sourceText: string');
    });
  });

  describe('Scenario 2: Complex Workflow with Conditional Branches', () => {
    it('should create a translation workflow with quality checks', async () => {
      const userRequest = '翻译工作流，支持中英日互译，带质检和重试';

      // Mock understanding
      mockLLMService.chat = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          type: 'multi-language-translator',
          name: '多语言翻译工作流',
          description: '支持中文、英文、日文互译，带质量检查',
          category: 'translation',
          tags: ['翻译', '多语言', '质检'],
          inputParams: [
            {
              name: 'sourceText',
              type: 'string',
              required: true,
              description: '源文本',
            },
            {
              name: 'sourceLanguage',
              type: 'string',
              required: true,
              description: '源语言',
              examples: ['zh', 'en', 'ja'],
            },
            {
              name: 'targetLanguage',
              type: 'string',
              required: true,
              description: '目标语言',
              examples: ['zh', 'en', 'ja'],
            },
          ],
          outputFields: ['translatedText', 'qualityScore', 'detectedLanguage'],
          nodes: [
            {
              name: 'detectLanguage',
              displayName: '语言检测',
              description: '检测源文本语言',
              nodeType: 'llm',
              timeout: 60000,
              useLLM: true,
              llmSystemPrompt: '检测文本语言',
              enableQualityCheck: false,
              dependencies: [],
            },
            {
              name: 'translate',
              displayName: '翻译',
              description: '执行翻译',
              nodeType: 'llm',
              timeout: 120000,
              useLLM: true,
              llmSystemPrompt: '翻译文本',
              enableQualityCheck: true,
              qualityCheckPrompt: '检查翻译质量',
              dependencies: ['detectLanguage'],
            },
            {
              name: 'checkQuality',
              displayName: '质量检查',
              description: '检查翻译质量',
              nodeType: 'quality_check',
              timeout: 60000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: ['translate'],
            },
          ],
          connections: [
            { from: 'START', to: 'detectLanguage' },
            { from: 'detectLanguage', to: 'translate' },
            { from: 'translate', to: 'checkQuality' },
            { from: 'checkQuality', to: 'translate', condition: 'qualityScore < 0.8 && retryCount < 3' },
            { from: 'checkQuality', to: 'END', condition: 'qualityScore >= 0.8 || retryCount >= 3' },
          ],
          enableQualityCheck: true,
          maxRetries: 3,
          enableCheckpoint: true,
        }),
        usage: { promptTokens: 1200, completionTokens: 700, totalTokens: 1900 },
        cost: 0.019,
      });

      const engine = new AINeuralUnderstandingEngine(mockLLMService);
      const understandingResult = await engine.understandRequirement(userRequest);

      expect(understandingResult.success).toBe(true);
      expect(understandingResult.requirement?.nodes).toHaveLength(3);

      // Verify conditional routing
      const conditionalConnections = understandingResult.requirement!.connections.filter(
        c => c.condition !== undefined
      );
      expect(conditionalConnections).toHaveLength(2);

      // Test visualization
      const vizSystem = new VisualizationPreviewSystem({ useColors: false });
      const simplified = vizSystem.generateSimplifiedPreview(understandingResult.requirement!);

      expect(simplified).toContain('多语言翻译工作流');
      expect(simplified).toContain('detectLanguage');
      expect(simplified).toContain('translate');
      expect(simplified).toContain('checkQuality');
    });
  });

  describe('Scenario 3: Batch Processing Workflow', () => {
    it('should create a batch image generation workflow', async () => {
      const userRequest = '批量图片生成工作流，输入文本描述，生成4张不同风格的图片';

      mockLLMService.chat = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          type: 'batch-image-generator',
          name: '批量图片生成',
          description: '根据文本描述生成多张不同风格的图片',
          category: 'content',
          tags: ['图片生成', '批量处理'],
          inputParams: [
            {
              name: 'prompt',
              type: 'string',
              required: true,
              description: '图片描述文本',
            },
            {
              name: 'styles',
              type: 'array',
              required: false,
              description: '图片风格列表',
              defaultValue: ['realistic', 'anime', 'oil-painting', 'sketch'],
            },
            {
              name: 'count',
              type: 'number',
              required: false,
              description: '生成数量',
              defaultValue: 4,
            },
          ],
          outputFields: ['generatedImages', 'prompts', 'metadata'],
          nodes: [
            {
              name: 'preparePrompts',
              displayName: '准备提示词',
              description: '为不同风格准备提示词',
              nodeType: 'transform',
              timeout: 30000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: [],
            },
            {
              name: 'generateImages',
              displayName: '生成图片',
              description: '批量生成图片',
              nodeType: 'batch',
              timeout: 300000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: ['preparePrompts'],
            },
            {
              name: 'validateImages',
              displayName: '验证图片',
              description: '验证生成的图片',
              nodeType: 'transform',
              timeout: 60000,
              useLLM: false,
              enableQualityCheck: false,
              dependencies: ['generateImages'],
            },
          ],
          connections: [
            { from: 'START', to: 'preparePrompts' },
            { from: 'preparePrompts', to: 'generateImages' },
            { from: 'generateImages', to: 'validateImages' },
            { from: 'validateImages', to: 'END' },
          ],
          enableQualityCheck: false,
          maxRetries: 2,
          enableCheckpoint: true,
        }),
        usage: { promptTokens: 1100, completionTokens: 600, totalTokens: 1700 },
        cost: 0.017,
      });

      const engine = new AINeuralUnderstandingEngine(mockLLMService);
      const result = await engine.understandRequirement(userRequest);

      expect(result.success).toBe(true);
      expect(result.requirement?.inputParams[1].type).toBe('array');
      expect(result.requirement?.nodes.find(n => n.name === 'generateImages')?.nodeType).toBe('batch');
    });
  });

  describe('Scenario 4: Error Handling', () => {
    it('should handle empty description gracefully', async () => {
      const engine = new AINeuralUnderstandingEngine(mockLLMService);

      const result = await engine.understandRequirement('');

      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should handle vague description with clarification', async () => {
      const vagueRequest = '随便说点什么';

      // Mock LLM asking for clarification
      mockLLMService.chat = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          type: 'generic-workflow',
          name: '通用工作流',
          description: '用户未明确指定，创建通用模板',
          category: 'other',
          tags: ['通用'],
          inputParams: [],
          outputFields: [],
          nodes: [
            {
              name: 'process',
              displayName: '处理',
              description: '通用处理节点',
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
        }),
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        cost: 0.008,
      });

      const engine = new AINeuralUnderstandingEngine(mockLLMService);
      const result = await engine.understandRequirement(vagueRequest);

      // Should still create something, but with warnings
      expect(result.success).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should handle LLM service errors', async () => {
      mockLLMService.chat = vi.fn().mockRejectedValue(new Error('LLM service unavailable'));

      const engine = new AINeuralUnderstandingEngine(mockLLMService);
      const result = await engine.understandRequirement('创建一个工作流');

      expect(result.success).toBe(false);
      expect(result.error).toBe('LLM service unavailable');
    });
  });

  describe('Performance Tests', () => {
    it('should complete simple workflow generation within 60 seconds', async () => {
      const startTime = Date.now();

      mockLLMService.chat = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          type: 'simple',
          name: 'Simple',
          description: 'Simple workflow',
          category: 'other',
          tags: [],
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
        }),
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
        cost: 0.008,
      });

      const engine = new AINeuralUnderstandingEngine(mockLLMService);
      const result = await engine.understandRequirement('简单工作流');

      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(60000); // Less than 60 seconds
    });
  });

  describe('Quality Validation', () => {
    it('should validate generated code quality', async () => {
      const mockRequirement = {
        type: 'test-workflow' as const,
        name: 'Test Workflow',
        description: 'Test',
        category: 'other' as const,
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const validator = new AutoValidatorOptimizer(mockLLMService);

      const files = {
        state: 'export interface TestState {}',
        nodes: new Map([['test', 'class TestNode {}']]),
        routeFunctions: '',
        graph: '',
        factory: '',
        index: '',
      };

      const validationResult = await validator.validateCode(files, 'patterns', 'practices');

      expect(validationResult).toBeDefined();
      expect(validationResult.overallScore).toBeGreaterThanOrEqual(0);
      expect(validationResult.overallScore).toBeLessThanOrEqual(100);
    });
  });
});
