import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Oychao#1988',
});

// 检查最近的任务
const tasks = await pool.query(
  'SELECT task_id, mode, topic, status, created_at FROM tasks WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 5'
);

console.log('\n最近的任务:');
console.table(tasks.rows);

// 检查特定任务
const testTask = await pool.query(
  "SELECT task_id, mode, topic, status FROM tasks WHERE task_id LIKE 'test-saveresult%'"
);

console.log('\n测试任务:');
console.table(testTask.rows);

await pool.end();
