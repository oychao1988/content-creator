/**
 * 配置系统测试
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * 环境变量 Schema（从配置系统复制）
 */
const envSchema = z.object({
  // Node 环境
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // 数据库类型（根据环境自动选择默认值）
  DATABASE_TYPE: z.enum(['memory', 'postgres', 'sqlite']).optional(),

  // PostgreSQL 配置（仅在 DATABASE_TYPE='postgres' 时必需）
  POSTGRES_HOST: z.string().min(1).optional(),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5432).optional(),
  POSTGRES_USER: z.string().min(1).optional(),
  POSTGRES_PASSWORD: z.string().min(1).optional(),
  POSTGRES_DB: z.string().min(1).optional(),
  POSTGRES_SSL: z.coerce.boolean().default(false).optional(),

  // Redis 配置（可选）
  REDIS_URL: z.string().url().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0).optional(),

  // LLM 服务配置（DeepSeek）
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url(),
  LLM_MODEL_NAME: z.string().default('deepseek-chat'),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(4000),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  LLM_ENABLE_CACHE: z.coerce.boolean().default(true).optional(),

  // Tavily API (MCP Search)
  TAVILY_API_KEY: z.string().min(1),

  // Doubao API (字节跳动)
  ARK_API_KEY: z.string().min(1),
  ARK_API_URL: z.string().url().optional(),

  // 存储配置
  STORAGE_PROVIDER: z.enum(['local', 's3', 'oss', 'minio']).default('local'),
  STORAGE_PATH: z.string().default('./data/images'),

  // AWS S3 配置（如果使用 S3）
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),

  // Worker 配置
  WORKER_ID: z.string().default('worker-1'),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),

  // 日志配置
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('./logs/app.log'),

  // 监控配置（可选）
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

/**
 * 测试用配置类（从配置系统复制核心逻辑）
 */
class TestConfig {
  private env: Env;
  private databaseType: 'memory' | 'postgres' | 'sqlite';

  constructor(customEnv: Partial<Env> = {}) {
    // 合并环境变量
    const testEnv: Env = {
      NODE_ENV: 'development',
      LLM_API_KEY: 'test-key',
      LLM_BASE_URL: 'https://api.test.com',
      TAVILY_API_KEY: 'test-tavily-key',
      ARK_API_KEY: 'test-ark-key',
      ...customEnv,
    } as Env;

    // 验证环境变量
    const result = envSchema.safeParse(testEnv);

    if (!result.success) {
      throw new Error(`Configuration validation failed: ${result.error.message}`);
    }

    this.env = result.data;

    // 智能默认值：根据环境选择数据库类型
    this.databaseType = this.env.DATABASE_TYPE ?? this.getDefaultDatabaseType();

    // 验证 PostgreSQL 配置（如果使用 postgres）
    this.validatePostgresConfig();
  }

  /**
   * 根据环境返回默认数据库类型
   */
  private getDefaultDatabaseType(): 'memory' | 'postgres' | 'sqlite' {
    const nodeEnv = this.env.NODE_ENV;

    switch (nodeEnv) {
      case 'development':
        return 'sqlite'; // 开发环境默认使用 SQLite
      case 'production':
        return 'postgres'; // 生产环境默认使用 PostgreSQL
      case 'test':
        return 'memory'; // 测试环境默认使用内存数据库
      default:
        return 'sqlite';
    }
  }

  /**
   * 验证 PostgreSQL 配置（当使用 postgres 时）
   */
  private validatePostgresConfig(): void {
    if (this.databaseType === 'postgres') {
      const requiredFields = [
        'POSTGRES_HOST',
        'POSTGRES_USER',
        'POSTGRES_PASSWORD',
        'POSTGRES_DB',
      ] as const;

      const missingFields = requiredFields.filter(
        (field) => !this.env[field]
      );

      if (missingFields.length > 0) {
        throw new Error(
          `PostgreSQL configuration is required when DATABASE_TYPE='postgres'. ` +
          `Missing environment variables: ${missingFields.join(', ')}`
        );
      }
    }
  }

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  get database() {
    return {
      type: this.databaseType,
      host: this.env.POSTGRES_HOST,
      port: this.env.POSTGRES_PORT ?? 5432,
      user: this.env.POSTGRES_USER,
      password: this.env.POSTGRES_PASSWORD,
      database: this.env.POSTGRES_DB,
      ssl: this.env.POSTGRES_SSL ?? false,
    };
  }
}

