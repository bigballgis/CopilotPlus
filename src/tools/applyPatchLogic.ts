/** Pure apply_patch matching — R-TOOL-3.2 */

export interface PatchEdit {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}

export type PatchResult =
  | { ok: true; content: string }
  | { ok: false; reason: 'not_found' | 'ambiguous_match' | 'old_string_too_short'; occurrences: number };

export function applyEdits(content: string, edits: PatchEdit[]): PatchResult {
  let current = content;
  for (const edit of edits) {
    if (edit.oldString.length < 10 && !edit.replaceAll) {
      return { ok: false, reason: 'old_string_too_short', occurrences: 0 };
    }
    const result = applyOne(current, edit);
    if (!result.ok) {
      return result;
    }
    current = result.content;
  }
  return { ok: true, content: current };
}

function applyOne(content: string, edit: PatchEdit): PatchResult {
  const occurrences = countOccurrences(content, edit.oldString);
  if (occurrences === 0) {
    return { ok: false, reason: 'not_found', occurrences: 0 };
  }
  if (occurrences > 1 && !edit.replaceAll) {
    return { ok: false, reason: 'ambiguous_match', occurrences };
  }
  const contentOut = edit.replaceAll
    ? content.split(edit.oldString).join(edit.newString)
    : content.replace(edit.oldString, edit.newString);
  return { ok: true, content: contentOut };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx < 0) {
      break;
    }
    count++;
    pos = idx + needle.length;
  }
  return count;
}
