#!/usr/bin/env node

/**
 * 列出所有任务
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

async function listTasks() {
  try {
    const result = await pool.query(`
      SELECT
        task_id,
        status,
        topic,
        current_step,
        created_at,
        completed_at
      FROM tasks
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('\n📋 任务列表:');
    console.log('═'.repeat(120));

    if (result.rows.length === 0) {
      console.log('⚠️  数据库中暂无任务记录');
    } else {
      result.rows.forEach((task, index) => {
        console.log(`\n${index + 1}. 任务ID: ${task.task_id}`);
        console.log(`   状态: ${task.status}`);
        console.log(`   主题: ${task.topic}`);
        console.log(`   当前步骤: ${task.current_step || '无'}`);
        console.log(`   创建时间: ${task.created_at}`);
        if (task.completed_at) {
          console.log(`   完成时间: ${task.completed_at}`);
        }
      });
    }

    console.log('\n' + '═'.repeat(120) + '\n');

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
  } finally {
    await pool.end();
  }
}

listTasks();
