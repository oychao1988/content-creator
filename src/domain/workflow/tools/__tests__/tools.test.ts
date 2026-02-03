/**
 * LangChain Tools 基础测试
 *
 * 验证工具可以正确导入和实例化
 */

import { describe, it, expect } from 'vitest';
import { searchTool, writeTool, generateImageTool, allTools } from '../index.js';

describe('LangChain Tools', () => {
  describe('工具导出', () => {
    it('应该导出 searchTool', () => {
      expect(searchTool).toBeDefined();
      expect(searchTool.name).toBe('search_content');
    });

    it('应该导出 writeTool', () => {
      expect(writeTool).toBeDefined();
      expect(writeTool.name).toBe('write_content');
    });

    it('应该导出 generateImageTool', () => {
      expect(generateImageTool).toBeDefined();
      expect(generateImageTool.name).toBe('generate_images');
    });

    it('应该导出 allTools 数组', () => {
      expect(allTools).toBeDefined();
      expect(Array.isArray(allTools)).toBe(true);
      expect(allTools).toHaveLength(3);
    });
  });

  describe('工具属性', () => {
    it('searchTool 应该有正确的 schema', () => {
      expect(searchTool.schema).toBeDefined();
      expect(searchTool.description).toContain('搜索');
    });

    it('writeTool 应该有正确的 schema', () => {
      expect(writeTool.schema).toBeDefined();
      expect(writeTool.description).toContain('撰写');
    });

    it('generateImageTool 应该有正确的 schema', () => {
      expect(generateImageTool.schema).toBeDefined();
      expect(generateImageTool.description).toContain('生成配图');
    });
  });
});
