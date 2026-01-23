import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 300000, // 300 秒超时（5分钟 - 真实 LLM API 调用需要更长时间）
    hookTimeout: 60000, // 60 秒钩子超时

    // 测试文件匹配模式
    include: {
      unit: ['tests/**/*.test.ts', '!tests/integration/**', '!tests/performance/**'],
      integration: ['tests/integration/**/*.test.ts'],
      performance: ['tests/performance/**/*.test.ts'],
    },

    // 测试标签配置
    testMatch: ['**/*.test.ts', '**/*.bench.test.ts'],
    includeSource: ['src/**/*.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.bench.test.ts',
        '**/*.config.ts',
        '**/types/**',
        'migrations/**',
      ],
      // 覆盖率阈值
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
      // 每个文件的覆盖率
      perFile: true,
    },

    // 并行配置
    threads: true,
    maxThreads: 4,
    minThreads: 1,

    // 报告器配置
    reporters: ['verbose', 'json'],

    // 输出目录
    outputFile: {
      json: './test-results/results.json',
    },
  },

  // 路径别名
  resolve: {
    alias: {
      '@': '/src',
      '@test': '/tests',
    },
  },
});
