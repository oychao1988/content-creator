# 内容生成工作流流程图

## 完整工作流图

```mermaid
graph TB
    Start([开始]) --> Input[输入主题/需求/约束]
    Input --> Search{SearchNode<br/>搜索资料}

    Search -->|Tavily API| Organize{OrganizeNode<br/>整理大纲}

    Organize -->|生成结构化信息| Write{WriteNode<br/>撰写内容}

    Write -->|DeepSeek LLM<br/>生成文章+图片提示词| CheckText{CheckTextNode<br/>文本质检}

    CheckText -->|硬规则检查<br/>+ LLM评估| TextDecision{文本质量检查}

    TextDecision -->|✅ 通过| GenerateImage{GenerateImageNode<br/>生成配图}
    TextDecision -->|❌ 不通过<br/>重试<3| WriteRetry[WriteNode<br/>重写内容]
    TextDecision -->|❌ 重试≥3| TextFail([文本生成失败])

    WriteRetry --> CheckText

    GenerateImage -->|Doubao API| CheckImage{CheckImageNode<br/>配图质检}

    CheckImage -->|质量评分| ImageDecision{图片质量检查}

    ImageDecision -->|✅ 通过| PostProcess{PostProcessNode<br/>后处理}
    ImageDecision -->|❌ 不通过<br/>重试<2| ImageRetry[GenerateImageNode<br/>重新生成]
    ImageDecision -->|❌ 重试≥2| ImageFail([配图生成失败])

    ImageRetry --> CheckImage

    PostProcess -->|图片占位符替换| Success([完成])
    TextFail --> End([结束])
    ImageFail --> End
    Success --> End

    style Start fill:#90EE90
    style Success fill:#90EE90
    style TextFail fill:#FFB6C1
    style ImageFail fill:#FFB6C1
    style End fill:#D3D3D3
    style TextDecision fill:#FFE4B5
    style ImageDecision fill:#FFE4B5
```

## 数据流图

```mermaid
graph LR
    subgraph 输入层
        A[主题] --> B[需求描述]
        C[硬约束] --> B
        B --> D[工作流状态]
    end

    subgraph 处理层
        D --> E[SearchNode]
        E --> F[搜索结果]
        F --> G[OrganizeNode]
        G --> H[结构化信息]
        H --> I[WriteNode]
        I --> J[文章内容]
        I --> K[图片提示词]
        J --> L[CheckTextNode]
        K --> M[GenerateImageNode]
        L --> N[文本质量报告]
        M --> O[CheckImageNode]
        O --> P[图片质量报告]
    end

    subgraph 输出层
        N --> Q[PostProcessNode]
        P --> Q
        Q --> R[最终内容]
        R --> S[保存结果]
    end

    style D fill:#E6F3FF
    style R fill:#E6F3FF
```

## 状态机图

```mermaid
stateDiagram-v2
    [*] --> 搜索: 启动工作流
    搜索 --> 整理: 搜索完成
    整理 --> 撰写: 大纲生成
    撰写 --> 文本质检: 内容生成
    文本质检 --> 撰写: 质检失败(重试<3)
    文本质检 --> 配图生成: 质检通过
    文本质检 --> [*]: 失败(重试≥3)

    配图生成 --> 配图质检: 图片生成
    配图质检 --> 配图生成: 质检失败(重试<2)
    配图质检 --> 后处理: 质检通过
    配图质检 --> [*]: 失败(重试≥2)

    后处理 --> [*]: 完成

    note right of 撰写
        DeepSeek LLM
        生成文章+提示词
        保存previousContent
    end note

    note right of 文本质检
        硬规则检查:
        - 字数范围
        - 关键词
        - 结构要求

        LLM评估:
        - 相关性
        - 连贯性
        - 完整性
        - 可读性
    end note

    note right of 配图生成
        Doubao API
        生成配图
        保存previousImages
    end note
```

## 节点详情图

