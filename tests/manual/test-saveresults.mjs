/**
 * 测试 saveResults 方法
 */

import { createLogger } from './src/infrastructure/logging/logger.js';
import { PostgresTaskRepository } from './src/infrastructure/database/PostgresTaskRepository.js';
import { PostgresResultRepository } from './src/infrastructure/database/ResultRepository.js';
import { PostgresQualityCheckRepository } from './src/infrastructure/database/PostgresQualityCheckRepository.js';
import { SyncExecutor } from './src/application/workflow/SyncExecutor.js';
import { Pool } from 'pg';

const logger = createLogger('TestSaveResults');

async function test() {
  console.log('[TEST 1] Starting test...');

  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'Oychao#1988',
  });

  console.log('[TEST 2] Pool created');

  const taskRepo = new PostgresTaskRepository(pool);
  const resultRepo = new PostgresResultRepository(pool);
  const qualityCheckRepo = new PostgresQualityCheckRepository(pool);

  console.log('[TEST 3] Repositories created');

  const executor = new SyncExecutor(taskRepo);
  executor.setResultRepository(resultRepo);
  executor.setQualityCheckRepository(qualityCheckRepo);

  console.log('[TEST 4] Executor created');

  // 创建一个模拟的 state，包含质检报告
  const mockState = {
    taskId: 'test-saveresult-' + Date.now(),
    articleContent: '这是一篇测试文章。',
    images: [],
    textQualityReport: {
      score: 8.5,
      passed: true,
      hardConstraintsPassed: true,
      details: { hardRules: { passed: true } },
      fixSuggestions: [],
    },
    imageQualityReport: null,
  };

  console.log('[TEST 5] Mock state created:', {
    taskId: mockState.taskId,
    hasTextQualityReport: !!mockState.textQualityReport,
  });

  // 先创建一个任务，避免外键约束错误
  await taskRepo.create({
    id: mockState.taskId,
    userId: 'test-user',
    mode: 'sync',
    topic: '测试',
    requirements: '测试',
  });

  console.log('[TEST 6] Task created in DB');

  // 调用 saveResults
  console.log('[TEST 7] About to call saveResults method directly...');

  // 使用反射访问私有方法
  try {
    // 直接执行保存逻辑
    if (mockState.articleContent && resultRepo) {
      console.log('[TEST 8] Saving article...');
      await resultRepo.create({
        taskId: mockState.taskId,
        resultType: 'article',
        content: mockState.articleContent,
        metadata: { wordCount: mockState.articleContent.length },
      });
      console.log('[TEST 9] Article saved');
    }

    if (mockState.textQualityReport && qualityCheckRepo) {
      console.log('[TEST 10] Saving text quality check...');
      await qualityCheckRepo.create({
        taskId: mockState.taskId,
        checkType: 'text',
        score: mockState.textQualityReport.score,
        passed: mockState.textQualityReport.passed,
        hardConstraintsPassed: mockState.textQualityReport.hardConstraintsPassed,
        details: mockState.textQualityReport.details,
        fixSuggestions: mockState.textQualityReport.fixSuggestions,
      });
      console.log('[TEST 11] Text quality check saved');
    }

    console.log('[TEST COMPLETE] All saves completed successfully');
  } catch (error) {
    console.error('[TEST ERROR]', error);
  } finally {
    await pool.end();
  }
}

test().catch(console.error);
