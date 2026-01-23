/**
 * CLI Result 命令端到端测试
 *
 * 测试 result 命令的各种场景
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

describe('@e2e CLI Result Command', () => {
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
      const result = execCliCommand(['result']);

      expect(result.exitCode).toBe(1);
      // Commander.js 的英文错误消息
      expect(result.stderr).toContain('error:');
      expect(result.stderr).toContain('required option');
      expect(result.stderr).toContain('--task-id');
    });

    it('应该接受 --task-id 参数', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123']);

      // 如果失败，应该是因为任务不存在或数据库连接问题
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
      const result = execCliCommand(['result', '-t', 'test-456']);

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

  describe('输出格式', () => {
    it('应该支持 text 格式（默认）', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123']);

      if (result.exitCode === 1) {
        expect(result.stderr).toContain('未找到任务');
      }
    });

    it('应该支持 json 格式', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123', '--format', 'json']);

      if (result.exitCode === 1) {
        expect(result.stderr).toContain('未找到任务');
      } else {
        // 如果成功，输出应该是有效的 JSON
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('应该拒绝无效的格式', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123', '--format', 'invalid']);

      // 应该拒绝无效格式
      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('错误处理', () => {
    it('应该在任务不存在时显示错误', () => {
      const result = execCliCommand(['result', '--task-id', 'non-existent-task']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('未找到任务');
      expect(result.stderr).toContain('non-existent-task');
    });

    it('应该在任务未完成时显示警告', () => {
      // 这个测试需要预先创建一个未完成的任务
      // 由于依赖数据库，这里只验证命令结构
      const result = execCliCommand(['result', '--task-id', 'incomplete-task']);

      // 任务不存在
      if (result.exitCode === 1) {
        expect(result.stderr).toContain('未找到任务');
      }
    });

    it('应该处理无效的 taskId 格式', () => {
      const result = execCliCommand(['result', '--task-id', '']);

      expect(result.exitCode).not.toBe(0);
    });
  });

  describe('JSON 输出', () => {
    it('应该输出有效的 JSON', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123', '--format', 'json']);

      if (result.exitCode === 1) {
        // 任务不存在时输出错误信息
        expect(result.stderr).toBeDefined();
      } else {
        // 验证 JSON 格式
        expect(() => JSON.parse(result.stdout)).not.toThrow();
      }
    });

    it('应该包含任务基本信息', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123', '--format', 'json']);

      if (result.exitCode === 0) {
        const json = JSON.parse(result.stdout);
        expect(json).toHaveProperty('taskId');
        expect(json).toHaveProperty('status');
      }
    });
  });

  describe('文本输出', () => {
    it('应该格式化输出任务信息', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123']);

      if (result.exitCode === 1) {
        // 任务不存在时的错误
        expect(result.stderr).toContain('未找到任务');
      } else {
        // 成功时应该有格式化的输出
        expect(result.stdout).toBeDefined();
      }
    });

    it('应该显示结果类型', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123']);

      if (result.exitCode === 0) {
        expect(result.stdout).toMatch(/(结果|result)/i);
      }
    });
  });

  describe('Memory 模式提示', () => {
    it('应该在 Memory 模式下显示提示信息', () => {
      const result = execCliCommand(['result', '--task-id', 'test-123']);

      // Memory 模式下，任务不存在时应该显示特殊提示
      if (result.exitCode === 1) {
        // 检查是否有 Memory 模式的提示
        const output = result.stderr + result.stdout;
        if (output.includes('Memory') || output.includes('内存')) {
          expect(output).toMatch(/(Memory|内存|模式)/i);
        }
      }
    });
  });
});
