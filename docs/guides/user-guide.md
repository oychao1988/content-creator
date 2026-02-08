# Content Creator - 用户操作手册

**项目版本**: 0.2.0
**更新日期**: 2026-02-08
**适用对象**: 开发者、运维人员、用户

---

## 📖 目录

1. [项目简介](#项目简介)
2. [快速开始](#快速开始)
3. [环境配置](#环境配置)
4. [安装部署](#安装部署)
5. [使用指南](#使用指南)
6. [CLI 命令详解](#cli-命令详解)
7. [API 接口](#api-接口)
8. [常见问题](#常见问题)
9. [故障排除](#故障排除)
10. [最佳实践](#最佳实践)

---

## 📋 项目简介

Content Creator 是一个基于 LLM 的智能内容创作系统，支持：

- ✅ **多语言文章生成** - 支持中英文内容创作
- ✅ **智能搜索集成** - Tavily API 实时搜索
- ✅ **质量自动检查** - AI 质量评估和改进建议
- ✅ **配图自动生成** - Doubao API 智能配图
- ✅ **任务队列管理** - BullMQ 异步任务处理
- ✅ **完整监控体系** - Prometheus + Sentry
- ✅ **缓存优化** - Redis 三层缓存策略
- ✅ **Webhook 回调** - 任务完成时实时通知 🆕

### 技术栈

- **后端框架**: Node.js + TypeScript
- **工作流引擎**: LangGraph
- **数据库**: PostgreSQL 18.1
- **缓存**: Redis 3.2.12
- **LLM 服务**: DeepSeek API
- **搜索服务**: Tavily API
- **图片服务**: Doubao API

---

## 🚀 快速开始

### 5 分钟快速体验

```bash
# 1. 克隆项目
git clone <repository-url>
cd content-creator

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入你的 API keys

# 4. 运行数据库迁移
pnpm run db:migrate

# 5. 创建第一个任务
pnpm run cli create \
  --topic "人工智能的未来" \
  --requirements "写一篇关于 AI 未来发展的文章" \
  --audience "技术爱好者" \
  --image-size "2560x1440" \
  --mode sync
```

### Docker 快速启动

```bash
# 启动 PostgreSQL 和 Redis
docker-compose up -d

# 运行项目
pnpm run dev
```

---

## ⚙️ 环境配置

### 必需的环境变量

创建 `.env` 文件并配置以下变量：

```bash
# ==========================================
# PostgreSQL 数据库配置
# ==========================================
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# ==========================================
# Redis 配置
# ==========================================
REDIS_URL=redis://:password@localhost:6379

# ==========================================
# LLM 服务 (DeepSeek)
# ==========================================
LLM_API_KEY=sk-xxxxxxxxxxxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL_NAME=deepseek-chat
LLM_MAX_TOKENS=4000
LLM_TEMPERATURE=0.7

# ==========================================
# 搜索服务 (Tavily)
# ==========================================
TAVILY_API_KEY=tvly-xxxxxxxxxxxx

# ==========================================
# 图片服务 (Doubao/字节跳动)
# ==========================================
ARK_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx

# ==========================================
# 数据库类型
# ==========================================
DATABASE_TYPE=postgres  # 可选: memory | postgres | sqlite

# ==========================================
# 日志配置
# ==========================================
LOG_LEVEL=info  # 可选: error | warn | info | debug
LOG_FILE=./logs/app.log

# ==========================================
# 可选监控配置
# ==========================================
SENTRY_DSN=https://xxxxx@xxxx.ingest.sentry.io/xxxxx
SENTRY_ENVIRONMENT=production
```

### 获取 API Keys

#### 1. DeepSeek API Key
- 访问: https://platform.deepseek.com
- 注册/登录账号
- 进入 "API Keys" 页面
- 创建新 API Key
- 复制到 `.env` 文件的 `LLM_API_KEY`

#### 2. Tavily API Key
- 访问: https://tavily.com
- 注册/登录账号
- 进入 "API Keys" 页面
- 创建免费 Developer Key
- 复制到 `.env` 文件的 `TAVILY_API_KEY`

#### 3. Doubao API Key
- 访问: https://ark.cn.volcengine.com
- 注册/登录字节云账号
- 进入 "API 密钥管理"
- 创建 API Key
- 复制到 `.env` 文件的 `ARK_API_KEY`

---

## 📦 安装部署

### 系统要求

- **Node.js**: v18.0 或更高
- **pnpm**: v8.0 或更高
- **PostgreSQL**: v14 或更高
- **Redis**: v6 或更高

### 安装步骤

#### 1. 安装 Node.js 和 pnpm

```bash
# macOS
brew install node
npm install -g pnpm

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
npm install -g pnpm

# Windows
# 下载并安装 Node.js: https://nodejs.org/
npm install -g pnpm
```

#### 2. 安装项目依赖

```bash
cd content-creator
pnpm install
```

#### 3. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置文件
nano .env  # 或使用其他编辑器
```

#### 4. 安装数据库

##### PostgreSQL

```bash
# 使用 Docker
docker run --name postgres-db \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -v /data/postgres:/var/lib/postgresql/data \
  -d postgres:16

# 或使用本地安装
# macOS
brew install postgresql
brew services start postgresql

# Ubuntu
sudo apt-get install postgresql
sudo systemctl start postgresql
```

##### Redis

```bash
# 使用 Docker
docker run --name redis \
  -p 6379:6379 \
  -d redis:7-alpine

# 或使用本地安装
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt-get install redis-server
sudo systemctl start redis
```

#### 5. 运行数据库迁移

```bash
pnpm run db:migrate
```

#### 6. 验证环境

```bash
# 检查所有环境变量和服务连接
pnpm run verify-env
```

### 开发模式启动

```bash
# 启动开发服务器（带热重载）
pnpm run dev

# 启动监控面板
pnpm run monitor
```

### 生产模式启动

```bash
# 构建项目
pnpm run build

# 启动生产服务
pnpm run start
```

---

## 📖 使用指南

### 方式一：CLI 命令行（推荐）

#### 创建内容创作任务

```bash
pnpm run cli create \
  --topic "文章主题" \
  --requirements "创作要求" \
  --audience "目标受众" \
  --tone "语气风格" \
  --keywords "关键词1,关键词2" \
  --min-words 500 \
  --max-words 2000 \
  --mode sync
```

#### 参数说明

| 参数 | 说明 | 必填 | 默认值 |
|------|------|------|---------|
| `--topic` | 文章主题 | ✅ | - |
| `--requirements` | 创作要求 | ✅ | - |
| `--audience` | 目标受众 | ❌ | 普通读者 |
| `--tone` | 语气风格 | ❌ | 专业 |
| `--keywords` | 关键词（逗号分隔） | ❌ | - |
| `--min-words` | 最小字数 | ❌ | 500 |
| `--max-words` | 最大字数 | ❌ | 2000 |
| `--image-size` | 图片尺寸（如 1920x1080） | ❌ | 1920x1920 |
| `--mode` | 执行模式 (sync\|async) | ❌ | sync |
| `--sync` | 同步执行（等待结果） | ❌ | false |
| `--callback-url` | Webhook 回调 URL 🆕 | ❌ | - |
| `--callback-events` | 触发回调的事件（逗号分隔） 🆕 | ❌ | completed,failed |

#### 示例

##### 示例 1：技术博客文章

```bash
pnpm run cli create \
  --topic "TypeScript 5.0 新特性解析" \
  --requirements "详细介绍 TypeScript 5.0 的新特性、改进和迁移指南" \
  --audience "前端开发者" \
  --tone "技术专业" \
  --keywords "TypeScript,JavaScript,前端开发" \
  --min-words 1000 \
  --max-words 2000 \
  --mode sync
```

##### 示例 2：生活类文章

```bash
pnpm run cli create \
  --topic "健康生活方式建议" \
  --requirements "提供实用的健康生活建议，包括饮食、运动和睡眠" \
  --audience "普通读者" \
  --tone "亲切友好" \
  --keywords "健康,生活,养生" \
  --min-words 800 \
  --max-words 1200 \
  --mode sync
```

### 方式二：程序化调用

#### 使用 SyncExecutor

```typescript
import { createSyncExecutor } from './application/workflow/SyncExecutor.js';
import { PostgresTaskRepository } from './infrastructure/database/PostgresTaskRepository.js';

// 创建执行器
const taskRepo = new PostgresTaskRepository();
const executor = createSyncExecutor(taskRepo, {
  databaseType: 'postgres',
  enableLogging: true,
  logLevel: 'info',
});

// 执行任务
const result = await executor.execute({
  id: 'task-001',
  mode: 'sync',
  topic: '人工智能发展趋势',
  requirements: '写一篇关于 AI 发展趋势的文章',
  targetAudience: '技术爱好者',
  keywords: ['AI', '人工智能', '技术发展'],
  tone: '专业',
  hardConstraints: {
    minWords: 800,
    maxWords: 1500,
  },
  priority: 'normal',
  idempotencyKey: 'unique-key-001',
});

console.log('任务完成:', result);
console.log('文章内容:', result.finalState.articleContent);
console.log('配图 URL:', result.finalState.imageUrl);
```

#### 配置 Webhook 回调 🆕

**什么是 Webhook 回调？**

Webhook 回调功能允许 Content Creator 在任务完成或失败时主动向外部系统发送 HTTP 通知，实现实时通知，无需轮询查询任务状态。

**基本用法**：

```bash
# 使用 Webhook 回调
pnpm run cli create \
  --topic "AI 技术" \
  --requirements "写一篇关于 AI 技术的文章" \
  --mode async \
  --callback-url "http://your-server.com/api/callback" \
  --callback-events "completed,failed"
```

**参数说明**：

- `--callback-url`: 接收回调的完整 URL
- `--callback-events`: 触发回调的事件类型（逗号分隔），默认为 `completed,failed`

**支持的事件类型**：

- `submitted` - 任务提交到队列
- `started` - 任务开始执行
- `progress` - 任务进度更新
- `completed` - 任务成功完成
- `failed` - 任务失败
- `cancelled` - 任务被取消

**配置示例**：

```bash
# 仅监听成功完成事件
pnpm run cli create \
  --topic "AI 技术" \
  --callback-url "http://your-server.com/callback" \
  --callback-events "completed"

# 监听多个事件
pnpm run cli create \
  --topic "AI 技术" \
  --callback-url "http://your-server.com/callback" \
  --callback-events "submitted,started,progress,completed,failed"
```

**环境变量配置**：

在 `.env` 文件中可以配置全局 Webhook 设置：

```bash
# .env 文件
CALLBACK_ENABLED=true                    # 是否启用回调
CALLBACK_TIMEOUT=10                     # 回调超时（秒）
CALLBACK_RETRY_COUNT=3                  # 失败重试次数
CALLBACK_RETRY_DELAY=5                  # 重试延迟（秒）
```

**接收回调示例**：

```javascript
// Node.js (Express)
const express = require('express');
const app = express();

app.use(express.json());

app.post('/api/callback', (req, res) => {
  const { event, taskId, result, error } = req.body;

  if (event === 'completed') {
    console.log('✅ 任务成功完成');
    console.log('任务 ID:', taskId);
    console.log('内容质量:', result.qualityScore);
    // 保存到数据库或发送通知
  } else if (event === 'failed') {
    console.error('❌ 任务失败');
    console.error('错误信息:', error.message);
    // 发送告警或记录错误
  }

  res.status(200).json({ success: true });
});

app.listen(3000, () => {
  console.log('回调服务器运行在 http://localhost:3000');
});
```

**详细文档**：

- 📖 [Webhook 回调使用指南](./webhook-guide.md) - 完整的使用说明和最佳实践
- 🔧 [Webhook 功能设计](../design/webhook-callback-feature.md) - 技术设计文档

---

## 💻 CLI 命令详解

### create - 创建任务

```bash
pnpm run cli create [options]
```

**示例**:

```bash
# 同步执行（推荐用于测试）
pnpm run cli create \
  --topic "主题" \
  --requirements "要求" \
  --mode sync

# 异步执行（推荐用于生产）
pnpm run cli create \
  --topic "主题" \
  --requirements "要求" \
  --mode async
```

### 其他 CLI 命令

#### 查看历史任务列表

```bash
# 查看最近 20 个任务（默认）
pnpm run cli list

# 查看最近 10 个任务
pnpm run cli list --limit 10

# 只查看已完成的任务
pnpm run cli list --status completed

# 只查看失败的任务
pnpm run cli list --status failed

# 只查看异步任务
pnpm run cli list --mode async

# 查看第 2 页（分页）
pnpm run cli list --offset 20

# 以 JSON 格式输出（方便脚本处理）
pnpm run cli list --json
```

**显示内容**：
- 任务主题
- 任务 ID
- 当前状态（等待中/运行中/已完成/失败）
- 执行模式（同步/异步）
- 创建时间（智能相对时间）
- 执行耗时
- 错误信息（如果失败）

#### 重新执行任务

```bash
# 重新执行单个任务
pnpm run cli retry --task-id <任务ID>

# 批量重新执行所有等待任务
pnpm run cli retry --all

# 批量重新执行失败任务
pnpm run cli retry --all --status failed

# 模拟运行（预览但不实际执行）
pnpm run cli retry --all --dry-run

# 限制处理数量
pnpm run cli retry --all --limit 5
```

**使用场景**：
- Worker 临时停止导致任务堆积
- 任务创建时队列不可用
- 失败的任务需要重试
- 想要重新执行历史任务

#### 查看任务状态

```bash
pnpm run cli status --task-id <task-id>
```

#### 获取任务结果

```bash
pnpm run cli result --task-id <task-id>
```

#### 取消任务

```bash
pnpm run cli cancel --task-id <task-id>
```

#### 监控面板 (Monitor)

**启动监控面板**:

```bash
# 启动 BullMQ 监控面板（默认端口 3000）
pnpm run monitor

# 指定端口启动
npx tsx src/presentation/monitor-cli.ts start -p 3001
```

**访问 Web UI**:

启动后访问: `http://localhost:3000/admin/queues`

**功能特性**:
- ✅ **实时队列监控** - 查看待处理、执行中、已完成、失败的任务
- ✅ **任务详情查看** - 查看任务数据、堆栈跟踪、执行日志
- ✅ **任务管理** - 手动重试失败任务、删除任务、暂停/恢复队列
- ✅ **队列统计** - 实时查看队列状态和任务数量
- ✅ **错误追踪** - 查看失败任务的原因和错误信息

**API 端点**:

```bash
# 健康检查
curl http://localhost:3000/health

# 获取队列统计
curl http://localhost:3000/api/stats
```

**使用场景**:
- 监控异步任务执行状态
- 查看失败任务并进行手动重试
- 清理堆积的任务队列
- 调试任务执行问题

---

## 🔌 API 接口

### HTTP API（待实现）

项目支持 HTTP API 接口（开发中），可提供 RESTful API 调用。

### Webhook 集成

支持任务状态变更的 Webhook 通知（配置 `SENTRY_DSN`）。

---

## ❓ 常见问题

### Q1: 如何批量创建任务？

使用程序化调用或编写脚本：

```bash
# 创建批量脚本
for topic in "AI发展" "区块链应用" "云计算趋势"; do
  pnpm run cli create \
    --topic "$topic" \
    --requirements "详细介绍 $topic" \
    --mode sync
done
```

### Q2: 如何自定义 LLM 模型？

修改 `.env` 文件：

```bash
LLM_MODEL_NAME=deepseek-chat  # 或其他模型
LLM_MAX_TOKENS=8000          # 增加 Token 限制
LLM_TEMPERATURE=0.3           # 降低创造性（更确定性）
```

### Q3: 如何禁用搜索功能？

创建任务时设置：

```bash
pnpm run cli create \
  --topic "主题" \
  --requirements "要求"
  # --no-search  # 暂不支持此参数
```

或在代码中设置 `useCache: true` 强制使用缓存。

### Q4: 如何查看任务历史？

使用 CLI 命令：

```bash
# 查看最近的任务
pnpm run cli list

# 查看失败的任务
pnpm run cli list --status failed

# 以 JSON 格式输出
pnpm run cli list --json
```

或直接查询数据库：

```bash
# 使用 psql
psql -h localhost -U postgres -d postgres

# 查询任务
SELECT * FROM tasks ORDER BY created_at DESC LIMIT 10;
```

### Q5: 如何导出生成的内容？

从 CLI 输出复制内容，或使用：

```typescript
// 保存到文件
import fs from 'fs';
fs.writeFileSync('article.md', result.finalState.articleContent);
```

---

## 🔧 故障排除

### 问题 1: 环境变量未找到

**错误**:
```
Environment variable validation failed: POSTGRES_HOST is not set
```

**解决**:
1. 检查 `.env` 文件是否存在
2. 确认变量名拼写正确
3. 运行 `pnpm run verify-env` 检查

### 问题 2: 数据库连接失败

**错误**:
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**解决**:
1. 确认 PostgreSQL 正在运行
2. 检查端口配置（`POSTGRES_PORT`）
3. 验证用户名和密码
4. 检查防火墙设置

### 问题 3: Redis 连接失败

**错误**:
```
Error: Redis connection to 150.158.88.23:6379 failed
```

**解决**:
1. 确认 Redis 正在运行
2. 检查 `REDIS_URL` 格式
3. 验证密码（如果有）
4. 测试连接: `redis-cli -h 150.158.88.23 -p 6379`

### 问题 4: API 调用失败

**错误**:
```
Error: Search API error: 401 - Unauthorized
```

**解决**:
1. 验证 API Key 是否正确
2. 检查 API Key 是否过期
3. 确认账户配额未用完
4. 查看服务商状态页

### 问题 5: 字数超限

**错误**:
```
Error: Word count exceeded: 2500 > 2000
```

**解决**:
1. 增加 `--max-words` 限制
2. 在要求中明确字数范围
3. 调整 `LLM_TEMPERATURE`（更低更保守）

### 问题 6: 内容质量不达标

**现象**: 文本质检未通过

**解决**:
1. 优化创作要求，提供更多细节
2. 调整目标受众描述
3. 使用 `--tone` 明确语气风格
4. 重新运行任务（系统会自动改进）

### 问题 7: 图片生成失败

**错误**:
```
Error: Image generation failed: insufficient quota
```

**解决**:
1. 检查 Doubao API 配额
2. 更新 `ARK_API_KEY`
3. 使用备用图片源（如配置）

---

## 🎯 最佳实践

### 1. 任务创建

✅ **推荐做法**:
- 提供详细的创作要求
- 明确目标受众和语气
- 设置合理的字数范围
- 使用相关关键词

❌ **避免**:
- 要求过于模糊
- 字数限制过于严格
- 目标受众不明确

### 2. 性能优化

- ✅ 启用 Redis 缓存
- ✅ 使用异步模式批量处理
- ✅ 合理设置并发数（`WORKER_CONCURRENCY`）
- ✅ 定期清理过期数据

### 3. 成本控制

- ✅ 设置 `LLM_MAX_TOKENS` 限制
- ✅ 启用缓存减少 API 调用
- ✅ 监控 Token 使用量
- ✅ 定期检查 API 账单

### 4. 安全建议

- ✅ 不要提交 `.env` 文件到 Git
- ✅ 定期轮换 API Keys
- ✅ 使用环境变量管理密钥
- ✅ 启用日志脱敏
- ✅ 配置 Sentry 监控安全事件

### 5. 生产部署

- ✅ 使用 `DATABASE_TYPE=postgres`
- ✅ 启用 Sentry 错误追踪
- ✅ 配置 Prometheus 监控
- ✅ 使用 Docker 容器化部署
- ✅ 设置负载均衡
- ✅ 配置自动重启

---

## 📊 监控和维护

### 查看系统状态

```bash
# 环境检查
pnpm run verify-env

# 数据库状态
pnpm run db:status
```

### Monitor 监控面板

**启动监控面板**:

```bash
# 启动 Monitor（推荐）
pnpm run monitor

# 指定端口
npx tsx src/presentation/monitor-cli.ts start -p 3001
```

**访问地址**:
- Web UI: http://localhost:3000/admin/queues
- 健康检查: http://localhost:3000/health
- 队列统计: http://localhost:3000/api/stats

**监控面板功能**:

1. **队列概览**
   - Waiting（等待中）- 待处理的任务
   - Active（执行中）- 正在执行的任务
   - Completed（已完成）- 成功完成的任务
   - Failed（失败）- 执行失败的任务
   - Delayed（延迟）- 延迟执行的任务

2. **任务操作**
   - 查看任务详情（点击任务 ID）
   - 重试失败任务（Retry 按钮）
   - 删除任务（Delete 按钮）
   - 查看任务日志和堆栈跟踪

3. **队列管理**
   - 暂停队列（Pause 按钮）
   - 恢复队列（Resume 按钮）
   - 清空队列（Clean all 按钮）
   - 批量操作失败任务

4. **性能监控**
   - 任务处理速度
   - 队列堆积情况
   - 失败率统计
   - Worker 性能指标

### 日志查看

```bash
# 查看应用日志
tail -f ./logs/app.log

# 搜索错误日志
grep "error" ./logs/app.log

# 查看 Monitor 日志
tail -f ./logs/app.log | grep BullBoard
```

### 性能指标

访问 Prometheus 监控（如果配置）：
- 任务执行时间
- API 调用频率
- 缓存命中率
- 错误率

### 常用监控组合

```bash
# 终端 1: 启动监控面板
pnpm run monitor

# 终端 2: 启动 Worker
pnpm run worker

# 终端 3: 创建异步任务
pnpm run cli create --topic "测试" --requirements "测试描述" --mode async

# 浏览器: 访问 http://localhost:3000/admin/queues 观察任务执行
```

---

## 📞 技术支持

### 问题反馈

如遇到问题，请提供以下信息：

1. 操作系统和版本
2. Node.js 版本
3. 错误信息完整日志
4. 复现步骤
5. `.env` 配置（脱敏）

### 获取帮助

- 查看项目文档: `docs/` 目录
- 查看 API 文档: `docs/api/` 目录
- 查看测试示例: `examples/` 目录

---

## 📚 相关文档

- [架构设计文档](./架构设计文档.md)
- [API 接口文档](./API接口文档.md)
- [部署指南](./部署指南.md)
- [测试报告](./test-report.md)

---

**文档版本**: 1.0
**最后更新**: 2026-01-20
**维护者**: Content Creator Team
