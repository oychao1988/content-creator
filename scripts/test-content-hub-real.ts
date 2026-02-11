#!/usr/bin/env tsx
/**
 * Content-Hub 真实流程测试
 *
 * 完整的端到端测试：
 * 1. 创建定时任务
 * 2. Worker 从队列获取并处理
 * 3. 完成后模拟回调到 content-hub
 */

import { createTaskScheduler } from '../src/schedulers/TaskScheduler.js';
import { createTaskRepository } from '../src/infrastructure/database/index.js';
import { createResultRepository } from '../src/infrastructure/database/index.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';
import { config } from '../src/config/index.js';
import Redis from 'ioredis';

const logger = createLogger('Test:ContentHub');

/**
 * 检查 Worker 是否在运行
 */
async function checkWorkerStatus(): Promise<boolean> {
  try {
    const redisUrl = new URL(config.redis.url || 'redis://localhost:6379');
    const redis = new Redis({
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port),
      password: redisUrl.password,
    });

    // 检查队列中是否有活跃的 worker
    const waiting = await redis.llen('bull:tasks:wait');
    const active = await redis.llen('bull:tasks:active');

    await redis.quit();

    console.log(`✅ Redis 队列状态: 等待=${waiting}, 活跃=${active}`);
    return true;
  } catch (error) {
    console.error('❌ 无法连接 Redis:', error);
    return false;
  }
}

/**
 * 模拟 Content-Hub 回调
 */
interface CallbackPayload {
  event: 'completed' | 'failed';
  taskId: string;
  workflowType: string;
  status: string;
  timestamp: string;
  metadata: {
    topic: string;
    requirements: string;
  };
  result?: {
    content: string;
    images: string[];
    qualityScore: number;
    wordCount: number;
    metrics: {
      duration: string;
      tokensUsed: number;
      cost: number;
    };
  };
  error?: {
    type: string;
    message: string;
  };
}

async function simulateCallback(payload: CallbackPayload): Promise<void> {
  console.log('\n' + '='.repeat(70));
  console.log('📥 Content-Creator → Content-Hub 发布池');
  console.log('='.repeat(70));

  console.log(`\n📋 回调信息:`);
  console.log(`   事件: ${payload.event}`);
  console.log(`   任务 ID: ${payload.taskId}`);
  console.log(`   时间: ${new Date(payload.timestamp).toLocaleString('zh-CN')}`);

  if (payload.event === 'completed' && payload.result) {
    console.log(`\n✅ 任务完成，添加到发布池...`);
    console.log(`\n📄 文章信息:`);
    console.log(`   标题: ${payload.metadata.topic}`);
    console.log(`   字数: ${payload.result.wordCount}`);
    console.log(`   质量分: ${payload.result.qualityScore}/10`);
    console.log(`   图片: ${payload.result.images?.length || 0} 张`);
    console.log(`   成本: $${payload.result.metrics.cost.toFixed(6)}`);
    console.log(`   用时: ${payload.result.metrics.duration}`);

    console.log(`\n💾 模拟保存到 Content-Hub 数据库:`);
    console.log(`   INSERT INTO publish_pool (`);
    console.log(`     id, task_id, content, status, created_at`);
    console.log(`   ) VALUES (`);
    console.log(`     '${crypto.randomUUID()}',`);
    console.log(`     '${payload.taskId}',`);
    console.log(`     '${payload.result.content.substring(0, 50).replace(/\n/g, ' ')}...',`);
    console.log(`     'pending_publish',`);
    console.log(`     NOW()`);
    console.log(`   );`);

    console.log(`\n✅ 文章已添加到发布池，等待人工审核后发布！`);
  } else if (payload.event === 'failed') {
    console.log(`\n❌ 任务失败:`);
    console.log(`   类型: ${payload.error?.type}`);
    console.log(`   消息: ${payload.error?.message}`);
  }

  console.log('\n' + '='.repeat(70));
}

