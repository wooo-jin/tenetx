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
import { createLogger } from '../core/logger.js';
import { readStdinJSON } from './shared/read-stdin.js';
import { isHookEnabled } from './hook-config.js';
import { approve, failOpen } from './shared/hook-response.js';
import { COMPOUND_HOME, STATE_DIR } from '../core/paths.js';

const log = createLogger('pre-compact');

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

  if (!isHookEnabled('pre-compact')) {
    console.log(approve());
    return;
  }

  const sessionId = (data.session_id as string) ?? 'default';

  // 오래된 handoff 정리
  cleanOldHandoffs();

  // 기존 behavioral 패턴 목록 로드 (중복 방지)
  let existingSolutions: string[] = [];
  try {
    const solDir = path.join(COMPOUND_HOME, 'me', 'behavior');
    if (fs.existsSync(solDir)) {
      existingSolutions = fs.readdirSync(solDir).filter(f => f.endsWith('.md')).map(f => f.replace('.md', ''));
    }
  } catch { /* ignore */ }
  const existingList = existingSolutions.length > 0
    ? `\nAlready captured (skip these): ${existingSolutions.slice(-10).join(', ')}`
    : '';

  const compoundHint = `
<tenetx-compound-extract>
Context is about to be compacted. Before it's lost, analyze this conversation and extract the USER's behavioral patterns.

DO NOT extract code patterns or technical solutions. Extract HOW THE USER THINKS:
- Decision-making style (e.g., "always verifies before trusting", "prefers data over intuition")
- Communication preferences (e.g., "wants Korean responses", "hates long explanations")
- Workflow habits (e.g., "always reviews 3+ times", "plans before implementing")
- Values/philosophy (e.g., "quality over speed", "pragmatic over theoretical")

For each pattern found, write a file to ~/.compound/me/behavior/{slug}.md in this EXACT format:
\`\`\`
---
name: "{slug}"
version: 1
kind: "{thinking|preference|workflow}"
observedCount: 1
confidence: 0.6
tags: ["thinking", "{category}", "{specific-tag}"]
created: "${new Date().toISOString().split('T')[0]}"
updated: "${new Date().toISOString().split('T')[0]}"
source: "pre-compact"
---

## Context
{When and why this pattern was observed in this conversation}

## Content
{Concrete description of the behavioral pattern, with specific examples from this session}
\`\`\`

Rules:
- Extract 0-3 patterns MAX (quality over quantity)
- Skip if nothing non-obvious was observed
- Skip patterns that are trivially obvious ("uses TypeScript")
- Each pattern must be specific enough to change Claude's behavior in future sessions${existingList}
</tenetx-compound-extract>`;

  // 스냅샷 저장
  try {
    const snapshotPath = saveCompactionSnapshot(sessionId);
    if (snapshotPath) {
      console.log(approve(`<compound-compact-info>\n[Tenetx] Pre-compaction state snapshot saved: ${path.basename(snapshotPath)}\nActive modes are preserved after compaction.\n</compound-compact-info>\n${compoundHint}`));
      return;
    }
  } catch (e) {
    log.debug('스냅샷 저장 실패', e);
  }

  console.log(approve(compoundHint));
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(failOpen());
});
