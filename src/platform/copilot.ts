/**
 * Tenetx — GitHub Copilot CLI Adapter
 *
 * Generates .github/copilot-instructions.md, .github/hooks/tenetx.json,
 * and .github/agents/ for Copilot CLI.
 *
 * Key insight: Copilot CLI natively reads CLAUDE.md, so tenetx's
 * existing Claude Code output already works without conversion!
 * This adapter adds Copilot-specific hooks and optimized instructions.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncToInstructionFile } from './adapter.js';

/** Initialize tenetx for Copilot CLI */
export function initCopilot(cwd: string): { files: string[] } {
  const files: string[] = [];

  // 1. Sync solutions to .github/copilot-instructions.md
  const { written } = syncToInstructionFile(cwd, 'copilot');
  files.push(written);

  // 2. Create .github/hooks/tenetx.json
  const hooksDir = path.join(cwd, '.github', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  const hooksPath = path.join(hooksDir, 'tenetx.json');
  if (!fs.existsSync(hooksPath)) {
    const hooks = {
      version: 1,
      hooks: {
        sessionStart: [{
          type: 'command',
          bash: 'tenetx sync copilot --quiet 2>/dev/null || true',
          timeoutSec: 5,
        }],
        preToolUse: [{
          type: 'command',
          bash: `node -e "
            process.stdin.resume();
            let d='';
            process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{
              try{
                const i=JSON.parse(d);
                if(i.toolName==='bash'){
                  const c=i.toolArgs?.command||'';
                  const bad=[/rm\\\\s+-rf\\\\s+[\\\\/~]/,/git\\\\s+push\\\\s+--force/,/drop\\\\s+(table|database)/i];
                  if(bad.some(p=>p.test(c))){
                    console.log(JSON.stringify({permissionDecision:'deny',permissionDecisionReason:'[tenetx] Dangerous command blocked'}));
                    return;
                  }
                }
                console.log(JSON.stringify({permissionDecision:'allow'}));
              }catch{console.log(JSON.stringify({permissionDecision:'allow'}));}
            });"`,
          timeoutSec: 3,
        }],
        postToolUse: [{
          type: 'command',
          bash: 'true',
          timeoutSec: 1,
        }],
      },
    };
    fs.writeFileSync(hooksPath, JSON.stringify(hooks, null, 2));
    files.push(hooksPath);
  }

  // 3. Create compound agent
  const agentsDir = path.join(cwd, '.github', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });

  const agentPath = path.join(agentsDir, 'compound.agent.md');
  if (!fs.existsSync(agentPath)) {
    fs.writeFileSync(agentPath, `---
name: compound
description: Extract and accumulate reusable patterns from this session
---

Analyze the current session and extract reusable coding patterns.

For each pattern found, run:
\`\`\`bash
tenetx compound --solution "pattern-name" "detailed description including WHY this approach works"
\`\`\`

Focus on:
- Decisions made and their rationale
- Error resolutions (problem → cause → fix)
- Reusable code patterns
- Anti-patterns discovered

Skip: typo fixes, one-off workarounds, project-specific config.
`);
    files.push(agentPath);
  }

  // 4. Note about CLAUDE.md compatibility
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    // Copilot reads CLAUDE.md natively — no conversion needed!
    console.log('  ℹ Copilot CLI reads your existing CLAUDE.md — no conversion needed.');
  }

  return { files };
}

/** Sync current solutions to Copilot instructions */
export function syncCopilot(cwd: string, quiet = false): void {
  const { written, solutionCount } = syncToInstructionFile(cwd, 'copilot');
  if (!quiet) {
    console.log(`\n  ✓ Synced ${solutionCount} solutions to ${written}`);
    // Check if CLAUDE.md exists (it's also read by Copilot)
    const claudeMdPath = path.join(cwd, 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) {
      console.log('  ℹ Copilot also reads your CLAUDE.md (no extra sync needed)');
    }
    console.log();
  }
}
