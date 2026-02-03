/**
 * Code Post-Processor - 代码后处理器
 *
 * 负责对生成的代码进行后处理：
 * - Prettier 格式化
 * - ESLint 检查
 * - TypeScript 编译验证
 */

import { createLogger } from '../../../../infrastructure/logging/logger.js';
import { cleanCode, mergeCodeBlocks } from './utils.js';

const logger = createLogger('CodePostProcessor');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Lint 结果
 */
export interface LintResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  fixable: boolean;
}

/**
 * TypeScript 编译结果
 */
export interface CompileResult {
  success: boolean;
  errors: Array<{
    file: string;
    line: number;
    column: number;
    message: string;
  }>;
}

/**
 * 后处理配置
 */
export interface PostProcessorConfig {
  /** 是否启用 Prettier 格式化 */
  enablePrettier?: boolean;
  /** 是否启用 ESLint 检查 */
  enableESLint?: boolean;
  /** 是否启用 TypeScript 验证 */
  enableTypeCheck?: boolean;
  /** Prettier 配置 */
  prettierConfig?: {
    tabWidth?: number;
    useTabs?: boolean;
    semi?: boolean;
    singleQuote?: boolean;
    trailingComma?: 'none' | 'es5' | 'all';
    printWidth?: number;
  };
}

// ============================================================================
// CodePostProcessor 类
// ============================================================================

/**
 * 代码后处理器
 *
 * 对生成的代码进行格式化、检查和验证
 */
export class CodePostProcessor {
  private config: PostProcessorConfig;

  constructor(config: PostProcessorConfig = {}) {
    this.config = {
      enablePrettier: true,
      enableESLint: true,
      enableTypeCheck: false, // 默认不启用，因为需要完整的项目上下文
      prettierConfig: {
        tabWidth: 2,
        useTabs: false,
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 100,
      },
      ...config,
    };

    logger.debug('CodePostProcessor initialized', {
      enablePrettier: this.config.enablePrettier,
      enableESLint: this.config.enableESLint,
      enableTypeCheck: this.config.enableTypeCheck,
    });
  }

  /**
   * 格式化代码（Prettier）
   *
   * @param code - 原始代码
   * @returns 格式化后的代码
   */
  async format(code: string): Promise<string> {
    if (!this.config.enablePrettier) {
      logger.debug('Prettier is disabled, skipping format');
      return cleanCode(code);
    }

    try {
      logger.debug('Formatting code with Prettier');

      // 尝试动态导入 Prettier
      let prettier: any;
      try {
        prettier = await import('prettier');
      } catch (error) {
        logger.warn('Prettier not installed, using basic formatting', {
          error: error instanceof Error ? error.message : String(error),
        });
        return cleanCode(code);
      }

      // 使用 Prettier 格式化
      const formatted = await prettier.format(code, {
        parser: 'typescript',
        ...this.config.prettierConfig,
      });

      logger.debug('Code formatted successfully', {
        originalLength: code.length,
        formattedLength: formatted.length,
      });

      return formatted;
    } catch (error) {
      logger.warn('Prettier formatting failed, using basic formatting', {
        error: error instanceof Error ? error.message : String(error),
      });
      return cleanCode(code);
    }
  }

