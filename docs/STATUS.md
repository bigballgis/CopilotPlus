# Copilot Plus — 进度总览

> **最后更新**：2026-05-23  
> **当前阶段**：Polish / 后续增强  
> **下一项**：MCP 传输层 · Mode B ONNX 推理 · CI headless 集成验证

---

## 总体进度

| Phase | 名称 | 进度 | 状态 |
|-------|------|------|------|
| 0 | 项目基建 | 8/8 | ✅ 完成 |
| 1 | M0 Platform | 9/9 | ✅ 完成 |
| 2 | M1 Interaction | 7/7 | ✅ 完成 |
| 3 | M2 Document Tree | 6/6 | ✅ 完成 |
| 4 | M3 Tools + Agents | 4/4 | ✅ 完成 |
| 5 | M4 Workflow | 4/4 | ✅ 完成 |
| 6 | M5 Context/RAG | 5/5 | ✅ 完成 |
| 7 | M6 Editing | 5/5 | ✅ 完成 |
| 8 | M7 Extensibility | 4/4 | ✅ 完成 |
| 9 | M8 Deploy + Polish | 4/4 | ✅ 完成 |

**单元测试**：56/56 通过  
**需求覆盖率（粗算）**：~82%

---

## 本轮新增 ✅

| 模块 | 交付 | 需求 |
|------|------|------|
| CLI Runner | `copilotPlus.cli` 命令 + 子命令路由 | R-DEP-7 |
| Build Config | `.copilotPlus/ci/example-build-config.json` 解析 | R-DEP-7 |
| Decision Resolver | always-approve / reject / pattern / fail-on-decision | R-DEP-7.5 |
| CI Build Runner | `build run/status/cancel` + JSONL transcript | R-DEP-7 |
| CI Deploy | `deploy run <target>` headless 入口 | R-DEP-7 |
| CI Session | 自动 Apply + Checkpoint + 绕过 Diff Review UI | R-DEP-7.4 |

---

## CLI 用法

```text
# 在 VS Code 中（Output Channel + stdout JSONL）
Copilot Plus: CLI → build run .copilotPlus/ci/example-build-config.json

# 子命令
build run <build-config.json>
build status <build-id>
build cancel <build-id>
deploy run Local|Docker|Kubernetes
```

产物目录：`.copilotPlus/ci-runs/<run-id>/transcript.jsonl`

---

## 变更日志

| 日期 | 内容 |
|------|------|
| 2026-05-23 | CI CLI (R-DEP-7) headless 子集 |
| 2026-05-23 | Composer 多文件编辑 + MCP 集成骨架 |
| 2026-05-23 | Skills 服务 + Tab Completion (own) |
| 2026-05-23 | Deployer Sub-Agent + Deploy 编排完成 (Phase 9) |
