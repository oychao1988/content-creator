/**
 * 测试 Webhook 回调服务器
 *
 * 用于集成测试中接收和记录 Webhook 回调
 */

import express from 'express';
import { createLogger } from '../../src/infrastructure/logging/logger.js';

const logger = createLogger('TestCallbackServer');

// 回调记录存储
interface CallbackRecord {
  payload: any;
  receivedAt: string;
  headers: Record<string, string>;
}

let receivedCallbacks: CallbackRecord[] = [];
let serverInstance: any = null;
const CALLBACK_FILE = 'test-webhook-callbacks.json';

/**
 * 创建 Express 服务器
 */
export function createCallbackServer(port: number = 3000): Express.Application {
  const app = express();

  // 解析 JSON body
  app.use(express.json());

  // POST /callback - 接收 Webhook 回调
  app.post('/callback', (req, res) => {
    const record: CallbackRecord = {
      payload: req.body,
      receivedAt: new Date().toISOString(),
      headers: {
        'content-type': req.headers['content-type'] as string,
        'x-webhook-event': req.headers['x-webhook-event'] as string,
        'x-task-id': req.headers['x-task-id'] as string,
        'user-agent': req.headers['user-agent'] as string,
      },
    };

    // 记录回调
    receivedCallbacks.push(record);

    // 日志输出
    logger.info('Webhook callback received', {
      taskId: req.body.taskId,
      event: req.body.event,
      status: req.body.status,
      timestamp: record.receivedAt,
    });

    // 返回成功响应
    res.status(200).json({ success: true });
  });

  // GET /callbacks - 获取所有接收到的回调（用于测试验证）
  app.get('/callbacks', (req, res) => {
    res.json({
      count: receivedCallbacks.length,
      callbacks: receivedCallbacks,
    });
  });

  // DELETE /callbacks - 清空调用记录（用于测试清理）
  app.delete('/callbacks', (req, res) => {
    const count = receivedCallbacks.length;
    receivedCallbacks = [];
    res.json({ success: true, cleared: count });
  });

  return app;
}

/**
 * 启动测试服务器
 */
export async function startCallbackServer(port: number = 3000): Promise<void> {
  if (serverInstance) {
    logger.warn('Callback server already running, stopping previous instance...');
    await stopCallbackServer();
    // 等待端口释放
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const app = createCallbackServer(port);

  return new Promise((resolve, reject) => {
    serverInstance = app.listen(port, () => {
      logger.info(`Test callback server started on port ${port}`);
      resolve();
    });

    serverInstance.on('error', (err: Error) => {
      logger.error('Failed to start callback server', { error: err.message });
      serverInstance = null;
      reject(err);
    });
  });
}

/**
 * 停止测试服务器
 */
export async function stopCallbackServer(): Promise<void> {
  if (!serverInstance) {
    logger.debug('Callback server not running');
    return;
  }

  return new Promise((resolve) => {
    serverInstance.close((err: Error | undefined) => {
      if (err) {
        logger.error('Error stopping callback server', { error: err.message });
      } else {
        logger.info('Test callback server stopped');
      }
      serverInstance = null;
      resolve();
    });
  });
}

/**
 * 保存回调记录到文件
 */
export async function saveCallbacksToFile(): Promise<void> {
  const fs = await import('fs/promises');
  const path = await import('path');

  const filePath = path.join(process.cwd(), CALLBACK_FILE);
  await fs.writeFile(filePath, JSON.stringify(receivedCallbacks, null, 2), 'utf-8');

  logger.info(`Callbacks saved to ${filePath}`, { count: receivedCallbacks.length });
}

/**
 * 获取所有接收到的回调
 */
export function getReceivedCallbacks(): CallbackRecord[] {
  return [...receivedCallbacks];
}

/**
 * 清空回调记录
 */
export function clearCallbacks(): void {
  receivedCallbacks = [];
  logger.info('Callback records cleared');
}

/**
 * 查找特定任务的回调
 */
export function findCallbacksByTaskId(taskId: string): CallbackRecord[] {
  return receivedCallbacks.filter((record) => record.payload.taskId === taskId);
}

/**
 * 查找特定事件的回调
 */
export function findCallbacksByEvent(event: string): CallbackRecord[] {
  return receivedCallbacks.filter((record) => record.payload.event === event);
}

/**
 * 等待接收回调
 */
export async function waitForCallback(
  predicate: (callback: CallbackRecord) => boolean,
  timeout: number = 10000
): Promise<CallbackRecord | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const found = receivedCallbacks.find(predicate);
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return null;
}
