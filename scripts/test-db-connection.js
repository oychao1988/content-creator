import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
});

async function test() {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL连接成功!');
    
    const result = await client.query('SELECT COUNT(*) FROM tasks');
    console.log(`📊 当前任务数: ${result.rows[0].count}`);
    
    // 测试插入一条记录
    await client.query(`
      INSERT INTO tasks (task_id, mode, topic, requirements, status)
      VALUES ('test-001', 'sync', '测试主题', '测试要求', 'pending')
    `);
    console.log('✅ 测试数据插入成功');
    
    // 删除测试数据
    await client.query("DELETE FROM tasks WHERE task_id = 'test-001'");
    console.log('✅ 测试数据清理成功');
    
    await client.release();
    await pool.end();
    
    console.log('\n🎉 数据库连接测试完全通过！');
  } catch (error) {
    console.error('❌ 错误:', error.message);
    await pool.end();
    process.exit(1);
  }
}

test();
