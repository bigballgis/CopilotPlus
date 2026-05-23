/** Memory privacy scanning — R-KNOW-5 */

const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'aws_access_key', re: /AKIA[0-9A-Z]{16}/i },
  { name: 'github_token', re: /gh[pousr]_[A-Za-z0-9_]{20,}/i },
  { name: 'jwt', re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/ },
  { name: 'openai_key', re: /sk-[A-Za-z0-9]{20,}/i },
  { name: 'gcp_service_account', re: /"type"\s*:\s*"service_account"/i },
  {
    name: 'generic_secret',
    re: /\b(?:key|token|secret)\b[^\n]{0,40}[A-Fa-f0-9]{32}\b/i,
  },
];

export interface MemoryPrivacyResult {
  blocked: boolean;
  pattern?: string;
}

export function scanMemoryText(text: string): MemoryPrivacyResult {
  for (const { name, re } of SECRET_PATTERNS) {
    if (re.test(text)) {
      return { blocked: true, pattern: name };
    }
  }
  return { blocked: false };
}
