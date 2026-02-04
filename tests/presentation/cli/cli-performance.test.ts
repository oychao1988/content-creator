/**
 * CLI 性能和压力测试
 *
 * 测试目标：
 * 1. 命令响应时间基准测试
 *    - create 命令 < 1 秒
 *    - status/result 命令 < 500ms
 *    - list 命令 < 500ms
 * 2. 并发任务创建测试（同时创建 10 个任务）
 * 3. 大数据量查询测试（创建 100 个任务，测试 list 命令性能）
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync, unlinkSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

type ExecSyncOptions = {
  encoding: BufferEncoding;
  cwd?: string;
  env?: Record<string, string>;
  stdio?: any;
  timeout?: number;
};

describe('@performance CLI Performance Tests', () => {
  const testDbPath = join(process.cwd(), '.test-db-perf.sqlite');
  const performanceLogPath = join(process.cwd(), '.test-performance.json');

  // 性能基准（毫秒）
  const BENCHMARKS = {
    createCommand: 1000,      // create 命令应该在 1 秒内完成
    queryCommand: 500,        // status/result 命令应该在 500ms 内完成
    listCommand: 500,         // list 命令应该在 500ms 内完成
    concurrentCreation: 5000, // 并发创建 10 个任务应该在 5 秒内完成
    largeDatasetQuery: 1000,  // 查询 100 个任务应该在 1 秒内完成
  };

  // 性能测试结果
  const performanceResults: Array<{
    test: string;
    duration: number;
    benchmark: number;
    passed: boolean;
    details?: any;
  }> = [];

  function recordPerformance(test: string, duration: number, benchmark: number, details?: any) {
    const result = {
      test,
      duration,
      benchmark,
      passed: duration <= benchmark,
      details,
    };
    performanceResults.push(result);

    // 输出到控制台
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} ${test}: ${duration}ms (benchmark: ${benchmark}ms)`);

    if (details) {
      console.log(`    Details: ${JSON.stringify(details)}`);
    }
  }

  // 清理测试数据库
  function cleanupTestDb() {
    if (existsSync(testDbPath)) {
      try {
        unlinkSync(testDbPath);
      } catch (e) {
        // 忽略删除错误
      }
    }
    if (existsSync(performanceLogPath)) {
      try {
        unlinkSync(performanceLogPath);
      } catch (e) {
        // 忽略删除错误
      }
    }
  }

  beforeAll(() => {
    cleanupTestDb();
    console.log('\n🚀 开始 CLI 性能测试\n');
    console.log('='.repeat(60));
  });

  afterAll(() => {
    // 保存性能测试结果
    const summary = {
      timestamp: new Date().toISOString(),
      totalTests: performanceResults.length,
      passed: performanceResults.filter(r => r.passed).length,
      failed: performanceResults.filter(r => !r.passed).length,
      results: performanceResults,
    };

    try {
      writeFileSync(performanceLogPath, JSON.stringify(summary, null, 2));
      console.log('\n' + '='.repeat(60));
      console.log(`📊 性能测试完成！结果已保存到: ${performanceLogPath}`);
      console.log(`总计: ${summary.totalTests} 个测试`);
      console.log(`通过: ${summary.passed} | 失败: ${summary.failed}`);
      console.log('='.repeat(60) + '\n');
    } catch (e) {
      console.error('保存性能测试结果失败:', e);
    }

    cleanupTestDb();
  });

  /**
   * 执行 CLI 命令的辅助函数
   */
  function execCliCommand(args: string[], options: Partial<ExecSyncOptions> = {}): { stdout: string; stderr: string; exitCode: number } {
    try {
      const startTime = Date.now();
      const stdout = execSync(`tsx src/presentation/cli/index.ts ${args.join(' ')}`, {
        encoding: 'utf-8',
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          DATABASE_TYPE: 'memory',
        },
        timeout: 30000, // 30 秒超时
        ...options,
      });
      const duration = Date.now() - startTime;
      return { stdout, stderr: '', exitCode: 0, duration };
    } catch (error: any) {
      const duration = error.duration || 0;
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.status || 1,
        duration,
      };
    }
  }

  describe('命令响应时间基准测试', () => {
    it('create 命令应该在 1 秒内完成（参数验证）', () => {
      const iterations = 5;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand([
          'create',
          '--type', 'content-creator',
          '--topic', `性能测试主题 ${i}`,
          '--requirements', '性能测试要求'
        ]);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);

      recordPerformance(
        'create 命令平均响应时间',
        avgDuration,
        BENCHMARKS.createCommand,
        { iterations, min: minDuration, max: maxDuration }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.createCommand);
    });

    it('status 命令应该在 500ms 内完成', () => {
      // 先创建一个任务
      execCliCommand([
        'create',
        '--type', 'content-creator',
        '--topic', '状态测试',
        '--requirements', '测试'
      ]);

      // 提取任务 ID（假设是第一个创建的任务）
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = execCliCommand(['status', '--task-id', 'task-1']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      recordPerformance(
        'status 命令平均响应时间',
        avgDuration,
        BENCHMARKS.queryCommand,
        { iterations, samples: durations.length }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.queryCommand);
    });

    it('list 命令应该在 500ms 内完成（空列表）', () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand(['list']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      recordPerformance(
        'list 命令平均响应时间（空列表）',
        avgDuration,
        BENCHMARKS.listCommand,
        { iterations }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.listCommand);
    });

    it('result 命令应该在 500ms 内完成', () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const result = execCliCommand(['result', '--task-id', 'task-1']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      recordPerformance(
        'result 命令平均响应时间',
        avgDuration,
        BENCHMARKS.queryCommand,
        { iterations }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.queryCommand);
    });
  });

  describe('并发任务创建测试', () => {
    it('应该能够同时创建 10 个任务（并发测试）', async () => {
      const concurrentTasks = 10;
      const taskPromises: Promise<any>[] = [];

      console.log(`\n  📊 并发创建 ${concurrentTasks} 个任务...`);

      const startTime = Date.now();

      for (let i = 0; i < concurrentTasks; i++) {
        const promise = execAsync(
          `tsx src/presentation/cli/index.ts create --type content-creator --topic "并发测试 ${i}" --requirements "测试并发性能"`,
          {
            encoding: 'utf-8',
            cwd: process.cwd(),
            env: {
              ...process.env,
              NODE_ENV: 'test',
              DATABASE_TYPE: 'memory',
            },
            timeout: 30000,
          }
        );
        taskPromises.push(promise);
      }

      try {
        const results = await Promise.allSettled(taskPromises);
        const duration = Date.now() - startTime;

        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;

        recordPerformance(
          `并发创建 ${concurrentTasks} 个任务`,
          duration,
          BENCHMARKS.concurrentCreation,
          { successful, failed, avgPerTask: duration / concurrentTasks }
        );

        expect(duration).toBeLessThan(BENCHMARKS.concurrentCreation);
        expect(successful).toBeGreaterThan(0); // 至少有一些任务成功
      } catch (error: any) {
        console.error('并发测试失败:', error);
        throw error;
      }
    });

    it('应该能够在 3 秒内创建 5 个任务（快速连续创建）', () => {
      const taskCount = 5;
      const durations: number[] = [];

      for (let i = 0; i < taskCount; i++) {
        const startTime = Date.now();
        execCliCommand([
          'create',
          '--type', 'content-creator',
          '--topic', `快速创建 ${i}`,
          '--requirements', '测试'
        ]);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const totalDuration = durations.reduce((a, b) => a + b, 0);
      const avgDuration = totalDuration / taskCount;

      recordPerformance(
        `快速连续创建 ${taskCount} 个任务`,
        totalDuration,
        3000,
        { taskCount, avgPerTask: avgDuration }
      );

      expect(totalDuration).toBeLessThan(3000);
    });
  });

  describe('大数据量查询测试', () => {
    it('应该在 1 秒内查询 100 个任务', () => {
      console.log('\n  📊 创建 100 个任务进行查询性能测试...');

      // 批量创建任务
      const taskCount = 100;
      for (let i = 0; i < taskCount; i++) {
        execCliCommand([
          'create',
          '--type', 'content-creator',
          '--topic', `大数据量测试 ${i}`,
          '--requirements', '测试'
        ]);
      }

      // 测试 list 命令性能
      const iterations = 5;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand(['list', '--limit', '100']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const minDuration = Math.min(...durations);

      recordPerformance(
        `list 命令查询 ${taskCount} 个任务`,
        avgDuration,
        BENCHMARKS.largeDatasetQuery,
        { iterations, min: minDuration, taskCount }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.largeDatasetQuery);
    });

    it('应该在 1 秒内使用过滤器查询任务', () => {
      const iterations = 5;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand(['list', '--status', 'pending']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      recordPerformance(
        'list 命令使用状态过滤器',
        avgDuration,
        BENCHMARKS.largeDatasetQuery,
        { iterations, filter: 'status=pending' }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.largeDatasetQuery);
    });

    it('应该在 1 秒内使用限制参数查询任务', () => {
      const iterations = 5;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand(['list', '--limit', '50']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      recordPerformance(
        'list 命令使用限制参数',
        avgDuration,
        BENCHMARKS.largeDatasetQuery,
        { iterations, limit: 50 }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.largeDatasetQuery);
    });
  });

  describe('内存和资源使用', () => {
    it('不应该出现内存泄漏（连续创建和查询）', () => {
      // 这个测试检查连续操作后内存使用是否稳定
      const iterations = 20;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand([
          'create',
          '--type', 'content-creator',
          '--topic', `内存测试 ${i}`,
          '--requirements', '测试'
        ]);
        execCliCommand(['list', '--limit', '10']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      // 检查执行时间是否稳定（没有明显增长）
      const firstHalf = durations.slice(0, iterations / 2);
      const secondHalf = durations.slice(iterations / 2);
      const firstHalfAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      const degradation = ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

      recordPerformance(
        '连续操作稳定性测试',
        secondHalfAvg,
        firstHalfAvg * 1.5, // 允许 50% 的性能下降
        { iterations, degradation: `${degradation.toFixed(2)}%` }
      );

      // 性能下降不应超过 50%
      expect(degradation).toBeLessThan(50);
    });
  });

  describe('工作流命令性能', () => {
    it('workflow list 应该在 500ms 内完成', () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand(['workflow', 'list']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      recordPerformance(
        'workflow list 命令响应时间',
        avgDuration,
        BENCHMARKS.listCommand,
        { iterations }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.listCommand);
    });

    it('workflow info 应该在 500ms 内完成', () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand(['workflow', 'info', 'content-creator']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      recordPerformance(
        'workflow info 命令响应时间',
        avgDuration,
        BENCHMARKS.queryCommand,
        { iterations }
      );

      expect(avgDuration).toBeLessThan(BENCHMARKS.queryCommand);
    });
  });

  describe('错误处理性能', () => {
    it('错误参数验证应该在 100ms 内完成', () => {
      const iterations = 10;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        execCliCommand(['create', '--type', 'invalid-workflow']);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

      recordPerformance(
        '错误参数验证响应时间',
        avgDuration,
        100,
        { iterations }
      );

      expect(avgDuration).toBeLessThan(100);
    });
  });
});
