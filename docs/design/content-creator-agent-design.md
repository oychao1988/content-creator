# ContentCreatorAgent 工作流设计

> **版本**: 1.0.0
> **创建日期**: 2026-02-03
> **状态**: 设计阶段，待实施
> **作者**: Oychao

---

## 概述

设计一个新的基于 LangChain/LangGraph **ReAct Agent** 的内容生成工作流，工作流类型为 `content-creator-agent`。该工作流将与现有的 `content-creator` 工作流并存，提供更灵活的 LLM 驱动工具选择能力。

---

## 一、架构设计

### 1.1 与现有架构的关系

```
┌─────────────────────────────────────────────────────────────────┐
│                    WorkflowRegistry                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────┐    ┌──────────────────────────┐  │
│  │  content-creator          │    │  content-creator-agent    │  │
│  │  (StateGraph 模式)        │    │  (ReAct Agent 模式)       │  │
│  │  - 确定性流程              │    │  - 智能工具选择           │  │
│  │  - 预定义节点链路          │    │  - LLM 动态决策           │  │
│  │  - 现有实现不变            │    │  - 新增实现               │  │
│  └──────────────────────────┘    └──────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 Agent 模式设计

```
                    ┌─────────────────────────────────┐
                    │      ReAct Agent                 │
                    │  (LLM + Tool Executor)           │
                    └─────────────────┬───────────────┘
                                      │
                      ┌───────────────┼───────────────┐
                      │               │               │
                      ▼               ▼               ▼
               ┌──────────┐    ┌──────────┐    ┌──────────┐
               │  Search  │    │  Write   │    │  Image   │
               │  Tool    │    │  Tool    │    │  Tool    │
               └──────────┘    └──────────┘    └──────────┘
```

---

## 二、文件结构

### 新增文件

```
src/domain/workflow/
├── tools/                                    # NEW: 工具目录
│   ├── index.ts                              # 工具导出
│   ├── SearchTool.ts                         # 搜索工具
│   ├── WriteTool.ts                          # 写作工具
│   └── ImageGenerationTool.ts                # 图片生成工具
│
└── ContentCreatorAgentWorkflow.ts            # NEW: Agent 工作流
```

### 修改文件

```
package.json                                  # 升级依赖
src/domain/workflow/initialize.ts             # 注册 Agent 工作流
src/config/index.ts                           # 添加 Agent 配置
src/presentation/cli/index.ts                 # CLI 支持
CLAUDE.md                                     # 文档更新
```

---

## 三、依赖升级

### 3.1 package.json 更新

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.18",
    "@langchain/langgraph": "^0.2.28",
    "zod": "^4.3.5"
  }
}
```

**执行命令：**
```bash
pnpm add @langchain/core@^0.3.18 @langchain/langgraph@^0.2.28
```

---

## 四、实施步骤

### 步骤 1：创建工具（Tools）

#### SearchTool.ts

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { searchService } from '../../../services/search/SearchService.js';

export const searchTool = tool(
  async ({ query, maxResults }: { query: string; maxResults?: number }) => {
    const response = await searchService.searchWithAnswer(
      query,
      maxResults || 10
    );

    return JSON.stringify({
      query,
      resultCount: response.results.length,
      answer: response.answer,
      results: response.results.slice(0, 5).map(r => ({
        title: r.title,
        url: r.url,
        content: r.content.substring(0, 300)
      }))
    }, null, 2);
  },
  {
    name: 'search_content',
    description: '搜索网络信息，用于收集背景资料和参考内容',
    schema: z.object({
      query: z.string().describe('搜索查询词'),
      maxResults: z.number().optional().default(10).describe('最大结果数'),
    }),
  }
);
```

#### WriteTool.ts

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { LLMServiceFactory } from '../../../services/llm/LLMServiceFactory.js';
import { PromptLoader } from '../../prompts/PromptLoader.js';

export const writeTool = tool(
  async ({ topic, requirements, context, metadata }: {
    topic: string;
    requirements: string;
    context?: string;
    metadata?: Record<string, any>;
  }) => {
    const llmService = LLMServiceFactory.create();
    const systemPrompt = await PromptLoader.load('content-creator/write.md');

    const userPrompt = `
