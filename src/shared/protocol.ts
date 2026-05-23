/** Shared host ↔ webview message protocol — expand per R-INT modules. */

export type WorkflowStage = 'Design' | 'Build' | 'Deploy';

export type HostToWebview =
  | { type: 'init'; stage: WorkflowStage; locale: string }
  | { type: 'stageChanged'; stage: WorkflowStage }
  | { type: 'streamChunk'; text: string }
  | { type: 'streamEnd' }
  | { type: 'error'; message: string };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'submitMessage'; text: string }
  | { type: 'selectTab'; tab: 'task' | 'architecture' | 'requirement' | 'commit' | 'deploy' };
