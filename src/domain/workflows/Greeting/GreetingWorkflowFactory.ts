t;
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { WorkflowStateFactory } from '../BaseWorkflowState.js';
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';
import { ExecutionMode } from '../../entities/Task.js';
import { createGreetingGraph } from './GreetingGraph.js';
import type { GreetingState } from './GreetingState.js';

/**
 * 问候工作流工厂
 */
class GreetingWorkflowFactory implements WorkflowFactory<GreetingState> {
  readonly type = 'greeting';
  readonly version = '1.0.0';
  readonly name = '问候工作流';
  readonly description = '一个生成个性化问候语的工作流';

  createGraph(): WorkflowGraph {
    return createGreetingGraph();
  }

  createState(params: WorkflowParams): GreetingState {
    if (!this.validateParams(params)) {
      throw new Error('Invalid parameters for greeting workflow');
    }

    const baseState = WorkflowStateFactory.createBaseState({
      taskId: params.taskId,
      workflowType: this.type,
      mode: params.mode,
      initialStep: 'start',
      metadata: {
        timeOfDay: params.timeOfDay,
      },
    });

    return WorkflowStateFactory.extendState<GreetingState>(baseState, {
      workflowType: this.type,
      name: params.name as string,
      timeOfDay: (params.timeOfDay as string) || 'morning',
      greetingRetryCount: 0,
    });
  }

  validateParams(params: WorkflowParams): boolean {
    if (!params.name || typeof params.name !== 'string') {
      return false;
    }
    if (params.timeOfDay && typeof params.timeOfDay !== 'string') {
      return false;
    }
    return true;
  }

  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      version: this.version,
      name: this.name,
      description: this.description,
      category: 'other',
      tags: ['greeting', 'simple'],
      author: 'AI Workflow Team',
      docsUrl: 'https://docs.example.com/workflows/greeting',
      requiredParams: ['name'],
      optionalParams: ['timeOfDay'],
      paramDefinitions: [
        {
          name: 'name',
          description: '问候对象的名字',
          type: 'string',
          required: true,
          examples: ['张三', '李四'],
        },
        {
          name: 'timeOfDay',
          description: '问候的时间段',
          type: 'string',
          required: false,
          defaultValue: 'morning',
          examples: ['morning', 'afternoon', 'evening'],
        },
      ],
    };
  }
}

export const greetingWorkflowFactory = new GreetingWorkflowFactory();
export default new GreetingWorkflowFactory();
