/**
 * Tenetx — Gemini CLI Full Adapter
 *
 * Generates complete hook scripts that provide Claude-Code-equivalent
 * compound learning on Gemini CLI.
 *
 * Gemini hook mapping:
 *   BeforeTool → PreToolUse (danger check + code reflection)
 *   AfterTool → PostToolUse (negative signals + write tracking + micro-hints)
 *   BeforeAgent → UserPromptSubmit (solution injection + prompt learning)
 *   SessionStart → session recovery + extraction + lifecycle
 *   PreCompress → pre-compact (compound hint)
 *   SessionEnd → workflow completion check
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncToInstructionFile } from './adapter.js';

const HOOK_SCRIPTS: Record<string, string> = {
  // BeforeTool: dangerous command check + code reflection
  'before-tool.sh': `#!/bin/bash
# Tenetx BeforeTool hook for Gemini CLI
# Reads tool info from stdin, checks for dangerous commands and tracks code reflection
INPUT=$(cat)
TOOL=$(echo "$INPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);console.log(i.tool||i.toolName||'')}catch{console.log('')}})")

# Dangerous command check
if [ "$TOOL" = "run_terminal_command" ] || [ "$TOOL" = "bash" ] || [ "$TOOL" = "Bash" ]; then
  CMD=$(echo "$INPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);console.log(i.input?.command||i.toolArgs?.command||'')}catch{console.log('')}})")
  if echo "$CMD" | grep -qE 'rm\\s+-rf\\s+[/~]|git\\s+push\\s+--force|drop\\s+(table|database)'; then
    echo '{"exitCode":2}' # Block
    exit 0
  fi
fi

# Code reflection: check if written code contains solution identifiers
if [ "$TOOL" = "write_file" ] || [ "$TOOL" = "replace_in_file" ] || [ "$TOOL" = "Write" ] || [ "$TOOL" = "Edit" ]; then
  echo "$INPUT" | node -e "
    const fs=require('fs'),path=require('path'),os=require('os');
    process.stdin.resume();let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try{
        const i=JSON.parse(d);
        const code=i.input?.content||i.input?.new_content||i.toolArgs?.content||'';
        const cachePath=path.join(os.homedir(),'.compound','state','injection-cache-gemini.json');
        if(!fs.existsSync(cachePath))return;
        const cache=JSON.parse(fs.readFileSync(cachePath,'utf-8'));
        if(!Array.isArray(cache.solutions))return;
        for(const sol of cache.solutions){
          if(!Array.isArray(sol.identifiers)||sol.identifiers.length===0)continue;
          const matched=sol.identifiers.filter(id=>id.length>=4&&code.includes(id));
          if(matched.length>=Math.min(2,sol.identifiers.length)){
            try{require('child_process').execSync('node -e \"const{updateSolutionEvidence}=require(process.argv[1]);updateSolutionEvidence(process.argv[2],\\\\\"reflected\\\\\")\" '+require.resolve('../hooks/pre-tool-use.js')+' '+sol.name,{timeout:2000})}catch{}
          }
        }
      }catch{}
    });
  " 2>/dev/null
fi

echo '{"exitCode":0}' # Allow
`,

  // AfterTool: negative signals + write content tracking + micro-hints
  'after-tool.sh': `#!/bin/bash
# Tenetx AfterTool hook for Gemini CLI
INPUT=$(cat)
TOOL=$(echo "$INPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);console.log(i.tool||i.toolName||'')}catch{console.log('')}})")
OUTPUT=$(echo "$INPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);console.log(i.output||i.toolOutput||'')}catch{console.log('')}})")

# Negative signal detection for Bash
if [ "$TOOL" = "run_terminal_command" ] || [ "$TOOL" = "bash" ]; then
  if echo "$OUTPUT" | grep -qiE 'error TS[0-9]|BUILD FAILED|test.*fail|FAIL tests|npm ERR|compilation error|SyntaxError'; then
    # Record negative signal
    node -e "
      const fs=require('fs'),path=require('path'),os=require('os');
      const cachePath=path.join(os.homedir(),'.compound','state','injection-cache-gemini.json');
      if(!fs.existsSync(cachePath))process.exit(0);
      const cache=JSON.parse(fs.readFileSync(cachePath,'utf-8'));
      if(!Array.isArray(cache.solutions))process.exit(0);
      const exps=cache.solutions.filter(s=>s.status==='experiment');
      for(const sol of exps){
        try{require('child_process').execSync('node -e \"const{updateSolutionEvidence}=require(process.argv[1]);updateSolutionEvidence(process.argv[2],\\\\\"negative\\\\\")\" '+require.resolve('../hooks/pre-tool-use.js')+' '+sol.name,{timeout:2000})}catch{}
      }
    " 2>/dev/null
  fi

  # Micro-extraction hints on success
  if echo "$OUTPUT" | grep -qiE '[0-9]+ passed|tests? passed|PASS|build succeeded|compiled successfully'; then
    if ! echo "$OUTPUT" | grep -qiE 'fail|error'; then
      echo '{"message":"[tenetx] Success detected — record effective patterns with /compound"}'
      exit 0
    fi
  fi
fi

# Write content tracking
if [ "$TOOL" = "write_file" ] || [ "$TOOL" = "replace_in_file" ]; then
  echo "$INPUT" | node -e "
    const fs=require('fs'),path=require('path'),os=require('os');
    process.stdin.resume();let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try{
        const i=JSON.parse(d);
        const fp=i.input?.path||'';
        const content=i.input?.content||i.input?.new_content||'';
        if(!fp||!content)return;
        const histPath=path.join(os.homedir(),'.compound','state','write-history.jsonl');
        fs.mkdirSync(path.dirname(histPath),{recursive:true});
        fs.appendFileSync(histPath,JSON.stringify({filePath:fp.slice(-100),contentSnippet:content.slice(0,200),contentLength:content.length,fileExtension:path.extname(fp),timestamp:new Date().toISOString(),sessionId:'gemini'})+'\\n');
      }catch{}
    });
  " 2>/dev/null
fi

echo '{}'
`,

  // BeforeAgent (UserPromptSubmit equivalent): solution injection + prompt learning
  'before-agent.sh': `#!/bin/bash
# Tenetx BeforeAgent hook for Gemini CLI
# Injects relevant solutions + records prompt for learning
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);console.log(i.prompt||i.userPrompt||i.message||'')}catch{console.log('')}})")

if [ -n "$PROMPT" ]; then
  # Record prompt for pattern learning
  node -e "
    const fs=require('fs'),path=require('path'),os=require('os');
    const histPath=path.join(os.homedir(),'.compound','state','prompt-history.jsonl');
    fs.mkdirSync(path.dirname(histPath),{recursive:true});
    fs.appendFileSync(histPath,JSON.stringify({prompt:process.argv[1].slice(0,500),timestamp:new Date().toISOString(),sessionId:'gemini'})+'\\n');
  " "\$PROMPT" 2>/dev/null

  # Inject relevant solutions (simplified tag matching)
  SOLUTIONS=\$(node -e "
    const fs=require('fs'),path=require('path'),os=require('os');
    const solDir=path.join(os.homedir(),'.compound','me','solutions');
    if(!fs.existsSync(solDir)){process.exit(0);}
    const prompt=process.argv[1].toLowerCase();
    const words=prompt.replace(/[^a-z0-9\\s]/g,' ').split(/\\s+/).filter(w=>w.length>1);
    const matched=[];
    for(const f of fs.readdirSync(solDir).filter(f=>f.endsWith('.md')).slice(0,50)){
      const content=fs.readFileSync(path.join(solDir,f),'utf-8');
      const tagMatch=content.match(/tags:\\s*\\[([^\\]]*)\\]/);
      if(!tagMatch)continue;
      const tags=tagMatch[1].split(',').map(t=>t.trim().replace(/\\\"/g,'').toLowerCase());
      const overlap=words.filter(w=>tags.some(t=>t===w||t.startsWith(w)||w.startsWith(t)));
      if(overlap.length>=2){
        const nameMatch=content.match(/name:\\s*\\\"?([^\\\"\\n]+)/);
        const statusMatch=content.match(/status:\\s*\\\"?([^\\\"\\n]+)/);
        const bodyStart=content.indexOf('## Content');
        const body=bodyStart>0?content.slice(bodyStart+11,bodyStart+500).trim():'';
        matched.push({name:nameMatch?.[1]||f,status:statusMatch?.[1]||'unknown',body:body.slice(0,300),overlap:overlap.length});
      }
    }
    matched.sort((a,b)=>b.overlap-a.overlap);
    if(matched.length>0){
      const inject=matched.slice(0,3).map(m=>'['+m.status+'] '+m.name+': '+m.body).join('\\n\\n');
      console.log(inject);
    }
  " "\$PROMPT" 2>/dev/null)

  if [ -n "\$SOLUTIONS" ]; then
    echo "{\\"message\\":\\"<tenetx-solutions>\\nRelevant patterns from previous work:\\n\$SOLUTIONS\\n</tenetx-solutions>\\"}"
    exit 0
  fi
fi

echo '{}'
`,

  // SessionStart: extraction + pattern detection + lifecycle
  'session-start.sh': `#!/bin/bash
# Tenetx SessionStart hook for Gemini CLI
# Sync solutions + run extraction + detect patterns + lifecycle check
tenetx sync gemini --quiet 2>/dev/null || true

# Run extraction if new commits exist
if git rev-parse --git-dir > /dev/null 2>&1; then
  node -e "
    (async()=>{
      try{
        const{runExtraction,isExtractionPaused}=await import(require.resolve('tenetx').replace('cli.js','engine/compound-extractor.js'));
        if(!isExtractionPaused()){await runExtraction(process.cwd(),'gemini');}
      }catch{}
      try{
        const{detectPreferencePatterns,detectContentPatterns,detectWorkflowPatterns}=await import(require.resolve('tenetx').replace('cli.js','engine/prompt-learner.js'));
        detectPreferencePatterns('gemini');
        detectContentPatterns('gemini');
        detectWorkflowPatterns('gemini');
      }catch{}
      try{
        const{runLifecycleCheck}=await import(require.resolve('tenetx').replace('cli.js','engine/compound-lifecycle.js'));
        runLifecycleCheck('gemini');
      }catch{}
    })();
  " 2>/dev/null
fi

echo '{}'
`,

  // PreCompress: compound extraction hint
  'pre-compress.sh': `#!/bin/bash
# Tenetx PreCompress hook for Gemini CLI
echo '{"message":"<compound-auto-extract>\\n[Tenetx] Context compression starting. Extract reusable patterns before context is lost:\\ntenetx compound --solution \\"title\\" \\"description including WHY\\"\\n\\nSkip if nothing worth extracting.\\n</compound-auto-extract>"}'
`,

  // SessionEnd: workflow completion
  'session-end.sh': `#!/bin/bash
# Tenetx SessionEnd hook for Gemini CLI
node -e "
  try{
    const{checkWorkflowCompletion}=require(require.resolve('tenetx').replace('cli.js','engine/workflow-compound.js'));
    checkWorkflowCompletion('gemini');
  }catch{}
" 2>/dev/null
echo '{}'
`,
};

/** Initialize tenetx for Gemini CLI with FULL compound learning */
export function initGemini(cwd: string): { files: string[] } {
  const files: string[] = [];

  // 1. Sync solutions to GEMINI.md
  const { written } = syncToInstructionFile(cwd, 'gemini');
  files.push(written);

  // 2. Create hook scripts
  const hooksDir = path.join(cwd, '.gemini', 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  for (const [filename, content] of Object.entries(HOOK_SCRIPTS)) {
    const scriptPath = path.join(hooksDir, filename);
    fs.writeFileSync(scriptPath, content, { mode: 0o755 });
    files.push(scriptPath);
  }

  // 3. Create .gemini/settings.json with all hooks
  const geminiDir = path.join(cwd, '.gemini');
  const settingsPath = path.join(geminiDir, 'settings.json');

  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(settingsPath)) {
      existing = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch { /* new file */ }

  const hooksConfig = {
    SessionStart: [{
      hooks: [{
        name: 'tenetx-session',
        type: 'command',
        command: `bash ${path.join('.gemini', 'hooks', 'session-start.sh')}`,
        description: 'Tenetx: extraction + patterns + lifecycle',
      }],
    }],
    BeforeAgent: [{
      hooks: [{
        name: 'tenetx-before-agent',
        type: 'command',
        command: `bash ${path.join('.gemini', 'hooks', 'before-agent.sh')}`,
        description: 'Tenetx: solution injection + prompt learning',
      }],
    }],
    BeforeTool: [{
      matcher: '.*',
      hooks: [{
        name: 'tenetx-before-tool',
        type: 'command',
        command: `bash ${path.join('.gemini', 'hooks', 'before-tool.sh')}`,
        description: 'Tenetx: danger check + code reflection',
      }],
    }],
    AfterTool: [{
      matcher: '.*',
      hooks: [{
        name: 'tenetx-after-tool',
        type: 'command',
        command: `bash ${path.join('.gemini', 'hooks', 'after-tool.sh')}`,
        description: 'Tenetx: negative signals + write tracking',
      }],
    }],
    PreCompress: [{
      hooks: [{
        name: 'tenetx-pre-compress',
        type: 'command',
        command: `bash ${path.join('.gemini', 'hooks', 'pre-compress.sh')}`,
        description: 'Tenetx: compound extraction hint',
      }],
    }],
    SessionEnd: [{
      hooks: [{
        name: 'tenetx-session-end',
        type: 'command',
        command: `bash ${path.join('.gemini', 'hooks', 'session-end.sh')}`,
        description: 'Tenetx: workflow completion check',
      }],
    }],
  };

  const merged = { ...existing, hooks: { ...(existing.hooks as Record<string, unknown> ?? {}), ...hooksConfig } };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2));
  files.push(settingsPath);

  // 4. Create compound command
  const commandsDir = path.join(geminiDir, 'commands');
  fs.mkdirSync(commandsDir, { recursive: true });
  const compoundCmd = path.join(commandsDir, 'compound.toml');
  if (!fs.existsSync(compoundCmd)) {
    fs.writeFileSync(compoundCmd, `name = "compound"\ndescription = "Extract and accumulate coding patterns"\n\n[command]\ntype = "shell"\nshell = "tenetx compound"\n`);
    files.push(compoundCmd);
  }

  return { files };
}

/** Sync current solutions to Gemini GEMINI.md */
export function syncGemini(cwd: string, quiet = false): void {
  const { written, solutionCount } = syncToInstructionFile(cwd, 'gemini');
  if (!quiet) {
    console.log(`\n  ✓ Synced ${solutionCount} solutions to ${written}\n`);
  }
}
