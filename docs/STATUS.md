# Copilot Plus — 进度总览

> **最后更新**：2026-05-23  
> **当前阶段**：Polish / 后续增强  
> **下一项**：Tab Workspace / Control Console React 化（或 Multi-Agent Verification）

---

## 总体进度

| Phase | 名称 | 进度 | 状态 |
|-------|------|------|------|
| 0–9 | 全部 Phase | — | ✅ 完成 |

**单元测试**：119/119 通过  
**需求覆盖率（粗算）**：~96%

---

## 本轮新增 ✅

| 模块 | 交付 | 需求 |
|------|------|------|
| Conversation React | `webview-ui/` Vite+React + 消息协议 + 宿主 stateSync | R-INT-2 / R-PLAT-9 |
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
| 2026-05-23 | Conversation Pane React 化（webview-ui + Vite 构建 + stateSync 协议） |
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
