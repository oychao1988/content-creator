/**
 * 硬规则检查器
 *
 * 对内容进行确定性的硬规则验证
 * 包括：字数检查、关键词检查、结构检查、禁用词过滤
 */

import { z } from 'zod';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('HardRuleChecker');

/**
 * 硬约束规则
 */
export interface HardConstraints {
  // 字数限制
  minWords?: number;
  maxWords?: number;

  // 关键词要求
  keywords?: string[];
  requireAllKeywords?: boolean; // true: 需要包含所有关键词, false: 至少包含一个

  // 结构要求
  requireTitle?: boolean;
  requireIntro?: boolean;
  requireConclusion?: boolean;
  requireSections?: boolean;    // 是否需要有分段
  minSections?: number;         // 最少段落数

  // 禁用词过滤
  forbiddenWords?: string[];

  // 特殊格式要求
  hasBulletPoints?: boolean;    // 是否需要包含项目符号
  hasNumberedList?: boolean;    // 是否需要包含编号列表
}

/**
 * 硬规则检查结果
 */
export interface HardRuleCheckResult {
  passed: boolean;
  score: number;  // 硬规则检查只有 0 或 100
  details: {
    wordCount?: {
      count: number;
      min?: number;
      max?: number;
      passed: boolean;
    };
    keywords?: {
      required: string[];
      found: string[];
      missing: string[];
      passed: boolean;
    };
    structure?: {
      hasTitle: boolean;
      hasIntro: boolean;
      hasConclusion: boolean;
      sectionCount: number;
      hasBulletPoints: boolean;
      hasNumberedList: boolean;
      passed: boolean;
    };
    forbiddenWords?: {
      found: string[];
      passed: boolean;
    };
  };
  issues: Array<{
    severity: 'error' | 'warning';
    category: string;
    message: string;
    suggestion?: string;
  }>;
  checkedAt: number;
}

/**
 * 检查选项
 */
export interface CheckOptions {
  locale?: 'zh-CN' | 'en-US';
  wordBoundary?: RegExp;
}

/**
 * 默认检查选项
 */
