#!/bin/bash
# 使用Docker exec运行数据库迁移的脚本

set -e

echo "🚀 开始运行数据库迁移..."

# 执行迁移文件
echo "📄 执行迁移: 001_create_initial_tables.sql"
docker exec -i postgres-db psql -U postgres -d postgres < migrations/001_create_initial_tables.sql

echo "✅ 数据库迁移完成!"

# 验证表
echo ""
echo "📊 验证表结构..."
docker exec postgres-db psql -U postgres -d postgres -c "\dt"

echo ""
echo "🎉 所有表创建成功!"
