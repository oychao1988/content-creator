import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Oychao#1988',
});

const result = await pool.query(
  'SELECT task_id, check_type, score, passed, hard_constraints_passed FROM quality_checks ORDER BY checked_at DESC LIMIT 10'
);

console.log('\n最近的质检报告:');
console.table(result.rows);

const count = await pool.query('SELECT COUNT(*) FROM quality_checks');
console.log(`\n质检报告总数: ${count.rows[0].count}`);

await pool.end();
