# Copilot Plus

Cursor-style, agent-driven AI coding for enterprise teams whose only LLM access is **GitHub Copilot** (via `vscode.lm`).

## Status

**Phase 0 — Infrastructure complete.** Extension scaffold, Cursor skills/rules, bundled agent prompts, and `.copilotPlus/` workspace templates are in place. Feature implementation follows the milestone plan in [AGENTS.md](./AGENTS.md).

## Requirements

Full specification: [.kiro/specs/copilot-plus-extension/requirements.md](./.kiro/specs/copilot-plus-extension/requirements.md)

## Quick start (development)

```bash
npm install
npm run compile
```

Press **F5** in VS Code to launch the Extension Development Host.

## Project structure

| Path | Purpose |
|------|---------|
| `src/` | Extension host (TypeScript) |
| `webview-ui/` | Webview frontends (to be added) |
| `resources/agents/` | Default sub-agent system prompts |
| `.copilotPlus/` | Runtime workspace artifacts template |
| `.cursor/skills/` | Cursor agent skills for developing this extension |
| `.cursor/rules/` | Cursor rules for code standards |
| `.kiro/specs/` | Kiro requirements (source of truth) |

## Cursor skills

When implementing features, load skills from `.cursor/skills/` — start with `copilot-plus-overview` and `implement-from-kiro-spec`.

## License

MIT
