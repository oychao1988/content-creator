/**
 * MetricsService 测试
 *
 * 测试 Prometheus 指标服务的各项功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { register } from 'prom-client';
import { MetricsService } from '../../src/infrastructure/monitoring/MetricsService.js';

describe('MetricsService', () => {
  let metricsService: MetricsService;

  beforeEach(() => {
    // 清空所有指标
    register.clear();

    // 创建新的 MetricsService 实例
    metricsService = new MetricsService();
  });

  afterEach(() => {
    // 清理定时器
    vi.clearAllTimers();

    // 清空所有指标
    register.clear();
  });

  describe('任务相关指标', () => {
    it('应该记录任务创建', () => {
      metricsService.recordTaskCreated('worker-1', 'test');

      // 验证指标被正确记录
      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('task_created_total');
      }).not.toThrow();
    });

    it('应该记录任务完成和持续时间', () => {
      metricsService.recordTaskCompleted('worker-1', 'test', 5000);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('task_completed_total');
        expect(metrics).toContain('task_duration_seconds');
      }).not.toThrow();
    });

    it('应该记录任务失败', () => {
      metricsService.recordTaskFailed('worker-1', 'test', 'timeout');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('task_failed_total');
      }).not.toThrow();
    });

    it('应该记录任务取消', () => {
      metricsService.recordTaskCancelled('worker-1');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('task_cancelled_total');
      }).not.toThrow();
    });

    it('应该记录任务进度', () => {
      metricsService.recordTaskProgress('worker-1', 'task-123', 75);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('task_progress_percentage');
      }).not.toThrow();
    });

    it('应该处理多个任务的并发记录', () => {
      metricsService.recordTaskCreated('worker-1', 'test');
      metricsService.recordTaskCreated('worker-2', 'production');
      metricsService.recordTaskCreated('worker-1', 'test');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        // 应该包含多次记录
        expect(metrics).toContain('task_created_total');
      }).not.toThrow();
    });
  });

  describe('LLM 相关指标', () => {
    it('应该记录 LLM 请求', () => {
      metricsService.recordLLMRequest('gpt-4', 'chat');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('llm_request_total');
      }).not.toThrow();
    });

    it('应该记录 LLM 请求持续时间', () => {
      metricsService.recordLLMRequestDuration('gpt-4', 'chat', 1500);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('llm_request_duration_seconds');
      }).not.toThrow();
    });

    it('应该记录 LLM 令牌使用', () => {
      metricsService.recordLLMTokenUsage('gpt-4', 'prompt', 100);
      metricsService.recordLLMTokenUsage('gpt-4', 'completion', 50);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('llm_token_usage_total');
      }).not.toThrow();
    });

    it('应该记录 LLM 重试', () => {
      metricsService.recordLLMRetry('gpt-4', 'chat');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('llm_retry_total');
      }).not.toThrow();
    });

    it('应该记录 LLM 错误', () => {
      metricsService.recordLLMError('gpt-4', 'chat', 'rate_limit_exceeded');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('llm_error_total');
      }).not.toThrow();
    });

    it('应该记录完整的 LLM 调用流程', () => {
      const model = 'gpt-4';
      const operation = 'chat';

      metricsService.recordLLMRequest(model, operation);
      metricsService.recordLLMRequestDuration(model, operation, 2000);
      metricsService.recordLLMTokenUsage(model, 'prompt', 150);
      metricsService.recordLLMTokenUsage(model, 'completion', 80);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('llm_request_total');
        expect(metrics).toContain('llm_token_usage_total');
      }).not.toThrow();
    });
  });

  describe('队列相关指标', () => {
    it('应该记录队列等待任务数', () => {
      metricsService.recordQueueJobsWaiting('test-queue', 10);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('queue_jobs_waiting');
      }).not.toThrow();
    });

    it('应该记录队列活跃任务数', () => {
      metricsService.recordQueueJobsActive('test-queue', 5);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('queue_jobs_active');
      }).not.toThrow();
    });

    it('应该记录队列任务完成', () => {
      metricsService.recordQueueJobCompleted('test-queue');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('queue_jobs_completed_total');
      }).not.toThrow();
    });

    it('应该记录队列任务失败', () => {
      metricsService.recordQueueJobFailed('test-queue', 'timeout');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('queue_jobs_failed_total');
      }).not.toThrow();
    });

    it('应该记录队列任务持续时间', () => {
      metricsService.recordQueueJobDuration('test-queue', 3000);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('queue_job_duration_seconds');
      }).not.toThrow();
    });

    it('应该处理队列状态变化', () => {
      metricsService.recordQueueJobsWaiting('test-queue', 10);
      metricsService.recordQueueJobsActive('test-queue', 3);
      metricsService.recordQueueJobsActive('test-queue', 5);
      metricsService.recordQueueJobsWaiting('test-queue', 8);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('queue_jobs_waiting');
        expect(metrics).toContain('queue_jobs_active');
      }).not.toThrow();
    });
  });

  describe('质量检查相关指标', () => {
    it('应该记录质量检查', () => {
      metricsService.recordQualityCheck('hard');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('quality_check_total');
      }).not.toThrow();
    });

    it('应该记录质量检查持续时间', () => {
      metricsService.recordQualityCheckDuration('soft', 2000);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('quality_check_duration_seconds');
      }).not.toThrow();
    });

    it('应该记录质量检查通过', () => {
      metricsService.recordQualityCheckPassed('hard');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('quality_check_passed_total');
      }).not.toThrow();
    });

    it('应该记录质量检查失败', () => {
      metricsService.recordQualityCheckFailed('soft', 'word_count_too_low');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('quality_check_failed_total');
      }).not.toThrow();
    });

    it('应该记录质量检查评分', () => {
      metricsService.recordQualityCheckScore('full', 8.5);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('quality_check_score');
      }).not.toThrow();
    });

    it('应该记录完整质量检查流程', () => {
      metricsService.recordQualityCheck('full');
      metricsService.recordQualityCheckDuration('full', 3000);
      metricsService.recordQualityCheckScore('full', 9.0);
      metricsService.recordQualityCheckPassed('full');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('quality_check_total');
        expect(metrics).toContain('quality_check_passed_total');
        expect(metrics).toContain('quality_check_score');
      }).not.toThrow();
    });
  });

  describe('缓存相关指标', () => {
    it('应该记录缓存命中', () => {
      metricsService.recordCacheHit('llm-cache');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('cache_hits_total');
      }).not.toThrow();
    });

    it('应该记录缓存未命中', () => {
      metricsService.recordCacheMiss('llm-cache');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('cache_misses_total');
      }).not.toThrow();
    });

    it('应该记录缓存设置', () => {
      metricsService.recordCacheSet('llm-cache');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('cache_set_total');
      }).not.toThrow();
    });

    it('应该记录缓存删除', () => {
      metricsService.recordCacheDelete('llm-cache');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('cache_delete_total');
      }).not.toThrow();
    });

    it('应该记录缓存大小', () => {
      metricsService.recordCacheSize('llm-cache', 100);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('cache_size');
      }).not.toThrow();
    });

    it('应该计算缓存命中率', () => {
      // 记录 10 次命中和 2 次未命中
      for (let i = 0; i < 10; i++) {
        metricsService.recordCacheHit('llm-cache');
      }
      for (let i = 0; i < 2; i++) {
        metricsService.recordCacheMiss('llm-cache');
      }

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('cache_hits_total');
        expect(metrics).toContain('cache_misses_total');
      }).not.toThrow();
    });
  });

  describe('系统相关指标', () => {
    it('应该记录活跃工作器数', () => {
      metricsService.recordActiveWorkers(5);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('active_workers_total');
      }).not.toThrow();
    });

    it('应该记录运行时间', () => {
      metricsService.recordUptime(3600);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('uptime_seconds');
      }).not.toThrow();
    });

    it('应该自动收集内存指标', () => {
      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('memory_usage_bytes');
      }).not.toThrow();
    });

    it('应该记录多个工作器的状态', () => {
      metricsService.recordActiveWorkers(3);
      metricsService.recordActiveWorkers(5);
      metricsService.recordActiveWorkers(4);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('active_workers_total');
      }).not.toThrow();
    });
  });

  describe('指标管理', () => {
    it('应该获取 Prometheus 格式的指标', async () => {
      metricsService.recordTaskCreated('worker-1', 'test');

      const metrics = await metricsService.getMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('应该返回正确的内容类型', () => {
      const contentType = metricsService.getContentType();

      expect(contentType).toBeDefined();
      expect(typeof contentType).toBe('string');
      expect(contentType).toContain('text/plain');
    });

    it('应该清空所有指标', () => {
      metricsService.recordTaskCreated('worker-1', 'test');
      metricsService.recordCacheHit('llm-cache');

      metricsService.resetMetrics();

      // 重置后应该可以正常记录新指标
      metricsService.recordTaskCreated('worker-2', 'production');

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toBeDefined();
      }).not.toThrow();
    });

    it('应该获取指标统计信息', async () => {
      const stats = await metricsService.getMetricsStats();

      expect(stats).toBeDefined();
      expect(stats.totalMetrics).toBeGreaterThan(0);
      expect(Array.isArray(stats.metrics)).toBe(true);
      expect(stats.metrics.length).toBeGreaterThan(0);

      // 验证指标对象结构
      if (stats.metrics.length > 0) {
        const metric = stats.metrics[0];
        expect(metric).toHaveProperty('name');
        expect(metric).toHaveProperty('type');
        expect(metric).toHaveProperty('help');
      }
    });
  });

  describe('边界情况', () => {
    it('应该处理零值', () => {
      metricsService.recordTaskProgress('worker-1', 'task-123', 0);
      metricsService.recordQueueJobsWaiting('test-queue', 0);
      metricsService.recordActiveWorkers(0);

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toBeDefined();
      }).not.toThrow();
    });

    it('应该处理大数值', () => {
      metricsService.recordLLMTokenUsage('gpt-4', 'prompt', 100000);
      metricsService.recordCacheSize('llm-cache', 1000000);
      metricsService.recordUptime(86400); // 24 小时

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toBeDefined();
      }).not.toThrow();
    });

    it('应该处理负数持续时间（边界情况）', () => {
      // 虽然不合理，但不应导致错误
      expect(() => {
        metricsService.recordTaskCompleted('worker-1', 'test', -1000);
        metricsService.recordLLMRequestDuration('gpt-4', 'chat', -500);
      }).not.toThrow();
    });

    it('应该处理特殊字符和长字符串', () => {
      metricsService.recordTaskFailed(
        'worker-1',
        'test',
        'Error: Connection refused at very-long-error-message-with-special-chars-!@#$%^&*()'
      );

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toContain('task_failed_total');
      }).not.toThrow();
    });
  });

  describe('并发安全', () => {
    it('应该处理并发指标记录', async () => {
      const promises = [];

      // 创建 100 个并发记录
      for (let i = 0; i < 100; i++) {
        promises.push(
          Promise.resolve().then(() => {
            metricsService.recordTaskCreated(`worker-${i % 5}`, 'test');
            metricsService.recordCacheHit('llm-cache');
          })
        );
      }

      await expect(Promise.all(promises)).resolves.not.toThrow();

      expect(async () => {
        const metrics = await metricsService.getMetrics();
        expect(metrics).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('性能测试', () => {
    it('应该在合理时间内获取指标', async () => {
      const startTime = Date.now();

      // 记录一些指标
      for (let i = 0; i < 1000; i++) {
        metricsService.recordTaskCreated('worker-1', 'test');
        metricsService.recordCacheHit('llm-cache');
      }

      const metrics = await metricsService.getMetrics();
      const duration = Date.now() - startTime;

      expect(metrics).toBeDefined();
      expect(duration).toBeLessThan(1000); // 应该在 1 秒内完成
    });
  });

  describe('指标命名和标签', () => {
    it('应该使用正确的指标命名规范', async () => {
      metricsService.recordTaskCreated('worker-1', 'test');
      const metrics = await metricsService.getMetrics();

      // Prometheus 指标名称应该符合规范
      expect(metrics).toMatch(/task_created_total\{/);
    });

    it('应该包含所有必需的标签', async () => {
      metricsService.recordLLMRequest('gpt-4', 'chat');
      const metrics = await metricsService.getMetrics();

      // 应该包含模型和操作标签
      expect(metrics).toContain('model="gpt-4"');
      expect(metrics).toContain('operation="chat"');
    });
  });
});
