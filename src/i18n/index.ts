/**
 * Tenetx — i18n (English / Korean)
 *
 * 내부 타입은 한글 유지 (QualityPack = '보수형' | ...).
 * 사용자 대면 출력만 로케일에 따라 전환.
 */

import type { QualityPack, AutonomyPack, JudgmentPack, CommunicationPack, TrustPolicy } from '../store/types.js';

export type Locale = 'en' | 'ko';

// ── Pack Display Names ──

const QUALITY_NAMES: Record<Locale, Record<QualityPack, string>> = {
  ko: { '보수형': '보수형', '균형형': '균형형', '속도형': '속도형' },
  en: { '보수형': 'Conservative', '균형형': 'Balanced', '속도형': 'Speed-first' },
};

const AUTONOMY_NAMES: Record<Locale, Record<AutonomyPack, string>> = {
  ko: { '확인 우선형': '확인 우선형', '균형형': '균형형', '자율 실행형': '자율 실행형' },
  en: { '확인 우선형': 'Confirm-first', '균형형': 'Balanced', '자율 실행형': 'Autonomous' },
};

const JUDGMENT_NAMES: Record<Locale, Record<JudgmentPack, string>> = {
  ko: { '최소변경형': '최소변경형', '균형형': '균형형', '구조적접근형': '구조적접근형' },
  en: { '최소변경형': 'Minimal-change', '균형형': 'Balanced', '구조적접근형': 'Structural' },
};

const COMMUNICATION_NAMES: Record<Locale, Record<CommunicationPack, string>> = {
  ko: { '간결형': '간결형', '균형형': '균형형', '상세형': '상세형' },
  en: { '간결형': 'Concise', '균형형': 'Balanced', '상세형': 'Detailed' },
};

const TRUST_NAMES: Record<Locale, Record<TrustPolicy, string>> = {
  ko: { '가드레일 우선': '가드레일 우선', '승인 완화': '승인 완화', '완전 신뢰 실행': '완전 신뢰 실행' },
  en: { '가드레일 우선': 'Guardrails-first', '승인 완화': 'Relaxed-approval', '완전 신뢰 실행': 'Full-trust' },
};

export function qualityName(pack: QualityPack, locale: Locale): string { return QUALITY_NAMES[locale][pack]; }
export function autonomyName(pack: AutonomyPack, locale: Locale): string { return AUTONOMY_NAMES[locale][pack]; }
export function judgmentName(pack: JudgmentPack, locale: Locale): string { return JUDGMENT_NAMES[locale][pack]; }
export function communicationName(pack: CommunicationPack, locale: Locale): string { return COMMUNICATION_NAMES[locale][pack]; }
export function trustName(policy: TrustPolicy, locale: Locale): string { return TRUST_NAMES[locale][policy]; }

// ── Onboarding Questions ──

export interface OnboardingStrings {
  header: string;
  subtitle: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  resultHeader: string;
  profileSaved: string;
  invalidChoice: string;
}