```mermaid
graph TB
    subgraph "SearchNode - 搜索节点"
        S1[生成搜索关键词]
        S2[调用Tavily API]
        S3[返回搜索结果]
        S1 --> S2 --> S3
    end

    subgraph "OrganizeNode - 整理节点"
        O1[分析搜索结果]
        O2[生成文章大纲]
        O3[提取关键点]
        O4[生成摘要]
        O1 --> O2
        O1 --> O3
        O1 --> O4
    end

    subgraph "WriteNode - 撰写节点"
        W1[接收结构化信息]
        W2[调用DeepSeek LLM]
        W3[生成文章内容]
        W4[生成图片提示词]
        W5[保存previousContent]
        W1 --> W2 --> W3
        W2 --> W4
        W3 --> W5
    end

    subgraph "CheckTextNode - 文本质检节点"
        T1[硬规则检查]
        T2[LLM质量评估]
        T3[生成质检报告]
        T4[计算综合评分]
        T1 --> T3
        T2 --> T3
        T3 --> T4
    end

    subgraph "GenerateImageNode - 配图生成节点"
        I1[接收图片提示词]
        I2[调用Doubao API]
        I3[生成配图]
        I4[保存previousImages]
        I1 --> I2 --> I3 --> I4
    end

    subgraph "CheckImageNode - 配图质检节点"
        C1[检查图片质量]
        C2[检查相关性]
        C3[生成质检报告]
        C4[计算评分(1-10)]
        C1 --> C3
        C2 --> C3
        C3 --> C4
    end

    S3 --> O1
    O2 --> W1
    O3 --> W1
    O4 --> W1
    W3 --> T1
    W3 --> T2
    W4 --> I1
    I3 --> C1
    I3 --> C2
```

## 重试机制图

```mermaid
graph TB
    subgraph "文本质检重试流程"
        WT[WriteNode] --> WCT[CheckTextNode]
        WCT --> WT1{重试次数<3?}
        WT1 -->|是| WTR[WriteNode<br/>重写内容]
        WT1 -->|否| WTF[失败]
        WTR --> WCT
    end

    subgraph "配图质检重试流程"
        IT[GenerateImageNode] --> ICT[CheckImageNode]
        ICT --> IT1{重试次数<2?}
        IT1 -->|是| ITR[GenerateImageNode<br/>重新生成]
        IT1 -->|否| ITF[失败]
        ITR --> ICT
    end

    style WT fill:#FFE4B5
    style WTR fill:#FFE4B5
    style IT fill:#FFE4B5
    style ITR fill:#FFE4B5
    style WTF fill:#FFB6C1
    style ITF fill:#FFB6C1
```

## 检查点机制图

```mermaid
sequenceDiagram
    participant Client
    participant Executor
    participant Graph
    participant Node
    participant Checkpoint

    Client->>Executor: 启动工作流
    Executor->>Graph: 创建工作流图
    Graph->>Node: 执行节点1 (Search)
    Node->>Checkpoint: 保存状态1
    Checkpoint-->>Node: 已保存
    Node-->>Graph: 完成

    Graph->>Node: 执行节点2 (Organize)
    Node->>Checkpoint: 保存状态2
    Checkpoint-->>Node: 已保存
    Node-->>Graph: 完成

    Note over Graph,Checkpoint: 每个节点执行后<br/>自动保存检查点

    Graph->>Node: 执行节点N
    Note over Node: ❌ 崩溃

    Graph->>Checkpoint: 从检查点N-1恢复
    Checkpoint-->>Graph: 返回状态N-1
    Graph->>Node: 重新执行节点N
```

## 技术架构图

```mermaid
graph TB
    subgraph "表现层 Presentation"
        CLI[CLI命令<br/>workflow.ts]
    end

    subgraph "应用层 Application"
        Executor[SyncExecutor<br/>同步执行器]
        Registry[WorkflowRegistry<br/>工作流注册表]
    end

    subgraph "领域层 Domain"
        Graph[ContentCreatorGraph<br/>工作流图]
        Nodes[工作流节点<br/>6个节点]
        Routes[条件路由<br/>决策点]
    end

    subgraph "服务层 Services"
        LLM[LLM服务<br/>Claude/DeepSeek]
        Search[搜索服务<br/>Tavily API]
        Quality[质检服务<br/>硬规则+LLM]
        Image[图片服务<br/>Doubao API]
    end

    subgraph "基础设施层 Infrastructure"
        DB[(PostgreSQL<br/>检查点存储)]
        Cache[(缓存<br/>搜索结果)]
    end

    CLI --> Executor
    Executor --> Registry
    Registry --> Graph
    Graph --> Nodes
    Nodes --> Routes
    Nodes --> LLM
    Nodes --> Search
    Nodes --> Quality
    Nodes --> Image
    Graph --> DB
    Search --> Cache
    Executor --> DB

    style CLI fill:#E6F3FF
    style Graph fill:#FFE4B5
    style Nodes fill:#FFE4B5
    style LLM fill:#E6FFE6
    style DB fill:#FFE6E6
```

