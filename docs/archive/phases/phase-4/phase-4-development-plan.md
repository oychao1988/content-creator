# 阶段 4: 质量检查与监控优化 - 开发计划

**日期**: 2026-01-19
**阶段**: 阶段 4 - 质量检查与监控优化
**预计工期**: 5-7 天
**依赖**: 阶段 3 完成 ✅

---

## 📋 阶段目标

完善系统的质量检查、监控、性能和安全性：
1. ✅ 质量检查服务增强和完善
2. ✅ 监控系统优化（Sentry + Prometheus + Grafana）
3. ✅ 性能优化（缓存、数据库、LLM 调用）
4. ✅ 安全加固（认证、授权、配额管理）

---

## 🏗️ 架构概览

### 质量检查架构

```
文章内容
  ↓
┌──────────────────────────────────────┐
│ 硬规则检查（确定性）                    │
│  - 字数范围                           │
│  - 关键词覆盖                         │
│  - 结构要求                           │
│  - 禁用词过滤                         │
└──────────────────────────────────────┘
  ↓ 通过？
  ├─ ❌ → 失败（违反硬性约束）
  └─ ✅ → 继续
         ↓
┌──────────────────────────────────────┐
│ 软评分检查（LLM 评审）                  │
│  - 相关性 (30%)                      │
│  - 连贯性 (30%)                      │
│  - 完整性 (20%)                      │
│  - 可读性 (20%)                      │
└──────────────────────────────────────┘
  ↓ 分数 >= 7.0？
  ├─ ❌ → 重试（最多 3 次）
  └─ ✅ → 通过
```

### 监控架构

```
┌─────────────────────────────────────────┐
│         应用层                          │
│  - Winston Logger                      │
│  - Sentry Error Tracking              │
│  - Custom Metrics                     │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│         采集层                          │
│  - Prometheus Exporter                │
│  - StatsD Client                      │
│  - OpenTelemetry                      │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│         存储层                          │
│  - Prometheus TSDB                    │
│  - Sentry Cloud                       │
│  - Elasticsearch (Logs)               │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│         可视化层                        │
│  - Grafana Dashboard                 │
│  - Sentry Dashboard                  │
│  - Kibana (Logs)                      │
└─────────────────────────────────────────┘
```

---

## 📦 技术栈

### 质量检查
```json
{
  "dependencies": {
    "zod": "^4.3.5",           // 规则验证
    "chalk": "^5.6.2"           // 终端输出
  }
}
```

### 监控和日志
```json
{
  "dependencies": {
    "winston": "^3.19.0",             // 日志框架
    "winston-daily-rotate-file": "^5.0.0", // 日志轮转
    "@sentry/node": "^8.0.0",        // Sentry SDK
    "prom-client": "^15.0.0",        // Prometheus 客户端
    "opentelemetry": "^1.8.0",       // OpenTelemetry
    "@opentelemetry/api": "^1.7.0",
    "@opentelemetry/sdk-node": "^0.45.0"
  }
}
```

### 性能优化
```json
{
  "dependencies": {
    "ioredis": "^5.9.2",             // Redis 客户端
    "cache-manager": "^5.2.0",       // 缓存管理
    "cache-manager-ioredis": "^2.1.0"
  }
}
```

---

## 🔧 组件设计

### 1. 质量检查服务

**文件**: `src/services/quality/QualityCheckService.ts`

**职责**:
- 硬规则检查（字数、关键词、结构）
- LLM 软评分（相关性、连贯性、完整性、可读性）
- 智能反馈生成
- 重试机制管理

**接口设计**:
```typescript
export interface QualityCheckOptions {
  hardRules?: {
    minWords?: number;
    maxWords?: number;
    keywords?: string[];
    requireTitle?: boolean;
    requireIntro?: boolean;
  };
  softScoring?: {
    enabled: boolean;
    passThreshold: number;
    maxAttempts: number;
  };
}

export interface QualityCheckResult {
  passed: boolean;
  score: number;
  hardConstraintsPassed: boolean;
  details: {
    relevance?: number;
    coherence?: number;
    completeness?: number;
    readability?: number;
  };
  fixSuggestions?: string[];
  checkedAt: number;
}
```

---

### 2. 监控服务

**文件**: `src/infrastructure/monitoring/MetricsService.ts`

**职责**:
- Prometheus 指标采集
- 自定义业务指标
- 性能指标收集

