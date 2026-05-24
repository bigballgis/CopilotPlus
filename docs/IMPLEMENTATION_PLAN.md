# Copilot Plus — 实现计划

> **用法**：实现前读对应章节；每完成一项，更新 [STATUS.md](./STATUS.md) 中的状态。  
> **设计依据**：[DESIGN.md](./DESIGN.md)  
> **需求细节**：`.kiro/specs/copilot-plus-extension/requirements/`

---

## 工作流程（固定）

```
① 设计 — 读 Kiro 需求 (R-*)，对照 DESIGN.md 确认模块边界与接口，在 PLAN 中标记「进行中」
② 开发 — 写代码（最小正确 diff，匹配现有约定）
③ 测试 — npm run compile && npm run test:unit（必要时手动验收清单）
④ 审查 — 对照 R-* 验收标准自检；记录已知差距与后续项
⑤ 提交 — git commit + 更新 STATUS.md；未通过测试/审查不提交
```

**不会**在没有 DESIGN + PLAN 条目的情况下直接写功能代码。  
**不会**跳过测试或审查直接提交。

---

## Phase 0 — 项目基建 ✅

| ID | 交付物 | 状态 |
|----|--------|------|
| P0-1 | 扩展脚手架 package.json / esbuild / tsconfig | ✅ 完成 |
| P0-2 | 最小 activate 入口 + 版本门控占位 | ✅ 完成 |
| P0-3 | `.cursor/skills` 开发技能（14 个） | ✅ 完成 |
| P0-4 | `.cursor/rules` 开发规则（4 个） | ✅ 完成 |
| P0-5 | `resources/agents/` 默认 prompt（12 角色） | ✅ 完成 |
| P0-6 | `.copilotPlus/` 配置模板 | ✅ 完成 |
| P0-7 | `AGENTS.md` + `docs/DESIGN.md` + 本 PLAN | ✅ 完成 |
| P0-8 | `npm run compile` 通过 | ✅ 完成 |

---

## Phase 1 — M0 Platform（P0 阻塞项）

**目标**：扩展能安全激活、连上 Copilot、读配置。  
**预估**：~3–5 个 PR  
**开始前**：DESIGN §5.1 `ILanguageModelService` 接口落地

| 序号 | 需求 | 交付文件（计划） | 验收方式 | 状态 |
|------|------|------------------|----------|------|
| 1.1 | R-PLAT-1 | `src/platform/activation.ts`, manifest engines | F5 激活 <5s；旧版 VS Code 拒绝 | ✅ |
| 1.2 | R-PLAT-2 | `src/platform/copilotAuth.ts` | 无 Copilot 时 1s 内提示登录 | ✅ |
| 1.3 | R-PLAT-3 | `src/platform/modelService.ts` | 模型列表 + workspace 持久化 + 头部 picker | ✅ |
| 1.4 | R-PLAT-4 | `package.json` contributes 完整 settings | settings UI 可见全部 copilotPlus.* | ✅ |
| 1.5 | R-PLAT-6 | `src/platform/sensitiveFiles.ts` | .env 等不匹配进 context | ✅ |
| 1.6 | R-PLAT-10 | `src/platform/toolPermissions.ts` | allow/ask/deny 三级解析 | ✅ |
| 1.7 | R-PLAT-8 | `src/platform/errors.ts` | 离线/限流/重试 UI | ✅ |
| 1.8 | R-PLAT-7 | `src/platform/telemetry.ts` | 无内容字段；可关闭 | ✅ |
| 1.9 | R-PLAT-9 | `l10n/` bundle 骨架 | 无硬编码 UI 字符串 | ✅ |

**Phase 1 完成定义**：上述 1.1–1.6 为必须；1.7–1.9 可跟 M1 并行。

---

## Phase 2 — M1 Interaction Shell

**目标**：用户能看到完整工作区布局（可先 mock 数据）。  
**依赖**：Phase 1 的 1.1、1.4

| 序号 | 需求 | 交付物 | 状态 |
|------|------|--------|------|
| 2.1 | R-INT-1 | `copilotPlus.openWorkspace` 左右分栏 | ✅ |
| 2.2 | R-INT-2 | Conversation Pane webview + session 持久化 | ✅ React webview |
| 2.3 | R-INT-3 | Tab Workspace 五 Tab + 快捷键 | ✅ React webview |
| 2.4 | R-INT-9 | Control Console 各 section 骨架 | ✅ React 化 |
| 2.5 | R-INT-10 | Decision Notification 封装 | ✅ |
| 2.6 | R-INT-11 | Decision Center | ✅ |
| 2.7 | R-INT-4–8 | 各 Panel 最小可用 UI | ✅ |

---

## Phase 2.8 — UI Experience（可与 2.3–2.7 并行）

**目标**：统一 Webview 视觉与组件，对齐 VS Code 原生主题；不依赖 Copilot Chat 闭源 UI。  
**依赖**：Phase 2 的 Conversation / Tab Workspace React 骨架

| 序号 | 交付物 | 需求 | 状态 |
|------|--------|------|------|
| 2.8.1 | `webview-ui/shared/` 设计系统（theme、PanelShell、TabStrip、ActionBar） | R-PLAT-9 | ✅ |
| 2.8.2 | `@vscode/webview-ui-toolkit` + `@vscode/codicons` 接入 | R-PLAT-9 | ✅ |
| 2.8.3 | Conversation：消息气泡 + Markdown 渲染 + toolkit 控件 | R-INT-2 | ✅ |
| 2.8.4 | Tab Workspace：shared 组件 + 统一 Tab/Panel 样式 | R-INT-3 | ✅ |
| 2.8.5 | Control Console React 化 + 分组折叠 | R-INT-9 | ✅ |
| 2.8.6 | Task DAG / Doc 树可视化（对齐 R-INT-4/5/6） | R-INT-4–6 | ✅ |
| 2.8.7 | Conversation Continue + Step picker 控件 | R-WF-2.8–2.9 | ✅ |

