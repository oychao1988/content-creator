/**
 * 配额管理服务
 *
 * 提供用户配额检查、预留、消费和重置功能
 * 使用乐观锁确保并发安全
 */

import crypto from 'crypto';
import { createLogger } from '../logging/logger.js';
import { BaseRepository } from '../database/BaseRepository.js';
import { metricsService } from '../monitoring/MetricsService.js';

const logger = createLogger('Quota');

/**
 * 配额信息
 */
export interface QuotaInfo {
  userId: string;
  quotaDaily: number;      // 每日配额
  quotaUsedToday: number;  // 今日已用配额
  quotaReserved: number;   // 已预留配额
  quotaAvailable: number;  // 可用配额
  lastResetAt: Date;       // 上次重置时间
}

/**
 * 配额预留
 */
export interface QuotaReservation {
  id: string;
  userId: string;
  amount: number;
  createdAt: Date;
  expiresAt: Date;
}

/**
 * 配额服务类
 */
export class QuotaService extends BaseRepository {
  private defaultQuota: number = 100; // 默认每日配额

  constructor() {
    super();
  }

  /**
   * 获取用户配额信息
   */
  async getUserQuota(userId: string): Promise<QuotaInfo | null> {
    try {
      // 先检查是否需要重置今日配额
      await this.resetIfNeed(userId);

      const result = await this.query(
        `SELECT user_id, quota_daily, quota_used_today, quota_reserved, last_reset_at
         FROM users
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        logger.warn('User not found', { userId });
        return null;
      }

      const row = result.rows[0] as any;
      const quotaDaily = row.quota_daily || this.defaultQuota;
      const quotaUsedToday = row.quota_used_today || 0;
      const quotaReserved = row.quota_reserved || 0;
      const quotaAvailable = quotaDaily - quotaUsedToday - quotaReserved;

      return {
        userId: row.user_id,
        quotaDaily,
        quotaUsedToday,
        quotaReserved,
        quotaAvailable,
        lastResetAt: row.last_reset_at,
      };
    } catch (error) {
      logger.error('Failed to get user quota', error as Error, { userId });
      return null;
    }
  }

  /**
   * 检查是否有足够配额
   */
  async checkQuota(userId: string, amount: number = 1): Promise<boolean> {
    const quota = await this.getUserQuota(userId);

    if (!quota) {
      return false;
    }

    return quota.quotaAvailable >= amount;
  }

  /**
   * 预留配额（使用乐观锁）
   */
  async reserveQuota(userId: string, amount: number, ttl: number = 300): Promise<{ success: boolean; reservationId?: string }> {
    try {
      // 先检查是否有足够配额
      const hasEnough = await this.checkQuota(userId, amount);
      if (!hasEnough) {
        logger.warn('Insufficient quota for reservation', { userId, amount });
        return { success: false };
      }

      // 使用乐观锁预留配额
      const result = await this.query(
        `UPDATE users
         SET quota_reserved = quota_reserved + $1,
             version = version + 1
         WHERE user_id = $2
           AND quota_daily - quota_used_today - quota_reserved >= $1
         RETURNING quota_reserved, quota_daily, quota_used_today`,
        [amount, userId]
      );

      if (result.rows.length === 0) {
        logger.warn('Failed to reserve quota (concurrent modification)', { userId, amount });
        return { success: false };
      }

      const reservationId = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + ttl * 1000);

      // 记录预留
      await this.query(
        `INSERT INTO quota_reservations (id, user_id, amount, created_at, expires_at)
         VALUES ($1, $2, $3, NOW(), $4)`,
        [reservationId, userId, amount, expiresAt]
      );

      logger.info('Quota reserved', {
        reservationId,
        userId,
        amount,
        expiresAt,
      });

      metricsService.recordCacheSet('quota_reservation');

      return { success: true, reservationId };
    } catch (error) {
      logger.error('Failed to reserve quota', error as Error, { userId, amount });
      return { success: false };
    }
  }

  /**
   * 消费预留的配额
   */
  async consumeQuota(userId: string, reservationId: string): Promise<boolean> {
    try {
      // 获取预留信息
      const reservationResult = await this.query(
        `SELECT id, user_id, amount, expires_at
         FROM quota_reservations
         WHERE id = $1 AND user_id = $2 AND consumed = false`,
        [reservationId, userId]
      );

      if (reservationResult.rows.length === 0) {
        logger.warn('Quota reservation not found or already consumed', { reservationId, userId });
        return false;
      }

      const reservation = reservationResult.rows[0] as any;

      // 检查是否过期
      if (new Date(reservation.expires_at) < new Date()) {
        logger.warn('Quota reservation expired', { reservationId, expiresAt: reservation.expires_at });
        // 释放预留
        await this.releaseQuota(userId, reservation.amount);
        // 标记为已消费（虽然实际没消费）
        await this.query(
          `UPDATE quota_reservations SET consumed = true WHERE id = $1`,
          [reservationId]
        );
        return false;
      }

      // 使用事务确保原子性
      await this.query('BEGIN', []);

      try {
        // 减少预留配额
        await this.query(
          `UPDATE users
           SET quota_reserved = quota_reserved - $1,
               quota_used_today = quota_used_today + $1,
               version = version + 1
           WHERE user_id = $2`,
          [reservation.amount, userId]
        );

        // 标记预留为已消费
        await this.query(
          `UPDATE quota_reservations
           SET consumed = true, consumed_at = NOW()
           WHERE id = $1`,
          [reservationId]
        );

        await this.query('COMMIT', []);

        logger.info('Quota consumed', {
          reservationId,
          userId,
          amount: reservation.amount,
        });

        metricsService.recordCacheDelete('quota_reservation');

        return true;
      } catch (error) {
        await this.query('ROLLBACK', []);
        throw error;
      }
    } catch (error) {
      logger.error('Failed to consume quota', error as Error, { userId, reservationId });
      return false;
    }
  }

  /**
   * 直接消费配额（无预留）
   */
  async consumeDirectly(userId: string, amount: number): Promise<boolean> {
    try {
      const result = await this.query(
        `UPDATE users
         SET quota_used_today = quota_used_today + $1,
             version = version + 1
         WHERE user_id = $2
           AND quota_daily - quota_used_today >= $1
         RETURNING quota_used_today`,
        [amount, userId]
      );

      if (result.rows.length === 0) {
        logger.warn('Failed to consume quota directly (insufficient quota)', { userId, amount });
        return false;
      }

      logger.info('Quota consumed directly', { userId, amount });
      return true;
    } catch (error) {
      logger.error('Failed to consume quota directly', error as Error, { userId, amount });
      return false;
    }
  }

  /**
   * 释放预留的配额
   */
  async releaseQuota(userId: string, amount: number): Promise<boolean> {
    try {
      await this.query(
        `UPDATE users
         SET quota_reserved = GREATEST(0, quota_reserved - $1),
             version = version + 1
         WHERE user_id = $2`,
        [amount, userId]
      );

      logger.info('Quota released', { userId, amount });
      return true;
    } catch (error) {
      logger.error('Failed to release quota', error as Error, { userId, amount });
      return false;
    }
  }

  /**
   * 重置用户今日配额
   */
  private async resetIfNeed(userId: string): Promise<void> {
    try {
      const result = await this.query(
        `SELECT user_id, last_reset_at, quota_used_today
         FROM users
         WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return;
      }

      const lastReset = new Date((result.rows[0] as any).last_reset_at);
      const now = new Date();

      // 如果上次重置不是今天，则重置
      if (lastReset.toDateString() !== now.toDateString()) {
        await this.query(
          `UPDATE users
           SET quota_used_today = 0,
               last_reset_at = NOW()
           WHERE user_id = $1`,
          [userId]
        );

        logger.info('User quota reset', { userId });
      }
    } catch (error) {
      logger.error('Failed to reset quota', error as Error, { userId });
    }
  }

