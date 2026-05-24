# Copilot Plus — 进度总览

> **最后更新**：2026-05-23  
> **当前阶段**：Phase 6 — Context / RAG  
> **本 session 下一项（功能）**：端到端 F5 验收 / 查漏补缺

---

## 总体进度

| Phase | 名称 | 进度 | 状态 |
|-------|------|------|------|
| 0–9 | 全部 Phase | — | ✅ 完成 |
| 2.8 | UI Experience | 2.8.1–2.8.7 | ✅ 完成 |
| 1 | Platform 补全 | 1.1–1.9 | ✅ 完成 |

**单元测试**：195/195 通过  
**需求覆盖率（粗算）**：~96%

---

## 本轮新增 ✅

| 模块 | 交付 | 需求 |
|------|------|------|
| Mentions 七类 | @file/folder/symbol/selection/doc/web/skill + 25% 限额 + 预算确认 | R-CTX-1 |
| Codebase Index | gitignore 过滤 + 语义/800 分块 + 增量 FS 更新 + 持久化加载 | R-CTX-2 |
| RAG 混合检索 | BM25+RRF(k=60)+rerank + 6/4 配额 + heading/link 元数据 + rag.enabled | R-CTX-3 / R-CTX-6 |
| Context Budget | 七级优先级裁剪 + Session cap + 摘要 80% 触发 + Tier M/L 策略 | R-CTX-4 / R-CTX-7 / R-CTX-8 |
| Platform 补全 | 授权失效取消请求 + Conversation/Tab 模型 picker + PLAN 同步 | R-PLAT-2 / R-PLAT-3 |
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
