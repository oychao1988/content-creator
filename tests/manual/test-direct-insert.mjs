/**
 * 直接测试数据库插入
 */

import { Pool } from 'pg';

async function testDirectInsert() {
  console.log('🚀 直接测试数据库插入...\n');

  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'Oychao#1988',
  });

  try {
    const testTaskId = 'direct-test-' + Date.now();

    // 1. 直接插入任务
    console.log('📝 直接插入任务...');
    const insertResult = await pool.query(
      `INSERT INTO tasks (task_id, mode, topic, requirements, hard_constraints)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING task_id, status`,
      [testTaskId, 'sync', '直接测试', '直接测试要求', '{"minWords": 500}']
    );
    console.log(`   ✅ 任务插入成功: ${insertResult.rows[0].task_id}`);
    console.log(`   状态: ${insertResult.rows[0].status}\n`);

    // 2. 验证任务存在
    console.log('🔍 验证任务是否存在...');
    const checkResult = await pool.query(
      'SELECT * FROM tasks WHERE task_id = $1',
      [testTaskId]
    );
    console.log(`   找到任务: ${checkResult.rows.length > 0 ? '✅' : '❌'}`);
    if (checkResult.rows.length > 0) {
      console.log(`   任务状态: ${checkResult.rows[0].status}\n`);
    }

    // 3. 尝试插入结果
    console.log('📝 插入文章结果...');
    try {
      await pool.query(
        `INSERT INTO results (task_id, result_type, content, metadata)
         VALUES ($1, $2, $3, $4)`,
        [testTaskId, 'article', '测试内容', '{"wordCount": 10}']
      );
      console.log('   ✅ 结果插入成功\n');
    } catch (error) {
      console.log(`   ❌ 结果插入失败: ${error.message}\n`);
    }

    // 4. 尝试插入质量检查
    console.log('🔍 插入质量检查...');
    try {
      await pool.query(
        `INSERT INTO quality_checks (
           task_id, check_type, score, passed, hard_constraints_passed,
           details, fix_suggestions, rubric_version, model_name
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          testTaskId,
          'text',
          8.5,
          true,
          true,
          JSON.stringify({hardRules: {passed: true}, softScores: {relevance: 8}}),
          '{建议1,建议2}', // PostgreSQL 数组语法
          '1.0',
          'deepseek-chat'
        ]
      );
      console.log('   ✅ 质量检查插入成功\n');
    } catch (error) {
      console.log(`   ❌ 质量检查插入失败: ${error.message}\n`);
    }

    // 5. 最终验证
    console.log('🔍 最终验证...');
    const finalResults = await pool.query(
      'SELECT result_type FROM results WHERE task_id = $1',
      [testTaskId]
    );
    const finalQualityChecks = await pool.query(
      'SELECT check_type FROM quality_checks WHERE task_id = $1',
      [testTaskId]
    );
    console.log(`   结果数量: ${finalResults.rows.length} ✅`);
    console.log(`   质量检查数量: ${finalQualityChecks.rows.length} ✅`);

    console.log('\n🎉 直接插入测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
    console.log('\n🔌 数据库连接已关闭');
  }
}

testDirectInsert();
