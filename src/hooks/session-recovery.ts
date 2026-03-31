#!/usr/bin/env node
/**
 * Tenetx — Session Recovery Hook
 *
 * Claude Code SessionStart 훅으로 등록.
 * 이전 세션에서 활성화된 지속 모드(ralph, autopilot, ultrawork)의
 * 상태를 복구하여 작업을 자동 재개합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../core/logger.js';

const log = createLogger('session-recovery');
import { atomicWriteJSON } from './shared/atomic-write.js';
import { sanitizeId } from './shared/sanitize-id.js';
import { isHookEnabled } from './hook-config.js';
import { approve, failOpen } from './shared/hook-response.js';
import { COMPOUND_HOME, STATE_DIR } from '../core/paths.js';

export interface Checkpoint {
  sessionId: string;
  mode: string;
  modifiedFiles: string[];
  lastToolCall: string;
  toolCallCount: number;
  timestamp: string;
  cwd: string;
}

/** 체크포인트 저장 */
export function saveCheckpoint(data: Checkpoint): void {
  try {
    const filePath = path.join(STATE_DIR, `checkpoint-${sanitizeId(data.sessionId)}.json`);
    atomicWriteJSON(filePath, data);
  } catch (e) {
    log.debug('체크포인트 저장 실패', e);
  }
}

/** Checkpoint 구조 검증 */
function isValidCheckpoint(data: unknown): data is Checkpoint {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.sessionId === 'string' &&
    typeof d.timestamp === 'string' &&
    typeof d.mode === 'string' &&
    typeof d.cwd === 'string' &&
    Array.isArray(d.modifiedFiles) &&
    typeof d.lastToolCall === 'string' &&
    typeof d.toolCallCount === 'number'
  );
}

/** ModeState 구조 검증 */
function isValidModeState(data: unknown): data is ModeState {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return typeof d.active === 'boolean' && typeof d.startedAt === 'string';
}

/** 체크포인트 로드 */
export function loadCheckpoint(sessionId: string): Checkpoint | null {
  try {
    const filePath = path.join(STATE_DIR, `checkpoint-${sanitizeId(sessionId)}.json`);
    if (fs.existsSync(filePath)) {
      const data: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (!isValidCheckpoint(data)) {
        log.debug('체크포인트 구조 검증 실패', { sessionId });
        return null;
      }
      return data;
    }
  } catch (e) {
    log.debug('체크포인트 로드 실패', e);
  }
  return null;
}

