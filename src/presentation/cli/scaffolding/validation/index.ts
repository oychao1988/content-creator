/**
 * Validation Module - 验证模块
 *
 * 导出所有验证相关的组件
 */

// ========== 验证器 ==========
export { BestPracticeChecker } from './BestPracticeChecker.js';
export {
  type BestPracticeResult,
  type BestPracticeIssue,
  type BestPracticeCheckerConfig,
} from './BestPracticeChecker.js';

// ========== 自动验证器和优化器 ==========
export { AutoValidatorOptimizer } from './AutoValidatorOptimizer.js';
export {
  type CodeValidationResult,
  type FileValidationResult,
  type ValidationIssue,
  type ValidationStats,
  type AutoFixConfig,
} from './AutoValidatorOptimizer.js';
