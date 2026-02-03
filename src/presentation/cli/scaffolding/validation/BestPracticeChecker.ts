/**
 * Best Practice Checker - 最佳实践检查器
 *
 * 使用 AI 对比项目模式和生成的代码，检查最佳实践
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import { CODE_VALIDATION_PROMPT } from '../ai/prompts/validate.js';
import type {
  CodeValidationResult,
  ValidationDimension,
} from '../ai/prompts/validate.js';

const logger = createLogger('BestPracticeChecker');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 最佳实践检查结果
 */
export interface BestPracticeResult {
  /** 总体评分（0-100） */
  score: number;
  /** 是否通过 */
  pass: boolean;
  /** 检查到的最佳实践问题 */
  issues: BestPracticeIssue[];
  /** 改进建议 */
  suggestions: string[];
  /** 验证详情 */
  details: {
    /** 类型安全评分 */
    typeSafety: number;
    /** 代码风格评分 */
    codeStyle: number;
    /** 最佳实践评分 */
    bestPractices: number;
    /** 性能评分 */
    performance: number;
    /** 可维护性评分 */
    maintainability: number;
    /** 错误处理评分 */
    errorHandling: number;
  };
}

/**
 * 最佳实践问题
 */
export interface BestPracticeIssue {
  /** 严重程度 */
  severity: 'high' | 'medium' | 'low';
  /** 问题类别 */
  category: string;
  /** 问题描述 */
  message: string;
  /** 代码位置 */
  location?: string;
  /** 修复建议 */
  fixSuggestion?: string;
}

/**
 * 检查配置
 */
export interface BestPracticeCheckerConfig {
  /** 通过阈值 */
  passThreshold?: number;
  /** 是否启用详细模式 */
  verbose?: boolean;
  /** 检查超时时间（毫秒） */
  timeout?: number;
}

// ============================================================================
// BestPracticeChecker 类
// ============================================================================

/**
 * 最佳实践检查器
 *
 * 使用 AI 验证代码是否符合项目最佳实践
 */
export class BestPracticeChecker {
  private llmService: ILLMService;
  private config: Required<BestPracticeCheckerConfig>;

  constructor(llmService: ILLMService, config: BestPracticeCheckerConfig = {}) {
    this.llmService = llmService;
    this.config = {
      passThreshold: config.passThreshold ?? 70,
      verbose: config.verbose ?? false,
      timeout: config.timeout ?? 60000,
    };

    logger.info('BestPracticeChecker initialized', {
      passThreshold: this.config.passThreshold,
      verbose: this.config.verbose,
    });
  }

