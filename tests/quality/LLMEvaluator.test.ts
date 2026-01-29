/**
 * LLMEvaluator 测试
 *
 * 测试 LLM 评估器的各项功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LLMEvaluator } from '../../src/services/quality/LLMEvaluator.js';

// Mock EnhancedLLMService
vi.mock('../../src/services/llm/EnhancedLLMService.js', () => ({
  enhancedLLMService: {
    chat: vi.fn(),
  },
}));

describe('LLMEvaluator', () => {
  let evaluator: LLMEvaluator;
  let mockLLMService: any;

  beforeEach(async () => {
    evaluator = new LLMEvaluator();
    // 动态导入 mock 的模块
    mockLLMService = (await import('../../src/services/llm/EnhancedLLMService.js')).enhancedLLMService;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基础评估功能', () => {
    it('应该成功评估内容并返回结果', async () => {
      const mockResponse = JSON.stringify({
        score: 8.5,
        dimensions: {
          relevance: 9,
          coherence: 8,
          completeness: 8,
          readability: 9,
        },
        strengths: ['内容紧扣主题', '结构清晰'],
        weaknesses: ['部分论证不够深入'],
        suggestions: ['增加具体案例'],
        reasoning: '整体质量良好',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: {
          promptTokens: 500,
          completionTokens: 300,
          totalTokens: 800,
        },
      });

      const result = await evaluator.evaluate(
        '这是要评估的内容',
        '评估要求'
      );

      expect(result.passed).toBe(true);
      expect(result.score).toBe(8.5);
      expect(result.dimensions.relevance).toBe(9);
      expect(result.dimensions.coherence).toBe(8);
      expect(result.dimensions.completeness).toBe(8);
      expect(result.dimensions.readability).toBe(9);
      expect(result.details.strengths).toHaveLength(2);
      expect(result.details.weaknesses).toHaveLength(1);
      expect(result.details.suggestions).toHaveLength(1);
    });

    it('应该正确解析代码块中的 JSON', async () => {
      const mockResponse = `\`\`\`json
{
  "score": 7.5,
  "dimensions": {
    "relevance": 8,
    "coherence": 7,
    "completeness": 7,
    "readability": 8
  },
  "strengths": ["内容完整"],
  "weaknesses": [],
  "suggestions": [],
  "reasoning": "质量良好"
}
\`\`\``;

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      expect(result.score).toBe(7.5);
      expect(result.dimensions.relevance).toBe(8);
    });

    it('应该在分数低于阈值时返回不通过', async () => {
      const mockResponse = JSON.stringify({
        score: 6.5,
        dimensions: {
          relevance: 6,
          coherence: 7,
          completeness: 6,
          readability: 7,
        },
        strengths: [],
        weaknesses: ['内容不够完整'],
        suggestions: ['补充更多内容'],
        reasoning: '质量一般',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求', {
        passThreshold: 7.0,
      });

      expect(result.passed).toBe(false);
      expect(result.score).toBe(6.5);
    });

    it('应该处理 LLM 服务错误', async () => {
      mockLLMService.chat.mockRejectedValue(
        new Error('LLM service error')
      );

      const result = await evaluator.evaluate('内容', '要求');

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.dimensions.relevance).toBe(0);
      expect(result.details.weaknesses).toContain('评估服务暂时不可用');
    });

    it('应该处理无效的 JSON 响应', async () => {
      mockLLMService.chat.mockResolvedValue({
        text: '这不是有效的 JSON',
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      // 应该使用默认值
      expect(result.passed).toBe(true);
      expect(result.score).toBe(7.0);
    });
  });

  describe('批量评估', () => {
    it('应该批量评估多个内容', async () => {
      const mockResponse = JSON.stringify({
        score: 8.0,
        dimensions: {
          relevance: 8,
          coherence: 8,
          completeness: 8,
          readability: 8,
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '良好',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const items = [
        { content: '内容1', requirements: '要求1' },
        { content: '内容2', requirements: '要求2' },
        { content: '内容3', requirements: '要求3' },
      ];

      const results = await evaluator.batchEvaluate(items);

      expect(results).toHaveLength(3);
      expect(results[0].score).toBe(8.0);
      expect(results[1].score).toBe(8.0);
      expect(results[2].score).toBe(8.0);
      expect(mockLLMService.chat).toHaveBeenCalledTimes(3);
    });
  });

  describe('分数计算', () => {
    it('应该正确计算加权分数', async () => {
      const mockResponse = JSON.stringify({
        score: 8.0,
        dimensions: {
          relevance: 9,      // 30%
          coherence: 8,      // 30%
          completeness: 7,   // 20%
          readability: 8,    // 20%
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      // 验证加权计算：9*0.3 + 8*0.3 + 7*0.2 + 8*0.2 = 2.7 + 2.4 + 1.4 + 1.6 = 8.1
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(10);
    });

    it('应该限制分数在 0-10 范围内', async () => {
      const mockResponse = JSON.stringify({
        score: 15,  // 超出范围
        dimensions: {
          relevance: 15,
          coherence: 15,
          completeness: 15,
          readability: 15,
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      expect(result.score).toBeLessThanOrEqual(10);
      expect(result.dimensions.relevance).toBeLessThanOrEqual(10);
    });

    it('应该处理负分数', async () => {
      const mockResponse = JSON.stringify({
        score: -5,  // 负数
        dimensions: {
          relevance: -5,
          coherence: -5,
          completeness: -5,
          readability: -5,
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.dimensions.relevance).toBeGreaterThanOrEqual(0);
    });
  });

  describe('配置选项', () => {
    it('应该使用自定义的通过阈值', async () => {
      const evaluator = new LLMEvaluator({ passThreshold: 8.0 });

      const mockResponse = JSON.stringify({
        score: 7.5,
        dimensions: {
          relevance: 8,
          coherence: 7,
          completeness: 7,
          readability: 8,
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      expect(result.passed).toBe(false);  // 7.5 < 8.0
    });

    it('应该能够设置通过阈值', () => {
      const evaluator = new LLMEvaluator();

      evaluator.setPassThreshold(9.0);
      expect(evaluator.getPassThreshold()).toBe(9.0);

      evaluator.setPassThreshold(6.0);
      expect(evaluator.getPassThreshold()).toBe(6.0);
    });

    it('应该在设置无效阈值时抛出错误', () => {
      const evaluator = new LLMEvaluator();

      expect(() => {
        evaluator.setPassThreshold(15);
      }).toThrow();

      expect(() => {
        evaluator.setPassThreshold(-1);
      }).toThrow();
    });
  });

  describe('元数据', () => {
    it('应该返回正确的元数据', async () => {
      const mockResponse = JSON.stringify({
        score: 8.0,
        dimensions: {
          relevance: 8,
          coherence: 8,
          completeness: 8,
          readability: 8,
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: {
          promptTokens: 500,
          completionTokens: 300,
          totalTokens: 800,
        },
      });

      const result = await evaluator.evaluate('内容', '要求');

      expect(result.metadata.evaluatedAt).toBeDefined();
      expect(result.metadata.model).toBe('deepseek-chat');
      expect(result.metadata.tokensUsed).toBe(800);
    });
  });

  describe('边界情况', () => {
    it('应该处理空内容', async () => {
      const mockResponse = JSON.stringify({
        score: 0,
        dimensions: {
          relevance: 0,
          coherence: 0,
          completeness: 0,
          readability: 0,
        },
        strengths: [],
        weaknesses: ['内容为空'],
        suggestions: ['添加内容'],
        reasoning: '内容为空',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('', '要求');

      expect(result).toBeDefined();
    });

    it('应该处理超长内容', async () => {
      const longContent = '内容'.repeat(10000);
      const mockResponse = JSON.stringify({
        score: 5.0,
        dimensions: {
          relevance: 5,
          coherence: 5,
          completeness: 5,
          readability: 5,
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate(longContent, '要求');

      expect(result).toBeDefined();
      // 检查是否截断了内容
      expect(mockLLMService.chat).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.stringContaining('内容已截断')
            })
          ])
        })
      );
    });

    it('应该处理特殊字符', async () => {
      const specialContent = '特殊字符：!@#$%^&*()';
      const mockResponse = JSON.stringify({
        score: 8.0,
        dimensions: {
          relevance: 8,
          coherence: 8,
          completeness: 8,
          readability: 8,
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate(specialContent, '要求');

      expect(result).toBeDefined();
    });
  });

  describe('响应解析', () => {
    it('应该解析纯 JSON 响应', async () => {
      const mockResponse = JSON.stringify({
        score: 8.0,
        dimensions: {
          relevance: 8,
          coherence: 8,
          completeness: 8,
          readability: 8,
        },
        strengths: [],
        weaknesses: [],
        suggestions: [],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      expect(result.score).toBe(8.0);
    });

    it('应该处理部分缺失的字段', async () => {
      const mockResponse = JSON.stringify({
        score: 8.0,
        // 缺少 dimensions
        strengths: ['优点'],
        // 缺少 weaknesses
        suggestions: ['建议'],
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      // 应该使用默认值填充缺失字段
      expect(result.score).toBe(8.0);
      expect(result.dimensions).toBeDefined();
    });

    it('应该处理非字符串的数组字段', async () => {
      const mockResponse = JSON.stringify({
        score: 8.0,
        dimensions: {
          relevance: 8,
          coherence: 8,
          completeness: 8,
          readability: 8,
        },
        strengths: '单个优点',  // 字符串而不是数组
        weaknesses: null,
        suggestions: ['建议1', '建议2'],
        reasoning: '测试',
      });

      mockLLMService.chat.mockResolvedValue({
        content: mockResponse,
        usage: { promptTokens: 500, completionTokens: 300, totalTokens: 800 },
      });

      const result = await evaluator.evaluate('内容', '要求');

      expect(Array.isArray(result.details.strengths)).toBe(true);
      expect(result.details.strengths).toContain('单个优点');
    });
  });
});
