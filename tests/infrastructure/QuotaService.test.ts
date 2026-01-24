/**
 * QuotaService 测试
 *
 * 测试配额管理服务的各项功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QuotaService } from '../../src/infrastructure/security/QuotaService.js';

// Mock PostgresTaskRepository
vi.mock('../../src/infrastructure/database/PostgresTaskRepository.js', () => {
  const mockQuery = vi.fn();

  return {
    PostgresTaskRepository: class {
      constructor(url: string) {
        // Mock constructor
      }

      query = mockQuery;
    },
    __getMockQuery: () => mockQuery,
  };
});

// Mock BaseRepository with query method
vi.mock('../../src/infrastructure/database/BaseRepository.js', () => {
  const mockQuery = vi.fn();

  return {
    BaseRepository: class {
      constructor(pool: any) {
        // Mock constructor
      }

      query = mockQuery;
    },
    __getMockQuery: () => mockQuery,
  };
});

// Mock config
vi.mock('../../src/config/index.js', () => ({
  config: {
    database: {
      url: 'postgresql://test',
    },
    logging: {
      level: 'info',
    },
  },
}));

// Mock logger
vi.mock('../../src/infrastructure/logging/logger.js', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

// Mock MetricsService
vi.mock('../../src/infrastructure/monitoring/MetricsService.js', () => ({
  metricsService: {
    recordCacheSet: vi.fn(),
    recordCacheDelete: vi.fn(),
  },
}));

// Get the mock query function
const getMockQuery = (await import('../../src/infrastructure/database/BaseRepository.js') as any)
  .__getMockQuery;

describe('QuotaService', () => {
  let quotaService: QuotaService;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockQuery = getMockQuery();
    mockQuery.mockClear();
    quotaService = new QuotaService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('获取用户配额信息', () => {
    it('应该成功获取用户配额信息', async () => {
      const mockRow = {
        user_id: 'user-123',
        quota_daily: 100,
        quota_used_today: 20,
        quota_reserved: 10,
        last_reset_at: new Date(),
      };

      // resetIfNeed 先调用查询，然后 getUserQuota 再次查询
      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] }) // resetIfNeed
        .mockResolvedValueOnce({ rows: [mockRow] }); // getUserQuota

      const result = await quotaService.getUserQuota('user-123');

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
      expect(result?.quotaDaily).toBe(100);
      expect(result?.quotaUsedToday).toBe(20);
      expect(result?.quotaReserved).toBe(10);
      expect(result?.quotaAvailable).toBe(70); // 100 - 20 - 10
    });

    it('应该使用默认配额当用户配额未设置时', async () => {
      const mockRow = {
        user_id: 'user-123',
        quota_daily: null, // 未设置
        quota_used_today: 0,
        quota_reserved: 0,
        last_reset_at: new Date(),
      };

      // resetIfNeed + getUserQuota
      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await quotaService.getUserQuota('user-123');

      expect(result?.quotaDaily).toBe(100); // 默认配额
    });

    it('应该在用户不存在时返回 null', async () => {
      // resetIfNeed 查询返回空，表示用户不存在
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await quotaService.getUserQuota('nonexistent-user');

      expect(result).toBeNull();
    });

    it('应该在数据库错误时返回 null', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await quotaService.getUserQuota('user-123');

      expect(result).toBeNull();
    });
  });

  describe('检查配额', () => {
    it('应该在有足够配额时返回 true', async () => {
      const mockRow = {
        user_id: 'user-123',
        quota_daily: 100,
        quota_used_today: 20,
        quota_reserved: 10,
        last_reset_at: new Date(),
      };

      // resetIfNeed + getUserQuota
      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await quotaService.checkQuota('user-123', 50);

      expect(result).toBe(true); // 100 - 20 - 10 = 70 >= 50
    });

    it('应该在配额不足时返回 false', async () => {
      const mockRow = {
        user_id: 'user-123',
        quota_daily: 100,
        quota_used_today: 80,
        quota_reserved: 10,
        last_reset_at: new Date(),
      };

      // resetIfNeed + getUserQuota
      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await quotaService.checkQuota('user-123', 20);

      expect(result).toBe(false); // 100 - 80 - 10 = 10 < 20
    });

    it('应该默认检查 1 个单位的配额', async () => {
      const mockRow = {
        user_id: 'user-123',
        quota_daily: 100,
        quota_used_today: 99,
        quota_reserved: 0,
        last_reset_at: new Date(),
      };

      // resetIfNeed + getUserQuota
      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await quotaService.checkQuota('user-123');

      expect(result).toBe(true); // 100 - 99 - 0 = 1 >= 1
    });
  });

  describe('预留配额', () => {
    it('应该成功预留配额', async () => {
      // Mock getUserQuota 内部的查询 + UPDATE 返回值
      const mockRow = { user_id: 'user-123', quota_daily: 100, quota_used_today: 20, quota_reserved: 0, last_reset_at: new Date(), version: 1 };
      const updatedRow = { ...mockRow, quota_reserved: 10, version: 2 };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] }) // resetIfNeed
        .mockResolvedValueOnce({ rows: [mockRow] }) // getUserQuota
        .mockResolvedValueOnce({ rows: [updatedRow] }) // UPDATE 返回
        .mockResolvedValueOnce({ rows: [] }); // INSERT reservation

      const result = await quotaService.reserveQuota('user-123', 10, 300);

      expect(result.success).toBe(true);
      expect(result.reservationId).toBeDefined();
    });

    it('应该在配额不足时预留失败', async () => {
      const mockRow = { user_id: 'user-123', quota_daily: 100, quota_used_today: 95, quota_reserved: 5, last_reset_at: new Date() };
      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] })
        .mockResolvedValueOnce({ rows: [mockRow] });

      const result = await quotaService.reserveQuota('user-123', 10, 300);

      expect(result.success).toBe(false);
      expect(result.reservationId).toBeUndefined();
    });

    it('应该在数据库错误时预留失败', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await quotaService.reserveQuota('user-123', 10, 300);

      expect(result.success).toBe(false);
    });
  });

  describe('直接消费配额', () => {
    it('应该成功直接消费配额', async () => {
      mockQuery.mockResolvedValue({ rows: [{ quota_used_today: 30 }] });

      const result = await quotaService.consumeDirectly('user-123', 10);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.arrayContaining([10, 'user-123'])
      );
    });

    it('应该在配额不足时消费失败', async () => {
      mockQuery.mockResolvedValue({ rows: [] }); // UPDATE 没有返回任何行

      const result = await quotaService.consumeDirectly('user-123', 10);

      expect(result).toBe(false);
    });

    it('应该在数据库错误时消费失败', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await quotaService.consumeDirectly('user-123', 10);

      expect(result).toBe(false);
    });
  });

  describe('释放配额', () => {
    it('应该成功释放配额', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await quotaService.releaseQuota('user-123', 10);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.arrayContaining([10, 'user-123'])
      );
    });

    it('应该在数据库错误时释放失败', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await quotaService.releaseQuota('user-123', 10);

      expect(result).toBe(false);
    });
  });

  describe('重置用户配额', () => {
    it('应该成功手动重置用户配额', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await quotaService.resetUserQuota('user-123');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        expect.arrayContaining(['user-123'])
      );
    });

    it('应该在数据库错误时重置失败', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await quotaService.resetUserQuota('user-123');

      expect(result).toBe(false);
    });
  });

  describe('设置用户配额', () => {
    it('应该成功设置用户每日配额', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await quotaService.setUserQuota('user-123', 200);

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        [200, 'user-123']
      );
    });

    it('应该在数据库错误时设置失败', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await quotaService.setUserQuota('user-123', 200);

      expect(result).toBe(false);
    });
  });

  describe('清理过期预留', () => {
    it('应该成功清理过期的预留', async () => {
      const expiredRows = [
        { id: 'res-1', user_id: 'user-1', amount: 10 },
        { id: 'res-2', user_id: 'user-2', amount: 20 },
      ];

      mockQuery.mockResolvedValue({ rows: expiredRows });

      const count = await quotaService.cleanupExpiredReservations();

      expect(count).toBe(2);
    });

    it('应该在没有过期预留时返回 0', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const count = await quotaService.cleanupExpiredReservations();

      expect(count).toBe(0);
    });

    it('应该在数据库错误时返回 0', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const count = await quotaService.cleanupExpiredReservations();

      expect(count).toBe(0);
    });
  });

  describe('健康检查', () => {
    it('应该在数据库连接正常时返回 true', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await quotaService.healthCheck();

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1', []);
    });

    it('应该在数据库错误时返回 false', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const result = await quotaService.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('消费预留配额', () => {
    it('应该成功消费预留的配额', async () => {
      const reservationRow = {
        id: 'res-123',
        user_id: 'user-123',
        amount: 10,
        expires_at: new Date(Date.now() + 3600000), // 1小时后过期
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [reservationRow] }) // SELECT reservation
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE users
        .mockResolvedValueOnce({ rows: [] }) // UPDATE reservation
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      const result = await quotaService.consumeQuota('user-123', 'res-123');

      expect(result).toBe(true);
    });

    it('应该在预留不存在时消费失败', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await quotaService.consumeQuota('user-123', 'nonexistent-res');

      expect(result).toBe(false);
    });

    it('应该在预留过期时消费失败', async () => {
      const expiredReservation = {
        id: 'res-123',
        user_id: 'user-123',
        amount: 10,
        expires_at: new Date(Date.now() - 10000), // 10秒前过期
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [expiredReservation] }) // SELECT reservation
        .mockResolvedValueOnce({ rows: [] }) // releaseQuota
        .mockResolvedValueOnce({ rows: [] }); // UPDATE consumed

      const result = await quotaService.consumeQuota('user-123', 'res-123');

      expect(result).toBe(false);
    });
  });

  describe('配额计算', () => {
    it('应该正确计算可用配额', async () => {
      const mockRow = {
        user_id: 'user-123',
        quota_daily: 100,
        quota_used_today: 30,
        quota_reserved: 20,
        last_reset_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await quotaService.getUserQuota('user-123');

      expect(result?.quotaAvailable).toBe(50); // 100 - 30 - 20
    });

    it('应该处理负数配额情况', async () => {
      const mockRow = {
        user_id: 'user-123',
        quota_daily: 50,
        quota_used_today: 30,
        quota_reserved: 25, // 总共超出配额
        last_reset_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await quotaService.getUserQuota('user-123');

      expect(result?.quotaAvailable).toBe(-5); // 50 - 30 - 25 = -5
    });
  });

  describe('并发安全', () => {
    it('应该处理并发的配额检查', async () => {
      const mockRow = {
        user_id: 'user-123',
        quota_daily: 100,
        quota_used_today: 50,
        quota_reserved: 0,
        last_reset_at: new Date(),
      };

      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(quotaService.checkQuota('user-123', 5));
      }

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toBe(true); // 100 - 50 - 0 = 50 >= 5
      });
    });

    it('应该处理并发的配额预留', async () => {
      // Mock 所有调用返回成功
      mockQuery.mockResolvedValue({ rows: [{ quota_reserved: 10 }] });

      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(quotaService.reserveQuota('user-123', 10));
      }

      const results = await Promise.all(promises);

      // 验证所有预留都返回了结果
      results.forEach(result => {
        expect(result).toHaveProperty('success');
        expect(typeof result.success).toBe('boolean');
      });
    });
  });
});
