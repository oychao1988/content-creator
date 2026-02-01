#!/usr/bin/env tsx
/**
 * 调试 Claude CLI spawn 问题
 */

import { spawn } from 'child_process';

async function testSpawn() {
  console.log('\n🔍 测试 Claude CLI spawn\n');

  const command = 'claude';
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--model', 'sonnet'
  ];

  const prompt = '你好';

  console.log(`执行命令: ${command} ${args.join(' ')} ${prompt}\n`);
  console.log('通过 stdin 传递提示词\n');

  // 尝试 shell 模式，并通过 stdin 传递输入
  const proc = spawn(command, args, {
    shell: true,
    env: { ...process.env, PATH: process.env.PATH }
  });

  // 写入 stdin
  if (proc.stdin) {
    proc.stdin.write(prompt);
    proc.stdin.end();
  }

  let stdoutData = '';
  let stderrData = '';
  let hasReceivedData = false;

  // 设置超时检测（30秒）
  const timeout = setTimeout(() => {
    if (!hasReceivedData) {
      console.log('⚠️  30秒内未收到任何数据');
      console.log('stdout 长度:', stdoutData.length);
      console.log('stderr 长度:', stderrData.length);
      proc.kill();
      process.exit(1);
    }
  }, 30000);

  if (proc.stdout) {
    proc.stdout.on('data', (chunk: Buffer) => {
      hasReceivedData = true;
      const data = chunk.toString();
      stdoutData += data;
      console.log('✅ 收到 stdout 数据:', data.substring(0, 100));
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      stderrData += data;
      console.log('⚠️  收到 stderr 数据:', data);
    });
  }

  proc.on('close', (code: number | null) => {
    clearTimeout(timeout);
    console.log(`\n进程退出，代码: ${code}`);
    console.log(`stdout 总长度: ${stdoutData.length}`);
    console.log(`stderr 总长度: ${stderrData.length}`);

    if (stdoutData.length > 0) {
      console.log('\n✅ Spawn 工作正常！');
    } else {
      console.log('\n❌ Spawn 没有收到任何输出');
    }
  });

  proc.on('error', (error: Error) => {
    clearTimeout(timeout);
    console.error('❌ 进程错误:', error.message);
  });
}

testSpawn();