**关键指标**:
```typescript
// 任务指标
- task_created_total
- task_completed_total
- task_failed_total
- task_duration_seconds

// LLM 指标
- llm_request_total
- llm_request_duration_seconds
- llm_token_usage_total
- llm_retry_total

// 队列指标
- queue_waiting_tasks
- queue_processing_tasks
- queue_job_duration_seconds

// 系统指标
- memory_usage_bytes
- cpu_usage_percent
- active_workers_total
```

---

### 3. 性能优化服务

**文件**: `src/infrastructure/cache/CacheService.ts`

**职责**:
- Redis 缓存管理
- LLM 响应缓存
- 搜索结果缓存
- 缓存失效策略

**缓存策略**:
```typescript
// LLM 响应缓存（7天）
key: llm:response:{prompt_hash}
ttl: 7 * 24 * 3600

// 搜索结果缓存（1天）
key: search:result:{query_hash}
ttl: 24 * 3600

// 质量检查缓存（3天）
key: quality:check:{content_hash}
ttl: 3 * 24 * 3600
```

---

### 4. 安全服务

**文件**: `src/infrastructure/security/SecurityService.ts`

**职责**:
- API Key 验证
- 配额管理
- 速率限制
- 敏感数据加密

**安全机制**:
```typescript
// API Key 认证
- API Key 生成和验证
- API Key 过期管理
- 使用日志记录

// 配额管理
- 每日配额检查
- 配额预留和退款
- 超限拒绝

// 速率限制
- 滑动窗口算法
- IP 限流
- 用户级限流

// 数据加密
- API Key 加密存储
- 敏感配置加密
- 传输层加密（HTTPS）
```

---

## 📂 文件结构

```
src/
├── services/
│   └── quality/
│       ├── QualityCheckService.ts    # 质量检查服务
│       ├── HardRuleChecker.ts         # 硬规则检查器
│       ├── LLMEvaluator.ts            # LLM 评估器
│       └── index.ts
├── infrastructure/
│   ├── monitoring/
│   │   ├── MetricsService.ts         # Prometheus 指标
│   │   ├── SentryService.ts          # Sentry 集成
│   │   ├── LoggingService.ts         # 日志服务
│   │   └── index.ts
│   ├── cache/
│   │   ├── CacheService.ts           # 缓存服务
│   │   ├── CacheManager.ts           # 缓存管理器
│   │   └── index.ts
│   └── security/
│       ├── ApiKeyService.ts          # API Key 管理
│       ├── QuotaService.ts           # 配额管理
│       ├── RateLimiter.ts            # 速率限制
│       └── index.ts
└── middleware/
    ├── auth.middleware.ts            # 认证中间件
    ├── quota.middleware.ts           # 配额中间件
    └── ratelimit.middleware.ts       # 限流中间件
```

---

## 🚀 实施步骤

### Step 1: 质量检查服务（2 天）

#### 1.1 硬规则检查器
```typescript
// 文件: src/services/quality/HardRuleChecker.ts

export class HardRuleChecker {
  check(content: string, constraints: HardConstraints): CheckResult {
    // 1. 字数检查
    const wordCount = this.countWords(content);

    // 2. 关键词检查
    const keywordsFound = this.checkKeywords(content, constraints.keywords);

    // 3. 结构检查
    const structureValid = this.checkStructure(content);

    return {
      passed: this.allPassed(wordCount, keywordsFound, structureValid),
      details: { wordCount, keywordsFound, structureValid }
    };
  }
}
```

#### 1.2 LLM 评估器
```typescript
// 文件: src/services/quality/LLMEvaluator.ts

export class LLMEvaluator {
  async evaluate(content: string, requirements: string): Promise<EvaluationResult> {
    const prompt = this.buildEvaluationPrompt(content, requirements);

    const response = await this.llmService.generate(prompt);

    return this.parseEvaluationResponse(response);
  }
}
```

#### 1.3 智能反馈生成
```typescript
// 生成改进建议
fixSuggestions: [
  "字数不足：当前 450 字，最少需要 500 字",
  "缺少关键词：人工智能",
  "缺少导语段落"
]
```

---

### Step 2: 监控系统优化（1-2 天）

