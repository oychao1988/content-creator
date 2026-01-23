/**
 * API Key 管理服务
 *
 * 提供安全可靠的 API Key 生成、验证和管理功能
 */

import crypto from 'crypto';
import { createLogger } from '../logging/logger.js';
import { PostgresTaskRepository } from '../database/PostgresTaskRepository.js';
import { config } from '../../config/index.js';

const logger = createLogger('ApiKey');

/**
 * API Key 元数据
 */
export interface ApiKeyMetadata {
  name?: string;
  description?: string;
  scopes?: string[];
  ipAddress?: string;
  userAgent?: string;
}

/**
 * API Key 信息
 */
export interface ApiKey {
  id: string;
  keyHash: string;
  userId: string;
  metadata?: ApiKeyMetadata;
  isActive: boolean;
  expiresAt?: Date;
  lastUsedAt?: Date;
  createdAt: Date;
  usageCount: number;
}

/**
 * API Key 创建选项
 */
export interface CreateApiKeyOptions {
  userId: string;
  name?: string;
  description?: string;
  scopes?: string[];
  expiresIn?: number;  // 过期时间（秒），0 表示永不过期
}

/**
 * API Key 服务类
 */
export class ApiKeyService {
  private repo: PostgresTaskRepository;
  private algorithm = 'sha256';

  constructor() {
    this.repo = new PostgresTaskRepository(config.database.url);
  }

  /**
   * 生成 API Key
   */
  generateApiKey(): string {
    const timestamp = Date.now().toString(36);
    const randomBytes = crypto.randomBytes(16).toString('hex');
    return `ccak_${timestamp}_${randomBytes}`;
  }

  /**
   * 计算 API Key 的哈希值
   */
  private hashApiKey(apiKey: string): string {
    return crypto.createHash(this.algorithm).update(apiKey).digest('hex');
  }

