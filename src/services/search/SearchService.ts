/**
 * Search 服务
 *
 * 封装 Tavily API 进行搜索，支持缓存
 */

import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import { config } from '../../config/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';
import { cacheService } from '../../infrastructure/cache/CacheService.js';
import { metricsService } from '../../infrastructure/monitoring/MetricsService.js';

const logger = createLogger('Search');

/**
 * 搜索结果项
 */
export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

/**
 * 搜索请求参数
 */
export interface SearchRequest {
  query: string;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeAnswer?: boolean;
  includeImages?: boolean;
  includeRawContent?: boolean;
}

/**
 * 搜索响应
 */
export interface SearchResponse {
  answer?: string;
  results: SearchResultItem[];
  images?: Array<{
    url: string;
    description?: string;
  }>;
}

/**
 * Search 服务类
 */
export class SearchService {
  private apiKey: string;
  private baseURL = 'https://api.tavily.com';
  private enableCache: boolean;

  constructor() {
    this.apiKey = config.tavily.apiKey;
    this.enableCache = true; // 默认启用缓存
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(request: SearchRequest): string {
    const cacheData = {
      query: request.query,
      maxResults: request.maxResults || 10,
      searchDepth: request.searchDepth || 'basic',
      includeAnswer: request.includeAnswer ?? true,
      includeImages: request.includeImages ?? false,
      includeRawContent: request.includeRawContent ?? false,
    };

    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(cacheData))
      .digest('hex');

    return hash;
  }

  /**
   * 执行搜索（支持缓存）
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const cacheKey = this.generateCacheKey(request);

    // 尝试从缓存获取
    if (this.enableCache) {
      try {
        const cached = await cacheService.getCachedSearchResults(cacheKey);
        if (cached) {
          logger.debug('Search results retrieved from cache', { cacheKey, query: request.query });
          metricsService.recordCacheHit('search');
          return cached;
        }
        metricsService.recordCacheMiss('search');
      } catch (error) {
        logger.warn('Failed to retrieve from cache', error as Error);
        // 继续执行，不阻断请求
      }
    }

    try {
      logger.debug('Sending search request', {
        query: request.query,
        maxResults: request.maxResults,
      });

      const response = await axios.post(
        `${this.baseURL}/search`,
        {
          api_key: this.apiKey,
          query: request.query,
          max_results: request.maxResults || 10,
          search_depth: request.searchDepth || 'basic',
          include_answer: request.includeAnswer ?? true,
          include_images: request.includeImages ?? false,
          include_raw_content: request.includeRawContent ?? false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000, // 30 秒超时
        }
      );

      const data = response.data;

      // 转换结果格式
      const results: SearchResultItem[] = (data.results || []).map((item: any) => ({
        title: item.title,
        url: item.url,
        content: item.content,
        score: item.score,
        publishedDate: item.published_date,
        author: item.author,
      }));

      const searchResponse: SearchResponse = {
        answer: data.answer,
        results,
        images: data.images,
      };

      logger.info('Search completed', {
        resultCount: results.length,
        hasAnswer: !!searchResponse.answer,
      });

      // 缓存搜索结果（异步，不等待）
      if (this.enableCache) {
        cacheService.setCachedSearchResults(cacheKey, searchResponse).catch((error) => {
          logger.warn('Failed to cache search results', error);
        });
      }

      return searchResponse;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;
        logger.error('Search API request failed', {
          status: axiosError.response?.status,
          data: axiosError.response?.data,
          message: axiosError.message,
        });

        throw new Error(
          `Search API error: ${axiosError.response?.status} - ${JSON.stringify(axiosError.response?.data)}`
        );
      }

      logger.error('Search service error', error as Error);
      throw error;
    }
  }

  /**
   * 简化搜索（只返回结果）
   */
  async searchOnly(query: string, maxResults: number = 10): Promise<SearchResultItem[]> {
    const response = await this.search({
      query,
      maxResults,
      includeAnswer: false,
      includeImages: false,
    });

    return response.results;
  }

  /**
   * 搜索并获取答案
   */
  async searchWithAnswer(query: string, maxResults: number = 10): Promise<{
    answer: string;
    results: SearchResultItem[];
  }> {
    const response = await this.search({
      query,
      maxResults,
      includeAnswer: true,
    });

    return {
      answer: response.answer || '',
      results: response.results,
    };
  }

  /**
   * 批量搜索
   */
  async batchSearch(queries: string[]): Promise<Map<string, SearchResultItem[]>> {
    logger.info('Batch searching', { count: queries.length });

    const results = new Map<string, SearchResultItem[]>();

    await Promise.all(
      queries.map(async (query) => {
        try {
          const searchResults = await this.searchOnly(query);
          results.set(query, searchResults);
        } catch (error) {
          logger.error(`Search failed for query: ${query}`, error as Error);
          results.set(query, []);
        }
      })
    );

    logger.info('Batch search completed', {
      total: queries.length,
      successful: results.size,
    });

    return results;
  }

  /**
   * 检查 API 连接
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.search({
        query: 'test',
        maxResults: 1,
      });

      logger.info('Search service health check passed');
      return true;
    } catch (error) {
      logger.error('Search service health check failed', error as Error);
      return false;
    }
  }
}

/**
 * Search 服务单例
 */
export const searchService = new SearchService();
