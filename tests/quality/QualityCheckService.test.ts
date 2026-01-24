/**
 * QualityCheckService 测试
 *
 * 测试质量检查服务的完整功能
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 使用 vi.hoisted() 创建 mock 对象，使其可以在 vi.mock() 工厂函数中使用
const { mockHardRuleChecker, mockLLMEvaluator, mockCacheService, mockMetricsService } = vi.hoisted(() => ({
  mockHardRuleChecker: {
    check: vi.fn(),
  },
  mockLLMEvaluator: {
    evaluate: vi.fn(),
  },
  mockCacheService: {
    getCachedQualityCheck: vi.fn().mockResolvedValue(null),
    setCachedQualityCheck: vi.fn().mockResolvedValue(undefined),
  },
  mockMetricsService: {
    recordCacheHit: vi.fn(),
    recordCacheMiss: vi.fn(),
  },
}));

// Mock 模块
// 使用 class mock 确保可以被 new 调用
vi.mock('../../src/services/quality/HardRuleChecker.js', () => ({
  HardRuleChecker: class {
    constructor() {
      return mockHardRuleChecker;
    }
  },
}));

vi.mock('../../src/services/quality/LLMEvaluator.js', () => ({
  LLMEvaluator: class {
    constructor() {
      return mockLLMEvaluator;
    }
  },
}));

vi.mock('../../src/infrastructure/cache/CacheService.js', () => ({
  cacheService: mockCacheService,
}));

vi.mock('../../src/infrastructure/monitoring/MetricsService.js', () => ({
  metricsService: mockMetricsService,
}));

// Mock logger
vi.mock('../../src/infrastructure/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// 在 mocks 之后导入服务
import { QualityCheckService } from '../../src/services/quality/QualityCheckService.js';

describe('QualityCheckService', () => {
  let service: QualityCheckService;

  beforeEach(() => {
    service = new QualityCheckService();
    vi.clearAllMocks();
  });

  describe('基础检查功能', () => {
    it('应该在硬规则不通过时直接返回失败', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: false,
        score: 0,
        details: {
          wordCount: { count: 10, min: 100, passed: false },
          keywords: undefined,
          structure: undefined,
          forbiddenWords: undefined,
        },
        issues: [
          {
            severity: 'error' as const,
            category: 'word_count',
            message: '字数不足',
            suggestion: '增加内容',
          },
        ],
        checkedAt: Date.now(),
      });

      const result = await service.check(
        '短内容',
        '要求',
        {
          hardRules: {
            minWords: 100,
          },
        }
      );

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
      expect(result.hardConstraintsPassed).toBe(false);
      expect(result.details.hardRuleCheck).toBeDefined();
      expect(result.details.llmEvaluation).toBeUndefined();
      expect(result.fixSuggestions).toBeDefined();
      expect(result.fixSuggestions!.length).toBeGreaterThan(0);
    });

    it('应该在硬规则通过后进行 LLM 评估', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {
          wordCount: { count: 500, passed: true },
        },
        issues: [],
        checkedAt: Date.now(),
      });

      mockLLMEvaluator.evaluate.mockResolvedValue({
        passed: true,
        score: 8.5,
        dimensions: {
          relevance: 9,
          coherence: 8,
          completeness: 8,
          readability: 9,
        },
        details: {
          strengths: ['内容完整'],
          weaknesses: [],
          suggestions: [],
          reasoning: '良好',
        },
        metadata: {
          evaluatedAt: Date.now(),
          model: 'deepseek-chat',
          tokensUsed: 800,
        },
      });

      const result = await service.check(
        '这是内容',
        '这是要求',
        {
          hardRules: {
            minWords: 100,
          },
          softScoring: {
            enabled: true,
            passThreshold: 7.0,
          },
        }
      );

      expect(result.passed).toBe(true);
      expect(result.score).toBe(8.5);
      expect(result.hardConstraintsPassed).toBe(true);
      expect(result.details.hardRuleCheck).toBeDefined();
      expect(result.details.llmEvaluation).toBeDefined();
      expect(mockLLMEvaluator.evaluate).toHaveBeenCalled();
    });

    it('应该在 LLM 评估失败时重试', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      // 前两次失败，第三次成功
      mockLLMEvaluator.evaluate
        .mockResolvedValueOnce({
          passed: false,
          score: 6.0,
          dimensions: { relevance: 6, coherence: 6, completeness: 6, readability: 6 },
          details: { strengths: [], weaknesses: ['质量差'], suggestions: [], reasoning: '差' },
          metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
        })
        .mockResolvedValueOnce({
          passed: false,
          score: 6.5,
          dimensions: { relevance: 6, coherence: 7, completeness: 6, readability: 7 },
          details: { strengths: [], weaknesses: ['质量差'], suggestions: [], reasoning: '差' },
          metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
        })
        .mockResolvedValueOnce({
          passed: true,
          score: 7.5,
          dimensions: { relevance: 8, coherence: 7, completeness: 7, readability: 8 },
          details: { strengths: ['内容良好'], weaknesses: [], suggestions: [], reasoning: '良好' },
          metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
        });

      const result = await service.check(
        '内容',
        '要求',
        {
          softScoring: {
            enabled: true,
            passThreshold: 7.0,
            maxAttempts: 3,
          },
        }
      );

      expect(result.passed).toBe(true);
      expect(result.score).toBe(7.5);
      expect(result.attempts).toBe(3);
      expect(mockLLMEvaluator.evaluate).toHaveBeenCalledTimes(3);
    });

    it('应该在所有重试失败后返回失败', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      mockLLMEvaluator.evaluate.mockResolvedValue({
        passed: false,
        score: 6.0,
        dimensions: { relevance: 6, coherence: 6, completeness: 6, readability: 6 },
        details: { strengths: [], weaknesses: ['质量差'], suggestions: [], reasoning: '差' },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      const result = await service.check(
        '内容',
        '要求',
        {
          softScoring: {
            enabled: true,
            passThreshold: 7.0,
            maxAttempts: 3,
          },
        }
      );

      expect(result.passed).toBe(false);
      expect(result.score).toBe(6.0);
      expect(result.attempts).toBe(3);
      expect(mockLLMEvaluator.evaluate).toHaveBeenCalledTimes(3);
    });

    it('应该在禁用软评分时只进行硬规则检查', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      const result = await service.check(
        '内容',
        '要求',
        {
          softScoring: {
            enabled: false,
          },
        }
      );

      expect(result.passed).toBe(true);
      expect(result.score).toBe(10);
      expect(result.hardConstraintsPassed).toBe(true);
      expect(result.details.llmEvaluation).toBeUndefined();
      expect(mockLLMEvaluator.evaluate).not.toHaveBeenCalled();
    });
  });

  describe('快速检查', () => {
    it('应该只进行硬规则检查', () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      const result = service.quickCheck('内容', {
        minWords: 100,
      });

      expect(result.passed).toBe(true);
      expect(result.score).toBe(10);
      expect(result.attempts).toBe(1);
      expect(mockHardRuleChecker.check).toHaveBeenCalledTimes(1);
      expect(mockLLMEvaluator.evaluate).not.toHaveBeenCalled();
    });

    it('应该在快速检查中返回修复建议', () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: false,
        score: 0,
        details: {},
        issues: [
          {
            severity: 'error' as const,
            category: 'word_count',
            message: '字数不足',
            suggestion: '增加内容',
          },
        ],
        checkedAt: Date.now(),
      });

      const result = service.quickCheck('内容', {
        minWords: 100,
      });

      expect(result.passed).toBe(false);
      expect(result.fixSuggestions).toBeDefined();
      expect(result.fixSuggestions!.length).toBeGreaterThan(0);
    });
  });

  describe('批量检查', () => {
    it('应该批量检查多个内容', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      mockLLMEvaluator.evaluate.mockResolvedValue({
        passed: true,
        score: 8.0,
        dimensions: { relevance: 8, coherence: 8, completeness: 8, readability: 8 },
        details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '良好' },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      const items = [
        { content: '内容1', requirements: '要求1' },
        { content: '内容2', requirements: '要求2' },
        { content: '内容3', requirements: '要求3' },
      ];

      const results = await service.batchCheck(items);

      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(true);
      expect(results[2].passed).toBe(true);
      expect(mockHardRuleChecker.check).toHaveBeenCalledTimes(3);
      expect(mockLLMEvaluator.evaluate).toHaveBeenCalledTimes(3);
    });

    it('应该在批量检查中处理部分失败', async () => {
      mockHardRuleChecker.check
        .mockReturnValueOnce({ passed: true, score: 100, details: {}, issues: [], checkedAt: Date.now() })
        .mockReturnValueOnce({ passed: false, score: 0, details: {}, issues: [], checkedAt: Date.now() })
        .mockReturnValueOnce({ passed: true, score: 100, details: {}, issues: [], checkedAt: Date.now() });

      mockLLMEvaluator.evaluate.mockResolvedValue({
        passed: true,
        score: 8.0,
        dimensions: { relevance: 8, coherence: 8, completeness: 8, readability: 8 },
        details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '良好' },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      const items = [
        { content: '内容1', requirements: '要求1' },
        { content: '内容2', requirements: '要求2' },
        { content: '内容3', requirements: '要求3' },
      ];

      const results = await service.batchCheck(items);

      expect(results).toHaveLength(3);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
      expect(results[2].passed).toBe(true);
    });
  });

  describe('统计信息', () => {
    it('应该收集检查统计信息', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      // Mock evaluate 返回带有模拟时间的值
      mockLLMEvaluator.evaluate.mockImplementation(async () => {
        // 模拟异步操作耗时
        await new Promise(resolve => setTimeout(resolve, 10));
        return {
          passed: true,
          score: 8.0,
          dimensions: { relevance: 8, coherence: 8, completeness: 8, readability: 8 },
          details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '良好' },
          metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
        };
      });

      // 执行多次检查
      await service.check('内容1', '要求1');
      await service.check('内容2', '要求2');
      await service.check('内容3', '要求3');

      const stats = service.getStatistics();

      expect(stats.totalChecks).toBe(3);
      expect(stats.passedChecks).toBe(3);
      expect(stats.failedChecks).toBe(0);
      expect(stats.passRate).toBe(100);
      expect(stats.averageAttempts).toBeGreaterThan(0);
      expect(stats.averageDuration).toBeGreaterThan(0);
    });

    it('应该正确计算通过率', async () => {
      // 禁用缓存确保每次都执行检查
      mockCacheService.getCachedQualityCheck.mockResolvedValue(null);

      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      // 第一次：通过
      mockLLMEvaluator.evaluate.mockResolvedValueOnce({
        passed: true,
        score: 8.0,
        dimensions: { relevance: 8, coherence: 8, completeness: 8, readability: 8 },
        details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '良好' },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      const result1 = await service.check('内容1', '要求1', { skipCache: true, softScoring: { enabled: true, maxAttempts: 1 } });
      expect(result1.passed).toBe(true);

      // 第二次：失败
      mockLLMEvaluator.evaluate.mockResolvedValueOnce({
        passed: false,
        score: 6.0,
        dimensions: { relevance: 6, coherence: 6, completeness: 6, readability: 6 },
        details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '差' },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      const result2 = await service.check('内容2', '要求2', { skipCache: true, softScoring: { enabled: true, maxAttempts: 1 } });
      expect(result2.passed).toBe(false);

      // 第三次：通过
      mockLLMEvaluator.evaluate.mockResolvedValueOnce({
        passed: true,
        score: 7.5,
        dimensions: { relevance: 8, coherence: 7, completeness: 7, readability: 8 },
        details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '良好' },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      const result3 = await service.check('内容3', '要求3', { skipCache: true, softScoring: { enabled: true, maxAttempts: 1 } });
      expect(result3.passed).toBe(true);

      const stats = service.getStatistics();

      expect(stats.totalChecks).toBe(3);
      expect(stats.passedChecks).toBe(2);
      expect(stats.failedChecks).toBe(1);
      expect(stats.passRate).toBeCloseTo(66.67, 1);
    });

    it('应该能够重置统计信息', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      mockLLMEvaluator.evaluate.mockResolvedValue({
        passed: true,
        score: 8.0,
        dimensions: { relevance: 8, coherence: 8, completeness: 8, readability: 8 },
        details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '良好' },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      await service.check('内容', '要求');

      service.resetStatistics();

      const stats = service.getStatistics();

      expect(stats.totalChecks).toBe(0);
      expect(stats.passedChecks).toBe(0);
      expect(stats.failedChecks).toBe(0);
      expect(stats.passRate).toBe(0);
      expect(stats.averageAttempts).toBe(0);
      expect(stats.averageDuration).toBe(0);
    });
  });

  describe('修复建议生成', () => {
    it('应该合并硬规则和 LLM 的建议', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: false,
        score: 0,
        details: {},
        issues: [
          {
            severity: 'error' as const,
            category: 'word_count',
            message: '字数不足',
            suggestion: '增加内容到 100 字以上',
          },
        ],
        checkedAt: Date.now(),
      });

      const result = await service.check('内容', '要求', {
        hardRules: { minWords: 100 },
      });

      expect(result.fixSuggestions).toBeDefined();
      expect(result.fixSuggestions!.length).toBeGreaterThan(0);
      expect(result.fixSuggestions).toContain('增加内容到 100 字以上');
    });

    it('应该包含 LLM 的改进建议', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      mockLLMEvaluator.evaluate.mockResolvedValue({
        passed: false,
        score: 6.0,
        dimensions: { relevance: 6, coherence: 6, completeness: 6, readability: 6 },
        details: {
          strengths: [],
          weaknesses: ['论证不够深入', '缺少实例'],
          suggestions: ['增加具体案例', '深入分析观点'],
          reasoning: '需要改进',
        },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      const result = await service.check('内容', '要求');

      expect(result.fixSuggestions).toBeDefined();
      const suggestionsText = result.fixSuggestions!.join(' ');
      expect(suggestionsText).toContain('论证不够深入');
      expect(suggestionsText).toContain('增加具体案例');
    });
  });

  describe('错误处理', () => {
    it('应该处理 LLM 评估错误', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      mockLLMEvaluator.evaluate.mockRejectedValue(new Error('LLM error'));

      const result = await service.check('内容', '要求');

      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    });

    it('应该返回持续时间', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      mockLLMEvaluator.evaluate.mockResolvedValue({
        passed: true,
        score: 8.0,
        dimensions: { relevance: 8, coherence: 8, completeness: 8, readability: 8 },
        details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '良好' },
        metadata: { evaluatedAt: Date.now(), model: 'deepseek-chat', tokensUsed: 800 },
      });

      const result = await service.check('内容', '要求');

      expect(result.duration).toBeGreaterThanOrEqual(0);
      expect(result.checkedAt).toBeDefined();
    });
  });

  describe('自定义组件', () => {
    it('应该能够设置自定义的硬规则检查器', () => {
      const customChecker = {
        check: vi.fn().mockReturnValue({
          passed: true,
          score: 100,
          details: {},
          issues: [],
          checkedAt: Date.now(),
        }),
      };

      service.setHardRuleChecker(customChecker as any);

      service.quickCheck('内容', { minWords: 100 });

      expect(customChecker.check).toHaveBeenCalled();
    });

    it('应该能够设置自定义的 LLM 评估器', async () => {
      const customEvaluator = {
        evaluate: vi.fn().mockResolvedValue({
          passed: true,
          score: 9.0,
          dimensions: { relevance: 9, coherence: 9, completeness: 9, readability: 9 },
          details: { strengths: [], weaknesses: [], suggestions: [], reasoning: '优秀' },
          metadata: { evaluatedAt: Date.now(), model: 'custom', tokensUsed: 100 },
        }),
      };

      service.setLLMEvaluator(customEvaluator as any);

      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      await service.check('内容', '要求');

      expect(customEvaluator.evaluate).toHaveBeenCalled();
    });
  });

  describe('健康检查', () => {
    it('应该通过健康检查', async () => {
      mockHardRuleChecker.check.mockReturnValue({
        passed: true,
        score: 100,
        details: {},
        issues: [],
        checkedAt: Date.now(),
      });

      const isHealthy = await service.healthCheck();

      expect(isHealthy).toBe(true);
    });

    it('应该在健康检查失败时返回 false', async () => {
      mockHardRuleChecker.check.mockImplementation(() => {
        throw new Error('Health check failed');
      });

      const isHealthy = await service.healthCheck();

      expect(isHealthy).toBe(false);
    });
  });
});
