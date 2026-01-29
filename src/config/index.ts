/**
 * 配置系统
 *
 * 提供类型安全的配置访问，使用 Zod 进行环境变量验证
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// 加载环境变量
// 注意：测试环境也需要加载环境变量（如 Redis URL）
// 明确指定 .env 文件路径，确保从项目根目录加载
import { resolve } from 'path';
const envPath = resolve(process.cwd(), '.env');
const result = dotenvConfig({ path: envPath });

// 如果 dotenv 没有自动写入 process.env（可能在某些测试环境中），手动写入
if (result.parsed) {
  for (const key in result.parsed) {
    if (!process.env[key]) {
      process.env[key] = result.parsed[key]!;
    }
  }
}

/**
 * 环境变量 Schema
 * 使用 Zod 进行运行时验证和类型推导
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

  // Redis 配置（可选，仅在使用队列/缓存/限流时需要）
  // 空字符串表示禁用 Redis
  REDIS_URL: z.union([z.string().url(), z.literal('')]).optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0).optional(),

  // LLM 服务配置（DeepSeek）
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url(),
  LLM_MODEL_NAME: z.string().default('deepseek-chat'),
  LLM_MAX_TOKENS: z.coerce.number().int().positive().default(4000),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  LLM_ENABLE_CACHE: z.coerce.boolean().default(true).optional(),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(60000), // LLM 请求超时（毫秒）
  LLM_STREAM_TIMEOUT_MS: z.coerce.number().int().positive().default(120000), // LLM 流式请求超时（毫秒）

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
  WORKER_ID: z.string().optional(),
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),

  // 日志配置
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FILE: z.string().default('./logs/app.log'),

  // 监控配置（可选）
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
});

/**
 * 环境变量类型（从 Schema 推导）
 */
export type Env = z.infer<typeof envSchema>;

/**
 * 配置类
 * 提供统一的配置访问接口
 */
class Config {
  private env: Env;
  private databaseType: 'memory' | 'postgres' | 'sqlite';

  constructor() {
    // 加载并验证环境变量
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      console.error('Environment variable validation failed:');
      console.error(result.error.issues);
      throw new Error('Configuration validation failed. Please check your environment variables.');
    }

    this.env = result.data;

    // 智能默认值：根据环境选择数据库类型
    this.databaseType = this.env.DATABASE_TYPE ?? this.getDefaultDatabaseType();

    // 验证 PostgreSQL 配置（如果使用 postgres）
    this.validatePostgresConfig();

