#!/usr/bin/env node

/**
 * 检查 results 表的数据
 */

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

async function checkResults() {
  try {
    // 查看表结构
    console.log('\n📋 Results 表结构:');
    console.log('═'.repeat(120));
    const schema = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'results'
      ORDER BY ordinal_position
    `);

    schema.rows.forEach(col => {
      console.log(`${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    // 查看数据
    console.log('\n\n📊 Results 表数据:');
    console.log('═'.repeat(120));
    const result = await pool.query(`
      SELECT id, task_id, result_type, content, file_path,
             pg_typeof(metadata) as metadata_type,
             metadata
      FROM results
      ORDER BY created_at DESC
      LIMIT 5
    `);

    if (result.rows.length === 0) {
      console.log('⚠️  results 表中暂无数据');
    } else {
      result.rows.forEach((row, index) => {
        console.log(`\n${index + 1}. ID: ${row.id}`);
        console.log(`   Task ID: ${row.task_id}`);
        console.log(`   Result Type: ${row.result_type}`);
        console.log(`   Metadata Type: ${row.metadata_type}`);
        console.log(`   Metadata Value: ${JSON.stringify(row.metadata)}`);
        if (row.content) {
          console.log(`   Content: ${row.content.substring(0, 100)}...`);
        }
      });
    }

    console.log('\n' + '═'.repeat(120) + '\n');

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

checkResults();
