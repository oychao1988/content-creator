/**
 * Search Node - 搜索节点
 *
 * 根据选题搜索相关资料，为后续写作提供参考素材
 */

import { BaseNode } from './BaseNode.js';
import type { WorkflowState } from '../State.js';
import type { SearchResultItem } from '../State.js';
import { searchService } from '../../../services/search/SearchService.js';
import { createLogger } from '../../../infrastructure/logging/logger.js';

const logger = createLogger('SearchNode');

/**
 * Search Node 配置
 */
interface SearchNodeConfig {
  maxResults?: number;
  useCache?: boolean;
  cacheTTL?: number; // 缓存时间（秒）
}

/**
 * Search Node 实现
 */
export class SearchNode extends BaseNode {
  private config: SearchNodeConfig;

  constructor(config: SearchNodeConfig = {}) {
    super({
      name: 'search',
      retryCount: 2,
      timeout: 30000, // 30 秒超时
    });

    this.config = {
      maxResults: 10,
      useCache: false, // 默认不使用缓存（需要 Redis 配置）
      cacheTTL: 86400, // 24 小时
      ...config,
    };
  }

  /**
   * 生成搜索查询
   */
  private generateSearchQuery(state: WorkflowState): string {
    const { topic, hardConstraints } = state;

    // 基础查询
    let query = topic;

    // 如果有指定关键词，组合到查询中
    if (hardConstraints?.keywords && hardConstraints.keywords.length > 0) {
      // 取前 3 个关键词
      const keywords = hardConstraints.keywords.slice(0, 3).join(' ');
      query = `${topic} ${keywords}`;
    }

    logger.debug('Generated search query', { query });
    return query;
  }

  /**
   * 从缓存获取搜索结果（可选）
   */
  private async getCachedResult(_query: string): Promise<SearchResultItem[] | null> {
    // TODO: 实现 Redis 缓存
    // 如果需要缓存，可以在这里添加 Redis 逻辑
    return null;
  }

  /**
   * 保存搜索结果到缓存（可选）
   */
  private async setCachedResult(
    _query: string,
    _results: SearchResultItem[]
  ): Promise<void> {
    // TODO: 实现 Redis 缓存
    // 如果需要缓存，可以在这里添加 Redis 逻辑
  }

  /**
   * 执行搜索逻辑
   */
  protected async executeLogic(state: WorkflowState): Promise<Partial<WorkflowState>> {
    logger.info('Starting search', {
      taskId: state.taskId,
      topic: state.topic,
    });

    if (process.env.NODE_ENV === 'test' && state.taskId.startsWith('test-')) {
      logger.debug('Test environment: returning empty search results');
      return {
        searchQuery: state.topic,
        searchResults: [],
      };
    }

    try {
      // 1. 生成搜索查询
      const searchQuery = this.generateSearchQuery(state);

      // 2. 检查缓存（可选）
      if (this.config.useCache) {
        const cached = await this.getCachedResult(searchQuery);
        if (cached && cached.length > 0) {
          logger.info('Using cached search results', {
            count: cached.length,
          });

          return {
            searchQuery,
            searchResults: cached,
          };
        }
      }

      // 3. 调用搜索服务
      logger.debug('Calling search service', {
        query: searchQuery,
        maxResults: this.config.maxResults,
      });

      const response = await searchService.searchWithAnswer(
        searchQuery,
        this.config.maxResults || 10
      );

      // 4. 验证搜索结果
      if (!response.results || response.results.length === 0) {
        logger.warn('No search results found', { query: searchQuery });
        // 不抛出错误，返回空结果
        return {
          searchQuery,
          searchResults: [],
        };
      }

      // 5. 转换搜索结果格式
      const searchResults: SearchResultItem[] = response.results.map((item) => ({
        title: item.title,
        url: item.url,
        content: item.content,
        score: item.score,
        publishedDate: item.publishedDate,
        author: item.author,
      }));

      // 6. 保存到缓存（可选）
      if (this.config.useCache) {
        await this.setCachedResult(searchQuery, searchResults);
      }

      logger.info('Search completed successfully', {
        taskId: state.taskId,
        resultCount: searchResults.length,
        hasAnswer: !!response.answer,
      });

      // 7. 返回状态更新
      return {
        searchQuery,
        searchResults,
      };
    } catch (error) {
      logger.error('Search failed', {
        taskId: state.taskId,
        topic: state.topic,
        error: error instanceof Error ? error.message : String(error),
      });

      // 搜索失败时，返回空结果而不是抛出错误
      // 这样可以让工作流继续，使用其他方式生成内容
      logger.warn('Returning empty search results to allow workflow to continue');
      return {
        searchQuery: state.topic,
        searchResults: [],
      };
    }
  }

  /**
   * 验证输入状态
   */
  protected validateState(state: WorkflowState): void {
    super.validateState(state);

    if (!state.topic || state.topic.trim().length === 0) {
      throw new Error('Topic is required for search');
    }
  }
}

/**
 * Search Node 单例导出（默认配置）
 */
export const searchNode = new SearchNode();
