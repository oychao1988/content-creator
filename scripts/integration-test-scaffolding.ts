/**
 * Integration Test for Scaffolding Module
 * 验证脚手架模块的完整功能
 */

import { AINeuralUnderstandingEngine } from '../src/presentation/cli/scaffolding/ai/AINeuralUnderstandingEngine.js';
import type { ILLMService } from '../src/services/llm/ILLMService.js';

// Create a mock LLM service for testing
const mockLLMService: ILLMService = {
  async chat(request) {
    // Simulate LLM response with a simple workflow
    return {
      content: `{
  "type": "test-summarizer",
  "name": "Text Summarizer",
  "description": "A workflow that summarizes long text using LLM",
  "category": "content",
  "tags": ["summarization", "nlp", "test"],
  "inputParams": [
    {
      "name": "longText",
      "type": "string",
      "required": true,
      "description": "The long text to summarize",
      "examples": ["This is a long text..."]
    },
    {
      "name": "summaryLength",
      "type": "string",
      "required": false,
      "description": "Target summary length",
      "defaultValue": "medium",
      "examples": ["short", "medium", "long"]
    }
  ],
  "outputFields": ["summaryText", "originalLength", "summaryLength", "qualityScore"],
  "nodes": [
    {
      "name": "summarize",
      "displayName": "Summarize",
      "description": "Generates summary using LLM",
      "nodeType": "llm",
      "timeout": 120000,
      "useLLM": true,
      "llmSystemPrompt": "You are a text summarization expert. Create concise and accurate summaries.",
      "enableQualityCheck": false,
      "dependencies": []
    },
    {
      "name": "checkQuality",
      "displayName": "Quality Check",
      "description": "Checks summary quality",
      "nodeType": "quality_check",
      "timeout": 60000,
      "useLLM": true,
      "llmSystemPrompt": "You are a quality assessment expert.",
      "enableQualityCheck": true,
      "qualityCheckPrompt": "Evaluate the summary for accuracy, completeness, and conciseness. Return a score from 0-10.",
      "dependencies": ["summarize"]
    }
  ],
  "connections": [
    { "from": "START", "to": "summarize" },
    { "from": "summarize", "to": "checkQuality", "condition": "summaryText exists" },
    { "from": "checkQuality", "to": "END", "condition": "qualityScore >= 7" },
    { "from": "checkQuality", "to": "summarize", "condition": "qualityScore < 7 && retryCount < 2" }
  ],
  "enableQualityCheck": true,
  "maxRetries": 2,
  "enableCheckpoint": true
}`,
      usage: {
        promptTokens: 2000,
        completionTokens: 500,
        totalTokens: 2500,
      },
      cost: 0.025,
    };
  },
  async healthCheck() {
    return true;
  },
  estimateTokens(text: string) {
    return Math.ceil(text.length / 4);
  },
  estimateCost(tokensIn: number, tokensOut: number) {
    return (tokensIn + tokensOut) * 0.00001;
  },
};

console.log('=== Integration Test: Scaffolding Module ===\n');

async function runTests() {
  // Test 1: Understanding Requirement
  console.log('Test 1: Understanding Natural Language Requirement');
  console.log('Input: "Create a text summarization workflow"');
  console.log();

  const engine = new AINeuralUnderstandingEngine(mockLLMService);

  const result = await engine.understandRequirement(
    'Create a text summarization workflow that can summarize long text and check the quality',
    { autoBuild: false } // Use autoBuild: false for faster testing
  );

  console.log('Result:');
  console.log(`  ✓ Success: ${result.success}`);
  console.log(`  ✓ Validation Passed: ${result.validation.success}`);

  if (result.success && result.requirement) {
    console.log(`  ✓ Workflow Type: ${result.requirement.type}`);
    console.log(`  ✓ Workflow Name: ${result.requirement.name}`);
    console.log(`  ✓ Category: ${result.requirement.category}`);
    console.log(`  ✓ Input Params: ${result.requirement.inputParams.length}`);
    console.log(`  ✓ Output Fields: ${result.requirement.outputFields.length}`);
    console.log(`  ✓ Nodes: ${result.requirement.nodes.length}`);
    console.log(`  ✓ Connections: ${result.requirement.connections.length}`);
    console.log(`  ✓ Token Usage: ${result.tokenUsage?.totalTokens || 'N/A'}`);
  }

  if (!result.validation.success) {
    console.log(`  ✗ Validation Errors:`, result.validation.errors);
  }

  if (result.validation.warnings.length > 0) {
    console.log(`  ⚠ Warnings:`, result.validation.warnings);
  }

  console.log();

  // Test 2: Validation
  console.log('Test 2: Requirement Validation');
  if (result.requirement) {
    const validation = engine.validateRequirement(result.requirement);
    console.log(`  ✓ Validation Result: ${validation.success ? 'PASSED' : 'FAILED'}`);
    if (validation.errors.length > 0) {
      console.log(`  ✗ Errors:`, validation.errors);
    }
    if (validation.warnings.length > 0) {
      console.log(`  ⚠ Warnings:`, validation.warnings);
    }
  }
  console.log();

  // Test 3: Optimization
  console.log('Test 3: Requirement Optimization');
  if (result.requirement) {
    const optimization = await engine.optimizeRequirement(result.requirement);
    console.log(`  ✓ Optimizations Applied: ${optimization.optimizations.length}`);
    optimization.optimizations.forEach((opt, idx) => {
      console.log(`    ${idx + 1}. ${opt}`);
    });
    console.log(`  ✓ Nodes Optimized: ${optimization.requirement.nodes.length}`);
  }
  console.log();

  console.log('=== All Integration Tests Completed ===');
}

runTests().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