---

## Phase 3 — M2 Document Tree

**依赖**：Phase 2 的 Requirement/Architecture Panel

| 序号 | 需求 | 核心交付 | 状态 |
|------|------|----------|------|
| 3.1 | R-DOCS-1,2 | frontmatter schema + 校验 | ✅ |
| 3.2 | R-DOCS-3,4 | 层级/横向链接图 | ✅ |
| 3.3 | R-DOCS-5,14 | Scope_Resolution + Layer_Walk | ✅ |
| 3.4 | R-DOCS-11 | code_ownership_index | ✅ |
| 3.5 | R-DOCS-12,13 | 一致性检查 + Drift_View | ✅ 静态诊断 + Sub-Agent Resolve + Diff Review |
| 3.6 | R-DOCS-6–10 | CRUD、命名、生命周期 | ✅ |

---

## Phase 4 — M3 Tools + Agents

| 序号 | 需求 | 核心交付 | 状态 |
|------|------|----------|------|
| 4.1 | R-TOOL-1–5 | Tool registry + 读/写/LSP | ✅ |
| 4.2 | R-TOOL-6–8 | code_search, doc_*, git | ✅ |
| 4.3 | R-AG-1–4 | Primary + 委派循环 | ✅ Design 委派 |
| 4.4 | R-AG-5–9 | Explorer, 背景 agent, replay | ✅ R-AG-8 验证 + R-AG-9 背景 Agent |

---

## Phase 5 — M4 Workflow

| 序号 | 需求 | 状态 |
|------|------|------|
| 5.1 | R-WF-1,2 Design 四步 | ✅ 委派 + 步骤持久化 + Continue/Step picker |
| 5.2 | R-WF-3 Task DAG + R-INT-4 面板控制 | ✅ 校验 + 并发 + Pause/Resume/Skip/Retry/Logs |
| 5.3 | R-WF-4 Build 六步 | ✅ Coder→Tester→Reviewer→Committer + Decision 同步门禁 |
| 5.4 | R-WF-7 Autonomy | ✅ Manual/Approve/Full_Auto + deny list + Console 选择器 |
| 5.5 | R-WF-8 Build 限额 | ✅ maxToolCalls / maxBuildDuration + Decision + Stop All |
| 5.6 | R-WF-9 Build isolation | ✅ worktree / branch + fallback + completion Decision + prune |

---

## Phase 6 — M5 Context / RAG

| 序号 | 需求 | 状态 |
|------|------|------|
| 6.1 | R-CTX-1 Mentions | ✅ 七类 + 25% 限额 + 预算确认 |
| 6.2 | R-CTX-2 Codebase Index | ✅ gitignore + 800/200 分块 + 增量更新 + 持久化 |
| 6.3 | R-CTX-3,6 RAG 混合检索 | ✅ BM25+RRF+rerank + doc 元数据 + rag.enabled 开关 |
| 6.4 | R-CTX-4,7,8 Budget / 摘要 / Tier | ✅ 优先级裁剪 + 摘要 + Tier 策略 |
| 6.5 | R-CTX-5 Embedding 三模式 | ✅ enterprise manifest + token_ids ONNX |

---

## Phase 7 — M6 Editing

| 序号 | 需求 | 状态 |
|------|------|------|
| 7.1 | R-EDIT-4 Diff Review UI | ✅ |
| 7.2 | R-EDIT-1 Inline Edit | ✅ |
| 7.3 | R-EDIT-5,6 Checkpoints | ✅ |
| 7.4 | R-EDIT-2,7 Tab / NES | ✅ |
| 7.5 | R-EDIT-3,8 Composer / Cache | ✅ Composer + Response Cache |

---

## Phase 8 — M7 Extensibility

| 序号 | 需求 | 状态 |
|------|------|------|
| 8.1 | R-EXT-1 Skills runtime | ✅ |
| 8.2 | R-EXT-2 MCP | ✅ stdio + HTTP/SSE + legacy GET/SSE |
| 8.3 | R-EXT-3 Hooks | ✅ |

---

## Phase 9 — M8 Deploy + Polish

| 序号 | 需求 | 状态 |
|------|------|------|
| 9.1 | R-DEP-1–6 部署全流程 | ✅ |
| 9.1b | R-DEP-7 CI CLI | ✅ headless 集成验证 |
| 9.2 | R-KNOW-1–6 记忆与反思 | ✅ 含 propose_memory 工具 |
| 9.3 | R-PLAT-5 性能预算 | ✅ 常量 + 超时配置 |
| 9.4 | 全量 i18n + a11y 审计 | ✅ |
| 9.5 | R-PLAT-11 Speculative 预取 | ✅ Tab + Scope 预热 |
| 9.6 | R-EDIT-8 Composer cache | ✅ |

---

## 状态图例

| 符号 | 含义 |
|------|------|
| ✅ | 已完成并验收 |
| 🔄 | 进行中 |
| ⬜ | 未开始 |
| ⏸ | 阻塞（见 STATUS 备注） |

---

## 你如何跟踪进度

1. **一眼看总览** → [STATUS.md](./STATUS.md)  
2. **看为什么这样建** → [DESIGN.md](./DESIGN.md)  
3. **看先做什么后做什么** → 本文档 Phase 顺序  
4. **看原始验收标准** → `.kiro/specs/.../requirements/`  

每次我完成一项工作，会**主动更新 STATUS.md** 并告知 Phase/序号。
