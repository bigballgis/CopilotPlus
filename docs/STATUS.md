# Copilot Plus — 进度总览

> **最后更新**：2026-05-23  
> **当前阶段**：查漏补缺 — F5 手动冒烟（Drift Agent 一致性 + Resolve）
> **本 session 下一项（功能）**：F5 手动冒烟（Committer 前 Reviewer 检查 + Decision 文档更新）

---

## F5 冒烟清单（手动）

| # | 步骤 | 预期 |
|---|------|------|
| 1 | `npm run compile && npm run verify:f5` | 全部 OK |
| 2 | F5 启动扩展 | 激活 < 5s，无报错通知 |
| 3 | Conversation 头部切换模型 | 下拉可见 Copilot 模型，切换后持久化 |
| 4 | Tab Workspace 头部切换模型 | 与 Conversation 同步 |
| 5 | Control Console 展开 | React 面板加载，索引/Skills 状态可见 |
| 6 | 发送 Design 消息 | 流式响应 + token 计数更新 |
| 7 | 模拟 Copilot 登出/ entitlement 丢失 | in-flight 请求取消，重新登录提示 |
| 8 | Control Console → Hierarchy | 一致性计数 + Drift 列表；Run consistency check |
| 9 | 状态栏 Drift 计数 | 点击打开 Drift View |
| 10 | Drift Resolve | Architect/Reviewer 委派 + Diff Review 接受后项清除 |
| 11 | Committer 前一致性 | Reviewer 带 git diff 返回 verdict；Doc_Update → Decision |
| 12 | Code_Mismatch | Problem 面板诊断 + `doc.drift.suspected` hook |
| 13 | 代码归属状态栏 | 聚焦代码文件时显示 System › Module › Feature › Component |

---

## 总体进度

| Phase | 名称 | 进度 | 状态 |
|-------|------|------|------|
| 0–9 | 全部 Phase | — | ✅ 完成 |
| 2.8 | UI Experience | 2.8.1–2.8.7 | ✅ 完成 |
| 1 | Platform 补全 | 1.1–1.9 | ✅ 完成 |

**单元测试**：215/215 通过  
**需求覆盖率（粗算）**：~97%

---

## 本轮新增 ✅

