/** Shared types used across modules */

export type WorkflowStage = 'Design' | 'Build' | 'Deploy';

export type AutonomyLevel = 'Manual' | 'Approve_Edits' | 'Approve_Commands' | 'Full_Auto';

export type ToolPermission = 'allow' | 'ask' | 'deny';

export type ModelSurface =
  | 'inlineEdit'
  | 'tabCompletion'
  | 'conversationPane'
  | 'composer'
  | 'primaryAgent'
  | 'subAgent';

export type ContextTier = 'S' | 'M' | 'L';

export type EmbeddingMode = 'proposed_lm' | 'local' | 'sparse_only' | 'auto';
