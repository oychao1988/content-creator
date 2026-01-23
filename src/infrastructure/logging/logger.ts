/**
 * 日志系统
 *
 * 基于 Winston 的结构化日志系统
 */

import winston from 'winston';
import { config } from '../../config/index.js';

/**
 * 日志级别
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * 日志元数据
 */
export interface LogMetadata {
  [key: string]: any;
  context?: string;
  userId?: string;
  taskId?: string;
  workerId?: string;
  error?: {
    code?: string;
    stack?: string;
    [key: string]: any;
  };
}

/**
 * 自定义日志格式
 */
class CustomFormat extends winston.Transport {
  name = 'custom-format';
  opts: any;

  constructor(opts?: any) {
    super(opts);
    this.opts = opts || {};
  }

  log(info: any, callback: () => void) {
    const { level, message, timestamp, ...meta } = info;

    // 格式化输出
    const output = `[${timestamp}] [${level.toUpperCase()}] ${message}${
      Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    }`;

    console.log(output);
    callback();
  }
}

/**
 * 创建日志格式
 */
function createFormat() {
  if (config.isDevelopment) {
    // 开发环境：彩色、易读的格式
    return winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, ...metadata }) => {
        let msg = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(metadata).length > 0) {
          msg += ` ${JSON.stringify(metadata)}`;
        }
        return msg;
      })
    );
  } else {
    // 生产环境：JSON 格式
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );
  }
}

/**
 * 创建日志传输器
 */
function createTransports(): winston.transport[] {
  const transports: winston.transport[] = [];

  // 控制台输出
  transports.push(
    new winston.transports.Console({
      level: config.logging.level,
      format: createFormat(),
    })
  );

  // 文件输出（所有日志）
  transports.push(
    new winston.transports.File({
      filename: config.logging.file,
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  // 错误日志单独记录
  transports.push(
    new winston.transports.File({
      filename: config.logging.file.replace('.log', '.error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );

  return transports;
}

/**
 * Winston Logger 实例
 */
const winstonLogger = winston.createLogger({
  level: config.logging.level,
  format: createFormat(),
  transports: createTransports(),
  // 异常处理
  exceptionHandlers: [
    new winston.transports.File({
      filename: config.logging.file.replace('.log', '.exceptions.log'),
    }),
  ],
  // 未处理的 Promise 拒绝
  rejectionHandlers: [
    new winston.transports.File({
      filename: config.logging.file.replace('.log', '.rejections.log'),
    }),
  ],
});

/**
 * 日志类
 * 提供类型安全的日志接口
 */
export class Logger {
  private context?: string;

  constructor(context?: string) {
    this.context = context;
  }

  /**
   * 格式化日志消息
   */
  private formatMessage(message: string, metadata?: LogMetadata): string {
    let formattedMessage = message;

    if (this.context) {
      formattedMessage = `[${this.context}] ${message}`;
    }

    return formattedMessage;
  }

  /**
   * 格式化日志元数据
   */
  private formatMetadata(metadata?: LogMetadata): any {
    const meta: any = { ...metadata };

    // 添加 worker ID
    if (config.worker.id) {
      meta.workerId = config.worker.id;
    }

    // 添加 context
    if (this.context && !meta.context) {
      meta.context = this.context;
    }

    return meta;
  }

  /**
   * 记录调试日志
   */
  debug(message: string, metadata?: LogMetadata): void {
    winstonLogger.debug(this.formatMessage(message), this.formatMetadata(metadata));
  }

  /**
   * 记录信息日志
   */
  info(message: string, metadata?: LogMetadata): void {
    winstonLogger.info(this.formatMessage(message), this.formatMetadata(metadata));
  }

  /**
   * 记录警告日志
   */
  warn(message: string, metadata?: LogMetadata): void {
    winstonLogger.warn(this.formatMessage(message), this.formatMetadata(metadata));
  }

  /**
   * 记录错误日志
   */
  error(message: string, error?: Error | LogMetadata, metadata?: LogMetadata): void {
    let meta = this.formatMetadata(metadata);

    if (error instanceof Error) {
      meta.error = {
        message: error.message,
        name: error.name,
        stack: error.stack,
        ...meta.error,
      };
    } else if (error) {
      meta = { ...meta, ...error };
    }

    winstonLogger.error(this.formatMessage(message), meta);
  }

  /**
   * 创建子日志器（带上下文）
   */
  child(context: string): Logger {
    return new Logger(this.context ? `${this.context}:${context}` : context);
  }
}

/**
 * 默认日志器实例
 */
export const logger = new Logger();

/**
 * 关闭所有日志传输（用于应用退出时清理资源）
 */
export async function closeLogger(): Promise<void> {
  await winstonLogger.close();
  winstonLogger.info('Logger closed');
}

/**
 * 创建带上下文的日志器
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
