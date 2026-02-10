# ============================================
# Makefile for Docker Commands
# ============================================

.PHONY: help build up down restart logs ps clean db-backup db-restore

# 默认目标
help:
	@echo "Available commands:"
	@echo "  make build       - Build Docker images"
	@echo "  make up          - Start all services"
	@echo "  make down        - Stop all services"
	@echo "  make restart     - Restart all services"
	@echo "  make logs        - View logs (all services)"
	@echo "  make logs-api    - View API logs"
	@echo "  make logs-worker - View Worker logs"
	@echo "  make ps          - Show service status"
	@echo "  make clean       - Remove containers and volumes"
	@echo "  make db-backup   - Backup PostgreSQL database"
	@echo "  make db-restore  - Restore PostgreSQL database"
	@echo "  make dev         - Start development environment"
	@echo "  make prod        - Start production environment"
	@echo "  make test        - Run health check"

# 构建镜像
build:
	@echo "Building Docker images..."
	docker-compose build

# 启动生产环境
prod:
	@echo "Starting production environment..."
	docker-compose up -d
	@echo "Services started. Check status with: make ps"

# 启动开发环境
dev:
	@echo "Starting development environment..."
	docker-compose -f docker-compose.dev.yml up -d
	@echo "Dev services started. Check status with: make ps"

# 启动所有服务
up:
	@echo "Starting all services..."
	docker-compose up -d
	@echo "Waiting for services to be ready..."
	sleep 10
	@echo "Services started. Check status with: make ps"

# 停止所有服务
down:
	@echo "Stopping all services..."
	docker-compose down
	@echo "Services stopped."

# 重启服务
restart:
	@echo "Restarting all services..."
	docker-compose restart
	@echo "Services restarted."

# 查看所有日志
logs:
	docker-compose logs -f

# 查看 API 日志
logs-api:
	docker-compose logs -f api

# 查看 Worker 日志
logs-worker:
	docker-compose logs -f worker

# 查看服务状态
ps:
	@echo "Service status:"
	docker-compose ps

# 健康检查
test:
	@echo "Running health check..."
	@curl -s http://localhost:3001/health | python3 -m json.tool || echo "Health check failed"

# 清理容器和卷
clean:
	@echo "Stopping and removing containers..."
	docker-compose down -v
	@echo "Removing unused images..."
	docker image prune -f
	@echo "Cleanup complete."

# 数据库备份
db-backup:
	@echo "Backing up PostgreSQL database..."
	@mkdir -p backups
	@docker exec content-creator-postgres pg_dump -U postgres content_creator > backups/backup_$$(date +%Y%m%d_%H%M%S).sql
	@echo "Backup completed."

# 数据库恢复
db-restore:
	@echo "Available backups:"
	@ls -lh backups/
	@echo "\nTo restore, use: docker exec -i content-creator-postgres psql -U postgres content_creator < backups/backup_file.sql"

# 查看资源使用
stats:
	docker stats content-creator-api content-creator-worker

# 进入 API 容器
shell-api:
	docker-compose exec api sh

# 进入数据库
shell-db:
	docker-compose exec postgres psql -U postgres -d content_creator

# 进入 Redis
shell-redis:
	docker-compose exec redis redis-cli -a redis123
