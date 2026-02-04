/**
 * Test Helpers
 *
 * Mock implementations and test utilities for isolated testing
 */

import type { Task } from '../../src/domain/entities/Task.js';
import type {
  ITaskRepository,
  CreateTaskInput,
  TaskFilter,
  Pagination,
} from '../../src/domain/repositories/TaskRepository.js';
import type {
  IResultRepository,
  CreateResultParams,
  ResultRecord,
} from '../../src/domain/repositories/ResultRepository.js';
import { TaskStatus, ExecutionMode, TaskType, TaskPriority } from '../../src/domain/entities/Task.js';

/**
 * Mock Task Repository
 *
 * In-memory implementation for testing without database dependency
 */
export class MockTaskRepository implements ITaskRepository {
  private tasks: Map<string, Task> = new Map();

  /**
   * Create a task
   */
  async create(input: CreateTaskInput & Partial<Task>): Promise<Task> {
    const now = new Date();
    const taskId = input.id || this.generateId();

    const task: Task = {
      id: taskId,
      taskId: taskId,
      type: input.type as TaskType || TaskType.ARTICLE,
      status: input.status || TaskStatus.PENDING,
      priority: input.priority || TaskPriority.NORMAL,
      mode: input.mode,
      topic: input.topic,
      requirements: input.requirements,
      targetAudience: input.targetAudience || 'general',
      hardConstraints: input.hardConstraints,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      keywords: input.keywords,
      tone: input.tone,
      currentStep: input.currentStep,
      errorMessage: input.errorMessage,
      completedAt: input.completedAt,
      startedAt: input.startedAt,
      version: 1,
      textRetryCount: 0,
      imageRetryCount: 0,
      createdAt: input.createdAt || now,
      updatedAt: now,
    };

    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * Find task by ID
   */
  async findById(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Find task by idempotency key
   */
  async findByIdempotencyKey(idempotencyKey: string): Promise<Task | null> {
    for (const task of this.tasks.values()) {
      if (task.idempotencyKey === idempotencyKey) {
        return task;
      }
    }
    return null;
  }

  /**
   * Find tasks by user ID
   */
  async findByUserId(userId: string, pagination?: Pagination): Promise<Task[]> {
    const userTasks = Array.from(this.tasks.values()).filter(t => t.userId === userId);
    return this.applyPagination(userTasks, pagination);
  }

  /**
   * Find many tasks with filter and pagination
   */
  async findMany(filter?: TaskFilter, pagination?: Pagination): Promise<Task[]> {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      if (filter.userId) {
        tasks = tasks.filter(t => t.userId === filter.userId);
      }
      if (filter.status) {
        tasks = tasks.filter(t => t.status === filter.status);
      }
      if (filter.mode) {
        tasks = tasks.filter(t => t.mode === filter.mode);
      }
      if (filter.startDate) {
        tasks = tasks.filter(t => t.createdAt >= filter.startDate!);
      }
      if (filter.endDate) {
        tasks = tasks.filter(t => t.createdAt <= filter.endDate!);
      }
    }

    return this.applyPagination(tasks, pagination);
  }

  /**
   * Count tasks with filter
   */
  async count(filter?: TaskFilter): Promise<number> {
    const tasks = await this.findMany(filter);
    return tasks.length;
  }

  /**
   * Update task status (with optimistic locking)
   */
  async updateStatus(taskId: string, status: TaskStatus, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.version !== version) {
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      status,
      version: version + 1,
      updatedAt: now,
      ...(status === TaskStatus.RUNNING && { startedAt: now }),
      ...(status === TaskStatus.COMPLETED && { completedAt: now }),
      ...(status === TaskStatus.FAILED && { completedAt: now }),
      ...(status === TaskStatus.CANCELLED && { completedAt: now }),
    };

    this.tasks.set(taskId, updatedTask);
    return true;
  }

  /**
   * Update current step (with optimistic locking)
   */
  async updateCurrentStep(taskId: string, step: string, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.version !== version) {
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      currentStep: step,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    return true;
  }

  /**
   * Claim task for worker (optimistic locking)
   */
  async claimTask(taskId: string, workerId: string, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.version !== version || task.status !== TaskStatus.PENDING) {
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      status: TaskStatus.RUNNING,
      workerId,
      assignedWorkerId: workerId,
      startedAt: now,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    return true;
  }

