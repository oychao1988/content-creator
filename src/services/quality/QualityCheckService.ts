/**
 * 质量检查服务
 *
 * 整合硬规则检查和 LLM 评估的完整质量检查服务
 * 支持智能反馈生成、自动重试机制和结果缓存
 */

import crypto from 'crypto';
import { HardRuleChecker, type HardConstraints, type HardRuleCheckResult } from './HardRuleChecker.js';
import { LLMEvaluator, type LLMEvaluationResult, type EvaluateOptions } from './LLMEvaluator.js';
import { createLogger } from '../../infrastructure/logging/logger.js';
import { cacheService } from '../../infrastructure/cache/CacheService.js';
import { metricsService } from '../../infrastructure/monitoring/MetricsService.js';

const logger = createLogger('QualityCheck');

/**
 * 质量检查选项
 */
export interface QualityCheckOptions {
  // 硬规则约束
  hardRules?: HardConstraints;

  // LLM 软评分配置
  softScoring?: {
    enabled: boolean;
    passThreshold?: number;
    maxAttempts?: number;
  };

  // 其他选项
  timeout?: number;
  skipCache?: boolean;
}

/**
 * 质量检查结果
 */
export interface QualityCheckResult {
  passed: boolean;
  score: number;  // 0-10
  hardConstraintsPassed: boolean;
  softScore?: number;
  details: {
    hardRuleCheck?: HardRuleCheckResult;
    llmEvaluation?: LLMEvaluationResult;
  };
  fixSuggestions?: string[];
  attempts: number;
  checkedAt: number;
  duration: number;  // 检查耗时（毫秒）
}

/**
 * 检查统计
 */
export interface CheckStatistics {
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  averageAttempts: number;
  averageDuration: number;
  passRate: number;
}

/**
 * 质量检查服务类
 */
export class QualityCheckService {
  private hardRuleChecker: HardRuleChecker;
  private llmEvaluator: LLMEvaluator;
  private enableCache: boolean;

  // 统计信息
  private stats: CheckStatistics = {
    totalChecks: 0,
    passedChecks: 0,
    failedChecks: 0,
    averageAttempts: 0,
    averageDuration: 0,
    passRate: 0,
  };