主题：${topic}
要求：${requirements}
${context ? `参考资料：\n${context}` : ''}

请基于以上信息撰写文章内容，包含标题、正文，以及配图提示词列表。
输出格式：{"articleContent":"...","imagePrompts":["...","..."]}
`;

    const result = await llmService.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      stream: true,
    });

    return result.content;
  },
  {
    name: 'write_content',
    description: '基于主题和要求撰写文章内容，支持根据搜索结果进行创作',
    schema: z.object({
      topic: z.string().describe('文章主题'),
      requirements: z.string().describe('写作要求'),
      context: z.string().optional().describe('参考资料（来自搜索）'),
      metadata: z.record(z.any()).optional().describe('额外元数据'),
    }),
  }
);
```

#### ImageGenerationTool.ts

```typescript
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import type { GeneratedImage } from '../State.js';

export const generateImageTool = tool(
  async ({ prompts, size }: { prompts: string[]; size?: string }) => {
    // 与现有图片生成服务集成
    const images: GeneratedImage[] = [];

    for (const prompt of prompts) {
      // 调用图片生成 API
      images.push({
        url: `https://example.com/generated/${Date.now()}.png`,
        prompt,
        width: parseInt(size?.split('x')[0] || '1024'),
        height: parseInt(size?.split('x')[1] || '1024'),
      });
    }

    return JSON.stringify({
      images,
      count: images.length
    }, null, 2);
  },
  {
    name: 'generate_images',
    description: '根据描述生成配图',
    schema: z.object({
      prompts: z.array(z.string()).describe('图片描述列表'),
      size: z.string().optional().default('1024x1024').describe('图片尺寸'),
    }),
  }
);
```

---

### 步骤 2：创建 Agent 工作流

#### ContentCreatorAgentWorkflow.ts

```typescript
import { createReactAgent } from '@langchain/langgraph';
import type {
  WorkflowFactory,
  WorkflowGraph,
  WorkflowParams,
  WorkflowMetadata,
} from './WorkflowRegistry.js';
import type { BaseWorkflowState } from './BaseWorkflowState.js';
import { WorkflowStateFactory } from './BaseWorkflowState.js';
import { LLMServiceFactory } from '../../services/llm/LLMServiceFactory.js';
import { searchTool, writeTool, generateImageTool } from './tools/index.js';
import { createLogger } from '../../infrastructure/logging/logger.js';

const logger = createLogger('ContentCreatorAgent');

/**
 * Agent 状态定义
 */
export interface AgentState extends BaseWorkflowState {
  topic: string;
  requirements: string;
  agentMessages: Array<{ role: string; content: string }>;
  searchResults?: any;
  articleContent?: string;
  images?: any[];
}

/**
 * ContentCreatorAgent Workflow
 * 基于 LangGraph ReAct Agent 实现
 */
export class ContentCreatorAgentWorkflow implements WorkflowFactory<AgentState> {
  readonly type = 'content-creator-agent';
  readonly version = '1.0.0';
  readonly name = 'Content Creator Agent';
  readonly description = 'AI Agent-powered content creation using LangChain ReAct pattern';

  createGraph(): WorkflowGraph {
    logger.info('Creating content-creator-agent workflow graph');

    // 创建 LLM 绑定（兼容 LangChain 接口）
    const llm = this.createLangChainCompatibleLLM();

    // 定义工具集
    const tools = [searchTool, writeTool, generateImageTool];

    // System Prompt
    const systemPrompt = `你是一个专业的内容创作助手。你的任务是根据用户需求创建高质量的内容。

可用工具：
1. search_content - 搜索网络信息，收集背景资料
2. write_content - 撰写文章内容
3. generate_images - 生成配图

工作流程：
1. 首先使用 search_content 搜索相关信息
2. 然后使用 write_content 基于搜索结果撰写文章
3. 最后使用 generate_images 生成配图

请确保内容准确、有深度，并引用可靠来源。`;

    // 创建 ReAct Agent
    const agent = createReactAgent({
      llm,
      tools,
      prompt: systemPrompt,
    });

    logger.info('Content-creator-agent workflow graph created');
    return agent;
  }

