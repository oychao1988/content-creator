/**
 * Test script for scaffolding module
 * 验证脚手架模块的基本功能
 */

import { AINeuralUnderstandingEngine } from '../src/presentation/cli/scaffolding/ai/AINeuralUnderstandingEngine.js';
import { validateWorkflowRequirement } from '../src/presentation/cli/scaffolding/schemas/WorkflowRequirementSchema.js';
import type { WorkflowRequirement } from '../src/presentation/cli/scaffolding/schemas/WorkflowRequirementSchema.js';

console.log('=== Testing Scaffolding Module ===\n');

// Test 1: Schema Validation
console.log('Test 1: Schema Validation');
const validRequirement: WorkflowRequirement = {
  type: 'test-workflow',
  name: 'Test Workflow',
  description: 'A test workflow for validation',
  category: 'content',
  tags: ['test', 'validation'],
  inputParams: [
    {
      name: 'inputText',
      type: 'string',
      required: true,
      description: 'Input text parameter',
    },
  ],
  outputFields: ['result'],
  nodes: [
    {
      name: 'processNode',
      displayName: 'Process Node',
      description: 'Processes input',
      nodeType: 'transform',
      timeout: 30000,
      useLLM: false,
      enableQualityCheck: false,
      dependencies: [],
    },
  ],
  connections: [
    { from: 'START', to: 'processNode' },
    { from: 'processNode', to: 'END' },
  ],
  enableQualityCheck: false,
  maxRetries: 2,
  enableCheckpoint: true,
};

const validationResult = validateWorkflowRequirement(validRequirement);
console.log('✓ Schema validation:', validationResult.success ? 'PASSED' : 'FAILED');
if (!validationResult.success) {
  console.log('  Errors:', validationResult.errors);
}
console.log();

// Test 2: AI Engine Initialization
console.log('Test 2: AI Engine Initialization');
try {
  const engine = new AINeuralUnderstandingEngine();
  console.log('✓ AI Engine initialized successfully');
} catch (error) {
  console.log('✗ AI Engine initialization failed:', error);
}
console.log();

// Test 3: Context Builder
console.log('Test 3: Context Builder');
import { buildProjectContext } from '../src/presentation/cli/scaffolding/utils/contextBuilder.js';

buildProjectContext()
  .then((context) => {
    console.log('✓ Context builder executed successfully');
    console.log(`  - Found ${context.existingWorkflows.length} existing workflows`);
    console.log(`  - Code patterns length: ${context.codePatterns.length} chars`);
    console.log(`  - Best practices length: ${context.bestPractices.length} chars`);
    console.log(`  - Common nodes length: ${context.commonNodes.length} chars`);
    console.log();
  })
  .catch((error) => {
    console.log('✗ Context builder failed:', error);
    console.log();
  });

console.log('=== All Tests Completed ===');