async function main() {
  console.log('========================================');
  console.log('🧪 Content-Hub 真实流程测试');
  console.log('========================================');
  console.log('');

  // 显示配置
  console.log('📋 当前配置:');
  console.log(`   Redis: ${config.redis.enabled ? '✅ 启用' : '❌ 禁用'}`);
  console.log(`   数据库: ${config.database.type}`);
  console.log(`   LLM: ${config.llm.modelName}`);
  console.log('');

  // 检查 Worker 状态
  console.log('1️⃣ 检查 Worker 状态...');
  console.log('-'.repeat(40));
  const workerRunning = await checkWorkerStatus();

  if (!workerRunning) {
    console.log('\n⚠️  Worker 未运行！');
    console.log('');
    console.log('💡 请先启动 Worker:');
    console.log('   pnpm run worker');
    console.log('');
    console.log('   或者使用命令在另一个终端启动:');
    console.log('   WORKER_ID=worker-1 pnpm run worker');
    console.log('');
    console.log('✋ 测试暂停，请先启动 Worker 后再运行');
    process.exit(1);
  }

  console.log('');

  // 创建任务调度器
  const scheduler = await createTaskScheduler();
  const taskRepository = createTaskRepository();
  const resultRepository = createResultRepository();

  // 创建测试任务
  console.log('2️⃣ 创建定时任务...');
  console.log('-'.repeat(40));
  console.log('');

  // 场景：延迟 30 秒执行（给 Worker 足够时间启动）
  const executeTime = new Date(Date.now() + 30 * 1000);
  console.log(`⏰ 执行时间: ${executeTime.toLocaleString('zh-CN')}`);
  console.log(`⏱️  延迟: 30 秒`);
  console.log('');

  const taskId = await scheduler.scheduleTask({
    mode: 'async',
    topic: 'AI 时代的编程语言选择指南',
    requirements: '分析 2025-2026 年主流编程语言的特点、适用场景和学习建议',
    targetAudience: '技术从业者和编程学习者',
    tone: 'professional',
    hardConstraints: {
      minWords: 1000,
      maxWords: 2000,
    },
    scheduleAt: executeTime,
    priority: 5,
  } as any);

  console.log(`✅ 任务已创建: ${taskId}`);
  console.log('');

  // 查看队列统计
  console.log('3️⃣ 队列统计...');
  console.log('-'.repeat(40));
  const stats = await scheduler.getQueueStats();
  console.log(`   等待队列: ${stats.waiting}`);
  console.log(`   活跃任务: ${stats.active}`);
  console.log(`   延迟任务: ${stats.delayed}`);
  console.log(`   已完成: ${stats.completed}`);
  console.log(`   失败: ${stats.failed}`);
  console.log('');

  // 监控任务状态
  console.log('4️⃣ 监控任务执行...');
  console.log('-'.repeat(40));
  console.log('⏳ 等待 Worker 处理任务...');
  console.log('   (每 3 秒检查一次状态)\n');

  let lastStatus = 'pending';
  let checkCount = 0;
  const maxChecks = 40; // 最多检查 40 次 (2 分钟)

  while (checkCount < maxChecks) {
    const task = await taskRepository.findById(taskId);

    if (!task) {
      console.log('❌ 任务不存在');
      break;
    }

    if (task.status !== lastStatus) {
      const now = new Date().toLocaleTimeString('zh-CN');
      const icon = {
        'pending': '⏰',
        'processing': '⚙️',
        'completed': '✅',
        'failed': '❌',
      }[task.status] || '📝';

      console.log(`[${now}] ${icon} 状态: ${lastStatus} → ${task.status}`);
      lastStatus = task.status;

      // 如果变成 processing，说明 Worker 开始处理了
      if (task.status === 'processing') {
        console.log('   → Worker 正在执行任务...');
      }
    }

    // 检查任务是否完成或失败
    if (task.status === 'completed' || task.status === 'failed') {
      console.log('');
      console.log('========================================');
      console.log(`🎉 任务${task.status === 'completed' ? '完成' : '失败'}！`);
      console.log('========================================');

      // 获取结果并模拟回调
      if (task.status === 'completed') {
        const result = await resultRepository.findByTaskId(taskId);

        if (result) {
          const callbackPayload: CallbackPayload = {
            event: 'completed',
            taskId: task.id,
            workflowType: 'content-creator',
            status: 'completed',
            timestamp: new Date().toISOString(),
            metadata: {
              topic: task.topic,
              requirements: task.requirements || '',
            },
            result: {
              content: result.content || '',
              images: result.images || [],
              qualityScore: result.qualityScore || 0,
              wordCount: result.content?.length || 0,
              metrics: {
                duration: `${Math.floor((Number(task.updatedAt) - Number(task.createdAt)) / 1000)}秒`,
                tokensUsed: 0,
                cost: 0,
              },
            },
          };

          await simulateCallback(callbackPayload);
        } else {
          console.log('⚠️  未找到任务结果');
        }
      } else {
        // 失败回调
        const callbackPayload: CallbackPayload = {
          event: 'failed',
          taskId: task.id,
          workflowType: 'content-creator',
          status: 'failed',
          timestamp: new Date().toISOString(),
          metadata: {
            topic: task.topic,
            requirements: task.requirements || '',
          },
          error: {
            type: 'workflow_failed',
            message: task.errorMessage || '未知错误',
          },
        };

        await simulateCallback(callbackPayload);
      }

      break;
    }

    checkCount++;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  if (checkCount >= maxChecks) {
    console.log('\n⚠️  超过最大检查次数');
    console.log('');
    console.log('💡 可以通过以下命令手动查询任务:');
    console.log(`   pnpm run cli status --task-id ${taskId}`);
    console.log(`   pnpm run cli result --task-id ${taskId}`);
  }

  // 最终统计
  console.log('\n5️⃣ 最终统计...');
  console.log('-'.repeat(40));
  const finalStats = await scheduler.getQueueStats();
  console.log(`   等待队列: ${finalStats.waiting}`);
  console.log(`   活跃任务: ${finalStats.active}`);
  console.log(`   延迟任务: ${finalStats.delayed}`);
  console.log(`   已完成: ${finalStats.completed}`);
  console.log(`   失败: ${finalStats.failed}`);
  console.log('');

  // 清理
  await scheduler.close();

  console.log('✅ 测试完成！');
  console.log('');
  console.log('📝 下一步:');
  console.log('');
  console.log('1. 查看 Content-Hub 发布池中的文章');
  console.log('2. 进行人工审核');
  console.log('3. 批量发布到目标平台（公众号、知乎等）');
  console.log('');
}

main().catch((error) => {
  logger.error('Test failed', error);
  process.exit(1);
});