  private createLangChainCompatibleLLM() {
    const llmService = LLMServiceFactory.create();

    return {
      invoke: async (messages: any[]) => {
        const result = await llmService.chat({
          messages: messages.map((m: any) => ({
            role: m.role,
            content: m.content
          })),
          stream: true,
        });

        return {
          content: result.content,
          usage: result.usage
        };
      },
      bind: (tools: any[]) => {
        return this.createLangChainCompatibleLLM();
      }
    };
  }

  createState(params: WorkflowParams & {
    topic: string;
    requirements: string;
    imageSize?: string;
  }): AgentState {
    const baseState = WorkflowStateFactory.createBaseState({
      taskId: params.taskId,
      workflowType: this.type,
      mode: params.mode,
    });

    return WorkflowStateFactory.extendState<AgentState>(baseState, {
      topic: params.topic,
      requirements: params.requirements,
      agentMessages: [
        {
          role: 'user',
          content: `请帮我创建关于"${params.topic}"的内容。\n\n要求：${params.requirements}`
        }
      ],
    });
  }

  validateParams(params: WorkflowParams): boolean {
    return !!(
      params.taskId &&
      (params as any).topic &&
      (params as any).requirements
    );
  }

  getMetadata(): WorkflowMetadata {
    return {
      type: this.type,
      version: this.version,
      name: this.name,
      description: this.description,
      category: 'content',
      tags: ['agent', 'content-creation', 'react', 'langchain', 'ai'],
      icon: '🤖',
      requiredParams: ['taskId', 'mode', 'topic', 'requirements'],
      optionalParams: ['imageSize', 'targetAudience', 'tone'],
      examples: [
        {
          name: 'Agent 模式示例',
          description: '使用 Agent 智能创建内容',
          params: {
            taskId: 'agent-001',
            mode: 'sync',
            topic: '量子计算原理',
            requirements: '写一篇 1500 字的科普文章',
          },
        },
      ],
      paramDefinitions: [
        {
          name: 'topic',
          description: '文章主题',
          type: 'string',
          required: true,
        },
        {
          name: 'requirements',
          description: '创作要求',
          type: 'string',
          required: true,
        },
      ],
    };
  }
}

export const contentCreatorAgentWorkflow = new ContentCreatorAgentWorkflow();
```

---

### 步骤 3：注册工作流

**文件：** `src/domain/workflow/initialize.ts`

```typescript
import { contentCreatorAgentWorkflow } from './ContentCreatorAgentWorkflow.js';

export function initializeWorkflows(): void {
  // 现有注册
  WorkflowRegistry.register(contentCreatorWorkflowAdapter);
  WorkflowRegistry.register(translationWorkflowFactory);

  // 新增：Agent 工作流
  WorkflowRegistry.register(contentCreatorAgentWorkflow);

  WorkflowRegistry.markInitialized();
}
```

---

### 步骤 4：CLI 集成

**文件：** `src/presentation/cli/index.ts`

```typescript
const workflowOptions = [
  { value: 'content-creator', description: '传统工作流（StateGraph）' },
  { value: 'content-creator-agent', description: 'Agent 工作流（ReAct）' },
  { value: 'translation', description: '翻译工作流' },
];
```

---

### 步骤 5：配置更新

**文件：** `src/config/index.ts`

```typescript
export const config = z.object({
  // ... 现有配置

  agent: z.object({
    enabled: z.boolean().default(false),
    maxIterations: z.number().default(10),
    timeout: z.number().default(300000),
  }).optional().default({}),
}).parse(process.env);
```

---

## 五、使用方式

### 5.1 CLI 命令

```bash
# 使用 Agent 工作流
pnpm run cli create --type content-creator-agent --topic "AI技术" --requirements "写一篇科普文章"

