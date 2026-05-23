# Copilot Plus — 进度总览

> **最后更新**：2026-05-23  
> **当前阶段**：Phase 6 🔄 · Phase 9 🔄  
> **下一项**：Mentions · Embedding Mode A/B · Auto Deploy 执行

---

## 总体进度

| Phase | 名称 | 进度 | 状态 |
|-------|------|------|------|
| 0 | 项目基建 | 8/8 | ✅ 完成 |
| 1 | M0 Platform | 9/9 | ✅ 完成 |
| 2 | M1 Interaction | 6/7 | 🔄 进行中 |
| 3 | M2 Document Tree | 5/6 | 🔄 进行中 |
| 4 | M3 Tools + Agents | 4/4 | ✅ 完成 |
| 5 | M4 Workflow | 4/4 | ✅ 完成 |
| 6 | M5 Context/RAG | 3/5 | 🔄 进行中 |
| 7 | M6 Editing | 3/5 | 🔄 进行中 |
| 8 | M7 Extensibility | 1/3 | 🔄 进行中 |
| 9 | M8 Deploy + Polish | 1/4 | 🔄 进行中 |

**单元测试**：32/32 通过  
**需求覆盖率（粗算）**：~60%

---

## 本轮新增 ✅

| 模块 | 交付 | 需求 |
|------|------|------|
| Codebase Index | BM25 稀疏索引 + 文件 watcher | R-CTX-2 |
| RAG Index | 文档树分块索引 | R-CTX-3 |
| Unified Retrieval | `code_search` RRF + 结构加权 + 配额 | R-CTX-6, R-TOOL-6 |
| Index Manager | Control Console 状态 + Rebuild | R-CTX-5 (Mode C) |
| Deploy Service | config.json + manifest 模板 + Deploy Tab | R-DEP-1, R-DEP-2 |

---

## 变更日志

| 日期 | 内容 |
|------|------|
| 2026-05-23 | RAG 稀疏索引 + unified code_search + Deploy 骨架 |
| 2026-05-23 | Explorer + LSP 后验 + Hooks + Rollback |
| 2026-05-23 | Sub-Agent 工具循环 + Build DAG 执行器 |
| 2026-05-23 | Document Tree CRUD + Tool Executor |
| 2026-05-23 | Phase 0–1 基建与 Platform |
