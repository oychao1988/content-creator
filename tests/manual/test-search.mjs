#!/usr/bin/env node
import { config } from 'dotenv';
config();

import { searchService } from './src/services/search/SearchService.js';

console.log('🔍 测试 Tavily 搜索功能...\n');
console.log('API Key:', process.env.TAVILY_API_KEY?.substring(0, 20) + '...\n');

searchService.searchWithAnswer('AI 技术发展趋势', 3)
  .then(result => {
    console.log('✅ 搜索成功！\n');
    console.log('答案:', result.answer?.substring(0, 200) + '...\n');
    console.log('结果数量:', result.results.length);
    console.log('\n搜索结果:');
    result.results.forEach((r, i) => {
      console.log(`\n${i + 1}. ${r.title}`);
      console.log(`   ${r.url}`);
    });
  })
  .catch(error => {
    console.error('❌ 搜索失败:', error.message);
    process.exit(1);
  });