| 模块 | 交付 | 需求 |
|------|------|------|
| Mentions 七类 | @file/folder/symbol/selection/doc/web/skill + 25% 限额 + 预算确认 | R-CTX-1 |
| Codebase Index | gitignore 过滤 + 语义/800 分块 + 增量 FS 更新 + 持久化加载 | R-CTX-2 |
| RAG 混合检索 | BM25+RRF(k=60)+rerank + 6/4 配额 + heading/link 元数据 + rag.enabled | R-CTX-3 / R-CTX-6 |
| Context Budget | 七级优先级裁剪 + Session cap + 摘要 80% 触发 + Tier M/L 策略 | R-CTX-4 / R-CTX-7 / R-CTX-8 |
| Platform 补全 | 授权失效取消请求 + Conversation/Tab 模型 picker + PLAN 同步 | R-PLAT-2 / R-PLAT-3 |
| Drift / Consistency | 静态诊断 + Sub-Agent Resolve + 队列 + 持久化 + Console/状态栏 | R-DOCS-12 / R-DOCS-13 |
| Agent 一致性检查 | Reviewer/Architect 子代理 + verdict 解析 + Decision + Problem 面板 + Build 预算 | R-DOCS-12.3–12.8 |
| 代码归属 + 审阅提示 | 状态栏 Layer Walk + orphan hook + Sub-Agent 未审阅文档通知 | R-DOCS-10.5 / R-DOCS-11.5–11.6 |
| Review badge + 所有权状态栏 | 审查徽章计算 + Sub-Agent 未审阅提示 + 代码层级路径状态栏 | R-DOCS-10.4–10.5 / R-DOCS-11.6 |
| Build 限额 | 工具调用/时长上限 + Decision + Stop All + 限额显示 | R-WF-8 |
| Autonomy Levels | Manual Build/Deploy 全工具 Decision + deny list + Full_Auto Diff 绕过 + Control Console 选择器 | R-WF-7 |
| Build 六步流水线 | Coder/Tester/Reviewer/Committer + 3 轮测试 + Decision | R-WF-4 |
| Task DAG + Panel 控制 | scope 校验 + 诊断 + Pause/Resume/Skip/Retry/Logs + elapsed | R-WF-3 / R-INT-4 |
| Background Agent | 空闲检测 + 7 类任务 + 暂停/恢复 + Decision 队列 + Control Console 状态 | R-AG-9 |
| Design 工作流 Continue/Step picker | 产物完整性门禁 + 协议/命令 + 面板刷新 | R-WF-2.8–2.9 |
| UI 设计系统 Phase 2.8 | `webview-ui/shared` theme + toolkit + codicons + 消息气泡/Markdown | R-INT-2 / R-INT-3 / R-PLAT-9 |
| Control Console React | 折叠分组 + stateSync + toolkit 按钮 | R-INT-9 |
| Panel 可视化 | Task DAG + Architecture 图 + Requirement 预览 | R-INT-4–6 |
| Conversation 工作流控件 | Continue + Step picker + 步骤门禁提示 | R-WF-2.8–2.9 |
| Task Panel 执行控制 | Pause/Resume/Skip/Retry + 耗时 + 日志查看 | R-INT-4 |
| Multi-Agent Verification | N 路并行 + majority/arbiter/union + Decision 升级 + audit | R-AG-8 |
| Conversation React | `webview-ui/` Vite+React + 消息协议 + 宿主 stateSync | R-INT-2 / R-PLAT-9 |
| Tab Workspace React | 五 Tab React + snapshot 协议 + Composer/Build/Deploy 面板 | R-INT-3 |
| Primary 委派循环 | Design 四步分类 + Sub-Agent 委派 + 3 次失败 Decision | R-AG-1 / R-AG-3 / R-WF-2 |
| Speculative 预取 | Tab Completion 并发预取 + Scope RAG 预热 + 30s 持有 | R-PLAT-11 |
| Composer cache | Response Cache 接入 Composer 多文件编辑 | R-EDIT-8 |
| NES 委派 + 缓存 | delegate 模式状态 + Copilot 检测 + 外部编辑 cache 失效 | R-EDIT-7 / R-EDIT-8 |
| LSP symbol 失效 | 变更符号 references 文件批量 invalidation | R-EDIT-8.5(a) |
| MCP legacy SSE | GET 长连接 + endpoint 事件 + POST 消息 + pending 匹配 | R-EXT-2 |
| Response Cache 失效 | 文件 + LSP symbol references + Skills auto_attach | R-EDIT-8.5 |
| propose_memory 工具 | Sub-Agent 工具 + Decision 三路选项 | R-KNOW-3 |
| i18n + a11y | `l10n/bundle.l10n.json` + 全量 `t()` 迁移 + CI 审计 | R-PLAT-9 |
| MCP HTTP/SSE | POST JSON-RPC + SSE 解析 + Session-Id + legacy GET/SSE | R-EXT-2 |
| Response Cache | 1h TTL + rebase + LRU 100MB | R-EDIT-8 |
| CI headless 验证 | fixture + transcript 校验 + headless 脚本 | R-DEP-7 |
| Enterprise ONNX | manifest 驱动 token_ids + vocab bundle 下载 | R-CTX-5 |
| Knowledge / Memory | AGENTS 分层加载 + Session Memory + 反思 | R-KNOW |
| Performance budget | 激活/Inline/Tab 超时预算 | R-PLAT-5 |
| MCP 传输抽象 | `McpTransportClient` 统一 stdio/HTTP | R-EXT-2 |
| Local Embedding Runtime | hash 向量 + 可选 ONNX 推理路径 | R-CTX-5 |
| Addon Manifest | `manifest.json`（dimensions/runtime/input/output） | R-CTX-5 |
| Index 集成 | 修复 local 模式跳过 embedding 的 bug | R-CTX-5 |
| Hybrid 检索 | local 模式启用 dense + RRF | R-CTX-6 |
| code_search | local 模式 query embedding | R-TOOL-6 |

---

## 变更日志

