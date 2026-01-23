/**
 * 配置系统
 *
 * 提供类型安全的配置访问，使用 Zod 进行环境变量验证
 */

import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

// 加载环境变量（如果在非测试环境）
if (process.env.NODE_ENV !== 'test') {
  dotenvConfig();
}

/**
 * 环境变量 Schema
 * 使用 Zod 进行运行时验证和类型推导
 */
const envSchema = z.object({
  // Node 环境
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // PostgreSQL 配置
  POSTGRES_HOST: z.string().min(1),
  POSTGRES_PORT: z.string().transform(Number).pipe(z.number().int().positive().default(5432)),
  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_SSL: z.string().transform((val) => val === 'true').default('false'),

  // Redis 配置
  REDIS_URL: z.string().url(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().transform(Number).pipe(z.number().int().nonnegative()).default('0'),

  // LLM 服务配置（DeepSeek）
  LLM_API_KEY: z.string().min(1),
  LLM_BASE_URL: z.string().url(),
  LLM_MODEL_NAME: z.string().default('deepseek-chat'),
  LLM_MAX_TOKENS: z.string().transform(Number).pipe(z.number().int().positive()).default('4000'),
  LLM_TEMPERATURE: z.string().transform(Number).pipe(z.number().min(0).max(2)).default('0.7'),
  LLM_ENABLE_CACHE: z.string().transform((val) => val === 'true').default('true').optional(),

  // Tavily API (MCP Search)
  TAVILY_API_KEY: z.string().min(1),

  // Doubao API (字节跳动)
  ARK_API_KEY: z.string().min(1),
  ARK_API_URL: z.string().url().optional(),

  // 存储配置
  STORAGE_PROVIDER: z.enum(['local', 's3', 'oss', 'minio']).default('local'),
  STORAGE_PATH: z.string().default('./data/images'),

  // 数据库类型
  DATABASE_TYPE: z.enum(['memory', 'postgres', 'sqlite']).default('memory'),

  // AWS S3 配置（如果使用 S3）
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().optional(),

  // Worker 配置
  WORKER_ID: z.string().default('worker-1'),
  WORKER_CONCURRENCY: z.string().transform(Number).pipe(z.number().int().positive()).default('2'),

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

  constructor() {
    // 加载并验证环境变量
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
      console.error('Environment variable validation failed:');
      console.error(result.error.errors);
      throw new Error('Configuration validation failed. Please check your environment variables.');
    }

    this.env = result.data;

    // 输出关键配置信息（脱敏）
    this.logConfig();
  }

  /**
   * 输出配置信息（脱敏）
   */
  private logConfig(): void {
    console.log('========================================');
    console.log('Configuration Loaded Successfully');
    console.log('========================================');
    console.log(`Environment: ${this.env.NODE_ENV}`);
    console.log(`Worker ID: ${this.env.WORKER_ID}`);
    console.log(`Concurrency: ${this.env.WORKER_CONCURRENCY}`);
    console.log(`PostgreSQL: ${this.env.POSTGRES_HOST}:${this.env.POSTGRES_PORT}/${this.env.POSTGRES_DB}`);
    console.log(`Redis: ${this.maskUrl(this.env.REDIS_URL)}`);
    console.log(`LLM: ${this.env.LLM_MODEL_NAME} @ ${this.env.LLM_BASE_URL}`);
    console.log(`Storage: ${this.env.STORAGE_PROVIDER}`);
    console.log('========================================');
  }

  /**
   * 脱敏 URL（隐藏密码）
   */
  private maskUrl(url: string): string {
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
      type: this.env.DATABASE_TYPE,
      host: this.env.POSTGRES_HOST,
      port: this.env.POSTGRES_PORT,
      user: this.env.POSTGRES_USER,
      password: this.env.POSTGRES_PASSWORD,
      database: this.env.POSTGRES_DB,
      ssl: this.env.POSTGRES_SSL,
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
      port: this.env.POSTGRES_PORT,
      user: this.env.POSTGRES_USER,
      password: this.env.POSTGRES_PASSWORD,
      database: this.env.POSTGRES_DB,
      ssl: this.env.POSTGRES_SSL,
    };
  }

  // ========== Redis 配置 ==========

  get redis() {
    return {
      url: this.env.REDIS_URL,
      password: this.env.REDIS_PASSWORD,
      db: this.env.REDIS_DB,
      // 连接池配置
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      // 连接超时
      connectTimeout: 10000,
      // 命令超时
      commandTimeout: 5000,
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
