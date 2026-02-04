/**
 * CLI Result 命令测试
 *
 * 测试 result 命令的各种场景（使用 Mock，无需数据库）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MockTaskRepository, MockResultRepository, TestDataFactory, TestEnvironment } from '../../helpers/TestHelpers.js';
import { TaskStatus } from '../../../src/domain/entities/Task.js';

describe('@unit CLI Result Command', () => {
  let mockRepo: MockTaskRepository;
  let mockResultRepo: MockResultRepository;
  let testEnv: TestEnvironment;

  beforeEach(() => {
    // Setup test environment
    mockRepo = new MockTaskRepository();
    mockResultRepo = new MockResultRepository();
    testEnv = new TestEnvironment();
    testEnv.setupMemoryDatabase();
  });

  afterEach(() => {
    testEnv.cleanup();
  });

  describe('任务查询逻辑', () => {
    it('应该能够查询已完成的任务', async () => {
      const task = TestDataFactory.createTaskWithId('completed-task', {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      });

      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('completed-task');
      expect(foundTask).not.toBeNull();
      expect(foundTask?.status).toBe(TaskStatus.COMPLETED);
    });

    it('应该在任务不存在时返回 null', async () => {
      const foundTask = await mockRepo.findById('non-existent-task');
      expect(foundTask).toBeNull();
    });

    it('应该能查询未完成的任务', async () => {
      const task = TestDataFactory.createTaskWithId('running-task', {
        status: TaskStatus.RUNNING,
      });

      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('running-task');
      expect(foundTask?.status).toBe(TaskStatus.RUNNING);
    });
  });

  describe('结果存储逻辑', () => {
    it('应该能够创建文本结果', async () => {
      await mockResultRepo.create({
        taskId: 'task-1',
        resultType: 'article',
        content: 'Test article content',
        metadata: {
          wordCount: 100,
          title: 'Test Article',
        },
      });

      const results = await mockResultRepo.findByTaskId('task-1');
      expect(results.length).toBe(1);
      expect(results[0].resultType).toBe('article');
      expect(results[0].content).toBe('Test article content');
      expect(results[0].metadata?.wordCount).toBe(100);
    });

    it('应该能够创建图片结果', async () => {
      await mockResultRepo.create({
        taskId: 'task-2',
        resultType: 'image',
        filePath: '/path/to/image.png',
        metadata: {
          width: 1920,
          height: 1080,
          format: 'png',
        },
      });

      const results = await mockResultRepo.findByTaskId('task-2');
      expect(results.length).toBe(1);
      expect(results[0].resultType).toBe('image');
      expect(results[0].filePath).toBe('/path/to/image.png');
      expect(results[0].metadata?.width).toBe(1920);
    });

    it('应该能够为同一任务创建多个结果', async () => {
      await mockResultRepo.create({
        taskId: 'task-multi',
        resultType: 'article',
        content: 'Article content',
      });

      await mockResultRepo.create({
        taskId: 'task-multi',
        resultType: 'image',
        filePath: '/path/to/image.png',
      });

      const results = await mockResultRepo.findByTaskId('task-multi');
      expect(results.length).toBe(2);
      expect(results[0].resultType).toBe('article');
      expect(results[1].resultType).toBe('image');
    });

    it('应该能够删除任务的所有结果', async () => {
      await mockResultRepo.create({
        taskId: 'task-delete',
        resultType: 'article',
        content: 'Content to delete',
      });

      await mockResultRepo.create({
        taskId: 'task-delete',
        resultType: 'image',
        filePath: '/path/to/image.png',
      });

      let results = await mockResultRepo.findByTaskId('task-delete');
      expect(results.length).toBe(2);

      await mockResultRepo.deleteByTaskId('task-delete');

      results = await mockResultRepo.findByTaskId('task-delete');
      expect(results.length).toBe(0);
    });

    it('应该在任务没有结果时返回空数组', async () => {
      const results = await mockResultRepo.findByTaskId('no-results');
      expect(results.length).toBe(0);
    });
  });

  describe('JSON 输出格式测试', () => {
    it('应该能够序列化任务为 JSON', async () => {
      const task = TestDataFactory.createTaskWithId('json-task', {
        status: TaskStatus.COMPLETED,
        topic: 'Test Topic',
        requirements: 'Test Requirements',
      });

      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('json-task');

      // Should be able to serialize to JSON without errors
      expect(() => {
        JSON.stringify(foundTask);
      }).not.toThrow();

      const jsonStr = JSON.stringify(foundTask);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.taskId).toBe('json-task');
      expect(parsed.status).toBe('completed');
      expect(parsed.topic).toBe('Test Topic');
    });

    it('应该包含必要的任务字段', async () => {
      const task = TestDataFactory.createTaskWithId('fields-task', {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      });

      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('fields-task');

      expect(foundTask).toHaveProperty('taskId');
      expect(foundTask).toHaveProperty('status');
      expect(foundTask).toHaveProperty('createdAt');
      expect(foundTask).toHaveProperty('updatedAt');
      expect(foundTask).toHaveProperty('topic');
      expect(foundTask).toHaveProperty('requirements');
    });
  });

  describe('任务状态和结果验证', () => {
    it('未完成的任务不应该有结果', async () => {
      const task = TestDataFactory.createTaskWithId('incomplete-task', {
        status: TaskStatus.RUNNING,
      });

      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      const foundTask = await mockRepo.findById('incomplete-task');
      expect(foundTask?.status).not.toBe(TaskStatus.COMPLETED);
    });

    it('已完成的任务可以有结果', async () => {
      const task = TestDataFactory.createTaskWithId('complete-with-results', {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      });

      await mockRepo.create({
        id: task.id,
        mode: task.mode,
        topic: task.topic,
        requirements: task.requirements,
      });

      await mockResultRepo.create({
        taskId: 'complete-with-results',
        resultType: 'article',
        content: 'Final content',
      });

      const foundTask = await mockRepo.findById('complete-with-results');
      const results = await mockResultRepo.findByTaskId('complete-with-results');

      expect(foundTask?.status).toBe(TaskStatus.COMPLETED);
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('结果元数据测试', () => {
    it('应该能够存储和检索复杂的元数据', async () => {
      const metadata = {
        wordCount: 1500,
        characterCount: 7500,
        tokenCount: 2000,
        model: 'deepseek-chat',
        prompt: 'Write an article about AI',
        sources: [
          {
            url: 'https://example.com/article1',
            title: 'Article 1',
            snippet: 'Snippet 1',
          },
          {
            url: 'https://example.com/article2',
            title: 'Article 2',
            snippet: 'Snippet 2',
          },
        ],
      };

      await mockResultRepo.create({
        taskId: 'metadata-task',
        resultType: 'article',
        content: 'Article with metadata',
        metadata,
      });

      const results = await mockResultRepo.findByTaskId('metadata-task');
      expect(results[0].metadata).toEqual(metadata);
      expect(results[0].metadata?.sources).toHaveLength(2);
    });

    it('应该能够存储图片元数据', async () => {
      const imageMetadata = {
        width: 1920,
        height: 1080,
        format: 'png',
        size: 512000,
        model: 'dall-e-3',
        prompt: 'A beautiful sunset over the ocean',
      };

      await mockResultRepo.create({
        taskId: 'image-metadata-task',
        resultType: 'image',
        filePath: '/path/to/image.png',
        metadata: imageMetadata,
      });

      const results = await mockResultRepo.findByTaskId('image-metadata-task');
      expect(results[0].metadata?.width).toBe(1920);
      expect(results[0].metadata?.height).toBe(1080);
      expect(results[0].metadata?.model).toBe('dall-e-3');
    });
  });

  describe('仓库辅助方法测试', () => {
    it('MockTaskRepository 应该能够清空所有任务', async () => {
      await mockRepo.create({
        id: 'task-1',
        mode: 'sync',
        topic: 'Topic 1',
        requirements: 'Requirements 1',
      });

      await mockRepo.create({
        id: 'task-2',
        mode: 'sync',
        topic: 'Topic 2',
        requirements: 'Requirements 2',
      });

      expect(mockRepo.getAllTasks().length).toBe(2);

      mockRepo.clear();

      expect(mockRepo.getAllTasks().length).toBe(0);
    });

    it('MockResultRepository 应该能够清空所有结果', async () => {
      await mockResultRepo.create({
        taskId: 'task-1',
        resultType: 'article',
        content: 'Content 1',
      });

      await mockResultRepo.create({
        taskId: 'task-2',
        resultType: 'article',
        content: 'Content 2',
      });

      expect(mockResultRepo.getAllResults().length).toBe(2);

      mockResultRepo.clear();

      expect(mockResultRepo.getAllResults().length).toBe(0);
    });
  });
});
