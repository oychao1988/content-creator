/**
 * Image 服务
 *
 * 封装 Doubao API (火山引擎) 进行图片生成
 *
 * 参考实现: @tonychaos/mcp-server-doubao
 */

import axios, { AxiosError } from 'axios';
import { config } from '../../config/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('Image');

/**
 * Doubao 图片生成模型
 */
export const DOUBAO_IMAGE_MODELS = {
  SEEDREAM_4_5: 'doubao-seedream-4-5-251128',  // 最新版本（推荐）
  SEEDREAM_4_0: 'doubao-seedream-4-0-250428',
  SEEDREAM_3_0_T2I: 'doubao-seedream-3-0-t2i',
} as const;

/**
 * 默认模型
 */
const DEFAULT_MODEL = DOUBAO_IMAGE_MODELS.SEEDREAM_4_5;

/**
 * 图片生成请求参数
 */
export interface ImageGenerationRequest {
  prompt: string;
  model?: keyof typeof DOUBAO_IMAGE_MODELS;
  size?: string;           // 如 "1920x1920"（注意：Doubao 要求至少 3686400 像素）
  seed?: number;           // 随机种子（仅 3.0 模型支持）
  stream?: boolean;        // 是否流式输出（仅 4.5/4.0 支持）
  watermark?: boolean;     // 是否添加水印（默认 true）
}

/**
 * 图片生成响应
 */
export interface ImageGenerationResponse {
  imageUrl: string;
  model: string;
  prompt?: string;
  seed?: number;
}

/**
 * Image 服务类
 */
export class ImageService {
  private apiKey: string;
  private baseURL: string;

  constructor() {
    this.apiKey = config.doubao.apiKey;
    this.baseURL = config.doubao.apiURL || 'https://ark.cn-beijing.volces.com';

    if (!this.apiKey) {
      throw new Error('ARK_API_KEY is required for Doubao Image Service');
    }
  }

  /**
   * 生成图片
   */
  async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResponse> {
    try {
      logger.debug('Sending image generation request', {
        prompt: request.prompt.substring(0, 100),
        model: request.model || DEFAULT_MODEL,
        size: request.size,
      });

      // 构建请求体（参考 @tonychaos/mcp-server-doubao）
      const requestBody = {
        model: request.model || DEFAULT_MODEL,
        prompt: request.prompt,
        size: request.size || '1920x1920',  // Doubao 要求至少 3686400 像素 (1920x1920)
        seed: request.seed,
        stream: request.stream || false,
        response_format: 'url',
        watermark: request.watermark !== undefined ? request.watermark : true,
      };

      // 移除 undefined 的字段
      Object.keys(requestBody).forEach((key) => {
        if ((requestBody as any)[key] === undefined) {
          delete (requestBody as any)[key];
        }
      });

      // 发送请求
      const response = await axios.post(
        `${this.baseURL}/api/v3/images/generations`,
        requestBody,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000, // 2 分钟超时（图片生成可能较慢）
        }
      );

      // 解析响应
      const data = response.data;

      // Doubao API 返回格式: { data: [{ url: "..." }] }
      if (!data.data || !data.data[0] || !data.data[0].url) {
        throw new Error('Invalid response format from Doubao API');
      }

      const imageUrl = data.data[0].url;

      logger.info('Image generation completed', {
        imageUrl: imageUrl.substring(0, 50) + '...',
        model: requestBody.model,
      });

      return {
        imageUrl,
        model: requestBody.model,
        prompt: request.prompt,
        seed: request.seed,
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError<any>;
        logger.error('Image generation API request failed', {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          message: axiosError.message,
        });

        throw new Error(
          `Image generation API error: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data)}`
        );
      }

      logger.error('Image service error', error as Error);
      throw error;
    }
  }

  /**
   * 批量生成图片
   */
  async batchGenerateImages(requests: ImageGenerationRequest[]): Promise<ImageGenerationResponse[]> {
    logger.info('Batch generating images', { count: requests.length });

    const results = await Promise.allSettled(
      requests.map(async (req) => {
        try {
          return await this.generateImage(req);
        } catch (error) {
          logger.error(`Image generation failed for prompt: ${req.prompt.substring(0, 50)}`, error as Error);
          throw error;
        }
      })
    );

    const successful = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected');

    logger.info('Batch image generation completed', {
      total: requests.length,
      successful: successful.length,
      failed: failed.length,
    });

    // 如果全部失败，抛出错误
    if (successful.length === 0) {
      throw new Error('All image generation requests failed');
    }

    // 返回成功的结果
    return successful.map((r) => (r as PromiseFulfilledResult<ImageGenerationResponse>).value);
  }

  /**
   * 检查 API 连接
   */
  async healthCheck(): Promise<boolean> {
    try {
      // 验证 API key 格式
      if (!this.apiKey || this.apiKey.length < 10) {
        logger.error('Invalid API key format');
        return false;
      }

      logger.info('Image service health check passed (API key format validated)');
      return true;
    } catch (error) {
      logger.error('Image service health check failed', error as Error);
      return false;
    }
  }

  /**
   * 获取支持的模型列表
   */
  getSupportedModels(): typeof DOUBAO_IMAGE_MODELS {
    return DOUBAO_IMAGE_MODELS;
  }

  /**
   * 获取默认模型
   */
  getDefaultModel(): string {
    return DEFAULT_MODEL;
  }
}

/**
 * Image 服务单例
 */
export const imageService = new ImageService();
