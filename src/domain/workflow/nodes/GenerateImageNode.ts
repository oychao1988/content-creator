/**
 * GenerateImage Node - 生成配图节点
 *
 * 根据文章内容生成配图
 */

import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';
import type { GeneratedImage } from '../State.js';
import { enhancedLLMService } from '../../../services/llm/EnhancedLLMService.js';
import { imageService } from '../../../services/image/ImageService.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('GenerateImageNode');

/**
 * 图片提示词生成请求
 */
interface ImagePromptGenerationRequest {
  articleContent: string;
  topic: string;
  maxPrompts?: number;
}

/**
 * GenerateImage Node 配置
 */
interface GenerateImageNodeConfig {
  defaultImageCount?: number;
  maxImageCount?: number;
  useImageGeneration?: boolean; // 是否实际调用图片生成 API
}

/**
 * 图片提示词生成 Prompt 模板
 *
 * 优化：精简 prompt，减少 token 消耗，提升响应速度
 */
const GENERATE_IMAGE_PROMPTS_PROMPT = `根据文章生成{maxPrompts}个配图提示词，返回JSON数组。

主题：{topic}

内容：
{articleContent}

要求：
- 描述独立场景（50字内）
- 适合AI图片生成（视觉元素/风格/氛围）
- 与内容相关，无文字

格式：
["提示词1","提示词2","提示词3"]

要求：纯JSON数组，{maxPrompts}个，每条50字内
`;

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
   * 生成图片提示词
   */
  private async generateImagePrompts(
    request: ImagePromptGenerationRequest
  ): Promise<string[]> {
    logger.debug('Generating image prompts', {
      topic: request.topic,
      contentLength: request.articleContent.length,
      maxPrompts: request.maxPrompts || this.config.defaultImageCount,
    });

    try {
      // 1. 构建 Prompt
      const maxPrompts = request.maxPrompts || this.config.defaultImageCount;

      // 限制文章内容长度，避免 Token 过多
      const articleContent =
        request.articleContent.length > 1000
          ? request.articleContent.substring(0, 1000) + '...'
          : request.articleContent;

      const prompt = GENERATE_IMAGE_PROMPTS_PROMPT.replace(
        '{topic}',
        request.topic
      )
        .replace('{articleContent}', articleContent)
        .replace('{maxPrompts}', String(maxPrompts));

      // 2. 调用 LLM
      const systemMessage =
        '你是一位专业的配图策划。请严格按照 JSON 数组格式返回。';

      const result = await enhancedLLMService.chat({
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: prompt },
        ],
        taskId: '', // 这里没有 taskId，使用空字符串
        stepName: 'generateImagePrompts',
        stream: true, // 启用流式请求
      });

      // 3. 解析 JSON 响应
      let prompts: string[];
      try {
        let content = result.content.trim();
        if (content.startsWith('```json')) {
          content = content.slice(7);
        }
        if (content.startsWith('```')) {
          content = content.slice(3);
        }
        if (content.endsWith('```')) {
          content = content.slice(0, -3);
        }
        content = content.trim();

        prompts = JSON.parse(content);
      } catch (error) {
        logger.error('Failed to parse LLM output as JSON', {
          content: result.content.substring(0, 500),
          error: error instanceof Error ? error.message : String(error),
        });

        throw new Error(
          'Failed to parse image prompts. LLM did not return valid JSON.'
        );
      }

      // 4. 验证输出
      if (!Array.isArray(prompts)) {
        throw new Error('Image prompts must be an array');
      }

      if (prompts.length !== maxPrompts) {
        logger.warn('Image prompts count mismatch', {
          expected: maxPrompts,
          actual: prompts.length,
        });
      }

      if (prompts.length === 0) {
        throw new Error('At least one image prompt is required');
      }

      logger.info('Image prompts generated successfully', {
        count: prompts.length,
      });

      return prompts;
    } catch (error) {
      logger.error('Failed to generate image prompts', {
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
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
      // 1. 检查是否已有图片提示词
      let imagePrompts = state.imagePrompts;

      if (!imagePrompts || imagePrompts.length === 0) {
        // 2. 生成图片提示词
        imagePrompts = await this.generateImagePrompts({
          articleContent: state.articleContent!,
          topic: state.topic,
          maxPrompts: this.config.defaultImageCount,
        });
      }

      // 3. 生成图片（并下载到本地）
      const images = await this.generateImages(imagePrompts, state.taskId);

      // 4. 检查是否至少有一张图片生成成功
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

    if (!state.articleContent || state.articleContent.trim().length === 0) {
      throw new Error('Article content is required for image generation');
    }
  }
}

/**
 * GenerateImage Node 单例导出（默认配置）
 */
export const generateImageNode = new GenerateImageNode();
