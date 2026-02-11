#!/usr/bin/env node
/**
 * 检查 Redis 队列状态
 */

import Redis from 'ioredis';

const redisUrl = new URL('redis://:oychao1988@150.158.88.23:6379');

async function main() {
  const redis = new Redis({
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port),
    password: redisUrl.password,
  });

  console.log('📊 Redis 队列状态检查');
  console.log('='.repeat(40));
  console.log(`主机: ${redisUrl.hostname}`);
  console.log(`端口: ${redisUrl.port}`);
  console.log('');

  try {
    // BullMQ 队列键
    const keys = {
      wait: 'bull:tasks:wait',
      active: 'bull:tasks:active',
      completed: 'bull:tasks:completed',
      failed: 'bull:tasks:failed',
      delayed: 'bull:tasks:delayed',
    };

    const stats = {};
    for (const [name, key] of Object.entries(keys)) {
      const count = await redis.llen(key);
      stats[name] = count;
    }

    console.log('📋 队列统计:');
    console.log(`   等待 (wait):    ${stats.wait}`);
    console.log(`   活跃 (active):  ${stats.active}`);
    console.log(`   已完成 (completed): ${stats.completed}`);
    console.log(`   失败 (failed):    ${stats.failed}`);
    console.log(`   延迟 (delayed):  ${stats.delayed}`);
    console.log('');

    // 检查是否有活跃 Worker
    const workersKey = 'bull:tasks:stalled';
    const stalled = await redis.llen(workersKey);
    console.log(`👷 Worker 状态:`);
    console.log(`   卡住的任务: ${stalled}`);

    if (stats.wait === 0 && stats.active === 0) {
      console.log('');
      console.log('💡 队列为空，可以启动 Worker:');
      console.log('   pnpm run worker');
    } else if (stats.active > 0) {
      console.log('');
      console.log('✅ Worker 正在处理任务！');
    } else if (stats.wait > 0) {
      console.log('');
      console.log('⏰ 队列中有任务等待处理');
      console.log('💡 请启动 Worker:');
      console.log('   pnpm run worker');
    }

    await redis.quit();
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
