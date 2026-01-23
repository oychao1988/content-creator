/**
 * SQLite 数据库初始化脚本
 *
 * 创建数据库文件和必要的表结构
 */

import path from 'path';
import fs from 'fs';
import { createLogger } from '../src/infrastructure/logging/logger.js';

const logger = createLogger('InitSQLite');

async function initializeSQLite() {
  console.log('========================================');
  console.log('    SQLite 数据库初始化');
  console.log('========================================\n');

  // 1. 确保 data 目录存在
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('✓ 创建数据目录:', dataDir);
  }

  // 2. 导入 SQLite Repository
  console.log('\n2. 初始化数据库...\n');

  try {
    const { SQLiteTaskRepository } = await import('../src/infrastructure/database/SQLiteTaskRepository.js');

    const dbPath = path.join(dataDir, 'content-creator.db');
    const repo = new SQLiteTaskRepository(dbPath);

    // 3. 验证数据库
    console.log('3. 验证数据库...\n');

    const isHealthy = await repo.healthCheck();
    if (isHealthy) {
      console.log('   ✓ 数据库健康检查通过');
    } else {
      console.log('   ✗ 数据库健康检查失败');
      process.exit(1);
    }

    // 4. 创建测试任务
    console.log('\n4. 创建测试任务...\n');

    const { TaskType, ExecutionMode } = await import('../src/domain/entities/Task.js');

    const testTask = await repo.create({
      id: 'test-sqlite-' + Date.now(),
      mode: ExecutionMode.SYNC,
      type: TaskType.ARTICLE,
      topic: 'SQLite 测试主题',
      requirements: '测试 SQLite 数据库功能',
      hardConstraints: {
        minWords: 100,
        maxWords: 500,
      },
    });

    console.log('   ✓ 测试任务创建成功');
    console.log('      任务ID:', testTask.id);
    console.log('      选题:', testTask.topic);
    console.log('      状态:', testTask.status);

    // 5. 验证任务可以读取
    console.log('\n5. 验证任务读取...\n');

    const fetchedTask = await repo.findById(testTask.id);
    if (fetchedTask) {
      console.log('   ✓ 任务读取成功');
      console.log('      选题:', fetchedTask.topic);
      console.log('      创建时间:', fetchedTask.createdAt);
    } else {
      console.log('   ✗ 任务读取失败');
      process.exit(1);
    }

    // 6. 验证任务更新
    console.log('\n6. 验证任务更新...\n');

    const updatedTask = await repo.update(testTask.id, {
      status: 'running',
      workerId: 'worker-test',
      startedAt: new Date().toISOString(),
    });

    console.log('   ✓ 任务更新成功');
    console.log('      状态:', updatedTask.status);
    console.log('      Worker ID:', updatedTask.workerId);

    // 7. 验证任务列表
    console.log('\n7. 验证任务列表...\n');

    const taskList = await repo.list({ limit: 10 });
    console.log('   ✓ 任务列表获取成功');
    console.log('      总数:', taskList.total);
    console.log('      返回数量:', taskList.data.length);

    // 8. 清理测试任务
    console.log('\n8. 清理测试数据...\n');

    await repo.delete(testTask.id);
    console.log('   ✓ 测试任务已删除');

    repo.close();

    console.log('\n========================================');
    console.log('   ✓ SQLite 初始化完成！');
    console.log('========================================');
    console.log('\n数据库文件:', dbPath);
    console.log('表结构:');
    console.log('  - tasks (任务表)');
    console.log('  - task_steps (步骤表)');
    console.log('  - quality_checks (质检表)');
    console.log('  - results (结果表)');
    console.log('\n可以开始使用 SQLite 了！\n');
  } catch (error) {
    console.error('\n✗ 初始化失败:', error);
    logger.error('SQLite initialization failed', error as Error);
    process.exit(1);
  }
}

initializeSQLite();