  /**
   * 手动重置用户配额
   */
  async resetUserQuota(userId: string): Promise<boolean> {
    try {
      await this.query(
        `UPDATE users
         SET quota_used_today = 0,
           quota_reserved = 0,
           last_reset_at = NOW()
         WHERE user_id = $1`,
        [userId]
      );

      logger.info('User quota manually reset', { userId });
      return true;
    } catch (error) {
      logger.error('Failed to manually reset user quota', error as Error, { userId });
      return false;
    }
  }

  /**
   * 设置用户每日配额
   */
  async setUserQuota(userId: string, quotaDaily: number): Promise<boolean> {
    try {
      await this.query(
        `UPDATE users
         SET quota_daily = $1
         WHERE user_id = $2`,
        [quotaDaily, userId]
      );

      logger.info('User daily quota updated', { userId, quotaDaily });
      return true;
    } catch (error) {
      logger.error('Failed to set user quota', error as Error, { userId, quotaDaily });
      return false;
    }
  }

  /**
   * 清理过期的配额预留
   */
  async cleanupExpiredReservations(): Promise<number> {
    try {
      // 获取过期的预留
      const result = await this.query(
        `SELECT id, user_id, amount
         FROM quota_reservations
         WHERE expires_at < NOW() AND consumed = false`,
        []
      );

      const expired = result.rows as any[];

      // 释放预留
      for (const row of expired) {
        await this.releaseQuota(row.user_id, row.amount);
      }

      // 标记为已消费（实际未消费）
      await this.query(
        `UPDATE quota_reservations
         SET consumed = true
         WHERE expires_at < NOW() AND consumed = false`,
        []
      );

      logger.info('Expired quota reservations cleaned up', { count: expired.length });
      return expired.length;
    } catch (error) {
      logger.error('Failed to cleanup expired reservations', error as Error);
      return 0;
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1', []);
      return true;
    } catch (error) {
      logger.error('Quota service health check failed', error as Error);
      return false;
    }
  }
}

/**
 * 配额服务单例
 */
export const quotaService = new QuotaService();
