#!/usr/bin/env bash
set -euo pipefail

WORKSPACE="${1:?Usage: ci-headless.sh <workspace> [cli args...]}"
shift || true
CLI_ARGS=("$@")
if [ "${#CLI_ARGS[@]}" -eq 0 ]; then
  CLI_ARGS=(build run .copilotPlus/ci/example-build-config.json)
fi

if ! command -v code >/dev/null 2>&1; then
  echo "VS Code CLI (code) not found in PATH" >&2
  exit 1
fi

FOLDER_URI="file://$(cd "$WORKSPACE" && pwd)"
echo "Workspace: $FOLDER_URI"
echo "Command: copilotPlus.cli ${CLI_ARGS[*]}"

code \
  --folder-uri "$FOLDER_URI" \
  --disable-workspace-trust \
  --command copilotPlus.cli \
  -- "${CLI_ARGS[@]}"
