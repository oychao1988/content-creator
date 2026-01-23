/**
 * Prometheus 指标服务
 *
 * 基于 prom-client 的指标采集服务
 * 收集任务、LLM、队列、系统等关键指标
 */

import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('Metrics');

/**
 * 指标标签
 */
export interface MetricLabels {
  // 通用标签
  status?: string;
  error?: string;
  workerId?: string;
  taskId?: string;

  // LLM 标签
  model?: string;
  operation?: string;

  // 队列标签
  queueName?: string;
  jobState?: string;

  // 自定义标签
  [key: string]: string | number | undefined;
}

/**
 * Prometheus 指标服务类
 */
export class MetricsService {
  // 任务相关指标
  private taskCreated: Counter<string>;
  private taskCompleted: Counter<string>;
  private taskFailed: Counter<string>;
  private taskCancelled: Counter<string>;
  private taskDuration: Histogram<string>;
  private taskProgress: Gauge<string>;

  // 系统指标收集定时器
  private systemMetricsInterval: NodeJS.Timeout | null = null;

  // LLM 相关指标
  private llmRequests: Counter<string>;
  private llmRequestDuration: Histogram<string>;
  private llmTokenUsage: Counter<string>;
  private llmRetry: Counter<string>;
  private llmErrors: Counter<string>;

  // 队列相关指标
  private queueJobsWaiting: Gauge<string>;
  private queueJobsActive: Gauge<string>;
  private queueJobsCompleted: Counter<string>;
  private queueJobsFailed: Counter<string>;
  private queueJobDuration: Histogram<string>;

  // 质量检查相关指标
  private qualityChecks: Counter<string>;
  private qualityCheckDuration: Histogram<string>;
  private qualityCheckPassed: Counter<string>;
  private qualityCheckFailed: Counter<string>;
  private qualityCheckScore: Histogram<string>;

  // 缓存相关指标
  private cacheHits: Counter<string>;
  private cacheMisses: Counter<string>;
  private cacheSet: Counter<string>;
  private cacheDelete: Counter<string>;
  private cacheSize: Gauge<string>;

  // 系统相关指标
  private memoryUsage: Gauge<string>;
  private cpuUsage: Gauge<string>;
  private activeWorkers: Gauge<string>;
  private uptime: Gauge<string>;

