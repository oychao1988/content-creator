/**
 * LangChain Tools 导出模块
 *
 * 统一导出所有 LangChain Tools，供 ReAct Agent 使用
 */

export { searchTool } from './SearchTool.js';
export { writeTool } from './WriteTool.js';
export { generateImageTool } from './ImageGenerationTool.js';

/**
 * 所有工具列表
 *
 * 用于创建 Agent 时传入工具集
 */
import { searchTool as _searchTool } from './SearchTool.js';
import { writeTool as _writeTool } from './WriteTool.js';
import { generateImageTool as _generateImageTool } from './ImageGenerationTool.js';

export const allTools = [_searchTool, _writeTool, _generateImageTool] as const;
