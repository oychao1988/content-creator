/**
 * 工作流控制器
 *
 * 处理工作流相关的 HTTP 请求
 */

import type { Request, Response } from 'express';
import { WorkflowRegistry } from '../domain/workflow/WorkflowRegistry.js';
import type { WorkflowListResponseDto, WorkflowMetadataResponseDto } from '../dto/taskDtos.js';
import { asyncHandler, NotFoundError } from '../middleware/errorHandler.js';
import { createLogger } from '../infrastructure/logging/logger.js';

const logger = createLogger('WorkflowController');

/**
 * 工作流控制器类
 */
export class WorkflowController {
  /**
   * 列出所有工作流
   * GET /api/workflows
   */
  listWorkflows = asyncHandler(async (req: Request, res: Response) => {
    const workflowTypes = WorkflowRegistry.listWorkflowTypes();

    const workflows: WorkflowMetadataResponseDto[] = workflowTypes.map((type) => {
      const metadata = WorkflowRegistry.getMetadata(type);
      return {
        type,
        name: metadata?.name || type,
        description: metadata?.description || '',
        parameters: metadata?.parameters || [],
      };
    });

    const response: WorkflowListResponseDto = { workflows };

    res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * 获取工作流详情
   * GET /api/workflows/:type
   */
  getWorkflow = asyncHandler(async (req: Request, res: Response) => {
    const { type } = req.params;

    if (!WorkflowRegistry.has(type)) {
      throw new NotFoundError('Workflow', type);
    }

    const metadata = WorkflowRegistry.getMetadata(type);

    const response: WorkflowMetadataResponseDto = {
      type,
      name: metadata?.name || type,
      description: metadata?.description || '',
      parameters: metadata?.parameters || [],
    };

    res.json({
      success: true,
      data: response,
      timestamp: new Date().toISOString(),
    });
  });
}
