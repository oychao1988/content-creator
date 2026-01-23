#!/usr/bin/env node

/**
 * 测试 result 命令是否正常退出
 */

import { spawn } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

const taskId = 'b1b1c2c9-cc9d-450e-ac58-f8e5e1d346aa';
const startTime = Date.now();

console.log(`\n🧪 测试 CLI result 命令退出...\n`);
console.log(`命令: pnpm cli result -t ${taskId}`);
console.log(`开始时间: ${new Date().toISOString()}\n`);

const child = spawn('pnpm', ['cli', 'result', '-t', taskId], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  const duration = Date.now() - startTime;
  console.log(`\n✅ 进程已退出`);
  console.log(`退出码: ${code}`);
  console.log(`耗时: ${duration}ms`);
  console.log(`结束时间: ${new Date().toISOString()}`);

  if (duration < 5000) {
    console.log(`\n✨ 命令正常退出（耗时 ${duration}ms）`);
  } else {
    console.log(`\n⚠️  命令耗时较长（${duration}ms），可能存在挂起`);
  }

  process.exit(code);
});

child.on('error', (error) => {
  console.error(`\n❌ 进程错误:`, error);
  process.exit(1);
});

// 10秒后强制终止
setTimeout(() => {
  console.log(`\n⏰ 超时（10秒），强制终止进程`);
  child.kill('SIGTERM');
  setTimeout(() => {
    child.kill('SIGKILL');
    process.exit(1);
  }, 1000);
}, 10000);
