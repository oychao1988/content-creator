/**
 * 图片下载功能测试
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { imageService } from '../ImageService.js';

describe('ImageService - 图片下载功能', () => {
  it('应该能够生成唯一的文件名', () => {
    const taskId = 'task-123';
    const filename1 = imageService.generateImageFilename(taskId, 0, 'png');
    const filename2 = imageService.generateImageFilename(taskId, 1, 'png');

    expect(filename1).toMatch(/^task-123_0_\d+\.png$/);
    expect(filename2).toMatch(/^task-123_1_\d+\.png$/);
    expect(filename1).not.toBe(filename2);
  });

  it('应该支持不同的图片格式', () => {
    const taskId = 'task-456';
    const pngFilename = imageService.generateImageFilename(taskId, 0, 'png');
    const jpgFilename = imageService.generateImageFilename(taskId, 1, 'jpg');

    expect(pngFilename).endsWith('.png');
    expect(jpgFilename).endsWith('.jpg');
  });

  // TODO: 添加实际下载测试（需要 mock axios 和 fs）
  // it('应该能够下载图片到本地', async () => {
  //   const mockUrl = 'https://example.com/test.png';
  //   const filename = 'test-download.png';
  //
  //   const localPath = await imageService.downloadImage(mockUrl, filename);
  //
  //   expect(localPath).toBeDefined();
  //   expect(localPath).toContain(filename);
  // });
});
