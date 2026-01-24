#!/usr/bin/env tsx
/**
 * 清理旧的等待任务
 *
 * 删除所有超过指定时间的 pending 状态任务
 */

import { createTaskRepository } from './src/infrastructure/database/index.js';

async function cleanupOldTasks() {
  console.log('=== 清理旧的等待任务 ===\n');

  const repo = createTaskRepository();

  // 查找所有等待任务
  const pendingTasks = await repo.findMany({ status: 'pending' }, { limit: 100 });

  console.log(`找到 ${pendingTasks.length} 个等待任务\n`);

  if (pendingTasks.length === 0) {
    console.log('✅ 没有需要清理的任务');
    return;
  }

  // 计算任务年龄
  const now = new Date();
  const oldTasks = pendingTasks.filter(task => {
    const created = new Date(task.createdAt || 0);
    const ageMinutes = (now.getTime() - created.getTime()) / (1000 * 60);
    return ageMinutes > 5; // 超过 5 分钟的任务
  });

  console.log(`其中 ${oldTasks.length} 个任务超过 5 分钟未处理（可能是旧任务）\n`);

  if (oldTasks.length === 0) {
    console.log('✅ 所有任务都是最近创建的，无需清理');
    return;
  }

  // 显示将被删除的任务
  console.log('将被删除的任务:');
  oldTasks.forEach((task, index) => {
    const created = new Date(task.createdAt || 0);
    const ageMinutes = Math.floor((now.getTime() - created.getTime()) / (1000 * 60));
    console.log(`  ${index + 1}. ${task.taskId}`);
    console.log(`     主题: ${task.topic}`);
    console.log(`     创建: ${created.toLocaleString('zh-CN')}`);
    console.log(`     年龄: ${ageMinutes} 分钟`);
    console.log();
  });

  // 确认删除
  console.log(`⚠️  即将删除 ${oldTasks.length} 个旧任务`);
  console.log('这些任务已经超过 5 分钟未处理，说明它们没有被正确添加到队列。\n');

  let deletedCount = 0;
  for (const task of oldTasks) {
    try {
      await repo.delete(task.taskId);
      deletedCount++;
      console.log(`✅ 已删除: ${task.taskId}`);
    } catch (error) {
      console.log(`❌ 删除失败: ${task.taskId} - ${(error as Error).message}`);
    }
  }

  console.log(`\n✅ 清理完成！删除了 ${deletedCount}/${oldTasks.length} 个旧任务`);
  console.log('\n💡 提示: 使用以下命令创建新任务:');
  console.log('   pnpm run cli:create --topic "主题" --requirements "要求"');
}

cleanupOldTasks().catch(console.error);
