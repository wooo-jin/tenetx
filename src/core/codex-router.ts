/**
 * Tenetx — Claude/Codex Task Router
 *
 * 작업 특성에 따라 Claude와 Codex 중 최적의 에이전트를 자동 선택합니다.
 * tmux 환경에서 자동 패널 분할로 병렬 실행할 수 있습니다.
 *
 * 강점 프로파일:
 *   Claude — 아키텍처, 리팩토링, 복잡한 추론, 한국어, 문맥 이해, 문서
 *   Codex — 단위 구현, 반복 패턴 적용, 테스트 작성, 빠른 코드 생성
 */

import { isTmux, isCodexAvailable, spawnCodexPane, type CodexSpawnResult } from './codex-spawn.js';
import { debugLog } from './logger.js';

export type AgentPreference = 'claude' | 'codex' | 'either';

export interface TaskProfile {
  /** 작업 설명 */
  task: string;
  /** 추천 에이전트 */
  agent: AgentPreference;
  /** 추천 이유 */
  reason: string;
  /** 신뢰도 0-1 */
  confidence: number;
}

/** Claude가 잘하는 패턴 */
const CLAUDE_PATTERNS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /아키텍처|설계|구조|architect|design/i, reason: 'architecture design', weight: 0.9 },
  { pattern: /리팩토링|refactor|재구조화|정리/i, reason: 'refactoring (context understanding needed)', weight: 0.8 },
  { pattern: /보안|security|인증|auth|OWASP/i, reason: 'security (careful judgment needed)', weight: 0.85 },
  { pattern: /마이그레이션|migration|호환성|breaking/i, reason: 'migration (impact analysis needed)', weight: 0.8 },
  { pattern: /복잡한|어려운|까다로운|complex|tricky/i, reason: 'complex reasoning', weight: 0.7 },
  { pattern: /리뷰|review|검토|분석|analyze/i, reason: 'code analysis/review', weight: 0.75 },
  { pattern: /문서|docs|README|설명|주석/i, reason: 'documentation', weight: 0.7 },
  { pattern: /디버그|debug|왜.*안|에러.*원인/i, reason: 'debugging (reasoning needed)', weight: 0.75 },
  { pattern: /API.*설계|인터페이스.*정의|타입.*설계/i, reason: 'API/interface design', weight: 0.8 },
];

/** Codex가 잘하는 패턴 */
const CODEX_PATTERNS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /테스트.*작성|test.*write|단위.*테스트|unit test/i, reason: 'test code writing', weight: 0.85 },
  { pattern: /반복.*적용|모든.*파일|각각|전부|일괄/i, reason: 'batch pattern application', weight: 0.8 },
  { pattern: /구현.*해줘|만들어|추가.*해줘|implement|create|add/i, reason: 'unit feature implementation', weight: 0.6 },
  { pattern: /변환|convert|transform|포맷|format/i, reason: 'code conversion/format', weight: 0.75 },
  { pattern: /타입.*추가|type.*annotation|JSDoc/i, reason: 'type annotation addition', weight: 0.7 },
  { pattern: /에러.*핸들링.*추가|validation.*추가|검증.*추가/i, reason: 'boilerplate addition', weight: 0.7 },
  { pattern: /린트|lint|prettier|formatting|스타일/i, reason: 'code style fix', weight: 0.65 },
  { pattern: /CRUD|엔드포인트.*추가|라우트.*추가/i, reason: 'CRUD/route implementation', weight: 0.7 },
];

/**
 * 작업을 분석하여 최적 에이전트를 추천
 */
export function profileTask(task: string): TaskProfile {
  let claudeScore = 0;
  let codexScore = 0;
  let claudeReason = '';
  let codexReason = '';

  for (const p of CLAUDE_PATTERNS) {
    if (p.pattern.test(task)) {
      if (p.weight > claudeScore) {
        claudeScore = p.weight;
        claudeReason = p.reason;
      }
    }
  }

  for (const p of CODEX_PATTERNS) {
    if (p.pattern.test(task)) {
      if (p.weight > codexScore) {
        codexScore = p.weight;
        codexReason = p.reason;
      }
    }
  }

  // 점수 차이가 0.15 이상이면 확실한 추천, 아니면 either
  const diff = claudeScore - codexScore;

  if (diff > 0.15) {
    return { task, agent: 'claude', reason: claudeReason, confidence: claudeScore };
  }
  if (diff < -0.15) {
    return { task, agent: 'codex', reason: codexReason, confidence: codexScore };
  }

  // 비슷하면 Claude 우선 (기본 에이전트)
  return {
    task,
    agent: 'either',
    reason: claudeScore > 0 ? claudeReason : codexReason || 'general task',
    confidence: Math.max(claudeScore, codexScore, 0.5),
  };
}

/**
 * 여러 작업을 Claude/Codex에 자동 분배
 *
 * @returns claude에서 처리할 작업, codex에 위임할 작업
 */
export function routeTasks(
  tasks: string[],
): { claude: TaskProfile[]; codex: TaskProfile[]; summary: string } {
  const profiles = tasks.map(t => profileTask(t));

  const claude: TaskProfile[] = [];
  const codex: TaskProfile[] = [];

  for (const p of profiles) {
    if (p.agent === 'codex') {
      codex.push(p);
    } else {
      // 'claude' 또는 'either' → Claude에서 처리
      claude.push(p);
    }
  }

  // Codex가 사용 불가하면 전부 Claude로
  const codexCheck = isCodexAvailable();
  if (!codexCheck.available && codex.length > 0) {
    claude.push(...codex);
    codex.length = 0;
  }

  // tmux가 아니면 Codex 스폰 불가 → Claude로
  if (!isTmux() && codex.length > 0) {
    claude.push(...codex);
    codex.length = 0;
  }

  const parts: string[] = [];
  if (claude.length > 0) parts.push(`Claude ${claude.length} tasks`);
  if (codex.length > 0) parts.push(`Codex ${codex.length} tasks`);

  return {
    claude,
    codex,
    summary: parts.join(' + ') || 'no tasks',
  };
}

/**
 * 자동 분배 + Codex 스폰 실행
 *
 * team/ultrawork 스킬에서 호출:
 *   1. 작업을 Claude/Codex로 분배
 *   2. Codex 작업은 tmux 패널로 자동 스폰
 *   3. Claude 작업 목록을 반환 (Claude가 직접 처리)
 */
export function autoDelegate(
  tasks: string[],
  cwd?: string,
): { claudeTasks: string[]; codexSpawned: CodexSpawnResult[]; summary: string } {
  const { claude, codex, summary } = routeTasks(tasks);

  const codexSpawned: CodexSpawnResult[] = [];

  for (const task of codex) {
    const result = spawnCodexPane(task.task, { cwd });
    codexSpawned.push(result);
    if (result.success) {
      debugLog('codex-router', `Codex 위임: ${task.task.slice(0, 50)} (${task.reason})`);
    }
  }

  return {
    claudeTasks: claude.map(t => t.task),
    codexSpawned,
    summary,
  };
}
