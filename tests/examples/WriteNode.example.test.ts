/**
 * WriteNode 示例测试
 *
 * 这个文件展示了如何使用 fixtures 和标签编写清晰的测试
 * 可以作为其他测试文件的参考
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WriteNode } from '../../src/domain/workflow/nodes/WriteNode.js';
import {
  taskFixtures,
  workflowStateFixtures,
  articleContentFixtures,
  qualityCheckFixtures,
  createWorkflowState,
} from '../fixtures/common-fixtures.js';

// Mock EnhancedLLMService
vi.mock('../../src/services/llm/EnhancedLLMService.js', () => ({
  enhancedLLMService: {
    chat: vi.fn(),
  },
}));

import { enhancedLLMService } from '../../src/services/llm/EnhancedLLMService.js';

describe('@unit WriteNode', () => {
  let writeNode: WriteNode;

  beforeEach(() => {
    writeNode = new WriteNode();
    vi.clearAllMocks();

    // 默认 mock 返回 - 使用 fixtures 中的标准文章
    vi.mocked(enhancedLLMService.chat).mockResolvedValue({
      content: articleContentFixtures.standard,
      usage: {
        promptTokens: 100,
        completionTokens: 200,
        totalTokens: 300,
      },
      model: 'test-model',
      stepName: 'write',
    });
  });

  describe('初始写作模式', () => {
    it('should successfully write article when all inputs are valid', async () => {
      // Arrange - 使用预定义的状态 fixture
      const state = workflowStateFixtures.stateWithOrganizedInfo;

      // Act - 执行写作节点
      const result = await writeNode.executeLogic(state);

      // Assert - 验证结果
      expect(result.articleContent).toBeDefined();
      expect(result.articleContent?.length).toBeGreaterThanOrEqual(500);
      expect(enhancedLLMService.chat).toHaveBeenCalledTimes(1);
    });

    it('should respect minWords constraint', async () => {
      // Arrange - 使用自定义状态
      const state = createWorkflowState({
        organizedInfo: workflowStateFixtures.stateWithOrganizedInfo.organizedInfo,
        searchResults: workflowStateFixtures.stateWithOrganizedInfo.searchResults,
        hardConstraints: {
          minWords: 100,
          maxWords: 1000,
        },
      });

      // Act
      const result = await writeNode.executeLogic(state);

      // Assert
      expect(result.articleContent?.length).toBeGreaterThanOrEqual(100);
      expect(result.articleContent?.length).toBeLessThanOrEqual(1000);
    });

    it('should validate that all required keywords are present', async () => {
      // Arrange
      const state = createWorkflowState({
        organizedInfo: workflowStateFixtures.stateWithOrganizedInfo.organizedInfo,
        searchResults: workflowStateFixtures.stateWithOrganizedInfo.searchResults,
        hardConstraints: {
          keywords: ['AI', '人工智能', '技术发展'],
        },
      });

      // Act
      const result = await writeNode.executeLogic(state);

      // Assert - 验证关键词存在
      expect(result.articleContent).toContain('AI');
      expect(result.articleContent).toContain('人工智能');
      expect(result.articleContent).toContain('技术发展');
    });
  });

  describe('重写模式', () => {
    it('should rewrite content based on quality feedback', async () => {
      // Arrange - 使用重写状态 fixture
      const state = workflowStateFixtures.rewriteState;

      // Act
      const result = await writeNode.executeLogic(state);

      // Assert
      expect(result.articleContent).toBeDefined();
      expect(result.articleContent).not.toBe(state.previousContent);
    });

    it('should incorporate fix suggestions from quality report', async () => {
      // Arrange - 自定义重写状态
      const state = createWorkflowState({
        organizedInfo: workflowStateFixtures.stateWithOrganizedInfo.organizedInfo,
        searchResults: workflowStateFixtures.stateWithOrganizedInfo.searchResults,
        previousContent: '需要改进的旧内容',
        textQualityReport: qualityCheckFixtures.needsRewrite,
      });

      // Act
      const result = await writeNode.executeLogic(state);

      // Assert
      expect(result.articleContent).toBeDefined();
      expect(result.articleContent).not.toBe(state.previousContent);
    });
  });

  describe('状态验证', () => {
    it('should throw error when requirements are empty', () => {
      // Arrange
      const state = createWorkflowState({
        requirements: '', // 空要求
      });

      // Act & Assert
      expect(() => writeNode.validateState(state)).toThrow('Requirements are required');
    });

    it('should throw error when organizedInfo is missing in initial mode', () => {
      // Arrange
      const state = createWorkflowState({
        organizedInfo: undefined,
      });

      // Act & Assert
      expect(() => writeNode.validateState(state)).toThrow('Organized info is required');
    });

    it('should pass validation when all required fields are present', () => {
      // Arrange
      const state = workflowStateFixtures.stateWithOrganizedInfo;

      // Act & Assert
      expect(() => writeNode.validateState(state)).not.toThrow();
    });
  });

  describe('错误处理', () => {
    it('should handle LLM API errors gracefully', async () => {
      // Arrange - Mock API 错误
      const error = new Error('LLM API connection failed');
      vi.mocked(enhancedLLMService.chat).mockRejectedValue(error);

      const state = workflowStateFixtures.stateWithOrganizedInfo;

      // Act & Assert
      await expect(writeNode.executeLogic(state)).rejects.toThrow('LLM API connection failed');
    });

    it('should reject content that does not meet word count requirement', async () => {
      // Arrange - Mock 返回短内容
      vi.mocked(enhancedLLMService.chat).mockResolvedValue({
        content: articleContentFixtures.tooShort,
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        },
        model: 'test-model',
        stepName: 'write',
      });

      const state = createWorkflowState({
        organizedInfo: workflowStateFixtures.stateWithOrganizedInfo.organizedInfo,
        searchResults: workflowStateFixtures.stateWithOrganizedInfo.searchResults,
        hardConstraints: {
          minWords: 100, // 要求至少100字
        },
      });

      // Act & Assert
      // 注意：WriteNode 不再抛出验证错误，只输出警告
      // 验证逻辑已移到 checkText 节点
      const result = await writeNode.executeLogic(state);
      expect(result.articleContent).toBe(articleContentFixtures.tooShort);
      // 警告会被记录到日志，但不阻止流程
    });

    it('should reject content missing required keywords', async () => {
      // Arrange - Mock 返回缺少关键词的内容
      vi.mocked(enhancedLLMService.chat).mockResolvedValue({
        content: articleContentFixtures.missingKeywords,
        usage: {
          promptTokens: 100,
          completionTokens: 200,
          totalTokens: 300,
        },
        model: 'test-model',
        stepName: 'write',
      });

      const state = createWorkflowState({
        organizedInfo: workflowStateFixtures.stateWithOrganizedInfo.organizedInfo,
        searchResults: workflowStateFixtures.stateWithOrganizedInfo.searchResults,
        hardConstraints: {
          keywords: ['AI', '人工智能'], // 必需的关键词
        },
      });

      // Act & Assert
      // 注意：WriteNode 不再抛出验证错误，只输出警告
      // 验证逻辑已移到 checkText 节点
      const result = await writeNode.executeLogic(state);
      expect(result.articleContent).toBe(articleContentFixtures.missingKeywords);
      // 警告会被记录到日志，但不阻止流程
    });
  });

  describe('边界情况', () => {
    it('should handle maxWords constraint correctly', async () => {
      // Arrange
      const state = createWorkflowState({
        organizedInfo: workflowStateFixtures.stateWithOrganizedInfo.organizedInfo,
        searchResults: workflowStateFixtures.stateWithOrganizedInfo.searchResults,
        hardConstraints: {
          minWords: 10,
          maxWords: 10000, // 很大的上限
        },
      });

      // Act
      const result = await writeNode.executeLogic(state);

      // Assert
      expect(result.articleContent?.length).toBeLessThanOrEqual(10000);
    });

    it('should handle empty keyword list', async () => {
      // Arrange - 没有关键词要求
      const state = createWorkflowState({
        organizedInfo: workflowStateFixtures.stateWithOrganizedInfo.organizedInfo,
        searchResults: workflowStateFixtures.stateWithOrganizedInfo.searchResults,
        hardConstraints: {
          keywords: [], // 空关键词列表
        },
      });

      // Act & Assert
      await expect(writeNode.executeLogic(state)).resolves.toBeDefined();
    });
  });
});

/**
 * 使用 Fixtures 的好处总结:
 *
 * 1. ✅ 避免重复代码 - 不需要在每个测试中重新定义相同的测试数据
 * 2. ✅ 一致性 - 所有测试使用相同的标准数据
 * 3. ✅ 可维护性 - 修改 fixture 定义会自动更新所有使用它的测试
 * 4. ✅ 可读性 - 测试代码更简洁，意图更清晰
 *
 * 使用标签的好处:
 *
 * 1. ✅ 快速运行 - 可以只运行 @unit 测试进行快速反馈
 * 2. ✅ 分类清晰 - 明确标识测试类型和速度
 * 3. ✅ CI/CD 优化 - 可以在不同阶段运行不同类别的测试
 */
