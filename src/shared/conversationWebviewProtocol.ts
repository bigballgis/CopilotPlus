/** Host ↔ Conversation Pane webview message protocol — R-INT-2 */

import type { WorkflowStage } from './types';

export interface MentionAttachmentWire {
  kind: string;
  target: string;
  label: string;
}

export interface DesignStepOptionWire {
  id: string;
  label: string;
  complete: boolean;
  missing: string[];
  current: boolean;
}

export interface ConversationLabels {
  userPrefix: string;
  assistantPrefix: string;
  summarized: string;
  streamComplete: string;
  streamCancelled: string;
  streamError: string;
  removeAttachment: string;
  inputLabel: string;
  inputPlaceholder: string;
  send: string;
  sendAria: string;
  attach: string;
  attachAria: string;
  cancel: string;
  cancelAria: string;
  newSession: string;
  newSessionAria: string;
  designStepLabel: string;
  continueLabel: string;
  continueAria: string;
  pickStepLabel: string;
  pickStepAria: string;
}

export interface ConversationStateSync {
  type: 'stateSync';
  stage: WorkflowStage;
  readOnly: boolean;
  readOnlyBanner?: string;
  model: string;
  designStep: string;
  designCanContinue: boolean;
  designContinueBlockedReason?: string;
  designIsFinalStep: boolean;
  designSteps: DesignStepOptionWire[];
  tokens: number;
  labels: ConversationLabels;
  resetMessages?: boolean;
}

export type ConversationHostMessage =
  | ConversationStateSync
  | { type: 'userMessage'; text: string; attachments?: MentionAttachmentWire[] }
  | { type: 'mentionAttached'; mention: MentionAttachmentWire }
  | { type: 'summarized'; path: string }
  | { type: 'streamStart' }
  | { type: 'streamChunk'; text: string }
  | { type: 'streamEnd'; text: string; tokens: number; designStep?: string; delegatedRole?: string }
  | { type: 'streamCancelled' }
  | { type: 'tokenUpdate'; tokens: number }
  | { type: 'designStatus'; message: string }
  | { type: 'error'; message: string };

export type ConversationWebviewMessage =
  | { type: 'ready' }
  | { type: 'submit'; text: string; attachments: MentionAttachmentWire[] }
  | { type: 'pickMention' }
  | { type: 'cancel' }
  | { type: 'newSession' }
  | { type: 'continueDesign' }
  | { type: 'pickDesignStep'; step: string }
  | { type: 'inputDraft'; text: string; attachments: MentionAttachmentWire[] };
