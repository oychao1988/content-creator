/**
 * Auto Validator & Optimizer - 自动验证器和优化器
 *
 * 集成所有验证器，提供综合的代码质量评分和自动修复功能
 */

import type { ILLMService } from '../../../../services/llm/ILLMService.js';
import { LLMServiceFactory } from '../../../../services/llm/LLMServiceFactory.js';
import { createLogger } from '../../../../infrastructure/logging/logger.js';
import { BestPracticeChecker } from './BestPracticeChecker.js';
import { CodePostProcessor, type WorkflowFiles } from '../codegen/CodePostProcessor.js';
import type {
  BestPracticeResult,
  BestPracticeIssue,
} from './BestPracticeChecker.js';

const logger = createLogger('AutoValidatorOptimizer');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 代码验证结果
 */
export interface CodeValidationResult {
  /** 总体评分（0-100） */
  overallScore: number;
  /** 是否通过 */
  pass: boolean;
  /** 各文件验证结果 */
  fileResults: Record<string, FileValidationResult>;
  /** 总体问题列表 */
  allIssues: ValidationIssue[];
  /** 统计信息 */
  stats: ValidationStats;
}

/**
 * 单文件验证结果
 */
export interface FileValidationResult {
  /** 文件名 */
  fileName: string;
  /** 评分 */
  score: number;
  /** 是否通过 */
  pass: boolean;
  /** TypeScript 检查结果 */
  typescript: {
    success: boolean;
    errors: string[];
  };
  /** ESLint 检查结果 */
  eslint: {
    success: boolean;
    errors: string[];
    warnings: string[];
    fixable: boolean;
  };
  /** 最佳实践检查结果 */
  bestPractices: {
    score: number;
    issues: BestPracticeIssue[];
  };
}

/**
 * 验证问题
 */
export interface ValidationIssue {
  /** 文件名 */
  fileName: string;
  /** 严重程度 */
  severity: 'high' | 'medium' | 'low';
  /** 来源 */
  source: 'typescript' | 'eslint' | 'bestPractices';
  /** 问题描述 */
  message: string;
  /** 位置 */
  location?: string;
  /** 修复建议 */
  fixSuggestion?: string;
}

/**
 * 验证统计
 */
export interface ValidationStats {
  /** 文件总数 */
  totalFiles: number;
  /** 通过的文件数 */
  passedFiles: number;
  /** 失败的文件数 */
  failedFiles: number;
  /** 总问题数 */
  totalIssues: number;
  /** 高优先级问题数 */
  highPriorityIssues: number;
  /** 中优先级问题数 */
  mediumPriorityIssues: number;
  /** 低优先级问题数 */
  lowPriorityIssues: number;
}

/**
 * 自动修复配置
 */
export interface AutoFixConfig {
  /** 是否启用 ESLint 自动修复 */
  enableESLintFix?: boolean;
  /** 是否启用 AI 驱动的优化 */
  enableAIOptimization?: boolean;
  /** 最大重试次数 */
  maxRetries?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
}

// ============================================================================
// AutoValidatorOptimizer 类
// ============================================================================

/**
 * 自动验证器和优化器
 *
 * 集成多种验证器，提供综合的代码质量评分和自动修复功能
 */
export class AutoValidatorOptimizer {
  private llmService: ILLMService;
  private bestPracticeChecker: BestPracticeChecker;
  private postProcessor: CodePostProcessor;

  constructor(llmService?: ILLMService) {
    this.llmService = llmService || LLMServiceFactory.create();
    this.bestPracticeChecker = new BestPracticeChecker(this.llmService, {
      passThreshold: 70,
      verbose: false,
      timeout: 60000,
    });
    this.postProcessor = new CodePostProcessor({
      enablePrettier: true,
      enableESLint: true,
      enableTypeCheck: true,
    });

    logger.info('AutoValidatorOptimizer initialized');
  }

