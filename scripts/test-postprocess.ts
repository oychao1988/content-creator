/**
 * 测试 PostProcessNode 的图片占位符替换功能
 */

import { createLogger } from '../src/infrastructure/logging/logger.js';

const logger = createLogger('PostProcessTest');

async function testPostProcess() {
  console.log('=== 测试 PostProcessNode ===\n');

  // 模拟 WriteNode 输出
  const articleContent = `# 人工智能在医疗领域的应用

## 引言

![引言插图](image-placeholder-1)

人工智能在医疗领域展现出巨大潜力...

## 发展历程

![发展历程图](image-placeholder-2)

回顾人工智能在医疗领域的发展历程...

## 未来展望

![未来展望图](image-placeholder-3)

未来的人工智能医疗将带来更多创新...`;

  // 模拟 GenerateImageNode 输出（假设图片已下载）
  const images = [
    {
      url: 'https://api.example.com/image1.png',
      localPath: '/storage/images/task-123-1.png',
      prompt: 'Professional illustration showing AI in healthcare',
      width: 1024,
      height: 1024,
      format: 'png',
    },
    {
      url: 'https://api.example.com/image2.png',
      localPath: '/storage/images/task-123-2.png',
      prompt: 'Timeline infographic showing development history',
      width: 1024,
      height: 1024,
      format: 'png',
    },
    {
      url: 'https://api.example.com/image3.png',
      localPath: '/storage/images/task-123-3.png',
      prompt: 'Futuristic AI healthcare concept',
      width: 1024,
      height: 1024,
      format: 'png',
    },
  ];

  console.log('输入数据：');
  console.log('- 文章内容（前 200 字符）：', articleContent.substring(0, 200) + '...');
  console.log('- 图片数量：', images.length);
  console.log('- 有本地路径的图片：', images.filter(img => img.localPath).length);
  console.log();

  // 动态导入 PostProcessNode
  const { PostProcessNode } = await import('../src/domain/workflow/nodes/PostProcessNode.js');
  const postProcessNode = new PostProcessNode({ preferLocalPath: true });

  // 模拟状态
  const mockState = {
    taskId: 'test-postprocess-123',
    articleContent,
    images,
  } as any;

  // 执行后处理
  const result = await postProcessNode.execute(mockState);

  console.log('\n处理结果：');
  console.log('- 成功：', result.success);
  console.log('- 状态更新字段：', Object.keys(result.stateUpdate));
  console.log('- finalArticleContent 存在：', !!result.stateUpdate.finalArticleContent);
  console.log();

  if (result.stateUpdate.finalArticleContent) {
    const finalContent = result.stateUpdate.finalArticleContent;

    // 检查占位符是否被替换
    const hasPlaceholders = finalContent.includes('image-placeholder-');
    const hasLocalPaths = finalContent.includes('/storage/images/');
    const hasRemoteUrls = finalContent.includes('https://api.example.com/');

    console.log('内容分析：');
    console.log('- 仍包含占位符：', hasPlaceholders);
    console.log('- 包含本地路径：', hasLocalPaths);
    console.log('- 包含远程 URL：', hasRemoteUrls);
    console.log();

    // 显示处理后的文章片段
    console.log('处理后的文章（前 500 字符）：');
    console.log(finalContent.substring(0, 500) + '...\n');

    // 检查每张图片的替换情况
    console.log('图片替换详情：');
    for (let i = 1; i <= 3; i++) {
      const placeholder = `image-placeholder-${i}`;
      const hasPlaceholder = articleContent.includes(placeholder);
      const hasReplacement = finalContent.includes(placeholder);

      if (hasPlaceholder && !hasReplacement) {
        console.log(`✅ 占位符 ${placeholder} 已被替换`);
      } else if (hasPlaceholder && hasReplacement) {
        console.log(`❌ 占位符 ${placeholder} 未被替换`);
      } else {
        console.log(`⚠️  占位符 ${placeholder} 不存在`);
      }
    }
  }
}

testPostProcess().catch(error => {
  console.error('测试失败：', error);
  process.exit(1);
});
