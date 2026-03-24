/**
 * Tenetx — GitHub Copilot CLI Full Adapter
 *
 * Copilot hook mapping:
 *   preToolUse → danger check + code reflection (can block with "deny")
 *   postToolUse → negative signals + write tracking (output ignored, but code runs)
 *   userPromptSubmitted → prompt learning (output ignored)
 *   sessionStart → extraction + lifecycle + solution sync
 *   sessionEnd → workflow completion
 *   errorOccurred → negative signal attribution
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { syncToInstructionFile } from './adapter.js';

/** Initialize tenetx for Copilot CLI with full compound learning */
export function initCopilot(cwd: string): { files: string[] } {
  const files: string[] = [];

  // 1. Sync solutions to .github/copilot-instructions.md
  const { written } = syncToInstructionFile(cwd, 'copilot');
  files.push(written);

  // 2. Create hook scripts
  const hooksDir = path.join(cwd, '.github', 'hooks');
  const scriptsDir = path.join(hooksDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });

  // preToolUse script: danger check + code reflection
  const preToolScript = path.join(scriptsDir, 'tenetx-pre-tool.sh');
  fs.writeFileSync(preToolScript, `#!/bin/bash
# Tenetx preToolUse for Copilot CLI
INPUT=$(cat)
TOOL=$(echo "$INPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).toolName||'')}catch{console.log('')}})")
CMD=$(echo "$INPUT" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const i=JSON.parse(d);console.log(i.toolArgs?.command||'')}catch{console.log('')}})")

# Dangerous command blocking
if [ "$TOOL" = "bash" ]; then
  if echo "$CMD" | grep -qE 'rm\\s+-rf\\s+[/~]|git\\s+push\\s+--force|drop\\s+(table|database)'; then
    echo '{"permissionDecision":"deny","permissionDecisionReason":"[tenetx] Dangerous command blocked"}'
    exit 0
  fi
fi

# Code reflection for Write/Edit tools
if [ "$TOOL" = "write_file" ] || [ "$TOOL" = "edit_file" ] || [ "$TOOL" = "insert_edit" ]; then
  echo "$INPUT" | node -e "
    const fs=require('fs'),path=require('path'),os=require('os');
    process.stdin.resume();let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      try{
        const i=JSON.parse(d);
        const code=JSON.stringify(i.toolArgs||{});
        const cachePath=path.join(os.homedir(),'.compound','state','injection-cache-copilot.json');
        if(!fs.existsSync(cachePath))return;
        const cache=JSON.parse(fs.readFileSync(cachePath,'utf-8'));
        if(!Array.isArray(cache.solutions))return;
        for(const sol of cache.solutions){
          if(!Array.isArray(sol.identifiers)||sol.identifiers.length===0)continue;
          const matched=sol.identifiers.filter(id=>id.length>=4&&code.includes(id));
          if(matched.length>=Math.min(2,sol.identifiers.length)){
            const solDir=path.join(os.homedir(),'.compound','me','solutions');
            const files=fs.readdirSync(solDir).filter(f=>f.endsWith('.md'));
            for(const file of files){
              const fp=path.join(solDir,file);
              const content=fs.readFileSync(fp,'utf-8');
              if(!content.includes(sol.name))continue;
              const m=content.match(/reflected:\\s*(\\d+)/);
              if(m){fs.writeFileSync(fp,content.replace(/reflected:\\s*\\d+/,'reflected: '+(parseInt(m[1])+1)))}
              break;
            }
          }
        }
      }catch{}
    });
  " 2>/dev/null
fi

echo '{"permissionDecision":"allow"}'
`, { mode: 0o755 });
  files.push(preToolScript);

  // postToolUse script: negative signals + write tracking
  const postToolScript = path.join(scriptsDir, 'tenetx-post-tool.sh');
  fs.writeFileSync(postToolScript, `#!/bin/bash
# Tenetx postToolUse for Copilot (output ignored by Copilot, but code still runs)
INPUT=$(cat)

# Negative signal detection
echo "$INPUT" | node -e "
  const fs=require('fs'),path=require('path'),os=require('os');
  process.stdin.resume();let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try{
      const i=JSON.parse(d);
      const output=i.toolOutput||i.output||'';
      if(!output)return;
      const isError=/error TS|BUILD FAILED|test.*fail|FAIL tests|npm ERR|SyntaxError/i.test(output);
      if(!isError)return;
      const cachePath=path.join(os.homedir(),'.compound','state','injection-cache-copilot.json');
      if(!fs.existsSync(cachePath))return;
      const cache=JSON.parse(fs.readFileSync(cachePath,'utf-8'));
      if(!Array.isArray(cache.solutions))return;
      for(const sol of cache.solutions.filter(s=>s.status==='experiment')){
        const solDir=path.join(os.homedir(),'.compound','me','solutions');
        const files=fs.readdirSync(solDir).filter(f=>f.endsWith('.md'));
        for(const file of files){
          const fp=path.join(solDir,file);
          const content=fs.readFileSync(fp,'utf-8');
          if(!content.includes(sol.name))continue;
          const m=content.match(/negative:\\s*(\\d+)/);
          if(m){fs.writeFileSync(fp,content.replace(/negative:\\s*\\d+/,'negative: '+(parseInt(m[1])+1)))}
          break;
        }
      }
    }catch{}
  });
" 2>/dev/null

# Write content tracking
echo "$INPUT" | node -e "
  const fs=require('fs'),path=require('path'),os=require('os');
  process.stdin.resume();let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try{
      const i=JSON.parse(d);
      const fp=i.toolArgs?.path||'';
      const content=i.toolArgs?.content||'';
      if(!fp||!content)return;
      const histPath=path.join(os.homedir(),'.compound','state','write-history.jsonl');
      fs.mkdirSync(path.dirname(histPath),{recursive:true});
      fs.appendFileSync(histPath,JSON.stringify({filePath:fp.slice(-100),contentSnippet:content.slice(0,200),contentLength:content.length,fileExtension:path.extname(fp),timestamp:new Date().toISOString(),sessionId:'copilot'})+'\\n');
    }catch{}
  });
" 2>/dev/null
`, { mode: 0o755 });
  files.push(postToolScript);

  // userPromptSubmitted: prompt learning
  const promptScript = path.join(scriptsDir, 'tenetx-prompt.sh');
  fs.writeFileSync(promptScript, `#!/bin/bash
# Tenetx userPromptSubmitted for Copilot
INPUT=$(cat)
echo "$INPUT" | node -e "
  const fs=require('fs'),path=require('path'),os=require('os');
  process.stdin.resume();let d='';
  process.stdin.on('data',c=>d+=c);
  process.stdin.on('end',()=>{
    try{
      const i=JSON.parse(d);
      const prompt=i.prompt||i.message||'';
      if(!prompt)return;
      const histPath=path.join(os.homedir(),'.compound','state','prompt-history.jsonl');
      fs.mkdirSync(path.dirname(histPath),{recursive:true});
      fs.appendFileSync(histPath,JSON.stringify({prompt:prompt.slice(0,500),timestamp:new Date().toISOString(),sessionId:'copilot'})+'\\n');
    }catch{}
  });
" 2>/dev/null
`, { mode: 0o755 });
  files.push(promptScript);

  // sessionStart: extraction + lifecycle
  const sessionScript = path.join(scriptsDir, 'tenetx-session.sh');
  fs.writeFileSync(sessionScript, `#!/bin/bash
# Tenetx sessionStart for Copilot
tenetx sync copilot --quiet 2>/dev/null || true
node -e "
  (async()=>{
    try{const{runExtraction,isExtractionPaused}=await import(require.resolve('tenetx').replace('cli.js','engine/compound-extractor.js'));if(!isExtractionPaused())await runExtraction(process.cwd(),'copilot')}catch{}
    try{const{detectPreferencePatterns,detectContentPatterns,detectWorkflowPatterns}=await import(require.resolve('tenetx').replace('cli.js','engine/prompt-learner.js'));detectPreferencePatterns('copilot');detectContentPatterns('copilot');detectWorkflowPatterns('copilot')}catch{}
    try{const{runLifecycleCheck}=await import(require.resolve('tenetx').replace('cli.js','engine/compound-lifecycle.js'));runLifecycleCheck('copilot')}catch{}
  })();
" 2>/dev/null
`, { mode: 0o755 });
  files.push(sessionScript);

  // 3. Create .github/hooks/tenetx.json
  const hooksJsonPath = path.join(hooksDir, 'tenetx.json');
  const hooksConfig = {
    version: 1,
    hooks: {
      sessionStart: [{ type: 'command', bash: path.join('.github', 'hooks', 'scripts', 'tenetx-session.sh'), timeoutSec: 10 }],
      preToolUse: [{ type: 'command', bash: path.join('.github', 'hooks', 'scripts', 'tenetx-pre-tool.sh'), timeoutSec: 5 }],
      postToolUse: [{ type: 'command', bash: path.join('.github', 'hooks', 'scripts', 'tenetx-post-tool.sh'), timeoutSec: 5 }],
      userPromptSubmitted: [{ type: 'command', bash: path.join('.github', 'hooks', 'scripts', 'tenetx-prompt.sh'), timeoutSec: 3 }],
    },
  };
  fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2));
  files.push(hooksJsonPath);

  // 4. Create compound agent
  const agentsDir = path.join(cwd, '.github', 'agents');
  fs.mkdirSync(agentsDir, { recursive: true });
  const agentPath = path.join(agentsDir, 'compound.agent.md');
  if (!fs.existsSync(agentPath)) {
    fs.writeFileSync(agentPath, `---\nname: compound\ndescription: Extract reusable patterns from this session\n---\n\nAnalyze this session and extract patterns:\n\`\`\`bash\ntenetx compound --solution "name" "description with WHY"\n\`\`\`\n\nFocus on decisions, error fixes, anti-patterns. Skip one-off fixes.\n`);
    files.push(agentPath);
  }

  // Note about CLAUDE.md
  if (fs.existsSync(path.join(cwd, 'CLAUDE.md'))) {
    console.log('  \u2139 Copilot reads your CLAUDE.md natively \u2014 solutions are auto-available.');
  }

  return { files };
}

/** Sync solutions to Copilot */
export function syncCopilot(cwd: string, quiet = false): void {
  const { written, solutionCount } = syncToInstructionFile(cwd, 'copilot');
  if (!quiet) {
    console.log(`\n  \u2713 Synced ${solutionCount} solutions to ${written}`);
    if (fs.existsSync(path.join(cwd, 'CLAUDE.md'))) {
      console.log('  \u2139 Copilot also reads CLAUDE.md (no extra sync needed)');
    }
    console.log();
  }
}