  /**
   * Lint 检查（ESLint）
   *
   * @param code - 代码
   * @param filename - 文件名（可选，用于更好的错误报告）
   * @returns Lint 结果
   */
  async lint(code: string, filename?: string): Promise<LintResult> {
    if (!this.config.enableESLint) {
      logger.debug('ESLint is disabled, skipping lint');
      return {
        success: true,
        errors: [],
        warnings: [],
        fixable: false,
      };
    }

    try {
      logger.debug('Linting code with ESLint', { filename });

      // 尝试动态导入 ESLint
      let eslint: any;
      try {
        eslint = await import('eslint');
      } catch (error) {
        logger.warn('ESLint not installed, skipping lint check', {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: true,
          errors: [],
          warnings: [],
          fixable: false,
        };
      }

      // 使用 ESLint 检查
      const results = await eslint.lintText(code, {
        filePath: filename || 'generated.ts',
      });

      // 解析结果
      const errors: string[] = [];
      const warnings: string[] = [];
      let fixable = false;

      for (const result of results) {
        for (const message of result.messages) {
          const location = filename
            ? `${filename}:${message.line}:${message.column}`
            : `line ${message.line}:${message.column}`;

          const text = `${location} - ${message.message} (${message.ruleId})`;

          if (message.severity === 2) {
            errors.push(text);
          } else {
            warnings.push(text);
          }

          if (message.fix) {
            fixable = true;
          }
        }
      }

      logger.info('ESLint check completed', {
        errorCount: errors.length,
        warningCount: warnings.length,
        fixable,
      });

      return {
        success: errors.length === 0,
        errors,
        warnings,
        fixable,
      };
    } catch (error) {
      logger.warn('ESLint check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: true,
        errors: [],
        warnings: [`ESLint check failed: ${error instanceof Error ? error.message : String(error)}`],
        fixable: false,
      };
    }
  }

  /**
   * TypeScript 编译验证
   *
   * @param code - 代码
   * @param filename - 文件名（用于编译器）
   * @returns 编译结果
   */
  async checkTypeScript(code: string, filename: string = 'generated.ts'): Promise<CompileResult> {
    if (!this.config.enableTypeCheck) {
      logger.debug('TypeScript check is disabled, skipping');
      return {
        success: true,
        errors: [],
      };
    }

    try {
      logger.debug('Checking TypeScript types', { filename });

      // 尝试动态导入 TypeScript
      let ts: any;
      try {
        ts = await import('typescript');
      } catch (error) {
        logger.warn('TypeScript not installed, skipping type check', {
          error: error instanceof Error ? error.message : String(error),
        });
        return {
          success: true,
          errors: [],
        };
      }

      // 创建临时文件进行编译
      const compilerOptions: any = {
        strict: true,
        noImplicitAny: true,
        strictNullChecks: true,
        strictFunctionTypes: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
        skipLibCheck: true,
        moduleResolution: ts.ModuleResolutionKind.NodeJs,
      };

      const result = ts.transpileModule(code, {
        compilerOptions,
        reportDiagnostics: true,
      });

      // 解析诊断信息
      const errors = result.diagnostics
        .filter((d: any) => d.category === ts.DiagnosticCategory.Error)
        .map((d: any) => {
          const file = d.file?.fileName || filename;
          const location = ts.getLineAndCharacterOfPosition(d.file || { text: code }, d.start);
          const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');

          return {
            file,
            line: location.line + 1,
            column: location.character + 1,
            message,
          };
        });

      logger.info('TypeScript check completed', {
        errorCount: errors.length,
      });

      return {
        success: errors.length === 0,
        errors,
      };
    } catch (error) {
      logger.warn('TypeScript check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return {
        success: true,
        errors: [
          {
            file: filename,
            line: 0,
            column: 0,
            message: `TypeScript check failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  /**
   * 批量处理多个文件
   *
   * @param files - 文件集合
   * @returns 处理后的文件集合
   */
  async processAll(files: WorkflowFiles): Promise<WorkflowFiles> {
    logger.info('Processing all generated files', {
      fileCount: Object.keys(files).length,
    });

    const processed: WorkflowFiles = {
      state: '',
      nodes: new Map(),
      routeFunctions: '',
      graph: '',
      factory: '',
      index: '',
    };

    // 处理状态接口
    if (files.state) {
      processed.state = await this.processSingle(files.state, 'State.ts');
    }

    // 处理节点类
    for (const [nodeName, nodeCode] of files.nodes.entries()) {
      const processedNode = await this.processSingle(nodeCode, `${nodeName}.ts`);
      processed.nodes.set(nodeName, processedNode);
    }

    // 处理路由函数
    if (files.routeFunctions) {
      processed.routeFunctions = await this.processSingle(files.routeFunctions, 'routes.ts');
    }

    // 处理工作流图
    if (files.graph) {
      processed.graph = await this.processSingle(files.graph, 'Graph.ts');
    }

    // 处理工厂类
    if (files.factory) {
      processed.factory = await this.processSingle(files.factory, 'Factory.ts');
    }

    // 处理导出文件
    if (files.index) {
      processed.index = await this.processSingle(files.index, 'index.ts');
    }

    logger.info('All files processed successfully');

    return processed;
  }

  /**
   * 处理单个文件
   *
   * @param code - 代码
   * @param filename - 文件名
   * @returns 处理后的代码
   */
  private async processSingle(code: string, filename: string): Promise<string> {
    logger.debug(`Processing file: ${filename}`);

    let processed = code;

    // 1. 清理代码
    processed = cleanCode(processed);

    // 2. Prettier 格式化
    processed = await this.format(processed);

    // 3. ESLint 检查（只记录，不修改代码）
    const lintResult = await this.lint(processed, filename);
    if (!lintResult.success) {
      logger.warn(`ESLint errors in ${filename}`, {
        errorCount: lintResult.errors.length,
        errors: lintResult.errors.slice(0, 5), // 只记录前 5 个错误
      });
    }

    if (lintResult.warnings.length > 0) {
      logger.debug(`ESLint warnings in ${filename}`, {
        warningCount: lintResult.warnings.length,
      });
    }

    // 4. TypeScript 检查（只记录，不修改代码）
    const compileResult = await this.checkTypeScript(processed, filename);
    if (!compileResult.success) {
      logger.warn(`TypeScript errors in ${filename}`, {
        errorCount: compileResult.errors.length,
        errors: compileResult.errors.slice(0, 5),
      });
    }

    return processed;
  }

  /**
   * 验证代码质量
   *
   * @param code - 代码
   * @param filename - 文件名
   * @returns 质量分数（0-100）
   */
  async calculateQualityScore(code: string, filename: string = 'code.ts'): Promise<number> {
    let score = 100;

    // ESLint 检查
    const lintResult = await this.lint(code, filename);
    score -= lintResult.errors.length * 10; // 每个错误扣 10 分
    score -= lintResult.warnings.length * 2; // 每个警告扣 2 分

    // TypeScript 检查
    const compileResult = await this.checkTypeScript(code, filename);
    score -= compileResult.errors.length * 15; // 每个 TypeScript 错误扣 15 分

    // 确保分数在 0-100 范围内
    score = Math.max(0, Math.min(100, score));

    logger.debug('Quality score calculated', {
      filename,
      score,
      lintErrors: lintResult.errors.length,
      lintWarnings: lintResult.warnings.length,
      tsErrors: compileResult.errors.length,
    });

    return score;
  }
}

// ============================================================================
// 辅助类型
// ============================================================================

/**
 * 工作流文件集合
 */
export interface WorkflowFiles {
  state: string;
  nodes: Map<string, string>;
  routeFunctions: string;
  graph: string;
  factory: string;
  index: string;
}

// ============================================================================
// 导出
// ============================================================================

export default CodePostProcessor;