    // 输出关键配置信息（脱敏）
    this.logConfig();
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
  validatePostgresConfig(): void {
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

  /**
   * 输出配置信息（脱敏）
   */
  private logConfig(): void {
    console.log('========================================');
    console.log('Configuration Loaded Successfully');
    console.log('========================================');
    console.log(`Environment: ${this.env.NODE_ENV}`);
    console.log(`Worker ID: ${this.env.WORKER_ID || 'Not set (auto-generating UUID)'}`);
    console.log(`Concurrency: ${this.env.WORKER_CONCURRENCY}`);
    console.log(`Database Type: ${this.databaseType}`);

    // 仅在使用 PostgreSQL 时显示连接信息
    if (this.databaseType === 'postgres') {
      console.log(
        `PostgreSQL: ${this.env.POSTGRES_HOST}:${this.env.POSTGRES_PORT}/${this.env.POSTGRES_DB}`
      );
    } else {
      console.log('PostgreSQL: Not configured (using ' + this.databaseType + ')');
    }

    // Redis 配置（可选）
    if (this.env.REDIS_URL) {
      console.log(`Redis: ${this.maskUrl(this.env.REDIS_URL)}`);
    } else {
      console.log('Redis: Not configured (queue/cache/rate-limit will be disabled)');
    }

    console.log(`LLM: ${this.env.LLM_MODEL_NAME} @ ${this.env.LLM_BASE_URL}`);
    console.log(`Storage: ${this.env.STORAGE_PROVIDER}`);
    console.log('========================================');
  }

  /**
   * 脱敏 URL（隐藏密码）
   */
  private maskUrl(url: string | undefined): string {
    if (!url) return 'N/A';
    return url.replace(/:([^:@]+)@/, ':****@');
  }

  // ========== 通用配置 ==========

  get isDevelopment(): boolean {
    return this.env.NODE_ENV === 'development';
  }

  get isProduction(): boolean {
    return this.env.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.env.NODE_ENV === 'test';
  }

  // ========== PostgreSQL 配置 ==========

  get database() {
    return {
      type: this.databaseType,
      // PostgreSQL 配置（仅在 type='postgres' 时有效）
      host: this.env.POSTGRES_HOST,
      port: this.env.POSTGRES_PORT ?? 5432,
      user: this.env.POSTGRES_USER,
      password: this.env.POSTGRES_PASSWORD,
      database: this.env.POSTGRES_DB,
      ssl: this.env.POSTGRES_SSL ?? false,
      // 连接池配置
      poolMax: 25, // 最大连接数
      poolMin: 2, // 最小连接数
      idleTimeoutMillis: 30000, // 空闲连接超时
      connectionTimeoutMillis: 5000, // 连接超时
    };
  }

  // 别名：postgres（向后兼容）
  get postgres() {
    return {
      host: this.env.POSTGRES_HOST,
      port: this.env.POSTGRES_PORT ?? 5432,
      user: this.env.POSTGRES_USER,
      password: this.env.POSTGRES_PASSWORD,
      database: this.env.POSTGRES_DB,
      ssl: this.env.POSTGRES_SSL ?? false,
    };
  }

  // ========== Redis 配置 ==========

  get redis() {
    return {
      enabled: !!this.env.REDIS_URL && this.env.REDIS_URL !== '',
      url: this.env.REDIS_URL && this.env.REDIS_URL !== '' ? this.env.REDIS_URL : undefined,
      password: this.env.REDIS_PASSWORD,
      db: this.env.REDIS_DB ?? 0,
      // 连接池配置
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      // 连接超时
      connectTimeout: 10000,
      // 命令超时
      commandTimeout: 30000,
    };
  }

  // ========== LLM 服务配置 ==========

  get llm() {
    return {
      apiKey: this.env.LLM_API_KEY,
      baseURL: this.env.LLM_BASE_URL,
      modelName: this.env.LLM_MODEL_NAME,
      maxTokens: this.env.LLM_MAX_TOKENS,
      temperature: this.env.LLM_TEMPERATURE,
      enableCache: this.env.LLM_ENABLE_CACHE ?? true,
      timeout: this.env.LLM_TIMEOUT_MS,
      streamTimeout: this.env.LLM_STREAM_TIMEOUT_MS,
    };
  }

  // ========== Tavily API 配置 ==========

  get tavily() {
    return {
      apiKey: this.env.TAVILY_API_KEY,
    };
  }

  // ========== Doubao API 配置 ==========

  get doubao() {
    return {
      apiKey: this.env.ARK_API_KEY,
      apiURL: this.env.ARK_API_URL,
    };
  }

  // ========== 存储配置 ==========

  get storage() {
    return {
      provider: this.env.STORAGE_PROVIDER,
      path: this.env.STORAGE_PATH,
      // S3 配置
      s3: this.env.STORAGE_PROVIDER === 's3' ? {
        accessKeyId: this.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: this.env.AWS_SECRET_ACCESS_KEY!,
        region: this.env.AWS_REGION,
        bucket: this.env.S3_BUCKET!,
      } : null,
    };
  }

  // ========== Worker 配置 ==========

  get worker() {
    return {
      id: this.env.WORKER_ID,
      concurrency: this.env.WORKER_CONCURRENCY,
    };
  }

  // ========== 日志配置 ==========

  get logging() {
    return {
      level: this.env.LOG_LEVEL,
      file: this.env.LOG_FILE,
      // 开发环境使用彩色输出
      colorize: this.isDevelopment,
      // 生产环境使用 JSON 格式
      json: this.isProduction,
    };
  }

  // ========== 监控配置 ==========

  get monitoring() {
    return {
      sentry: this.env.SENTRY_DSN ? {
        dsn: this.env.SENTRY_DSN,
        environment: this.env.SENTRY_ENVIRONMENT || this.env.NODE_ENV,
      } : null,
    };
  }
}

// ========== 导出单例 ==========

/**
 * 配置单例
 * 整个应用共享同一个配置实例
 */
export const config = new Config();

// 冻结配置对象，防止运行时修改
Object.freeze(config);
