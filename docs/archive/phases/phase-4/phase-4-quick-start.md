# 阶段 4 快速开始指南

**日期**: 2026-01-19
**版本**: 1.0.0

---

## 📋 目录

1. [环境准备](#环境准备)
2. [数据库配置](#数据库配置)
3. [服务初始化](#服务初始化)
4. [使用示例](#使用示例)
5. [监控和日志](#监控和日志)
6. [常见问题](#常见问题)

---

## 环境准备

### 1. 安装依赖

```bash
pnpm install
```

已安装的依赖包括：
- `@sentry/node` - Sentry 错误追踪
- `prom-client` - Prometheus 指标采集
- `winston-daily-rotate-file` - Winston 日志轮转
- `cache-manager` + `cache-manager-ioredis` - 缓存管理

### 2. 启动 Redis

```bash
# macOS
brew install redis
brew services start redis

# Linux
sudo systemctl start redis

# Docker
docker run -d -p 6379:6379 redis:latest
```

### 3. 启动 PostgreSQL

```bash
# 确保数据库正在运行
psql -U postgres -c "SELECT version();"
```

---

## 数据库配置

### 运行迁移

创建所需的数据库表：

```sql
-- API Keys 表
CREATE TABLE IF NOT EXISTS api_keys (
  id VARCHAR(36) PRIMARY KEY,
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  metadata JSONB,
  is_active BOOLEAN DEFAULT true,
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  usage_count INT DEFAULT 0
);

-- 配额预留表
CREATE TABLE IF NOT EXISTS quota_reservations (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL,
  amount INT NOT NULL,
  consumed BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP
);

-- 更新用户表（如果不存在这些列）
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS quota_daily INT DEFAULT 100,
  ADD COLUMN IF NOT EXISTS quota_used_today INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_reserved INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 0;

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_quota_reservations_user_id ON quota_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_quota_reservations_expires_at ON quota_reservations(expires_at);
```

---

## 服务初始化

### 1. Sentry 初始化

在应用启动时初始化 Sentry：

```typescript
import { sentryService } from './infrastructure/monitoring/index.js';

sentryService.initialize({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV || 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
```

### 2. 健康检查

启动时检查各服务健康状态：

```typescript
import { cacheService, quotaService, apiKeyService, rateLimiter } from './index.js';

async function checkHealth() {
  const results = await Promise.all([
    cacheService.healthCheck(),
    quotaService.healthCheck(),
    apiKeyService.healthCheck(),
    rateLimiter.healthCheck(),
  ]);

  console.log('Health check results:', {
    cache: results[0],
    quota: results[1],
    apiKey: results[2],
    rateLimiter: results[3],
  });
}
```

---

## 使用示例

### 质量检查服务

#### 基础用法

```typescript
import { qualityCheckService } from './services/quality/index.js';

// 检查内容质量
const result = await qualityCheckService.check(
  content,
  requirements,
  {
    hardRules: {
      minWords: 500,
      maxWords: 5000,
      keywords: ['AI', '人工智能'],
      requireTitle: true,
      requireIntro: true,
    },
    softScoring: {
      enabled: true,
      passThreshold: 7.0,
      maxAttempts: 3,
    },
  }
);

if (result.passed) {
  console.log('质量检查通过！', { score: result.score });
} else {
  console.log('质量检查未通过');
  console.log('修复建议:', result.fixSuggestions);
}
```

#### 仅硬规则检查

```typescript
import { hardRuleChecker } from './services/quality/index.js';

const result = hardRuleChecker.check(content, {
  minWords: 500,
  maxWords: 5000,
  keywords: ['AI', '技术'],
  requireAllKeywords: false,
});

if (!result.passed) {
  console.log('违反的规则:', result.issues);
}
```

#### 批量检查

```typescript
const items = [
  { content: '内容1', requirements: '要求1' },
  { content: '内容2', requirements: '要求2' },
];

const results = await qualityCheckService.batchCheck(items);
```

---

### 缓存服务

#### 基础用法

```typescript
import { cacheService } from './infrastructure/cache/index.js';

// 设置缓存
await cacheService.set('user:123', { name: 'Alice', age: 30 }, 3600);

// 获取缓存
const user = await cacheService.get('user:123');
if (user) {
  console.log('缓存命中:', user);
} else {
  console.log('缓存未命中');
}

// 删除缓存
await cacheService.delete('user:123');

// 批量获取
const keys = ['user:1', 'user:2', 'user:3'];
const users = await cacheService.getMany(keys);
```

#### LLM 响应缓存

```typescript
// 检查缓存
const cachedResponse = await cacheService.getCachedLLMResponse(prompt);
if (cachedResponse) {
  return cachedResponse;
}

// 生成新响应
const response = await llmService.generateText(prompt);

// 缓存响应（7天）
await cacheService.setCachedLLMResponse(prompt, response);
```

#### 缓存统计

```typescript
const stats = await cacheService.getStats();
console.log('缓存统计:', {
  命中次数: stats.hits,
  未命中次数: stats.misses,
  命中率: `${stats.hitRate.toFixed(2)}%`,
  缓存大小: stats.size,
});
```

---

### API Key 管理

#### 创建 API Key

```typescript
import { apiKeyService } from './infrastructure/security/index.js';

const { apiKey, apiKeyId } = await apiKeyService.createApiKey({
  userId: 'user-123',
  name: 'Production Key',
  description: '用于生产环境',
  expiresIn: 30 * 24 * 3600, // 30天
});

console.log('API Key:', apiKey);  // 保存这个 Key，只显示一次！
console.log('API Key ID:', apiKeyId);
```

#### 验证 API Key

```typescript
const result = await apiKeyService.verifyApiKey(apiKey);

if (result.valid) {
  console.log('API Key 有效');
  console.log('用户 ID:', result.userId);
  console.log('API Key 详情:', result.apiKey);
} else {
  console.log('API Key 无效或已过期');
}
```

#### 管理用户 API Keys

```typescript
// 获取用户的所有 API Keys
const apiKeys = await apiKeyService.getUserApiKeys('user-123');

// 禁用某个 API Key
await apiKeyService.disableApiKey(apiKeyId);

// 启用某个 API Key
await apiKeyService.enableApiKey(apiKeyId);

// 删除某个 API Key
await apiKeyService.deleteApiKey(apiKeyId);
```

---

### 配额管理

#### 检查配额

```typescript
import { quotaService } from './infrastructure/security/index.js';

const quota = await quotaService.getUserQuota('user-123');
if (quota) {
  console.log('配额信息:', {
    每日配额: quota.quotaDaily,
    今日已用: quota.quotaUsedToday,
    已预留: quota.quotaReserved,
    可用配额: quota.quotaAvailable,
  });
}
```

#### 预留和消费配额

```typescript
// 预留配额
const { success, reservationId } = await quotaService.reserveQuota(
  'user-123',
  5,  // 需要 5 个配额
  300 // 预留 5 分钟后过期
);

if (success) {
  try {
    // 执行业务逻辑
    await performTask();

    // 消费配额
    await quotaService.consumeQuota('user-123', reservationId);
  } catch (error) {
    // 任务失败，预留会自动过期或手动释放
    console.error('任务失败:', error);
  }
}
```

#### 直接消费配额

```typescript
const success = await quotaService.consumeDirectly('user-123', 5);
if (!success) {
  console.log('配额不足');
}
```

#### 设置用户配额

```typescript
// 设置每日配额
await quotaService.setUserQuota('user-123', 200);

// 手动重置今日配额
await quotaService.resetUserQuota('user-123');
```

---

### 速率限制

#### 基础用法

```typescript
import { rateLimiter, RateLimitPresets } from './infrastructure/security/index.js';

// 使用预设配置
const result = await rateLimiter.checkLimit(
  'user-123',  // 标识符（用户 ID、IP 地址等）
  RateLimitPresets.api  // 预设配置：100 请求/分钟
);

if (result.allowed) {
  console.log('请求允许');
  console.log('剩余配额:', result.remaining);
} else {
  console.log('速率限制超出');
  console.log('请于', result.resetTime, '后重试');
  console.log('或等待', result.retryAfter, '秒');
}
```

#### 自定义配置

```typescript
const customConfig = {
  limit: 50,
  window: 60,  // 60秒
};

const result = await rateLimiter.checkLimit(
  'user-123',
  customConfig,
  'sliding-window'  // 算法：sliding-window, token-bucket, fixed-window
);
```

#### 令牌桶算法

```typescript
const config = {
  limit: 10,
  window: 60,
  burst: 20,  // 突发容量
};

const result = await rateLimiter.checkLimit('user-123', config, 'token-bucket');
```

---

## 监控和日志

### Prometheus 指标

#### 暴露指标端点

```typescript
import express from 'express';
import { metricsService } from './infrastructure/monitoring/index.js';

const app = express();

app.get('/metrics', async (req, res) => {
  const metrics = await metricsService.getMetrics();
  res.set('Content-Type', metricsService.getContentType());
  res.end(metrics);
});

app.listen(9090, () => {
  console.log('Metrics server listening on port 9090');
});
```

#### 记录指标

```typescript
// 任务指标
metricsService.recordTaskCreated('worker-1', 'async');
metricsService.recordTaskCompleted('worker-1', 'async', 35000);
metricsService.recordTaskFailed('worker-1', 'async', 'TimeoutError');

// LLM 指标
metricsService.recordLLMRequest('deepseek-chat', 'generation');
metricsService.recordLLMRequestDuration('deepseek-chat', 'generation', 2500);
metricsService.recordLLMTokenUsage('deepseek-chat', 'prompt', 1500);
metricsService.recordLLMTokenUsage('deepseek-chat', 'completion', 500);

// 缓存指标
metricsService.recordCacheHit('llm-response');
metricsService.recordCacheMiss('llm-response');
```

### Sentry 错误追踪

#### 捕获异常

```typescript
import { sentryService } from './infrastructure/monitoring/index.js';

try {
  // 业务逻辑
} catch (error) {
  sentryService.captureException(error as Error, {
    user: { id: 'user-123', email: 'user@example.com' },
    tags: {
      component: 'quality-check',
      environment: 'production',
    },
    extra: {
      taskId: 'task-456',
      contentLength: content.length,
    },
  });
}
```

#### 性能追踪

```typescript
const transaction = sentryService.startTransaction({
  op: 'quality-check',
  name: 'Full Quality Check',
});

try {
  // 执行操作
  await performQualityCheck();
} finally {
  transaction?.finish();
}
```

### 日志服务

#### 基础日志

```typescript
import { loggingService } from './infrastructure/monitoring/index.js';

loggingService.debug('Debug message', { data: 'value' });
loggingService.info('Info message');
loggingService.warn('Warning message', { warning: 'details' });
loggingService.error('Error message', error, { context: 'details' });
```

#### 性能日志

```typescript
const startTime = Date.now();
await performOperation();
const duration = Date.now() - startTime;

loggingService.performance('operation-name', duration, {
  taskId: 'task-123',
  success: true,
});
```

#### 子日志器

```typescript
const logger = loggingService.child('QualityCheck');
logger.info('Quality check started', { taskId: 'task-123' });
```

---

## 常见问题

### Q1: Redis 连接失败怎么办？

**A**: 检查 Redis 是否正在运行：

```bash
redis-cli ping
# 应该返回 PONG
```

如果 Redis 未运行，启动它：

```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis
```

### Q2: Sentry 不上报错误？

**A**: 确保：
1. 已设置 `SENTRY_DSN` 环境变量
2. 已调用 `sentryService.initialize()`
3. 检查网络连接

### Q3: 缓存命中率低怎么办？

**A**: 优化策略：
1. 增加 TTL 时间
2. 使用更精确的缓存键
3. 分析缓存未命中的原因
4. 考虑预热缓存

### Q4: 速率限制太严格？

**A**: 调整配置：

```typescript
const customConfig = {
  limit: 200,  // 增加限制
  window: 60,
};
```

### Q5: 如何测试这些服务？

**A**: 编写单元测试：

```typescript
import { describe, it, expect } from 'vitest';
import { hardRuleChecker } from './services/quality/index.js';

describe('HardRuleChecker', () => {
  it('should check word count', () => {
    const content = 'This is a test content.';
    const result = hardRuleChecker.check(content, {
      minWords: 3,
      maxWords: 10,
    });

    expect(result.passed).toBe(true);
  });
});
```

---

## 下一步

1. ✅ 阅读 [阶段4完成总结](./phase-4-completion-summary.md)
2. ✅ 运行数据库迁移
3. ✅ 编写测试用例
4. ✅ 部署到测试环境
5. ✅ 监控和优化

---

**文档版本**: 1.0.0
**更新日期**: 2026-01-19