  /**
   * Increment retry count (with optimistic locking)
   */
  async incrementRetryCount(
    taskId: string,
    type: 'text' | 'image',
    version: number
  ): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.version !== version) {
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      version: version + 1,
      updatedAt: now,
    };

    if (type === 'text') {
      updatedTask.textRetryCount = task.textRetryCount + 1;
    } else {
      updatedTask.imageRetryCount = task.imageRetryCount + 1;
    }

    this.tasks.set(taskId, updatedTask);
    return true;
  }

  /**
   * Save state snapshot (with optimistic locking)
   */
  async saveStateSnapshot(taskId: string, snapshot: object, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.version !== version) {
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      stateSnapshot: snapshot,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    return true;
  }

  /**
   * Mark task as completed (with optimistic locking)
   */
  async markAsCompleted(taskId: string, version: number): Promise<boolean> {
    return this.updateStatus(taskId, TaskStatus.COMPLETED, version);
  }

  /**
   * Mark task as failed (with optimistic locking)
   */
  async markAsFailed(taskId: string, errorMessage: string, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.version !== version) {
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      status: TaskStatus.FAILED,
      errorMessage,
      completedAt: now,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    return true;
  }

  /**
   * Release worker assignment
   */
  async releaseWorker(taskId: string, workerId: string, version: number): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task || task.version !== version || task.workerId !== workerId) {
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      workerId: undefined,
      assignedWorkerId: undefined,
      version: version + 1,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    return true;
  }

  /**
   * Soft delete task
   */
  async softDelete(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    const now = new Date();
    const updatedTask: Task = {
      ...task,
      deletedAt: now,
      updatedAt: now,
    };

    this.tasks.set(taskId, updatedTask);
    return true;
  }

  /**
   * Delete task permanently
   */
  async delete(taskId: string): Promise<boolean> {
    return this.tasks.delete(taskId);
  }

  /**
   * Get pending tasks
   */
  async getPendingTasks(limit?: number): Promise<Task[]> {
    const pendingTasks = Array.from(this.tasks.values())
      .filter(t => t.status === TaskStatus.PENDING)
      .sort((a, b) => {
        // Sort by priority descending, then by creation time ascending
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    return limit ? pendingTasks.slice(0, limit) : pendingTasks;
  }

  /**
   * Get active tasks by worker
   */
  async getActiveTasksByWorker(workerId: string): Promise<Task[]> {
    return Array.from(this.tasks.values()).filter(
      t => t.workerId === workerId && t.status === TaskStatus.RUNNING
    );
  }

  /**
   * Helper: Apply pagination
   */
  private applyPagination(tasks: Task[], pagination?: Pagination): Task[] {
    if (!pagination) {
      return tasks;
    }

    const { limit, offset = 0 } = pagination;
    return tasks.slice(offset, offset + (limit || tasks.length));
  }

  /**
   * Helper: Generate unique ID
   */
  private generateId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all tasks (for testing purposes)
   */
  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Clear all tasks (for testing purposes)
   */
  clear(): void {
    this.tasks.clear();
  }
}

/**
 * Mock Result Repository
 *
 * In-memory implementation for testing without database dependency
 */
export class MockResultRepository implements IResultRepository {
  private results: Map<number, ResultRecord> = new Map();
  private nextId = 1;
  private resultsByTask: Map<string, number[]> = new Map();

  /**
   * Create a result
   */
  async create(params: CreateResultParams): Promise<void> {
    const id = this.nextId++;
    const result: ResultRecord = {
      id,
      taskId: params.taskId,
      resultType: params.resultType,
      content: params.content || null,
      filePath: params.filePath || null,
      metadata: params.metadata || null,
      createdAt: new Date(),
    };

    this.results.set(id, result);

    // Update task index
    const taskResults = this.resultsByTask.get(params.taskId) || [];
    taskResults.push(id);
    this.resultsByTask.set(params.taskId, taskResults);
  }

  /**
   * Find results by task ID
   */
  async findByTaskId(taskId: string): Promise<ResultRecord[]> {
    const resultIds = this.resultsByTask.get(taskId) || [];
    return resultIds.map(id => this.results.get(id)!).filter(Boolean);
  }

  /**
   * Delete all results for a task
   */
  async deleteByTaskId(taskId: string): Promise<void> {
    const resultIds = this.resultsByTask.get(taskId) || [];
    resultIds.forEach(id => this.results.delete(id));
    this.resultsByTask.delete(taskId);
  }

  /**
   * Get all results (for testing purposes)
   */
  getAllResults(): ResultRecord[] {
    return Array.from(this.results.values());
  }

  /**
   * Clear all results (for testing purposes)
   */
  clear(): void {
    this.results.clear();
    this.resultsByTask.clear();
    this.nextId = 1;
  }
}

/**
 * Mock Redis Connection
 *
 * Simulates Redis connection for testing
 */
export class MockRedisConnection {
  private data: Map<string, string> = new Map();
  private connected = true;

  async set(key: string, value: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Redis connection closed');
    }
    this.data.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    if (!this.connected) {
      throw new Error('Redis connection closed');
    }
    return this.data.get(key) || null;
  }

  async del(key: string): Promise<void> {
    if (!this.connected) {
      throw new Error('Redis connection closed');
    }
    this.data.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    if (!this.connected) {
      throw new Error('Redis connection closed');
    }
    return this.data.has(key);
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.connected = false;
  }

  connect(): void {
    this.connected = true;
  }

  clear(): void {
    this.data.clear();
  }
}