/** 오래된 체크포인트 삭제 */
export function cleanStaleCheckpoints(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  let cleaned = 0;
  try {
    if (!fs.existsSync(STATE_DIR)) return 0;
    const files = fs.readdirSync(STATE_DIR).filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
    const now = Date.now();
    for (const file of files) {
      const filePath = path.join(STATE_DIR, file);
      try {
        const parsed: unknown = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        if (!isValidCheckpoint(parsed)) {
          // 구조 검증 실패한 파일도 정리
          try { fs.unlinkSync(filePath); cleaned++; } catch (e) { log.debug(`invalid checkpoint unlink failed: ${filePath}`, e); }
          continue;
        }
        const age = now - new Date(parsed.timestamp).getTime();
        if (age > maxAgeMs) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {
        // 파싱 실패한 파일도 정리
        try { fs.unlinkSync(filePath); cleaned++; } catch (e) { log.debug(`corrupt checkpoint unlink failed: ${filePath}`, e); }
      }
    }
  } catch (e) {
    log.debug('스테일 체크포인트 정리 실패', e);
  }
  return cleaned;
}

interface ModeState {
  active: boolean;
  startedAt: string;
  prompt?: string;
  sessionId?: string;
  stage?: string;
  completedSteps?: string[];
}

const PERSISTENT_MODES = ['ralph', 'autopilot', 'ultrawork', 'team', 'pipeline'];

async function main(): Promise<void> {
  // SessionStart 훅은 stdin으로 세션 정보를 받음 (타임아웃 포함)
  const chunks: string[] = [];
  process.stdin.setEncoding('utf-8');
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      process.stdin.removeAllListeners('data');
      process.stdin.removeAllListeners('end');
      resolve();
    }, 2000);
    process.stdin.on('data', (chunk) => chunks.push(String(chunk)));
    process.stdin.on('end', () => { clearTimeout(timeout); resolve(); });
  });

  if (!isHookEnabled('session-recovery')) {
    console.log(approve());
    return;
  }

  if (!fs.existsSync(STATE_DIR)) {
    console.log(approve());
    return;
  }

  // 활성 모드 찾기
  const recoveryMessages: string[] = [];

  for (const mode of PERSISTENT_MODES) {
    const statePath = path.join(STATE_DIR, `${mode}-state.json`);
    if (!fs.existsSync(statePath)) continue;

    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      if (!isValidModeState(parsed)) {
        log.debug(`상태 파일 구조 검증 실패: ${mode}`);
        continue;
      }
      const state: ModeState = parsed;
      if (!state.active) continue;

      // 24시간 이상 경과한 상태는 만료
      const startedAt = new Date(state.startedAt).getTime();
      const elapsed = Date.now() - startedAt;
      if (elapsed > 24 * 60 * 60 * 1000) {
        fs.unlinkSync(statePath);
        continue;
      }

      const elapsedMinutes = Math.round(elapsed / 60000);
      // Security: 상태 파일의 사용자 입력을 XML에 삽입하기 전 이스케이프
      const escXml = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c);
      recoveryMessages.push(
        `<compound-recovery mode="${mode}">` +
        `\n${mode} mode from previous session has been recovered.` +
        `\nStarted: ${state.startedAt} (${elapsedMinutes} minutes ago)` +
        (state.prompt ? `\nOriginal request: ${escXml(state.prompt)}` : '') +
        (state.stage ? `\nCurrent stage: ${escXml(state.stage)}` : '') +
        (state.completedSteps?.length ? `\nCompleted steps: ${state.completedSteps.map((s: string) => escXml(s)).join(', ')}` : '') +
        `\n\nContinue the previous work. To stop, type "canceltenetx".` +
        `\n</compound-recovery>`
      );
    } catch (e) {
      log.debug(`상태 파일 파싱 실패`, e);
    }
  }

  // 미완료 체크포인트 감지
  try {
    const checkpointFiles = fs.readdirSync(STATE_DIR)
      .filter(f => f.startsWith('checkpoint-') && f.endsWith('.json'));
    for (const file of checkpointFiles) {
      try {
        const parsedCp: unknown = JSON.parse(fs.readFileSync(path.join(STATE_DIR, file), 'utf-8'));
        if (!isValidCheckpoint(parsedCp)) {
          log.debug(`체크포인트 파일 구조 검증 실패: ${file}`);
          continue;
        }
        const cp: Checkpoint = parsedCp;
        const age = Date.now() - new Date(cp.timestamp).getTime();
        if (age > 24 * 60 * 60 * 1000) {
          fs.unlinkSync(path.join(STATE_DIR, file));
          continue;
        }
        const elapsedMin = Math.round(age / 60000);
        const safeSessionId = String(cp.sessionId).replace(/[&"<>]/g, '_');
        const safeLastTool = String(cp.lastToolCall ?? '').replace(/[<>]/g, '_');
        const safeCwd = String(cp.cwd ?? '').replace(/[<>]/g, '_');
        recoveryMessages.push(
          `<compound-checkpoint session="${safeSessionId}">` +
          `\nIncomplete checkpoint found (${elapsedMin} minutes ago)` +
          `\n- Modified files: ${cp.modifiedFiles.length}` +
          `\n- Tool calls: ${cp.toolCallCount}` +
          `\n- Last tool: ${safeLastTool}` +
          `\n- Working directory: ${safeCwd}` +
          `\n</compound-checkpoint>`
        );
      } catch { /* 개별 파일 파싱 실패 무시 */ }
    }
  } catch (e) {
    log.debug('체크포인트 스캔 실패', e);
  }

  // pending-compound 마커 확인 (이전 세션에서 compound loop 필요 표시)
  const pendingPath = path.join(STATE_DIR, 'pending-compound.json');
  if (fs.existsSync(pendingPath)) {
    try {
      const pending = JSON.parse(fs.readFileSync(pendingPath, 'utf-8'));
      recoveryMessages.push(
        `<compound-pending>` +
        `\nCompound loop was scheduled in the previous session (${pending.promptCount ?? '?'} prompts).` +
        `\nRun \`tenetx compound\` to extract patterns/solutions.` +
        `\n</compound-pending>`
      );
      // 마커 삭제 (한 번만 안내)
      fs.unlinkSync(pendingPath);
    } catch (e) {
      log.debug('pending-compound 마커 읽기 실패', e);
    }
  }

  // 핸드오프 파일 확인
  const handoffDir = path.join(COMPOUND_HOME, 'handoffs');
  if (fs.existsSync(handoffDir)) {
    try {
      const handoffs = fs.readdirSync(handoffDir)
        .filter(f => f.endsWith('.md'))
        .sort();

      if (handoffs.length > 0) {
        const latest = handoffs[handoffs.length - 1];
        const latestPath = path.join(handoffDir, latest);
        // Security: symlink 방지 + XML 이스케이프
        if (fs.lstatSync(latestPath).isSymbolicLink()) throw new Error('symlink rejected');
        const raw = fs.readFileSync(latestPath, 'utf-8');
        const safeName = latest.replace(/[&"<>]/g, '_');
        const escaped = raw.replace(/<\/?[a-zA-Z][\w-]*(?:\s[^>]*)?\/?>/g, m => m.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
        recoveryMessages.push(
          `<compound-handoff file="${safeName}">\n${escaped}\n</compound-handoff>`
        );
        // 마커 삭제 (한 번만 안내 — pending-compound.json과 동일 패턴)
        try { fs.unlinkSync(latestPath); } catch (e) { log.debug('handoff 파일 삭제 실패', e); }
      }
    } catch (e) { log.debug('handoff 파일 읽기 실패', e); }
  }

  // Compound v3: Trigger lazy extraction — fire-and-forget (성능: 3초→0초)
  // SessionStart 훅은 3초 타임아웃이므로 git diff 분석을 동기 실행하면 초과함
  const sessionId = `session-${Date.now()}`;
  try {
    const { runExtraction, isExtractionPaused } = await import('../engine/compound-extractor.js');
    if (!isExtractionPaused()) {
      const cwd = process.env.COMPOUND_CWD ?? process.cwd();
      // 결과를 기다리지 않음 — 백그라운드에서 추출
      runExtraction(cwd, sessionId).catch(e => log.debug('lazy extraction 실패', e));
    }
  } catch (e) { log.debug('lazy extraction import 실패', e); }

  // Compound v3: Detect preference patterns → 사용자에게 피드백
  try {
    const { detectPreferencePatterns } = await import('../engine/prompt-learner.js');
    const patterns = detectPreferencePatterns(sessionId);
    if (patterns.created.length > 0) {
      recoveryMessages.push(
        `[tenetx] 새로 학습됨: ${patterns.created.join(', ')}`,
      );
    }
    if (patterns.detected.length > 0 && patterns.created.length === 0) {
      // 새로 생성된 건 없지만 감지된 패턴이 있으면 간략히 표시
      recoveryMessages.push(
        `[tenetx] 학습된 패턴 ${patterns.detected.length}개 활성 중`,
      );
    }
  } catch (e) { log.debug('preference pattern detection 실패', e); }

  // Compound v3: Detect content patterns from write history
  try {
    const { detectContentPatterns } = await import('../engine/prompt-learner.js');
    const contentPatterns = detectContentPatterns(sessionId);
    if (contentPatterns.created.length > 0) {
      recoveryMessages.push(`[tenetx] 콘텐츠 패턴 학습: ${contentPatterns.created.join(', ')}`);
    }
  } catch (e) { log.debug('content pattern detection 실패', e); }

  // Compound v3: Detect workflow patterns from mode usage
  try {
    const { detectWorkflowPatterns } = await import('../engine/prompt-learner.js');
    const workflowPatterns = detectWorkflowPatterns(sessionId);
    if (workflowPatterns.created.length > 0) {
      recoveryMessages.push(`[tenetx] 워크플로우 패턴 학습: ${workflowPatterns.created.join(', ')}`);
    }
  } catch (e) { log.debug('workflow pattern detection 실패', e); }

  // Compound v3: Run lifecycle check once per day
  try {
    const { runLifecycleCheck } = await import('../engine/compound-lifecycle.js');
    const lastLifecyclePath = path.join(STATE_DIR, 'last-lifecycle.json');
    let shouldRun = true;
    try {
      if (fs.existsSync(lastLifecyclePath)) {
        const data = JSON.parse(fs.readFileSync(lastLifecyclePath, 'utf-8'));
        const last = new Date(data.lastRun).getTime();
        shouldRun = Date.now() - last > 24 * 60 * 60 * 1000;
      }
    } catch { /* last-lifecycle.json parse failure — run lifecycle check anyway */ }
    if (shouldRun) {
      runLifecycleCheck(sessionId);
      const { atomicWriteJSON: writeJSON } = await import('./shared/atomic-write.js');
      writeJSON(lastLifecyclePath, { lastRun: new Date().toISOString() });
    }
  } catch (e) { log.debug('lifecycle check 실패', e); }

  if (recoveryMessages.length > 0) {
    console.log(approve(recoveryMessages.join('\n\n')));
  } else {
    console.log(approve());
  }
}

// ESM main guard: 다른 모듈에서 import 시 main() 실행 방지
// realpathSync로 symlink 해석 (플러그인 캐시가 symlink일 때 경로 불일치 방지)
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
    console.log(failOpen());
  });
}
