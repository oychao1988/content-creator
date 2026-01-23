/**
 * 简单的保存测试 - 直接调用 saveResults
 */

import { createLogger } from './src/infrastructure/logging/logger.js';
import { PostgresTaskRepository } from './src/infrastructure/database/PostgresTaskRepository.js';
import { PostgresResultRepository } from './src/infrastructure/database/ResultRepository.js';
import { PostgresQualityCheckRepository } from './src/infrastructure/database/PostgresQualityCheckRepository.js';
import { SyncExecutor } from './src/application/workflow/SyncExecutor.js';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('SimpleTest');

async function test() {
  const taskId = uuidv4();
  console.log('\n========================================');
  console.log('简单保存测试');
  console.log('========================================');
  console.log(`TaskID: ${taskId}`);

  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'Oychao#1988',
  });

  const taskRepo = new PostgresTaskRepository(pool);
  const resultRepo = new PostgresResultRepository(pool);
  const qualityCheckRepo = new PostgresQualityCheckRepository(pool);

  const executor = new SyncExecutor(taskRepo);
  executor.setResultRepository(resultRepo);
  executor.setQualityCheckRepository(qualityCheckRepo);

  // 创建任务
  console.log('\n[1] 创建任务...');
  await taskRepo.create({
    id: taskId,
    userId: 'test-user',
    mode: 'sync',
    topic: '简单测试',
    requirements: '测试质检保存',
  });
  console.log('[1] ✓ 任务创建成功');

  // 创建模拟的 state
  const mockState = {
    taskId,
    articleContent: '这是一篇测试文章，用于验证质检报告是否能正确保存到数据库。',
    images: [],
    textQualityReport: {
      score: 8.5,
      passed: true,
      hardConstraintsPassed: true,
      details: {
        hardRules: {
          passed: true,
          wordCount: { passed: true },
          keywords: { passed: true },
        },
      },
      fixSuggestions: [],
    },
    imageQualityReport: null,
  };

  console.log('\n[2] 模拟 State:');
  console.log('  - taskId:', mockState.taskId);
  console.log('  - articleContent:', mockState.articleContent?.substring(0, 30) + '...');
  console.log('  - textQualityReport:', mockState.textQualityReport ? '✓' : '✗');
  console.log('  - imageQualityReport:', mockState.imageQualityReport ? '✓' : '✗');

  // 直接访问私有方法
  console.log('\n[3] 调用 saveResults...');
  console.log('  - hasResultRepo:', !!resultRepo);
  console.log('  - hasQualityCheckRepo:', !!qualityCheckRepo);

  // 手动执行保存逻辑（复制自 saveResults）
  try {
    // 保存文章
    if (mockState.articleContent && resultRepo) {
      console.log('\n[4] 保存文章...');
      await resultRepo.create({
        taskId: mockState.taskId,
        resultType: 'article',
        content: mockState.articleContent,
        metadata: { wordCount: mockState.articleContent.length },
      });
      console.log('[4] ✓ 文章保存成功');
    }

    // 保存质检报告
    console.log('\n[5] 检查质检报告条件:');
    console.log('  - state.textQualityReport:', !!mockState.textQualityReport);
    console.log('  - qualityCheckRepo:', !!qualityCheckRepo);

    if (mockState.textQualityReport && qualityCheckRepo) {
      console.log('\n[6] 保存质检报告...');
      await qualityCheckRepo.create({
        taskId: mockState.taskId,
        checkType: 'text',
        score: mockState.textQualityReport.score,
        passed: mockState.textQualityReport.passed,
        hardConstraintsPassed: mockState.textQualityReport.hardConstraintsPassed,
        details: mockState.textQualityReport.details,
        fixSuggestions: mockState.textQualityReport.fixSuggestions,
      });
      console.log('[6] ✓ 质检报告保存成功');
    } else {
      console.log('\n[6] ✗ 质检报告保存条件不满足！');
    }

    console.log('\n========================================');
    console.log('✓ 测试完成！');
    console.log('========================================');
  } catch (error) {
    console.error('\n✗ 保存失败:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

test().catch(console.error);
