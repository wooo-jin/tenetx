/**
 * Tenetx Forge — Config Generator
 *
 * ForgeProfile 벡터에서 구체적인 하네스 설정을 생성.
 * 차원값 -> 에이전트, 훅, 라우팅, 철학 원칙 매핑.
 *
 * 새 튜너 모듈 통합:
 *   - agent-tuner: 에이전트 프롬프트 오버레이
 *   - philosophy-tuner: 동적 철학 원칙 생성
 *   - rule-tuner: 차원 기반 규칙 파일
 *   - hook-tuner: 훅별 세부 파라미터
 */

import type { Philosophy } from '../core/types.js';
import { generateAgentOverlays } from './agent-tuner.js';
import { generateHookTuning } from './hook-tuner.js';
import { generateTunedPrinciples } from './philosophy-tuner.js';
import { generateTunedRules } from './rule-tuner.js';
import { generateSkillOverlays } from './skill-tuner.js';
import type { AgentConfig, DerivedConfig, DimensionVector } from './types.js';

// ── Agent Config ────────────────────────────────────

interface AgentRule {
  name: string;
  /** 활성화 조건: 해당 차원이 이 값 이상이면 활성화 */
  enableWhen?: Partial<Record<string, { min?: number; max?: number }>>;
  /** 기본 활성화 */
  defaultEnabled: boolean;
  /** 엄격도 결정 차원 */
  strictnessDimension?: string;
  /** 엄격도 반전 (차원값이 낮을수록 엄격) */
  invertStrictness?: boolean;
}

const AGENT_RULES: AgentRule[] = [
  {
    name: 'security-reviewer',
    defaultEnabled: true,
    strictnessDimension: 'riskTolerance',
    invertStrictness: true,
  },
  {
    name: 'code-reviewer',
    defaultEnabled: true,
    strictnessDimension: 'qualityFocus',
  },
  {
    name: 'architect',
    enableWhen: { abstractionLevel: { min: 0.4 } },
    defaultEnabled: false,
    strictnessDimension: 'abstractionLevel',
  },
  {
    name: 'test-engineer',
    enableWhen: { qualityFocus: { min: 0.5 } },
    defaultEnabled: false,
    strictnessDimension: 'qualityFocus',
  },
  {
    name: 'critic',
    enableWhen: { qualityFocus: { min: 0.6 } },
    defaultEnabled: false,
    strictnessDimension: 'qualityFocus',
  },
  {
    name: 'refactoring-expert',
    enableWhen: { abstractionLevel: { min: 0.5 }, qualityFocus: { min: 0.5 } },
    defaultEnabled: false,
    strictnessDimension: 'abstractionLevel',
  },
  {
    name: 'performance-reviewer',
    enableWhen: { qualityFocus: { min: 0.7 } },
    defaultEnabled: false,
    strictnessDimension: 'qualityFocus',
  },
  {
    name: 'executor',
    defaultEnabled: true,
    strictnessDimension: 'autonomyPreference',
  },
  {
    name: 'explore',
    defaultEnabled: true,
    strictnessDimension: 'autonomyPreference',
  },
  {
    name: 'debugger',
    defaultEnabled: true,
    strictnessDimension: 'qualityFocus',
  },
];

function resolveAgents(dims: DimensionVector): AgentConfig[] {
  const agents: AgentConfig[] = [];

  for (const rule of AGENT_RULES) {
    let enabled = rule.defaultEnabled;

    if (rule.enableWhen) {
      enabled = Object.entries(rule.enableWhen).every(([dim, range]) => {
        const val = dims[dim] ?? 0.5;
        if (range?.min !== undefined && val < range.min) return false;
        if (range?.max !== undefined && val > range.max) return false;
        return true;
      });
    }

    let strictness = 3;
    if (rule.strictnessDimension) {
      const dimVal = dims[rule.strictnessDimension] ?? 0.5;
      const effectiveVal = rule.invertStrictness ? 1 - dimVal : dimVal;
      strictness = Math.round(1 + effectiveVal * 4); // 1-5 범위
    }

    agents.push({ name: rule.name, enabled, strictness });
  }

  return agents;
}

// ── Hook Severity ───────────────────────────────────

function resolveHookSeverity(dims: DimensionVector): DerivedConfig['hookSeverity'] {
  // qualityFocus + riskTolerance(역) 조합
  const score = (dims.qualityFocus ?? 0.5) + (1 - (dims.riskTolerance ?? 0.5));
  if (score >= 1.3) return 'strict';
  if (score >= 0.7) return 'balanced';
  return 'relaxed';
}

// ── Routing Preset ──────────────────────────────────

function resolveRoutingPreset(dims: DimensionVector): DerivedConfig['routingPreset'] {
  const quality = dims.qualityFocus ?? 0.5;
  const abstraction = dims.abstractionLevel ?? 0.5;
  const avg = (quality + abstraction) / 2;
  if (avg >= 0.65) return 'max-quality';
  if (avg <= 0.35) return 'cost-saving';
  return 'default';
}