export const ONBOARDING: Record<Locale, OnboardingStrings> = {
  ko: {
    header: '  Tenetx — 개인화 온보딩',
    subtitle: '  4개의 상황 질문으로 당신의 작업 스타일을 파악합니다.\n  이 결과는 임시 추천이며, 첫 세션 이후 확정됩니다.',
    q1: `
  ─────────────────────────────────────────
  질문 1: 애매한 구현 요청

  "로그인 기능을 개선해줘"라는 요청을 받았습니다.
  요구사항이 명확하지 않고, 인접 모듈에 영향을 줄 수 있습니다.

  A) 먼저 요구사항/범위를 확인하고, 범위 확대 가능성이 있으면 물어본다
  B) 같은 흐름 안이면 진행하되, 큰 범위 확대가 보이면 확인한다
  C) 합리적으로 가정하고 인접 파일까지 바로 수정한다

  선택 (A/B/C): `,
    q2: `
  ─────────────────────────────────────────
  질문 2: 검증 강도 vs 완료 속도

  수정이 거의 끝났습니다. 테스트와 타입 검사가 남아 있습니다.

  A) 관련 테스트, 타입, 핵심 검증을 끝내기 전에는 완료라 하지 않는다
  B) 핵심 검증 1개 이상 하고, 남은 리스크를 요약해서 끝낸다
  C) 최소 smoke만 보고 빠르게 결과와 리스크만 보고한다

  선택 (A/B/C): `,
    q3: `
  ─────────────────────────────────────────
  질문 3: 코드 수정 접근법

  레거시 코드에서 반복 패턴을 발견했습니다. 동작은 하지만 구조가 좋지 않습니다.

  A) 현재 동작을 깨뜨리지 않도록 최소한만 수정한다
  B) 관련된 부분만 정리하되, 전체 구조 변경은 하지 않는다
  C) 이왕 손대는 거 주변 코드까지 구조적으로 정리한다

  선택 (A/B/C): `,
    q4: `
  ─────────────────────────────────────────
  질문 4: 설명/보고 스타일

  복잡한 버그를 수정했습니다. 결과를 보고해야 합니다.

  A) 무엇을 왜 바꿨는지, 영향 범위, 대안까지 상세하게 설명한다
  B) 핵심 변경과 이유를 요약하고, 필요하면 추가 질문을 유도한다
  C) 변경 사항만 간결하게 보고한다

  선택 (A/B/C): `,
    resultHeader: '  추천 결과 (임시)',
    profileSaved: '  Profile 저장 완료. 첫 세션을 시작하면 이 추천이 적용됩니다.',
    invalidChoice: '  A, B, C 중 하나를 입력해주세요.',
  },
  en: {
    header: '  Tenetx — Personalization Onboarding',
    subtitle: '  4 scenario questions to understand your work style.\n  Results are provisional and confirmed after your first session.',
    q1: `
  ─────────────────────────────────────────
  Q1: Ambiguous implementation request

  You receive "improve the login feature." Requirements are
  unclear and adjacent modules may be affected.

  A) Clarify requirements/scope first. Ask if scope expansion is possible.
  B) Proceed if within same flow. Check when major scope expansion appears.
  C) Make reasonable assumptions and fix adjacent files directly.

  Choice (A/B/C): `,
    q2: `
  ─────────────────────────────────────────
  Q2: Verification depth vs completion speed

  Your fix is almost done. Tests and type checks remain.

  A) Don't call it done until all tests, types, and key checks pass.
  B) Run at least one key check, then summarize remaining risks.
  C) Quick smoke test, report results and risks.

  Choice (A/B/C): `,
    q3: `
  ─────────────────────────────────────────
  Q3: Code modification approach

  You found a repeated pattern in legacy code. It works but
  the structure is poor.

  A) Make minimal changes. Don't break what works.
  B) Clean up related parts only. No full restructuring.
  C) Restructure surrounding code too. Reduce tech debt.

  Choice (A/B/C): `,
    q4: `
  ─────────────────────────────────────────
  Q4: Explanation/reporting style

  You fixed a complex bug. Time to report.

  A) Explain what, why, impact scope, and alternatives in detail.
  B) Summarize key changes and reasons. Invite follow-up questions.
  C) Report changes concisely. Explain only if asked.

  Choice (A/B/C): `,
    resultHeader: '  Recommendation (provisional)',
    profileSaved: '  Profile saved. Personalization will apply from your next session.',
    invalidChoice: '  Please enter A, B, or C.',
  },
};

// ── Rule Renderer Strings ──

export interface RuleRendererStrings {
  trustGuardrails: string;
  trustRelaxed: string;
  trustFullTrust: string;
  evidenceCollectionHeader: string;
  evidenceCollectionRules: string[];
  judgmentMinimalChange: string[];
  judgmentBalanced: string[];
  judgmentStructural: string[];
  commConcise: string[];
  commBalanced: string[];
  commDetailed: string[];
}

