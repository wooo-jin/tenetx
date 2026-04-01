import { spawn } from 'node:child_process';
import { buildEnv } from './config-injector.js';
import { matchSolutions } from '../engine/solution-matcher.js';
import type { HarnessContext } from './types.js';
import { loadGlobalConfig } from './global-config.js';

/** claude CLI 경로 탐색 */
function findClaude(): string {
  return 'claude';
}

/** Claude Code를 하네스 환경으로 실행 */
export async function spawnClaude(args: string[], context: HarnessContext): Promise<void> {
  const claudePath = findClaude();
  const env = buildEnv(context);

  const cleanArgs = [...args];

  // 솔루션 매칭 (knowledge-comes-to-you)
  const prompt = cleanArgs.find(a => !a.startsWith('-'));
  if (prompt) {
    const matches = matchSolutions(prompt, context.scope, context.cwd);
    if (matches.length > 0) {
      console.log('[tenetx] Related solutions:');
      for (const m of matches.slice(0, 3)) {
        const scopeLabel = m.scope === 'me' ? 'Me' : m.scope === 'team' ? 'Team' : 'Project';
        console.log(`  [${scopeLabel}] ${m.name}: ${m.summary}`);
      }
    }
  }

  // config.json에서 dangerouslySkipPermissions 기본값 적용
  const globalConfig = loadGlobalConfig();
  if (globalConfig.dangerouslySkipPermissions && !cleanArgs.includes('--dangerously-skip-permissions')) {
    cleanArgs.unshift('--dangerously-skip-permissions');
  }

  return new Promise((resolve, reject) => {
    const child = spawn(claudePath, cleanArgs, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      cwd: context.cwd,
    });

    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Claude Code is not installed. npm install -g @anthropic-ai/claude-code'));
      } else {
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        process.exit(code);
      }
    });
  });
}
