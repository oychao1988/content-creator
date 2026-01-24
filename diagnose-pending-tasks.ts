#!/usr/bin/env tsx
/**
 * 诊断等待中的任务为什么没有被执行
 */

import { createTaskRepository } from './src/infrastructure/database/index.js';
import { TaskQueue } from './src/infrastructure/queue/TaskQueue.js';

async function diagnose() {
  console.log('=== 诊断等待中的任务 ===\n');

  // 1. 检查数据库中的等待任务
  const repo = createTaskRepository();
  const pendingTasks = await repo.findMany({ status: 'pending' }, { limit: 50 });

  console.log(`📊 数据库中的等待任务: ${pendingTasks.length} 个\n`);

  if (pendingTasks.length > 0) {
    console.log('任务列表:');
    pendingTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.taskId}`);
      console.log(`     主题: ${task.topic}`);
      console.log(`     创建: ${task.createdAt}`);
      console.log(`     状态: ${task.status}`);
      console.log();
    });
  }

  // 2. 检查 Redis 队列状态
  try {
    const queue = new TaskQueue();
    const queueStats = await queue.getStats();

    console.log('📋 Redis 队列状态:');
    console.log(`   等待中: ${queueStats.waiting}`);
    console.log(`   处理中: ${queueStats.active}`);
    console.log(`   已完成: ${queueStats.completed}`);
    console.log(`   失败: ${queueStats.failed}`);
    console.log(`   延迟: ${queueStats.delayed}`);
    console.log();

    await queue.close();
  } catch (error) {
    console.log('❌ 无法连接到 Redis 队列:', (error as Error).message);
    console.log();
  }

  // 3. 对比分析
  console.log('🔍 分析:\n');

  if (pendingTasks.length > 0) {
    console.log('⚠️  数据库中有 ' + pendingTasks.length + ' 个等待任务，但 Redis 队列中没有等待任务！');
    console.log('\n可能的原因:');
    console.log('   1. 任务创建时队列服务不可用');
    console.log('   2. 任务是在代码修复前创建的（修复前队列集成有问题）');
    console.log('   3. 任务是通过其他方式创建的（直接写入数据库）');
    console.log('\n建议解决方案:');
    console.log('   - 取消这些旧任务: pnpm run cli:cancel --task-id <任务ID>');
    console.log('   - 创建新任务: pnpm run cli:create --topic "主题" --requirements "要求"');
  }
}

diagnose().catch(console.error);
