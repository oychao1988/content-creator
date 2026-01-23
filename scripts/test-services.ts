#!/usr/bin/env tsx
/**
 * 服务层测试脚本
 */

import { llmService } from '../src/services/llm/LLMService.js';
import { searchService } from '../src/services/search/SearchService.js';
import { imageService } from '../src/services/image/ImageService.js';
import { qualityService } from '../src/services/quality/QualityService.js';

console.log('\n=== Testing Services ===\n');

async function testServices() {
  try {
    // 1. 测试 LLM 服务
    console.log('1. Testing LLM Service...');
    const llmResult = await llmService.generateText(
      '请用一句话介绍人工智能',
      '你是一个专业的技术顾问。'
    );
    console.log('   ✓ LLM Response:', llmResult);
    console.log();

    // 2. 测试 Search 服务
    console.log('2. Testing Search Service...');
    const searchResult = await searchService.searchWithAnswer('人工智能最新进展', 3);
    console.log('   ✓ Search Answer:', searchResult.answer?.substring(0, 100) + '...');
    console.log('   ✓ Search Results:', searchResult.results.length, 'items');
    console.log('   ✓ First result:', searchResult.results[0]?.title);
    console.log();

    // 3. 测试 Image 服务（仅 health check）
    console.log('3. Testing Image Service...');
    const imageHealth = await imageService.healthCheck();
    console.log('   ✓ Image Health Check:', imageHealth ? 'PASSED' : 'FAILED');
    console.log();

    // 4. 测试 Quality 服务
    console.log('4. Testing Quality Service...');

    // 4a. 测试文本检查
    console.log('   a) Text Quality Check...');
    const textCheck = await qualityService.checkText(
      '这是一段测试文本。它用于验证质量检查功能是否正常工作。',
      '检查文本质量和完整性'
    );
    console.log('   ✓ Passed:', textCheck.passed);
    console.log('   ✓ Score:', textCheck.score);
    console.log('   ✓ Reason:', textCheck.reason?.substring(0, 100) + '...');

    // 4b. 测试文本硬规则（过短的文本）
    console.log('   b) Text Hard Rule Check (too short)...');
    const shortTextCheck = await qualityService.checkText(
      '太短',
      '检查文本质量'
    );
    console.log('   ✓ Passed:', shortTextCheck.passed);
    console.log('   ✓ Reason:', shortTextCheck.reason);

    console.log();

    // 5. 测试 LLM Token 估算
    console.log('5. Testing LLM Token Estimation...');
    const testText = '这是一段测试文本，用于估算 Token 数量。This is a test text for token estimation.';
    const estimatedTokens = llmService.estimateTokens(testText);
    console.log('   ✓ Text length:', testText.length);
    console.log('   ✓ Estimated tokens:', estimatedTokens);
    console.log();

    console.log('=== All Service Tests Completed ===\n');

    // 总结
    console.log('Summary:');
    console.log('  ✓ LLM Service: Working');
    console.log('  ✓ Search Service: Working');
    console.log('  ✓ Image Service: Configured');
    console.log('  ✓ Quality Service: Working');
    console.log();
  } catch (error) {
    console.error('❌ Service test failed:', error);
    process.exit(1);
  }
}

testServices();
