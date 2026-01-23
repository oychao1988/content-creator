-- 阶段 4: 质量检查与监控优化 - 数据库迁移
-- 创建 API Keys、配额管理所需的表结构

-- Migration: 20260119_phase_4_security_tables
-- Date: 2026-01-19
-- Description: Create tables for API key management, quota management

-- ================================
-- 1. API Keys 表
-- ================================

CREATE TABLE IF NOT EXISTS api_keys (
  -- 主键
  id VARCHAR(36) PRIMARY KEY,

  -- API Key 哈希值（SHA-256）
  key_hash VARCHAR(64) UNIQUE NOT NULL,

  -- 关联用户
  user_id VARCHAR(36) NOT NULL,

  -- 元数据（JSON 格式）
  metadata JSONB,

  -- 状态
  is_active BOOLEAN DEFAULT true,

  -- 过期时间
  expires_at TIMESTAMP,

  -- 使用追踪
  last_used_at TIMESTAMP,
  usage_count INT DEFAULT 0,

  -- 审计字段
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- 约束
  CONSTRAINT fk_api_keys_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires_at ON api_keys(expires_at);

-- 注释
COMMENT ON TABLE api_keys IS 'API Key 管理表';
COMMENT ON COLUMN api_keys.key_hash IS 'API Key 的 SHA-256 哈希值';
COMMENT ON COLUMN api_keys.metadata IS 'API Key 元数据（名称、描述、作用域等）';
COMMENT ON COLUMN api_keys.expires_at IS '过期时间，NULL 表示永不过期';


-- ================================
-- 2. 配额预留表
-- ================================

CREATE TABLE IF NOT EXISTS quota_reservations (
  -- 主键
  id VARCHAR(36) PRIMARY KEY,

  -- 关联用户
  user_id VARCHAR(36) NOT NULL,

  -- 预留数量
  amount INT NOT NULL,

  -- 消费状态
  consumed BOOLEAN DEFAULT false,

  -- 时间戳
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP,

  -- 约束
  CONSTRAINT fk_quota_reservations_user FOREIGN KEY (user_id)
    REFERENCES users(user_id) ON DELETE CASCADE,

  CONSTRAINT chk_quota_reservations_amount CHECK (amount > 0),
  CONSTRAINT chk_quota_reservations_expires CHECK (expires_at > created_at)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_quota_reservations_user_id ON quota_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_quota_reservations_expires_at ON quota_reservations(expires_at);
CREATE INDEX IF NOT EXISTS idx_quota_reservations_consumed ON quota_reservations(consumed);

-- 注释
COMMENT ON TABLE quota_reservations IS '配额预留表';
COMMENT ON COLUMN quota_reservations.amount IS '预留的配额数量';
COMMENT ON COLUMN quota_reservations.consumed IS '是否已被消费';
COMMENT ON COLUMN quota_reservations.expires_at IS '预留过期时间，超时未消费则释放';


-- ================================
-- 3. 更新用户表（添加配额字段）
-- ================================

-- 添加每日配额列
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS quota_daily INT DEFAULT 100,
  ADD COLUMN IF NOT EXISTS quota_used_today INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_reserved INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reset_at TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS version INT DEFAULT 0;

-- 添加约束
ALTER TABLE users
  ADD CONSTRAINT chk_users_quota_daily CHECK (quota_daily >= 0),
  ADD CONSTRAINT chk_users_quota_used_today CHECK (quota_used_today >= 0),
  ADD CONSTRAINT chk_users_quota_reserved CHECK (quota_reserved >= 0),
  ADD CONSTRAINT chk_users_quota_usage CHECK (
    quota_used_today + quota_reserved <= quota_daily
  );

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_quota_daily ON users(quota_daily);

-- 添加注释
COMMENT ON COLUMN users.quota_daily IS '每日配额上限';
COMMENT ON COLUMN users.quota_used_today IS '今日已使用的配额';
COMMENT ON COLUMN users.quota_reserved IS '已预留但未消费的配额';
COMMENT ON COLUMN users.last_reset_at IS '上次重置配额的时间';
COMMENT ON COLUMN users.version IS '乐观锁版本号';


-- ================================
-- 4. 创建清理过期数据的函数
-- ================================

CREATE OR REPLACE FUNCTION cleanup_expired_data()
RETURNS TABLE (
  expired_keys_deleted INT,
  expired_reservations_deleted INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_expired_keys INT;
  v_expired_reservations INT;
BEGIN
  -- 删除过期的 API Keys
  DELETE FROM api_keys
  WHERE expires_at < NOW()
    AND is_active = false;

  GET DIAGNOSTICS v_expired_keys = ROW_COUNT;

  -- 标记过期的配额预留为已消费（实际未消费）
  UPDATE quota_reservations
  SET consumed = true
  WHERE expires_at < NOW()
    AND consumed = false;

  GET DIAGNOSTICS v_expired_reservations = ROW_COUNT;

  -- 返回清理结果
  RETURN QUERY SELECT v_expired_keys, v_expired_reservations;
END;
$$;

COMMENT ON FUNCTION cleanup_expired_data IS '清理过期的 API Keys 和配额预留';


-- ================================
-- 5. 创建触发器（自动更新 updated_at）
-- ================================

-- API Keys 表的更新触发器
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_api_keys_updated_at
  BEFORE UPDATE ON api_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_api_keys_updated_at();


-- ================================
-- 6. 创建视图（用于查询）
-- ================================

-- API Keys 使用统计视图
CREATE OR REPLACE VIEW v_api_key_usage_stats AS
SELECT
  user_id,
  COUNT(*) as total_keys,
  SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_keys,
  SUM(usage_count) as total_usage,
  MAX(last_used_at) as last_used_at
FROM api_keys
GROUP BY user_id;

COMMENT ON VIEW v_api_key_usage_stats IS 'API Key 使用统计视图';


-- 用户配额状态视图
CREATE OR REPLACE VIEW v_user_quota_status AS
SELECT
  user_id,
  quota_daily,
  quota_used_today,
  quota_reserved,
  (quota_daily - quota_used_today - quota_reserved) as quota_available,
  CASE
    WHEN (quota_daily - quota_used_today - quota_reserved) <= 0 THEN 'exceeded'
    WHEN (quota_daily - quota_used_today - quota_reserved) < quota_daily * 0.1 THEN 'low'
    ELSE 'ok'
  END as quota_status,
  last_reset_at
FROM users
ORDER BY quota_used_today DESC;

COMMENT ON VIEW v_user_quota_status IS '用户配额状态视图';


-- ================================
-- 迁移完成
-- ================================

-- 记录迁移完成
DO $$
BEGIN
  RAISE NOTICE 'Phase 4 security tables migration completed successfully';
  RAISE NOTICE 'Created tables: api_keys, quota_reservations';
  RAISE NOTICE 'Updated table: users (added quota columns)';
  RAISE NOTICE 'Created functions: cleanup_expired_data()';
  RAISE NOTICE 'Created views: v_api_key_usage_stats, v_user_quota_status';
END $$;