const defaultOptions: CheckOptions = {
  locale: 'zh-CN',
  wordBoundary: /[\s\u2000-\u206F\u2E00-\u2E7F\\'!"#$%&()*+,\-./:;<=>?@[\]^_`{|}~]+/,
};

/**
 * 硬规则检查器类
 */
export class HardRuleChecker {
  private options: CheckOptions;

  constructor(options?: Partial<CheckOptions>) {
    this.options = { ...defaultOptions, ...options };
  }

  /**
   * 检查内容
   */
  check(content: string, constraints: HardConstraints): HardRuleCheckResult {
    logger.debug('Starting hard rule check', {
      contentLength: content.length,
      constraints,
    });

    const result: HardRuleCheckResult = {
      passed: true,
      score: 100,
      details: {},
      issues: [],
      checkedAt: Date.now(),
    };

    // 1. 字数检查
    const wordCountCheck = this.checkWordCount(content, constraints);
    result.details.wordCount = wordCountCheck;
    if (!wordCountCheck!.passed) {
      result.passed = false;
      result.score = 0;
      result.issues.push({
        severity: 'error',
        category: 'word_count',
        message: this.getWordCountErrorMessage(wordCountCheck!),
        suggestion: this.getWordCountSuggestion(wordCountCheck!),
      });
    }

    // 2. 关键词检查
    if (constraints.keywords && constraints.keywords.length > 0) {
      const keywordCheck = this.checkKeywords(content, constraints);
      result.details.keywords = keywordCheck;
      if (!keywordCheck!.passed) {
        result.passed = false;
        result.score = 0;
        result.issues.push({
          severity: 'error',
          category: 'keywords',
          message: this.getKeywordsErrorMessage(keywordCheck!, constraints),
          suggestion: this.getKeywordsSuggestion(keywordCheck!),
        });
      }
    }

    // 3. 结构检查
    const structureCheck = this.checkStructure(content, constraints);
    result.details.structure = structureCheck;
    if (!structureCheck!.passed) {
      result.passed = false;
      result.score = 0;
      result.issues.push({
        severity: 'error',
        category: 'structure',
        message: this.getStructureErrorMessage(structureCheck!, constraints),
        suggestion: this.getStructureSuggestion(structureCheck!, constraints),
      });
    }

    // 4. 禁用词检查
    if (constraints.forbiddenWords && constraints.forbiddenWords.length > 0) {
      const forbiddenCheck = this.checkForbiddenWords(content, constraints);
      result.details.forbiddenWords = forbiddenCheck;
      if (!forbiddenCheck!.passed) {
        result.passed = false;
        result.score = 0;
        result.issues.push({
          severity: 'error',
          category: 'forbidden_words',
          message: this.getForbiddenWordsErrorMessage(forbiddenCheck!),
          suggestion: this.getForbiddenWordsSuggestion(forbiddenCheck!),
        });
      }
    }

    logger.info('Hard rule check completed', {
      passed: result.passed,
      score: result.score,
      issuesCount: result.issues.length,
    });

    return result;
  }

  /**
   * 检查字数
   */
  private checkWordCount(
    content: string,
    constraints: HardConstraints
  ): HardRuleCheckResult['details']['wordCount'] {
    const count = this.countWords(content);

    let passed = true;
    if (constraints.minWords !== undefined && count < constraints.minWords) {
      passed = false;
    }
    if (constraints.maxWords !== undefined && count > constraints.maxWords) {
      passed = false;
    }

    return {
      count,
      min: constraints.minWords,
      max: constraints.maxWords,
      passed,
    };
  }

  /**
   * 检查关键词
   */
  private checkKeywords(
    content: string,
    constraints: HardConstraints
  ): HardRuleCheckResult['details']['keywords'] {
    const requiredKeywords = constraints.keywords || [];
    const contentLower = content.toLowerCase();

    const found: string[] = [];
    const missing: string[] = [];

    for (const keyword of requiredKeywords) {
      if (contentLower.includes(keyword.toLowerCase())) {
        found.push(keyword);
      } else {
        missing.push(keyword);
      }
    }

    const passed = constraints.requireAllKeywords
      ? missing.length === 0  // 需要包含所有关键词
      : found.length > 0;     // 至少包含一个关键词

    return {
      required: requiredKeywords,
      found,
      missing,
      passed,
    };
  }

  /**
   * 检查结构
   */
  private checkStructure(
    content: string,
    constraints: HardConstraints
  ): HardRuleCheckResult['details']['structure'] {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line);

    // 检查标题（第一行很短或以 # 开头）
    const hasTitle = constraints.requireTitle
      ? lines.length > 0 && (lines[0]!.length < 40 || lines[0]!.startsWith('#'))
      : true;

    // 检查导语（前几段中有一段适中的）
    const hasIntro = constraints.requireIntro
      ? lines.some((line, index) =>
          index < 3 && line!.length > 10 && line!.length < 300
        )
      : true;

    // 检查结尾（最后一段有一定长度）
    const hasConclusion = constraints.requireConclusion
      ? lines.length > 0 && lines[lines.length - 1]!.length > 10
      : true;

    // 检查段落数
    const sectionCount = lines.length;
    const hasEnoughSections = constraints.minSections
      ? sectionCount >= constraints.minSections
      : true;

    // 检查项目符号
    const hasBulletPoints = constraints.hasBulletPoints
      ? /^[\s]*[-*•]\s+/m.test(content)
      : true;

    // 检查编号列表
    const hasNumberedList = constraints.hasNumberedList
      ? /^[\s]*\d+\.\s+/m.test(content)
      : true;

    const passed =
      hasTitle &&
      hasIntro &&
      hasConclusion &&
      hasEnoughSections &&
      hasBulletPoints &&
      hasNumberedList;

    return {
      hasTitle,
      hasIntro,
      hasConclusion,
      sectionCount,
      hasBulletPoints,
      hasNumberedList,
      passed,
    };
  }

  /**
   * 检查禁用词
   */
  private checkForbiddenWords(
    content: string,
    constraints: HardConstraints
  ): HardRuleCheckResult['details']['forbiddenWords'] {
    const forbiddenWords = constraints.forbiddenWords || [];
    const contentLower = content.toLowerCase();

    const found: string[] = [];
    for (const word of forbiddenWords) {
      if (contentLower.includes(word.toLowerCase())) {
        found.push(word);
      }
    }

    return {
      found,
      passed: found.length === 0,
    };
  }

  /**
   * 计算字数
   */
  private countWords(content: string): number {
    if (this.options.locale === 'zh-CN') {
      // 中文：计算字符数（排除空白）
      return content.replace(/\s/g, '').length;
    } else {
      // 英文：计算单词数
      const words = content.split(this.options.wordBoundary!);
      return words.filter(word => word.length > 0).length;
    }
  }

  /**
   * 生成字数错误消息
   */
  private getWordCountErrorMessage(
    check: HardRuleCheckResult['details']['wordCount']
  ): string {
    if (check!.min !== undefined && check!.count < check!.min) {
      return `字数不足：当前 ${check!.count} 字，最少需要 ${check!.min} 字`;
    }
    if (check!.max !== undefined && check!.count > check!.max) {
      return `字数超标：当前 ${check!.count} 字，最多允许 ${check!.max} 字`;
    }
    return '字数不符合要求';
  }

  /**
   * 生成字数建议
   */
  private getWordCountSuggestion(
    check: HardRuleCheckResult['details']['wordCount']
  ): string {
    if (check!.min !== undefined && check!.count < check!.min) {
      return `需要增加至少 ${check!.min - check!.count} 字内容`;
    }
    if (check!.max !== undefined && check!.count > check!.max) {
      return `需要删减至少 ${check!.count - check!.max} 字内容`;
    }
    return '调整内容长度以满足字数要求';
  }

  /**
   * 生成关键词错误消息
   */
  private getKeywordsErrorMessage(
    check: HardRuleCheckResult['details']['keywords'],
    constraints: HardConstraints
  ): string {
    if (constraints.requireAllKeywords) {
      return `缺少关键词：${check!.missing.join('、')}`;
    } else {
      return `至少需要包含以下关键词之一：${check!.required.join('、')}`;
    }
  }

  /**
   * 生成关键词建议
   */
  private getKeywordsSuggestion(
    check: HardRuleCheckResult['details']['keywords']
  ): string {
    return `在内容中添加以下关键词：${check!.missing.join('、')}`;
  }

  /**
   * 生成结构错误消息
   */
  private getStructureErrorMessage(
    check: HardRuleCheckResult['details']['structure'],
    constraints: HardConstraints
  ): string {
    const missing: string[] = [];

    if (constraints.requireTitle && !check!.hasTitle) {
      missing.push('标题');
    }
    if (constraints.requireIntro && !check!.hasIntro) {
      missing.push('导语');
    }
    if (constraints.requireConclusion && !check!.hasConclusion) {
      missing.push('结尾');
    }
    if (constraints.minSections && check!.sectionCount < constraints.minSections) {
      missing.push(`段落数（需要至少${constraints.minSections}段）`);
    }
    if (constraints.hasBulletPoints && !check!.hasBulletPoints) {
      missing.push('项目符号列表');
    }
    if (constraints.hasNumberedList && !check!.hasNumberedList) {
      missing.push('编号列表');
    }

    return `结构不完整：缺少 ${missing.join('、')}`;
  }

  /**
   * 生成结构建议
   */
  private getStructureSuggestion(
    check: HardRuleCheckResult['details']['structure'],
    constraints: HardConstraints
  ): string {
    const suggestions: string[] = [];

    if (constraints.requireTitle && !check!.hasTitle) {
      suggestions.push('添加一个简短的标题');
    }
    if (constraints.requireIntro && !check!.hasIntro) {
      suggestions.push('在开头添加导语段落（50-300字）');
    }
    if (constraints.requireConclusion && !check!.hasConclusion) {
      suggestions.push('在结尾添加总结段落');
    }
    if (constraints.minSections && check!.sectionCount < constraints.minSections) {
      suggestions.push(`增加段落数至至少 ${constraints.minSections} 段`);
    }
    if (constraints.hasBulletPoints && !check!.hasBulletPoints) {
      suggestions.push('添加项目符号列表以增强可读性');
    }
    if (constraints.hasNumberedList && !check!.hasNumberedList) {
      suggestions.push('添加编号列表以组织内容');
    }

    return suggestions.join('；');
  }

  /**
   * 生成禁用词错误消息
   */
  private getForbiddenWordsErrorMessage(
    check: HardRuleCheckResult['details']['forbiddenWords']
  ): string {
    return `内容包含禁用词：${check!.found.join('、')}`;
  }

  /**
   * 生成禁用词建议
   */
  private getForbiddenWordsSuggestion(
    check: HardRuleCheckResult['details']['forbiddenWords']
  ): string {
    return `移除或替换以下禁用词：${check!.found.join('、')}`;
  }

  /**
   * 验证约束规则
   */
  static validateConstraints(constraints: any): HardConstraints {
    const schema = z.object({
      minWords: z.number().int().positive().optional(),
      maxWords: z.number().int().positive().optional(),
      keywords: z.array(z.string()).optional(),
      requireAllKeywords: z.boolean().optional(),
      requireTitle: z.boolean().optional(),
      requireIntro: z.boolean().optional(),
      requireConclusion: z.boolean().optional(),
      requireSections: z.boolean().optional(),
      minSections: z.number().int().positive().optional(),
      forbiddenWords: z.array(z.string()).optional(),
      hasBulletPoints: z.boolean().optional(),
      hasNumberedList: z.boolean().optional(),
    });

    return schema.parse(constraints);
  }
}

/**
 * 硬规则检查器单例
 */
export const hardRuleChecker = new HardRuleChecker();
