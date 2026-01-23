import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Oychao#1988',
});

const taskId = '2034deff-39ba-4ae6-a3bc-3ce7eb7891a3';

// 检查这个任务的质检报告
const qc = await pool.query(
  'SELECT * FROM quality_checks WHERE task_id = $1',
  [taskId]
);

console.log(`\n任务 ${taskId} 的质检报告:`);
console.log(`找到 ${qc.rowCount} 条记录`);
if (qc.rowCount > 0) {
  console.table(qc.rows);
} else {
  console.log('❌ 质检报告仍然没有保存！');
}

// 检查这个任务的结果
const results = await pool.query(
  'SELECT result_type FROM results WHERE task_id = $1'
);

console.log(`\n结果: ${results.rowCount} 条`);
results.rows.forEach(r => console.log(`- ${r.result_type}`));

await pool.end();
