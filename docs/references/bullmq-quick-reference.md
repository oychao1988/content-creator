# BullMQ 快速参考指南

**版本**: BullMQ 5.x
**更新日期**: 2026-01-19

---

## 📦 安装

```bash
# 核心依赖
pnpm add bullmq ioredis

# TypeScript 类型
pnpm add -D @types/bullmq

# 监控面板（可选）
pnpm add @bull-board/api @bull-board/express express
```

---

## 🚀 快速开始

### 1. 创建队列 (Queue)

```typescript
import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = new Redis({
  host: 'localhost',
  port: 6379,
  maxRetriesPerRequest: 3,
});

const queue = new Queue('my-queue', {
  connection,
  defaultJobOptions: {
    attempts: 3,              // 重试 3 次
    backoff: {
      type: 'exponential',
      delay: 2000,            // 初始延迟 2 秒
    },
  },
});

// 添加任务
await queue.add('my-job', {
  foo: 'bar',
  timestamp: Date.now(),
});

// 添加优先级任务
await queue.add('priority-job', { data: 'value' }, {
  priority: 1,  // 1 = 最高优先级, 10 = 默认
});

// 添加延迟任务
await queue.add('delayed-job', { data: 'value' }, {
  delay: 5000,  // 5 秒后执行
});
```

### 2. 创建 Worker

```typescript
import { Worker, Job } from 'bullmq';

interface MyJobData {
  foo: string;
  timestamp: number;
}

const worker = new Worker<MyJobData>(
  'my-queue',
  async (job: Job<MyJobData>) => {
    console.log(`Processing job ${job.id}`);
    console.log('Data:', job.data);

    // 更新进度
    await job.updateProgress(50);

    // 处理逻辑
    const result = await processJob(job.data);

    // 返回结果
    return { success: true, result };
  },
  {
    connection,
    concurrency: 5,  // 并发处理 5 个任务
  }
);

// 事件监听
worker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error.message);
});

// 优雅关闭
process.on('SIGTERM', async () => {
  await worker.close();
});
```

### 3. 任务选项 (JobsOptions)

```typescript
interface JobsOptions {
  // 重试配置
  attempts?: number;              // 重试次数
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number;                // 延迟毫秒数
  };

  // 优先级和延迟
  priority?: number;              // 1-10，数字越小优先级越高
  delay?: number;                 // 延迟执行的毫秒数

  // 任务清理
  removeOnComplete?: number | { count: number; age?: number };
  removeOnFail?: number | { count: number; age?: number };

  // 超时
  timeout?: number;               // 任务超时时间（毫秒）

  // 自定义数据
  jobId?: string;                 // 自定义 Job ID
  repeat?: RepeatOptions;         // 定时任务配置
}

// 示例
await queue.add('job-name', data, {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  priority: 1,
  timeout: 30000,  // 30 秒超时
  removeOnComplete: {
    count: 100,    // 保留最近 100 个完成的任务
    age: 3600000,  // 或保留 1 小时内的任务
  },
});
```

---

## 📊 队列统计

```typescript
// 获取各类任务数量
const waiting = await queue.getWaitingCount();    // 等待中
const active = await queue.getActiveCount();      // 执行中
const completed = await queue.getCompletedCount(); // 已完成
const failed = await queue.getFailedCount();      // 已失败
const delayed = await queue.getDelayedCount();    // 延迟中

// 获取任务列表
const jobs = await queue.getRepeatableJobs(0, 10);  // 获取前 10 个定时任务

// 清空队列
await queue.drain();  // 移除所有等待中的任务

// 暂停/恢复
await queue.pause();
await queue.resume();

// 获取队列状态
const state = await queue.getJobCounts('wait', 'active', 'completed', 'failed');
// => { wait: 10, active: 2, completed: 100, failed: 5 }
```

---

## 🔧 高级用法

### 1. Flow (工作流)

```typescript
import { FlowProducer } from 'bullmq';

const flow = new FlowProducer({ connection });

// 创建任务流（树形结构）
await flow.add({
  name: 'root-job',
  queueName: 'my-queue',
  data: { root: true },
  children: [
    {
      name: 'child-1',
      queueName: 'my-queue',
      data: { child: 1 },
      children: [
        {
          name: 'grandchild-1',
          queueName: 'my-queue',
          data: { grandchild: 1 },
        },
      ],
    },
    {
      name: 'child-2',
      queueName: 'my-queue',
      data: { child: 2 },
    },
  ],
});

// 等待所有任务完成
const { jobs } = await flow.getFlow({
  id: rootJobId,
  queueName: 'my-queue',
});
```

### 2. 定时任务 (Repeatable Jobs)

```typescript
// 添加每分钟执行的任务
await queue.add(
  'repeat-job',
  { data: 'value' },
  {
    repeat: {
      pattern: '* * * * *',  // Cron 表达式
      // 或
      every: 60000,  // 每 60 秒
      // 或
      startDate: new Date('2026-01-19T00:00:00Z'),
      endDate: new Date('2026-12-31T23:59:59Z'),
    },
  }
);

// 获取所有定时任务
const repeatableJobs = await queue.getRepeatableJobs();

// 删除定时任务
await queue.removeRepeatableByKey('repeat-job:key');
```

