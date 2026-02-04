t;
import type { BaseWorkflowState } from '../BaseWorkflowState.js';
import { WorkflowStateFactory } from '../BaseWorkflowState.js';
import type { WorkflowFactory, WorkflowParams, WorkflowMetadata } from '../WorkflowRegistry.js';
import { ExecutionMode } from '../../entities/Task.js';
import { createGreetingGeneratorGraph } from './GreetingGeneratorGraph.js';
import type { GreetingGeneratorState } from './GreetingGeneratorState.js';

/**
 * 问候生成工作流工厂
 */
class GreetingGeneratorWorkflowFactory implements WorkflowFactory<GreetingGeneratorState> {
  readonly type = 'greeting-generator';
  readonly version = '1.0.0';
  readonly name = '问候生成工作流';
  readonly description = '根据用户输入生成个性化的问候语';

  createGraph(): WorkflowGraph {
    return createGreetingGeneratorGraph();
  }

  createState(params: WorkflowParams): GreetingGeneratorState {
    if (!this.validateParams(params)) {
      throw new Error('Invalid parameters for greeting-generator workflow');
    }

    const baseState = WorkflowStateFactory.createBaseState({
      taskId: params.taskId,
      workflowType: this.type,
      mode: params.mode,
      initialStep: 'start',
      metadata: {
        timeOfDay: params.timeOfDay,
        language: params.language,
      },
    });

    return WorkflowStateFactory.extendState<GreetingGeneratorState>(baseState, {
      workflowType: this.type,
      name: params.name as string,
      timeOfDay: (params.timeOfDay as string) || 'morning',
      language: (params.language as string) || 'zh',
      retryCount: 0,
    });
  }

  validateParams(params: WorkflowParams): boolean {
    if (!params.name || typeof params.name !== 'string') {
      return false;
    }
    if (params.timeOfDay && typeof params.timeOfDay !== 'string') {
      return false;
    }
    if (params.language && typeof params.language !== 'string') {
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
      category: 'content',
      tags: ['greeting', 'personalization', 'llm'],
      author: 'AI Workflow Team',
      docsUrl: 'https://docs.example.com/workflows/greeting-generator',
      requiredParams: ['name'],
      optionalParams: ['timeOfDay', 'language'],
      paramDefinitions: [
        {
          name: 'name',
          description: '问候对象的姓名',
          type: 'string',
          required: true,
          examples: ['张三', '李四'],
        },
        {
          name: 'timeOfDay',
          description: '问候时段',
          type: 'string',
          required: false,
          defaultValue: 'morning',
          examples: ['morning', 'afternoon', 'evening'],
        },
        {
          name: 'language',
          description: '问候语言',
          type: 'string',
          required: false,
          defaultValue: 'zh',
          examples: ['zh', 'en'],
        },
      ],
    };
  }
}

export const greetingGeneratorWorkflowFactory = new GreetingGeneratorWorkflowFactory();
export default new GreetingGeneratorWorkflowFactory();
