/**
 * Sentry 错误追踪服务
 *
 * 基于 Sentry v8 的错误追踪和性能监控
 * 提供错误捕获、性能监控、用户反馈等功能
 */

import * as Sentry from '@sentry/node';
import { createLogger } from '../logging/logger.js';

const logger = createLogger('Sentry');

/**
 * Sentry 配置选项
 */
export interface SentryOptions {
  dsn: string;
  environment?: string;
  release?: string;
  tracesSampleRate?: number;
  profilesSampleRate?: number;
  beforeSend?: (event: Sentry.Event, hint?: Sentry.EventHint) => Sentry.Event | null;
  beforeBreadcrumb?: (breadcrumb: Sentry.Breadcrumb, hint?: Sentry.BreadcrumbHint) => Sentry.Breadcrumb | null;
}

/**
 * 用户信息
 */
export interface User {
  id: string;
  email?: string;
  username?: string;
  [key: string]: any;
}

/**
 * 事务上下文
 */
export interface TransactionContext {
  op: string;
  name: string;
  data?: Record<string, any>;
}

/**
 * Sentry 服务类
 */
export class SentryService {
  private initialized: boolean = false;
  private options: SentryOptions;

  constructor(options?: SentryOptions) {
    this.options = options || ({} as SentryOptions);
  }

  /**
   * 初始化 Sentry
   */
  initialize(options: SentryOptions): void {
    if (this.initialized) {
      logger.warn('Sentry already initialized');
      return;
    }

    this.options = options;

    try {
      Sentry.init({
        dsn: options.dsn,
        environment: options.environment || process.env.NODE_ENV || 'development',
        release: options.release,
        tracesSampleRate: options.tracesSampleRate || (options.environment === 'production' ? 0.1 : 1.0),
        profilesSampleRate: options.profilesSampleRate || 0,
        beforeSend: options.beforeSend || this.defaultBeforeSend,
        beforeBreadcrumb: options.beforeBreadcrumb,
        integrations: [
          // httpIntegration(), // 如果需要 HTTP 请求追踪
          // expressIntegration(), // 如果使用 Express
        ],
      });

      this.initialized = true;
      logger.info('Sentry initialized', {
        environment: options.environment,
        tracesSampleRate: options.tracesSampleRate,
      });
    } catch (error) {
      logger.error('Failed to initialize Sentry', error as Error);
    }
  }

  /**
   * 默认的 beforeSend 处理
   */
  private defaultBeforeSend(event: Sentry.Event, hint?: Sentry.EventHint): Sentry.Event | null {
    // 过滤敏感信息
    if (event.request) {
      // 移除敏感的请求头
      if (event.request.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['x-api-key'];
      }

      // 移除敏感的查询参数
      if (event.request.query_string) {
        try {
          const query = typeof event.request.query_string === 'string'
            ? new URLSearchParams(event.request.query_string)
            : event.request.query_string;

          const sensitiveKeys = ['password', 'token', 'apiKey', 'api_key', 'secret'];
          for (const key of sensitiveKeys) {
            query.delete(key);
          }

          event.request.query_string = query.toString();
        } catch (error) {
          // 忽略解析错误
        }
      }
    }

    // 添加自定义标签
    event.tags = event.tags || {};
    event.tags['service'] = 'content-creator';
    event.tags['environment'] = process.env.NODE_ENV || 'development';

    return event;
  }

  /**
   * 捕获异常
   */
  captureException(error: Error, context?: { user?: User; tags?: Record<string, string>; extra?: Record<string, any> }): void {
    if (!this.initialized) {
      logger.warn('Sentry not initialized, cannot capture exception');
      return;
    }

    try {
      // 设置用户上下文
      if (context?.user) {
        this.setUser(context.user);
      }

      // 设置标签
      if (context?.tags) {
        Sentry.setTags(context.tags);
      }

      // 设置额外信息
      if (context?.extra) {
        Sentry.setExtras(context.extra);
      }

      Sentry.captureException(error);

      logger.debug('Exception captured by Sentry', {
        message: error.message,
        name: error.name,
      });
    } catch (err) {
      logger.error('Failed to capture exception', err as Error);
    }
  }

  /**
   * 捕获消息
   */
  captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: { user?: User; tags?: Record<string, string>; extra?: Record<string, any> }): void {
    if (!this.initialized) {
      logger.warn('Sentry not initialized, cannot capture message');
      return;
    }

    try {
      // 设置用户上下文
      if (context?.user) {
        this.setUser(context.user);
      }

      // 设置标签
      if (context?.tags) {
        Sentry.setTags(context.tags);
      }

      // 设置额外信息
      if (context?.extra) {
        Sentry.setExtras(context.extra);
      }

      Sentry.captureMessage(message, level);

      logger.debug('Message captured by Sentry', { message, level });
    } catch (err) {
      logger.error('Failed to capture message', err as Error);
    }
  }

  /**
   * 创建性能追踪事务
   */
  startTransaction(context: TransactionContext): Sentry.Span | undefined {
    if (!this.initialized) {
      logger.warn('Sentry not initialized, cannot start transaction');
      return undefined;
    }

    try {
      const transaction = Sentry.startTransaction(context);
      logger.debug('Transaction started', { name: context.name, op: context.op });
      return transaction;
    } catch (error) {
      logger.error('Failed to start transaction', error as Error);
      return undefined;
    }
  }

  /**
   * 设置用户
   */
  setUser(user: User): void {
    if (!this.initialized) {
      return;
    }

    try {
      Sentry.setUser(user);
      logger.debug('User set', { id: user.id });
    } catch (error) {
      logger.error('Failed to set user', error as Error);
    }
  }

  /**
   * 清除用户
   */
  clearUser(): void {
    if (!this.initialized) {
      return;
    }

    try {
      Sentry.setUser(null);
      logger.debug('User cleared');
    } catch (error) {
      logger.error('Failed to clear user', error as Error);
    }
  }

  /**
   * 设置标签
   */
  setTags(tags: Record<string, string>): void {
    if (!this.initialized) {
      return;
    }

    try {
      Sentry.setTags(tags);
      logger.debug('Tags set', { tags });
    } catch (error) {
      logger.error('Failed to set tags', error as Error);
    }
  }

  /**
   * 设置额外信息
   */
  setExtras(extras: Record<string, any>): void {
    if (!this.initialized) {
      return;
    }

    try {
      Sentry.setExtras(extras);
      logger.debug('Extras set');
    } catch (error) {
      logger.error('Failed to set extras', error as Error);
    }
  }

  /**
   * 添加面包屑
   */
  addBreadcrumb(message: string, category?: string, level?: Sentry.SeverityLevel, data?: Record<string, any>): void {
    if (!this.initialized) {
      return;
    }

    try {
      Sentry.addBreadcrumb({
        message,
        category: category || 'custom',
        level: level || 'info',
        data,
      });
      logger.debug('Breadcrumb added', { message, category });
    } catch (error) {
      logger.error('Failed to add breadcrumb', error as Error);
    }
  }

  /**
   * 设置上下文
   */
  setContext(key: string, context: Record<string, any>): void {
    if (!this.initialized) {
      return;
    }

    try {
      Sentry.setContext(key, context);
      logger.debug('Context set', { key });
    } catch (error) {
      logger.error('Failed to set context', error as Error);
    }
  }

  /**
   * 检查是否已初始化
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    return this.initialized;
  }
}

/**
 * Sentry 服务单例
 */
export const sentryService = new SentryService();
