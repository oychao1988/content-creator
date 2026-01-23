# 监控系统优化指南

**版本**: 1.0
**日期**: 2026-01-19
**所属阶段**: 阶段 4

---

## 📋 目录

- [概述](#概述)
- [监控架构](#监控架构)
- [Sentry 集成](#sentry-集成)
- [Prometheus 集成](#prometheus-集成)
- [Grafana Dashboard](#grafana-dashboard)
- [日志优化](#日志优化)
- [告警配置](#告警配置)
- [实施步骤](#实施步骤)

---

## 概述

### 监控目标

1. **错误追踪** - 捕获和分析应用错误
2. **性能监控** - 追踪关键性能指标
3. **业务指标** - 监控任务处理情况
4. **可视化展示** - 直观的仪表板

### 监控技术栈

```yaml
错误追踪: Sentry
指标采集: Prometheus
可视化: Grafana
日志: Winston + Elasticsearch
APM: OpenTelemetry (可选)
```

---

## 监控架构

### 整体架构

```
┌─────────────────────────────────────────┐
│         应用层                          │
│  - Error Capture (Sentry)               │
│  - Metrics Export (Prometheus)         │
│  - Structured Logging (Winston)        │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│         采集层                          │
│  - Sentry SDK                          │
│  - prom-client                         │
│  - winston transports                  │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│         存储层                          │
│  - Sentry Cloud                        │
│  - Prometheus TSDB                     │
│  - Elasticsearch (Logs)                 │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│         可视化层                        │
│  - Sentry Dashboard                    │
│  - Grafana Dashboard                   │
│  - Kibana (Logs)                        │
└─────────────────────────────────────────┘
```

---

## Sentry 集成

### 初始化配置

```typescript
// 文件: src/infrastructure/monitoring/sentry.ts

import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

export class SentryService {
  initialize(dsn: string, environment: string) {
    Sentry.init({
      dsn,
      environment,
      // 性能监控
      integrations: [
        nodeProfilingIntegration(),
      ],
      // 采样率
      tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
      // 过滤敏感信息
      beforeSend(event, hint) {
        return this.filterSensitiveData(event);
      },
      // 环境信息
      release: process.env.APP_VERSION || '1.0.0',
      // 上下文
      initialScope: {
        tags: {
          service: 'content-creator',
          node_version: process.version,
        },
      },
    });

    // 全局错误处理
    this.setupGlobalHandlers();
  }

  private filterSensitiveData(event: Sentry.Event) {
    // 移除敏感信息
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
    }

    // 过滤特定的错误
    if (event.exception) {
      const message = event.exception.values?.[0]?.value;
      if (this.shouldIgnoreError(message)) {
        return null; // 忽略此错误
      }
    }

    return event;
  }

  private shouldIgnoreError(message?: string): boolean {
    const ignorePatterns = [
      /API key/i,
      /secret/i,
      /password/i,
      /ECONNREFUSED/,  // Redis 连接错误（开发环境）
    ];

    return ignorePatterns.some(pattern =>
      pattern.test(message || '')
    );
  }

  private setupGlobalHandlers() {
    // 未捕获的异常
    process.on('uncaughtException', (error) => {
      Sentry.captureException(error);
      // 给日志记录时间
      setTimeout(() => process.exit(1), 1000);
    });

    // 未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason) => {
      Sentry.captureException(reason as Error);
    });
  }

  captureException(error: Error, context?: any) {
    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext('custom', context);
      }
      Sentry.captureException(error);
    });
  }

  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
    Sentry.captureMessage(message, { level });
  }

  // 添加面包屑（用于追踪用户路径）
  addBreadcrumb(category: string, message: string, data?: any) {
    Sentry.addBreadcrumb({
      category,
      message,
      level: 'info',
      data,
    });
  }

  // 设置用户信息
  setUser(user: { id: string; email?: string; [key: string]: any }) {
    Sentry.setUser(user);
  }

  // 性能追踪
  startTransaction(name: string, op: string) {
    return Sentry.startSpan({ name, op });
  }
}

// 导出单例
export const sentryService = new SentryService();
```

### 使用示例

```typescript
// 在控制器中使用
import { sentryService } from './sentry.js';

export class TaskController {
  async createTask(req: Request, res: Response) {
    const transaction = sentryService.startTransaction('createTask', 'function');

    try {
      // 添加面包屑
      sentryService.addBreadcrumb('http', 'Task creation started', {
        url: req.url,
        method: req.method
      });

      // 业务逻辑
      const task = await this.service.createTask(req.body);

      // 设置用户
      sentryService.setUser({ id: req.user.id });

      return res.json(task);
    } catch (error) {
      // 捕获异常并包含上下文
      sentryService.captureException(error as Error, {
        taskData: req.body,
        userId: req.user?.id
      });

      throw error;
    } finally {
      transaction.end();
    }
  }
}
```

---

## Prometheus 集成

### 指标定义

```typescript
// 文件: src/infrastructure/monitoring/metrics.ts

import { register, Counter, Histogram, Gauge, Summary } from 'prom-client';

export class MetricsService {
  // 任务指标
  readonly taskCreated = new Counter({
    name: 'task_created_total',
    help: 'Total number of tasks created',
    labelNames: ['mode', 'type']
  });

  readonly taskCompleted = new Counter({
    name: 'task_completed_total',
    help: 'Total number of tasks completed',
    labelNames: ['mode', 'type', 'status']
  });

  readonly taskFailed = new Counter({
    name: 'task_failed_total',
    help: 'Total number of tasks failed',
    labelNames: ['mode', 'type', 'error_type']
  });

  readonly taskDuration = new Histogram({
    name: 'task_duration_seconds',
    help: 'Task execution duration in seconds',
    labelNames: ['mode', 'type', 'status'],
    buckets: [10, 30, 60, 120, 300, 600, 1800] // 10s-30min
  });

  // LLM 指标
  readonly llmRequestTotal = new Counter({
    name: 'llm_request_total',
    help: 'Total number of LLM requests',
    labelNames: ['model', 'operation']
  });

  readonly llmRequestDuration = new Histogram({
    name: 'llm_request_duration_seconds',
    help: 'LLM request duration in seconds',
    labelNames: ['model', 'operation'],
    buckets: [1, 5, 10, 30, 60, 120] // 1s-2min
  });

  readonly llmTokenUsage = new Counter({
    name: 'llm_token_usage_total',
    help: 'Total LLM token usage',
    labelNames: ['model', 'type'] // type: prompt/completion
  });

  readonly llmRetryTotal = new Counter({
    name: 'llm_retry_total',
    help: 'Total number of LLM retries',
    labelNames: ['model', 'reason']
  });

  // 队列指标
  readonly queueWaitingTasks = new Gauge({
    name: 'queue_waiting_tasks',
    help: 'Number of tasks waiting in queue',
    labelNames: ['queue_name']
  });

  readonly queueActiveTasks = new Gauge({
    name: 'queue_active_tasks',
    help: 'Number of tasks being processed',
    labelNames: ['queue_name']
  });

  readonly queueJobDuration = new Histogram({
    name: 'queue_job_duration_seconds',
    help: 'Queue job processing duration',
    labelNames: ['queue_name', 'status'],
    buckets: [5, 10, 30, 60, 300, 600]
  });

  // Worker 指标
  readonly workerActive = new Gauge({
    name: 'worker_active_total',
    help: 'Number of active workers',
    labelNames: ['worker_id']
  });

  readonly workerConcurrency = new Gauge({
    name: 'worker_concurrent_tasks',
    help: 'Number of concurrent tasks per worker',
    labelNames: ['worker_id']
  });

  // 质量检查指标
  readonly qualityCheckDuration = new Histogram({
    name: 'quality_check_duration_seconds',
    help: 'Quality check execution duration',
    labelNames: ['check_type'], // hard_rule/soft_scoring
    buckets: [0.1, 0.5, 1, 5, 10, 30]
  });

  readonly qualityCheckScore = new Gauge({
    name: 'quality_check_score',
    help: 'Quality check score',
    labelNames: ['dimension'] // relevance/coherence/completeness/readability
  });

  readonly qualityCheckPassRate = new Gauge({
    name: 'quality_check_pass_rate',
    help: 'Quality check pass rate',
    labelNames: ['check_type']
  });

  // 系统指标
  readonly memoryUsage = new Gauge({
    name: 'process_memory_usage_bytes',
    help: 'Process memory usage in bytes'
  });

  readonly cpuUsage = new Gauge({
    name: 'process_cpu_usage_percent',
    help: 'Process CPU usage percentage'
  });

  // 缓存指标
  readonly cacheHitRate = new Gauge({
    name: 'cache_hit_rate',
    help: 'Cache hit rate',
    labelNames: ['cache_type'] // llm/search/quality
  });

  readonly cacheSize = new Gauge({
    name: 'cache_size',
    help: 'Cache size',
    labelNames: ['cache_type']
  });

  // 记录指标的方法
  recordTaskCreation(mode: string, type: string) {
    this.taskCreated.inc({ mode, type });
  }

  recordTaskCompletion(mode: string, type: string, status: string, duration: number) {
    this.taskCompleted.inc({ mode, type, status });
    this.taskDuration.observe({ mode, type, status }, duration);
  }

  recordTaskFailure(mode: string, type: string, errorType: string) {
    this.taskFailed.inc({ mode, type, error_type: errorType });
  }

  recordLLMRequest(model: string, operation: string, duration: number, tokens: { prompt: number; completion: number }) {
    this.llmRequestTotal.inc({ model, operation });
    this.llmRequestDuration.observe({ model, operation }, duration);
    this.llmTokenUsage.inc({ model, type: 'prompt' }, tokens.prompt);
    this.llmTokenUsage.inc({ model, type: 'completion' }, tokens.completion);
  }

  recordLLMRetry(model: string, reason: string) {
    this.llmRetryTotal.inc({ model, reason });
  }

  updateQueueStats(queueName: string, stats: QueueStats) {
    this.queueWaitingTasks.set({ queue_name: queueName }, stats.waiting);
    this.queueActiveTasks.set({ queue_name: queueName }, stats.active);
  }

  recordQualityCheck(checkType: string, duration: number, score?: number, dimension?: string) {
    this.qualityCheckDuration.observe({ check_type: checkType }, duration);

    if (score !== undefined && dimension) {
      this.qualityCheckScore.set({ dimension }, score);
    }
  }

  // 定期更新系统指标
  startSystemMetricsCollection(interval: number = 5000) {
    setInterval(() => {
      const memUsage = process.memoryUsage();
      this.memoryUsage.set(memUsage.heapUsed);
    }, interval);
  }

  // 暴露指标端点
  getMetrics() {
    return register.metrics();
  }
}

// 导出单例
export const metricsService = new MetricsService();
```

### HTTP 端点

```typescript
// 文件: src/api/metrics.routes.ts

import { Router } from 'express';
import { metricsService } from '../infrastructure/monitoring/metrics.js';

export function createMetricsRouter(): Router {
  const router = Router();

  // Prometheus 指标端点
  router.get('/metrics', async (req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await metricsService.getMetrics());
  });

  // 自定义统计端点
  router.get('/api/stats', async (req, res) => {
    const stats = {
      tasks: {
        created: await metricsService.taskCreated.get(),
        completed: await metricsService.taskCompleted.get(),
        failed: await metricsService.taskFailed.get(),
      },
      llm: {
        requests: await metricsService.llmRequestTotal.get(),
        tokenUsage: await metricsService.llmTokenUsage.get(),
      },
      queue: {
        waiting: await metricsService.queueWaitingTasks.get(),
        active: await metricsService.queueActiveTasks.get(),
      }
    };

    res.json(stats);
  });

  return router;
}
```

---

## Grafana Dashboard

### Dashboard 配置

```json
{
  "dashboard": {
    "title": "Content Creator 监控面板",
    "tags": ["content-creator"],
    "timezone": "browser",
    "panels": [
      {
        "id": 1,
        "title": "任务创建趋势",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(task_created_total[5m])",
            "legendFormat": "{{mode}} - {{type}}"
          }
        ]
      },
      {
        "id": 2,
        "title": "任务执行时长",
        "type": "heatmap",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(task_duration_seconds_bucket[5m]))",
            "legendFormat": "{{mode}} - {{status}}"
          }
        ]
      },
      {
        "id": 3,
        "title": "LLM 请求速率",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(llm_request_total[1m])",
            "legendFormat": "{{model}} - {{operation}}"
          }
        ]
      },
      {
        "id": 4,
        "title": "Token 使用量",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(llm_token_usage_total[5m])",
            "legendFormat": "{{model}} - {{type}}"
          }
        ]
      },
      {
        "id": 5,
        "title": "队列状态",
        "type": "stat",
        "targets": [
          {
            "expr": "queue_waiting_tasks",
            "legendFormat": "等待中"
          },
          {
            "expr": "queue_active_tasks",
            "legendFormat": "处理中"
          }
        ]
      },
      {
        "id": 6,
        "title": "质量检查分数",
        "type": "gauge",
        "targets": [
          {
            "expr": "avg(quality_check_score)",
            "legendFormat": "平均分"
          }
        ]
      }
    ]
  }
}
```

---

## 日志优化

### Winston 配置

```typescript
// 文件: src/infrastructure/logging/winston.ts

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

export class LoggingService {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
      ),
      defaultMeta: {
        service: 'content-creator',
        environment: process.env.NODE_ENV,
      },
      transports: [
        // 错误日志
        new DailyRotateFile({
          filename: 'logs/error-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          level: 'error',
          maxSize: '20m',
          maxFiles: '14d'
        }),
        // 组合日志
        new DailyRotateFile({
          filename: 'logs/combined-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          maxSize: '20m',
          maxFiles: '14d'
        }),
        // 控制台输出（开发环境）
        ...(process.env.NODE_ENV === 'development' ? [
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.simple()
            )
          })
        ] : [])
      ]
    });
  }

  info(message: string, meta?: any) {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: any) {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: any) {
    this.logger.error(message, meta);
  }

  debug(message: string, meta?: any) {
    this.logger.debug(message, meta);
  }

  // 上下文日志
  logWithContext(context: string, message: string, meta?: any) {
    this.logger.info({ context, message, ...meta });
  }
}

// 导出单例
export const loggingService = new LoggingService();

// 快捷方法
export const logger = {
  info: (message: string, meta?: any) => loggingService.info(message, meta),
  warn: (message: string, meta?: any) => loggingService.warn(message, meta),
  error: (message: string, meta?: any) => loggingService.error(message, meta),
  debug: (message: string, meta?: any) => loggingService.debug(message, meta),
};
```

### 结构化日志示例

```typescript
// 任务创建日志
logger.info('Task created', {
  taskId: 'task-123',
  mode: 'async',
  topic: 'AI 技术',
  userId: 'user-456',
  duration: 1234,
});

// 错误日志
logger.error('LLM request failed', {
  error: error.message,
  stack: error.stack,
  model: 'deepseek-chat',
  operation: 'generate',
  attempt: 2,
  maxAttempts: 3,
  taskId: 'task-123',
});

// 性能日志
logger.info('Task completed', {
  taskId: 'task-123',
  status: 'completed',
  duration: 180,
  steps: {
    search: 2,
    organize: 28,
    write: 36,
    qualityCheck: 114,
  },
  tokenUsage: {
    prompt: 1500,
    completion: 2000,
  },
});
```

---

## 告警配置

### Prometheus 告警规则

```yaml
# prometheus/alerts.yml

groups:
  - name: content_creator_alerts
    interval: 30s
    rules:
      # 高错误率
      - alert: HighErrorRate
        expr: rate(task_failed_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "任务失败率过高"
          description: "5分钟内任务失败率超过 10%"

      # 任务积压
      - alert: QueueBacklog
        expr: queue_waiting_tasks > 100
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "队列积压严重"
          description: "等待中的任务超过 100 个"

      # LLM API 慢
      - alert: SlowLLMResponse
        expr: histogram_quantile(0.95, rate(llm_request_duration_seconds_bucket[5m])) > 30
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "LLM 响应慢"
          description: "95分位响应时间超过 30秒"

      # Worker 不活跃
      - alert: WorkerInactive
        expr: worker_active_total == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "所有 Worker 不可用"
          description: "没有活跃的 Worker 在处理任务"

      # 内存使用过高
      - alert: HighMemoryUsage
        expr: process_memory_usage_bytes / 1024 / 1024 / 1024 > 2
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "内存使用过高"
          description: "进程内存使用超过 2GB"
```

### Sentry 告警

```typescript
// Sentry 告警规则配置
const alertRules = {
  // 错误率告警
  highErrorRate: {
    condition: 'error_rate > 0.05', // 5%
    duration: '5m',
    severity: 'warning'
  },

  // 特定错误告警
  criticalError: {
    patterns: [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'Database connection failed'
    ],
    severity: 'critical'
  },

  // LLM API 错误
  llmAPIError: {
    patterns: [
      'LLM API error',
      'Rate limit exceeded'
    ],
    severity: 'warning'
  }
};
```

---

## 实施步骤

### Step 1: 安装依赖

```bash
pnpm add @sentry/node @sentry/profiling-node
pnpm add prom-client
pnpm add winston winston-daily-rotate-file
pnpm add -D @types/winston
```

### Step 2: 初始化 Sentry

```typescript
// src/index.ts
import { sentryService } from './infrastructure/monitoring/sentry.js';

// 在应用启动时初始化
if (process.env.SENTRY_DSN) {
  sentryService.initialize(
    process.env.SENTRY_DSN,
    process.env.NODE_ENV || 'development'
  );
}
```

### Step 3: 暴露 Prometheus 端点

```typescript
// src/api/index.ts
import { createMetricsRouter } from './api/metrics.routes.js';

app.use('/metrics', createMetricsRouter());
```

### Step 4: 配置 Grafana

1. 添加 Prometheus 数据源
2. 导入 Dashboard 配置
3. 配置告警规则
4. 设置通知渠道（邮件/Slack/钉钉）

---

## 监控最佳实践

### 1. 分层监控

```
应用层监控 → 业务指标（任务创建、完成）
  ↓
服务层监控 → LLM 调用、数据库查询
  ↓
系统层监控 → CPU、内存、网络
```

### 2. 黄金指标

- **延迟** (Latency) - P50, P95, P99
- **流量** (Traffic) - QPS、并发数
- **错误** (Errors) - 错误率、错误类型
- **饱和度** (Saturation) - CPU、内存使用率

### 3. 告警策略

- **Critical** - 立即通知（电话/短信）
- **Warning** - 延迟通知（邮件/IM）
- **Info** - 记录但不通知

---

**文档生成时间**: 2026-01-19
**版本**: 1.0
