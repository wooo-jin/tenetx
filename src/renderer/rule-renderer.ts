/**
 * Tenetx v1 — Rule Renderer
 *
 * Rule[] + SessionEffectiveState → Claude Code용 자연어 규칙 세트 변환.
 * Authoritative spec: docs/plans/2026-04-03-tenetx-rule-renderer-spec.md
 *
 * 파이프라인: filter → dedupe(render_key) → group(category) → order → template → budget
 */

import type { Rule, RuleStrength, RuleScope, RuleSource, SessionEffectiveState, Profile, TrustPolicy, JudgmentPack, CommunicationPack } from '../store/types.js';
import { initLocaleFromConfig, getLocale, qualityName, autonomyName, judgmentName, communicationName, RULE_RENDERER } from '../i18n/index.js';

// ── Render Context ──

export type RenderSurface = 'session_start' | 'recompose' | 'inspect';

export interface RenderContext {
  surface: RenderSurface;
  max_rules: number;
  max_chars: number;
  include_pack_summary: boolean;
}

export const DEFAULT_CONTEXT: RenderContext = {
  surface: 'session_start',
  max_rules: 30,
  max_chars: 4000,
  include_pack_summary: true,
};

// ── Output Sections ──

const SECTION_ORDER = ['Must Not', 'Working Defaults', 'When To Ask', 'How To Validate', 'How To Report'] as const;
type SectionName = typeof SECTION_ORDER[number];

const CATEGORY_TO_SECTION: Record<string, SectionName> = {
  safety: 'Must Not',
  quality: 'How To Validate',
  autonomy: 'When To Ask',
  judgment: 'Working Defaults',
  communication: 'How To Report',
  workflow: 'Working Defaults',
};

// ── Dedupe: render_key 충돌 해소 ──

const SCOPE_RANK: Record<RuleScope, number> = { session: 0, me: 1 };
const STRENGTH_RANK: Record<RuleStrength, number> = { hard: 0, strong: 1, default: 2, soft: 3 };
const SOURCE_RANK: Record<RuleSource, number> = { explicit_correction: 0, onboarding: 1, behavior_inference: 2, pack_overlay: 3 };

function dedupeByRenderKey(rules: Rule[]): Rule[] {
  const groups = new Map<string, Rule[]>();
  for (const r of rules) {
    const existing = groups.get(r.render_key) ?? [];
    existing.push(r);
    groups.set(r.render_key, existing);
  }

  const result: Rule[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    group.sort((a, b) => {
      const scopeDiff = SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope];
      if (scopeDiff !== 0) return scopeDiff;
      const strengthDiff = STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength];
      if (strengthDiff !== 0) return strengthDiff;
      const sourceDiff = SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
      if (sourceDiff !== 0) return sourceDiff;
      const timeDiff = b.updated_at.localeCompare(a.updated_at);
      if (timeDiff !== 0) return timeDiff;
      return a.rule_id.localeCompare(b.rule_id);
    });
    result.push(group[0]);
  }
  return result;
}

// ── Template ──

function ruleToText(rule: Rule): string {
  // policy 필드가 이미 사람이 읽을 수 있는 문장이면 그대로 사용
  // render_key로 템플릿을 찾을 수도 있지만 v1은 policy 직접 사용
  return rule.policy;
}

function trustPolicySummary(policy: TrustPolicy): string {
  const s = RULE_RENDERER[getLocale()];
  switch (policy) {
    case '가드레일 우선': return s.trustGuardrails;
    case '승인 완화': return s.trustRelaxed;
    case '완전 신뢰 실행': return s.trustFullTrust;
  }
}

function judgmentPackRules(pack: JudgmentPack): string[] {
  const s = RULE_RENDERER[getLocale()];
  switch (pack) {
    case '최소변경형': return s.judgmentMinimalChange;
    case '구조적접근형': return s.judgmentStructural;
    case '균형형': return s.judgmentBalanced;
  }
}

function communicationPackRules(pack: CommunicationPack): string[] {
  const s = RULE_RENDERER[getLocale()];
  switch (pack) {
    case '간결형': return s.commConcise;
    case '상세형': return s.commDetailed;
    case '균형형': return s.commBalanced;
  }
}

// ── Main Render ──

export function renderRules(
  rules: Rule[],
  state: SessionEffectiveState,
  _profile: Profile,
  ctx: RenderContext = DEFAULT_CONTEXT,
): string {
  // 1. active만 수집
  const active = rules.filter(r => r.status === 'active');

  // 2. dedupe by render_key
  const deduped = dedupeByRenderKey(active);

  // 3. hard constraints 먼저
  const hardRules = deduped.filter(r => r.strength === 'hard');
  const otherRules = deduped.filter(r => r.strength !== 'hard');

  // 4. category별 그룹
  const sections = new Map<SectionName, string[]>();
  for (const name of SECTION_ORDER) sections.set(name, []);

  for (const rule of hardRules) {
    sections.get('Must Not')!.push(ruleToText(rule));
  }

  for (const rule of otherRules) {
    const section = CATEGORY_TO_SECTION[rule.category] ?? 'Working Defaults';
    sections.get(section)!.push(ruleToText(rule));
  }

  // 5. trust policy + pack 기본 규칙 주입
  if (ctx.include_pack_summary) {
    sections.get('Working Defaults')!.unshift(`Trust: ${trustPolicySummary(state.effective_trust_policy)}`);

    // judgment pack 기본 규칙
    for (const rule of judgmentPackRules(state.judgment_pack)) {
      sections.get('Working Defaults')!.push(rule);
    }
    // communication pack 기본 규칙
    for (const rule of communicationPackRules(state.communication_pack)) {
      sections.get('How To Report')!.push(rule);
    }
  }

  // 6. 섹션 조립
  const parts: string[] = [];

  if (ctx.include_pack_summary) {
    const l = getLocale();
    parts.push(`[${qualityName(state.quality_pack, l)} quality / ${autonomyName(state.autonomy_pack, l)} autonomy / ${judgmentName(state.judgment_pack, l)} judgment / ${communicationName(state.communication_pack, l)} communication]`);
  }

  let totalChars = parts.reduce((sum, p) => sum + p.length, 0);
  let totalRules = 0;

  for (const name of SECTION_ORDER) {
    const items = sections.get(name)!;
    if (items.length === 0) continue;

    const header = `## ${name}`;
    const body = items.map(item => `- ${item}`).join('\n');
    const section = `${header}\n${body}`;

    if (totalChars + section.length > ctx.max_chars) break;
    if (totalRules + items.length > ctx.max_rules) break;

    parts.push(section);
    totalChars += section.length;
    totalRules += items.length;
  }

  // 7. Evidence Collection 지시 (항상 포함, 로케일)
  initLocaleFromConfig();
  const ecStrings = RULE_RENDERER[getLocale()];
  parts.push([
    `## ${ecStrings.evidenceCollectionHeader}`,
    ...ecStrings.evidenceCollectionRules.map(r => `- ${r}`),
  ].join('\n'));

  // 8. warnings
  if (state.warnings.length > 0) {
    parts.push(`## Warnings\n${state.warnings.map(w => `- ${w}`).join('\n')}`);
  }

  return parts.join('\n\n');
}
