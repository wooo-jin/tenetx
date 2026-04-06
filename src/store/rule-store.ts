/**
 * Tenetx v1 — Rule Store
 *
 * Structured Rule CRUD. render_key 기반 dedupe는 renderer 책임.
 * Authoritative schema: docs/plans/2026-04-03-tenetx-data-model-storage-spec.md §3
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { V1_RULES_DIR } from '../core/paths.js';
import { atomicWriteJSON, safeReadJSON } from '../hooks/shared/atomic-write.js';
import type { Rule, RuleCategory, RuleScope, RuleStrength, RuleSource, RuleStatus } from './types.js';

function rulePath(ruleId: string): string {
  return path.join(V1_RULES_DIR, `${ruleId}.json`);
}

export function createRule(params: {
  category: RuleCategory;
  scope: RuleScope;
  trigger: string;
  policy: string;
  strength: RuleStrength;
  source: RuleSource;
  evidence_refs?: string[];
  render_key: string;
}): Rule {
  const now = new Date().toISOString();
  return {
    rule_id: crypto.randomUUID(),
    category: params.category,
    scope: params.scope,
    trigger: params.trigger,
    policy: params.policy,
    strength: params.strength,
    source: params.source,
    status: 'active',
    evidence_refs: params.evidence_refs ?? [],
    render_key: params.render_key,
    created_at: now,
    updated_at: now,
  };
}

export function saveRule(rule: Rule): void {
  rule.updated_at = new Date().toISOString();
  atomicWriteJSON(rulePath(rule.rule_id), rule, { pretty: true });
}

export function loadRule(ruleId: string): Rule | null {
  return safeReadJSON<Rule | null>(rulePath(ruleId), null);
}

export function loadAllRules(): Rule[] {
  if (!fs.existsSync(V1_RULES_DIR)) return [];
  const rules: Rule[] = [];
  for (const file of fs.readdirSync(V1_RULES_DIR)) {
    if (!file.endsWith('.json')) continue;
    const rule = safeReadJSON<Rule | null>(path.join(V1_RULES_DIR, file), null);
    if (rule) rules.push(rule);
  }
  return rules;
}

export function loadActiveRules(): Rule[] {
  return loadAllRules().filter(r => r.status === 'active');
}

export function updateRuleStatus(ruleId: string, status: RuleStatus): boolean {
  const rule = loadRule(ruleId);
  if (!rule) return false;
  rule.status = status;
  saveRule(rule);
  return true;
}
