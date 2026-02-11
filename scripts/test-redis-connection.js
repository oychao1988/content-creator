#!/usr/bin/env node
/**
 * 测试 Redis 连接
 */

const redisUrl = new URL('redis://:oychao1988@150.158.88.23:6379');

console.log('🔍 测试 Redis 连接...');
console.log(`   主机: ${redisUrl.hostname}`);
console.log(`   端口: ${redisUrl.port}`);
console.log(`   密码: ${redisUrl.password ? '***' : '无'}`);
console.log('');

import('ioredis').then(async ({ default: Redis }) => {
  const redis = new Redis({
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port),
    password: redisUrl.password,
    connectTimeout: 5000,
  });

  try {
    const result = await redis.ping();
    console.log('✅ Redis 连接成功!');
    console.log(`   PING → ${result}`);
    console.log('');
    console.log('📊 Redis 信息:');
    const info = await redis.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1];
    console.log(`   版本: ${version || '未知'}`);

    const dbSize = await redis.dbsize();
    console.log(`   键数量: ${dbSize}`);

    await redis.quit();
    process.exit(0);
  } catch (error) {
    console.error('❌ Redis 连接失败:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}).catch(() => {
  console.error('❌ ioredis 模块未安装');
  console.error('   运行: pnpm add ioredis');
  process.exit(1);
});