# 使用传统工作流
pnpm run cli create --type content-creator --topic "AI技术" --requirements "写一篇科普文章"
```

### 5.2 编程方式

```typescript
import { WorkflowRegistry } from './domain/workflow/index.js';

const workflow = WorkflowRegistry.get('content-creator-agent');
const graph = workflow.createGraph();
const state = workflow.createState({
  taskId: 'task-001',
  mode: 'sync',
  topic: '量子计算',
  requirements: '1500字科普文章',
});

const result = await graph.invoke(state);
```

---

## 六、关键文件清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `package.json` | 修改 | 升级 LangChain 依赖 |
| `src/domain/workflow/tools/SearchTool.ts` | 新增 | 搜索工具 |
| `src/domain/workflow/tools/WriteTool.ts` | 新增 | 写作工具 |
| `src/domain/workflow/tools/ImageGenerationTool.ts` | 新增 | 图片工具 |
| `src/domain/workflow/tools/index.ts` | 新增 | 工具导出 |
| `src/domain/workflow/ContentCreatorAgentWorkflow.ts` | 新增 | Agent 工作流 |
| `src/domain/workflow/initialize.ts` | 修改 | 注册工作流 |
| `src/presentation/cli/index.ts` | 修改 | CLI 支持 |
| `src/config/index.ts` | 修改 | 添加配置 |
| `CLAUDE.md` | 修改 | 文档更新 |

---

## 七、测试验证

### 7.1 单元测试

创建 `tests/workflow/tools/` 目录下的测试文件。

### 7.2 集成测试

```typescript
describe('ContentCreatorAgent Workflow', () => {
  it('should create content using Agent', async () => {
    const workflow = new ContentCreatorAgentWorkflow();
    const graph = workflow.createGraph();
    const state = workflow.createState({
      taskId: 'test-001',
      mode: 'sync',
      topic: 'AI',
      requirements: 'Write article',
    });

    const result = await graph.invoke(state);
    expect(result.articleContent).toBeTruthy();
  });
});
```

### 7.3 手动测试

```bash
pnpm install
pnpm test
pnpm run cli create --type content-creator-agent --topic "测试" --requirements "测试内容"
```

---

## 八、注意事项

1. **LLM 兼容性**：需要创建适配器将 `ILLMService` 包装为 LangChain 兼容接口
2. **状态管理**：Agent 状态可能与 WorkflowState 不同，需要映射
3. **工具执行**：工具需要能够访问当前工作流状态
4. **向后兼容**：保持现有 `content-creator` 工作流不变
5. **性能监控**：Agent 可能需要更多 LLM 调用，注意成本控制

---

## 九、优势对比

| 特性 | StateGraph | ReAct Agent |
|------|-----------|-------------|
| 执行流程 | 预定义线性流程 | LLM 动态决策 |
| 灵活性 | 固定节点顺序 | 智能工具选择 |
| 可预测性 | 高 | 中等 |
| LLM 调用次数 | 固定 | 动态 |
| 调试难度 | 低 | 中等 |
| 适用场景 | 标准化流程 | 复杂决策场景 |

---

## 十、实施时间估算

| 阶段 | 任务 | 预估时间 |
|------|------|---------|
| 1 | 依赖升级 | 0.5 天 |
| 2 | 创建工具 | 1 天 |
| 3 | Agent 工作流实现 | 2 天 |
| 4 | 注册与集成 | 0.5 天 |
| 5 | 测试验证 | 1 天 |
| **总计** | | **~5 天** |

---

## 十一、后续扩展

1. **更多工具**：添加质检工具、优化工具等
2. **多 Agent 协作**：实现多 Agent 分工协作模式
3. **记忆机制**：添加长期记忆存储
4. **性能优化**：缓存和 Token 优化
