# Copilot Plus — 架构设计

> **状态**：设计稿 v0.1（实现前评审）  
> **需求来源**：`.kiro/specs/copilot-plus-extension/`  
> **最后更新**：2026-05-23

本文档描述「怎么建」，不重复 Kiro 的「建什么」。实现前必须先对齐本文档；实现后更新 [STATUS.md](./STATUS.md)。

---

## 1. 设计原则

| 原则 | 含义 |
|------|------|
| 仅 Copilot | 所有 LLM 走 `vscode.lm`，vendor=`copilot`，无第三方 API Key |
| 结构优先于长上下文 | Layer_Walk（五层文档树）是主检索；RAG/索引是补充 |
| 用户设计、AI 执行 | Design 阶段对话；Build/Deploy 用面板 + Decision Notification |
| 可逆 | Diff Review → Checkpoint → 可选 git revert |
| 可观测 | Task Panel 全量 transcript；Telemetry 不含内容 |

---

## 2. 系统分层

```mermaid
flowchart TB
  subgraph UI["表现层 (INT)"]
    CP[Conversation Pane]
    TW[Tab Workspace]
    CC[Control Console]
    DR[Diff Review Overlay]
  end

  subgraph Orchestration["编排层 (WF + AG)"]
    PA[Primary Agent]
    SA[Sub-Agents]
    TDAG[Task DAG Executor]
  end

  subgraph Context["上下文层 (CTX + DOCS + KNOW)"]
    LW[Layer Walk]
    RAG[RAG / Code Index]
    MEN[@ Mentions]
    AGF[AGENTS.md + Session Memory]
  end

  subgraph Execution["执行层 (TOOL + EDIT)"]
    TR[Tool Registry]
    DIFF[Diff Review Pipeline]
    CKPT[Checkpoints]
  end

  subgraph Platform["平台层 (PLAT)"]
    LM[vscode.lm Client]
    CFG[Settings]
    PERM[Tool Permissions]
    TEL[Telemetry]
  end

  subgraph Ext["扩展层 (EXT)"]
    SK[Skills]
    MCP[MCP Servers]
    HK[Hooks]
  end

  CP --> PA
  TW --> TDAG
  CC --> CFG
  PA --> SA
  TDAG --> SA
  SA --> TR
  SA --> LW
  SA --> RAG
  TR --> DIFF
  DIFF --> CKPT
  SA --> LM
  SK --> SA
  MCP --> TR
  HK --> TDAG
```

---

## 3. 进程与包结构

### 3.1 Extension Host（Node / TypeScript）

```
src/
  extension.ts              # 入口：激活、模块 bootstrap
  platform/                 # PLAT
  interaction/              # INT — WebviewPanel / WebviewView 宿主
  editing/                  # EDIT
  context/                  # CTX
  docs/                     # DOCS
  workflow/                 # WF
  agents/                   # AG
  tools/                    # TOOL
  extensibility/            # EXT
  deployment/               # DEP
  knowledge/                # KNOW
  shared/                   # 类型、protocol、常量
```

**模块边界规则**：
- `platform` 不依赖 `agents` / `workflow`
- `tools` 不直接调用 `vscode.lm`（由 `agents` 编排）
- `interaction` 通过 message bus 与 `workflow` / `agents` 通信，不内嵌业务逻辑

### 3.2 Webview UI（React + Vite）

```
webview-ui/
  conversation/             # 左栏 Conversation Pane
  tabs/                       # 右栏五个 Tab
  control-console/            # Activity Bar
  shared/                     # 组件、主题、i18n
```

构建产物：`dist/webview/<panel>/index.html`，由 host 以 `asWebviewUri` 加载。

### 3.3 工作区产物（`.copilotPlus/`）

| 路径 | 用途 |
|------|------|
| `docs/` | 四层文档树（System→Component） |
| `agents/` | 用户覆盖的 agent prompt |
| `skills/` | 运行时 Skill（非 `.cursor/skills`） |
| `builds/<id>/` | Task DAG、transcript、forks |
| `sessions/` | Design 对话持久化 |
| `index/code|docs/` | 索引（gitignore） |
| `checkpoints/` | 回滚快照（gitignore） |
| `state.json` | Workflow stage、active session/build |

---

## 4. 核心数据流

### 4.1 Design 阶段：用户消息 → 文档

