/**
 * AINeuralUnderstandingEngine Tests
 *
 * 测试 AI 需求理解引擎的功能
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AINeuralUnderstandingEngine } from '../ai/AINeuralUnderstandingEngine.js';
import type { WorkflowRequirement } from '../schemas/WorkflowRequirementSchema.js';
import type { ILLMService } from '../../../../services/llm/ILLMService.js';

// Mock LLM Service
const mockLLMService: ILLMService = {
  chat: vi.fn(),
  healthCheck: vi.fn().mockResolvedValue(true),
  estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
  estimateCost: vi.fn((tokensIn: number, tokensOut: number) => (tokensIn + tokensOut) * 0.00001),
};

describe('AINeuralUnderstandingEngine', () => {
  let engine: AINeuralUnderstandingEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new AINeuralUnderstandingEngine(mockLLMService);
  });

  describe('Schema Validation', () => {
    it('should validate a correct workflow requirement', async () => {
      const validRequirement: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow for validation',
        category: 'content',
        tags: ['test', 'validation'],
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
            name: 'processNode',
            displayName: 'Process Node',
            description: 'Processes input',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'processNode' },
          { from: 'processNode', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const result = await engine.validateRequirement(validRequirement);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for invalid workflow type', async () => {
      const invalidRequirement = {
        type: 'Invalid_Type', // Not kebab-case
        name: 'Test',
        description: 'Test description',
        category: 'content' as const,
        tags: [],
        inputParams: [],
        outputFields: [],
        nodes: [],
        connections: [],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const result = await engine.validateRequirement(invalidRequirement as any);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should fail validation for missing system prompt in LLM nodes', async () => {
      const invalidRequirement: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        category: 'content',
        tags: [],
        inputParams: [
          {
            name: 'input',
            type: 'string',
            required: true,
            description: 'Input',
          },
        ],
        outputFields: ['result'],
        nodes: [
          {
            name: 'llmNode',
            displayName: 'LLM Node',
            description: 'LLM node without prompt',
            nodeType: 'llm',
            timeout: 60000,
            useLLM: true,
            enableQualityCheck: false,
            dependencies: [],
            // Missing llmSystemPrompt
          },
        ],
        connections: [
          { from: 'START', to: 'llmNode' },
          { from: 'llmNode', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const result = await engine.validateRequirement(invalidRequirement);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('llmSystemPrompt'))).toBe(true);
    });

    it('should fail validation for missing quality check prompt', async () => {
      const invalidRequirement: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow',
        category: 'content',
        tags: [],
        inputParams: [
          {
            name: 'input',
            type: 'string',
            required: true,
            description: 'Input',
          },
        ],
        outputFields: ['result'],
        nodes: [
          {
            name: 'processNode',
            displayName: 'Process Node',
            description: 'Process node',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: true,
            dependencies: [],
            // Missing qualityCheckPrompt
          },
        ],
        connections: [
          { from: 'START', to: 'processNode' },
          { from: 'processNode', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const result = await engine.validateRequirement(invalidRequirement);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.includes('qualityCheckPrompt'))).toBe(true);
    });

    it('should warn about unconnected nodes', async () => {
      const requirementWithUnconnected: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'A test workflow with unconnected nodes',
        category: 'content',
        tags: [],
        inputParams: [
          {
            name: 'input',
            type: 'string',
            required: true,
            description: 'Input',
          },
        ],
        outputFields: ['result'],
        nodes: [
          {
            name: 'connectedNode',
            displayName: 'Connected Node',
            description: 'Connected node',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'unconnectedNode',
            displayName: 'Unconnected Node',
            description: 'This node is not connected',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'connectedNode' },
          { from: 'connectedNode', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      const result = await engine.validateRequirement(requirementWithUnconnected);

      // Should still pass validation but with warnings
      expect(result.warnings.some(w => w.includes('unconnected'))).toBe(true);
    });
  });

  describe('Understand Requirement', () => {
    it('should successfully parse simple translation workflow', async () => {
      const mockResponse = {
        content: `{
          "type": "simple-translator",
          "name": "Simple Translator",
          "description": "A simple translation workflow",
          "category": "translation",
          "tags": ["translation", "simple"],
          "inputParams": [
            {
              "name": "sourceText",
              "type": "string",
              "required": true,
              "description": "Text to translate"
            },
            {
              "name": "targetLanguage",
              "type": "string",
              "required": true,
              "description": "Target language code",
              "examples": ["en", "zh", "ja"]
            }
          ],
          "outputFields": ["translatedText"],
          "nodes": [
            {
              "name": "translate",
              "displayName": "Translate",
              "description": "Translates text",
              "nodeType": "llm",
              "timeout": 120000,
              "useLLM": true,
              "llmSystemPrompt": "You are a translator.",
              "enableQualityCheck": false,
              "dependencies": []
            }
          ],
          "connections": [
            { "from": "START", "to": "translate" },
            { "from": "translate", "to": "END" }
          ],
          "enableQualityCheck": false,
          "maxRetries": 2,
          "enableCheckpoint": true
        }`,
        usage: {
          promptTokens: 1000,
          completionTokens: 500,
          totalTokens: 1500,
        },
        cost: 0.015,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue(mockResponse);

      const result = await engine.understandRequirement(
        'Create a simple translation workflow that translates text to a target language',
        { autoBuild: false }
      );

      expect(result.success).toBe(true);
      expect(result.requirement).toBeDefined();
      expect(result.requirement?.type).toBe('simple-translator');
      expect(result.validation.success).toBe(true);
      expect(mockLLMService.chat).toHaveBeenCalled();
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        content: 'This is not a valid JSON response',
        usage: {
          promptTokens: 500,
          completionTokens: 100,
          totalTokens: 600,
        },
        cost: 0.006,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue(mockResponse);

      const result = await engine.understandRequirement(
        'Create a workflow',
        { autoBuild: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON');
    });

    it('should handle LLM service errors', async () => {
      vi.mocked(mockLLMService.chat).mockRejectedValue(
        new Error('LLM service unavailable')
      );

      const result = await engine.understandRequirement(
        'Create a workflow',
        { autoBuild: false }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('LLM service unavailable');
    });
  });

  describe('Optimize Requirement', () => {
    it('should optimize node timeouts', async () => {
      const requirementWithBadTimeouts: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'Test workflow with bad timeouts',
        category: 'content',
        tags: [],
        inputParams: [
          {
            name: 'input',
            type: 'string',
            required: true,
            description: 'Input',
          },
        ],
        outputFields: ['result'],
        nodes: [
          {
            name: 'llmNode',
            displayName: 'LLM Node',
            description: 'LLM node',
            nodeType: 'llm',
            timeout: 1000, // Too short
            useLLM: true,
            llmSystemPrompt: 'Test prompt',
            enableQualityCheck: false,
            dependencies: [],
          },
          {
            name: 'apiNode',
            displayName: 'API Node',
            description: 'API node',
            nodeType: 'api',
            timeout: 1000000, // Too long
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'llmNode' },
          { from: 'llmNode', to: 'apiNode' },
          { from: 'apiNode', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      // Mock basic optimization (without AI)
      const result = await engine.optimizeRequirement(requirementWithBadTimeouts);

      expect(result.requirement).toBeDefined();
      expect(result.requirement.nodes[0].timeout).toBeGreaterThanOrEqual(90000);
      expect(result.requirement.nodes[0].timeout).toBeLessThanOrEqual(180000);
      expect(result.requirement.nodes[1].timeout).toBeGreaterThanOrEqual(30000);
      expect(result.requirement.nodes[1].timeout).toBeLessThanOrEqual(60000);
    });

    it('should handle optimization failures gracefully', async () => {
      const validRequirement: WorkflowRequirement = {
        type: 'test-workflow',
        name: 'Test Workflow',
        description: 'Test workflow',
        category: 'content',
        tags: [],
        inputParams: [
          {
            name: 'input',
            type: 'string',
            required: true,
            description: 'Input',
          },
        ],
        outputFields: ['result'],
        nodes: [
          {
            name: 'processNode',
            displayName: 'Process Node',
            description: 'Process',
            nodeType: 'transform',
            timeout: 30000,
            useLLM: false,
            enableQualityCheck: false,
            dependencies: [],
          },
        ],
        connections: [
          { from: 'START', to: 'processNode' },
          { from: 'processNode', to: 'END' },
        ],
        enableQualityCheck: false,
        maxRetries: 2,
        enableCheckpoint: true,
      };

      vi.mocked(mockLLMService.chat).mockRejectedValue(
        new Error('AI optimization failed')
      );

      const result = await engine.optimizeRequirement(validRequirement);

      expect(result.requirement).toBeDefined();
      expect(result.optimizations).toContain('AI optimization failed, applied basic optimizations');
    });
  });

  describe('Context Building', () => {
    it('should use custom context when provided', async () => {
      const customContext = {
        codePatterns: 'Custom code patterns',
        bestPractices: 'Custom best practices',
        commonNodes: 'Custom common nodes',
      };

      const mockResponse = {
        content: `{
          "type": "test-workflow",
          "name": "Test",
          "description": "Test",
          "category": "content",
          "tags": [],
          "inputParams": [],
          "outputFields": [],
          "nodes": [],
          "connections": [],
          "enableQualityCheck": false,
          "maxRetries": 2,
          "enableCheckpoint": true
        }`,
        usage: {
          promptTokens: 500,
          completionTokens: 200,
          totalTokens: 700,
        },
        cost: 0.007,
      };

      vi.mocked(mockLLMService.chat).mockResolvedValue(mockResponse);

      await engine.understandRequirement('Create a workflow', customContext);

      const callArgs = vi.mocked(mockLLMService.chat).mock.calls[0];
      const prompt = callArgs[0].messages[1].content;

      expect(prompt).toContain('Custom code patterns');
      expect(prompt).toContain('Custom best practices');
    });
  });
});
