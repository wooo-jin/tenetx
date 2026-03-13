import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { buildEnv } from './config-injector.js';
import { STATE_DIR } from './paths.js';
import { parseMode, getModeConfig } from '../engine/modes.js';
import type { ExecutionMode } from '../engine/modes.js';
import { ModelRouter } from '../engine/router.js';
import type { RoutingPreset } from '../engine/router.js';
import { matchSolutions } from '../engine/solution-matcher.js';
import type { HarnessContext } from './types.js';
import { loadGlobalConfig } from './global-config.js';

/** CLI 플래그로 선택된 모드를 state 파일에 기록 */
function persistModeState(mode: ExecutionMode): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const statePath = path.join(STATE_DIR, `${mode}-state.json`);
    fs.writeFileSync(statePath, JSON.stringify({
      active: true,
      startedAt: new Date().toISOString(),
      source: 'cli-flag',
    }));
  } catch { /* state 저장 실패는 무시 */ }
}

/** 모드 종료 시 state 파일을 비활성화 */
function deactivateModeState(mode: ExecutionMode): void {
  try {
    const statePath = path.join(STATE_DIR, `${mode}-state.json`);
    if (!fs.existsSync(statePath)) return;
    const data = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    data.active = false;
    data.endedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(data));
  } catch { /* state 업데이트 실패는 무시 */ }
}

/** claude CLI 경로 탐색 */
function findClaude(): string {
  return 'claude';
}

/** Claude Code를 하네스 환경으로 실행 */
export async function spawnClaude(args: string[], context: HarnessContext): Promise<void> {
  const claudePath = findClaude();
  const env = buildEnv(context);

  // 실행 모드 파싱
  const { mode, cleanArgs } = parseMode(args);
  const modeConfig = getModeConfig(mode);

  if (mode !== 'normal') {
    console.log(`[tenet] Mode: ${modeConfig.description}`);
    // CLI 플래그로 모드가 선택된 경우 state에 기록 (session-recovery 훅 지원)
    persistModeState(mode);
  }

  // 모드별 환경변수 추가
  Object.assign(env, modeConfig.envOverrides);

  // 모델 라우팅 (프롬프트가 있으면 추천)
  const globalConfig = loadGlobalConfig();
  const routingPreset = globalConfig.modelRouting as RoutingPreset | undefined;
  const router = new ModelRouter(context.philosophy, routingPreset);
  const prompt = cleanArgs.find(a => !a.startsWith('-'));
  if (prompt) {
    const category = router.inferCategory(prompt);
    const recommended = router.recommend(category);
    env.COMPOUND_RECOMMENDED_MODEL = recommended;

    // 솔루션 매칭 (knowledge-comes-to-you)
    const matches = matchSolutions(prompt, context.scope, context.cwd);
    if (matches.length > 0) {
      console.log('[tenet] 관련 솔루션:');
      for (const m of matches.slice(0, 3)) {
        const scopeLabel = m.scope === 'me' ? 'Me' : m.scope === 'team' ? 'Team' : 'Project';
        console.log(`  💡 [${scopeLabel}] ${m.name}: ${m.summary}`);
      }
    }
  }

  // config.json에서 dangerouslySkipPermissions 기본값 적용
  if (globalConfig.dangerouslySkipPermissions && !cleanArgs.includes('--dangerously-skip-permissions')) {
    cleanArgs.unshift('--dangerously-skip-permissions');
  }

  // 최종 인자: 모드 인자 + 클린 인자
  const finalArgs = [...modeConfig.claudeArgs, ...cleanArgs];

  return new Promise((resolve, reject) => {
    const child = spawn(claudePath, finalArgs, {
      stdio: 'inherit',
      env: { ...process.env, ...env },
      cwd: context.cwd,
    });

    child.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('Claude Code가 설치되어 있지 않습니다. npm install -g @anthropic-ai/claude-code'));
      } else {
        reject(err);
      }
    });

    child.on('exit', (code) => {
      if (mode !== 'normal') {
        deactivateModeState(mode);
      }
      if (code === 0 || code === null) {
        resolve();
      } else {
        process.exit(code);
      }
    });
  });
}