/**
 * Test Data Factory
 *
 * Creates test data objects
 */
export class TestDataFactory {
  /**
   * Create a test task
   */
  static createTask(overrides: Partial<Task> = {}): Task {
    const now = new Date();
    const taskId = overrides.id || overrides.taskId || `test-task-${Date.now()}`;

    return {
      id: taskId,
      taskId: taskId,
      type: TaskType.ARTICLE,
      status: TaskStatus.PENDING,
      priority: TaskPriority.NORMAL,
      mode: ExecutionMode.SYNC,
      topic: 'Test Topic',
      requirements: 'Test Requirements',
      targetAudience: 'general',
      hardConstraints: {
        minWords: 100,
        maxWords: 500,
      },
      version: 1,
      textRetryCount: 0,
      imageRetryCount: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  /**
   * Create a test result
   */
  static createResult(overrides: Partial<ResultRecord> = {}): ResultRecord {
    const now = new Date();
    return {
      id: overrides.id || 1,
      taskId: overrides.taskId || 'test-task-id',
      resultType: overrides.resultType || 'article',
      content: overrides.content || 'Test content',
      filePath: overrides.filePath || null,
      metadata: overrides.metadata || null,
      createdAt: overrides.createdAt || now,
    };
  }

  /**
   * Create multiple test tasks
   */
  static createTasks(count: number, overrides: Partial<Task> = {}): Task[] {
    return Array.from({ length: count }, (_, i) =>
      this.createTask({
        ...overrides,
        id: `test-task-${i}`,
        taskId: `test-task-${i}`,
      })
    );
  }

  /**
   * Create a test task with custom ID
   */
  static createTaskWithId(taskId: string, overrides: Partial<Task> = {}): Task {
    return this.createTask({
      ...overrides,
      id: taskId,
      taskId: taskId,
    });
  }
}

/**
 * Test Environment Setup
 *
 * Utility functions to set up test environment
 */
export class TestEnvironment {
  private originalEnv: NodeJS.ProcessEnv;

  constructor() {
    this.originalEnv = { ...process.env };
  }

  /**
   * Set environment variable
   */
  setEnv(key: string, value: string): void {
    process.env[key] = value;
  }

  /**
   * Restore original environment
   */
  restoreEnv(): void {
    process.env = { ...this.originalEnv };
  }

  /**
   * Setup test environment with memory database
   */
  setupMemoryDatabase(): void {
    this.setEnv('DATABASE_TYPE', 'memory');
    this.setEnv('NODE_ENV', 'test');
  }

  /**
   * Cleanup test environment
   */
  cleanup(): void {
    this.restoreEnv();
  }
}

/**
 * Assertion Helpers
 *
 * Custom assertion functions for testing
 */
export class TestAssertions {
  /**
   * Assert task has correct status
   */
  static assertTaskStatus(task: Task, expectedStatus: TaskStatus): void {
    if (task.status !== expectedStatus) {
      throw new Error(
        `Expected task status to be ${expectedStatus}, but got ${task.status}`
      );
    }
  }

  /**
   * Assert task is completed
   */
  static assertTaskCompleted(task: Task): void {
    this.assertTaskStatus(task, TaskStatus.COMPLETED);
    if (!task.completedAt) {
      throw new Error('Expected task to have completedAt timestamp');
    }
  }

  /**
   * Assert task failed
   */
  static assertTaskFailed(task: Task): void {
    this.assertTaskStatus(task, TaskStatus.FAILED);
    if (!task.errorMessage) {
      throw new Error('Expected failed task to have errorMessage');
    }
  }

  /**
   * Assert result exists for task
   */
  static async assertResultExists(
    resultRepo: MockResultRepository,
    taskId: string
  ): Promise<void> {
    const results = await resultRepo.findByTaskId(taskId);
    if (results.length === 0) {
      throw new Error(`Expected at least one result for task ${taskId}`);
    }
  }
}

/**
 * Performance Test Helpers
 */
export class PerformanceTestHelpers {
  /**
   * Measure execution time of a function
   */
  static async measureTime<T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; durationMs: number }> {
    const start = Date.now();
    const result = await fn();
    const durationMs = Date.now() - start;
    return { result, durationMs };
  }

  /**
   * Assert function completes within time limit
   */
  static async assertCompletesWithin<T>(
    fn: () => Promise<T>,
    maxMs: number
  ): Promise<T> {
    const { result, durationMs } = await this.measureTime(fn);

    if (durationMs > maxMs) {
      throw new Error(
        `Function took ${durationMs}ms, but expected to complete within ${maxMs}ms`
      );
    }

    return result;
  }
}
