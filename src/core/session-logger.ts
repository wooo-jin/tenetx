import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { SESSIONS_DIR } from './paths.js';
import type { HarnessContext } from './types.js';
import { createLogger } from './logger.js';

const logger = createLogger('session-logger');

/** 세션 로그 파일에 저장되는 데이터 구조 */
interface SessionLog {
  sessionId: string;
  startTime: string;
  endTime?: string;
  durationMs?: number;
  cwd: string;
  philosophy: string;
  scope: string;
  mode: string;
}

/** 현재 세션 로그 파일 경로 (종료 시 업데이트에 사용) */
let currentSessionPath: string | null = null;
/** 세션 시작 시각 (duration 계산에 사용) */
let sessionStartMs: number | null = null;
/** exit/signal 리스너 등록 여부 (중복 등록 방지) */
let isBound = false;

/** UUID v4 생성 (node:crypto 활용) */
function generateUUID(): string {
  return crypto.randomUUID();
}

/** YYYY-MM-DD 형식의 날짜 문자열 반환 */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 세션 로그를 ~/.compound/sessions/{date}_{sessionId}.json 에 기록
 * harness.ts의 prepareHarness() 완료 후 호출
 */
export function startSessionLog(context: HarnessContext): void {
  try {
    // sessions 디렉토리가 없으면 생성
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });

    const sessionId = generateUUID();
    const startTime = new Date().toISOString();
    sessionStartMs = Date.now();

    // 모드 판별: 환경변수 또는 argv 기반
    const mode = process.env.COMPOUND_MODE ?? 'default';

    const log: SessionLog = {
      sessionId,
      startTime,
      cwd: context.cwd,
      philosophy: context.philosophy.name,
      scope: context.scope.summary,
      mode,
    };

    const filename = `${todayStr()}_${sessionId}.json`;
    currentSessionPath = path.join(SESSIONS_DIR, filename);

    fs.writeFileSync(currentSessionPath, JSON.stringify(log, null, 2));

    // 오래된 세션 로그 정리 (90일+)
    cleanOldSessions();

    // 프로세스 종료 시 자동으로 endTime/duration 업데이트 (한 번만 등록)
    if (!isBound) {
      isBound = true;
      process.on('exit', finalizeSessionLog);
      process.on('SIGINT', () => {
        finalizeSessionLog();
        process.exit(0);
      });
      process.on('SIGTERM', () => {
        finalizeSessionLog();
        process.exit(0);
      });
    }
  } catch (e) {
    logger.debug('세션 로그 시작 실패', e);
  }
}

const RETENTION_DAYS = 90;

/** 90일 이상 된 세션 로그 파일 삭제 */
function cleanOldSessions(): void {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return;
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    let deleted = 0;

    for (const file of files) {
      // 파일명에서 날짜 추출: YYYY-MM-DD_UUID.json
      const dateStr = file.slice(0, 10);
      const fileDate = new Date(dateStr).getTime();

      if (!Number.isNaN(fileDate) && fileDate < cutoff) {
        fs.unlinkSync(path.join(SESSIONS_DIR, file));
        deleted++;
      }
    }

    if (deleted > 0) {
      logger.debug(`${deleted}개 오래된 세션 로그 정리 (${RETENTION_DAYS}일+)`);
    }
  } catch (e) {
    logger.debug('세션 로그 정리 실패', e);
  }
}

/** 프로세스 종료 시 세션 로그에 endTime과 duration 추가 */
function finalizeSessionLog(): void {
  if (!currentSessionPath || !sessionStartMs) return;
  if (!fs.existsSync(currentSessionPath)) return;

  try {
    const raw = fs.readFileSync(currentSessionPath, 'utf-8');
    const log: SessionLog = JSON.parse(raw);
    const now = Date.now();
    log.endTime = new Date(now).toISOString();
    log.durationMs = now - sessionStartMs;
    fs.writeFileSync(currentSessionPath, JSON.stringify(log, null, 2));
  } catch (e) {
    logger.debug('세션 로그 종료 실패', e);
  }
  // 중복 호출 방지
  currentSessionPath = null;
  sessionStartMs = null;
}
