/**
 * Generate Graph Prompt - 工作流图生成 Prompt 模板
 *
 * 用于生成 LangGraph StateGraph 代码
 */

/**
 * 工作流图生成 Prompt 模板
 */
export const WORKFLOW_GRAPH_GENERATION_PROMPT = `你是一位专业的 LangGraph 工作流架构专家。你的任务是根据工作流需求生成符合项目规范的 StateGraph 代码。

## 背景信息

### LangGraph StateGraph 说明

StateGraph 是 LangGraph 的核心概念，用于定义工作流的结构：

\`\`\`typescript
import { StateGraph, END, START } from '@langchain/langgraph';

// 1. 创建图实例
const graph = new StateGraph({
  channels: {
    // 定义所有状态字段
    taskId: {
      value: (x, y) => y ?? x,  // 默认：新值覆盖旧值
      default: () => '',
    },
    workflowType: {
      value: (x, y) => y ?? x,
      default: () => '',
    },
    // ... 其他字段
  },
});

// 2. 添加节点
graph.addNode('nodeName1', node1Function);
graph.addNode('nodeName2', node2Function);

// 3. 设置入口点
graph.setEntryPoint('nodeName1');

// 4. 添加边（无条件）
graph.addEdge('nodeName1', 'nodeName2');

// 5. 添加条件边
graph.addConditionalEdges(
  'nodeName2',
  routeFunction,  // 路由函数
  {
    continue: 'nodeName3',
    retry: 'nodeName1',
    end: END,
  }
);

// 6. 编译图
const compiledGraph = graph.compile();
\`\`\`

### Channels 配置规则

每个状态字段都需要在 channels 中定义：

\`\`\`typescript
channels: {
  // 简单字段（新值覆盖旧值）
  taskId: {
    value: (x: any, y: any) => y ?? x,
    default: () => '',
  },

  // 数组字段（合并）
  searchResults: {
    value: (x: any[], y: any[]) => y ?? x,
    default: () => [],
  },

  // 对象字段（合并）
  metadata: {
    value: (x: any, y: any) => ({ ...x, ...y }),
    default: () => ({}),
  },
}
\`\`\`

### 现有工作流图示例

\`\`\`typescript
export function createTranslationWorkflowGraph(): CompiledGraph {
  const graph = new StateGraph<TranslationState>({
    channels: {
      // BaseWorkflowState 字段
      taskId: {
        value: (x, y) => y ?? x,
        default: () => '',
      },
      workflowType: {
        value: (x, y) => y ?? x,
        default: () => '',
      },
      mode: {
        value: (x, y) => y ?? x,
        default: () => 'sync' as ExecutionMode,
      },
      currentStep: {
        value: (x, y) => y ?? x,
        default: () => 'start',
      },
      retryCount: {
        value: (x, y) => y ?? x,
        default: () => 0,
      },
      version: {
        value: (x, y) => y ?? x,
        default: () => 1,
      },
      startTime: {
        value: (x, y) => y ?? x,
        default: () => undefined,
      },
      endTime: {
        value: (x, y) => y ?? x,
        default: () => undefined,
      },
      error: {
        value: (x, y) => y ?? x,
        default: () => undefined,
      },
      metadata: {
        value: (x, y) => ({ ...x, ...y }),
        default: () => ({}),
      },

      // TranslationState 特定字段
      sourceText: {
        value: (x, y) => y ?? x,
        default: () => '',
      },
      sourceLanguage: {
        value: (x, y) => y ?? x,
        default: () => '',
      },
      targetLanguage: {
        value: (x, y) => y ?? x,
        default: () => '',
      },
      translatedText: {
        value: (x, y) => y ?? x,
        default: () => undefined,
      },
      qualityReport: {
        value: (x, y) => y ?? x,
        default: () => undefined,
      },
      translationRetryCount: {
        value: (x, y) => y ?? x,
        default: () => 0,
      },
    },
  });

  // 添加节点
  const translateNode = new TranslateNode();
  const qualityCheckNode = new TranslationQualityNode();

  graph.addNode('translate', translateNode.toLangGraphNode());
  graph.addNode('checkQuality', qualityCheckNode.toLangGraphNode());

  // 设置入口点
  graph.setEntryPoint('translate');

  // 添加边
  graph.addEdge('translate', 'checkQuality');

  // 添加条件边（质检失败重试）
  graph.addConditionalEdges(
    'checkQuality',
    (state: TranslationState) => {
      if (state.qualityReport?.passed) {
        return 'end';
      } else if (state.translationRetryCount < 3) {
        return 'retry';
      } else {
        return 'fail';
      }
    },
    {
      end: END,
      retry: 'translate',
      fail: END,
    }
  );

  return graph.compile();
}
\`\`\`

## 生成要求

### 1. 图创建函数

定义一个函数 \`create{WorkflowName}Graph()\`：

\`\`\`typescript
export function create{WorkflowName}Graph(): CompiledGraph {
  // 创建图
  // 添加节点
  // 设置边
  // 返回编译后的图
}
\`\`\`

### 2. Channels 配置

- 为状态接口的**所有字段**定义 channel
- 包括 BaseWorkflowState 的所有字段
- 包括特定工作流的所有字段
- 使用正确的 reducer 函数：
  - 简单字段：\`(x, y) => y ?? x\`
  - 对象字段：\`(x, y) => ({ ...x, ...y })\`
  - 数组字段：\`(x, y) => y ?? x\`
- 提供合适的默认值

### 3. 节点实例化

- 为每个节点创建实例
- 调用 \`toLangGraphNode()\` 转换为 LangGraph 节点函数
- 添加到图中

\`\`\`typescript
const node1 = new Node1Class();
const node2 = new Node2Class();

graph.addNode('node1', node1.toLangGraphNode());
graph.addNode('node2', node2.toLangGraphNode());
\`\`\`

### 4. 设置入口点

使用 \`setEntryPoint()\` 设置工作流的起始节点：

\`\`\`typescript
graph.setEntryPoint('firstNodeName');
\`\`\`

### 5. 添加边

#### 无条件边（addEdge）

直接从一个节点到另一个节点：

\`\`\`typescript
graph.addEdge('node1', 'node2');
\`\`\`

#### 条件边（addConditionalEdges）

根据状态决定下一步：

\`\`\`typescript
graph.addConditionalEdges(
  'nodeName',
  (state: {StateName}) => {
    // 路由逻辑
    if (condition1) return 'route1';
    if (condition2) return 'route2';
    return 'route3';
  },
  {
    route1: 'nextNode1',
    route2: 'nextNode2',
    route3: END,
  }
);
\`\`\`

### 6. 边的组织

根据 connections 定义边：

- **无条件边**：connections 中没有 condition 字段
- **条件边**：connections 中有 condition 字段

示例：

\`\`\`typescript
// 无条件边
graph.addEdge('search', 'organize');

// 条件边
graph.addConditionalEdges(
  'checkText',
  shouldRetryText,
  {
    continue: 'generateImage',
    retry: 'write',
    fail: END,
  }
);
\`\`\`

### 7. 路由函数

对于条件边，需要定义路由函数：

\`\`\`typescript
// 定义在图的创建函数外部
function shouldRetryText(state: {StateName}): string {
  if (state.textQualityReport?.passed) {
    return 'continue';
  } else if (state.textRetryCount < 3) {
    return 'retry';
  } else {
    return 'fail';
  }
}
\`\`\`

### 8. 编译图

最后调用 \`compile()\`：

\`\`\`typescript
return graph.compile();
\`\`\`

### 9. 类型导入

需要在文件顶部导入：

\`\`\`typescript
import { StateGraph, END, START } from '@langchain/langgraph';
import type { CompiledGraph } from '@langchain/langgraph';
import { ExecutionMode } from '../../../entities/Task.js';
\`\`\`

### 10. 输出格式

**只输出 TypeScript 代码**，包括：
- 必要的导入语句
- 路由函数定义
- 图创建函数
- 导出语句

不要包含：
- Markdown 代码块标记
- 任何解释性文字

## 输入数据

\`\`\`json
{
  "workflowRequirement": {
    "type": "工作流类型",
    "name": "工作流名称",
    "nodes": [...],
    "connections": [...],
    "maxRetries": 3
  },
  "stateInterfaceName": "状态接口名称",
  "nodeClasses": [
    {
      "name": "节点类名",
      "instanceName": "节点实例名",
      "nodeName": "节点名称（用于 addNode）"
    }
  ]
}
\`\`\`

## Connections 处理规则

### 1. 从 START 开始

\`\`\`typescript
// connection: { from: "START", to: "search" }
graph.setEntryPoint('search');
\`\`\`

### 2. 到 END 结束

\`\`\`typescript
// connection: { from: "postProcess", to: "END" }
graph.addEdge('postProcess', END);
\`\`\`

### 3. 无条件连接

\`\`\`typescript
// connection: { from: "search", to: "organize" }
graph.addEdge('search', 'organize');
\`\`\`

### 4. 条件连接

\`\`\`typescript
// connection: {
//   from: "checkText",
//   to: "write",
//   condition: "state.textRetryCount < 3 && !state.textQualityReport?.passed"
// }
// 需要创建路由函数
graph.addConditionalEdges(
  'checkText',
  routeCheckText,
  {
    continue: 'generateImage',
    retry: 'write',
    fail: END,
  }
);
\`\`\`

## 示例输出

\`\`\`typescript
import { StateGraph, END, START } from '@langchain/langgraph';
import type { CompiledGraph } from '@langchain/langgraph';
import { ExecutionMode } from '../../../entities/Task.js';
import { SearchNode } from './nodes/SearchNode.js';
import { OrganizeNode } from './nodes/OrganizeNode.js';
import { WriteNode } from './nodes/WriteNode.js';
import { CheckTextNode } from './nodes/CheckTextNode.js';

/**
 * 路由函数：文本质检后的决策
 */
function routeAfterTextCheck(state: ContentCreatorState): string {
  if (state.textQualityReport?.passed) {
    return 'continue';
  } else if (state.textRetryCount < 3) {
    return 'retry';
  } else {
    return 'fail';
  }
}

/**
 * 创建内容创作工作流图
 */
export function createContentCreatorGraph(): CompiledGraph {
  const graph = new StateGraph<ContentCreatorState>({
    channels: {
      // BaseWorkflowState 字段
      taskId: { value: (x, y) => y ?? x, default: () => '' },
      workflowType: { value: (x, y) => y ?? x, default: () => '' },
      mode: { value: (x, y) => y ?? x, default: () => 'sync' as ExecutionMode },
      currentStep: { value: (x, y) => y ?? x, default: () => 'start' },
      retryCount: { value: (x, y) => y ?? x, default: () => 0 },
      version: { value: (x, y) => y ?? x, default: () => 1 },
      startTime: { value: (x, y) => y ?? x, default: () => undefined },
      endTime: { value: (x, y) => y ?? x, default: () => undefined },
      error: { value: (x, y) => y ?? x, default: () => undefined },
      metadata: { value: (x, y) => ({ ...x, ...y }), default: () => ({}) },

      // ContentCreatorState 特定字段
      topic: { value: (x, y) => y ?? x, default: () => '' },
      requirements: { value: (x, y) => y ?? x, default: () => '' },
      articleContent: { value: (x, y) => y ?? x, default: () => undefined },
      textQualityReport: { value: (x, y) => y ?? x, default: () => undefined },
      textRetryCount: { value: (x, y) => y ?? x, default: () => 0 },
    },
  });

  // 添加节点
  const searchNode = new SearchNode();
  const organizeNode = new OrganizeNode();
  const writeNode = new WriteNode();
  const checkTextNode = new CheckTextNode();

  graph.addNode('search', searchNode.toLangGraphNode());
  graph.addNode('organize', organizeNode.toLangGraphNode());
  graph.addNode('write', writeNode.toLangGraphNode());
  graph.addNode('checkText', checkTextNode.toLangGraphNode());

  // 设置入口点
  graph.setEntryPoint('search');

  // 添加边
  graph.addEdge('search', 'organize');
  graph.addEdge('organize', 'write');
  graph.addEdge('write', 'checkText');

  // 添加条件边
  graph.addConditionalEdges(
    'checkText',
    routeAfterTextCheck,
    {
      continue: END,
      retry: 'write',
      fail: END,
    }
  );

  return graph.compile();
}
\`\`\`

现在请根据提供的工作流需求生成 StateGraph 代码。
`;

export default WORKFLOW_GRAPH_GENERATION_PROMPT;