  constructor() {
    this.hardRuleChecker = new HardRuleChecker();
    this.llmEvaluator = new LLMEvaluator();
    this.enableCache = true; // 默认启用缓存
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(content: string, requirements: string, options: QualityCheckOptions): string {
    // 只包含影响检查结果的参数
    const cacheData = {
      content,
      requirements,
      hardRules: options.hardRules,
      softScoring: options.softScoring,
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(cacheData))
      .digest('hex');

    return hash;
  }

  /**
   * 检查内容质量（支持缓存）
   */
  async check(
    content: string,
    requirements: string,
    options: QualityCheckOptions = {}
  ): Promise<QualityCheckResult> {
    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = options.softScoring?.maxAttempts ?? 3;

    logger.debug('Starting quality check', {
      contentLength: content.length,
      options,
    });

    // 尝试从缓存获取（如果未跳过缓存）
    if (this.enableCache && !options.skipCache) {
      try {
        const cacheKey = this.generateCacheKey(content, requirements, options);
        const cached = await cacheService.getCachedQualityCheckResult(cacheKey);

        if (cached) {
          logger.debug('Quality check result retrieved from cache', { cacheKey });
          metricsService.recordCacheHit('quality_check');

          // 更新缓存结果的时间戳
          cached.checkedAt = Date.now();

          this.updateStats(cached);
          return cached;
        }
        metricsService.recordCacheMiss('quality_check');
      } catch (error) {
        logger.warn('Failed to retrieve from cache', error as Error);
        // 继续执行，不阻断请求
      }
    }

    try {
      // 第一步：硬规则检查
      const hardRuleResult = this.hardRuleChecker.check(
        content,
        options.hardRules || {}
      );

      logger.debug('Hard rule check completed', {
        passed: hardRuleResult.passed,
        score: hardRuleResult.score,
      });

      // 如果硬规则不通过，直接返回失败
      if (!hardRuleResult.passed) {
        const result: QualityCheckResult = {
          passed: false,
          score: 0,
          hardConstraintsPassed: false,
          details: {
            hardRuleCheck: hardRuleResult,
          },
          fixSuggestions: this.generateFixSuggestions(hardRuleResult, null),
          attempts: 1,
          checkedAt: Date.now(),
          duration: Date.now() - startTime,
        };

        this.updateStats(result);

        // 缓存失败结果（异步，不等待）
        if (this.enableCache && !options.skipCache) {
          const cacheKey = this.generateCacheKey(content, requirements, options);
          cacheService.setCachedQualityCheckResult(cacheKey, result).catch((error) => {
            logger.warn('Failed to cache quality check result', error);
          });
        }

        return result;
      }

      // 第二步：LLM 软评分（如果启用）
      if (options.softScoring?.enabled !== false) {
        let llmResult: LLMEvaluationResult | null = null;

        // 重试机制
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          attempts = attempt;
          logger.debug(`LLM evaluation attempt ${attempt}/${maxAttempts}`);

          llmResult = await this.llmEvaluator.evaluate(
            content,
            requirements,
            {
              passThreshold: options.softScoring?.passThreshold,
              timeout: options.timeout,
            }
          );

          // 如果通过，跳出重试循环
          if (llmResult.passed) {
            logger.info(`LLM evaluation passed on attempt ${attempt}`);
            break;
          }

          // 最后一次尝试仍不通过
          if (attempt === maxAttempts) {
            logger.warn('LLM evaluation failed after all attempts', {
              score: llmResult.score,
              threshold: options.softScoring?.passThreshold,
            });
          }
        }

        const result: QualityCheckResult = {
          passed: llmResult!.passed,
          score: llmResult!.score,
          hardConstraintsPassed: true,
          softScore: llmResult!.score,
          details: {
            hardRuleCheck: hardRuleResult,
            llmEvaluation: llmResult!,
          },
          fixSuggestions: this.generateFixSuggestions(hardRuleResult, llmResult!),
          attempts,
          checkedAt: Date.now(),
          duration: Date.now() - startTime,
        };

        this.updateStats(result);

        // 缓存检查结果（异步，不等待）
        if (this.enableCache && !options.skipCache) {
          const cacheKey = this.generateCacheKey(content, requirements, options);
          cacheService.setCachedQualityCheckResult(cacheKey, result).catch((error) => {
            logger.warn('Failed to cache quality check result', error);
          });
        }

        return result;
      }

      // 只做硬规则检查
      const result: QualityCheckResult = {
        passed: true,
        score: 10,
        hardConstraintsPassed: true,
        details: {
          hardRuleCheck: hardRuleResult,
        },
        attempts: 1,
        checkedAt: Date.now(),
        duration: Date.now() - startTime,
      };

      this.updateStats(result);

      // 缓存检查结果（异步，不等待）
      if (this.enableCache && !options.skipCache) {
        const cacheKey = this.generateCacheKey(content, requirements, options);
        cacheService.setCachedQualityCheckResult(cacheKey, result).catch((error) => {
          logger.warn('Failed to cache quality check result', error);
        });
      }

      return result;
    } catch (error) {
      logger.error('Quality check failed', error as Error);

      return {
        passed: false,
        score: 0,
        hardConstraintsPassed: false,
        details: {},
        fixSuggestions: ['质量检查服务暂时不可用，请稍后重试'],
        attempts,
        checkedAt: Date.now(),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * 批量检查
   */
  async batchCheck(
    items: Array<{
      content: string;
      requirements: string;
      options?: QualityCheckOptions;
    }>
  ): Promise<QualityCheckResult[]> {
    logger.info('Batch quality check', { count: items.length });

    const results = await Promise.all(
      items.map(item => this.check(item.content, item.requirements, item.options))
    );

    logger.info('Batch quality check completed', {
      total: results.length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length,
    });

    return results;
  }

  /**
   * 快速检查（仅硬规则）
   */
  quickCheck(
    content: string,
    constraints: HardConstraints
  ): QualityCheckResult {
    const startTime = Date.now();

    logger.debug('Quick quality check', {
      contentLength: content.length,
      constraints,
    });

    const hardRuleResult = this.hardRuleChecker.check(content, constraints);

    const result: QualityCheckResult = {
      passed: hardRuleResult.passed,
      score: hardRuleResult.passed ? 10 : 0,
      hardConstraintsPassed: hardRuleResult.passed,
      details: {
        hardRuleCheck: hardRuleResult,
      },
      fixSuggestions: this.generateFixSuggestions(hardRuleResult, null),
      attempts: 1,
      checkedAt: Date.now(),
      duration: Date.now() - startTime,
    };

    logger.debug('Quick check completed', {
      passed: result.passed,
      duration: result.duration,
    });

    return result;
  }

  /**
   * 生成修复建议
   */
  private generateFixSuggestions(
    hardRuleResult: HardRuleCheckResult,
    llmResult: LLMEvaluationResult | null
  ): string[] {
    const suggestions: string[] = [];

    // 硬规则问题
    if (!hardRuleResult.passed) {
      for (const issue of hardRuleResult.issues) {
        if (issue.suggestion) {
          suggestions.push(issue.suggestion);
        }
      }
    }

    // LLM 评估建议
    if (llmResult) {
      // 缺点
      for (const weakness of llmResult.details.weaknesses) {
        suggestions.push(`改进：${weakness}`);
      }

      // 建议事项
      for (const suggestion of llmResult.details.suggestions) {
        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * 更新统计信息
   */
  private updateStats(result: QualityCheckResult): void {
    this.stats.totalChecks++;

    if (result.passed) {
      this.stats.passedChecks++;
    } else {
      this.stats.failedChecks++;
    }

    // 更新平均值
    this.stats.averageAttempts =
      (this.stats.averageAttempts * (this.stats.totalChecks - 1) + result.attempts) /
      this.stats.totalChecks;

    this.stats.averageDuration =
      (this.stats.averageDuration * (this.stats.totalChecks - 1) + result.duration) /
      this.stats.totalChecks;

    // 更新通过率
    this.stats.passRate = (this.stats.passedChecks / this.stats.totalChecks) * 100;

    logger.debug('Statistics updated', { stats: this.stats });
  }

  /**
   * 获取统计信息
   */
  getStatistics(): CheckStatistics {
    return { ...this.stats };
  }

  /**
   * 重置统计信息
   */
  resetStatistics(): void {
    this.stats = {
      totalChecks: 0,
      passedChecks: 0,
      failedChecks: 0,
      averageAttempts: 0,
      averageDuration: 0,
      passRate: 0,
    };
    logger.info('Statistics reset');
  }

  /**
   * 设置硬规则检查器
   */
  setHardRuleChecker(checker: HardRuleChecker): void {
    this.hardRuleChecker = checker;
    logger.info('Hard rule checker updated');
  }

  /**
   * 设置 LLM 评估器
   */
  setLLMEvaluator(evaluator: LLMEvaluator): void {
    this.llmEvaluator = evaluator;
    logger.info('LLM evaluator updated');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 测试硬规则检查
      const testContent = '这是一个测试内容。';
      this.hardRuleChecker.check(testContent, {});

      logger.info('Quality check service health check passed');
      return true;
    } catch (error) {
      logger.error('Quality check service health check failed', error as Error);
      return false;
    }
  }
}

/**
 * 质量检查服务单例
 */
export const qualityCheckService = new QualityCheckService();
