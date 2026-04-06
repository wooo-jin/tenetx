import { spawn, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { buildEnv } from './config-injector.js';
import type { V1HarnessContext } from './harness.js';
import { loadGlobalConfig } from './global-config.js';
import { createLogger } from './logger.js';

const log = createLogger('spawn');

/** claude CLI 경로 탐색 */
function findClaude(): string {
  return 'claude';
}

/**
 * 가장 최근 transcript 파일을 찾는다.
 * Claude Code는 세션 대화를 ~/.claude/projects/{sanitized-cwd}/{uuid}.jsonl에 저장.
 */
function findLatestTranscript(cwd: string): string | null {
  // Claude Code는 cwd의 /를 -로 치환하고 선행 -를 유지
  const sanitized = cwd.replace(/\//g, '-');
  const projectDir = path.join(os.homedir(), '.claude', 'projects', sanitized);
  if (!fs.existsSync(projectDir)) return null;

  const jsonlFiles = fs.readdirSync(projectDir)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(projectDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  return jsonlFiles.length > 0 ? path.join(projectDir, jsonlFiles[0].name) : null;
}


/**
 * 세션 종료 후 자동 compound 추출 + USER.md 업데이트.
 * auto-compound-runner.ts를 동기 실행하여 솔루션 추출 + 사용자 패턴 관찰.
 */
async function runAutoCompound(cwd: string, transcriptPath: string, sessionId: string): Promise<void> {
  console.log('\n[tenetx] 세션 분석 중... (자동 compound)');

  const runnerPath = path.join(path.dirname(new URL(import.meta.url).pathname), 'auto-compound-runner.js');
  try {
    execFileSync('node', [runnerPath, cwd, transcriptPath, sessionId], {
      cwd,
      timeout: 120_000,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    console.log('[tenetx] 자동 compound 완료\n');
  } catch (e) {
    log.debug('auto-compound 실패', e);
  }
}

/**
 * Transcript를 SQLite FTS5에 인덱싱 (추후 session-search MCP 도구용).
 */
async function indexTranscriptToFTS(cwd: string, transcriptPath: string, sessionId: string): Promise<void> {
  try {
    const { indexSession } = await import('./session-store.js');
    await indexSession(cwd, transcriptPath, sessionId);
  } catch (e) {
    log.debug('FTS5 인덱싱 실패 (session-store 미구현 시 정상)', e);
  }
}

/** Claude Code를 하네스 환경으로 실행 */
export async function spawnClaude(args: string[], context: V1HarnessContext): Promise<void> {
  const claudePath = findClaude();
  const env = buildEnv(context.cwd);
  const cleanArgs = [...args];

  // config.json에서 dangerouslySkipPermissions 기본값 적용
  const globalConfig = loadGlobalConfig();
  if (globalConfig.dangerouslySkipPermissions && !cleanArgs.includes('--dangerously-skip-permissions')) {
    cleanArgs.unshift('--dangerously-skip-permissions');
  }

  // 세션 시작 전 timestamp 기록 (종료 후 transcript 찾기 위해)
  const sessionStartTime = Date.now();

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

    child.on('exit', async (code) => {
      // 세션 종료 후 하네스 작업
      try {
        const transcript = findLatestTranscript(context.cwd);
        if (!transcript) {
          log.debug('transcript 파일을 찾을 수 없음');
        } else {
          const stat = fs.statSync(transcript);
          // 이 세션에서 생성/수정된 transcript만
          if (stat.mtimeMs <= sessionStartTime) {
            log.debug(`transcript mtime(${stat.mtimeMs}) <= sessionStart(${sessionStartTime}), 건너뜀`);
          } else {
            const sessionId = path.basename(transcript, '.jsonl');

            // 1. FTS5 인덱싱
            await indexTranscriptToFTS(context.cwd, transcript, sessionId);

            // 2. 자동 compound (10+ user 메시지인 경우만)
            const content = fs.readFileSync(transcript, 'utf-8');
            const userMsgCount = content.split('\n')
              .filter(l => { try { const t = JSON.parse(l).type; return t === 'user' || t === 'queue-operation'; } catch { return false; } })
              .length;

            if (userMsgCount >= 10) {
              await runAutoCompound(context.cwd, transcript, sessionId);
            } else {
              console.log(`[tenetx] 세션이 짧아 auto-compound 생략 (${userMsgCount} messages)`);
            }
          }
        }
      } catch (e) {
        console.error('[tenetx] 세션 종료 후 처리 실패:', e instanceof Error ? e.message : e);
      }

      if (code === 0 || code === null) {
        resolve();
      } else {
        process.exit(code);
      }
    });
  });
}
