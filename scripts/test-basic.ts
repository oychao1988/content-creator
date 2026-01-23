/**
 * 基本功能测试
 * 测试配置、日志和基本导入
 */

import { config } from '../src/config/index.js';
import { createLogger } from '../src/infrastructure/logging/logger.js';

async function testBasicFunctionality() {
  console.log('=== 基本功能测试 ===\n');

  // 1. 测试配置系统
  console.log('1. 测试配置系统...');
  console.log('   Environment:', config.nodeEnv);
  console.log('   Worker ID:', config.worker.workerId);
  console.log('   PostgreSQL:', `${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`);
  console.log('   Redis:', config.redis.url.replace(/:.+@/, ':****@'));
  console.log('   LLM:', `${config.llm.modelName} @ ${config.llm.baseURL}`);
  console.log('   ✅ 配置系统正常\n');

  // 2. 测试日志系统
  console.log('2. 测试日志系统...');
  const logger = createLogger('Test');
  logger.info('这是一条测试日志');
  logger.debug('调试信息', { test: 'data' });
  logger.warn('警告信息');
  console.log('   ✅ 日志系统正常\n');

  // 3. 测试领域实体导入
  console.log('3. 测试领域实体导入...');
  const { TaskStatus, TaskType, ExecutionMode } = await import('../src/domain/entities/index.js');
  console.log('   TaskStatus:', Object.values(TaskStatus));
  console.log('   TaskType:', Object.values(TaskType));
  console.log('   ExecutionMode:', Object.values(ExecutionMode));
  console.log('   ✅ 领域实体导入正常\n');

  // 4. 测试 State 定义
  console.log('4. 测试 State 定义...');
  const { createInitialState } = await import('../src/domain/workflow/State.js');
  const state = createInitialState({
    taskId: 'test-123',
    mode: ExecutionMode.SYNC,
    topic: '测试主题',
    requirements: '测试要求',
    hardConstraints: {
      minWords: 100,
      maxWords: 500,
    },
  });
  console.log('   State created:');
  console.log('   - taskId:', state.taskId);
  console.log('   - mode:', state.mode);
  console.log('   - topic:', state.topic);
  console.log('   ✅ State 定义正常\n');

  console.log('=== ✅ 所有基本测试通过 ===\n');
}

testBasicFunctionality().catch((error) => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
