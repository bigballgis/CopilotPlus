/** Marks workspace edits originating from Copilot Plus — R-EDIT-8.5 */

let internalDepth = 0;

export function isInternalEdit(): boolean {
  return internalDepth > 0;
}

export async function runInternalEdit<T>(fn: () => Promise<T>): Promise<T> {
  internalDepth += 1;
  try {
    return await fn();
  } finally {
    internalDepth -= 1;
  }
}
