/**
 * PostProcess Node - 后处理节点
 *
 * 功能：
 * 1. 将文章中的图片占位符替换为实际图片地址
 * 2. 优先使用本地保存的图片地址
 */

import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('PostProcessNode');

/**
 * PostProcess Node 配置
 */
interface PostProcessNodeConfig {
  preferLocalPath?: boolean; // 是否优先使用本地路径（默认 true）
}

/**
 * PostProcess Node 实现
 */
export class PostProcessNode extends BaseNode {
  private config: PostProcessNodeConfig;

  constructor(config: PostProcessNodeConfig = {}) {
    super({
      name: 'postProcess',
      retryCount: 0, // 后处理不需要重试
      timeout: 10000, // 10 秒超时
    });

    this.config = {
      preferLocalPath: true,
      ...config,
    };
  }

  /**
   * 替换文章中的图片占位符
   */
  private replaceImagePlaceholders(
    articleContent: string,
    images: WorkflowState['images']
  ): string {
    if (!images || images.length === 0) {
      logger.warn('No images available, removing placeholders from article');
      // 移除所有图片占位符
      return articleContent.replace(/!\[.*?\]\(image-placeholder-\d+\)/g, '');
    }

    logger.info('Starting image placeholder replacement', {
      imagesCount: images.length,
      imagesWithLocalPath: images.filter(img => img.localPath).length,
      imagesWithUrl: images.filter(img => img.url).length,
    });

    // 匹配所有图片占位符：![描述](image-placeholder-N)
    const placeholderRegex = /!\[(.*?)\]\(image-placeholder-(\d+)\)/g;
    let processedContent = articleContent;
    let match;
    let replacedCount = 0;
    let removedCount = 0;

    // 首先列出所有找到的占位符
    const placeholders = (articleContent.match(/image-placeholder-\d+/g) || []);
    logger.info('Found placeholders in article', {
      placeholders,
      count: placeholders.length,
    });

    // 列出所有可用的图片
    images.forEach((img, idx) => {
      logger.debug(`Image ${idx + 1}`, {
        hasLocalPath: !!img.localPath,
        hasUrl: !!img.url,
        localPath: img.localPath,
        urlPreview: img.url ? img.url.substring(0, 60) + '...' : 'none',
      });
    });

    while ((match = placeholderRegex.exec(articleContent)) !== null) {
      const [fullMatch, altText, indexStr] = match;
      const index = parseInt(indexStr || '1', 10) - 1; // 转换为 0-based 索引

      logger.debug(`Processing placeholder ${indexStr}`, {
        altText,
        index,
        fullMatch,
      });

      if (index >= 0 && index < images.length) {
        const image = images[index];

        if (!image) {
          logger.warn(`Image at index ${index} is undefined, removing placeholder`);
          processedContent = processedContent.replace(fullMatch, '');
          removedCount++;
          continue;
        }

        // 优先使用本地路径，否则使用云端 URL
        let imageUrl: string | undefined;
        if (this.config.preferLocalPath && image.localPath) {
          imageUrl = image.localPath;
          logger.info(`Using local path for image ${index + 1}`, {
            localPath: image.localPath,
          });
        } else if (image.url) {
          imageUrl = image.url;
          logger.info(`Using remote URL for image ${index + 1}`, {
            url: image.url.substring(0, 60) + '...',
          });
        } else {
          logger.warn(`No valid image path/URL for image ${index + 1}, removing placeholder`, {
            hasLocalPath: !!image.localPath,
            hasUrl: !!image.url,
          });
          imageUrl = undefined; // 移除占位符
        }

        if (imageUrl) {
          // 替换占位符为实际图片地址
          const replacement = `![${altText || ''}](${imageUrl})`;
          processedContent = processedContent.replace(fullMatch, replacement);
          replacedCount++;
          logger.info(`Replaced placeholder ${indexStr}`, {
            replacement: replacement.substring(0, 80) + '...',
          });
        } else {
          // 移除占位符
          processedContent = processedContent.replace(fullMatch, '');
          removedCount++;
        }
      } else {
        logger.warn(`Image index ${index + 1} out of range, removing placeholder`, {
          totalImages: images.length,
          requestedIndex: index + 1,
        });
        processedContent = processedContent.replace(fullMatch, '');
        removedCount++;
      }
    }

    logger.info('Image placeholder replacement completed', {
      totalPlaceholders: placeholders.length,
      replacedCount,
      removedCount,
    });

    return processedContent;
  }

  /**
   * 执行后处理逻辑
   */
  protected async executeLogic(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Starting post-processing', {
      taskId: state.taskId,
      hasArticleContent: !!state.articleContent,
      imageCount: state.images?.length || 0,
    });

    try {
      // 1. 检查是否有文章内容
      if (!state.articleContent) {
        throw new Error('No article content found in state');
      }

      // 2. 替换图片占位符
      const finalArticleContent = this.replaceImagePlaceholders(
        state.articleContent,
        state.images
      );

      // 3. 计算文章统计信息
      const originalLength = state.articleContent.length;
      const finalLength = finalArticleContent.length;
      const placeholderCount = (state.articleContent.match(/image-placeholder-\d+/g) || []).length;

      logger.info('Post-processing completed successfully', {
        taskId: state.taskId,
        originalLength,
        finalLength,
        placeholderCount,
        replacedCount: state.images?.filter(img => img.localPath || img.url).length || 0,
      });

      return {
        finalArticleContent,
      };
    } catch (error) {
      logger.error('Post-processing failed', {
        taskId: state.taskId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: WorkflowState): void {
    super.validateState(state);

    // 检查是否有文章内容
    if (!state.articleContent) {
      throw new Error('Article content is required for post-processing');
    }
  }
}

/**
 * PostProcess Node 单例导出（默认配置）
 */
export const postProcessNode = new PostProcessNode();
