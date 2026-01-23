#!/usr/bin/env tsx
/**
 * Redis 连接诊断脚本
 * 用于诊断 Redis 连接问题
 */

import { config } from '../src/config/index.js';

console.log('\n=== Redis 连接诊断 ===\n');

// 1. 显示配置信息
console.log('1. 配置信息:');
console.log('   Redis URL:', config.redis.url.replace(/:([^:@]+)@/, ':****@'));
console.log('   Password:', config.redis.password ? '已设置 (长度: ' + config.redis.password.length + ')' : '未设置');
console.log('   DB:', config.redis.db);
console.log('   连接超时:', config.redis.connectTimeout + 'ms');
console.log('   命令超时:', config.redis.commandTimeout + 'ms');

// 2. 解析 URL
console.log('\n2. URL 解析:');
try {
  const url = new URL(config.redis.url);
  console.log('   协议:', url.protocol);
  console.log('   主机:', url.hostname);
  console.log('   端口:', url.port);
  console.log('   密码:', url.password ? '已设置 (长度: ' + url.password.length + ')' : '未设置');
  console.log('   路径:', url.pathname);
} catch (error) {
  console.error('   ❌ URL 解析失败:', error);
}

// 3. 测试网络连接
console.log('\n3. 测试网络连接:');
const net = await import('net');

function testPort(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 5000;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });

    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });

    socket.connect(port, host);
  });
}

const url = new URL(config.redis.url);
const host = url.hostname;
const port = parseInt(url.port) || 6379;

console.log(`   正在连接 ${host}:${port}...`);
const canConnect = await testPort(host, port);

if (canConnect) {
  console.log('   ✅ 端口可访问');
} else {
  console.log('   ❌ 端口无法访问');
  console.log('   可能的原因:');
  console.log('     - Redis 服务器未运行');
  console.log('     - 防火墙阻止了连接');
  console.log('     - 网络不可达');
  console.log('     - Redis 服务器未绑定到 0.0.0.0');
}

// 4. 测试 Redis 连接
console.log('\n4. 测试 Redis 连接:');

import Redis from 'ioredis';

// 创建 Redis 客户端
const redisConfig: any = {
  host: host,
  port: port,
  db: config.redis.db,
  connectTimeout: config.redis.connectTimeout,
  lazyConnect: true, // 手动连接
};

// 如果 URL 中有密码,使用它
if (url.password) {
  redisConfig.password = url.password;
}

// 如果配置中有单独的密码,优先使用它
if (config.redis.password) {
  redisConfig.password = config.redis.password;
}

console.log('   连接配置:', {
  ...redisConfig,
  password: redisConfig.password ? '****' : undefined,
});

const client = new Redis(redisConfig);

try {
  console.log('   正在连接...');
  await client.connect((err) => {
    if (err) {
      console.error('   ❌ 连接失败:', err.message);
    } else {
      console.log('   ✅ 连接成功');
    }
  });

  // 如果连接成功,测试一些基本操作
  console.log('\n5. 测试基本操作:');

  const pong = await client.ping();
  console.log('   ✅ PING -> PONG');

  const info = await client.info('server');
  const versionMatch = info.match(/redis_version:([\d.]+)/);
  if (versionMatch) {
    console.log('   ✅ Redis 版本:', versionMatch[1]);
  }

  // 测试读写
  await client.set('test:diagnosis', 'connection ok');
  console.log('   ✅ SET 测试通过');

  const value = await client.get('test:diagnosis');
  console.log('   ✅ GET 测试通过:', value);

  await client.del('test:diagnosis');
  console.log('   ✅ DEL 测试通过');

  // 获取数据库信息
  const dbSize = await client.dbsize();
  console.log('   ✅ 当前数据库键数量:', dbSize);

  console.log('\n=== 所有测试通过 ===');

  await client.quit();
  process.exit(0);
} catch (error: any) {
  console.error('\n   ❌ Redis 连接失败:');
  console.error('   错误类型:', error.name);
  console.error('   错误信息:', error.message);

  if (error.message.includes('ECONNREFUSED')) {
    console.error('\n   💡 建议:');
    console.error('   1. 检查 Redis 服务器是否正在运行');
    console.error('   2. 检查 Redis 配置文件 (redis.conf):');
    console.error('      - bind 0.0.0.0 (允许外部访问)');
    console.error('      - requirepass 你的密码');
    console.error('   3. 检查防火墙规则');
    console.error('   4. 检查云服务器安全组规则');
  } else if (error.message.includes('NOAUTH')) {
    console.error('\n   💡 建议: 需要密码认证');
    console.error('   请检查 REDIS_URL 中的密码是否正确');
  } else if (error.message.includes('WRONGPASS')) {
    console.error('\n   💡 建议: 密码错误');
    console.error('   请检查 REDIS_URL 中的密码是否正确');
  }

  await client.quit().catch(() => {});
  process.exit(1);
}