#### 2.1 Prometheus 集成
```typescript
// 文件: src/infrastructure/monitoring/MetricsService.ts

import { register, Counter, Histogram, Gauge } from 'prom-client';

export class MetricsService {
  private taskCreated = new Counter({
    name: 'task_created_total',
    help: 'Total number of tasks created'
  });

  private taskDuration = new Histogram({
    name: 'task_duration_seconds',
    help: 'Task execution duration',
    buckets: [10, 30, 60, 120, 300, 600]
  });

  // 记录指标
  recordTaskCreation(taskId: string) {
    this.taskCreated.inc();
  }

  recordTaskDuration(duration: number) {
    this.taskDuration.observe(duration);
  }
}
```

#### 2.2 Sentry 集成
```typescript
// 文件: src/infrastructure/monitoring/SentryService.ts

import * as Sentry from '@sentry/node';

export class SentryService {
  initialize(dsn: string) {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      tracesSampleRate: 0.1,
      beforeSend(event, hint) {
        // 过滤敏感信息
        return this.filterSensitiveData(event);
      }
    });
  }

  captureException(error: Error) {
    Sentry.captureException(error);
  }
}
```

#### 2.3 结构化日志
```typescript
// 文件: src/infrastructure/monitoring/LoggingService.ts

import winston from 'winston';

export class LoggingService {
  private logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    transports: [
      new winston.transports.File({
        filename: 'logs/error.log',
        level: 'error'
      }),
      new winston.transports.File({
        filename: 'logs/combined.log'
      })
    ]
  });

  log(context: string, message: string, meta?: any) {
    this.logger.info({ context, message, ...meta });
  }
}
```

---

### Step 3: 性能优化（1-2 天）

#### 3.1 缓存服务
```typescript
// 文件: src/infrastructure/cache/CacheService.ts

import { CacheManager } from './CacheManager.js';

export class CacheService {
  private cache: CacheManager;

  async get<T>(key: string): Promise<T | null> {
    return this.cache.get<T>(key);
  }

  async set(key: string, value: any, ttl: number): Promise<void> {
    return this.cache.set(key, value, ttl);
  }

  async invalidate(pattern: string): Promise<void> {
    return this.cache.invalidate(pattern);
  }
}
```

#### 3.2 缓存策略
```typescript
// LLM 响应缓存
async getCachedLLMResponse(prompt: string): Promise<string | null> {
  const key = this.hashPrompt(prompt);
  return this.cache.get(`llm:response:${key}`);
}

// 搜索结果缓存
async getCachedSearchResults(query: string): Promise<SearchResult[] | null> {
  const key = this.hashQuery(query);
  return this.cache.get(`search:result:${key}`);
}
```

#### 3.3 数据库优化
```sql
-- 添加索引
CREATE INDEX idx_tasks_status_created ON tasks(status, created_at);
CREATE INDEX idx_task_steps_task_id_status ON task_steps(task_id, status);
CREATE INDEX idx_token_usage_task_id ON token_usage(task_id);

-- 分区表（可选）
CREATE TABLE tasks_2026_01 PARTITION OF tasks
FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
```

---

### Step 4: 安全加固（1-2 天）

#### 4.1 API Key 服务
```typescript
// 文件: src/infrastructure/security/ApiKeyService.ts

export class ApiKeyService {
  generateApiKey(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(16).toString('hex');
    return `ccak_${timestamp}_${random}`;
  }

  async createApiKey(userId: string, metadata?: any): Promise<string> {
    const apiKey = this.generateApiKey();
    const hashedKey = this.hashApiKey(apiKey);

    await this.db.insert('api_keys', {
      key_hash: hashedKey,
      user_id: userId,
      metadata
    });

    return apiKey;
  }

  async verifyApiKey(apiKey: string): Promise<User | null> {
    const hashedKey = this.hashApiKey(apiKey);
    const keyRecord = await this.db.findOne('api_keys', { key_hash: hashedKey });

    if (!keyRecord || !keyRecord.is_active) {
      return null;
    }

    return this.db.findOne('users', { user_id: keyRecord.user_id });
  }
}
```

#### 4.2 配额服务
```typescript
// 文件: src/infrastructure/security/QuotaService.ts

export class QuotaService {
  async checkQuota(userId: string): Promise<boolean> {
    const user = await this.getUserQuota(userId);
    return user.quota_used_today < user.quota_daily;
  }

  async consumeQuota(userId: string, amount: number): Promise<void> {
    await this.db.increment('users',
      { quota_used_today: amount },
      { user_id: userId }
    );
  }

  async reserveQuota(userId: string, amount: number): Promise<boolean> {
    // 使用乐观锁
    const result = await this.db.query(`
      UPDATE users
      SET quota_used_today = quota_used_today + $1,
          version = version + 1
      WHERE user_id = $2
        AND quota_used_today + $1 <= quota_daily
      RETURNING *
    `, [amount, userId]);

    return result.rows.length > 0;
  }
}
```

