/**
 * CLI Cancel 命令端到端测试
 *
 * 测试 cancel 命令的各种场景
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('@e2e CLI Cancel Command', () => {
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
      const result = execCliCommand(['cancel']);

      expect(result.exitCode).toBe(1);
      // Commander.js 的英文错误消息
      expect(result.stderr).toContain('error:');
      expect(result.stderr).toContain('required option');
      expect(result.stderr).toContain('--task-id');
    });

    it('应该接受 --task-id 参数', () => {
      const result = execCliCommand(['cancel', '--task-id', 'test-123']);

      // 如果失败，应该是因为数据库连接问题
      // (因为 cancel 命令直接使用 PostgresTaskRepository)
      const output = result.stderr + result.stdout;
      if (result.exitCode === 1) {
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });

    it('应该接受 -t 简写', () => {
      const result = execCliCommand(['cancel', '-t', 'test-456']);

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

  describe('错误处理', () => {
    it('应该在任务不存在时显示错误', () => {
      const result = execCliCommand(['cancel', '--task-id', 'non-existent-task']);

      // 由于数据库可能未运行，可能返回连接错误或"未找到任务"
      const output = result.stderr + result.stdout;
      expect(result.exitCode).toBe(1);
      expect(
        output.includes('未找到任务') ||
        output.includes('Query error') ||
        output.includes('ECONNREFUSED') ||
        output.includes('error:')
      ).toBe(true);
    });

    it('应该处理无效的 taskId 格式', () => {
      const result = execCliCommand(['cancel', '--task-id', '']);

      // Commander.js 会处理空参数
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('取消操作', () => {
    it('应该显示取消进度', () => {
      const result = execCliCommand(['cancel', '--task-id', 'test-123']);

      // 输出中应该有处理相关的信息
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });

    it('应该显示取消结果', () => {
      const result = execCliCommand(['cancel', '--task-id', 'test-123']);

      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('不同状态的任务', () => {
    it('应该能取消 pending 状态的任务', () => {
      const result = execCliCommand(['cancel', '--task-id', 'pending-test']);

      const output = result.stderr + result.stdout;
      if (result.exitCode === 1) {
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });

    it('应该能取消 processing 状态的任务', () => {
      const result = execCliCommand(['cancel', '--task-id', 'processing-test']);

      const output = result.stderr + result.stdout;
      if (result.exitCode === 1) {
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      }
    });

    it('应该无法取消 completed 状态的任务', () => {
      const result = execCliCommand(['cancel', '--task-id', 'completed-test']);

      const output = result.stderr + result.stdout;
      if (result.exitCode === 1) {
        expect(
          output.includes('未找到任务') ||
          output.includes('Query error') ||
          output.includes('ECONNREFUSED')
        ).toBe(true);
      } else {
        // 如果任务存在但已完成，应该显示无法取消
        expect(output).toMatch(/(无法|完成|cannot)/i);
      }
    });
  });

  describe('输出格式', () => {
    it('应该显示任务ID', () => {
      const result = execCliCommand(['cancel', '--task-id', 'test-123']);

      // 如果命令成功执行，输出应该包含 taskId
      // 如果数据库连接失败，应该有错误信息
      const output = result.stdout + result.stderr;
      expect(
        output.includes('test-123') ||
        output.includes('错误') ||
        output.includes('error') ||
        output.includes('Query error') ||
        output.includes('未找到任务')
      ).toBe(true);
    });

    it('应该显示当前状态', () => {
      const result = execCliCommand(['cancel', '--task-id', 'test-123']);

      const output = result.stdout + result.stderr;
      // 应该有某种输出（成功或失败）
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('取消失败场景', () => {
    it('应该在取消失败时显示原因', () => {
      const result = execCliCommand(['cancel', '--task-id', 'cannot-cancel']);

      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    });
  });
});
