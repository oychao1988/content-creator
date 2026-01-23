-- ============================================
-- Content Creator 数据库回滚脚本
-- 版本: 001 Rollback
-- 描述: 删除所有表和触发器
-- ============================================

-- ============================================
-- 1. 删除表（按照依赖关系倒序）
-- ============================================

-- 删除 token_usage 表
DROP TABLE IF EXISTS token_usage CASCADE;

-- 删除 results 表
DROP TABLE IF EXISTS results CASCADE;

-- 删除 quality_checks 表
DROP TABLE IF EXISTS quality_checks CASCADE;

-- 删除 task_steps 表
DROP TABLE IF EXISTS task_steps CASCADE;

-- 删除 tasks 表
DROP TABLE IF EXISTS tasks CASCADE;

-- 删除 users 表
DROP TABLE IF EXISTS users CASCADE;

-- ============================================
-- 2. 删除迁移记录
-- ============================================

DELETE FROM schema_migrations WHERE version = '001';

-- ============================================
-- 3. 删除触发器函数
-- ============================================

DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- ============================================
-- 回滚完成
-- ============================================

DO $$
BEGIN
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Migration 001 rollback completed!';
  RAISE NOTICE 'All tables and functions dropped.';
  RAISE NOTICE '====================================';
END $$;
