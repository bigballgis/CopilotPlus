# Copilot Plus — 进度总览

> **最后更新**：2026-05-23  
> **当前阶段**：Polish / 后续增强  
> **下一项**：Phase 9 Polish（R-KNOW / R-PLAT-5 / i18n）

---

## 总体进度

| Phase | 名称 | 进度 | 状态 |
|-------|------|------|------|
| 0–9 | 全部 Phase | — | ✅ 完成 |

**单元测试**：81/81 通过（含 CI headless + ONNX add-on fixture 校验）  
**需求覆盖率（粗算）**：~89%

---

## 本轮新增 ✅

| 模块 | 交付 | 需求 |
|------|------|------|
| MCP HTTP/SSE | POST JSON-RPC + SSE 解析 + Session-Id | R-EXT-2 |
| Response Cache | 1h TTL + rebase + LRU 100MB | R-EDIT-8 |
| CI headless 验证 | fixture + transcript 校验 + headless 脚本 | R-DEP-7 |
| Enterprise ONNX | manifest 驱动 token_ids + vocab  bundle 下载 | R-CTX-5 |
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
| 2026-05-23 | 企业 ONNX 模型联调（manifest + vocab + token_ids 推理） |
| 2026-05-23 | CI headless 集成验证（fixtures + verify:ci-headless） |
| 2026-05-23 | Response Cache（exact + rebase + LRU） |
| 2026-05-23 | MCP HTTP/SSE 传输（POST + SSE + Session-Id） |
| 2026-05-23 | Mode B 本地 embedding（hash + 可选 ONNX） |
| 2026-05-23 | MCP stdio JSON-RPC 传输层 |
| 2026-05-23 | CI CLI (R-DEP-7) headless 子集 |