  /**
   * 检查最佳实践
   *
   * @param code - 待检查的代码
   * @param projectPatterns - 项目代码模式
   * @param bestPractices - 项目最佳实践
   * @returns 检查结果
   */
  async checkBestPractices(
    code: string,
    projectPatterns: string,
    bestPractices: string
  ): Promise<BestPracticeResult> {
    const startTime = Date.now();

    logger.info('Starting best practice check', {
      codeLength: code.length,
      patternsLength: projectPatterns.length,
      bestPracticesLength: bestPractices.length,
    });

    try {
      // 构建 Prompt
      const prompt = CODE_VALIDATION_PROMPT(code, projectPatterns, bestPractices);

      // 调用 LLM
      logger.debug('Sending request to LLM for validation...');
      const response = await this.llmService.chat({
        messages: [
          {
            role: 'system',
            content:
              '你是一个专业的代码审查专家，负责审查 TypeScript 代码质量。' +
              '请严格按照 JSON 格式返回验证结果，不要包含任何其他内容。',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.1, // 使用低温度以获得更一致的输出
        maxTokens: 4000,
      });

      // 解析响应
      const validationResult = this.parseValidationResponse(response.content);

      // 转换为 BestPracticeResult
      const result = this.convertToBestPracticeResult(validationResult);

      const duration = Date.now() - startTime;
      logger.info('Best practice check completed', {
        score: result.score,
        pass: result.pass,
        issueCount: result.issues.length,
        suggestionCount: result.suggestions.length,
        duration,
      });

      // 如果启用详细模式，打印详细信息
      if (this.config.verbose && result.issues.length > 0) {
        logger.debug('Best practice issues:', result.issues);
      }

      return result;
    } catch (error) {
      logger.error('Best practice check failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // 返回默认结果（标记为失败）
      return {
        score: 0,
        pass: false,
        issues: [
          {
            severity: 'high',
            category: 'validation',
            message: `最佳实践检查失败: ${error instanceof Error ? error.message : String(error)}`,
            fixSuggestion: '请检查 LLM 服务配置或重试',
          },
        ],
        suggestions: [],
        details: {
          typeSafety: 0,
          codeStyle: 0,
          bestPractices: 0,
          performance: 0,
          maintainability: 0,
          errorHandling: 0,
        },
      };
    }
  }

  /**
   * 解析 LLM 响应
   *
   * @param content - LLM 返回的内容
   * @returns 解析后的验证结果
   */
  private parseValidationResponse(content: string): CodeValidationResult {
    try {
      // 尝试提取 JSON（处理可能的 markdown 代码块）
      let jsonContent = content.trim();

      // 移除 markdown 代码块标记
      if (jsonContent.startsWith('```json')) {
        jsonContent = jsonContent.slice(7);
      } else if (jsonContent.startsWith('```')) {
        jsonContent = jsonContent.slice(3);
      }

      if (jsonContent.endsWith('```')) {
        jsonContent = jsonContent.slice(0, -3);
      }

      jsonContent = jsonContent.trim();

      // 解析 JSON
      const parsed = JSON.parse(jsonContent) as CodeValidationResult;

      // 验证必需字段
      if (!parsed.summary || typeof parsed.summary.overallScore !== 'number') {
        throw new Error('Invalid validation result: missing summary or overallScore');
      }

      return parsed;
    } catch (error) {
      logger.error('Failed to parse validation response', {
        error: error instanceof Error ? error.message : String(error),
        content: content.slice(0, 500),
      });

      throw new Error(`Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 转换为 BestPracticeResult
   *
   * @param validation - 验证结果
   * @returns 最佳实践检查结果
   */
  private convertToBestPracticeResult(validation: CodeValidationResult): BestPracticeResult {
    const issues: BestPracticeIssue[] = [];

    // 转换严重问题
    for (const criticalIssue of validation.criticalIssues) {
      issues.push({
        severity: criticalIssue.severity,
        category: criticalIssue.category,
        message: criticalIssue.message,
        location: criticalIssue.location,
        fixSuggestion: criticalIssue.fixSuggestion,
      });
    }

    // 转换改进建议（高优先级的转为问题）
    for (const improvement of validation.improvements) {
      if (improvement.priority === 'high') {
        issues.push({
          severity: 'medium',
          category: improvement.category,
          message: improvement.description,
          fixSuggestion: improvement.example,
        });
      }
    }

    // 收集所有建议
    const suggestions: string[] = [];

    for (const dimension of Object.values(validation.dimensions)) {
      suggestions.push(...dimension.suggestions);
    }

    for (const improvement of validation.improvements) {
      if (improvement.description) {
        suggestions.push(`[${improvement.category}] ${improvement.description}`);
        if (improvement.example) {
          suggestions.push(`  示例: ${improvement.example}`);
        }
      }
    }

    // 计算通过状态
    const pass = validation.summary.overallScore >= this.config.passThreshold;

    return {
      score: validation.summary.overallScore,
      pass,
      issues,
      suggestions,
      details: {
        typeSafety: validation.dimensions.typeSafety?.score ?? 0,
        codeStyle: validation.dimensions.codeStyle?.score ?? 0,
        bestPractices: validation.dimensions.bestPractices?.score ?? 0,
        performance: validation.dimensions.performance?.score ?? 0,
        maintainability: validation.dimensions.maintainability?.score ?? 0,
        errorHandling: validation.dimensions.errorHandling?.score ?? 0,
      },
    };
  }

  /**
   * 检查多个文件
   *
   * @param files - 文件映射（文件名 -> 代码）
   * @param projectPatterns - 项目代码模式
   * @param bestPractices - 项目最佳实践
   * @returns 检查结果映射
   */
  async checkMultipleFiles(
    files: Record<string, string>,
    projectPatterns: string,
    bestPractices: string
  ): Promise<Record<string, BestPracticeResult>> {
    logger.info('Checking multiple files', { fileCount: Object.keys(files).length });

    const results: Record<string, BestPracticeResult> = {};

    for (const [fileName, code] of Object.entries(files)) {
      logger.debug(`Checking file: ${fileName}`);
      results[fileName] = await this.checkBestPractices(code, projectPatterns, bestPractices);
    }

    // 计算总体评分
    const scores = Object.values(results).map((r) => r.score);
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

    logger.info('All files checked', {
      fileCount: Object.keys(files).length,
      avgScore,
      passCount: Object.values(results).filter((r) => r.pass).length,
    });

    return results;
  }

  /**
   * 生成检查报告
   *
   * @param results - 检查结果
   * @returns 格式化的报告字符串
   */
  generateReport(results: BestPracticeResult | Record<string, BestPracticeResult>): string {
    const lines: string[] = [];

    const isMultiple = typeof results !== 'boolean' && 'score' in results === false;

    if (isMultiple) {
      // 多文件报告
      lines.push('='.repeat(80));
      lines.push('Best Practice Check Report');
      lines.push('='.repeat(80));
      lines.push('');

      const resultsMap = results as Record<string, BestPracticeResult>;

      for (const [fileName, result] of Object.entries(resultsMap)) {
        lines.push(`File: ${fileName}`);
        lines.push(`Score: ${result.score}/100 ${result.pass ? '✓ PASS' : '✗ FAIL'}`);
        lines.push(`Issues: ${result.issues.length}`);
        lines.push('');
      }

      // 计算总体统计
      const scores = Object.values(resultsMap).map((r) => r.score);
      const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const passCount = Object.values(resultsMap).filter((r) => r.pass).length;

      lines.push('-'.repeat(80));
      lines.push(`Average Score: ${avgScore}/100`);
      lines.push(`Pass Rate: ${passCount}/${Object.keys(resultsMap).length}`);
      lines.push('='.repeat(80));
    } else {
      // 单文件报告
      const result = results as BestPracticeResult;

      lines.push('='.repeat(80));
      lines.push('Best Practice Check Report');
      lines.push('='.repeat(80));
      lines.push('');
      lines.push(`Overall Score: ${result.score}/100 ${result.pass ? '✓ PASS' : '✗ FAIL'}`);
      lines.push('');
      lines.push('-'.repeat(80));
      lines.push('Detailed Scores:');
      lines.push(`  Type Safety:      ${result.details.typeSafety}/100`);
      lines.push(`  Code Style:       ${result.details.codeStyle}/100`);
      lines.push(`  Best Practices:   ${result.details.bestPractices}/100`);
      lines.push(`  Performance:      ${result.details.performance}/100`);
      lines.push(`  Maintainability:  ${result.details.maintainability}/100`);
      lines.push(`  Error Handling:   ${result.details.errorHandling}/100`);
      lines.push('-'.repeat(80));
      lines.push('');

      if (result.issues.length > 0) {
        lines.push(`Issues Found: ${result.issues.length}`);
        lines.push('');
        result.issues.forEach((issue, index) => {
          lines.push(`${index + 1}. [${issue.severity.toUpperCase()}] ${issue.message}`);
          if (issue.location) {
            lines.push(`   Location: ${issue.location}`);
          }
          if (issue.fixSuggestion) {
            lines.push(`   Fix: ${issue.fixSuggestion}`);
          }
          lines.push('');
        });
      }

      if (result.suggestions.length > 0) {
        lines.push(`Suggestions: ${result.suggestions.length}`);
        lines.push('');
        result.suggestions.slice(0, 10).forEach((suggestion) => {
          lines.push(`  • ${suggestion}`);
        });

        if (result.suggestions.length > 10) {
          lines.push(`  ... and ${result.suggestions.length - 10} more`);
        }
        lines.push('');
      }

      lines.push('='.repeat(80));
    }

    return lines.join('\n');
  }
}

// ============================================================================
// 导出
// ============================================================================

export default BestPracticeChecker;