  /**
   * 创建 API Key
   */
  async createApiKey(options: CreateApiKeyOptions): Promise<{ apiKey: string; apiKeyId: string }> {
    const apiKey = this.generateApiKey();
    const keyHash = this.hashApiKey(apiKey);
    const apiKeyId = crypto.randomUUID();

    const expiresAt = options.expiresIn && options.expiresIn > 0
      ? new Date(Date.now() + options.expiresIn * 1000)
      : undefined;

    try {
      // 存储到数据库
      await this.repo.query(
        `INSERT INTO api_keys (id, key_hash, user_id, metadata, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          apiKeyId,
          keyHash,
          options.userId,
          JSON.stringify({
            name: options.name,
            description: options.description,
            scopes: options.scopes,
          }),
          expiresAt,
        ]
      );

      logger.info('API key created', {
        apiKeyId,
        userId: options.userId,
        name: options.name,
        expiresAt,
      });

      return { apiKey, apiKeyId };
    } catch (error) {
      logger.error('Failed to create API key', error as Error);
      throw new Error('Failed to create API key');
    }
  }

  /**
   * 验证 API Key
   */
  async verifyApiKey(apiKey: string): Promise<{ valid: boolean; apiKey?: ApiKey; userId?: string }> {
    try {
      const keyHash = this.hashApiKey(apiKey);

      // 查询数据库
      const result = await this.repo.query(
        `SELECT id, key_hash, user_id, metadata, is_active, expires_at, last_used_at, created_at, usage_count
         FROM api_keys
         WHERE key_hash = $1`,
        [keyHash]
      );

      if (result.rows.length === 0) {
        logger.warn('API key not found', { keyHash });
        return { valid: false };
      }

      const row = result.rows[0];

      // 检查是否激活
      if (!row.is_active) {
        logger.warn('API key is inactive', { apiKeyId: row.id });
        return { valid: false };
      }

      // 检查是否过期
      if (row.expires_at && new Date(row.expires_at) < new Date()) {
        logger.warn('API key has expired', { apiKeyId: row.id, expiresAt: row.expires_at });
        return { valid: false };
      }

      // 更新最后使用时间和使用次数
      await this.repo.query(
        `UPDATE api_keys
         SET last_used_at = NOW(), usage_count = usage_count + 1
         WHERE id = $1`,
        [row.id]
      );

      const apiKeyInfo: ApiKey = {
        id: row.id,
        keyHash: row.key_hash,
        userId: row.user_id,
        metadata: row.metadata,
        isActive: row.is_active,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
        usageCount: row.usage_count,
      };

      logger.info('API key verified', {
        apiKeyId: row.id,
        userId: row.user_id,
      });

      return { valid: true, apiKey: apiKeyInfo, userId: row.user_id };
    } catch (error) {
      logger.error('Failed to verify API key', error as Error);
      return { valid: false };
    }
  }

  /**
   * 删除 API Key
   */
  async deleteApiKey(apiKeyId: string): Promise<boolean> {
    try {
      await this.repo.query(
        `DELETE FROM api_keys WHERE id = $1`,
        [apiKeyId]
      );

      logger.info('API key deleted', { apiKeyId });
      return true;
    } catch (error) {
      logger.error('Failed to delete API key', error as Error, { apiKeyId });
      return false;
    }
  }

  /**
   * 禁用 API Key
   */
  async disableApiKey(apiKeyId: string): Promise<boolean> {
    try {
      await this.repo.query(
        `UPDATE api_keys SET is_active = false WHERE id = $1`,
        [apiKeyId]
      );

      logger.info('API key disabled', { apiKeyId });
      return true;
    } catch (error) {
      logger.error('Failed to disable API key', error as Error, { apiKeyId });
      return false;
    }
  }

  /**
   * 启用 API Key
   */
  async enableApiKey(apiKeyId: string): Promise<boolean> {
    try {
      await this.repo.query(
        `UPDATE api_keys SET is_active = true WHERE id = $1`,
        [apiKeyId]
      );

      logger.info('API key enabled', { apiKeyId });
      return true;
    } catch (error) {
      logger.error('Failed to enable API key', error as Error, { apiKeyId });
      return false;
    }
  }

  /**
   * 获取用户的 API Key 列表
   */
  async getUserApiKeys(userId: string): Promise<ApiKey[]> {
    try {
      const result = await this.repo.query(
        `SELECT id, key_hash, user_id, metadata, is_active, expires_at, last_used_at, created_at, usage_count
         FROM api_keys
         WHERE user_id = $1
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows.map(row => ({
        id: row.id,
        keyHash: row.key_hash,
        userId: row.user_id,
        metadata: row.metadata,
        isActive: row.is_active,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
        usageCount: row.usage_count,
      }));
    } catch (error) {
      logger.error('Failed to get user API keys', error as Error, { userId });
      return [];
    }
  }

  /**
   * 获取 API Key 详情
   */
  async getApiKey(apiKeyId: string): Promise<ApiKey | null> {
    try {
      const result = await this.repo.query(
        `SELECT id, key_hash, user_id, metadata, is_active, expires_at, last_used_at, created_at, usage_count
         FROM api_keys
         WHERE id = $1`,
        [apiKeyId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        keyHash: row.key_hash,
        userId: row.user_id,
        metadata: row.metadata,
        isActive: row.is_active,
        expiresAt: row.expires_at,
        lastUsedAt: row.last_used_at,
        createdAt: row.created_at,
        usageCount: row.usage_count,
      };
    } catch (error) {
      logger.error('Failed to get API key', error as Error, { apiKeyId });
      return null;
    }
  }

  /**
   * 清理过期的 API Key
   */
  async cleanupExpiredKeys(): Promise<number> {
    try {
      const result = await this.repo.query(
        `DELETE FROM api_keys WHERE expires_at < NOW()`,
        []
      );

      const count = result.rowCount || 0;
      logger.info('Expired API keys cleaned up', { count });
      return count;
    } catch (error) {
      logger.error('Failed to cleanup expired API keys', error as Error);
      return 0;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.repo.query('SELECT 1', []);
      return true;
    } catch (error) {
      logger.error('API key service health check failed', error as Error);
      return false;
    }
  }
}

/**
 * API Key 服务单例
 */
export const apiKeyService = new ApiKeyService();
