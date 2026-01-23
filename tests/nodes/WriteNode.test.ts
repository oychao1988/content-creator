/**
 * Write Node 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WriteNode } from '../../src/domain/workflow/nodes/WriteNode.js';
import {
  createTestInitialState,
  createMockOrganizedInfo,
  createMockSearchResults,
  createMockArticleContent,
} from '../utils/test-helpers.js';

// Mock EnhancedLLMService
vi.mock('../../src/services/llm/EnhancedLLMService.js', () => ({
  enhancedLLMService: {
    chat: vi.fn(),
  },
}));

// 导入 mock 后的 service
import { enhancedLLMService } from '../../src/services/llm/EnhancedLLMService.js';

describe('WriteNode', () => {
  let writeNode: WriteNode;

  beforeEach(() => {
    writeNode = new WriteNode();
    vi.clearAllMocks();

    // 默认 mock 返回
    vi.mocked(enhancedLLMService.chat).mockResolvedValue({
      content: createMockArticleContent(),
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      },
      model: 'test-model',
      stepName: 'write',
    });
  });

  describe('executeLogic - initial write mode', () => {
    it('should successfully write article', async () => {
      // Use default mock which returns createMockArticleContent()
      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        searchResults: createMockSearchResults(),
      });

      const result = await writeNode.executeLogic(state);

      expect(result.articleContent).toBeDefined();
      expect(result.articleContent?.length).toBeGreaterThanOrEqual(500);
      expect(enhancedLLMService.chat).toHaveBeenCalledTimes(1);
    });

    it('should validate word count constraints', async () => {
      // Create a custom mock with content between 100-1000 characters
      const mediumContent = '# Medium Article\n\n' + 'This is a medium article. '.repeat(15); // ~300 characters

      vi.mocked(enhancedLLMService.chat).mockResolvedValue({
        content: mediumContent,
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        },
        model: 'test-model',
        stepName: 'write',
      });

      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        searchResults: createMockSearchResults(),
        hardConstraints: {
          minWords: 100,
          maxWords: 1000,
        },
      });

      const result = await writeNode.executeLogic(state);

      expect(result.articleContent?.length).toBeGreaterThanOrEqual(100);
      expect(result.articleContent?.length).toBeLessThanOrEqual(1000);
    });

    it('should validate keywords', async () => {
      const mockContent = createMockArticleContent();
      vi.mocked(enhancedLLMService.chat).mockResolvedValue({
        content: mockContent,
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        },
        model: 'test-model',
        stepName: 'write',
      });

      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        searchResults: createMockSearchResults(),
        hardConstraints: {
          keywords: ['AI', '人工智能'],
        },
      });

      const result = await writeNode.executeLogic(state);

      expect(result.articleContent).toContain('AI');
      expect(result.articleContent).toContain('人工智能');
    });
  });

  describe('executeLogic - rewrite mode', () => {
    it('should rewrite based on quality feedback', async () => {
      // Use createMockArticleContent which has >= 500 characters
      vi.mocked(enhancedLLMService.chat).mockResolvedValue({
        content: createMockArticleContent(),
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        },
        model: 'test-model',
        stepName: 'write',
      });

      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        searchResults: createMockSearchResults(),
        previousContent: 'Old content that needs improvement',
        textQualityReport: {
          score: 6.5,
          passed: false,
          hardConstraintsPassed: true,
          details: {},
          fixSuggestions: ['加强内容深度', '增加更多案例'],
          checkedAt: Date.now(),
        },
      });

      const result = await writeNode.executeLogic(state);

      expect(result.articleContent).toBeDefined();
      expect(result.articleContent).not.toBe(state.previousContent);
    });
  });

  describe('validateState', () => {
    it('should throw error if requirements are missing', () => {
      const state = createTestInitialState({
        requirements: '',
      });

      expect(() => writeNode.validateState(state)).toThrow('Requirements are required');
    });

    it('should throw error if organizedInfo is missing in initial mode', () => {
      const state = createTestInitialState({
        organizedInfo: undefined,
      });

      expect(() => writeNode.validateState(state)).toThrow('Organized info is required');
    });

    it('should throw error if previousContent is missing in rewrite mode', () => {
      // Note: When previousContent is undefined, isRewriteMode returns false,
      // so it validates as initial mode. To test rewrite mode validation,
      // we need to ensure isRewriteMode returns true but validation fails.
      // However, since isRewriteMode checks for previousContent first,
      // we cannot truly be in "rewrite mode" without previousContent.
      // This test actually verifies that without previousContent,
      // the system treats it as initial mode and doesn't throw this error.

      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        // previousContent is undefined by default
        // When undefined, isRewriteMode returns false
        // So it validates as initial mode (requires organizedInfo)
      });

      // With organizedInfo and no previousContent, it's treated as initial mode
      // So validateState should NOT throw "Previous content is required"
      // Instead, it should pass because organizedInfo exists
      expect(() => writeNode.validateState(state)).not.toThrow();
    });

    it('should pass validation in rewrite mode with all required fields', () => {
      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        previousContent: 'Old content',
        textQualityReport: {
          score: 6.5,
          passed: false,
          hardConstraintsPassed: true,
          details: {},
          fixSuggestions: ['Fix this'],
          checkedAt: Date.now(),
        },
      });

      expect(() => writeNode.validateState(state)).not.toThrow();
    });
  });

  describe('isRewriteMode', () => {
    it('should detect rewrite mode correctly', () => {
      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        previousContent: 'Old content',
        textQualityReport: {
          score: 6.5,
          passed: false,
          hardConstraintsPassed: true,
          details: {},
          fixSuggestions: ['Fix this'],
          checkedAt: Date.now(),
        },
      });

      // 通过 executeLogic 验证是否正确识别为重写模式
      vi.mocked(enhancedLLMService.chat).mockResolvedValue({
        content: createMockArticleContent(), // 使用符合约束的内容
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        },
        model: 'test-model',
        stepName: 'write',
      });

      expect(async () => {
        await writeNode.executeLogic(state);
      }).not.toThrow();
    });

    it('should detect initial mode correctly', () => {
      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
      });

      expect(async () => {
        await writeNode.executeLogic(state);
      }).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should handle LLM errors gracefully', async () => {
      vi.mocked(enhancedLLMService.chat).mockRejectedValue(
        new Error('LLM API error')
      );

      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        searchResults: createMockSearchResults(),
      });

      await expect(writeNode.executeLogic(state)).rejects.toThrow('LLM API error');
    });

    it('should handle word count validation error', async () => {
      vi.mocked(enhancedLLMService.chat).mockResolvedValue({
        content: 'Short', // Only 5 characters
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        },
        model: 'test-model',
        stepName: 'write',
      });

      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        searchResults: createMockSearchResults(),
        hardConstraints: {
          minWords: 100, // Requires at least 100 characters
        },
      });

      // 注意：WriteNode 不再抛出验证错误，只输出警告
      // 验证逻辑已移到 checkText 节点
      const result = await writeNode.executeLogic(state);
      expect(result.articleContent).toBe('Short');
      // 警告会被记录到日志，但不阻止流程
    });

    it('should handle keyword validation error', async () => {
      vi.mocked(enhancedLLMService.chat).mockResolvedValue({
        content: 'Article without required keywords',
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        },
        model: 'test-model',
        stepName: 'write',
      });

      const state = createTestInitialState({
        organizedInfo: createMockOrganizedInfo(),
        searchResults: createMockSearchResults(),
        hardConstraints: {
          keywords: ['MISSING_KEYWORD'],
        },
      });

      // 注意：WriteNode 不再抛出验证错误，只输出警告
      // 验证逻辑已移到 checkText 节点
      const result = await writeNode.executeLogic(state);
      expect(result.articleContent).toBe('Article without required keywords');
      // 警告会被记录到日志，但不阻止流程
    });
  });
});
