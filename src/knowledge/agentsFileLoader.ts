/** AGENTS.md layered loading — R-KNOW-1 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { COPILOT_PLUS_HOME } from '../shared/constants';

export type AgentsLayerKind = 'user' | 'workspace' | 'subdirectory';

export interface AgentsLayer {
  kind: AgentsLayerKind;
  relativePath: string;
  absolutePath: string;
  content: string;
}

export const AGENTS_TOTAL_CAP = 50_000;

export function userAgentsPath(): string {
  return path.join(os.homedir(), COPILOT_PLUS_HOME, 'AGENTS.md');
}

export function workspaceAgentsPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, 'AGENTS.md');
}

export function ancestorAgentsPaths(workspaceRoot: string, fileRelative: string): string[] {
  const normalized = fileRelative.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) {
    const dir = parts.slice(0, i + 1).join('/');
    paths.push(`${dir}/AGENTS.md`);
  }
  return paths;
}

export async function readAgentsFile(absPath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch {
    return undefined;
  }
}

export async function loadAgentsLayers(
  workspaceRoot: string,
  fileRelative?: string
): Promise<{ layers: AgentsLayer[]; dropped: string[]; text: string }> {
  const layers: AgentsLayer[] = [];

  const userPath = userAgentsPath();
  const userContent = await readAgentsFile(userPath);
  if (userContent?.trim()) {
    layers.push({
      kind: 'user',
      relativePath: '~/.copilotPlus/AGENTS.md',
      absolutePath: userPath,
      content: userContent.trim(),
    });
  }

  const wsPath = workspaceAgentsPath(workspaceRoot);
  const wsContent = await readAgentsFile(wsPath);
  if (wsContent?.trim()) {
    layers.push({
      kind: 'workspace',
      relativePath: 'AGENTS.md',
      absolutePath: wsPath,
      content: wsContent.trim(),
    });
  }

  if (fileRelative) {
    for (const rel of ancestorAgentsPaths(workspaceRoot, fileRelative)) {
      const abs = path.join(workspaceRoot, rel.replace(/\//g, path.sep));
      const content = await readAgentsFile(abs);
      if (content?.trim()) {
        layers.push({
          kind: 'subdirectory',
          relativePath: rel,
          absolutePath: abs,
          content: content.trim(),
        });
      }
    }
  }

  const { text, dropped } = capAgentsLayers(layers);
  return { layers, dropped, text };
}

export function capAgentsLayers(layers: AgentsLayer[]): { text: string; dropped: string[] } {
  const working = [...layers];
  const dropped: string[] = [];
  let text = composeAgentsText(working);

  while (text.length > AGENTS_TOTAL_CAP && working.length > 0) {
    let longestIdx = 0;
    for (let i = 1; i < working.length; i++) {
      if (working[i].content.length > working[longestIdx].content.length) {
        longestIdx = i;
      }
    }
    dropped.push(working[longestIdx].relativePath);
    working.splice(longestIdx, 1);
    text = composeAgentsText(working);
  }

  return { text, dropped };
}

export function composeAgentsText(layers: AgentsLayer[]): string {
  return layers
    .map((layer) => `## AGENTS (${layer.relativePath})\n${layer.content}`)
    .join('\n\n');
}

export function isAgentsFilePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  return normalized === 'AGENTS.md' || normalized.endsWith('/AGENTS.md');
}