```
用户输入 (Conversation Pane)
  → Primary Agent 分类 Workflow Step
  → 委派 Sub-Agent (Clarifier / Architect / Designer / Planner)
  → doc_write / doc_link 工具
  → Diff Review UI
  → 用户 Accept → 写入 .copilotPlus/docs/
  → RAG Index 增量更新
```

### 4.2 Build 阶段：Task DAG 执行

```
tasks.json (scope_doc, agent, depends_on)
  → DAG Scheduler (最多 N 并发)
  → Sub-Agent 循环 (LM + tools)
  → Layer_Walk + Scope_Resolution 注入 system context
  → 文件变更 → Diff Review → Checkpoint
  → Tester → Reviewer → Committer
  → Decision Notification (需用户时)
  → Task Panel transcript 持久化
```

### 4.3 上下文组装（每次 LM 请求）

优先级（R-CTX-4.3 + R-DOCS-14）：

1. 显式 @mentions  
2. **Layer_Walk**  
3. 选区 / 当前文件  
4. RAG 检索  
5. Codebase 检索  
6. 历史对话（可 summarization）

超出 Token_Budget 按优先级丢弃，UI 展示 dropped 列表。

---

## 5. 关键接口（设计级）

### 5.1 `ILanguageModelService` (platform)

```typescript
interface ILanguageModelService {
  getChatModels(): Promise<vscode.LanguageModelChat[]>;
  sendChat(request: ChatRequest, token: CancellationToken): AsyncIterable<string>;
  getEmbeddingMode(): EmbeddingMode;
  getContextTier(model: vscode.LanguageModelChat): 'S' | 'M' | 'L';
}
```

### 5.2 `IContextAssembler` (context)

```typescript
interface IContextAssembler {
  assemble(input: AssembleInput): Promise<AssembledContext>; // 含 budget + dropped
}
```

### 5.3 `IToolExecutor` (tools)

```typescript
interface IToolExecutor {
  invoke(call: ToolCall, ctx: ToolContext): Promise<ToolResult>;
  resolvePermission(toolId: string, session: Session): ToolPermission;
}
```

### 5.4 `IAgentOrchestrator` (agents)

```typescript
interface IAgentOrchestrator {
  runPrimaryTurn(input: UserTurn): Promise<void>;
  runSubAgent(task: AgentTask): Promise<AgentRunResult>;
}
```

### 5.5 Host ↔ Webview 协议

见 `src/shared/protocol.ts`（随 INT 里程碑扩展为完整 union 类型）。

---

## 6. 技术选型

| 领域 | 选型 | 理由 |
|------|------|------|
| 宿主语言 | TypeScript strict | VS Code 生态标准 |
| 打包 | esbuild | 宿主单文件 bundle，启动快 |
| Webview | React 18 + Vite | 复杂 UI、组件复用 |
| 索引 BM25 | 自研或 flexsearch | 无外部 embedding API |
| Dense embedding | proposed_lm → ONNX local → sparse_only | R-CTX-5 |
| Reranker | 本地 cross-encoder 小模型（Phase 2+） | 离线可用 |
| 测试 | @vscode/test-cli | 官方扩展测试 |
| i18n | vscode.l10n | R-PLAT-9 要求 |

---

## 7. 分阶段交付策略

不「边想边写」，按 [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) 顺序交付。每阶段结束条件：

1. 该阶段所有 **P0 需求** 验收通过（见 PLAN 表）  
2. `STATUS.md` 已更新  
3. 关键路径有集成测试或手动验收清单  

**当前阶段**：Phase 0 基建 ✅ → **下一步 Phase 1：M0 Platform 设计评审通过后编码**

---

## 8. 风险与待定项

| 项 | 影响 | 决策 |
|----|------|------|
| `embeddings` proposed API | 企业 VSIX vs Marketplace 两套 manifest | 构建时用 channel flag 切换 |
| Webview 与宿主状态同步 | 复杂度高 | 单一 `WorkspaceStateService` 为 source of truth |
| RAG reranker 体积 | 扩展包大小 | 可选 add-on，与 embedding add-on 同模式 |
| Cmd+K 与 VS Code 默认快捷键冲突 | 用户体验 | 文档说明 + 可配置 keybinding |

---

## 9. 文档关系

```
.kiro/specs/          需求（WHAT）— 不可改，除非产品变更
docs/DESIGN.md        架构（HOW）— 本文档
docs/IMPLEMENTATION_PLAN.md  计划（WHEN/WHO）
docs/STATUS.md        进度（DONE/NOT）— 每次提交后更新
AGENTS.md             AI 协作约定
```
