/**
 * Search Node 单元测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SearchNode } from '../../src/domain/workflow/nodes/SearchNode.js';
import {
  createTestInitialState,
  createMockSearchResults,
} from '../utils/test-helpers.js';

// Mock SearchService
vi.mock('../../src/services/search/SearchService.js', () => ({
  searchService: {
    searchWithAnswer: vi.fn(),
  },
}));

import { searchService } from '../../src/services/search/SearchService.js';

describe('SearchNode', () => {
  let searchNode: SearchNode;

  beforeEach(() => {
    searchNode = new SearchNode({ useCache: false });
    vi.clearAllMocks();

    // Default mock response
    vi.mocked(searchService.searchWithAnswer).mockResolvedValue({
      answer: '这是 AI 技术相关的搜索答案',
      results: createMockSearchResults(5),
    });
  });

  describe('executeLogic', () => {
    it('should successfully search and return results', async () => {
      const state = createTestInitialState({
        topic: 'AI 技术发展',
        hardConstraints: {
          keywords: ['AI', '技术'],
        },
      });

      const result = await searchNode.executeLogic(state);

      expect(result.searchQuery).toBeDefined();
      expect(result.searchResults).toBeDefined();
      expect(result.searchResults?.length).toBeGreaterThan(0);
      expect(searchService.searchWithAnswer).toHaveBeenCalledTimes(1);
    });

    it('should include keywords in search query', async () => {
      const state = createTestInitialState({
        topic: 'AI 技术',
        hardConstraints: {
          keywords: ['AI', '人工智能'],
        },
      });

      const result = await searchNode.executeLogic(state);

      expect(result.searchQuery).toContain('AI');
      expect(result.searchQuery).toContain('人工智能');
    });

    it('should handle empty search results gracefully', async () => {
      vi.mocked(searchService.searchWithAnswer).mockResolvedValue({
        answer: '',
        results: [],
      });

      const state = createTestInitialState({
        topic: '未知主题',
      });

      const result = await searchNode.executeLogic(state);

      expect(result.searchResults).toEqual([]);
    });

    it('should handle search errors gracefully', async () => {
      vi.mocked(searchService.searchWithAnswer).mockRejectedValue(
        new Error('Search API failed')
      );

      const state = createTestInitialState();

      const result = await searchNode.executeLogic(state);

      // Should return empty results instead of throwing
      expect(result.searchResults).toEqual([]);
    });
  });

  describe('validateState', () => {
    it('should throw error if topic is missing', () => {
      const state = createTestInitialState({ topic: '' });

      expect(() => searchNode.validateState(state)).toThrow('Topic is required');
    });

    it('should pass validation with valid state', () => {
      const state = createTestInitialState();

      expect(() => searchNode.validateState(state)).not.toThrow();
    });
  });

  describe('generateSearchQuery', () => {
    it('should generate query from topic only', async () => {
      const state = createTestInitialState({
        topic: 'AI 技术',
        hardConstraints: {},
      });

      const result = await searchNode.executeLogic(state);

      expect(result.searchQuery).toContain('AI 技术');
    });

    it('should combine topic with keywords', async () => {
      const state = createTestInitialState({
        topic: 'AI',
        hardConstraints: {
          keywords: ['技术', '发展'],
        },
      });

      const result = await searchNode.executeLogic(state);

      expect(result.searchQuery).toContain('AI');
      expect(result.searchQuery).toContain('技术');
      expect(result.searchQuery).toContain('发展');
    });
  });
});
