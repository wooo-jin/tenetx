import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const { tmpDir, tmpRulesDir } = vi.hoisted(() => {
  const p = require('node:path');
  const o = require('node:os');
  const tmpDir = p.join(o.tmpdir(), `tenetx-rule-test-${process.pid}`);
  return { tmpDir, tmpRulesDir: p.join(tmpDir, 'me', 'rules') };
});

vi.mock('../../src/core/paths.js', () => ({
  V1_RULES_DIR: tmpRulesDir,
  STATE_DIR: '/__test_no_state_dir__',
}));

import { createRule, saveRule, loadRule, loadAllRules, loadActiveRules, updateRuleStatus } from '../../src/store/rule-store.js';

beforeEach(() => {
  fs.mkdirSync(tmpRulesDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('rule-store', () => {
  it('createRule generates valid rule with UUID', () => {
    const rule = createRule({
      category: 'quality',
      scope: 'me',
      trigger: 'test or type regression detected',
      policy: 'stop_on_test_type_regression',
      strength: 'default',
      source: 'onboarding',
      render_key: 'quality.stop_on_regression',
    });

    expect(rule.rule_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rule.status).toBe('active');
    expect(rule.render_key).toBe('quality.stop_on_regression');
  });

  it('save and load roundtrip', () => {
    const rule = createRule({
      category: 'autonomy',
      scope: 'me',
      trigger: 'public API change detected',
      policy: 'confirm_before_public_api_change',
      strength: 'strong',
      source: 'explicit_correction',
      evidence_refs: ['ev-001'],
      render_key: 'autonomy.confirm_public_api_change',
    });

    saveRule(rule);
    const loaded = loadRule(rule.rule_id);
    expect(loaded).not.toBeNull();
    expect(loaded!.policy).toBe('confirm_before_public_api_change');
    expect(loaded!.evidence_refs).toEqual(['ev-001']);
  });

  it('loadAllRules returns all saved rules', () => {
    saveRule(createRule({ category: 'quality', scope: 'me', trigger: 't', policy: 'p1', strength: 'default', source: 'onboarding', render_key: 'quality.p1' }));
    saveRule(createRule({ category: 'autonomy', scope: 'me', trigger: 't', policy: 'p2', strength: 'soft', source: 'onboarding', render_key: 'autonomy.p2' }));

    expect(loadAllRules()).toHaveLength(2);
  });

  it('loadActiveRules filters by status', () => {
    const r1 = createRule({ category: 'quality', scope: 'me', trigger: 't', policy: 'p1', strength: 'default', source: 'onboarding', render_key: 'quality.p1' });
    const r2 = createRule({ category: 'quality', scope: 'me', trigger: 't', policy: 'p2', strength: 'default', source: 'onboarding', render_key: 'quality.p2' });
    r2.status = 'suppressed';
    saveRule(r1);
    saveRule(r2);

    expect(loadActiveRules()).toHaveLength(1);
    expect(loadActiveRules()[0].rule_id).toBe(r1.rule_id);
  });

  it('updateRuleStatus changes status', () => {
    const rule = createRule({ category: 'quality', scope: 'me', trigger: 't', policy: 'p', strength: 'default', source: 'onboarding', render_key: 'quality.p' });
    saveRule(rule);

    expect(updateRuleStatus(rule.rule_id, 'suppressed')).toBe(true);
    expect(loadRule(rule.rule_id)!.status).toBe('suppressed');
  });

  it('updateRuleStatus returns false for missing rule', () => {
    expect(updateRuleStatus('nonexistent', 'removed')).toBe(false);
  });

  it('loadAllRules returns empty for missing directory', () => {
    fs.rmSync(tmpRulesDir, { recursive: true, force: true });
    expect(loadAllRules()).toEqual([]);
  });
});