// ── Verbosity ───────────────────────────────────────

function resolveVerbosity(dims: DimensionVector): DerivedConfig['verbosity'] {
  const comm = dims.communicationStyle ?? 0.5;
  if (comm >= 0.65) return 'terse';
  if (comm <= 0.35) return 'verbose';
  return 'balanced';
}

// ── Philosophy Principles (레거시 호환) ─────────────

function generatePrinciples(
  dims: DimensionVector,
): Record<string, { belief: string; generates: string[] }> {
  // philosophy-tuner의 TunedPrinciple을 레거시 형식으로 변환
  const tuned = generateTunedPrinciples(dims);
  const legacy: Record<string, { belief: string; generates: string[] }> = {};

  for (const [key, principle] of Object.entries(tuned)) {
    legacy[key] = {
      belief: principle.belief,
      generates: principle.generates.map((g) => {
        if (typeof g === 'string') return g;
        // 객체 형식을 문자열로 변환 (레거시 호환)
        if (g.hook) return `[hook] ${g.hook} (severity: ${g.severity ?? 'default'})`;
        if (g.routing) return `[routing] ${g.routing}`;
        if (g.alert) return `[alert] ${g.alert}`;
        if (g.step) return `[step] ${g.step}`;
        return JSON.stringify(g);
      }),
    };
  }

  return legacy;
}

// ── Public API ──────────────────────────────────────

/** 차원 벡터에서 구체적인 하네스 설정 파생 */
export function generateConfig(dims: DimensionVector): DerivedConfig {
  return {
    agents: resolveAgents(dims),
    hookSeverity: resolveHookSeverity(dims),
    routingPreset: resolveRoutingPreset(dims),
    principles: generatePrinciples(dims),
    verbosity: resolveVerbosity(dims),
    agentOverlays: generateAgentOverlays(dims),
    skillOverlays: generateSkillOverlays(dims),
    tunedRules: generateTunedRules(dims),
    hookTuning: generateHookTuning(dims),
  };
}

/** DerivedConfig에서 Philosophy 객체 생성 */
export function configToPhilosophy(config: DerivedConfig, name?: string): Philosophy {
  const principles: Philosophy['principles'] = {};

  for (const [key, p] of Object.entries(config.principles)) {
    const generates: Array<string | { routing?: string }> = [...p.generates];

    // routing 프리셋 추가 (첫 번째 원칙에만)
    if (key === Object.keys(config.principles)[0] && config.routingPreset !== 'default') {
      if (config.routingPreset === 'max-quality') {
        generates.push({ routing: 'explore -> Sonnet, implement -> Opus, review -> Opus' });
      } else if (config.routingPreset === 'cost-saving') {
        generates.push({ routing: 'explore -> Haiku, implement -> Sonnet, review -> Sonnet' });
      }
    }

    principles[key] = { belief: p.belief, generates };
  }

  return {
    name: name ?? 'forge-generated',
    version: '1.0.0',
    author: 'tenetx-forge',
    description: `Personalized philosophy generated by Forge (${config.verbosity} / ${config.hookSeverity})`,
    principles,
  };
}

/** 설정 요약 포맷 */
export function formatConfig(config: DerivedConfig): string {
  const lines: string[] = [];

  lines.push('  Derived Configuration:');
  lines.push(`    Hook severity: ${config.hookSeverity}`);
  lines.push(`    Routing preset: ${config.routingPreset}`);
  lines.push(`    Verbosity: ${config.verbosity}`);

  lines.push('    Active agents:');
  const active = config.agents.filter((a) => a.enabled);
  for (const agent of active) {
    lines.push(`      - ${agent.name} (strictness: ${agent.strictness}/5)`);
  }

  lines.push(`    Principles: ${Object.keys(config.principles).join(', ')}`);

  // 에이전트 오버레이 요약
  if (config.agentOverlays.length > 0) {
    lines.push(`    Agent overlays: ${config.agentOverlays.map((o) => o.agentName).join(', ')}`);
  }

  // 스킬 오버레이 요약
  if (config.skillOverlays.length > 0) {
    lines.push(`    Skill overlays: ${config.skillOverlays.map((o) => o.skillName).join(', ')}`);
  }

  // 튜닝된 규칙 요약
  if (config.tunedRules.length > 0) {
    lines.push(`    Tuned rules: ${config.tunedRules.map((r) => r.filename).join(', ')}`);
  }

  // 훅 튜닝 요약
  const enabledHooks = config.hookTuning.filter((h) => h.enabled);
  if (enabledHooks.length > 0) {
    lines.push(`    Hook tuning: ${enabledHooks.map((h) => h.hookName).join(', ')}`);
  }

  return lines.join('\n');
}