  constructor() {
    // 初始化任务指标
    this.taskCreated = new Counter({
      name: 'task_created_total',
      help: 'Total number of tasks created',
      labelNames: ['workerId', 'mode'],
    });

    this.taskCompleted = new Counter({
      name: 'task_completed_total',
      help: 'Total number of tasks completed',
      labelNames: ['workerId', 'mode'],
    });

    this.taskFailed = new Counter({
      name: 'task_failed_total',
      help: 'Total number of tasks failed',
      labelNames: ['workerId', 'mode', 'error'],
    });

    this.taskCancelled = new Counter({
      name: 'task_cancelled_total',
      help: 'Total number of tasks cancelled',
      labelNames: ['workerId'],
    });

    this.taskDuration = new Histogram({
      name: 'task_duration_seconds',
      help: 'Task execution duration in seconds',
      labelNames: ['workerId', 'mode'],
      buckets: [10, 30, 60, 120, 300, 600, 1800, 3600], // 10s 到 1h
    });

    this.taskProgress = new Gauge({
      name: 'task_progress_percentage',
      help: 'Current task progress percentage',
      labelNames: ['workerId', 'taskId'],
    });

    // 初始化 LLM 指标
    this.llmRequests = new Counter({
      name: 'llm_request_total',
      help: 'Total number of LLM requests',
      labelNames: ['model', 'operation'],
    });

    this.llmRequestDuration = new Histogram({
      name: 'llm_request_duration_seconds',
      help: 'LLM request duration in seconds',
      labelNames: ['model', 'operation'],
      buckets: [1, 5, 10, 20, 30, 60, 120], // 1s 到 2min
    });

    this.llmTokenUsage = new Counter({
      name: 'llm_token_usage_total',
      help: 'Total number of tokens used',
      labelNames: ['model', 'type'], // type: prompt, completion
    });

    this.llmRetry = new Counter({
      name: 'llm_retry_total',
      help: 'Total number of LLM request retries',
      labelNames: ['model', 'operation'],
    });

    this.llmErrors = new Counter({
      name: 'llm_error_total',
      help: 'Total number of LLM errors',
      labelNames: ['model', 'operation', 'error'],
    });

    // 初始化队列指标
    this.queueJobsWaiting = new Gauge({
      name: 'queue_jobs_waiting',
      help: 'Number of jobs waiting in queue',
      labelNames: ['queueName'],
    });

    this.queueJobsActive = new Gauge({
      name: 'queue_jobs_active',
      help: 'Number of active jobs being processed',
      labelNames: ['queueName'],
    });

    this.queueJobsCompleted = new Counter({
      name: 'queue_jobs_completed_total',
      help: 'Total number of jobs completed',
      labelNames: ['queueName'],
    });

    this.queueJobsFailed = new Counter({
      name: 'queue_jobs_failed_total',
      help: 'Total number of jobs failed',
      labelNames: ['queueName', 'error'],
    });

    this.queueJobDuration = new Histogram({
      name: 'queue_job_duration_seconds',
      help: 'Queue job duration in seconds',
      labelNames: ['queueName'],
      buckets: [1, 5, 10, 30, 60, 300, 600],
    });

    // 初始化质量检查指标
    this.qualityChecks = new Counter({
      name: 'quality_check_total',
      help: 'Total number of quality checks',
      labelNames: ['type'], // type: hard, soft, full
    });

    this.qualityCheckDuration = new Histogram({
      name: 'quality_check_duration_seconds',
      help: 'Quality check duration in seconds',
      labelNames: ['type'],
      buckets: [1, 5, 10, 20, 30],
    });

    this.qualityCheckPassed = new Counter({
      name: 'quality_check_passed_total',
      help: 'Total number of quality checks passed',
      labelNames: ['type'],
    });

    this.qualityCheckFailed = new Counter({
      name: 'quality_check_failed_total',
      help: 'Total number of quality checks failed',
      labelNames: ['type', 'reason'],
    });

    this.qualityCheckScore = new Histogram({
      name: 'quality_check_score',
      help: 'Quality check score distribution',
      labelNames: ['type'],
      buckets: [2, 4, 6, 7, 8, 9, 10], // 对应评分等级
    });

    // 初始化缓存指标
    this.cacheHits = new Counter({
      name: 'cache_hits_total',
      help: 'Total number of cache hits',
      labelNames: ['cacheName'],
    });

    this.cacheMisses = new Counter({
      name: 'cache_misses_total',
      help: 'Total number of cache misses',
      labelNames: ['cacheName'],
    });

    this.cacheSet = new Counter({
      name: 'cache_set_total',
      help: 'Total number of cache sets',
      labelNames: ['cacheName'],
    });

    this.cacheDelete = new Counter({
      name: 'cache_delete_total',
      help: 'Total number of cache deletes',
      labelNames: ['cacheName'],
    });

    this.cacheSize = new Gauge({
      name: 'cache_size',
      help: 'Current cache size',
      labelNames: ['cacheName'],
    });

    // 初始化系统指标
    this.memoryUsage = new Gauge({
      name: 'memory_usage_bytes',
      help: 'Memory usage in bytes',
      labelNames: ['type'], // type: heap, rss, external
    });

    this.cpuUsage = new Gauge({
      name: 'cpu_usage_percent',
      help: 'CPU usage percentage',
    });

    this.activeWorkers = new Gauge({
      name: 'active_workers_total',
      help: 'Number of active workers',
    });

    this.uptime = new Gauge({
      name: 'uptime_seconds',
      help: 'Service uptime in seconds',
    });

    // 启动系统指标收集
    this.startSystemMetricsCollection();

    logger.info('Metrics service initialized');
  }

  // ==================== 任务相关方法 ====================

  recordTaskCreated(workerId: string, mode: string): void {
    this.taskCreated.inc({ workerId, mode });
  }

  recordTaskCompleted(workerId: string, mode: string, duration: number): void {
    this.taskCompleted.inc({ workerId, mode });
    this.taskDuration.observe({ workerId, mode }, duration / 1000);
  }

  recordTaskFailed(workerId: string, mode: string, error: string): void {
    this.taskFailed.inc({ workerId, mode, error });
  }

  recordTaskCancelled(workerId: string): void {
    this.taskCancelled.inc({ workerId });
  }

  recordTaskProgress(workerId: string, taskId: string, progress: number): void {
    this.taskProgress.set({ workerId, taskId }, progress);
  }

  // ==================== LLM 相关方法 ====================

  recordLLMRequest(model: string, operation: string): void {
    this.llmRequests.inc({ model, operation });
  }