## 工作流状态数据结构

```mermaid
classDiagram
    class WorkflowState {
        +string taskId
        +string topic
        +string requirements
        +HardConstraints hardConstraints
        +SearchResultItem[] searchResults
        +OrganizedInfo organizedInfo
        +string articleContent
        +string[] imagePrompts
        +GeneratedImage[] images
        +QualityReport textQualityReport
        +QualityReport imageQualityReport
        +string currentStep
        +number textRetryCount
        +number imageRetryCount
    }

    class HardConstraints {
        +number minWords
        +number maxWords
        +string[] keywords
    }

    class OrganizedInfo {
        +string outline
        +string[] keyPoints
        +string summary
    }

    class QualityReport {
        +boolean passed
        +number score
        +string feedback
        +Details details
    }

    class GeneratedImage {
        +string url
        +string localPath
        +string prompt
    }

    WorkflowState --> HardConstraints
    WorkflowState --> OrganizedInfo
    WorkflowState --> QualityReport
    WorkflowState --> GeneratedImage
```

## 核心决策逻辑

```mermaid
graph TB
    start[开始决策] --> check{检查类型}

    check -->|文本质检| textCheck{硬规则通过?}
    textCheck -->|否| textHardFail[❌ 失败]
    textCheck -->|是| llmCheck{LLM评估通过?}

    llmCheck -->|否| textRetry{重试<3?}
    llmCheck -->|是| textPass[✅ 通过]

    textRetry -->|是| textRewrite[重写]
    textRetry -->|否| textHardFail

    textRewrite --> check

    check -->|图片质检| imageCheck{评分≥7?}
    imageCheck -->|否| imageRetry{重试<2?}
    imageCheck -->|是| imagePass[✅ 通过]

    imageRetry -->|是| imageRegen[重新生成]
    imageRetry -->|否| imageFail[❌ 失败]

    imageRegen --> check

    textPass --> next[下一步]
    imagePass --> next
    textHardFail --> end[结束]
    imageFail --> end

    style textPass fill:#90EE90
    style imagePass fill:#90EE90
    style textHardFail fill:#FFB6C1
    style imageFail fill:#FFB6C1
    style textRewrite fill:#FFE4B5
    style imageRegen fill:#FFE4B5
```

---

## 流程说明

### 主要节点

1. **SearchNode (搜索节点)**
   - 使用 Tavily API 搜索相关资料
   - 支持缓存机制
   - 生成结构化搜索结果

2. **OrganizeNode (整理节点)**
   - 分析搜索结果
   - 生成文章大纲、关键点和摘要
   - 为后续写作提供结构化信息

3. **WriteNode (撰写节点)**
   - 使用 DeepSeek LLM 生成文章内容
   - 同时生成配图提示词
   - 保存 previousContent 用于重写

4. **CheckTextNode (文本质检节点)**
   - 硬规则检查：字数、关键词、结构
   - LLM 质量评估：相关性、连贯性、完整性、可读性
   - 生成综合质检报告

5. **GenerateImageNode (配图生成节点)**
   - 使用 Doubao API 生成配图
   - 支持多张图片生成
   - 保存 previousImages 用于重新生成

6. **CheckImageNode (配图质检节点)**
   - 检查图片质量和相关性
   - 评分 1-10 分
   - 生成质检报告

### 决策点

1. **文本质检决策**
   - ✅ 通过 → 进入配图生成
   - ❌ 不通过且重试<3 → 重写内容
   - ❌ 不通过且重试≥3 → 失败

2. **配图质检决策**
   - ✅ 通过(评分≥7) → 进入后处理
   - ❌ 不通过且重试<2 → 重新生成
   - ❌ 不通过且重试≥2 → 失败

### 重试机制

- **文本质检重试**：最多 3 次
- **配图质检重试**：最多 2 次
- 每次重试都会基于前一次结果改进

### 检查点机制

- 每个节点执行后自动保存状态到 PostgreSQL
- 支持断点续传
- 崩溃后从最后一个检查点恢复