describe('配置系统测试', () => {
  // 不需要全局 beforeEach，因为我们使用独立的 TestConfig 类

  describe('智能默认值逻辑', () => {
    it('开发环境应默认使用 SQLite', () => {
      // 开发环境，不设置 DATABASE_TYPE
      const config = new TestConfig({
        NODE_ENV: 'development',
      });

      // 验证默认数据库类型为 sqlite
      expect(config.database.type).toBe('sqlite');
      expect(config.isDevelopment).toBe(true);
      expect(config.isProduction).toBe(false);
      expect(config.isTest).toBe(false);
    });

    it('生产环境应默认使用 PostgreSQL', () => {
      // 生产环境，默认使用 postgres
      // 但是需要提供 PostgreSQL 配置
      const config = new TestConfig({
        NODE_ENV: 'production',
        POSTGRES_HOST: 'localhost',
        POSTGRES_PORT: 5432,
        POSTGRES_USER: 'produser',
        POSTGRES_PASSWORD: 'prodpass',
        POSTGRES_DB: 'proddb',
      });

      // 验证默认数据库类型为 postgres
      expect(config.database.type).toBe('postgres');
      expect(config.isDevelopment).toBe(false);
      expect(config.isProduction).toBe(true);
      expect(config.isTest).toBe(false);
    });

    it('生产环境默认使用 PostgreSQL 时需要配置', () => {
      // 生产环境不设置 DATABASE_TYPE（默认使用 postgres）
      // 但没有提供 PostgreSQL 配置时应该抛出错误
      expect(() => {
        new TestConfig({
          NODE_ENV: 'production',
          // 缺少 PostgreSQL 配置
        });
      }).toThrow(/PostgreSQL configuration is required.*Missing environment variables/);
    });

    it('测试环境应默认使用内存数据库', () => {
      // 测试环境，不设置 DATABASE_TYPE
      const config = new TestConfig({
        NODE_ENV: 'test',
      });

      // 验证默认数据库类型为 memory
      expect(config.database.type).toBe('memory');
      expect(config.isDevelopment).toBe(false);
      expect(config.isProduction).toBe(false);
      expect(config.isTest).toBe(true);
    });

    it('显式设置 DATABASE_TYPE 应覆盖默认值', () => {
      // 开发环境，但显式设置 DATABASE_TYPE 为 postgres
      const config = new TestConfig({
        NODE_ENV: 'development',
        DATABASE_TYPE: 'postgres',
        POSTGRES_HOST: 'localhost',
        POSTGRES_PORT: 5432,
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'test_db',
      });

      // 验证使用了显式设置的 postgres，而不是默认的 sqlite
      expect(config.database.type).toBe('postgres');
      expect(config.isDevelopment).toBe(true);
    });
  });

  describe('PostgreSQL 配置验证', () => {
    it('使用 postgres 时必须提供 PostgreSQL 配置', () => {
      // 设置数据库类型为 postgres，但不提供 PostgreSQL 配置
      expect(() => {
        new TestConfig({
          DATABASE_TYPE: 'postgres',
        });
      }).toThrow(/PostgreSQL configuration is required.*Missing environment variables/);
    });

    it('使用 postgres 时需要所有必需的 PostgreSQL 配置', () => {
      // 设置数据库类型为 postgres，只提供部分配置
      expect(() => {
        new TestConfig({
          DATABASE_TYPE: 'postgres',
          POSTGRES_HOST: 'localhost',
          POSTGRES_PORT: 5432,
          // 缺少 POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB
        });
      }).toThrow(/Missing environment variables/);
    });

    it('使用 sqlite 时不需要 PostgreSQL 配置', () => {
      // 设置数据库类型为 sqlite，不提供 PostgreSQL 配置
      const config = new TestConfig({
        DATABASE_TYPE: 'sqlite',
      });

      // 验证数据库类型为 sqlite
      expect(config.database.type).toBe('sqlite');
    });

    it('使用 memory 时不需要 PostgreSQL 配置', () => {
      // 设置数据库类型为 memory，不提供 PostgreSQL 配置
      const config = new TestConfig({
        DATABASE_TYPE: 'memory',
      });

      // 验证数据库类型为 memory
      expect(config.database.type).toBe('memory');
    });

    it('使用 postgres 且提供完整配置时应成功', () => {
      // 设置数据库类型为 postgres，提供完整配置
      const config = new TestConfig({
        DATABASE_TYPE: 'postgres',
        POSTGRES_HOST: 'localhost',
        POSTGRES_PORT: 5432,
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'testdb',
        POSTGRES_SSL: true,
      });

      // 验证数据库类型为 postgres 且配置正确
      expect(config.database.type).toBe('postgres');
      expect(config.database.host).toBe('localhost');
      expect(config.database.port).toBe(5432);
      expect(config.database.user).toBe('testuser');
      expect(config.database.password).toBe('testpass');
      expect(config.database.database).toBe('testdb');
      expect(config.database.ssl).toBe(true);
    });
  });

});
