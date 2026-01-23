import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Oychao#1988',
});

const taskId = 'b5a7c814-4eca-4f10-8f5b-32be92c66fed'; // Repo Check 任务

// 检查任务状态
const task = await pool.query(
  'SELECT status, created_at, completed_at FROM tasks WHERE task_id = $1',
  [taskId]
);

console.log('\n任务状态:');
console.log('Status:', task.rows[0]?.status);
console.log('Created:', task.rows[0]?.created_at);
console.log('Completed:', task.rows[0]?.completed_at);

// 检查结果
const results = await pool.query(
  'SELECT result_type, LEFT(content, 50) as content_preview FROM results WHERE task_id = $1',
  [taskId]
);

console.log('\n保存的结果:');
console.log(`找到 ${results.rowCount} 条记录`);
results.rows.forEach(r => {
  console.log(`- ${r.result_type}: ${r.content_preview}...`);
});

// 检查质检报告
const qc = await pool.query(
  'SELECT check_type, score, passed FROM quality_checks WHERE task_id = $1',
  [taskId]
);

console.log('\n质检报告:');
console.log(`找到 ${qc.rowCount} 条记录`);
qc.rows.forEach(r => {
  console.log(`- ${r.check_type}: score=${r.score}, passed=${r.passed}`);
});

if (qc.rowCount === 0) {
  console.log('❌ 质检报告确实没有保存！');
}

await pool.end();
