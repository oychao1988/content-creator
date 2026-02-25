/**
 * Content-Creator HTTP API Server
 *
 * 提供 HTTP API 接口用于内容创作
 * 运行在端口 18100
 */

import fastify from 'fastify';
import { createLogger } from '../infrastructure/logging/logger.js';
import { createSyncExecutor } from '../application/workflow/SyncExecutor.js';
import { createTaskRepository } from '../infrastructure/database/index.js';

const logger = createLogger('APIServer');

/**
 * 创建并启动 HTTP API 服务器
 */
async function createApiServer(port: number = 18100): Promise<void> {
  const app = fastify({
    logger: false, // 使用我们自己的 logger
  });

  // 注册 CORS
  await app.register(import('@fastify/cors'), {
    origin: true,
  });

  // 健康检查
  app.get('/health', async (request, reply) => {
    return {
      status: 'ok',
      service: 'content-creator-api',
      timestamp: new Date().toISOString(),
    };
  });

  // 内容创作 API 端点
  app.post('/api/v1/content/create', async (request, reply) => {
    try {
      const body = request.body as any;

      // 验证必需参数
      if (!body.topic) {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'MISSING_PARAMETER',
            message: '缺少必需参数: topic',
          },
        });
      }

      logger.info('收到内容创作请求', { topic: body.topic });

      // 创建执行器和仓储
      const executor = createSyncExecutor(createTaskRepository());

      // 🔧 修复：设置 ResultRepository 和 QualityCheckRepository
      const { createResultRepository } = await import('../infrastructure/database/index.js');
      const { createQualityCheckRepository } = await import('../infrastructure/database/index.js');
      executor.setResultRepository(createResultRepository());
      executor.setQualityCheckRepository(createQualityCheckRepository());

      // 准备参数
      const params = {
        topic: body.topic,
        requirements: body.requirements || body.title,
        targetAudience: body.target_audience || '普通读者',
        tone: body.tone || '友好专业',
        mode: 'sync',
      };

      // 执行内容创作
      const result = await executor.execute(params);

      logger.info('内容创作完成', { taskId: result.taskId });

      // 返回结果
      return reply.send({
        success: true,
        data: {
          taskId: result.taskId,
          content: (result.finalState as any).articleContent,
          title: (result.finalState as any).articleTitle,
          htmlContent: (result.finalState as any).finalArticleContent,
          images: (result.finalState as any).images || [],
          metadata: {
            topic: body.topic,
            createdAt: new Date().toISOString(),
            wordCount: (result.finalState as any).articleContent?.length || 0,
            stepsCompleted: result.metadata.stepsCompleted,
            tokensUsed: result.metadata.tokensUsed,
            cost: result.metadata.cost,
            duration: result.duration,
          },
        },
      });
    } catch (error: any) {
      logger.error('内容创作失败', error);

      return reply.code(500).send({
        success: false,
        error: {
          code: 'EXECUTION_FAILED',
          message: error.message || '内容创作失败',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
      });
    }
  });

  // 任务状态查询 API
  app.get('/api/v1/tasks/:taskId', async (request, reply) => {
    try {
      const { taskId } = request.params as { taskId: string };

      // 查询任务状态
      const taskRepository = createTaskRepository();
      const task = await taskRepository.findById(taskId);

      if (!task) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'TASK_NOT_FOUND',
            message: '任务不存在',
          },
        });
      }

      // 查询结果（从 results 表）
      const { createResultRepository } = await import('../infrastructure/database/index.js');
      const resultRepository = createResultRepository();
      const results = await resultRepository.findByTaskId(taskId);

      // 组装结果数据
      const articleResult = results.find(r => r.resultType === 'article');
      const finalArticleResult = results.find(r => r.resultType === 'finalArticle');
      const imageResult = results.find(r => r.resultType === 'image');

      return reply.send({
        success: true,
        data: {
          taskId: task.id,
          status: task.status,
          topic: task.topic,
          result: {
            content: finalArticleResult?.content || articleResult?.content,
            images: imageResult?.content ? JSON.parse(imageResult.content) : [],
            metadata: {
              wordCount: finalArticleResult?.metadata?.wordCount ||
                        articleResult?.metadata?.wordCount || 0,
              imageCount: imageResult?.metadata?.count || 0,
            },
          },
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          completedAt: task.completedAt,
        },
      });
    } catch (error: any) {
      logger.error('查询任务状态失败', error);

      return reply.code(500).send({
        success: false,
        error: {
          code: 'QUERY_FAILED',
          message: error.message || '查询任务状态失败',
        },
      });
    }
  });

  // 启动服务器
  try {
    await app.listen({ port, host: '0.0.0.0' });

    logger.info('API 服务器已启动', {
      port,
      url: `http://localhost:${port}`,
      endpoints: [
        'GET /health',
        'POST /api/v1/content/create',
        'GET /api/v1/tasks/:taskId',
      ],
    });

    // 优雅关闭
    const shutdown = async () => {
      logger.info('正在关闭 API 服务器...');
      await app.close();
      logger.info('API 服务器已关闭');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error: any) {
    logger.error('API 服务器启动失败', error);
    throw error;
  }
}

// 导出函数供外部调用
export { createApiServer };
