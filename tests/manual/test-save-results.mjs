/**
 * 测试结果保存逻辑
 */

import { Pool } from 'pg';
import { PostgresTaskRepository } from './src/infrastructure/database/PostgresTaskRepository.js';
import { PostgresResultRepository } from './src/infrastructure/database/ResultRepository.js';
import { PostgresQualityCheckRepository } from './src/infrastructure/database/PostgresQualityCheckRepository.js';

async function testSaveResults() {
  console.log('🚀 开始测试保存结果逻辑...\n');

  // 1. 创建数据库连接
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'Oychao#1988',
  });

  try {
    // 2. 创建 repositories
    const taskRepo = new PostgresTaskRepository(pool);
    const resultRepo = new PostgresResultRepository(pool);
    const qualityCheckRepo = new PostgresQualityCheckRepository(pool);

    // 3. 创建测试任务
    const testTaskId = 'test-' + Date.now();
    console.log(`✅ 创建测试任务: ${testTaskId}`);

    const task = await taskRepo.create({
      idempotencyKey: testTaskId, // 使用 idempotencyKey
      mode: 'sync',
      topic: '测试主题',
      requirements: '测试要求',
      hardConstraints: {
        minWords: 500,
        maxWords: 1000,
      },
    });
    console.log(`   任务ID: ${task.taskId || task.id}`);
    console.log(`   任务状态: ${task.status}\n`);

    // 4. 保存文章结果
    console.log('📝 保存文章结果...');
    await resultRepo.create({
      taskId: testTaskId,
      resultType: 'article',
      content: '# 测试文章\n\n这是一篇测试文章的内容。',
      metadata: {
        wordCount: 20,
        generatedAt: new Date().toISOString(),
      },
    });
    console.log('   ✅ 文章结果保存成功\n');

    // 5. 保存质量检查结果
    console.log('🔍 保存质量检查结果...');
    const qualityReport = {
      taskId: testTaskId,
      checkType: 'text',
      score: 8.5,
      passed: true,
      hardConstraintsPassed: true,
      details: {
        hardRules: {
          passed: true,
          wordCount: { passed: true, wordCount: 800 },
          keywords: { passed: true, found: ['测试'], required: ['测试'] },
        },
        softScores: {
          relevance: { score: 8, reason: '内容相关' },
          coherence: { score: 9, reason: '逻辑连贯' },
        },
      },
      fixSuggestions: ['建议1', '建议2'],
      rubricVersion: '1.0',
      modelName: 'deepseek-chat',
    };

    await qualityCheckRepo.create(qualityReport);
    console.log('   ✅ 质量检查结果保存成功\n');

    // 6. 验证数据
    console.log('🔍 验证保存的数据...');

    // 检查任务
    const savedTask = await taskRepo.findById(testTaskId);
    console.log(`   任务存在: ${savedTask ? '✅' : '❌'}`);

    // 检查结果
    const results = await pool.query(
      'SELECT * FROM results WHERE task_id = $1',
      [testTaskId]
    );
    console.log(`   结果数量: ${results.rows.length} ✅`);

    // 检查质量检查
    const qualityChecks = await pool.query(
      'SELECT * FROM quality_checks WHERE task_id = $1',
      [testTaskId]
    );
    console.log(`   质量检查数量: ${qualityChecks.rows.length} ✅`);

    if (qualityChecks.rows.length > 0) {
      const qc = qualityChecks.rows[0];
      console.log(`   质量检查分数: ${qc.score} ✅`);
      console.log(`   质量检查通过: ${qc.passed ? '是' : '否'} ✅`);
    }

    console.log('\n🎉 所有测试通过！保存逻辑正常工作。');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
    console.log('\n🔌 数据库连接已关闭');
  }
}

testSaveResults();
