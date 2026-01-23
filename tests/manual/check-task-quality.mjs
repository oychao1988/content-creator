import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Oychao#1988',
});

const taskId = '62d981ac-5c55-461a-b29b-e634f0eb3e53';

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
  console.log('❌ 没有找到质检报告！');
}

// 检查这个任务的结果
const results = await pool.query(
  'SELECT result_type, content FROM results WHERE task_id = $1',
  [taskId]
);

console.log(`\n任务 ${taskId} 的结果:`);
console.log(`找到 ${results.rowCount} 条记录`);
if (results.rowCount > 0) {
  results.rows.forEach(r => {
    console.log(`- ${r.result_type}: ${r.content?.substring(0, 50)}...`);
  });
} else {
  console.log('❌ 没有找到结果！');
}

await pool.end();
