/**
 * 测试 state 传递
 */

import { v4 as uuidv4 } from 'uuid';
import { createSimpleContentCreatorGraph } from './src/domain/workflow/ContentCreatorGraph.js';
import { createInitialState } from './src/domain/workflow/State.js';

async function testState() {
  console.log('🚀 测试 state 传递...\n');

  const taskId = uuidv4();
  const initialState = createInitialState({
    taskId,
    topic: '测试',
    requirements: '测试要求',
    targetAudience: '普通读者',
    keywords: ['测试'],
    tone: '专业',
    hardConstraints: {
      minWords: 50,
      maxWords: 100,
    },
    mode: 'sync',
  });

  console.log('Initial state keys:', Object.keys(initialState));
  console.log('Initial textQualityReport:', initialState.textQualityReport);
  console.log('\n开始执行工作流...\n');

  const graph = createSimpleContentCreatorGraph();

  // 只执行到 checkText 节点
  const state1 = await graph.invoke(initialState);
  console.log('\nAfter checkText state keys:', Object.keys(state1));
  console.log('After checkText textQualityReport:', state1.textQualityReport);

  // 检查所有键
  console.log('\n所有 state 键:');
  for (const key of Object.keys(state1)) {
    console.log(`  - ${key}: ${typeof state1[key]} (${state1[key] !== undefined ? '有值' : 'undefined'})`);
  }
}

testState().catch(console.error);