### 3. 速率限制 (Rate Limiting)

```typescript
const worker = new Worker('queue-name', processor, {
  connection,
  limiter: {
    max: 10,      // 最多 10 个任务
    duration: 1000,  // 每秒
  },
});
```

### 4. 事件监听

```typescript
// 队列事件
queue.on('waiting', (jobId) => {
  console.log(`Job ${jobId} is waiting`);
});

queue.on('active', (job) => {
  console.log(`Job ${job.id} is now active`);
});

queue.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

queue.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});

// Worker 事件
worker.on('ready', () => {
  console.log('Worker is ready');
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});

worker.on('stalled', (jobId) => {
  console.warn(`Job ${jobId} stalled (worker crashed)`);
});
```

---

## 🎯 最佳实践

### 1. 错误处理

```typescript
const worker = new Worker('queue', async (job) => {
  try {
    const result = await processJob(job.data);

    // 更新进度
    await job.updateProgress(100);

    return result;
  } catch (error) {
    // 记录错误日志
    logger.error('Job failed', {
      jobId: job.id,
      error: error.message,
      stack: error.stack,
    });

    // 抛出错误以触发重试
    throw error;
  }
}, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
});
```

### 2. 进度更新

```typescript
const worker = new Worker('queue', async (job) => {
  const steps = ['step1', 'step2', 'step3'];

  for (let i = 0; i < steps.length; i++) {
    await processStep(steps[i]);

    // 更新进度
    await job.updateProgress({
      current: steps[i],
      progress: ((i + 1) / steps.length) * 100,
    });
  }
});

// 监听进度
worker.on('progress', (job, progress) => {
  console.log(`Job ${job.id} progress:`, progress);
});
```

### 3. 优雅关闭

```typescript
const workers = [];

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing workers...');

  // 等待所有活跃任务完成
  await Promise.all(
    workers.map(async (worker) => {
      // 不再接受新任务
      await worker.close();
    })
  );

  console.log('All workers closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing workers...');

  // 同上
  await Promise.all(workers.map(w => w.close()));

  process.exit(0);
});
```

### 4. 任务去重

```typescript
await queue.add('unique-job', data, {
  jobId: 'custom-unique-id',  // 相同 jobId 的任务只会添加一次
});
```

---

## 🔍 调试技巧

### 1. 启用详细日志

```typescript
import { Queue, Worker } from 'bullmq';

const queue = new Queue('queue-name', {
  connection,
  settings: {
    // 获取延迟任务的间隔
    stalledInterval: 1000,
  },
});
```

### 2. 查看任务详情

```typescript
// 获取任务
const job = await queue.getJob('job-id');

console.log({
  id: job.id,
  name: job.name,
  data: job.data,
  progress: job.progress,
  attemptsMade: job.attemptsMade,
  failedReason: job.failedReason,
  stacktrace: job.stacktrace,
  returnvalue: job.returnvalue,
});

// 重新执行失败的任务
await job.retry();

// 删除任务
await job.remove();
```

### 3. 监控所有队列

```typescript
const queueList = await new Queue('default', { connection }).getList();
console.log('All queues:', queueList);
```

---

## 📝 常见问题

### Q1: 任务一直处于 waiting 状态

**原因**: Worker 没有运行或连接失败

**解决**:
```typescript
// 确保 Worker 正常运行
worker.on('ready', () => {
  console.log('Worker ready');
});

worker.on('error', (error) => {
  console.error('Worker error:', error);
});
```

### Q2: 任务重试无效

**原因**: 未设置 `attempts` 或抛出的错误类型不对

**解决**:
```typescript
// 确保设置 attempts
await queue.add('job', data, { attempts: 3 });

// 确保抛出 Error 对象
throw new Error('Something went wrong');
```

### Q3: 内存泄漏

**原因**: 未正确清理完成的任务

**解决**:
```typescript
const queue = new Queue('queue', {
  connection,
  defaultJobOptions: {
    removeOnComplete: {
      count: 1000,  // 只保留最近 1000 个
      age: 24 * 3600,  // 或保留 24 小时内的
    },
    removeOnFail: {
      count: 5000,  // 保留最近 5000 个失败的
    },
  },
});
```

### Q4: Worker 性能瓶颈

**解决**:
```typescript
// 增加并发数
const worker = new Worker('queue', processor, {
  concurrency: 10,  // 默认是 1
});

// 或启动多个 Worker 进程
// Worker 1
const worker1 = new Worker('queue', processor, { concurrency: 5 });

// Worker 2
const worker2 = new Worker('queue', processor, { concurrency: 5 });
```

---

## 🔗 有用的链接

- 官方文档: https://docs.bullmq.io/
- GitHub: https://github.com/taskforcesh/bullmq
- API 参考: https://api.docs.bullmq.io/
- 示例: https://github.com/taskforcesh/bullmq/tree/master/examples
- Bull Board: https://github.com/felixmosh/bull-board

---

**最后更新**: 2026-01-19
**适用版本**: BullMQ 5.x
