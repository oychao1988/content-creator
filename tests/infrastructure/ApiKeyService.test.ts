/**
 * ApiKeyService 测试
 *
 * 测试 API Key 管理服务的各项功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { ApiKeyService, ApiKey } from '../../src/infrastructure/security/ApiKeyService.js';

// Mock PostgresTaskRepository
vi.mock('../../src/infrastructure/database/PostgresTaskRepository.js', () => {
  const mockQuery = vi.fn();

  return {
    PostgresTaskRepository: class {
      constructor(url: string) {
        // Mock constructor - don't create real connection
      }

      query = mockQuery;
    },
    // Export mockQuery for test access
    __getMockQuery: () => mockQuery,
  };
});

// Mock BaseRepository to prevent pool initialization
vi.mock('../../src/infrastructure/database/BaseRepository.js', () => {
  return {
    BaseRepository: class {
      constructor(pool: any) {
        // Mock constructor
      }
    },
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

// Get the mock query function
const getMockQuery = (await import('../../src/infrastructure/database/PostgresTaskRepository.js') as any)
  .__getMockQuery;

describe('ApiKeyService', () => {
  let apiKeyService: ApiKeyService;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    // 不使用 vi.clearAllMocks()，因为它会重置 mock 函数本身
    // 只重置调用历史
    mockQuery = getMockQuery();
    mockQuery.mockClear();
    apiKeyService = new ApiKeyService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('API Key 生成', () => {
    it('应该生成符合格式的 API Key', () => {
      const apiKey = apiKeyService.generateApiKey();

      expect(apiKey).toBeDefined();
      expect(typeof apiKey).toBe('string');
      expect(apiKey).toMatch(/^ccak_[a-z0-9]+_[a-f0-9]{32}$/);
    });

    it('应该生成唯一的 API Key', () => {
      const keys = new Set();

      for (let i = 0; i < 100; i++) {
        keys.add(apiKeyService.generateApiKey());
      }

      expect(keys.size).toBe(100);
    });

    it('应该包含时间戳部分', () => {
      const beforeTime = Date.now();
      const apiKey = apiKeyService.generateApiKey();
      const afterTime = Date.now();

      const parts = apiKey.split('_');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('ccak');

      // 验证时间戳部分
      const timestamp = parseInt(parts[1], 36);
      expect(timestamp).toBeGreaterThanOrEqual(Math.floor(beforeTime / 1000) * 1000);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('应该包含随机部分', () => {
      const apiKey = apiKeyService.generateApiKey();
      const parts = apiKey.split('_');

      expect(parts[2]).toBeDefined();
      expect(parts[2].length).toBe(32); // 16 bytes = 32 hex chars
    });
  });

  describe('API Key 创建', () => {
    it('应该成功创建 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await apiKeyService.createApiKey({
        userId: 'user-123',
        name: 'Test Key',
        description: 'Test API key',
        scopes: ['read', 'write'],
      });

      expect(result).toBeDefined();
      expect(result.apiKey).toBeDefined();
      expect(result.apiKeyId).toBeDefined();
      expect(result.apiKey).toMatch(/^ccak_[a-z0-9]+_[a-f0-9]{32}$/);
      expect(mockQuery).toHaveBeenCalled();
    });

    it('应该创建带有过期时间的 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const expiresIn = 3600; // 1 小时
      const beforeTime = Date.now();
      const result = await apiKeyService.createApiKey({
        userId: 'user-123',
        expiresIn,
      });
      const afterTime = Date.now();

      expect(result.apiKey).toBeDefined();

      const insertCall = mockQuery.mock.calls[0];
      const expiresAt = insertCall[1][4]; // 第五个参数是 expiresAt

      expect(expiresAt).toBeInstanceOf(Date);
      const expiresTime = expiresAt.getTime();
      const expectedMin = beforeTime + expiresIn * 1000;
      const expectedMax = afterTime + expiresIn * 1000;
      expect(expiresTime).toBeGreaterThanOrEqual(expectedMin);
      expect(expiresTime).toBeLessThanOrEqual(expectedMax);
    });

    it('应该创建永不过期的 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await apiKeyService.createApiKey({
        userId: 'user-123',
        expiresIn: 0,
      });

      expect(result.apiKey).toBeDefined();

      const insertCall = mockQuery.mock.calls[0];
      const expiresAt = insertCall[1][4];

      expect(expiresAt).toBeUndefined();
    });

    it('应该存储正确的元数据', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await apiKeyService.createApiKey({
        userId: 'user-123',
        name: 'Test Key',
        description: 'Test Description',
        scopes: ['read', 'write', 'delete'],
      });

      const insertCall = mockQuery.mock.calls[0];
      const metadata = JSON.parse(insertCall[1][3]);

      expect(metadata.name).toBe('Test Key');
      expect(metadata.description).toBe('Test Description');
      expect(metadata.scopes).toEqual(['read', 'write', 'delete']);
    });

    it('应该在数据库错误时抛出异常', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        apiKeyService.createApiKey({
          userId: 'user-123',
        })
      ).rejects.toThrow('Failed to create API key');
    });

    it('应该生成不同的 key hash', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result1 = await apiKeyService.createApiKey({ userId: 'user-123' });
      const result2 = await apiKeyService.createApiKey({ userId: 'user-123' });

      expect(result1.apiKey).not.toBe(result2.apiKey);

      const hash1Call = mockQuery.mock.calls[0];
      const hash2Call = mockQuery.mock.calls[1];
      expect(hash1Call[1][1]).not.toBe(hash2Call[1][1]); // key hashes should be different
    });
  });

  describe('API Key 验证', () => {
    it('应该验证有效的 API Key', async () => {
      const mockRow = {
        id: 'key-123',
        key_hash: 'hash123',
        user_id: 'user-123',
        metadata: { name: 'Test Key' },
        is_active: true,
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        usage_count: 0,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] }) // SELECT query
        .mockResolvedValueOnce({ rows: [] }); // UPDATE query

      const result = await apiKeyService.verifyApiKey('valid-api-key');

      expect(result.valid).toBe(true);
      expect(result.apiKey).toBeDefined();
      expect(result.userId).toBe('user-123');
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('应该拒绝不存在的 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await apiKeyService.verifyApiKey('invalid-key');

      expect(result.valid).toBe(false);
      expect(result.apiKey).toBeUndefined();
      expect(result.userId).toBeUndefined();
    });

    it('应该拒绝已禁用的 API Key', async () => {
      const mockRow = {
        id: 'key-123',
        key_hash: 'hash123',
        user_id: 'user-123',
        metadata: {},
        is_active: false, // 被禁用
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        usage_count: 0,
      };

      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await apiKeyService.verifyApiKey('disabled-key');

      expect(result.valid).toBe(false);
      expect(result.apiKey).toBeUndefined();
    });

    it('应该拒绝过期的 API Key', async () => {
      const mockRow = {
        id: 'key-123',
        key_hash: 'hash123',
        user_id: 'user-123',
        metadata: {},
        is_active: true,
        expires_at: new Date(Date.now() - 10000), // 10秒前过期
        last_used_at: null,
        created_at: new Date(),
        usage_count: 0,
      };

      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await apiKeyService.verifyApiKey('expired-key');

      expect(result.valid).toBe(false);
      expect(result.apiKey).toBeUndefined();
    });

    it('应该更新最后使用时间和使用次数', async () => {
      const mockRow = {
        id: 'key-123',
        key_hash: 'hash123',
        user_id: 'user-123',
        metadata: {},
        is_active: true,
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        usage_count: 5,
      };

      mockQuery
        .mockResolvedValueOnce({ rows: [mockRow] })
        .mockResolvedValueOnce({ rows: [] });

      await apiKeyService.verifyApiKey('valid-key');

      const updateCall = mockQuery.mock.calls[1];
      expect(updateCall[0]).toContain('UPDATE api_keys');
      expect(updateCall[0]).toContain('last_used_at = NOW()');
      expect(updateCall[0]).toContain('usage_count = usage_count + 1');
      expect(updateCall[1][0]).toBe('key-123');
    });

    it('应该在数据库错误时返回无效', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await apiKeyService.verifyApiKey('some-key');

      expect(result.valid).toBe(false);
      expect(result.apiKey).toBeUndefined();
    });
  });

  describe('API Key 删除', () => {
    it('应该成功删除 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

      const result = await apiKeyService.deleteApiKey('key-123');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM api_keys'),
        ['key-123']
      );
    });

    it('应该在数据库错误时返回 false', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await apiKeyService.deleteApiKey('key-123');

      expect(result).toBe(false);
    });
  });

  describe('API Key 禁用', () => {
    it('应该成功禁用 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await apiKeyService.disableApiKey('key-123');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys SET is_active = false'),
        ['key-123']
      );
    });

    it('应该在数据库错误时返回 false', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await apiKeyService.disableApiKey('key-123');

      expect(result).toBe(false);
    });
  });

  describe('API Key 启用', () => {
    it('应该成功启用 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await apiKeyService.enableApiKey('key-123');

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE api_keys SET is_active = true'),
        ['key-123']
      );
    });

    it('应该在数据库错误时返回 false', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await apiKeyService.enableApiKey('key-123');

      expect(result).toBe(false);
    });
  });

  describe('获取用户 API Key 列表', () => {
    it('应该返回用户的 API Key 列表', async () => {
      const mockRows = [
        {
          id: 'key-1',
          key_hash: 'hash1',
          user_id: 'user-123',
          metadata: { name: 'Key 1' },
          is_active: true,
          expires_at: null,
          last_used_at: new Date(),
          created_at: new Date(),
          usage_count: 5,
        },
        {
          id: 'key-2',
          key_hash: 'hash2',
          user_id: 'user-123',
          metadata: { name: 'Key 2' },
          is_active: true,
          expires_at: null,
          last_used_at: null,
          created_at: new Date(),
          usage_count: 0,
        },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await apiKeyService.getUserApiKeys('user-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'key-1',
        userId: 'user-123',
        isActive: true,
        usageCount: 5,
      });
      expect(result[1]).toMatchObject({
        id: 'key-2',
        userId: 'user-123',
        usageCount: 0,
      });
    });

    it('应该返回空数组如果用户没有 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await apiKeyService.getUserApiKeys('user-456');

      expect(result).toEqual([]);
    });

    it('应该在数据库错误时返回空数组', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await apiKeyService.getUserApiKeys('user-123');

      expect(result).toEqual([]);
    });

    it('应该按创建时间降序排列', async () => {
      const mockRows = [
        { id: 'key-1', created_at: new Date('2024-01-02') },
        { id: 'key-2', created_at: new Date('2024-01-03') },
        { id: 'key-3', created_at: new Date('2024-01-01') },
      ];

      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await apiKeyService.getUserApiKeys('user-123');

      // 验证查询包含 ORDER BY
      const query = mockQuery.mock.calls[0][0];
      expect(query).toContain('ORDER BY created_at DESC');
    });
  });

  describe('获取 API Key 详情', () => {
    it('应该返回 API Key 详情', async () => {
      const mockRow = {
        id: 'key-123',
        key_hash: 'hash123',
        user_id: 'user-123',
        metadata: { name: 'Test Key', scopes: ['read', 'write'] },
        is_active: true,
        expires_at: new Date('2025-12-31'),
        last_used_at: new Date(),
        created_at: new Date(),
        usage_count: 10,
      };

      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await apiKeyService.getApiKey('key-123');

      expect(result).not.toBeNull();
      expect(result).toMatchObject({
        id: 'key-123',
        userId: 'user-123',
        metadata: { name: 'Test Key', scopes: ['read', 'write'] },
        isActive: true,
        usageCount: 10,
      });
      expect(result?.expiresAt).toBeInstanceOf(Date);
      expect(result?.lastUsedAt).toBeInstanceOf(Date);
      expect(result?.createdAt).toBeInstanceOf(Date);
    });

    it('应该在 API Key 不存在时返回 null', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await apiKeyService.getApiKey('nonexistent-key');

      expect(result).toBeNull();
    });

    it('应该在数据库错误时返回 null', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await apiKeyService.getApiKey('key-123');

      expect(result).toBeNull();
    });
  });

  describe('清理过期 API Key', () => {
    it('应该删除过期的 API Key', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 5 });

      const count = await apiKeyService.cleanupExpiredKeys();

      expect(count).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM api_keys WHERE expires_at < NOW()'),
        []
      );
    });

    it('应该返回 0 如果没有过期的 key', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

      const count = await apiKeyService.cleanupExpiredKeys();

      expect(count).toBe(0);
    });

    it('应该在数据库错误时返回 0', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const count = await apiKeyService.cleanupExpiredKeys();

      expect(count).toBe(0);
    });
  });

  describe('健康检查', () => {
    it('应该在数据库连接正常时返回 true', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await apiKeyService.healthCheck();

      expect(result).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1', []);
    });

    it('应该在数据库错误时返回 false', async () => {
      mockQuery.mockRejectedValue(new Error('Database connection failed'));

      const result = await apiKeyService.healthCheck();

      expect(result).toBe(false);
    });
  });

  describe('API Key 哈希', () => {
    it('应该为相同的 key 生成相同的 hash', () => {
      const apiKey = 'ccak_test_1234567890abcdef1234567890abcdef';

      const hash1 = crypto.createHash('sha256').update(apiKey).digest('hex');
      const hash2 = crypto.createHash('sha256').update(apiKey).digest('hex');

      expect(hash1).toBe(hash2);
    });

    it('应该为不同的 key 生成不同的 hash', () => {
      const key1 = 'ccak_test1_1234567890abcdef1234567890abcdef';
      const key2 = 'ccak_test2_1234567890abcdef1234567890abcdef';

      const hash1 = crypto.createHash('sha256').update(key1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(key2).digest('hex');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('并发安全', () => {
    it('应该处理并发的 API Key 创建', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          apiKeyService.createApiKey({
            userId: `user-${i}`,
          })
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.apiKey).toBeDefined();
        expect(result.apiKeyId).toBeDefined();
      });

      // 所有 API Key 应该是唯一的
      const keys = new Set(results.map(r => r.apiKey));
      expect(keys.size).toBe(10);
    });

    it('应该处理并发的 API Key 验证', async () => {
      // 生成一个真实的 API Key 并计算其 hash
      const testApiKey = 'ccak_concurrent_0123456789abcdef0123456789abcdef';
      const testHash = crypto.createHash('sha256').update(testApiKey).digest('hex');

      const mockRow = {
        id: 'key-123',
        key_hash: testHash, // 使用真实的 hash
        user_id: 'user-123',
        metadata: {},
        is_active: true,
        expires_at: null,
        last_used_at: null,
        created_at: new Date(),
        usage_count: 0,
      };

      // 使用 mockResolvedValue 确保所有调用都返回有效结果
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(apiKeyService.verifyApiKey(testApiKey));
      }

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.valid).toBe(true);
      });

      // 验证总共调用了20次（10次 verifyApiKey × 2次查询）
      expect(mockQuery).toHaveBeenCalledTimes(20);
    });
  });
});
