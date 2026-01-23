/**
 * 测试脚本配置
 *
 * 提供各种测试运行命令的配置
 */

export const testScripts = {
  // 快速单元测试 (日常开发)
  'test:unit': 'vitest run --exclude="**/integration/**/*.test.ts" --exclude="**/performance/**/*.test.ts"',

  // 只运行集成测试
  'test:integration': 'vitest run tests/integration',

  // 只运行性能测试
  'test:performance': 'vitest run tests/performance',

  // 运行所有测试
  'test': 'vitest run',

  // 监听模式 (开发时使用)
  'test:watch': 'vitest',

  // 覆盖率报告
  'test:coverage': 'vitest run --coverage',

  // 并行运行测试 (更快)
  'test:parallel': 'vitest run --threads',

  // 显示详细输出
  'test:verbose': 'vitest run --reporter=verbose',

  // 只运行失败的测试
  'test:failures': 'vitest run --reporter=verbose --bail 1',

  // 运行特定测试文件
  'test:file': 'vitest run',

  // UI 模式 (交互式测试界面)
  'test:ui': 'vitest --ui',
} as const;

// package.json 中的脚本配置示例
export const packageJsonScripts = {
  "test": "vitest run",
  "test:unit": "vitest run --exclude=\"**/integration/**/*.test.ts\" --exclude=\"**/performance/**/*.test.ts\"",
  "test:integration": "vitest run tests/integration",
  "test:performance": "vitest run tests/performance",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:ui": "vitest --ui",
  "test:verbose": "vitest run --reporter=verbose",
};
