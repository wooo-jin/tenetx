/**
 * Tenetx — Plugin Signal Protocol
 *
 * 플러그인 간 컨텍스트 주입량을 상호 인지하기 위한 파일 기반 시그널.
 * 현재는 tenetx만 시그널을 쓰지만, 다른 플러그인도 같은 프로토콜을
 * 채택하면 동적 버짓 조율이 가능해집니다.
 *
 * 시그널 디렉토리: ~/.claude/plugin-signals/
 * 파일 형식: {pluginName}-{sessionId}.json
 * TTL: 30분 (자동 정리)
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const SIGNAL_DIR = path.join(os.homedir(), '.claude', 'plugin-signals');
const SIGNAL_TTL_MS = 30 * 60 * 1000; // 30분

export interface PluginSignal {
  pluginName: string;
  hookEvent: string;
  charsInjected: number;
  timestamp: string;
}

/** tenetx의 주입 시그널을 기록합니다 */
export function writeSignal(sessionId: string, hookEvent: string, charsInjected: number): void {
  try {
    fs.mkdirSync(SIGNAL_DIR, { recursive: true });
    // 경로 탈출 방지: sessionId에서 디렉토리 구분자와 위험 문자 제거
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filePath = path.join(SIGNAL_DIR, `tenetx-${safeId}.json`);
    const signal: PluginSignal = {
      pluginName: 'tenetx',
      hookEvent,
      charsInjected,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(signal));

    // 쓰기 시점에 stale 시그널 정리 (읽기와 분리)
    cleanupStaleSignals();
  } catch {
    // 시그널 기록 실패는 무시
  }
}

/** stale 시그널 파일을 정리합니다 (읽기와 분리된 side-effect) */
export function cleanupStaleSignals(): void {
  try {
    if (!fs.existsSync(SIGNAL_DIR)) return;
    const now = Date.now();

    for (const file of fs.readdirSync(SIGNAL_DIR)) {
      if (!file.endsWith('.json')) continue;
      try {
        const filePath = path.join(SIGNAL_DIR, file);
        // 파일 크기 체크 — 1KB 초과 시그널은 비정상 (DoS 방지)
        const stat = fs.statSync(filePath);
        if (stat.size > 1024) { fs.unlinkSync(filePath); continue; }

        const data: PluginSignal = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const age = now - new Date(data.timestamp).getTime();
        if (!Number.isFinite(age) || age > SIGNAL_TTL_MS) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // 개별 파일 처리 실패는 무시
      }
    }
  } catch {
    // 디렉토리 접근 실패
  }
}

/** 다른 플러그인의 시그널을 읽어서 총 주입량을 반환합니다 (읽기 전용) */
export function readOtherSignals(_sessionId: string): PluginSignal[] {
  const signals: PluginSignal[] = [];
  try {
    if (!fs.existsSync(SIGNAL_DIR)) return signals;
    const now = Date.now();

    for (const file of fs.readdirSync(SIGNAL_DIR)) {
      if (file.startsWith('tenetx-')) continue;
      if (!file.endsWith('.json')) continue;

      try {
        const filePath = path.join(SIGNAL_DIR, file);
        // 파일 크기 체크 — 1KB 초과 시그널은 비정상
        const stat = fs.statSync(filePath);
        if (stat.size > 1024) continue;

        const data: PluginSignal = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const age = now - new Date(data.timestamp).getTime();

        // TTL 초과는 건너뜀 (삭제는 cleanupStaleSignals에서)
        if (!Number.isFinite(age) || age > SIGNAL_TTL_MS) continue;

        signals.push(data);
      } catch {
        // 개별 시그널 읽기 실패는 무시
      }
    }
  } catch {
    // 디렉토리 접근 실패
  }
  return signals;
}
