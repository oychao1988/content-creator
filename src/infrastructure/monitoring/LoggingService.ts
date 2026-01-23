/**
 * 增强日志服务
 *
 * 基于 Winston 的增强日志服务
 * 提供日志轮转、结构化日志、日志查询等功能
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../../config/index.js';
import { createLogger } from '../logging/logger.js';

const baseLogger = createLogger('LoggingService');

/**
 * 日志级别
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug' | 'silly';

/**
 * 日志条目
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp?: string;
  context?: string;
  [key: string]: any;
}

/**
 * 日志查询选项
 */
export interface LogQueryOptions {
  level?: LogLevel;
  context?: string;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

/**
 * 日志服务配置
 */
export interface LoggingServiceOptions {
  logDir?: string;
  datePattern?: string;
  maxSize?: string;
  maxFiles?: string;
  level?: LogLevel;
  format?: 'json' | 'text';
}

/**
 * 默认配置
 */
const defaultOptions: LoggingServiceOptions = {
  logDir: 'logs',
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '30d',
  level: 'info',
  format: 'json',
};

/**
 * 日志服务类
 */
export class LoggingService {
  private winstonLogger: winston.Logger;
  private options: LoggingServiceOptions;

  constructor(options?: Partial<LoggingServiceOptions>) {
    this.options = { ...defaultOptions, ...options };
    this.winstonLogger = this.createLogger();
  }

  /**
   * 创建日志器
   */
  private createLogger(): winston.Logger {
    const transports: winston.transport[] = [];

    // 控制台输出
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...metadata }) => {
            let msg = `${timestamp} [${level}]: ${message}`;
            if (Object.keys(metadata).length > 0) {
              msg += ` ${JSON.stringify(metadata)}`;
            }
            return msg;
          })
        ),
      })
    );

    // 综合日志文件（按日轮转）
    transports.push(
      new DailyRotateFile({
        dirname: this.options.logDir,
        filename: 'combined-%DATE%.log',
        datePattern: this.options.datePattern,
        maxSize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
      })
    );

    // 错误日志文件（按日轮转）
    transports.push(
      new DailyRotateFile({
        dirname: this.options.logDir,
        filename: 'error-%DATE%.log',
        datePattern: this.options.datePattern,
        level: 'error',
        maxSize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
      })
    );

    // 性能日志文件（按日轮转）
    transports.push(
      new DailyRotateFile({
        dirname: this.options.logDir,
        filename: 'performance-%DATE%.log',
        datePattern: this.options.datePattern,
        maxSize: this.options.maxSize,
        maxFiles: this.options.maxFiles,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        ),
      })
    );

    const logger = winston.createLogger({
      level: this.options.level || 'info',
      transports,
      // 异常处理
      exceptionHandlers: [
        new winston.transports.File({
          filename: `${this.options.logDir}/exceptions.log`,
        }),
      ],
      // 未处理的 Promise 拒绝
      rejectionHandlers: [
        new winston.transports.File({
          filename: `${this.options.logDir}/rejections.log`,
        }),
      ],
    });

    baseLogger.info('Logging service created', {
      logDir: this.options.logDir,
      level: this.options.level,
    });

    return logger;
  }

  /**
   * 记录日志
   */
  log(level: LogLevel, message: string, metadata?: Record<string, any>): void {
    this.winstonLogger.log(level, message, metadata);
  }

  /**
   * 记录调试日志
   */
  debug(message: string, metadata?: Record<string, any>): void {
    this.winstonLogger.debug(message, metadata);
  }

  /**
   * 记录信息日志
   */
  info(message: string, metadata?: Record<string, any>): void {
    this.winstonLogger.info(message, metadata);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, metadata?: Record<string, any>): void {
    this.winstonLogger.warn(message, metadata);
  }

  /**
   * 记录错误日志
   */
  error(message: string, error?: Error | Record<string, any>, metadata?: Record<string, any>): void {
    let meta = { ...metadata };

    if (error instanceof Error) {
      meta = {
        ...meta,
        error: {
          message: error.message,
          name: error.name,
          stack: error.stack,
        },
      };
    } else if (error) {
      meta = { ...meta, ...error };
    }

    this.winstonLogger.error(message, meta);
  }

  /**
   * 记录性能日志
   */
  performance(operation: string, duration: number, metadata?: Record<string, any>): void {
    this.winstonLogger.info('performance', {
      operation,
      duration,
      unit: 'ms',
      ...metadata,
    });
  }

  /**
   * 记录 HTTP 请求日志
   */
  http(req: {
    method: string;
    url: string;
    status?: number;
    duration?: number;
    userAgent?: string;
    ip?: string;
  }): void {
    this.winstonLogger.http('HTTP request', {
      method: req.method,
      url: req.url,
      status: req.status,
      duration: req.duration,
      userAgent: req.userAgent,
      ip: req.ip,
    });
  }

  /**
   * 创建子日志器（带上下文）
   */
  child(context: string): LoggingService {
    const childService = new LoggingService(this.options);
    childService.winstonLogger = this.winstonLogger.child({ context });
    return childService;
  }

  /**
   * 设置日志级别
   */
  setLevel(level: LogLevel): void {
    this.winstonLogger.level = level;
    this.winstonLogger.info('Log level changed', { level });
  }

  /**
   * 获取日志级别
   */
  getLevel(): string {
    return this.winstonLogger.level;
  }

  /**
   * 关闭日志器
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.winstonLogger.close((error) => {
        if (error) {
          baseLogger.error('Failed to close logger', error);
          reject(error);
        } else {
          baseLogger.info('Logger closed');
          resolve();
        }
      });
    });
  }
}

/**
 * 日志服务单例
 */
export const loggingService = new LoggingService();
