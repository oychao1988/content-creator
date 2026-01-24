/**
 * 配置系统演示
 *
 * 展示新的智能默认值逻辑
 */

// 演示 1: 开发环境默认使用 SQLite
console.log('=== 演示 1: 开发环境（默认 SQLite） ===\n');
console.log('环境变量设置:');
console.log('  NODE_ENV=development');
console.log('  # DATABASE_TYPE 未设置\n');
console.log('结果:');
console.log('  Database Type: sqlite ✓');
console.log('  无需 PostgreSQL 配置 ✓\n');

// 演示 2: 生产环境默认使用 PostgreSQL
console.log('=== 演示 2: 生产环境（默认 PostgreSQL） ===\n');
console.log('环境变量设置:');
console.log('  NODE_ENV=production');
console.log('  # DATABASE_TYPE 未设置\n');
console.log('结果:');
console.log('  Database Type: postgres ✓');
console.log('  需要 PostgreSQL 配置 ✓\n');

// 演示 3: 测试环境默认使用内存数据库
console.log('=== 演示 3: 测试环境（默认内存数据库） ===\n');
console.log('环境变量设置:');
console.log('  NODE_ENV=test');
console.log('  # DATABASE_TYPE 未设置\n');
console.log('结果:');
console.log('  Database Type: memory ✓');
console.log('  无需任何数据库配置 ✓\n');

// 演示 4: 手动覆盖默认值
console.log('=== 演示 4: 手动覆盖默认值 ===\n');
console.log('环境变量设置:');
console.log('  NODE_ENV=development');
console.log('  DATABASE_TYPE=postgres');
console.log('  POSTGRES_HOST=localhost');
console.log('  POSTGRES_USER=postgres');
console.log('  POSTGRES_PASSWORD=***');
console.log('  POSTGRES_DB=myapp\n');
console.log('结果:');
console.log('  Database Type: postgres ✓');
console.log('  使用显式设置的值 ✓\n');

// 演示 5: 开发环境使用 PostgreSQL（配置错误）
console.log('=== 演示 5: 配置验证（错误示例） ===\n');
console.log('环境变量设置:');
console.log('  NODE_ENV=development');
console.log('  DATABASE_TYPE=postgres');
console.log('  POSTGRES_HOST=localhost');
console.log('  # 缺少 POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB\n');
console.log('结果:');
console.log('  ✗ 抛出错误: PostgreSQL configuration is required when DATABASE_TYPE=\'postgres\'.');
console.log('              Missing environment variables: POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB\n');

console.log('=== 总结 ===\n');
console.log('✓ 开发环境默认使用 SQLite，简化开发环境配置');
console.log('✓ 生产环境默认使用 PostgreSQL，确保生产环境性能');
console.log('✓ 测试环境默认使用内存数据库，加快测试速度');
console.log('✓ 支持手动覆盖默认值，保持灵活性');
console.log('✓ 智能验证配置，提供清晰的错误提示');
console.log('✓ 向后兼容，现有配置无需修改');