  recordLLMRequestDuration(model: string, operation: string, duration: number): void {
    this.llmRequestDuration.observe({ model, operation }, duration / 1000);
  }

  recordLLMTokenUsage(model: string, type: 'prompt' | 'completion', count: number): void {
    this.llmTokenUsage.inc({ model, type }, count);
  }

  recordLLMRetry(model: string, operation: string): void {
    this.llmRetry.inc({ model, operation });
  }

  recordLLMError(model: string, operation: string, error: string): void {
    this.llmErrors.inc({ model, operation, error });
  }

  // ==================== 队列相关方法 ====================

  recordQueueJobsWaiting(queueName: string, count: number): void {
    this.queueJobsWaiting.set({ queueName }, count);
  }

  recordQueueJobsActive(queueName: string, count: number): void {
    this.queueJobsActive.set({ queueName }, count);
  }

  recordQueueJobCompleted(queueName: string): void {
    this.queueJobsCompleted.inc({ queueName });
  }

  recordQueueJobFailed(queueName: string, error: string): void {
    this.queueJobsFailed.inc({ queueName, error });
  }

  recordQueueJobDuration(queueName: string, duration: number): void {
    this.queueJobDuration.observe({ queueName }, duration / 1000);
  }

  // ==================== 质量检查相关方法 ====================

  recordQualityCheck(type: 'hard' | 'soft' | 'full'): void {
    this.qualityChecks.inc({ type });
  }

  recordQualityCheckDuration(type: 'hard' | 'soft' | 'full', duration: number): void {
    this.qualityCheckDuration.observe({ type }, duration / 1000);
  }

  recordQualityCheckPassed(type: 'hard' | 'soft' | 'full'): void {
    this.qualityCheckPassed.inc({ type });
  }

  recordQualityCheckFailed(type: 'hard' | 'soft' | 'full', reason: string): void {
    this.qualityCheckFailed.inc({ type, reason });
  }

  recordQualityCheckScore(type: 'hard' | 'soft' | 'full', score: number): void {
    this.qualityCheckScore.observe({ type }, score);
  }

  // ==================== 缓存相关方法 ====================

  recordCacheHit(cacheName: string): void {
    this.cacheHits.inc({ cacheName });
  }

  recordCacheMiss(cacheName: string): void {
    this.cacheMisses.inc({ cacheName });
  }

  recordCacheSet(cacheName: string): void {
    this.cacheSet.inc({ cacheName });
  }

  recordCacheDelete(cacheName: string): void {
    this.cacheDelete.inc({ cacheName });
  }

  recordCacheSize(cacheName: string, size: number): void {
    this.cacheSize.set({ cacheName }, size);
  }

  // ==================== 系统相关方法 ====================

  recordActiveWorkers(count: number): void {
    this.activeWorkers.set(count);
  }

  recordUptime(seconds: number): void {
    this.uptime.set(seconds);
  }

  /**
   * 启动系统指标收集
   */
  private startSystemMetricsCollection(): void {
    const startTime = Date.now();

    // 每 5 秒收集一次系统指标
    this.systemMetricsInterval = setInterval(() => {
      const memUsage = process.memoryUsage();

      this.memoryUsage.set({ type: 'rss' }, memUsage.rss);
      this.memoryUsage.set({ type: 'heapTotal' }, memUsage.heapTotal);
      this.memoryUsage.set({ type: 'heapUsed' }, memUsage.heapUsed);
      this.memoryUsage.set({ type: 'external' }, memUsage.external);

      this.uptime.set((Date.now() - startTime) / 1000);
    }, 5000);

    logger.info('System metrics collection started');
  }

  /**
   * 停止系统指标收集
   */
  stop(): void {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
      this.systemMetricsInterval = null;
      logger.info('System metrics collection stopped');
    }
  }

  /**
   * 获取 Prometheus 指标
   */
  async getMetrics(): Promise<string> {
    return await register.metrics();
  }

  /**
   * 获取内容类型
   */
  getContentType(): string {
    return register.contentType;
  }

  /**
   * 清空所有指标
   */
  resetMetrics(): void {
    register.clear();
    logger.info('Metrics reset');
  }

  /**
   * 获取指标统计
   */
  async getMetricsStats(): Promise<any> {
    const metrics = await register.getMetricsAsJSON();

    return {
      totalMetrics: metrics.length,
      metrics: metrics.map(m => ({
        name: m.name,
        type: m.type,
        help: m.help,
      })),
    };
  }
}

/**
 * Metrics 服务单例
 */
export const metricsService = new MetricsService();
