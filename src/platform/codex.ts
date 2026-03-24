/**
 * Tenetx — Codex CLI Full Adapter (3-hook maximum)
 *
 * Codex limitations (v0.116.0):
 *   - Only SessionStart, Stop, UserPromptSubmit hooks
 *   - No PreToolUse/PostToolUse (experimental, not available)
 *   - AGENTS.md for static instruction injection
 *
 * Strategy: Maximize the 3 available hooks + AGENTS.md sync
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { syncToInstructionFile } from './adapter.js';

export function initCodex(cwd: string): { files: string[] } {
  const files: string[] = [];

  // 1. Sync solutions to AGENTS.md
  const { written } = syncToInstructionFile(cwd, 'codex');
  files.push(written);

  // 2. Create hook scripts
  const codexDir = path.join(os.homedir(), '.codex');
  const scriptsDir = path.join(codexDir, 'hooks');
  fs.mkdirSync(scriptsDir, { recursive: true });

  // SessionStart: extraction + patterns + lifecycle + sync
  const sessionScript = path.join(scriptsDir, 'tenetx-session-start.sh');
  fs.writeFileSync(sessionScript, `#!/bin/bash
# Tenetx SessionStart for Codex CLI
tenetx sync codex --quiet 2>/dev/null || true
node -e "
  (async()=>{
    try{const{runExtraction,isExtractionPaused}=await import(require.resolve('tenetx').replace('cli.js','engine/compound-extractor.js'));if(!isExtractionPaused())await runExtraction(process.cwd(),'codex')}catch{}
    try{const{detectPreferencePatterns,detectContentPatterns,detectWorkflowPatterns}=await import(require.resolve('tenetx').replace('cli.js','engine/prompt-learner.js'));detectPreferencePatterns('codex');detectContentPatterns('codex');detectWorkflowPatterns('codex')}catch{}
    try{const{runLifecycleCheck}=await import(require.resolve('tenetx').replace('cli.js','engine/compound-lifecycle.js'));runLifecycleCheck('codex')}catch{}
  })();
" 2>/dev/null
`, { mode: 0o755 });
  files.push(sessionScript);

  // UserPromptSubmit: prompt learning + solution hint
  const promptScript = path.join(scriptsDir, 'tenetx-prompt.sh');
  fs.writeFileSync(promptScript, `#!/bin/bash
# Tenetx UserPromptSubmit for Codex CLI
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).prompt||JSON.parse(d).message||'')}catch{console.log('')}})")

if [ -n "$PROMPT" ]; then
  # Record prompt
  node -e "
    const fs=require('fs'),path=require('path'),os=require('os');
    const histPath=path.join(os.homedir(),'.compound','state','prompt-history.jsonl');
    fs.mkdirSync(path.dirname(histPath),{recursive:true});
    fs.appendFileSync(histPath,JSON.stringify({prompt:process.argv[1].slice(0,500),timestamp:new Date().toISOString(),sessionId:'codex'})+'\\n');
  " "$PROMPT" 2>/dev/null
fi

echo '{"result":"approve"}'
`, { mode: 0o755 });
  files.push(promptScript);

  // Stop: workflow completion + re-sync
  const stopScript = path.join(scriptsDir, 'tenetx-stop.sh');
  fs.writeFileSync(stopScript, `#!/bin/bash
# Tenetx Stop for Codex CLI
node -e "
  try{const{checkWorkflowCompletion}=require(require.resolve('tenetx').replace('cli.js','engine/workflow-compound.js'));checkWorkflowCompletion('codex')}catch{}
" 2>/dev/null
tenetx sync codex --quiet 2>/dev/null || true
`, { mode: 0o755 });
  files.push(stopScript);

  // 3. Create ~/.codex/hooks.json
  const hooksPath = path.join(codexDir, 'hooks.json');
  const hooks = {
    hooks: {
      SessionStart: [{
        hooks: [{
          type: 'command',
          command: `bash ${sessionScript}`,
          statusMessage: 'Tenetx: syncing compound solutions...',
          timeout: 10,
        }],
      }],
      UserPromptSubmit: [{
        hooks: [{
          type: 'command',
          command: `bash ${promptScript}`,
          timeout: 3,
        }],
      }],
      Stop: [{
        hooks: [{
          type: 'command',
          command: `bash ${stopScript}`,
          timeout: 5,
        }],
      }],
    },
  };
  fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2));
  files.push(hooksPath);

  return { files };
}

/** Sync solutions to Codex AGENTS.md */
export function syncCodex(cwd: string, quiet = false): void {
  const { written, solutionCount } = syncToInstructionFile(cwd, 'codex');
  if (!quiet) {
    console.log(`\n  ✓ Synced ${solutionCount} solutions to ${written}`);
    console.log('  ⚠ Codex has limited hooks — no real-time code reflection or danger blocking');
    console.log('  Run with: codex -c features.codex_hooks=true\n');
  }
}
