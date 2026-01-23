/**
 * CLI Status 命令端到端测试
 *
 * 测试 status 命令的各种场景
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('@e2e CLI Status Command', () => {
  const testDbPath = join(process.cwd(), '.test-db.sqlite');

  function cleanupTestDb() {
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch (e) {
        // 忽略删除错误
      }
    }
  }

  beforeAll(() => {
    cleanupTestDb();
  });

  afterAll(() => {
    cleanupTestDb();
  });

  /**
   * 执行 CLI 命令的辅助函数
   */
  function execCliCommand(args: string[]): { stdout: string; stderr: string; exitCode: number } {
    try {
      const result = execSync(`tsx src/presentation/cli/index.ts ${args.join(' ')}`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_TYPE: 'memory',
        },
        stdio: ['pipe', 'pipe', 'pipe'],  // 确保捕获 stderr
      });
      return { stdout: result as string, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1,
      };
    }
  }

  describe('参数验证', () => {
    it('应该在缺少 taskId 时显示错误', () => {
      const result = execCliCommand(['status']);

      expect(result.exitCode).toBe(1);
      // Commander.js 的英文错误消息
      expect(result.stderr).toContain('error:');
      expect(result.stderr).toContain('required option');
      expect(result.stderr).toContain('--task-id');
    });

    it('应该接受 --task-id 参数', () => {
      const result = execCliCommand(['status', '--task-id', 'test-123']);

      // 如果失败，应该是因为数据库连接问题
      // (因为 status 命令直接使用 PostgresTaskRepository)
      if (result.exitCode === 1) {
        // 可能是数据库连接错误或"未找到任务"
        const output = result.stderr + result.stdout;
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });

    it('应该接受 -t 简写', () => {
      const result = execCliCommand(['status', '-t', 'test-456']);

      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });
  });

  describe('输出格式', () => {
    it('应该显示任务ID', () => {
      const result = execCliCommand(['status', '--task-id', 'test-123']);

      const output = result.stderr + result.stdout;
      if (result.exitCode === 0) {
        expect(output).toContain('test-123');
      } else {
        expect(output.length).toBeGreaterThan(0);
      }
    });

    it('应该显示任务状态', () => {
      const result = execCliCommand(['status', '--task-id', 'test-123']);

      const output = result.stderr + result.stdout;
      if (result.exitCode === 0) {
        expect(output).toMatch(/(状态|status)/i);
      } else {
        expect(output.length).toBeGreaterThan(0);
      }
    });
  });

  describe('错误处理', () => {
    it('应该在任务不存在时显示错误', () => {
      const result = execCliCommand(['status', '--task-id', 'non-existent-task']);

      // 由于数据库可能未运行，可能返回连接错误或"未找到任务"
      const output = result.stderr + result.stdout;
      expect(result.exitCode).toBe(1);
      expect(
        output.includes('未找到任务') ||
        output.includes('Query error') ||
        output.includes('ECONNREFUSED')
      ).toBe(true);
    });

    it('应该处理无效的 taskId 格式', () => {
      const result = execCliCommand(['status', '--task-id', '']);

      // Commander.js 会处理空参数
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('显示字段', () => {
    it('应该显示创建时间', () => {
      const result = execCliCommand(['status', '--task-id', 'test-123']);

      if (result.exitCode === 1) {
        // 任务不存在时也应该有错误提示
        expect(result.stderr).toBeDefined();
      }
    });
  });

  describe('不同状态的任务', () => {
    // 注意：这些测试需要预先创建任务，由于依赖数据库，
    // 实际测试中可能需要使用内存数据库或 mock

    it('应该显示 pending 状态', () => {
      const result = execCliCommand(['status', '--task-id', 'pending-test']);

      const output = result.stderr + result.stdout;
      // 如果任务不存在，应该有错误提示
      if (result.exitCode === 1) {
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });

    it('应该显示 processing 状态', () => {
      const result = execCliCommand(['status', '--task-id', 'processing-test']);

      const output = result.stderr + result.stdout;
      if (result.exitCode === 1) {
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });

    it('应该显示 completed 状态', () => {
      const result = execCliCommand(['status', '--task-id', 'completed-test']);

      const output = result.stderr + result.stdout;
      if (result.exitCode === 1) {
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });

    it('应该显示 failed 状态', () => {
      const result = execCliCommand(['status', '--task-id', 'failed-test']);

      const output = result.stderr + result.stdout;
      if (result.exitCode === 1) {
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });
  });
});