export const RULE_RENDERER: Record<Locale, RuleRendererStrings> = {
  ko: {
    trustGuardrails: '위험 우회 비활성. 파괴적 명령, 민감 경로 접근 시 항상 확인.',
    trustRelaxed: '일반 파일 쓰기는 승인 없이 진행 가능. 위험 우회는 기본 제한.',
    trustFullTrust: '런타임 마찰 최소화. 명시적 금지와 파괴적 명령 외에는 자유 실행.',
    evidenceCollectionHeader: 'Evidence Collection',
    evidenceCollectionRules: [
      '사용자가 행동을 교정하면("하지마", "그렇게 말고", "앞으로는 이렇게") 반드시 correction-record MCP 도구를 호출하여 evidence로 기록하라.',
      'kind 선택: fix-now(즉시 수정), prefer-from-now(앞으로 이렇게), avoid-this(하지 마라)',
      'axis_hint: quality_safety(품질/검증), autonomy(자율/확인), judgment_philosophy(변경 접근법), communication_style(설명 스타일)',
      '교정이 아닌 일반 피드백은 기록하지 않는다.',
    ],
    judgmentMinimalChange: [
      '기존 코드 구조를 최대한 유지하라. 동작하는 코드를 불필요하게 리팩토링하지 마라.',
      '수정 범위를 최소한으로 유지하라. 인접 파일 변경은 꼭 필요한 경우에만.',
      '변경 전 근거(테스트, 에러 로그)를 먼저 확보하라.',
    ],
    judgmentBalanced: ['현재 작업 범위에 집중하되, 명확한 개선 기회가 보이면 제안하라.'],
    judgmentStructural: [
      '반복되는 패턴이나 기술 부채를 발견하면 적극적으로 구조 개선을 제안하라.',
      '추상화와 재사용 가능한 설계를 선호하라. 단, 과도한 추상화는 피한다.',
      '변경 시 전체 아키텍처 관점에서 일관성을 유지하라.',
    ],
    commConcise: [
      '응답은 짧고 핵심만. 코드와 결과 위주로 보고하라.',
      '부연 설명은 물어볼 때만. 선제적으로 길게 설명하지 마라.',
    ],
    commBalanced: ['핵심 변경과 이유를 요약하고, 필요하면 추가 설명을 유도하라.'],
    commDetailed: [
      '변경 이유, 대안 검토, 영향 범위를 함께 설명하라.',
      '교육적 맥락을 제공하라 — 왜 이 접근이 좋은지, 다른 방법과 비교.',
      '보고는 구조화하라 (변경 사항, 이유, 영향, 다음 단계).',
    ],
  },
  en: {
    trustGuardrails: 'Dangerous bypass disabled. Always confirm before destructive commands or sensitive path access.',
    trustRelaxed: 'Regular file writes proceed without approval. Dangerous bypass restricted by default.',
    trustFullTrust: 'Minimal runtime friction. Free execution except explicit bans and destructive commands.',
    evidenceCollectionHeader: 'Evidence Collection',
    evidenceCollectionRules: [
      'When the user corrects your behavior ("don\'t do that", "always do X", "stop doing Y"), call the correction-record MCP tool to record it as evidence.',
      'kind: fix-now (immediate fix), prefer-from-now (going forward), avoid-this (never do this)',
      'axis_hint: quality_safety, autonomy, judgment_philosophy, communication_style',
      'Do not record general feedback — only explicit behavioral corrections.',
    ],
    judgmentMinimalChange: [
      'Preserve existing code structure. Do not refactor working code unnecessarily.',
      'Keep modification scope minimal. Change adjacent files only when strictly necessary.',
      'Secure evidence (tests, error logs) before making changes.',
    ],
    judgmentBalanced: ['Focus on current task scope, but suggest improvements when clearly beneficial.'],
    judgmentStructural: [
      'Proactively suggest structural improvements when you spot repeated patterns or tech debt.',
      'Prefer abstraction and reusable design, but avoid over-abstraction.',
      'Maintain architectural consistency across changes.',
    ],
    commConcise: [
      'Keep responses short and to the point. Focus on code and results.',
      'Only elaborate when asked. Do not proactively write long explanations.',
    ],
    commBalanced: ['Summarize key changes and reasons. Invite follow-up questions when needed.'],
    commDetailed: [
      'Explain what changed, why, impact scope, and alternatives considered.',
      'Provide educational context — why this approach is better, compare with alternatives.',
      'Structure reports: changes, reasoning, impact, next steps.',
    ],
  },
};

// ── Locale Detection ──

let _currentLocale: Locale = 'en';

export function setLocale(locale: Locale): void { _currentLocale = locale; }
export function getLocale(): Locale { return _currentLocale; }

/** GlobalConfig에서 locale을 읽어 설정. 없으면 'en' 기본값. */
export function initLocaleFromConfig(): void {
  try {
    const { loadGlobalConfig } = require('../core/global-config.js') as typeof import('../core/global-config.js');
    const config = loadGlobalConfig();
    if (config.locale === 'ko' || config.locale === 'en') {
      _currentLocale = config.locale;
    }
  } catch {
    // config 로드 실패 시 기본값 유지
  }
}