  /**
   * 验证代码质量
   *
   * @param files - 工作流文件集合
   * @param projectPatterns - 项目代码模式
   * @param bestPractices - 项目最佳实践
   * @returns 验证结果
   */
  async validateCode(
    files: WorkflowFiles,
    projectPatterns: string,
    bestPractices: string
  ): Promise<CodeValidationResult> {
    const startTime = Date.now();

    logger.info('Starting code validation', {
      fileCount: this.getFileCount(files),
    });

    const fileResults: Record<string, FileValidationResult> = {};
    const allIssues: ValidationIssue[] = [];

    try {
      // 1. 验证状态接口
      if (files.state) {
        const result = await this.validateSingleFile(
          'state.ts',
          files.state,
          projectPatterns,
          bestPractices
        );
        fileResults['state.ts'] = result;
        allIssues.push(...this.toValidationIssues('state.ts', result));
      }

      // 2. 验证节点类
      for (const [nodeName, nodeCode] of files.nodes.entries()) {
        const fileName = `${nodeName}.ts`;
        const result = await this.validateSingleFile(
          fileName,
          nodeCode,
          projectPatterns,
          bestPractices
        );
        fileResults[fileName] = result;
        allIssues.push(...this.toValidationIssues(fileName, result));
      }

      // 3. 验证路由函数
      if (files.routeFunctions) {
        const result = await this.validateSingleFile(
          'routes.ts',
          files.routeFunctions,
          projectPatterns,
          bestPractices
        );
        fileResults['routes.ts'] = result;
        allIssues.push(...this.toValidationIssues('routes.ts', result));
      }

      // 4. 验证工作流图
      if (files.graph) {
        const result = await this.validateSingleFile(
          'graph.ts',
          files.graph,
          projectPatterns,
          bestPractices
        );
        fileResults['graph.ts'] = result;
        allIssues.push(...this.toValidationIssues('graph.ts', result));
      }

      // 5. 验证工厂类
      if (files.factory) {
        const result = await this.validateSingleFile(
          'factory.ts',
          files.factory,
          projectPatterns,
          bestPractices
        );
        fileResults['factory.ts'] = result;
        allIssues.push(...this.toValidationIssues('factory.ts', result));
      }

      // 6. 验证导出文件
      if (files.index) {
        const result = await this.validateSingleFile(
          'index.ts',
          files.index,
          projectPatterns,
          bestPractices
        );
        fileResults['index.ts'] = result;
        allIssues.push(...this.toValidationIssues('index.ts', result));
      }

      // 计算总体评分
      const scores = Object.values(fileResults).map((r) => r.score);
      const overallScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const pass = overallScore >= 70;

      // 统计问题
      const stats = this.calculateStats(fileResults, allIssues);

      const duration = Date.now() - startTime;
      logger.info('Code validation completed', {
        overallScore,
        pass,
        totalIssues: allIssues.length,
        duration,
      });

      return {
        overallScore,
        pass,
        fileResults,
        allIssues,
        stats,
      };
    } catch (error) {
      logger.error('Code validation failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      // 返回失败结果
      return {
        overallScore: 0,
        pass: false,
        fileResults: {},
        allIssues: [
          {
            fileName: 'unknown',
            severity: 'high',
            source: 'typescript',
            message: `验证失败: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        stats: {
          totalFiles: 0,
          passedFiles: 0,
          failedFiles: 0,
          totalIssues: 1,
          highPriorityIssues: 1,
          mediumPriorityIssues: 0,
          lowPriorityIssues: 0,
        },
      };
    }
  }

  /**
   * 自动修复代码
   *
   * @param files - 工作流文件集合
   * @param issues - 问题列表
   * @param config - 修复配置
   * @returns 修复后的文件集合
   */
  async autoFix(
    files: WorkflowFiles,
    issues: ValidationIssue[],
    config: AutoFixConfig = {}
  ): Promise<WorkflowFiles> {
    logger.info('Starting auto-fix', {
      issueCount: issues.length,
      enableESLintFix: config.enableESLintFix ?? true,
      enableAIOptimization: config.enableAIOptimization ?? false,
    });

    let fixedFiles = { ...files };

    // 1. ESLint 自动修复
    if (config.enableESLintFix !== false) {
      logger.info('Applying ESLint auto-fix...');
      fixedFiles = await this.applyESLintFix(fixedFiles);
    }

    // 2. Prettier 格式化（总是启用）
    logger.info('Applying Prettier formatting...');
    fixedFiles = await this.postProcessor.processAll(fixedFiles);

    // 3. AI 驱动的优化（可选）
    if (config.enableAIOptimization) {
      logger.info('Applying AI-driven optimization...');
      // TODO: 实现 AI 驱动的优化逻辑
    }

    logger.info('Auto-fix completed');

    return fixedFiles;
  }

  /**
   * 验证并自动修复
   *
   * @param files - 工作流文件集合
   * @param projectPatterns - 项目代码模式
   * @param bestPractices - 项目最佳实践
   * @param config - 修复配置
   * @returns 验证和修复后的文件集合
   */
  async validateAndFix(
    files: WorkflowFiles,
    projectPatterns: string,
    bestPractices: string,
    config: AutoFixConfig = {}
  ): Promise<{ files: WorkflowFiles; result: CodeValidationResult }> {
    logger.info('Starting validate-and-fix cycle');

    let currentFiles = files;
    const maxRetries = config.maxRetries ?? 2;

    for (let i = 0; i < maxRetries; i++) {
      // 1. 验证
      const result = await this.validateCode(currentFiles, projectPatterns, bestPractices);

      // 2. 如果通过，直接返回
      if (result.pass) {
        logger.info(`Validation passed on attempt ${i + 1}`);
        return { files: currentFiles, result };
      }

      // 3. 如果是最后一次尝试，返回当前结果
      if (i === maxRetries - 1) {
        logger.warn(`Validation failed after ${maxRetries} attempts`);
        return { files: currentFiles, result };
      }

      // 4. 尝试自动修复
      logger.info(`Validation failed, attempting auto-fix (attempt ${i + 1}/${maxRetries})`);
      currentFiles = await this.autoFix(currentFiles, result.allIssues, config);
    }

    // 理论上不会到这里，但为了类型安全
    const result = await this.validateCode(currentFiles, projectPatterns, bestPractices);
    return { files: currentFiles, result };
  }

  // ========================================================================
  // 私有方法
  // ========================================================================

  /**
   * 验证单个文件
   */
  private async validateSingleFile(
    fileName: string,
    code: string,
    projectPatterns: string,
    bestPractices: string
  ): Promise<FileValidationResult> {
    logger.debug(`Validating file: ${fileName}`);

    // 1. TypeScript 检查
    const tsResult = await this.postProcessor.checkTypeScript(code, fileName);

    // 2. ESLint 检查
    const lintResult = await this.postProcessor.lint(code, fileName);

    // 3. 最佳实践检查（仅对关键文件）
    let bestPracticeResult = { score: 100, issues: [] as BestPracticeIssue[] };
    if (this.isCriticalFile(fileName)) {
      const bpResult = await this.bestPracticeChecker.checkBestPractices(
        code,
        projectPatterns,
        bestPractices
      );
      bestPracticeResult = {
        score: bpResult.score,
        issues: bpResult.issues,
      };
    }

    // 计算综合评分
    let score = 100;
    score -= tsResult.errors.length * 15;
    score -= lintResult.errors.length * 10;
    score -= lintResult.warnings.length * 2;
    score -= (100 - bestPracticeResult.score) * 0.5;
    score = Math.max(0, Math.min(100, score));

    const pass = score >= 70;

    return {
      fileName,
      score,
      pass,
      typescript: {
        success: tsResult.success,
        errors: tsResult.errors.map((e) => `${e.file}:${e.line}:${e.column} - ${e.message}`),
      },
      eslint: {
        success: lintResult.success,
        errors: lintResult.errors,
        warnings: lintResult.warnings,
        fixable: lintResult.fixable,
      },
      bestPractices: bestPracticeResult,
    };
  }

  /**
   * 转换为验证问题列表
   */
  private toValidationIssues(fileName: string, result: FileValidationResult): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // TypeScript 错误
    for (const error of result.typescript.errors) {
      issues.push({
        fileName,
        severity: 'high',
        source: 'typescript',
        message: error,
      });
    }

    // ESLint 错误
    for (const error of result.eslint.errors) {
      issues.push({
        fileName,
        severity: 'high',
        source: 'eslint',
        message: error,
      });
    }

    // ESLint 警告
    for (const warning of result.eslint.warnings) {
      issues.push({
        fileName,
        severity: 'low',
        source: 'eslint',
        message: warning,
      });
    }

    // 最佳实践问题
    for (const issue of result.bestPractices.issues) {
      issues.push({
        fileName,
        severity: issue.severity,
        source: 'bestPractices',
        message: issue.message,
        location: issue.location,
        fixSuggestion: issue.fixSuggestion,
      });
    }

    return issues;
  }

  /**
   * 应用 ESLint 自动修复
   */
  private async applyESLintFix(files: WorkflowFiles): Promise<WorkflowFiles> {
    // 注意：当前 CodePostProcessor 不支持自动修复
    // 这里返回原文件，实际修复在 processAll 中完成
    return files;
  }

  /**
   * 计算统计信息
   */
  private calculateStats(
    fileResults: Record<string, FileValidationResult>,
    allIssues: ValidationIssue[]
  ): ValidationStats {
    const totalFiles = Object.keys(fileResults).length;
    const passedFiles = Object.values(fileResults).filter((r) => r.pass).length;
    const failedFiles = totalFiles - passedFiles;

    const highPriorityIssues = allIssues.filter((i) => i.severity === 'high').length;
    const mediumPriorityIssues = allIssues.filter((i) => i.severity === 'medium').length;
    const lowPriorityIssues = allIssues.filter((i) => i.severity === 'low').length;

    return {
      totalFiles,
      passedFiles,
      failedFiles,
      totalIssues: allIssues.length,
      highPriorityIssues,
      mediumPriorityIssues,
      lowPriorityIssues,
    };
  }

  /**
   * 判断是否为关键文件
   */
  private isCriticalFile(fileName: string): boolean {
    const criticalFiles = ['factory.ts', 'graph.ts', 'state.ts'];
    return criticalFiles.some((cf) => fileName.includes(cf));
  }

  /**
   * 获取文件数量
   */
  private getFileCount(files: WorkflowFiles): number {
    let count = 0;
    if (files.state) count++;
    if (files.routeFunctions) count++;
    if (files.graph) count++;
    if (files.factory) count++;
    if (files.index) count++;
    count += files.nodes.size;
    return count;
  }

  /**
   * 生成验证报告
   */
  generateReport(result: CodeValidationResult): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('Code Validation Report');
    lines.push('='.repeat(80));
    lines.push('');
    lines.push(`Overall Score: ${result.overallScore}/100`);
    lines.push(`Status: ${result.pass ? '✓ PASS' : '✗ FAIL'}`);
    lines.push('');
    lines.push('-'.repeat(80));
    lines.push('Statistics:');
    lines.push(`  Total Files:       ${result.stats.totalFiles}`);
    lines.push(`  Passed:            ${result.stats.passedFiles}`);
    lines.push(`  Failed:            ${result.stats.failedFiles}`);
    lines.push(`  Total Issues:      ${result.stats.totalIssues}`);
    lines.push(`  High Priority:     ${result.stats.highPriorityIssues}`);
    lines.push(`  Medium Priority:   ${result.stats.mediumPriorityIssues}`);
    lines.push(`  Low Priority:      ${result.stats.lowPriorityIssues}`);
    lines.push('-'.repeat(80));
    lines.push('');

    // 显示各文件评分
    lines.push('File Scores:');
    for (const [fileName, fileResult] of Object.entries(result.fileResults)) {
      const status = fileResult.pass ? '✓' : '✗';
      lines.push(`  ${status} ${fileName}: ${fileResult.score}/100`);
    }
    lines.push('');

    // 显示高优先级问题
    const highPriorityIssues = result.allIssues.filter((i) => i.severity === 'high');
    if (highPriorityIssues.length > 0) {
      lines.push('High Priority Issues:');
      highPriorityIssues.forEach((issue, index) => {
        lines.push(`  ${index + 1}. [${issue.fileName}] ${issue.message}`);
        if (issue.location) {
          lines.push(`     Location: ${issue.location}`);
        }
      });
      lines.push('');
    }

    lines.push('='.repeat(80));

    return lines.join('\n');
  }
}

// ============================================================================
// 导出
// ============================================================================

export default AutoValidatorOptimizer;
