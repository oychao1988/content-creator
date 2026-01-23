/**
 * 数据库迁移运行脚本
 *
 * 用法:
 *   pnpm run migrate        # 运行所有迁移
 *   pnpm run migrate:undo   # 回滚最后一个迁移
 *   pnpm run migrate:status # 查看迁移状态
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// 加载环境变量
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');

// 数据库连接配置
let password = process.env.POSTGRES_PASSWORD || '';
// 去除密码中的引号（如果有）
password = password.replace(/^['"]|['"]$/g, '');

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres',
  password,
});

/**
 * 执行 SQL 文件
 */
async function executeSqlFile(sqlPath: string): Promise<void> {
  const sql = readFileSync(sqlPath, 'utf-8');

  console.log(`📄 执行 SQL 文件: ${sqlPath}`);

  try {
    await pool.query(sql);
    console.log('✅ SQL 执行成功');
  } catch (error) {
    console.error('❌ SQL 执行失败:', error);
    throw error;
  }
}

/**
 * 运行迁移
 */
async function runMigration(): Promise<void> {
  console.log('🚀 开始运行数据库迁移...\n');

  try {
    const migrationPath = join(__dirname, '../migrations/001_create_initial_tables.sql');
    await executeSqlFile(migrationPath);

    console.log('\n✨ 迁移完成!');
  } catch (error) {
    console.error('\n❌ 迁移失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * 回滚迁移
 */
async function rollbackMigration(): Promise<void> {
  console.log('🔄 开始回滚数据库迁移...\n');

  try {
    const rollbackPath = join(__dirname, '../migrations/001_rollback.sql');
    await executeSqlFile(rollbackPath);

    console.log('\n✨ 回滚完成!');
  } catch (error) {
    console.error('\n❌ 回滚失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * 查看迁移状态
 */
async function checkMigrationStatus(): Promise<void> {
  console.log('📊 查询迁移状态...\n');

  try {
    const result = await pool.query(`
      SELECT version, description, executed_at
      FROM schema_migrations
      ORDER BY executed_at DESC
    `);

    if (result.rows.length === 0) {
      console.log('ℹ️  尚未运行任何迁移');
    } else {
      console.table(result.rows);
    }

    console.log('\n当前数据库表:');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(tables.rows.map((r: any) => `  - ${r.table_name}`).join('\n'));
  } catch (error) {
    console.error('❌ 查询失败:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * 主函数
 */
async function main(): Promise<void> {
  const command = process.argv[2] || 'run';

  switch (command) {
    case 'run':
    case 'migrate':
      await runMigration();
      break;
    case 'undo':
    case 'rollback':
      await rollbackMigration();
      break;
    case 'status':
      await checkMigrationStatus();
      break;
    default:
      console.log(`
用法:
  pnpm run migrate        # 运行所有迁移
  pnpm run migrate:undo   # 回滚最后一个迁移
  pnpm run migrate:status # 查看迁移状态

  或直接使用:
  node scripts/run-migration.ts [run|undo|status]
      `);
      process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
