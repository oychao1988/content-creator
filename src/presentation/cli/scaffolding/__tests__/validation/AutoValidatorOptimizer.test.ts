/**
 * AutoValidatorOptimizer Tests - 自动验证器和优化器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AutoValidatorOptimizer } from '../../validation/AutoValidatorOptimizer.js';
import type { ILLMService } from '../../../../../services/llm/ILLMService.js';
import type { WorkflowFiles } from '../../codegen/CodePostProcessor.js';
import { promises as fs } from 'fs';
import path from 'path';

// Mock LLM Service
const mockLLMService: ILLMService = {
  chat: vi.fn().mockResolvedValue({
    content: JSON.stringify({
      summary: {
        overallScore: 85,
        pass: true,
        passThreshold: 70,
      },
      dimensions: {
        typeSafety: {
          score: 90,
          issues: [],
          suggestions: [],
        },
        codeStyle: {
          score: 85,
          issues: [],
          suggestions: ['建议添加更多注释'],
        },
        bestPractices: {
          score: 80,
          issues: [],
          suggestions: [],
        },
        performance: {
          score: 95,
          issues: [],
          suggestions: [],
        },
        maintainability: {
          score: 88,
          issues: [],
          suggestions: [],
        },
        errorHandling: {
          score: 75,
          issues: [],
          suggestions: ['建议添加更多错误处理'],
        },
      },
      criticalIssues: [],
      improvements: [],
      autoFixable: [],
    }),
    usage: {
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
    },
  }),
  healthCheck: vi.fn().mockResolvedValue(true),
  estimateTokens: vi.fn().mockReturnValue(100),
  estimateCost: vi.fn().mockReturnValue(0.001),
};

describe('AutoValidatorOptimizer', () => {
  let validator: AutoValidatorOptimizer;

  beforeEach(() => {
    vi.clearAllMocks();
    validator = new AutoValidatorOptimizer(mockLLMService);
  });

  describe('validateCode', () => {
    it('should validate code successfully', async () => {
      // Arrange
      const files: WorkflowFiles = {
        state: 'export interface TestState {}',
        nodes: new Map([['TestNode', 'export class TestNode {}']]),
        routeFunctions: '',
        graph: '',
        factory: '',
        index: '',
      };

      const projectPatterns = 'Test patterns';
      const bestPractices = 'Test best practices';

      // Act
      const result = await validator.validateCode(files, projectPatterns, bestPractices);

      // Assert
      expect(result).toBeDefined();
      expect(result.overallScore).toBeGreaterThan(0);
      expect(result.pass).toBeDefined();
      expect(result.fileResults).toBeDefined();
      expect(result.allIssues).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it('should handle multiple files', async () => {
      // Arrange
      const files: WorkflowFiles = {
        state: 'export interface State {}',
        nodes: new Map([
          ['Node1', 'class Node1 {}'],
          ['Node2', 'class Node2 {}'],
        ]),
        routeFunctions: 'export function routes() {}',
        graph: 'export const graph = {}',
        factory: 'class Factory {}',
        index: 'export * from index',
      };

      // Act
      const result = await validator.validateCode(files, 'patterns', 'practices');

      // Assert
      expect(result.stats.totalFiles).toBeGreaterThan(1);
      expect(Object.keys(result.fileResults).length).toBeGreaterThan(1);
    });

    it('should calculate correct statistics', async () => {
      // Arrange
      const files: WorkflowFiles = {
        state: 'interface State {}',
        nodes: new Map([['Test', 'class Test {}']]),
        routeFunctions: '',
        graph: '',
        factory: '',
        index: '',
      };

      // Act
      const result = await validator.validateCode(files, 'patterns', 'practices');

      // Assert
      expect(result.stats.totalFiles).toBeDefined();
      expect(result.stats.passedFiles + result.stats.failedFiles).toBe(result.stats.totalFiles);
      expect(result.stats.totalIssues).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateAndFix', () => {
    it('should validate and fix code', async () => {
      // Arrange
      const files: WorkflowFiles = {
        state: 'interface State {}',
        nodes: new Map([['Test', 'class Test {}']]),
        routeFunctions: '',
        graph: '',
        factory: '',
        index: '',
      };

      // Act
      const { files: fixedFiles, result } = await validator.validateAndFix(
        files,
        'patterns',
        'practices',
        {
          enableESLintFix: true,
          maxRetries: 1,
        }
      );

      // Assert
      expect(fixedFiles).toBeDefined();
      expect(result).toBeDefined();
      expect(result.overallScore).toBeGreaterThanOrEqual(0);
    });

    it('should retry validation on failure', async () => {
      // Arrange
      const files: WorkflowFiles = {
        state: 'interface State {}',
        nodes: new Map([['Test', 'class Test {}']]),
        routeFunctions: '',
        graph: '',
        factory: '',
        index: '',
      };

      // Act
      const { result } = await validator.validateAndFix(files, 'patterns', 'practices', {
        maxRetries: 2,
      });

      // Assert
      expect(result).toBeDefined();
      // Should have attempted validation
      expect(mockLLMService.chat).toHaveBeenCalled();
    });
  });

  describe('generateReport', () => {
    it('should generate validation report', () => {
      // Arrange
      const validationResult = {
        overallScore: 85,
        pass: true,
        fileResults: {
          'test.ts': {
            fileName: 'test.ts',
            score: 85,
            pass: true,
            typescript: { success: true, errors: [] },
            eslint: { success: true, errors: [], warnings: [], fixable: false },
            bestPractices: { score: 85, issues: [] },
          },
        },
        allIssues: [],
        stats: {
          totalFiles: 1,
          passedFiles: 1,
          failedFiles: 0,
          totalIssues: 0,
          highPriorityIssues: 0,
          mediumPriorityIssues: 0,
          lowPriorityIssues: 0,
        },
      };

      // Act
      const report = validator.generateReport(validationResult);

      // Assert
      expect(report).toContain('Code Validation Report');
      expect(report).toContain('85/100');
      expect(report).toContain('PASS');
    });
  });
});
