---
name: copilot-plus-deployment
description: >-
  Copilot Plus deployment: Local Docker Kubernetes targets, Manual vs Auto mode,
  manifest generation, deploy_apply and deploy_rollback tools, Deploy Panel. Use
  when implementing R-DEP in src/deployment/.
---

# Deployment

## Config (R-DEP-1)

`.copilotPlus/deploy/config.json`:
- `target`: Local | Docker | Kubernetes
- `mode`: Manual | Auto
- `manifest_path`, pre/post commands, `rollback_strategy`

## Manifests (R-DEP-2)

| Target | Artifacts |
|--------|-----------|
| Local | run script + env file |
| Docker | Dockerfile, compose, env |
| Kubernetes | Deployment, Service, ConfigMap, Secret, kustomization |

Snapshots: `.copilotPlus/deploy/snapshots/<timestamp>/`

All writes through Diff Review (R-EDIT-4).

## Manual mode (R-DEP-3)

Generate manifest only; show recommended CLI commands to user.

## Auto mode (R-DEP-4)

Deployer Sub_Agent runs deploy via `deploy_apply`; gated by Autonomy + deny list + Decision_Notifications.

## Deploy Panel (R-INT-8)

Last 50 runs; Deploy / Rollback controls.

## Reference

`.kiro/specs/copilot-plus-extension/requirements/09-deployment.md`
