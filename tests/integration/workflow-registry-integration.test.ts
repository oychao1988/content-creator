/**
 * WorkflowRegistry Integration Tests
 *
 * Tests the dynamic workflow registration and selection system
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkflowRegistry } from '../../src/domain/workflow/WorkflowRegistry.js';
import { contentCreatorWorkflowAdapter } from '../../src/domain/workflow/adapters/ContentCreatorWorkflowAdapter.js';
import type { BaseWorkflowState, WorkflowFactory } from '../../src/domain/workflow/index.js';

// Mock workflow adapter for testing
const mockWorkflowAdapter: WorkflowFactory = {
  type: 'mock-workflow',
  version: '1.0.0',
  name: 'Mock Workflow',
  description: 'A mock workflow for testing',
  tags: ['test', 'mock'],

  createGraph() {
    // Return a minimal mock graph
    return {
      invoke: async (state: BaseWorkflowState) => {
        return {
          ...state,
          currentStep: 'completed',
        };
      },
    } as any;
  },

  createState(params: any): BaseWorkflowState {
    return {
      taskId: params.taskId || 'test-task-id',
      mode: params.mode || 'sync',
      workflowType: 'mock-workflow',
      currentStep: 'start',
      retryCount: 0,
      version: 1,
      metadata: params,
    };
  },

  validateParams(params: any): boolean {
    return !!(params.taskId && params.mode);
  },

  getMetadata() {
    return {
      type: 'mock-workflow',
      version: '1.0.0',
      name: 'Mock Workflow',
      description: 'A mock workflow for testing',
      tags: ['test', 'mock'],
      requiredParams: ['taskId', 'mode'],
      optionalParams: [],
    };
  },
};

describe('WorkflowRegistry Integration Tests', () => {
  beforeEach(() => {
    // Clear registry before each test
    WorkflowRegistry.clear();
  });

  afterEach(() => {
    // Clean up after each test
    WorkflowRegistry.clear();
  });

  describe('Workflow Registration', () => {
    it('should register a workflow successfully', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);

      const workflows = WorkflowRegistry.list();
      expect(workflows).toHaveLength(1);
      expect(workflows[0].type).toBe('mock-workflow');
    });

    it('should register multiple workflows', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);

      const workflows = WorkflowRegistry.list();
      expect(workflows).toHaveLength(2);
    });

    it('should throw error when registering duplicate workflow type', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);

      expect(() => {
        WorkflowRegistry.register(mockWorkflowAdapter);
      }).toThrow('Workflow');
    });

    it('should prevent registering workflow with empty type', () => {
      const invalidAdapter = { ...mockWorkflowAdapter, type: '' };

      expect(() => {
        WorkflowRegistry.register(invalidAdapter as WorkflowFactory);
      }).toThrow();
    });
  });

  describe('Workflow Retrieval', () => {
    beforeEach(() => {
      WorkflowRegistry.register(mockWorkflowAdapter);
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);
    });

    it('should get a workflow by type', () => {
      const workflow = WorkflowRegistry.get('mock-workflow');
      expect(workflow).toBeDefined();
      expect(workflow.type).toBe('mock-workflow');
    });

    it('should throw error for unknown workflow type', () => {
      expect(() => {
        WorkflowRegistry.get('unknown-workflow');
      }).toThrow('Unknown workflow type: unknown-workflow');
    });

    it('should return undefined when checking for unknown workflow', () => {
      const workflow = WorkflowRegistry.getOptional('unknown-workflow');
      expect(workflow).toBeUndefined();
    });

    it('should get workflow by optional type', () => {
      const workflow = WorkflowRegistry.getOptional('mock-workflow');
      expect(workflow).toBeDefined();
      expect(workflow?.type).toBe('mock-workflow');
    });
  });

  describe('Workflow Listing', () => {
    beforeEach(() => {
      WorkflowRegistry.register(mockWorkflowAdapter);
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);
    });

    it('should list all registered workflows', () => {
      const workflows = WorkflowRegistry.list();
      expect(workflows).toHaveLength(2);
      expect(workflows.map((w) => w.type)).toContain('mock-workflow');
      expect(workflows.map((w) => w.type)).toContain('content-creator');
    });

    it('should filter workflows by tag', () => {
      const workflows = WorkflowRegistry.filterByTag('test');
      expect(workflows).toHaveLength(1);
      expect(workflows[0].type).toBe('mock-workflow');
    });

    it('should return empty array for non-existent tag', () => {
      const workflows = WorkflowRegistry.filterByTag('non-existent');
      expect(workflows).toHaveLength(0);
    });

    it('should return empty list when no workflows registered', () => {
      WorkflowRegistry.clear();
      const workflows = WorkflowRegistry.list();
      expect(workflows).toHaveLength(0);
    });
  });

  describe('Graph Creation', () => {
    beforeEach(() => {
      WorkflowRegistry.register(mockWorkflowAdapter);
    });

    it('should create a graph for registered workflow', () => {
      const graph = WorkflowRegistry.createGraph('mock-workflow');
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('should throw error when creating graph for unknown workflow', () => {
      expect(() => {
        WorkflowRegistry.createGraph('unknown-workflow');
      }).toThrow('Unknown workflow type: unknown-workflow');
    });

    it('should create independent graph instances', () => {
      const graph1 = WorkflowRegistry.createGraph('mock-workflow');
      const graph2 = WorkflowRegistry.createGraph('mock-workflow');

      expect(graph1).not.toBe(graph2);
    });
  });

  describe('State Creation', () => {
    beforeEach(() => {
      WorkflowRegistry.register(mockWorkflowAdapter);
    });

    it('should create state with valid parameters', () => {
      const params = {
        taskId: 'test-task-123',
        mode: 'sync' as const,
      };

      const state = WorkflowRegistry.createState('mock-workflow', params);

      expect(state).toBeDefined();
      expect(state.taskId).toBe('test-task-123');
      expect(state.mode).toBe('sync');
      expect(state.workflowType).toBe('mock-workflow');
    });

    it('should throw error when creating state for unknown workflow', () => {
      expect(() => {
        WorkflowRegistry.createState('unknown-workflow', { taskId: 'test', mode: 'sync' });
      }).toThrow('Unknown workflow type: unknown-workflow');
    });

    it('should include metadata in state', () => {
      const params = {
        taskId: 'test-task-123',
        mode: 'sync' as const,
        customField: 'custom-value',
      };

      const state = WorkflowRegistry.createState('mock-workflow', params);

      expect(state.metadata).toBeDefined();
      expect(state.metadata?.customField).toBe('custom-value');
    });
  });

  describe('Parameter Validation', () => {
    beforeEach(() => {
      WorkflowRegistry.register(mockWorkflowAdapter);
    });

    it('should validate correct parameters', () => {
      const params = {
        taskId: 'test-task-123',
        mode: 'sync' as const,
      };

      const isValid = WorkflowRegistry.validateParams('mock-workflow', params);
      expect(isValid).toBe(true);
    });

    it('should reject invalid parameters', () => {
      const params = {
        taskId: 'test-task-123',
        // missing required 'mode' field
      };

      const isValid = WorkflowRegistry.validateParams('mock-workflow', params);
      expect(isValid).toBe(false);
    });

    it('should throw error for unknown workflow type during validation', () => {
      expect(() => {
        WorkflowRegistry.validateParams('unknown-workflow', {});
      }).toThrow('Unknown workflow type: unknown-workflow');
    });
  });

  describe('Metadata Retrieval', () => {
    beforeEach(() => {
      WorkflowRegistry.register(mockWorkflowAdapter);
    });

    it('should get workflow metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('mock-workflow');

      expect(metadata).toBeDefined();
      expect(metadata.type).toBe('mock-workflow');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.name).toBe('Mock Workflow');
      expect(metadata.tags).toContain('test');
    });

    it('should throw error for unknown workflow metadata', () => {
      expect(() => {
        WorkflowRegistry.getMetadata('unknown-workflow');
      }).toThrow('Unknown workflow type: unknown-workflow');
    });
  });

  describe('Registry Management', () => {
    it('should clear all registered workflows', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);

      expect(WorkflowRegistry.list()).toHaveLength(2);

      WorkflowRegistry.clear();

      expect(WorkflowRegistry.list()).toHaveLength(0);
    });

    it('should check if workflow exists', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);

      expect(WorkflowRegistry.has('mock-workflow')).toBe(true);
      expect(WorkflowRegistry.has('unknown-workflow')).toBe(false);
    });

    it('should get count of registered workflows', () => {
      expect(WorkflowRegistry.count()).toBe(0);

      WorkflowRegistry.register(mockWorkflowAdapter);
      expect(WorkflowRegistry.count()).toBe(1);

      WorkflowRegistry.register(contentCreatorWorkflowAdapter);
      expect(WorkflowRegistry.count()).toBe(2);
    });

    it('should unregister a workflow', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);
      expect(WorkflowRegistry.has('mock-workflow')).toBe(true);

      WorkflowRegistry.unregister('mock-workflow');
      expect(WorkflowRegistry.has('mock-workflow')).toBe(false);
    });

    it('should throw error when unregistering non-existent workflow', () => {
      expect(() => {
        WorkflowRegistry.unregister('non-existent');
      }).toThrow('Workflow not registered: non-existent');
    });
  });

  describe('Integration with ContentCreatorWorkflowAdapter', () => {
    beforeEach(() => {
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);
    });

    it('should create content-creator workflow graph', () => {
      const graph = WorkflowRegistry.createGraph('content-creator');
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('should create content-creator workflow state', () => {
      const params = {
        taskId: 'test-task-123',
        mode: 'sync' as const,
        topic: 'Test Topic',
        requirements: 'Test Requirements',
      };

      const state = WorkflowRegistry.createState('content-creator', params);

      expect(state).toBeDefined();
      expect(state.taskId).toBe('test-task-123');
      expect(state.workflowType).toBe('content-creator');
      expect(state.mode).toBe('sync');
    });

    it('should validate content-creator parameters', () => {
      const validParams = {
        taskId: 'test-task-123',
        mode: 'sync' as const,
        topic: 'Test Topic',
        requirements: 'Test Requirements',
      };

      const isValid = WorkflowRegistry.validateParams('content-creator', validParams);
      expect(isValid).toBe(true);
    });

    it('should reject invalid content-creator parameters', () => {
      const invalidParams = {
        taskId: 'test-task-123',
        mode: 'sync' as const,
        // missing required 'topic' and 'requirements'
      };

      const isValid = WorkflowRegistry.validateParams('content-creator', invalidParams);
      expect(isValid).toBe(false);
    });

    it('should get content-creator metadata', () => {
      const metadata = WorkflowRegistry.getMetadata('content-creator');

      expect(metadata).toBeDefined();
      expect(metadata.type).toBe('content-creator');
      expect(metadata.name).toBe('Content Creator');
      expect(metadata.version).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should provide clear error messages for unknown workflow types', () => {
      try {
        WorkflowRegistry.get('unknown-workflow');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect((error as Error).message).toContain('unknown-workflow');
      }
    });

    it('should handle workflow creation failures gracefully', () => {
      // Create a broken adapter that throws during graph creation
      const brokenAdapter = {
        ...mockWorkflowAdapter,
        type: 'broken-workflow',
        createGraph: () => {
          throw new Error('Graph creation failed');
        },
      };

      WorkflowRegistry.register(brokenAdapter as WorkflowFactory);

      expect(() => {
        WorkflowRegistry.createGraph('broken-workflow');
      }).toThrow('Graph creation failed');
    });

    it('should handle state creation failures gracefully', () => {
      const brokenAdapter = {
        ...mockWorkflowAdapter,
        type: 'broken-state-workflow',
        createState: () => {
          throw new Error('State creation failed');
        },
      };

      WorkflowRegistry.register(brokenAdapter as WorkflowFactory);

      expect(() => {
        WorkflowRegistry.createState('broken-state-workflow', { taskId: 'test', mode: 'sync' });
      }).toThrow('State creation failed');
    });
  });

  describe('Type Safety', () => {
    it('should maintain type information through registry', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);

      const graph = WorkflowRegistry.createGraph('mock-workflow');
      const state = WorkflowRegistry.createState('mock-workflow', {
        taskId: 'test',
        mode: 'sync',
      });

      expect(graph).toBeDefined();
      expect(state).toBeDefined();
      expect(state.workflowType).toBe('mock-workflow');
    });

    it('should support generic state creation with type inference', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);

      const state = WorkflowRegistry.createState<BaseWorkflowState>('mock-workflow', {
        taskId: 'test',
        mode: 'sync',
      });

      expect(state.taskId).toBe('test');
      expect(state.mode).toBe('sync');
    });
  });

  describe('Real-world Scenarios', () => {
    it('should support dynamic workflow selection based on task type', () => {
      // Register multiple workflows
      WorkflowRegistry.register(mockWorkflowAdapter);
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);

      // Simulate different task types
      const taskTypes = ['mock-workflow', 'content-creator'];

      taskTypes.forEach((type) => {
        const graph = WorkflowRegistry.createGraph(type);
        expect(graph).toBeDefined();

        const metadata = WorkflowRegistry.getMetadata(type);
        expect(metadata.type).toBe(type);
      });
    });

    it('should support workflow discovery and listing', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);
      WorkflowRegistry.register(contentCreatorWorkflowAdapter);

      const allWorkflows = WorkflowRegistry.list();
      const testWorkflows = WorkflowRegistry.filterByTag('test');

      expect(allWorkflows.length).toBeGreaterThan(testWorkflows.length);
      expect(testWorkflows).toHaveLength(1);
    });

    it('should support conditional workflow execution', () => {
      WorkflowRegistry.register(mockWorkflowAdapter);

      const params = {
        taskId: 'test-task-123',
        mode: 'sync' as const,
      };

      // Validate before execution
      const isValid = WorkflowRegistry.validateParams('mock-workflow', params);
      expect(isValid).toBe(true);

      // Only create state and graph if validation passes
      if (isValid) {
        const state = WorkflowRegistry.createState('mock-workflow', params);
        const graph = WorkflowRegistry.createGraph('mock-workflow');

        expect(state).toBeDefined();
        expect(graph).toBeDefined();
      }
    });
  });
});
