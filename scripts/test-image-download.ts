/**
 * 图片下载功能测试脚本
 *
 * 测试完整的图片生成和下载流程
 */

import { createSimpleContentCreatorGraph } from '../src/domain/workflow/ContentCreatorGraph.js';
import { createInitialState } from '../src/domain/workflow/State.js';
import { ExecutionMode } from '../src/domain/entities/Task.js';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { resolve } from 'path';

/**
 * 测试配置
 */
const TEST_CONFIG = {
  topic: '人工智能的未来发展',
  requirements: '写一篇 500 字的短文，探讨 AI 技术的发展趋势',
  targetAudience: '技术爱好者',
  tone: '专业',
  hardConstraints: {
    minWords: 400,
    maxWords: 600,
  },
};

/**
 * 主测试函数
 */
async function testImageDownload() {
  console.log('🧪 图片下载功能测试\n');
  console.log('='.repeat(60));

  try {
    // 1. 创建工作流图
    console.log('\n📋 步骤 1: 创建工作流图...');
    const graph = createSimpleContentCreatorGraph();
    console.log('✅ 工作流图创建成功');

    // 2. 创建初始状态
    console.log('\n📋 步骤 2: 创建工作流状态...');
    const taskId = `test-image-${Date.now()}`;
    const initialState = createInitialState({
      taskId,
      mode: ExecutionMode.SYNC,
      topic: TEST_CONFIG.topic,
      requirements: TEST_CONFIG.requirements,
      targetAudience: TEST_CONFIG.targetAudience,
      tone: TEST_CONFIG.tone,
      hardConstraints: TEST_CONFIG.hardConstraints,
    });
    console.log(`✅ 工作流状态创建成功 (taskId: ${taskId})`);

    // 3. 执行工作流
    console.log('\n📋 步骤 3: 执行工作流（这可能需要几分钟）...');
    console.log('   ⏳ 正在生成内容...');
    const result = await graph.invoke(initialState);

    // 4. 检查执行结果
    console.log('\n📋 步骤 4: 检查执行结果...');

    if (result.error) {
      console.error('❌ 工作流执行失败:', result.error);
      return;
    }

    console.log('✅ 工作流执行成功');
    console.log(`   当前步骤: ${result.currentStep}`);
    console.log(`   文章长度: ${result.articleContent?.length || 0} 字符`);

    // 5. 检查图片生成
    console.log('\n📋 步骤 5: 检查图片生成结果...');

    if (!result.images || result.images.length === 0) {
      console.warn('⚠️  没有生成图片');
      return;
    }

    console.log(`✅ 成功生成 ${result.images.length} 张图片`);

    // 6. 验证图片下载
    console.log('\n📋 步骤 6: 验证图片下载...');

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < result.images.length; i++) {
      const image = result.images[i];
      console.log(`\n   📸 图片 ${i + 1}/${result.images.length}:`);
      console.log(`      云端 URL: ${image.url.substring(0, 60)}...`);

      if (image.localPath) {
        const fullPath = resolve(image.localPath);

        // 检查文件是否存在
        if (existsSync(fullPath)) {
          const stats = await fs.stat(fullPath);
          console.log(`      ✅ 本地路径: ${image.localPath}`);
          console.log(`      📦 文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
          successCount++;
        } else {
          console.log(`      ❌ 本地文件不存在: ${image.localPath}`);
          failCount++;
        }
      } else {
        console.log(`      ⚠️  没有本地路径（下载可能失败）`);
        failCount++;
      }
    }

    // 7. 测试结果汇总
    console.log('\n' + '='.repeat(60));
    console.log('📊 测试结果汇总:');
    console.log(`   总图片数: ${result.images.length}`);
    console.log(`   下载成功: ${successCount} ✅`);
    console.log(`   下载失败: ${failCount} ❌`);
    console.log(`   成功率: ${((successCount / result.images.length) * 100).toFixed(1)}%`);

    if (successCount === result.images.length) {
      console.log('\n🎉 所有图片下载成功！');
    } else if (successCount > 0) {
      console.log('\n⚠️  部分图片下载成功');
    } else {
      console.log('\n❌ 所有图片下载失败');
    }

    // 8. 显示图片保存位置
    console.log('\n📁 图片保存位置:');
    const storagePath = resolve('./data/images');
    console.log(`   ${storagePath}`);
    console.log(`\n   你可以使用以下命令查看图片:`);
    console.log(`   ls -lh ${storagePath}`);

    // 9. 显示文章内容（截取前 200 字）
    if (result.articleContent) {
      console.log('\n📝 生成的内容（预览）:');
      console.log('─'.repeat(60));
      console.log(result.articleContent.substring(0, 200) + '...');
      console.log('─'.repeat(60));
    }

    console.log('\n✅ 测试完成！');
  } catch (error) {
    console.error('\n❌ 测试过程中发生错误:');
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
testImageDownload().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
