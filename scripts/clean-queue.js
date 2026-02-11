#!/usr/bin/env node
/**
 * 清空 Redis 队列
 */

import Redis from 'ioredis';

const redisUrl = new URL('redis://:oychao1988@150.158.88.23:6379');

async function main() {
  const redis = new Redis({
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port),
    password: redisUrl.password,
  });

  console.log('🧹 清空 Redis 队列...');
  console.log('='.repeat(40));

  try {
    // BullMQ 队列键
    const keys = [
      'bull:tasks:wait',
      'bull:tasks:active',
      'bull:tasks:completed',
      'bull:tasks:failed',
      'bull:tasks:delayed',
      'bull:tasks:stalled',
      'bull:tasks:priority',
      'bull:tasks:id',
      'bull:tasks:events',
    ];

    for (const key of keys) {
      const result = await redis.del(key);
      if (result > 0) {
        console.log(`✅ 删除: ${key} (${result} 项)`);
      }
    }

    // 删除所有相关键（使用通配符）
    const allKeys = await redis.keys('bull:*');
    if (allKeys.length > 0) {
      await redis.del(...allKeys);
      console.log(`✅ 清理: ${allKeys.length} 个 BullMQ 键`);
    }

    console.log('');
    console.log('✅ 队列已清空！');

    await redis.quit();
  } catch (error) {
    console.error('❌ 错误:', error.message);
    process.exit(1);
  }
}

main();
