-- ============================================
-- Content Creator 数据库初始化脚本
-- 版本: 001
-- 描述: 创建所有核心表和索引
-- 注意: 简化版，不含分区策略
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. 创建触发器函数
-- ============================================

-- 自动更新 updated_at 字段的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================
-- 2. 创建 tasks 表
-- ============================================

DROP TABLE IF EXISTS tasks CASCADE;

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  task_id TEXT UNIQUE NOT NULL,
  user_id TEXT,                      -- 用户 ID（外键，可选）

  -- 执行模式和需求
  mode TEXT NOT NULL CHECK (mode IN ('sync', 'async')),
  topic TEXT NOT NULL,
  requirements TEXT NOT NULL,

  -- 硬性约束 (JSON)
  hard_constraints JSONB,

  -- 状态字段
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'waiting', 'completed', 'failed', 'cancelled')),
  current_step TEXT,
  worker_id TEXT,

  -- 重试计数
  text_retry_count INTEGER NOT NULL DEFAULT 0,
  image_retry_count INTEGER NOT NULL DEFAULT 0,

  -- 乐观锁
  version INTEGER NOT NULL DEFAULT 1,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  -- 错误和快照
  error_message TEXT,
  state_snapshot JSONB,

  -- 幂等性
  idempotency_key TEXT UNIQUE
);

-- tasks 索引
CREATE INDEX idx_tasks_user_id ON tasks(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_mode ON tasks(mode);
CREATE INDEX idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX idx_tasks_idempotency_key ON tasks(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_tasks_worker_id ON tasks(worker_id) WHERE worker_id IS NOT NULL;

-- tasks 触发器
CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 3. 创建 task_steps 表
-- ============================================

DROP TABLE IF EXISTS task_steps CASCADE;

CREATE TABLE IF NOT EXISTS task_steps (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  step_name TEXT NOT NULL CHECK (step_name IN (
    'search', 'organize', 'write', 'check_text',
    'generate_image', 'check_image'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'skipped'
  )),

  -- 尝试次数
  attempt INTEGER NOT NULL DEFAULT 1,

  -- 输入输出 (JSON)
  input_data JSONB,
  output_data JSONB,

  -- 性能指标
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INTEGER,

  -- 错误信息
  error_message TEXT,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- task_steps 索引
CREATE INDEX idx_task_steps_task_id ON task_steps(task_id);
CREATE INDEX idx_task_steps_step_name ON task_steps(step_name);
CREATE INDEX idx_task_steps_status ON task_steps(status);
CREATE INDEX idx_task_steps_created_at ON task_steps(created_at DESC);

-- ============================================
-- 4. 创建 quality_checks 表
-- ============================================

DROP TABLE IF EXISTS quality_checks CASCADE;

CREATE TABLE IF NOT EXISTS quality_checks (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('text', 'image')),

  -- 评分
  score NUMERIC(3, 2) NOT NULL CHECK (score >= 1 AND score <= 10),
  passed BOOLEAN NOT NULL,
  hard_constraints_passed BOOLEAN NOT NULL,

  -- 详情 (JSON)
  details JSONB NOT NULL,

  -- 改进建议
  fix_suggestions TEXT[],

  -- 元数据
  rubric_version TEXT,
  model_name TEXT,
  prompt_hash TEXT,

  -- 时间戳
  checked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- quality_checks 索引
CREATE INDEX idx_quality_checks_task_id ON quality_checks(task_id);
CREATE INDEX idx_quality_checks_check_type ON quality_checks(check_type);
CREATE INDEX idx_quality_checks_passed ON quality_checks(passed);
CREATE INDEX idx_quality_checks_score ON quality_checks(score);
CREATE INDEX idx_quality_checks_checked_at ON quality_checks(checked_at DESC);

-- ============================================
-- 5. 创建 results 表
-- ============================================

DROP TABLE IF EXISTS results CASCADE;

CREATE TABLE IF NOT EXISTS results (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  result_type TEXT NOT NULL CHECK (result_type IN ('article', 'image', 'text')),

  -- 内容
  content TEXT,
  file_path TEXT,

  -- 元数据 (JSON)
  metadata JSONB NOT NULL,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,

  -- 约束：一个任务只能有一种类型的结果
  UNIQUE (task_id, result_type)
);

-- results 索引
CREATE INDEX idx_results_task_id ON results(task_id);
CREATE INDEX idx_results_result_type ON results(result_type);
CREATE INDEX idx_results_created_at ON results(created_at DESC);

-- ============================================
-- 6. 创建 token_usage 表
-- ============================================

DROP TABLE IF EXISTS token_usage CASCADE;

CREATE TABLE IF NOT EXISTS token_usage (
  id SERIAL PRIMARY KEY,
  task_id TEXT NOT NULL,
  trace_id TEXT NOT NULL,
  step_name TEXT NOT NULL,
  api_name TEXT NOT NULL,
  model_name TEXT NOT NULL,

  -- Token 统计
  tokens_in INTEGER NOT NULL,
  tokens_out INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,

  -- 成本计算
  cost_per_1k_tokens_in NUMERIC(10, 6) NOT NULL,
  cost_per_1k_tokens_out NUMERIC(10, 6) NOT NULL,
  total_cost NUMERIC(10, 6) NOT NULL,

  -- 元数据 (JSON)
  metadata JSONB,

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- 外键约束
  FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
);

-- token_usage 索引
CREATE INDEX idx_token_usage_task_id ON token_usage(task_id);
CREATE INDEX idx_token_usage_trace_id ON token_usage(trace_id);
CREATE INDEX idx_token_usage_api_name ON token_usage(api_name);
CREATE INDEX idx_token_usage_created_at ON token_usage(created_at DESC);

-- 汇总索引（用于成本统计）
CREATE INDEX idx_token_usage_task_created ON token_usage(task_id, created_at DESC);

-- ============================================
-- 7. 创建 users 表（可选）
-- ============================================

DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE,
  name TEXT,

  -- 配额管理
  quota_daily INTEGER NOT NULL DEFAULT 10,
  quota_used_today INTEGER NOT NULL DEFAULT 0,

  -- 状态
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),

  -- 时间戳
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,

  -- 元数据
  metadata JSONB
);

-- users 索引
CREATE INDEX idx_users_user_id ON users(user_id);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);

-- users 触发器
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. 插入测试数据（可选）
-- ============================================

-- 插入测试用户
INSERT INTO users (user_id, email, name, quota_daily)
VALUES (
  'test-user-001',
  'test@example.com',
  'Test User',
  100
) ON CONFLICT (user_id) DO NOTHING;

-- ============================================
-- 迁移完成
-- ============================================

-- 创建迁移记录表（用于跟踪迁移历史）
CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  description TEXT,
  executed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 记录本次迁移
INSERT INTO schema_migrations (version, description)
VALUES ('001', 'Create initial tables for Content Creator')
ON CONFLICT (version) DO NOTHING;

-- 输出完成信息
DO $$
BEGIN
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Migration 001 completed successfully!';
  RAISE NOTICE 'Tables created:';
  RAISE NOTICE '  - tasks';
  RAISE NOTICE '  - task_steps';
  RAISE NOTICE '  - quality_checks';
  RAISE NOTICE '  - results';
  RAISE NOTICE '  - token_usage';
  RAISE NOTICE '  - users';
  RAISE NOTICE '====================================';
END $$;
