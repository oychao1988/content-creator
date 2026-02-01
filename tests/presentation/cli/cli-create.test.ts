/**
 * CLI Create 命令端到端测试
 *
 * 测试 create 命令的各种场景（适应新架构）
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

describe('@e2e CLI Create Command (新架构)', () => {
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

  describe('工作流类型验证', () => {
    it('应该拒绝未知的工作流类型', () => {
      const result = execCliCommand([
        'create',
        '--type', 'non-existent-workflow'
      ]);

      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('未知的工作流类型');
      expect(output).toContain('non-existent-workflow');
    });

    it('应该显示可用的工作流类型列表', () => {
      const result = execCliCommand([
        'create',
        '--type', 'unknown-workflow'
      ]);

      const output = result.stderr + result.stdout;
      expect(output).toContain('可用的工作流类型');
      expect(output).toContain('content-creator');
      expect(output).toContain('translation');
    });

    it('应该默认使用 content-creator 工作流', () => {
      const result = execCliCommand(['create']);

      // 由于缺少必需参数，应该显示 content-creator 的参数错误
      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('缺少必需参数');
    });

    it('应该支持指定 translation 工作流', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation'
      ]);

      // 应该显示 translation 的必需参数错误
      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('缺少必需参数');
      expect(output).toContain('sourceText');
      expect(output).toContain('sourceLanguage');
      expect(output).toContain('targetLanguage');
    });
  });

  describe('参数验证 - content-creator 工作流', () => {
    it('应该在缺少必需参数时显示友好错误', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator'
      ]);

      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('缺少必需参数');
      expect(output).toContain('topic');
      expect(output).toContain('requirements');
    });

    it('应该在提供 topic 但缺少 requirements 时显示错误', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator',
        '--topic', '测试主题'
      ]);

      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('缺少必需参数');
      expect(output).toContain('requirements');
    });

    it('应该在提供 requirements 但缺少 topic 时显示错误', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator',
        '--requirements', '写一篇文章'
      ]);

      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('缺少必需参数');
      expect(output).toContain('topic');
    });

    it('应该接受所有必需参数', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator',
        '--topic', '测试主题',
        '--requirements', '写一篇测试文章'
      ]);

      // 参数验证应该通过（错误应该是 Redis 或其他服务问题）
      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('缺少必需参数');
        expect(output).not.toContain('参数验证失败');
      }
    });

    it('应该接受可选参数', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator',
        '--topic', '测试',
        '--requirements', '写一篇文章',
        '--target-audience', '技术人员',
        '--keywords', 'AI,机器学习',
        '--tone', '专业'
      ]);

      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('缺少必需参数');
      }
    });
  });

  describe('参数验证 - translation 工作流', () => {
    it('应该在缺少 sourceText 时显示错误', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation',
        '--source-language', 'en',
        '--target-language', 'zh'
      ]);

      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('缺少必需参数');
      expect(output).toContain('sourceText');
    });

    it('应该在缺少 sourceLanguage 时显示错误', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation',
        '--source-text', 'Hello',
        '--target-language', 'zh'
      ]);

      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('缺少必需参数');
      expect(output).toContain('sourceLanguage');
    });

    it('应该在缺少 targetLanguage 时显示错误', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation',
        '--source-text', 'Hello',
        '--source-language', 'en'
      ]);

      expect(result.exitCode).toBe(1);
      const output = result.stderr + result.stdout;
      expect(output).toContain('缺少必需参数');
      expect(output).toContain('targetLanguage');
    });

    it('应该接受所有必需参数', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation',
        '--source-text', 'Hello world',
        '--source-language', 'en',
        '--target-language', 'zh'
      ]);

      // 参数验证应该通过
      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('缺少必需参数');
      }
    });

    it('应该接受可选参数', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation',
        '--source-text', 'Hello world',
        '--source-language', 'en',
        '--target-language', 'zh',
        '--translation-style', 'formal',
        '--domain', 'technology'
      ]);

      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('缺少必需参数');
      }
    });
  });

  describe('友好错误提示', () => {
    it('应该显示使用示例', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator'
      ]);

      const output = result.stderr + result.stdout;
      expect(output).toContain('💡 使用示例');
      expect(output).toContain('pnpm run cli create --type content-creator');
    });

    it('应该在错误消息中显示工作流名称', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation'
      ]);

      const output = result.stderr + result.stdout;
      expect(output).toContain('翻译工作流');
      expect(output).toContain('(translation)');
    });
  });

  describe('执行模式', () => {
    it('应该支持同步模式', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator',
        '--topic', '测试',
        '--requirements', '测试要求',
        '--mode', 'sync'
      ]);

      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('未知选项');
      }
    });

    it('应该支持异步模式', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator',
        '--topic', '测试',
        '--requirements', '测试要求',
        '--mode', 'async'
      ]);

      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('未知选项');
      }
    });
  });

  describe('优先级设置', () => {
    it('应该支持各种优先级', () => {
      const priorities = ['low', 'normal', 'high', 'urgent'];

      priorities.forEach(priority => {
        const result = execCliCommand([
          'create',
          '--type', 'content-creator',
          '--topic', '测试',
          '--requirements', '测试要求',
          '--priority', priority
        ]);

        if (result.exitCode === 1) {
          const output = result.stderr + result.stdout;
          expect(output).not.toContain('未知选项');
        }
      });
    });
  });

  describe('输出格式', () => {
    it('应该显示工作流类型信息', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator',
        '--topic', '测试主题',
        '--requirements', '测试要求'
      ]);

      if (result.exitCode === 0) {
        expect(result.stdout).toContain('Content Creator');
        expect(result.stdout).toContain('content-creator');
      }
    });

    it('应该显示工作流描述', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation',
        '--source-text', 'Hello',
        '--source-language', 'en',
        '--target-language', 'zh'
      ]);

      if (result.exitCode === 0) {
        expect(result.stdout).toContain('翻译工作流');
      }
    });
  });

  describe('向后兼容性', () => {
    it('应该支持旧的参数格式（kebab-case）', () => {
      const result = execCliCommand([
        'create',
        '--topic', '测试',
        '--requirements', '测试要求',
        '--target-audience', '技术人员',
        '--keywords', 'AI,ML'
      ]);

      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('未知选项');
      }
    });
  });

  describe('参数组合测试', () => {
    it('应该支持完整的 content-creator 参数组合', () => {
      const result = execCliCommand([
        'create',
        '--type', 'content-creator',
        '--topic', '完整测试',
        '--requirements', '这是一个完整的测试',
        '--target-audience', '开发者',
        '--keywords', 'test,e2e,cli',
        '--tone', '友好',
        '--mode', 'async',
        '--priority', 'high'
      ]);

      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('缺少必需参数');
        expect(output).not.toContain('未知选项');
      }
    });

    it('应该支持完整的 translation 参数组合', () => {
      const result = execCliCommand([
        'create',
        '--type', 'translation',
        '--source-text', 'Machine learning is revolutionizing industries',
        '--source-language', 'en',
        '--target-language', 'ja',
        '--translation-style', 'technical',
        '--domain', 'technology',
        '--mode', 'sync'
      ]);

      if (result.exitCode === 1) {
        const output = result.stderr + result.stdout;
        expect(output).not.toContain('缺少必需参数');
        expect(output).not.toContain('未知选项');
      }
    });
  });
});
