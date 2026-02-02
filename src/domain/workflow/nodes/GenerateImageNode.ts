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
  private parseImageSize(size?: string): { size: string; width: number; height: number } {
    const defaultSize = '1920x1920';
    const effectiveSize = size && size.trim().length > 0 ? size.trim() : defaultSize;

    const minimumPixels = 3686400;

    const match = effectiveSize.match(/^(\d+)x(\d+)$/);
    if (!match) {
      return { size: defaultSize, width: 1920, height: 1920 };
    }

    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return { size: defaultSize, width: 1920, height: 1920 };
    }

    const pixels = width * height;
    if (pixels >= minimumPixels) {
      return { size: effectiveSize, width, height };
    }

    // Doubao 对最小像素有硬性要求：>= 3686400。这里自动回退到最接近的安全尺寸。
    const requestedRatio = width / height;
    const presets = [
      { width: 2560, height: 1440 },
      { width: 1440, height: 2560 },
      { width: 1920, height: 1920 },
    ];

    let best = presets[0]!;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const preset of presets) {
      const ratio = preset.width / preset.height;
      const diff = Math.abs(ratio - requestedRatio);
      if (diff < bestDiff) {
        best = preset;
        bestDiff = diff;
      }
    }

    logger.warn('Requested imageSize is not valid for Doubao, auto-adjusting to meet minimum pixel requirement', {
      requestedSize: effectiveSize,
      requestedPixels: pixels,
      minimumPixels,
      adjustedSize: `${best.width}x${best.height}`,
      adjustedPixels: best.width * best.height,
    });

    return {
      size: `${best.width}x${best.height}`,
      width: best.width,
      height: best.height,
    };
  }

  private async generateImages(
    prompts: string[],
    taskId: string,
    imageSize?: string
  ): Promise<GeneratedImage[]> {
    const parsedSize = this.parseImageSize(imageSize);

    if (!this.config.useImageGeneration) {
      const isTestEnvironment = process.env.NODE_ENV === 'test';
      logger.info('Image generation is disabled, returning mock images', {
        isTestEnvironment,
        reason: isTestEnvironment ? 'Test environment detected' : 'Configuration disabled',
      });
      // 🆕 返回模拟图片，包含本地路径（模拟已下载的状态）
      return prompts.map((prompt, index) => {
        const filename = `${taskId}_${index}_${Date.now()}.png`;
        const mockLocalPath = `data/images/${filename}`;
        return {
          url: `https://example.com/mock-image-${Date.now()}.png`,
          localPath: mockLocalPath,  // 🆕 添加本地路径
          prompt,
          width: parsedSize.width,
          height: parsedSize.height,
          format: 'png',
        };
      });
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
              size: parsedSize.size,
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
              width: parsedSize.width,
              height: parsedSize.height,
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
      imageSize: state.imageSize,
    });

    try {
      // 1. 使用 WriteNode 生成的图片提示词
      const imagePromptsFromState = state.imagePrompts;

      const imagePrompts =
        imagePromptsFromState && imagePromptsFromState.length > 0
          ? imagePromptsFromState
          : [
              `Professional illustration about ${state.topic}, modern clean style, no text, high quality`,
            ];

      if (!imagePromptsFromState || imagePromptsFromState.length === 0) {
        logger.warn('No image prompts found in state, using fallback prompt', {
          taskId: state.taskId,
          fallbackCount: imagePrompts.length,
        });
      }

      logger.info('Using image prompts from WriteNode', {
        taskId: state.taskId,
        promptCount: imagePrompts.length,
      });

      // 2. 生成图片（并下载到本地）
      const images = await this.generateImages(imagePrompts, state.taskId, state.imageSize);

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
        imagePrompts,
        imageSize: state.imageSize,
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
  }
}

/**
 * GenerateImage Node 单例导出（默认配置）
 */
export const generateImageNode = new GenerateImageNode();
