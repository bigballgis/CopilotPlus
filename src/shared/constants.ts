/** Shared constants — DESIGN §3.1 */

export const MIN_VSCODE_VERSION = '1.109.0';
export const COPILOT_VENDOR = 'copilot';
export const CONFIG_NAMESPACE = 'copilotPlus';
export const COPILOT_PLUS_HOME = '.copilotPlus';

export const DEFAULT_SENSITIVE_PATTERNS: readonly string[] = [
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/id_rsa',
  '**/id_dsa',
];

export const ACTIVATION_SLOW_MS = 2000;
export const ACTIVATION_HARD_LIMIT_MS = 5000;
