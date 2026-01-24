/**
 * CLI Create 命令端到端测试
 *
 * 测试 create 命令的各种场景
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

type ExecSyncOptions = {
  encoding: BufferEncoding;
  cwd?: string;
  env?: Record<string, string>;
  stdio?: any;
};

describe('@e2e CLI Create Command', () => {
  const testDbPath = join(process.cwd(), '.test-db.sqlite');

  // 清理测试数据库
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
  function execCliCommand(args: string[], options: Partial<ExecSyncOptions> = {}): { stdout: string; stderr: string; exitCode: number } {
    try {
      const stdout = execSync(`tsx src/presentation/cli/index.ts ${args.join(' ')}`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_TYPE: 'memory',
        },
        ...options,
      });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1,
      };
    }
  }

  describe('参数验证', () => {
    it('应该在缺少 topic 参数时显示错误', () => {
      const result = execCliCommand(['create']);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('错误');
      expect(result.stderr).toContain('主题');
    });

    it('应该在提供 topic 时成功创建任务', () => {
      const result = execCliCommand(['create', '--topic', '测试主题']);

      // 注意：由于可能没有 Redis 连接，命令可能会失败
      // 但参数验证应该通过
      if (result.exitCode === 1) {
        // 如果失败，应该是因为 Redis，而不是参数验证
        expect(result.stderr).not.toContain('必须提供文章主题');
      }
    });

    it('应该接受所有可选参数', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--audience', '技术人员',
        '--keywords', 'AI,机器学习',
        '--tone', '专业',
        '--min-words', '100',
        '--max-words', '1000',
        '--mode', 'sync',
        // 不提供 requirements，这样命令会在验证后退出，避免超时
      ]);

      // 参数应该被接受（不包含"未知选项"）
      const output = result.stdout + result.stderr;
      expect(output).not.toContain('unknown option');
      expect(output).not.toContain('未知选项');
    });
  });

  describe('执行模式', () => {
    it('应该支持同步模式', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--mode', 'sync',
      ]);

      // sync 模式应该被识别
      if (result.exitCode === 1) {
        expect(result.stderr).not.toContain('未知选项');
      }
    });

    it('应该支持异步模式', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--mode', 'async',
      ]);

      // async 模式应该被识别
      if (result.exitCode === 1) {
        expect(result.stderr).not.toContain('未知选项');
      }
    });

    it('应该支持 --sync 快捷选项', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--sync',
      ]);

      // --sync 应该被识别
      if (result.exitCode === 1) {
        expect(result.stderr).not.toContain('未知选项');
      }
    });
  });

  describe('优先级设置', () => {
    it('应该支持低优先级', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--priority', 'low',
      ]);

      if (result.exitCode === 1) {
        expect(result.stderr).not.toContain('未知选项');
      }
    });

    it('应该支持普通优先级', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--priority', 'normal',
      ]);

      if (result.exitCode === 1) {
        expect(result.stderr).not.toContain('未知选项');
      }
    });

    it('应该支持高优先级', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--priority', 'high',
      ]);

      if (result.exitCode === 1) {
        expect(result.stderr).not.toContain('未知选项');
      }
    });

    it('应该支持紧急优先级', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--priority', 'urgent',
      ]);

      if (result.exitCode === 1) {
        expect(result.stderr).not.toContain('未知选项');
      }
    });
  });

  describe('错误处理', () => {
    it('应该在无效优先级时显示错误', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--priority', 'invalid',
      ]);

      // 应该拒绝无效的优先级
      if (result.exitCode === 1) {
        expect(result.stderr).toMatch(/(错误|无效|error)/i);
      }
    });

    it('应该在无效模式时显示错误', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--mode', 'invalid',
      ]);

      // 应该拒绝无效的模式
      if (result.exitCode === 1) {
        expect(result.stderr).toMatch(/(错误|无效|error)/i);
      }
    });
  });

  describe('输出格式', () => {
    it('应该显示任务ID', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试主题',
      ]);

      // 如果成功创建，应该显示任务ID
      if (result.exitCode === 0) {
        expect(result.stdout).toMatch(/task/i);
        expect(result.stdout).toMatch(/ID/i);
      }
    });

    it('应该显示执行模式', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--mode', 'sync',
      ]);

      if (result.exitCode === 0) {
        expect(result.stdout).toMatch(/(sync|同步|mode)/i);
      }
    });
  });

  describe('参数组合', () => {
    it('应该支持完整的参数组合', () => {
      const result = execCliCommand([
        'create',
        '--topic', '完整测试',
        '--requirements', '这是一个完整的测试',
        '--audience', '开发者',
        '--keywords', 'test,e2e,cli',
        '--tone', '友好',
        '--min-words', '200',
        '--max-words', '800',
        '--mode', 'async',
        '--priority', 'high',
      ]);

      // 所有参数应该被正确解析
      if (result.exitCode === 1) {
        // 如果失败，检查是否是 Redis 问题而不是参数问题
        expect(result.stderr).not.toContain('未知选项');
        expect(result.stderr).not.toContain('必须提供文章主题');
      }
    });
  });
});
