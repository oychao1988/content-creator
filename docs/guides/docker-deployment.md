# Docker 部署指南

> **版本**: 1.0.0
> **更新日期**: 2026-02-10
> **适用环境**: 生产环境、开发环境

本指南介绍如何使用 Docker 和 Docker Compose 部署 LLM Content Creator 系统。

## 目录

- [前置要求](#前置要求)
- [快速开始](#快速开始)
- [生产环境部署](#生产环境部署)
- [开发环境部署](#开发环境部署)
- [配置说明](#配置说明)
- [常用命令](#常用命令)
- [故障排查](#故障排查)

---

## 前置要求

### 必需软件

- **Docker**: >= 20.10
- **Docker Compose**: >= 2.0

### 验证安装

```bash
docker --version
docker-compose --version
```

### 必需配置

在部署前，需要准备以下环境变量（创建 `.env` 文件）：

```bash
# LLM 服务配置（必需）
LLM_API_KEY=your_deepseek_api_key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL_NAME=deepseek-chat

# 数据库密码（生产环境请修改）
POSTGRES_PASSWORD=your_secure_password
REDIS_PASSWORD=your_redis_password

# 可选：Tavily 和 Doubao API
TAVILY_API_KEY=your_tavily_api_key
ARK_API_KEY=your_doubao_api_key
```

---

## 快速开始

### 1. 克隆项目

```bash
git clone https://github.com/oychao1988/content-creator.git
cd content-creator
```

### 2. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑 .env 文件，填入必需的配置
nano .env
```

**最小配置示例**：

```bash
# .env 文件内容
NODE_ENV=production
DATABASE_TYPE=postgres
LLM_API_KEY=sk-your-api-key
LLM_BASE_URL=https://api.deepseek.com
POSTGRES_PASSWORD=secure_password_123
REDIS_PASSWORD=redis_password_123
```

### 3. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 4. 验证部署

```bash
# 健康检查
curl http://localhost:18100/health

# 查看 API 信息
curl http://localhost:18100/api

# 列出工作流
curl http://localhost:18100/api/workflows
```

---

## 生产环境部署

### 服务架构

生产环境包含以下服务：

| 服务 | 容器名 | 端口 | 描述 |
|------|--------|------|------|
| API 服务器 | content-creator-api | 3001 | HTTP RESTful API |
| Worker | content-creator-worker | - | 后台任务处理器 |
| PostgreSQL | content-creator-postgres | 5432 | 数据库 |
| Redis | content-creator-redis | 6379 | 缓存和队列 |
| Monitor | content-creator-monitor | 3002 | 监控面板（可选） |

### 完整部署步骤

#### 1. 准备配置文件

创建 `.env` 文件并配置所有必需的环境变量：

```bash
# ============================================
# 生产环境配置
# ============================================
NODE_ENV=production

# 数据库配置
DATABASE_TYPE=postgres
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_change_me
POSTGRES_DB=content_creator

# Redis 配置
REDIS_URL=redis://:your_redis_password_change_me@redis:6379
REDIS_PASSWORD=your_redis_password_change_me

# LLM 服务配置
LLM_API_KEY=sk-your-deepseek-api-key
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL_NAME=deepseek-chat
LLM_SERVICE_TYPE=api

# API 服务器配置
API_PORT=3001
API_HOST=0.0.0.0

# Worker 配置
WORKER_CONCURRENCY=4

# 日志配置
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# 监控配置（可选）
# SENTRY_DSN=https://your-sentry-dsn
# SENTRY_ENVIRONMENT=production
```

#### 2. 构建镜像

```bash
# 构建所有服务的镜像
docker-compose build

# 查看镜像
docker images | grep content-creator
```

#### 3. 启动服务

```bash
# 启动所有服务（后台运行）
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看实时日志
docker-compose logs -f api
```

#### 4. 初始化数据库

```bash
# 运行数据库迁移
docker-compose exec api npx tsx scripts/run-migration.ts run

# 或使用 psql 直接执行
docker-compose exec postgres psql -U postgres -d content_creator -f migrations/001_create_initial_tables.sql
```

#### 5. 验证服务

```bash
# 检查所有服务健康状态
docker-compose ps

# 测试 API 端点
curl http://localhost:18100/health

# 测试任务创建
curl -X POST http://localhost:18100/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "sync",
    "topic": "测试主题",
    "requirements": "写一篇测试文章",
    "targetAudience": "开发者"
  }'
```

#### 6. 设置监控（可选）

```bash
# 访问监控面板
open http://localhost:18101

# 或启动监控服务
docker-compose up -d monitor
```

---

## 开发环境部署

开发环境使用 `docker-compose.dev.yml`，支持热重载。

### 启动开发环境

```bash
# 使用开发配置启动
docker-compose -f docker-compose.dev.yml up -d

# 查看日志
docker-compose -f docker-compose.dev.yml logs -f app

# 进入容器进行调试
docker-compose -f docker-compose.dev.yml exec app sh
```

### 开发环境特性

- **热重载**: 代码修改自动重新加载
- **源码挂载**: 本地代码直接映射到容器
- **调试支持**: 可以进入容器进行调试
- **详细日志**: LOG_LEVEL=debug

---

## 配置说明

### 端口映射

可以在 `.env` 文件中自定义端口：

```bash
# API 服务器端口
API_PORT=8080

# PostgreSQL 端口
POSTGRES_PORT=5433

# Redis 端口
REDIS_PORT=6380

# 监控面板端口
MONITOR_PORT=3003
```

### 数据持久化

生产环境使用 Docker volumes 持久化数据：

```bash
# 查看数据卷
docker volume ls | grep content-creator

# 备份 PostgreSQL 数据
docker exec content-creator-postgres pg_dump -U postgres content_creator > backup.sql

# 备份 Redis 数据
docker exec content-creator-redis redis-cli --rdb /data/dump.rdb

# 恢复数据
docker exec -i content-creator-postgres psql -U postgres content_creator < backup.sql
```

### 资源限制

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  api:
    # ...
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

### 健康检查

所有服务都配置了健康检查：

```bash
# 查看服务健康状态
docker-compose ps

# 手动触发健康检查
docker-compose exec api curl http://localhost:18100/health
```

---

## 常用命令

### 服务管理

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose stop

# 重启服务
docker-compose restart

# 停止并删除容器
docker-compose down

# 停止并删除容器、卷
docker-compose down -v

# 重新构建并启动
docker-compose up -d --build
```

### 日志查看

```bash
# 查看所有服务日志
docker-compose logs

# 查看特定服务日志
docker-compose logs api
docker-compose logs worker
docker-compose logs postgres

# 实时跟踪日志
docker-compose logs -f api

# 查看最近 100 行日志
docker-compose logs --tail=100 api
```

### 容器操作

```bash
# 进入容器
docker-compose exec api sh
docker-compose exec postgres psql -U postgres

# 在容器中执行命令
docker-compose exec api node -e "console.log('Hello')"

# 查看容器资源使用
docker stats content-creator-api
```

### 数据库操作

```bash
# 连接 PostgreSQL
docker-compose exec postgres psql -U postgres -d content_creator

# 执行 SQL 文件
docker-compose exec -T postgres psql -U postgres -d content_creator < migration.sql

# 备份数据库
docker-compose exec postgres pg_dump -U postgres content_creator > backup.sql

# 恢复数据库
docker-compose exec -T postgres psql -U postgres content_creator < backup.sql
```

### Redis 操作

```bash
# 连接 Redis
docker-compose exec redis redis-cli -a redis123

# 查看队列状态
docker-compose exec redis redis-cli -a redis123 KEYS "bull:*"

# 清空队列
docker-compose exec redis redis-cli -a redis123 FLUSHDB
```

---

## 故障排查

### 常见问题

#### 1. 端口被占用

```bash
# 检查端口占用
lsof -i :18100
lsof -i :5432

# 修改 .env 文件中的端口
API_PORT=8080
POSTGRES_PORT=5433
```

#### 2. 容器启动失败

```bash
# 查看详细日志
docker-compose logs api

# 检查配置
docker-compose config

# 重新构建
docker-compose build --no-cache api
docker-compose up -d api
```

#### 3. 数据库连接失败

```bash
# 检查 PostgreSQL 是否就绪
docker-compose exec postgres pg_isready -U postgres

# 查看数据库日志
docker-compose logs postgres

# 测试连接
docker-compose exec api sh
$ psql postgresql://postgres:postgres@postgres:5432/content_creator
```

#### 4. Redis 连接失败

```bash
# 检查 Redis 是否就绪
docker-compose exec redis redis-cli ping

# 查看 Redis 日志
docker-compose logs redis

# 测试连接
docker-compose exec redis redis-cli -a redis123 PING
```

#### 5. Worker 无法处理任务

```bash
# 检查 Worker 日志
docker-compose logs worker

# 查看 BullMQ 队列状态
docker-compose exec redis redis-cli -a redis123 KEYS "bull:*"

# 检查 Worker 进程
docker-compose exec worker ps aux
```

### 调试技巧

#### 启用调试模式

```bash
# 修改 .env 文件
LOG_LEVEL=debug
NODE_ENV=development

# 重启服务
docker-compose restart api
docker-compose logs -f api
```

#### 查看容器内部

```bash
# 进入 API 容器
docker-compose exec api sh

# 查看文件
ls -la /app

# 查看进程
ps aux

# 测试网络
curl http://localhost:18100/health
ping postgres
ping redis
```

#### 查看资源使用

```bash
# 实时监控
docker stats

# 磁盘使用
docker system df

# 清理未使用的资源
docker system prune -a
```

---

## 安全建议

### 生产环境检查清单

- [ ] 修改所有默认密码
- [ ] 配置防火墙规则
- [ ] 启用 HTTPS（使用反向代理）
- [ ] 配置 Sentry 错误追踪
- [ ] 限制数据库和 Redis 的外部访问
- [ ] 定期备份数据
- [ ] 使用 secrets 管理敏感信息
- [ ] 配置日志轮转
- [ ] 设置资源限制
- [ ] 配置自动重启策略

### 使用 Secrets 管理敏感信息

```bash
# 创建 Docker secrets
echo "your_api_key" | docker secret create llm_api_key -
echo "your_password" | docker secret create db_password -

# 在 docker-compose.yml 中使用
services:
  api:
    secrets:
      - llm_api_key
    environment:
      LLM_API_KEY_FILE: /run/secrets/llm_api_key

secrets:
  llm_api_key:
    external: true
```

---

## 更新部署

### 更新应用

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 停止服务
docker-compose down

# 3. 重新构建镜像
docker-compose build --no-cache

# 4. 启动新版本
docker-compose up -d

# 5. 验证
curl http://localhost:18100/health
```

### 零停机部署

```bash
# 1. 构建新镜像
docker-compose build

# 2. 启动新容器（旧容器继续运行）
docker-compose up -d --no-deps --build api

# 3. 等待新容器就绪
sleep 30

# 4. 停止旧容器
docker-compose exec api kill 1
```

---

## 监控和运维

### 日志管理

```bash
# 查看日志文件
ls -lh ./logs/

# 日志轮转配置（在 docker-compose.yml 中）
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

### 性能监控

```bash
# 容器资源使用
docker stats content-creator-api content-creator-worker

# 数据库性能
docker-compose exec postgres psql -U postgres -d content_creator -c "
  SELECT * FROM pg_stat_activity WHERE datname = 'content_creator';
"

# Redis 性能
docker-compose exec redis redis-cli -a redis123 INFO stats
```

---

## 附录

### A. 环境变量完整列表

参见 `.env.example` 文件。

### B. 网络架构

```
┌─────────────┐
│   Nginx     │ (可选，反向代理)
│   :443      │
└──────┬──────┘
       │
┌──────▼──────────────────────┐
│  Docker Network             │
│  content-creator-network    │
│                             │
│  ┌──────┐  ┌──────┐        │
│  │ API  │  │Worker│        │
│  │:18100 │  │      │        │
│  └──┬───┘  └──┬───┘        │
│     │         │            │
│  ┌──▼─────────▼──┐         │
│  │  PostgreSQL   │         │
│  │    :5432      │         │
│  └───────────────┘         │
│  ┌───────────────┐         │
│  │  Redis        │         │
│  │    :6379      │         │
│  └───────────────┘         │
└─────────────────────────────┘
```

### C. 相关文档

- [HTTP API 文档](../design/http-api-design.md)
- [存储指南](../references/storage-guide.md)
- [监控优化指南](../references/monitoring-optimization-guide.md)

---

**文档维护**: 如有问题或建议，请提交 Issue 或 PR。