| 日期 | 内容 |
|------|------|
| 2026-05-23 | R-DOCS-10.4–10.5 / R-DOCS-11.6 Review badge + 代码所有权状态栏（层级路径 + openOwningComponent + orphan hook） |
| 2026-05-23 | R-DOCS-10.5 / R-DOCS-11.5–11.6 代码归属状态栏 + orphan hook + Sub-Agent 未审阅文档提示 |
| 2026-05-23 | R-DOCS-12.3–12.8 Agent 一致性检查（Reviewer/Architect 刷新队列、verdict、Decision、Problem 面板、Build 预算 50） |
| 2026-05-23 | R-DOCS-12/13 Layer Consistency + Drift（静态诊断、队列、持久化、Console/状态栏、Committer/Background 触发） |
| 2026-05-23 | F5 验收脚本 + Control Console 构建链 + 冒烟清单（verify:f5） |
| 2026-05-23 | R-DOCS-12/13 Drift MVP（静态诊断 + drift_state 持久化 + Console Hierarchy + 状态栏） |
| 2026-05-23 | 查漏补缺：buildPipelineDecisions 模块补提交 + Deploy Decision 超时拒绝 + Task 控件/日志单测 |
| 2026-05-23 | R-PLAT-2/3 Platform 补全（授权失效取消请求 + 头部模型 picker + Phase 1 PLAN 同步） |
| 2026-05-23 | R-CTX-4/7/8 Context Budget + 摘要 + Tier 策略（优先级裁剪 + Session cap + Tier 显示） |
| 2026-05-23 | R-CTX-3/6 RAG 混合检索（RRF+rerank+doc 元数据+rag.enabled 代码索引保留） |
| 2026-05-23 | R-CTX-2 Codebase Index（gitignore + 语义分块 + 增量更新 + 持久化） |
| 2026-05-23 | R-CTX-1 Mentions（七类 + 预算限额 + 发送确认 + folder/web/symbol） |
| 2026-05-23 | R-WF-9 Build isolation（worktree + 完成 Decision + prune） |
| 2026-05-23 | R-WF-8 Build 限额（tool calls / duration + Decision + Stop All） |
| 2026-05-23 | R-WF-7 Autonomy Levels（阶段门禁 + deny list Decision + Full_Auto Diff + Console 选择器） |
| 2026-05-23 | Build 六步深化（Tester 重试 / Reviewer Blocked / Committer Decision） |
| 2026-05-23 | Phase 2.8.7 Conversation Continue/Step picker UI |
| 2026-05-23 | Phase 2.8.6 Panel 可视化（Task DAG + Architecture 图 + Requirement 预览） |
| 2026-05-23 | Task DAG 深化（校验/诊断/Blocked 传播/Build 完成 Deploy 提示） |
| 2026-05-23 | Multi-Agent Verification（并行候选 + 策略选择 + audit） |
| 2026-05-23 | Tab Workspace React 化（Task/Architecture/Requirement/Commit/Deploy） |
| 2026-05-23 | Control Console React 化（折叠分组 + stateSync + toolkit） |
| 2026-05-23 | Phase 2.8 UI：shared 设计系统 + toolkit/codicons + Conversation 气泡/Markdown + Tab 样式统一 |
| 2026-05-23 | Primary Agent Design 委派循环（四步分类 + Sub-Agent + Decision 重试） |
| 2026-05-23 | Speculative 预取（Tab + Scope 预热）+ Composer Response Cache |
| 2026-05-23 | NES 委派模式 + LSP symbol Response Cache 失效 |
| 2026-05-23 | MCP legacy GET/SSE 长连接（endpoint 事件 + POST 消息） |
| 2026-05-23 | Response Cache 失效接线（文件编辑 + Skills auto_attach） |
| 2026-05-23 | propose_memory 工具（Coder/Tester/Reviewer/Committer/Deployer） |
| 2026-05-23 | 全量 i18n（bundle.l10n.json）+ webview a11y 审计 |
| 2026-05-23 | Knowledge/Memory（AGENTS + Session + Reflection） |
| 2026-05-23 | 企业 ONNX 模型联调（manifest + vocab + token_ids 推理） |
| 2026-05-23 | CI headless 集成验证（fixtures + verify:ci-headless） |
| 2026-05-23 | Response Cache（exact + rebase + LRU） |
| 2026-05-23 | MCP HTTP/SSE 传输（POST + SSE + Session-Id） |
| 2026-05-23 | Mode B 本地 embedding（hash + 可选 ONNX） |
| 2026-05-23 | MCP stdio JSON-RPC 传输层 |
| 2026-05-23 | CI CLI (R-DEP-7) headless 子集 |
