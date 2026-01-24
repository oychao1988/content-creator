/**
 * Redis 连接池
 *
 * 提供 Redis 连接管理和错误处理
 */

import Redis from 'ioredis';
import { config } from '../../config/index.js';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('Redis');

/**
 * Redis 客户端类
 */
export class RedisClient {
  private client: any | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private enabled: boolean;

  constructor() {
    this.enabled = config.redis.enabled;
    if (!this.enabled) {
      logger.info('Redis is disabled in configuration');
    }
  }

  /**
   * 检查 Redis 是否启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 获取 Redis 客户端实例（单例）
   */
  async getClient(): Promise<any> {
    if (!this.enabled) {
      throw new Error('Redis is not configured');
    }

    if (this.client) {
      return this.client;
    }

    if (this.isConnecting) {
      // 等待连接完成
      await this.waitForConnection();
      return this.client!;
    }

    return this.connect();
  }

  /**
   * 连接到 Redis
   */
  private async connect(): Promise<any> {
    this.isConnecting = true;

    try {
      // 检查 Redis URL 是否配置
      if (!config.redis.url) {
        throw new Error('REDIS_URL is not configured');
      }

      // 解析 Redis URL
      const redisUrl = new URL(config.redis.url);

      logger.info('Connecting to Redis', {
        host: redisUrl.hostname,
        port: redisUrl.port,
        password: redisUrl.password ? '****' : 'none',
      });

      // 创建 Redis 客户端配置
      const redisOptions: any = {
        host: redisUrl.hostname,
        port: parseInt(redisUrl.port) || 6379,
        db: config.redis.db,
        maxRetriesPerRequest: null, // BullMQ Worker 要求必须设置为 null
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          logger.debug(`Redis retry attempt ${times}, delay: ${delay}ms`);
          return delay;
        },
        connectTimeout: config.redis.connectTimeout,
        commandTimeout: config.redis.commandTimeout,
      };

      // 优先使用配置中的密码,否则使用 URL 中的密码
      if (config.redis.password) {
        redisOptions.password = config.redis.password;
      } else if (redisUrl.password) {
        redisOptions.password = decodeURIComponent(redisUrl.password);
      }

      // 创建 Redis 客户端
      this.client = new (Redis as any)(redisOptions);

      // 监听连接事件
      this.client.on('connect', () => {
        logger.info('Redis connected');
        this.reconnectAttempts = 0;
        this.isConnecting = false;
      });

      this.client.on('ready', () => {
        logger.info('Redis ready');
      });

      this.client.on('error', (error: Error) => {
        logger.error('Redis error', error);
      });

      this.client.on('close', () => {
        logger.warn('Redis connection closed');
      });

      this.client.on('reconnecting', () => {
        this.reconnectAttempts++;
        logger.info(`Redis reconnecting (attempt ${this.reconnectAttempts})`);

        if (this.reconnectAttempts > this.maxReconnectAttempts) {
          logger.error('Max reconnection attempts reached');
          this.disconnect();
        }
      });

      // 等待连接就绪
      await this.client.ready;

      logger.info('Redis connection established');
      return this.client;
    } catch (error) {
      this.isConnecting = false;
      logger.error('Failed to connect to Redis', error as Error);
      throw error;
    }
  }

  /**
   * 等待连接完成
   */
  private async waitForConnection(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 100;

    while (this.isConnecting && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!this.client) {
      throw new Error('Redis connection failed');
    }
  }

  /**
   * 断开 Redis 连接
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      logger.info('Disconnecting Redis');
      await this.client.quit();
      this.client = null;
      this.isConnecting = false;
    }
  }

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.client !== null && this.client.status === 'ready';
  }

  /**
   * Ping Redis
   */
  async ping(): Promise<string> {
    const client = await this.getClient();
    return await client.ping();
  }

  /**
   * 获取 Redis 信息
   */
  async info(section?: string): Promise<string> {
    const client = await this.getClient();
    return await client.info(section);
  }
}

/**
 * Redis 客户端单例
 */
export const redisClient = new RedisClient();

/**
 * 获取 Redis 客户端便捷方法
 */
export async function getRedisClient(): Promise<any> {
  return await redisClient.getClient();
}

/**
 * 检查 Redis 是否可用
 */
export function isRedisEnabled(): boolean {
  return redisClient.isEnabled();
}
