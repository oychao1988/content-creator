/**
 * Doubao 图片生成 API 测试
 *
 * 测试火山引擎 Doubao 图片生成功能
 */

import { imageService, DOUBAO_IMAGE_MODELS } from '../src/services/image/ImageService.js';

async function testDoubaoImageGeneration() {
  console.log('\n========================================');
  console.log('    Doubao 图片生成 API 测试');
  console.log('========================================\n');

  try {
    // 1. 检查 API 配置
    console.log('1. 检查 API 配置...\n');

    const healthCheck = await imageService.healthCheck();
    if (!healthCheck) {
      console.error('   ❌ API 配置检查失败');
      console.log('   请确保 .env 文件中配置了 ARK_API_KEY\n');
      return false;
    }

    console.log('   ✅ API 配置检查通过');
    console.log('   默认模型:', imageService.getDefaultModel());
    console.log('');

    // 2. 显示支持的模型
    console.log('2. 支持的模型:\n');
    const models = imageService.getSupportedModels();
    Object.entries(models).forEach(([key, value]) => {
      const isDefault = value === imageService.getDefaultModel();
      console.log(`   ${isDefault ? '→' : ' '} ${key}: ${value}`);
    });
    console.log('');

    // 3. 生成图片
    console.log('3. 生成测试图片...\n');
    console.log('   提示词: "一只可爱的橘猫坐在窗台上，阳光透过窗户洒在它身上"');
    console.log('   尺寸: 1024x1024');
    console.log('   模型:', imageService.getDefaultModel());
    console.log('');

    const startTime = Date.now();

    const result = await imageService.generateImage({
      prompt: '一只可爱的橘猫坐在窗台上，阳光透过窗户洒在它身上，温暖的午后时光，写实风格，高细节',
      size: '1920x1920',  // Doubao 要求至少 3686400 像素
      watermark: false,
    });

    const duration = Date.now() - startTime;
    const durationSec = (duration / 1000).toFixed(2);

    console.log('');
    console.log('   ✅ 图片生成成功！');
    console.log('   耗时:', durationSec, '秒');
    console.log('   模型:', result.model);
    console.log('   图片 URL:', result.imageUrl);
    console.log('');

    // 4. 批量生成测试（可选）
    console.log('4. 批量生成测试（2 张图片）...\n');

    const batchStartTime = Date.now();

    const batchResults = await imageService.batchGenerateImages([
      {
        prompt: '一位医生在现代化诊室中，专注地看着电脑屏幕，屏幕上显示着医学影像数据',
        size: '1920x1920',  // Doubao 要求至少 3686400 像素
      },
      {
        prompt: '未来城市的俯瞰图，高楼大厦林立，飞行器在空中穿梭，科幻风格，3D渲染',
        size: '1920x1920',  // Doubao 要求至少 3686400 像素
      },
    ]);

    const batchDuration = Date.now() - batchStartTime;
    const batchDurationSec = (batchDuration / 1000).toFixed(2);

    console.log('   ✅ 批量生成完成！');
    console.log('   成功:', batchResults.length, '张');
    console.log('   耗时:', batchDurationSec, '秒');
    console.log('');

    batchResults.forEach((result, index) => {
      console.log(`   图片 ${index + 1}:`);
      console.log('     URL:', result.imageUrl.substring(0, 60) + '...');
      console.log('     模型:', result.model);
    });

    console.log('');
    console.log('========================================');
    console.log('   ✅ 所有测试通过！');
    console.log('========================================\n');

    return true;
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    console.error('');

    if (error instanceof Error) {
      console.error('错误详情:');
      console.error('  消息:', error.message);
      console.error('  堆栈:', error.stack);
    }

    console.log('');
    console.log('常见问题排查:');
    console.log('1. 检查 .env 文件中是否配置了 ARK_API_KEY');
    console.log('2. 确认 API key 是否有效');
    console.log('3. 检查网络连接是否正常');
    console.log('4. 确认账户是否有足够配额');
    console.log('');

    return false;
  }
}

async function main() {
  const success = await testDoubaoImageGeneration();

  if (!success) {
    process.exit(1);
  }
}

main();
