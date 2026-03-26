#!/usr/bin/env node
/**
 * Tenetx — PreCompact Hook
 *
 * 컨텍스트 압축(compaction) 전 상태 보존.
 * - 현재 활성 모드 상태 스냅샷
 * - 진행 중인 작업 요약 저장
 * - handoff 파일 생성 (압축 후 복구용)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createLogger } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';

const log = createLogger('pre-compact');

const COMPOUND_HOME = path.join(os.homedir(), '.compound');
const STATE_DIR = path.join(COMPOUND_HOME, 'state');
const HANDOFFS_DIR = path.join(COMPOUND_HOME, 'handoffs');

/** 활성 모드 상태 수집 */
function collectActiveStates(): Array<{ mode: string; data: Record<string, unknown> }> {
  const active: Array<{ mode: string; data: Record<string, unknown> }> = [];

  if (!fs.existsSync(STATE_DIR)) return active;

  try {
    for (const f of fs.readdirSync(STATE_DIR)) {
      if (!f.endsWith('-state.json') || f.startsWith('context-guard') || f.startsWith('skill-cache')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(STATE_DIR, f), 'utf-8'));
        if (data.active) {
          active.push({ mode: f.replace('-state.json', ''), data });
        }
      } catch (e) { log.debug(`상태 파일 파싱 실패 — skip`, e); }
    }
  } catch (e) {
    log.debug('상태 디렉토리 읽기 실패', e);
  }

  return active;
}

/** compaction 전 스냅샷 저장 */
function saveCompactionSnapshot(sessionId: string): string | null {
  const activeStates = collectActiveStates();
  if (activeStates.length === 0) return null;

  fs.mkdirSync(HANDOFFS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = path.join(HANDOFFS_DIR, `${timestamp}-pre-compact.md`);

  const lines = [
    '# Pre-Compaction Snapshot',
    `- Session: ${sessionId}`,
    `- Time: ${new Date().toISOString()}`,
    `- Reason: context compaction`,
    '',
    '## Active Modes',
  ];

  for (const { mode, data } of activeStates) {
    lines.push(`### ${mode}`);
    lines.push(`- Prompt: ${(data.prompt as string) ?? 'N/A'}`);
    lines.push(`- Started: ${(data.startedAt as string) ?? 'N/A'}`);
    lines.push('');
  }

  lines.push('## Recovery');
  lines.push('This snapshot was automatically created before compaction.');
  lines.push('Active modes are preserved in state files even after compaction.');

  fs.writeFileSync(snapshotPath, lines.join('\n'));
  return snapshotPath;
}

/** 7일 이상 된 handoff 파일 정리 */
function cleanOldHandoffs(): void {
  if (!fs.existsSync(HANDOFFS_DIR)) return;
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  try {
    for (const f of fs.readdirSync(HANDOFFS_DIR)) {
      const p = path.join(HANDOFFS_DIR, f);
      const stat = fs.statSync(p);
      if (now - stat.mtimeMs > MAX_AGE_MS) {
        fs.unlinkSync(p);
      }
    }
  } catch (e) { log.debug('old handoff cleanup failed — stale files may remain in handoffs dir', e); }
}

async function main(): Promise<void> {
  const data = await readStdinJSON() ?? {};

  const sessionId = (data.session_id as string) ?? 'default';

  // 오래된 handoff 정리
  cleanOldHandoffs();

  const compoundHint = `
<compound-auto-extract>
[Tenetx] 컨텍스트 압축이 시작됩니다. 압축 전에 이 세션에서 배운 것을 축적하세요.

이 대화에서 재사용 가능한 패턴이 있다면 다음 명령어로 저장하세요:
tenetx compound --solution "제목" "내용 (왜 이 접근을 사용했는지 포함)"

추출 기준:
- 다른 프로젝트/세션에서도 적용 가능한 것만
- 일회성 우회/핫픽스는 제외
- 추출할 것이 없으면 무시하고 작업을 계속하세요

이 메시지는 자동 생성되었습니다. 강제가 아닌 제안입니다.
</compound-auto-extract>`;

  // 스냅샷 저장
  try {
    const snapshotPath = saveCompactionSnapshot(sessionId);
    if (snapshotPath) {
      console.log(JSON.stringify({
        result: 'approve',
        message: `<compound-compact-info>\n[Tenetx] Pre-compaction state snapshot saved: ${path.basename(snapshotPath)}\nActive modes are preserved after compaction.\n</compound-compact-info>\n${compoundHint}`,
      }));
      return;
    }
  } catch (e) {
    log.debug('스냅샷 저장 실패', e);
  }

  console.log(JSON.stringify({ result: 'approve', message: compoundHint }));
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(JSON.stringify({ result: 'approve' }));
});
