/**
 * Tenetx — OpenCode Adapter
 *
 * Generates opencode.json instructions config and a plugin scaffold.
 * OpenCode uses TS-native plugins (npm packages) with 25+ hook events.
 * Since tenetx is already TypeScript, this is the easiest port.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncToInstructionFile, generateSolutionInstructions } from './adapter.js';
import { ME_SOLUTIONS, ME_RULES } from '../core/paths.js';

/** Initialize tenetx for OpenCode */
export function initOpenCode(cwd: string): { files: string[] } {
  const files: string[] = [];

  // 1. Sync solutions to instruction file
  const { written } = syncToInstructionFile(cwd, 'opencode');
  files.push(written);

  // 2. Update opencode.json to reference tenetx instructions
  const configPath = path.join(cwd, 'opencode.json');
  let config: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch { /* new file */ }

  // Add instruction references
  const instructions = (config.instructions as string[]) ?? [];
  const tenetxInstruction = 'OPENCODE.md';
  if (!instructions.includes(tenetxInstruction)) {
    instructions.push(tenetxInstruction);
    config.instructions = instructions;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    files.push(configPath);
  }

  // 3. Create plugin scaffold
  const pluginDir = path.join(cwd, '.opencode', 'plugins');
  fs.mkdirSync(pluginDir, { recursive: true });

  const pluginPath = path.join(pluginDir, 'tenetx.ts');
  if (!fs.existsSync(pluginPath)) {
    fs.writeFileSync(pluginPath, `/**
 * Tenetx Plugin for OpenCode
 *
 * Provides compound learning integration:
 * - Before tool: dangerous command check
 * - After tool: track file changes
 * - Session idle: trigger compound extraction
 * - Compacting: inject solutions into preserved context
 *
 * Install: Add "tenetx" to plugins array in opencode.json
 */

import type { Plugin } from "@opencode-ai/plugin"

export const TenetxPlugin: Plugin = async ({ project, client, $, directory }) => {
  return {
    // Dangerous command check (equivalent to tenetx pre-tool-use)
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        const cmd = String(input.args?.command ?? "");
        const dangerous = [
          /rm\\s+-rf\\s+[\\/~]/,
          /git\\s+push\\s+--force/,
          /drop\\s+(table|database)/i,
        ];
        if (dangerous.some(p => p.test(cmd))) {
          output.denied = true;
          output.reason = "[tenetx] Dangerous command blocked";
        }
      }
    },

    // Track file changes (equivalent to tenetx post-tool-use)
    "tool.execute.after": async (input, output) => {
      // Compound learning: track what tools are used
      // Solutions are synced via OPENCODE.md instructions
    },

    // Trigger extraction on idle
    "session.idle": async () => {
      try {
        await $\`tenetx sync opencode --quiet\`;
      } catch { /* non-blocking */ }
    },

    // Inject solutions before compaction
    "experimental.session.compacting": async (input, output) => {
      try {
        const solutions = await $\`tenetx compound list --json 2>/dev/null\`;
        if (solutions.stdout) {
          output.context.push("## Tenetx Compound Solutions\\n" + solutions.stdout);
        }
      } catch { /* non-blocking */ }
    },
  }
}
`);
    files.push(pluginPath);
  }

  return { files };
}

/** Sync current solutions to OpenCode OPENCODE.md */
export function syncOpenCode(cwd: string, quiet = false): void {
  const { written, solutionCount } = syncToInstructionFile(cwd, 'opencode');
  if (!quiet) {
    console.log(`\n  ✓ Synced ${solutionCount} solutions to ${written}\n`);
  }
}