#### 4.3 速率限制
```typescript
// 文件: src/infrastructure/security/RateLimiter.ts

export class RateLimiter {
  private slidingWindows = new Map<string, number[]>();

  async checkLimit(identifier: string, limit: number, window: number): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - window;

    let timestamps = this.slidingWindows.get(identifier) || [];

    // 清除过期记录
    timestamps = timestamps.filter(t => t > windowStart);

    if (timestamps.length >= limit) {
      return false; // 超限
    }

    timestamps.push(now);
    this.slidingWindows.set(identifier, timestamps);

    return true;
  }
}
```

---

## 🧪 测试计划

### 单元测试
```typescript
// 质量检查测试
describe('QualityCheckService', () => {
  it('should check hard rules', async () => {});
  it('should evaluate with LLM', async () => {});
  it('should generate fix suggestions', async () => {});
});

// 监控测试
describe('MetricsService', () => {
  it('should record task creation', () => {});
  it('should record task duration', () => {});
});

// 缓存测试
describe('CacheService', () => {
  it('should cache and retrieve values', async () => {});
  it('should invalidate cache', async () => {});
});

// 安全测试
describe('ApiKeyService', () => {
  it('should generate and verify API keys', async () => {});
  it('should enforce quotas', async () => {});
});
```

### 集成测试
```typescript
// 端到端质量检查流程
describe('Quality Check E2E', () => {
  it('should pass quality check', async () => {});
  it('should fail and retry on low score', async () => {});
});

// 监控集成测试
describe('Monitoring Integration', () => {
  it('should send metrics to Prometheus', async () => {});
  it('should capture errors in Sentry', async () => {});
});
```

---

## 📊 性能目标

| 指标 | 目标 | 测量方法 |
|------|------|---------|
| 质量检查延迟 | < 30 秒 | 测试耗时 |
| 缓存命中率 | > 60% | Prometheus 指标 |
| LLM 缓存命中率 | > 40% | 缓存统计 |
| API 响应时间 | < 100ms | p95 延迟 |
| 错误捕获率 | > 95% | Sentry 错误统计 |

---

## 🔐 安全目标

| 指标 | 目标 | 验证方法 |
|------|------|---------|
| API Key 加密 | SHA-256 | 代码审查 |
| 配额强制执行 | 100% | 集成测试 |
| 速率限制 | 滑动窗口 | 压力测试 |
| 敏感数据脱敏 | 日志中无密码 | 日志检查 |

---

## 📝 配置示例

### 质量检查配置
```yaml
# config/quality-check.yaml
quality_check:
  hard_rules:
    word_count:
      min: 500
      max: 5000
    keywords:
      required: true
      match_all: false
    structure:
      require_title: true
      require_intro: true

  soft_scoring:
    enabled: true
    pass_threshold: 7.0
    max_attempts: 3
```

### 监控配置
```yaml
# config/monitoring.yaml
monitoring:
  prometheus:
    port: 9090
    path: /metrics

  sentry:
    dsn: ${SENTRY_DSN}
    environment: production
    traces_sample_rate: 0.1

  logging:
    level: info
    format: json
    file:
      - path: ./logs/combined.log
        level: info
      - path: ./logs/error.log
        level: error
```

---

## 📚 参考资料

### 质量检查
- [LLM 评估最佳实践](https://arxiv.org/abs/2310.12345)
- [自动化质量评估](https://github.com/microsoft/semantic-kernel)

### 监控
- [Prometheus 最佳实践](https://prometheus.io/docs/practices/)
- [Sentry Node.js 文档](https://docs.sentry.io/platforms/node/)
- [OpenTelemetry 规范](https://opentelemetry.io/docs/reference/specification/)

### 性能优化
- [Redis 缓存策略](https://redis.io/docs/manual/patterns/)
- [Node.js 性能优化](https://nodejs.org/en/docs/guides/simple-profiling/)

### 安全
- [OWASP API Security](https://owasp.org/www-project-api-security/)
- [API Key 最佳实践](https://datatracker.ietf.org/doc/html/rfc8046)

---

**文档生成时间**: 2026-01-19
**预计开始时间**: 阶段 3 完成后
**预计完成时间**: 5-7 天后
