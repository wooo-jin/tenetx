/**
 * Tenetx — Multi-Platform Adapter
 *
 * Converts compound solutions and tenetx config into
 * platform-specific formats (Codex, Gemini, OpenCode, Copilot).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ME_SOLUTIONS, ME_RULES } from '../core/paths.js';
import { parseFrontmatterOnly, parseSolutionV3 } from '../engine/solution-format.js';
import type { SolutionFrontmatter } from '../engine/solution-format.js';
import { debugLog } from '../core/logger.js';

export type Platform = 'claude' | 'codex' | 'gemini' | 'opencode' | 'copilot';

export interface PlatformConfig {
  platform: Platform;
  instructionFile: string;      // e.g., AGENTS.md, GEMINI.md
  hooksDir?: string;            // e.g., .github/hooks/
  skillsDir?: string;           // e.g., .agents/skills/
  configFile?: string;          // e.g., .gemini/settings.json
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  claude: {
    platform: 'claude',
    instructionFile: 'CLAUDE.md',
    hooksDir: '.claude',
  },
  codex: {
    platform: 'codex',
    instructionFile: 'AGENTS.md',
    hooksDir: '.codex',
    skillsDir: '.agents/skills',
    configFile: '.codex/config.toml',
  },
  gemini: {
    platform: 'gemini',
    instructionFile: 'GEMINI.md',
    hooksDir: '.gemini',
    skillsDir: '.gemini/skills',
    configFile: '.gemini/settings.json',
  },
  opencode: {
    platform: 'opencode',
    instructionFile: 'OPENCODE.md',
    configFile: 'opencode.json',
  },
  copilot: {
    platform: 'copilot',
    instructionFile: '.github/copilot-instructions.md',
    hooksDir: '.github/hooks',
    skillsDir: '.github/agents',
  },
};

/** Load all verified+ solutions as instruction text */
export function generateSolutionInstructions(): string {
  const solutions: Array<{ name: string; content: string; status: string; confidence: number }> = [];
  const dirs = [ME_SOLUTIONS, ME_RULES];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const fm = parseFrontmatterOnly(content);
        if (!fm) continue;
        // Only verified+ for cross-platform sync
        if (fm.status !== 'verified' && fm.status !== 'mature') continue;
        const full = parseSolutionV3(content);
        if (!full) continue;
        solutions.push({
          name: fm.name,
          content: full.content || full.context || fm.name,
          status: fm.status,
          confidence: fm.confidence,
        });
      }
    } catch { continue; }
  }

  if (solutions.length === 0) return '';

  const lines = [
    '## Tenetx Compound Solutions (auto-generated)',
    '',
    'The following patterns were learned from your coding sessions.',
    'They are ranked by confidence (higher = more validated).',
    '',
  ];

  for (const sol of solutions.sort((a, b) => b.confidence - a.confidence)) {
    lines.push(`### ${sol.name} (${sol.status}, ${sol.confidence.toFixed(2)})`);
    lines.push(sol.content);
    lines.push('');
  }

  return lines.join('\n');
}

/** Sync tenetx solutions to a platform's instruction file */
export function syncToInstructionFile(cwd: string, platform: Platform): { written: string; solutionCount: number } {
  const config = PLATFORM_CONFIGS[platform];
  const instructions = generateSolutionInstructions();
  const solutionCount = (instructions.match(/^### /gm) ?? []).length;

  const filePath = path.join(cwd, config.instructionFile);
  const dir = path.dirname(filePath);
  if (dir !== cwd) fs.mkdirSync(dir, { recursive: true });

  // Read existing file and replace/append tenetx section
  let existing = '';
  try { existing = fs.readFileSync(filePath, 'utf-8'); } catch { /* new file */ }

  const marker = '<!-- tenetx-compound-start -->';
  const endMarker = '<!-- tenetx-compound-end -->';
  const tenetxSection = instructions
    ? `${marker}\n${instructions}\n${endMarker}`
    : '';

  if (existing.includes(marker)) {
    // Replace existing section
    const regex = new RegExp(`${marker}[\\s\\S]*?${endMarker}`, 'g');
    const updated = existing.replace(regex, tenetxSection);
    fs.writeFileSync(filePath, updated);
  } else if (tenetxSection) {
    // Append
    fs.writeFileSync(filePath, existing + '\n\n' + tenetxSection + '\n');
  }

  debugLog('platform', `Synced ${solutionCount} solutions to ${filePath}`);
  return { written: filePath, solutionCount };
}
