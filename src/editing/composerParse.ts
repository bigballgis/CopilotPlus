/** Composer response parsing and validation — R-EDIT-3 */

export const COMPOSER_MAX_GOAL = 8000;
export const COMPOSER_MAX_FILES = 50;
export const COMPOSER_MAX_FILE_BYTES = 1_048_576;
export const COMPOSER_TIMEOUT_MS = 120_000;

export interface ComposerFileEditProposal {
  path: string;
  content: string;
}

export interface ComposerValidationError {
  code:
    | 'empty_goal'
    | 'goal_too_long'
    | 'no_files'
    | 'too_many_files'
    | 'file_too_large'
    | 'file_missing'
    | 'sensitive_file'
    | 'wrong_stage';
  message: string;
}

export function validateComposerInput(
  goal: string,
  files: Array<{ relativePath: string; sizeBytes: number }>,
  options?: { sensitivePaths?: string[]; stage?: string }
): ComposerValidationError | null {
  const trimmed = goal.trim();
  if (!trimmed) {
    return { code: 'empty_goal', message: 'Composer goal must not be empty.' };
  }
  if (trimmed.length > COMPOSER_MAX_GOAL) {
    return {
      code: 'goal_too_long',
      message: `Composer goal exceeds ${COMPOSER_MAX_GOAL} characters.`,
    };
  }
  if (files.length === 0) {
    return { code: 'no_files', message: 'Attach at least one file to Composer.' };
  }
  if (files.length > COMPOSER_MAX_FILES) {
    return {
      code: 'too_many_files',
      message: `Composer accepts at most ${COMPOSER_MAX_FILES} files.`,
    };
  }
  if (options?.stage && options.stage !== 'Build') {
    return { code: 'wrong_stage', message: 'Composer is available only during the Build stage.' };
  }
  const sensitive = new Set(options?.sensitivePaths ?? []);
  for (const file of files) {
    if (file.sizeBytes > COMPOSER_MAX_FILE_BYTES) {
      return {
        code: 'file_too_large',
        message: `File ${file.relativePath} exceeds 1 MB.`,
      };
    }
    if (sensitive.has(file.relativePath)) {
      return {
        code: 'sensitive_file',
        message: `File ${file.relativePath} matches a sensitive pattern.`,
      };
    }
  }
  return null;
}

export function parseComposerResponse(
  text: string
): { ok: true; edits: ComposerFileEditProposal[] } | { ok: false; reason: string } {
  const jsonBlock = extractJsonBlock(text);
  if (!jsonBlock) {
    return { ok: false, reason: 'invalid_response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  const editsRaw =
    typeof parsed === 'object' && parsed !== null && 'edits' in parsed
      ? (parsed as { edits: unknown }).edits
      : parsed;

  if (!Array.isArray(editsRaw) || editsRaw.length === 0) {
    return { ok: false, reason: 'no_edits' };
  }

  const edits: ComposerFileEditProposal[] = [];
  for (const item of editsRaw) {
    if (typeof item !== 'object' || item === null) {
      return { ok: false, reason: 'invalid_edit_entry' };
    }
    const path = 'path' in item ? String((item as { path: unknown }).path) : '';
    const content =
      'content' in item
        ? String((item as { content: unknown }).content)
        : 'newContent' in item
          ? String((item as { newContent: unknown }).newContent)
          : '';
    if (!path.trim()) {
      return { ok: false, reason: 'missing_path' };
    }
    edits.push({ path: path.replace(/\\/g, '/'), content });
  }

  return { ok: true, edits };
}

function extractJsonBlock(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1);
  }
  return undefined;
}
