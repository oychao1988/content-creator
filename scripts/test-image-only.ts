/**
 * 简化版图片下载测试
 *
 * 直接测试图片生成和下载功能，跳过完整工作流
 */

import { imageService } from '../src/services/image/ImageService.js';
import { existsSync } from 'fs';
import { resolve } from 'path';

async function testImageDownloadOnly() {
  console.log('🧪 图片下载功能测试（简化版）\n');
  console.log('='.repeat(60));

  try {
    // 1. 生成图片提示词
    console.log('\n📋 步骤 1: 生成图片提示词...');
    const testPrompt = '一张展示未来AI科技的插图，包含机器人和数据可视化元素，现代科技风格';

    // 2. 生成图片
    console.log('\n📋 步骤 2: 调用 Doubao API 生成图片...');
    console.log(`   提示词: ${testPrompt}`);

    const generateResult = await imageService.generateImage({
      prompt: testPrompt,
      size: '1920x1920',
      watermark: false,
    });

    console.log(`✅ 图片生成成功`);
    console.log(`   图片 URL: ${generateResult.imageUrl.substring(0, 80)}...`);
    console.log(`   模型: ${generateResult.model}`);

    // 3. 下载图片
    console.log('\n📋 步骤 3: 下载图片到本地...');
    const taskId = `test-image-${Date.now()}`;
    const filename = imageService.generateImageFilename(taskId, 0, 'png');
    console.log(`   文件名: ${filename}`);

    const localPath = await imageService.downloadImage(generateResult.imageUrl, filename);
    console.log(`✅ 图片下载成功`);
    console.log(`   本地路径: ${localPath}`);

    // 4. 验证文件
    console.log('\n📋 步骤 4: 验证下载的文件...');
    const fullPath = resolve(localPath);
    let stats: any = null;

    if (existsSync(fullPath)) {
      const { promises: fs } = await import('fs');
      stats = await fs.stat(fullPath);

      console.log(`✅ 文件验证成功`);
      console.log(`   文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`   完整路径: ${fullPath}`);
    } else {
      console.log(`❌ 文件不存在: ${fullPath}`);
      return;
    }

    // 5. 测试结果
    console.log('\n' + '='.repeat(60));
    console.log('🎉 图片下载功能测试成功！');
    console.log('\n📊 测试结果:');
    console.log(`   ✅ 图片生成: 成功`);
    console.log(`   ✅ 图片下载: 成功`);
    console.log(`   ✅ 文件验证: 通过`);
    console.log(`   ✅ 文件大小: ${stats ? (stats.size / 1024).toFixed(2) + ' KB' : 'N/A'}`);

    console.log('\n📁 图片保存位置:');
    console.log(`   ${resolve('./data/images')}`);
    console.log(`\n   你可以使用以下命令查看图片:`);
    console.log(`   ls -lh ${resolve('./data/images')}`);
    console.log(`   open ${fullPath}`);

    console.log('\n✅ 所有测试通过！');
  } catch (error) {
    console.error('\n❌ 测试失败:');
    console.error(error);
    process.exit(1);
  }
}

// 运行测试
testImageDownloadOnly().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
