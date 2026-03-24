/**
 * Tenetx — OpenCode Full Adapter
 *
 * Generates a complete TS plugin with real compound learning logic.
 * OpenCode hooks: tool.execute.before, tool.execute.after, session.created,
 *   session.idle, experimental.session.compacting, message.updated
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncToInstructionFile } from './adapter.js';

/** Initialize tenetx for OpenCode with full compound learning */
export function initOpenCode(cwd: string): { files: string[] } {
  const files: string[] = [];

  // 1. Sync solutions
  const { written } = syncToInstructionFile(cwd, 'opencode');
  files.push(written);

  // 2. Update opencode.json
  const configPath = path.join(cwd, 'opencode.json');
  let config: Record<string, unknown> = {};
  try { if (fs.existsSync(configPath)) config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* new file */ }
  const instructions = (config.instructions as string[]) ?? [];
  if (!instructions.includes('OPENCODE.md')) {
    instructions.push('OPENCODE.md');
    config.instructions = instructions;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    files.push(configPath);
  }

  // 3. Create full plugin
  const pluginDir = path.join(cwd, '.opencode', 'plugins');
  fs.mkdirSync(pluginDir, { recursive: true });

  const pluginPath = path.join(pluginDir, 'tenetx.ts');
  fs.writeFileSync(pluginPath, `/**
 * Tenetx Plugin for OpenCode — Full Compound Learning
 */
import type { Plugin } from "@opencode-ai/plugin"
import * as fs from "node:fs"
import * as path from "node:path"
import * as os from "node:os"
import { execSync } from "node:child_process"

const STATE_DIR = path.join(os.homedir(), ".compound", "state")
const SOL_DIR = path.join(os.homedir(), ".compound", "me", "solutions")

function updateEvidence(name: string, field: string) {
  try {
    if (!fs.existsSync(SOL_DIR)) return
    for (const f of fs.readdirSync(SOL_DIR).filter(f => f.endsWith(".md"))) {
      const fp = path.join(SOL_DIR, f)
      const content = fs.readFileSync(fp, "utf-8")
      if (!content.includes(name)) continue
      const re = new RegExp(field + ":\\\\s*(\\\\d+)")
      const m = content.match(re)
      if (m) fs.writeFileSync(fp, content.replace(re, field + ": " + (parseInt(m[1]) + 1)))
      return
    }
  } catch {}
}

export const TenetxPlugin: Plugin = async ({ project, $, directory }) => {
  // Sync on load
  try { execSync("tenetx sync opencode --quiet", { timeout: 5000 }) } catch {}

  // Run extraction + lifecycle on start
  try {
    execSync("node -e \\"(async()=>{try{const{runExtraction}=await import(require.resolve('tenetx').replace('cli.js','engine/compound-extractor.js'));await runExtraction(process.cwd(),'opencode')}catch{}try{const{runLifecycleCheck}=await import(require.resolve('tenetx').replace('cli.js','engine/compound-lifecycle.js'));runLifecycleCheck('opencode')}catch{}})();\\"", { timeout: 10000 })
  } catch {}

  return {
    // Dangerous command check + code reflection
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash" || input.tool === "run_terminal_command") {
        const cmd = String(input.args?.command ?? "")
        const dangerous = [/rm\\s+-rf\\s+[\\/~]/, /git\\s+push\\s+--force/, /drop\\s+(table|database)/i]
        if (dangerous.some(p => p.test(cmd))) {
          output.denied = true
          output.reason = "[tenetx] Dangerous command blocked"
          return
        }
      }

      // Code reflection
      if (input.tool === "write_file" || input.tool === "edit_file" || input.tool === "replace") {
        try {
          const code = JSON.stringify(input.args ?? {})
          const cachePath = path.join(STATE_DIR, "injection-cache-opencode.json")
          if (!fs.existsSync(cachePath)) return
          const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"))
          for (const sol of cache.solutions ?? []) {
            if (!sol.identifiers?.length) continue
            const matched = sol.identifiers.filter((id: string) => id.length >= 4 && code.includes(id))
            if (matched.length >= Math.min(2, sol.identifiers.length)) {
              updateEvidence(sol.name, "reflected")
            }
          }
        } catch {}
      }
    },

    // Negative signals + write content tracking
    "tool.execute.after": async (input, output) => {
      const toolOutput = String(output.output ?? "")

      // Negative signal
      if ((input.tool === "bash" || input.tool === "run_terminal_command") && toolOutput) {
        const isError = /error TS|BUILD FAILED|test.*fail|npm ERR|SyntaxError/i.test(toolOutput)
        if (isError) {
          try {
            const cachePath = path.join(STATE_DIR, "injection-cache-opencode.json")
            if (!fs.existsSync(cachePath)) return
            const cache = JSON.parse(fs.readFileSync(cachePath, "utf-8"))
            for (const sol of (cache.solutions ?? []).filter((s: {status:string}) => s.status === "experiment")) {
              updateEvidence(sol.name, "negative")
            }
          } catch {}
        }
      }

      // Write content tracking
      if (input.tool === "write_file" || input.tool === "edit_file") {
        try {
          const fp = String(input.args?.path ?? "")
          const content = String(input.args?.content ?? "")
          if (!fp || !content) return
          const histPath = path.join(STATE_DIR, "write-history.jsonl")
          fs.mkdirSync(path.dirname(histPath), { recursive: true })
          fs.appendFileSync(histPath, JSON.stringify({
            filePath: fp.slice(-100), contentSnippet: content.slice(0, 200),
            contentLength: content.length, fileExtension: path.extname(fp),
            timestamp: new Date().toISOString(), sessionId: "opencode"
          }) + "\\n")
        } catch {}
      }
    },

    // Compound extraction on idle
    "session.idle": async () => {
      try { await $\\\`tenetx sync opencode --quiet\\\` } catch {}
    },

    // Inject solutions before compaction
    "experimental.session.compacting": async (input, output) => {
      try {
        const hint = "[Tenetx] Context compressing. Extract patterns: tenetx compound --solution \\\\"title\\\\" \\\\"why\\\\""
        output.context.push(hint)
      } catch {}
    },
  }
}
`);
  files.push(pluginPath);

  return { files };
}

/** Sync solutions to OpenCode */
export function syncOpenCode(cwd: string, quiet = false): void {
  const { written, solutionCount } = syncToInstructionFile(cwd, 'opencode');
  if (!quiet) console.log(`\n  \u2713 Synced ${solutionCount} solutions to ${written}\n`);
}
