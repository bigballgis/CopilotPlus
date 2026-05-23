/** Tab completion speculative key — R-PLAT-11 */

export function buildTabCompletionSpecKey(
  relPath: string,
  languageId: string,
  line: number,
  character: number,
  linePrefix: string,
  context: string
): string {
  return `${relPath.replace(/\\/g, '/')}:${languageId}:${line}:${character}:${linePrefix}|${context}`;
}
