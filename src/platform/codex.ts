/**
 * Tenetx — Codex CLI Adapter
 *
 * Generates AGENTS.md, ~/.codex/hooks.json, and .agents/skills/ for Codex CLI.
 * Codex has limited hooks (3: SessionStart, Stop, UserPromptSubmit).
 * PreToolUse/PostToolUse not available (experimental as of v0.116.0).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { syncToInstructionFile } from './adapter.js';

/** Initialize tenetx for Codex CLI in the given directory */
export function initCodex(cwd: string): { files: string[] } {
  const files: string[] = [];

  // 1. Sync solutions to AGENTS.md
  const { written } = syncToInstructionFile(cwd, 'codex');
  files.push(written);

  // 2. Create ~/.codex/hooks.json (if not exists)
  const codexDir = path.join(os.homedir(), '.codex');
  const hooksPath = path.join(codexDir, 'hooks.json');

  if (!fs.existsSync(hooksPath)) {
    fs.mkdirSync(codexDir, { recursive: true });

    const hooks = {
      hooks: {
        SessionStart: [{
          hooks: [{
            type: 'command',
            command: 'tenetx sync codex --quiet 2>/dev/null || true',
            statusMessage: 'Syncing tenetx solutions...',
            timeout: 5,
          }],
        }],
        UserPromptSubmit: [{
          hooks: [{
            type: 'command',
            command: 'echo "tenetx:prompt-received"',
            timeout: 2,
          }],
        }],
      },
    };

    fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2));
    files.push(hooksPath);
  }

  // 3. Create AGENTS.md header if new
  const agentsPath = path.join(cwd, 'AGENTS.md');
  if (!fs.existsSync(agentsPath) || !fs.readFileSync(agentsPath, 'utf-8').includes('tenetx')) {
    // Add tenetx header to AGENTS.md
    let content = '';
    try { content = fs.readFileSync(agentsPath, 'utf-8'); } catch { /* new */ }

    if (!content.includes('tenetx')) {
      const header = `# Project Instructions\n\nThis project uses [tenetx](https://github.com/wooo-jin/tenetx) for compound learning.\nSolutions below are auto-synced from your tenetx profile.\n\n`;

      if (!content) {
        fs.writeFileSync(agentsPath, header);
      }
    }
  }

  return { files };
}

/** Sync current solutions to Codex AGENTS.md */
export function syncCodex(cwd: string, quiet = false): void {
  const { written, solutionCount } = syncToInstructionFile(cwd, 'codex');
  if (!quiet) {
    console.log(`\n  ✓ Synced ${solutionCount} solutions to ${written}\n`);
  }
}
