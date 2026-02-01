/**
 * GenerateImage Node - 生成配图节点
 *
 * 根据图片提示词生成配图（提示词由 WriteNode 生成）
 */

import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';
import type { GeneratedImage } from '../State.js';
import { imageService } from '../../../services/image/ImageService.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('GenerateImageNode');

/**
 * GenerateImage Node 配置
 */
interface GenerateImageNodeConfig {
  defaultImageCount?: number;
  maxImageCount?: number;
  useImageGeneration?: boolean; // 是否实际调用图片生成 API
}

/**
 * GenerateImage Node 实现
 */
export class GenerateImageNode extends BaseNode {
  private config: GenerateImageNodeConfig;

  constructor(config: GenerateImageNodeConfig = {}) {
    super({
      name: 'generateImage',
      retryCount: 2,
      timeout: 180000, // 3 分钟超时（图片生成可能很慢）
    });

    // 测试环境下禁用图片生成，避免API key问题
    const isTestEnvironment = process.env.NODE_ENV === 'test';

    this.config = {
      defaultImageCount: 2,
      maxImageCount: 5,
      useImageGeneration: isTestEnvironment ? false : true, // 测试环境禁用图片生成
      ...config,
    };
  }

  /**
   * 生成图片
   */
  private async generateImages(prompts: string[], taskId: string): Promise<GeneratedImage[]> {
    if (!this.config.useImageGeneration) {
      const isTestEnvironment = process.env.NODE_ENV === 'test';
      logger.info('Image generation is disabled, returning mock images', {
        isTestEnvironment,
        reason: isTestEnvironment ? 'Test environment detected' : 'Configuration disabled',
      });
      // 返回模拟图片
      return prompts.map((prompt) => ({
        url: `https://example.com/mock-image-${Date.now()}.png`,
        prompt,
        width: 1024,
        height: 1024,
        format: 'png',
      }));
    }

    logger.info('Generating images', { count: prompts.length });

    try {
      // 并发生成所有图片
      const images = await Promise.all(
        prompts.map(async (prompt, index) => {
          try {
            logger.debug(`Generating image ${index + 1}/${prompts.length}`, {
              prompt: prompt.substring(0, 50),
            });

            const result = await imageService.generateImage({
              prompt,
              size: '1920x1920',  // Doubao 要求至少 3686400 像素
              watermark: false,
            });

            logger.info(`Image ${index + 1} generated successfully`, {
              imageUrl: result.imageUrl.substring(0, 50) + '...',
              model: result.model,
            });

            // 下载图片到本地
            let localPath: string | undefined;
            try {
              const filename = imageService.generateImageFilename(taskId, index, 'png');
              localPath = await imageService.downloadImage(result.imageUrl, filename);
              logger.info(`Image ${index + 1} downloaded successfully`, {
                localPath,
              });
            } catch (downloadError) {
              logger.warn(`Failed to download image ${index + 1}`, {
                error: downloadError instanceof Error ? downloadError.message : String(downloadError),
              });
              // 下载失败不影响主流程，图片仍然可用（通过云端 URL）
            }

            return {
              url: result.imageUrl,
              localPath,
              prompt,
              width: 1024,
              height: 1024,
              format: 'png',
            };
          } catch (error) {
            logger.error(`Failed to generate image ${index + 1}`, {
              prompt: prompt.substring(0, 50),
              error: error instanceof Error ? error.message : String(error),
            });

            // 返回一个占位符图片，避免整个流程失败
            return {
              url: '',
              prompt,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      // 过滤掉生成失败的图片
      const successfulImages = images.filter((img) => img.url);

      logger.info('Image generation completed', {
        total: prompts.length,
        successful: successfulImages.length,
        failed: prompts.length - successfulImages.length,
      });

      return successfulImages;
    } catch (error) {
      logger.error('Image generation failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * 执行配图生成逻辑
   */
  protected async executeLogic(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Starting image generation', {
      taskId: state.taskId,
      topic: state.topic,
    });

    try {
      // 1. 使用 WriteNode 生成的图片提示词
      const imagePrompts = state.imagePrompts;

      if (!imagePrompts || imagePrompts.length === 0) {
        throw new Error('No image prompts found in state. WriteNode should generate them.');
      }

      logger.info('Using image prompts from WriteNode', {
        taskId: state.taskId,
        promptCount: imagePrompts.length,
      });

      // 2. 生成图片（并下载到本地）
      const images = await this.generateImages(imagePrompts, state.taskId);

      // 3. 检查是否至少有一张图片生成成功
      if (images.length === 0) {
        logger.warn('No images generated successfully', {
          taskId: state.taskId,
        });

        // 返回空数组，允许工作流继续
        return {
          images: [],
        };
      }

      logger.info('Image generation completed successfully', {
        taskId: state.taskId,
        imageCount: images.length,
        downloadedCount: images.filter(img => img.localPath).length,
      });

      return {
        images,
      };
    } catch (error) {
      logger.error('Image generation failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      // 图片生成失败时，返回空数组而不是抛出错误
      // 这样可以让工作流继续，文章没有配图也可以接受
      logger.warn('Returning empty images array to allow workflow to continue');
      return {
        images: [],
      };
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: WorkflowState): void {
    super.validateState(state);

    // 检查是否有图片提示词（由 WriteNode 生成）
    if (!state.imagePrompts || state.imagePrompts.length === 0) {
      throw new Error('Image prompts are required for image generation. WriteNode should generate them.');
    }
  }
}

/**
 * GenerateImage Node 单例导出（默认配置）
 */
export const generateImageNode = new GenerateImageNode();
