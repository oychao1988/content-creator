#!/usr/bin/env tsx
/**
 * Redis 连接测试脚本
 */

import { redisClient } from '../src/infrastructure/redis/connection.js';

console.log('\n=== Testing Redis Connection ===\n');

async function testRedis() {
  try {
    // 测试连接
    console.log('1. Testing connection...');
    const pong = await redisClient.ping();
    console.log(`   ✓ PING -> PONG`);

    // 测试基本操作
    console.log('\n2. Testing basic operations...');
    const client = await redisClient.getClient();

    // SET 操作
    await client.set('test:key', 'hello redis');
    console.log('   ✓ SET test:key = "hello redis"');

    // GET 操作
    const value = await client.get('test:key');
    console.log(`   ✓ GET test:key = "${value}"`);

    // DEL 操作
    await client.del('test:key');
    console.log('   ✓ DEL test:key');

    // 测试过期时间
    console.log('\n3. Testing expiration...');
    await client.set('test:expire', 'will expire soon', 'EX', 2);
    console.log('   ✓ SET test:expire with 2s TTL');

    let exists = await client.exists('test:expire');
    console.log(`   ✓ Key exists: ${exists === 1}`);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    exists = await client.exists('test:expire');
    console.log(`   ✓ After 2.5s, key exists: ${exists === 1}`);

    // 测试列表操作
    console.log('\n4. Testing list operations...');
    await client.lpush('test:list', 'item1', 'item2', 'item3');
    console.log('   ✓ LPUSH test:list');

    const listLength = await client.llen('test:list');
    console.log(`   ✓ LLEN test:list = ${listLength}`);

    const listItems = await client.lrange('test:list', 0, -1);
    console.log(`   ✓ LRANGE test:list = ${listItems.join(', ')}`);

    // 清理
    await client.del('test:list');
    console.log('   ✓ DEL test:list');

    // 获取 Redis 信息
    console.log('\n5. Getting Redis info...');
    const info = await redisClient.info('server');
    const versionMatch = info.match(/redis_version:([\d.]+)/);
    if (versionMatch) {
      console.log(`   ✓ Redis version: ${versionMatch[1]}`);
    }

    // 检查连接状态
    console.log('\n6. Checking connection status...');
    const isConnected = redisClient.isConnected();
    console.log(`   ✓ Connected: ${isConnected}`);

    console.log('\n=== All Redis Tests Passed ===\n');

    // 断开连接
    await redisClient.disconnect();
    console.log('Redis disconnected gracefully');
  } catch (error) {
    console.error('❌ Redis test failed:', error);
    process.exit(1);
  }
}

testRedis();
