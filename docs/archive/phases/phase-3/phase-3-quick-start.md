# BullMQ 异步任务系统 - 快速开始

**阶段 3**: BullMQ 异步任务处理系统
**状态**: ✅ 核心功能完成

---

## 🎯 概述

阶段 3 实现了基于 BullMQ 的异步任务处理系统，支持：
- ✅ 任务队列管理
- ✅ 多 Worker 并发处理
- ✅ 任务优先级和延迟执行
- ✅ 失败重试和错误恢复
- ✅ Bull Board 监控面板

---

## 🚀 快速开始

### 前置要求

确保已安装并运行：
- ✅ Redis（BullMQ 队列依赖）
- ✅ PostgreSQL（可选，用于任务持久化）

### 1. 启动 Worker

在终端 1 中启动 Worker：

```bash
# 使用默认配置（Worker ID: worker-<pid>, 并发: 2）
pnpm worker

# 自定义配置
pnpm worker -w worker-1 -c 5
```

参数说明：
- `-w, --worker-id <id>`: Worker ID（默认: `worker-<pid>`）
- `-c, --concurrency <number>`: 并发数（默认: 2）

### 2. 启动监控面板

在终端 2 中启动监控面板：

```bash
# 使用默认端口 3000
pnpm monitor

# 自定义端口
pnpm monitor -p 3001
```

访问: http://localhost:3000/admin/queues

### 3. 创建任务

使用 TaskScheduler 创建任务：

```typescript
import { createTaskScheduler } from './schedulers/index.js';

const scheduler = await createTaskScheduler();

// 创建单个任务
const taskId = await scheduler.scheduleTask({
  mode: 'async',
  topic: 'AI 技术发展',
  requirements: '写一篇关于 AI 技术发展的文章',
  hardConstraints: {
    minWords: 500,
    maxWords: 1000,
    keywords: ['AI', '人工智能'],
  },
});

console.log('任务已创建:', taskId);

// 查询任务状态
const task = await repository.findById(taskId);
console.log('任务状态:', task?.status);
```

---

## 📊 监控面板

### Bull Board 功能

访问 http://localhost:3000/admin/queues 可以：

- **查看队列状态**: 等待、活跃、完成、失败的任务数
- **查看任务详情**: 点击任务查看详细信息和数据
- **重试失败任务**: 选择失败的任务点击重试
- **删除任务**: 删除不需要的任务
- **清空队列**: 批量清理任务

### 统计 API

```bash
curl http://localhost:3000/api/stats
```

返回示例：
```json
{
  "success": true,
  "data": {
    "waiting": 5,
    "active": 2,
    "completed": 100,
    "failed": 3,
    "delayed": 0,
    "repeat": 0
  }
}
```

---

## 🔧 高级用法

### 批量创建任务

```typescript
const taskIds = await scheduler.scheduleBatchTasks({
  tasks: [
    {
      mode: 'async',
      topic: '任务 1',
      requirements: '描述',
    },
    {
      mode: 'async',
      topic: '任务 2',
      requirements: '描述',
    },
  ],
});

console.log(`批量创建 ${taskIds.length} 个任务`);
```

### 延迟任务

```typescript
const taskId = await scheduler.scheduleTask({
  mode: 'async',
  topic: '延迟任务',
  requirements: '1 小时后执行',
  scheduleAt: new Date(Date.now() + 60 * 60 * 1000), // 1 小时后
});
```

### 优先级任务

```typescript
const taskId = await scheduler.scheduleTask({
  mode: 'async',
  topic: '高优先级任务',
  requirements: '立即执行',
  priority: 1, // 1-10，数字越小优先级越高
});
```

### 取消任务

```typescript
const success = await scheduler.cancelTask(taskId);
if (success) {
  console.log('任务已取消');
} else {
  console.log('任务无法取消（可能已完成或不存在）');
}
```

---

## 🧪 测试

运行集成测试：

```bash
# 运行所有测试
pnpm test

# 运行队列相关测试
pnpm test -- queue

# 运行测试并生成覆盖率报告
pnpm test:coverage
```

---

## 🏗️ 架构

### 组件关系

```
TaskScheduler → TaskQueue → Redis
                               ↓
TaskWorker ← ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
    ↓
LangGraph Workflow
    ↓
Database
```

### 任务生命周期

```
pending → processing → completed
   ↓          ↓
cancelled   failed (retry)
```

---

## 📝 配置

### 环境变量

在 `.env` 文件中配置：

```bash
# Redis 配置（必需）
REDIS_URL=redis://localhost:6379

# Worker 配置
WORKER_ID=worker-1
WORKER_CONCURRENCY=2

# 监控配置
MONITOR_PORT=3000
```

### 队列配置

默认配置（可在 `TaskQueue.ts` 中修改）：

```typescript
{
  attempts: 3,              // 重试 3 次
  backoff: {
    type: 'exponential',
    delay: 2000,            // 指数退避，初始 2 秒
  },
  removeOnComplete: {
    count: 1000,            // 保留最近 1000 个完成的任务
    age: 24 * 3600,         // 或保留 24 小时
  },
  removeOnFail: {
    count: 5000,            // 保留最近 5000 个失败的任务
    age: 7 * 24 * 3600,     // 或保留 7 天
  },
}
```

---

## 🐛 故障排查

### Worker 无法启动

**问题**: Redis 连接失败

**解决**:
```bash
# 检查 Redis 是否运行
redis-cli ping

# 检查 Redis 配置
cat .env | grep REDIS_URL
```

### 任务堆积

**问题**: 队列中任务未被处理

**解决**:
```bash
# 检查 Worker 是否运行
# 查看日志是否有错误

# 增加并发数
pnpm worker -c 5

# 启动多个 Worker
pnpm worker -w worker-1 &
pnpm worker -w worker-2 &
```

### 监控面板无法访问

**问题**: 端口被占用

**解决**:
```bash
# 使用其他端口
pnpm monitor -p 3001
```

---

## 📚 相关文档

- [阶段 3 完成总结](./phase-3-completion-summary.md)
- [BullMQ 官方文档](https://docs.bullmq.io/)
- [Bull Board 文档](https://github.com/felixmosh/bull-board)

---

## 🎉 下一步

- [ ] 完善单元测试
- [ ] 性能压测
- [ ] 部署到生产环境
- [ ] 监控和告警配置

---

**文档更新时间**: 2026-01-19
