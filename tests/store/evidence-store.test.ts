import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const { tmpDir, tmpEvDir } = vi.hoisted(() => {
  const p = require('node:path');
  const o = require('node:os');
  const tmpDir = p.join(o.tmpdir(), `tenetx-ev-test-${process.pid}`);
  return { tmpDir, tmpEvDir: p.join(tmpDir, 'me', 'behavior') };
});

vi.mock('../../src/core/paths.js', () => ({
  V1_EVIDENCE_DIR: tmpEvDir,
}));

import { createEvidence, saveEvidence, loadEvidence, loadAllEvidence, loadEvidenceBySession, loadEvidenceByType, loadRecentEvidence } from '../../src/store/evidence-store.js';

beforeEach(() => {
  fs.mkdirSync(tmpEvDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('evidence-store', () => {
  it('createEvidence generates valid evidence', () => {
    const ev = createEvidence({
      type: 'explicit_correction',
      session_id: 'sess-1',
      source_component: 'Hooks',
      summary: 'User said: do not mock the database',
      confidence: 0.9,
      axis_refs: ['quality_safety'],
    });

    expect(ev.evidence_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ev.type).toBe('explicit_correction');
    expect(ev.axis_refs).toEqual(['quality_safety']);
  });

  it('save and load roundtrip', () => {
    const ev = createEvidence({
      type: 'behavior_observation',
      session_id: 'sess-1',
      source_component: 'Hooks',
      summary: 'User ran tests 5 times before committing',
      confidence: 0.6,
      raw_payload: { test_runs: 5 },
    });

    saveEvidence(ev);
    const loaded = loadEvidence(ev.evidence_id);
    expect(loaded).not.toBeNull();
    expect(loaded!.summary).toContain('5 times');
    expect(loaded!.raw_payload).toEqual({ test_runs: 5 });
  });

  it('loadEvidenceBySession filters correctly', () => {
    saveEvidence(createEvidence({ type: 'explicit_correction', session_id: 'sess-1', source_component: 'H', summary: 's1', confidence: 0.8 }));
    saveEvidence(createEvidence({ type: 'explicit_correction', session_id: 'sess-2', source_component: 'H', summary: 's2', confidence: 0.8 }));
    saveEvidence(createEvidence({ type: 'behavior_observation', session_id: 'sess-1', source_component: 'H', summary: 's3', confidence: 0.5 }));

    expect(loadEvidenceBySession('sess-1')).toHaveLength(2);
    expect(loadEvidenceBySession('sess-2')).toHaveLength(1);
  });

  it('loadEvidenceByType filters correctly', () => {
    saveEvidence(createEvidence({ type: 'explicit_correction', session_id: 's', source_component: 'H', summary: 'a', confidence: 0.8 }));
    saveEvidence(createEvidence({ type: 'session_summary', session_id: 's', source_component: 'F', summary: 'b', confidence: 0.7 }));

    expect(loadEvidenceByType('explicit_correction')).toHaveLength(1);
    expect(loadEvidenceByType('session_summary')).toHaveLength(1);
    expect(loadEvidenceByType('behavior_observation')).toHaveLength(0);
  });

  it('loadRecentEvidence returns sorted and limited', () => {
    for (let i = 0; i < 5; i++) {
      const ev = createEvidence({ type: 'explicit_correction', session_id: 's', source_component: 'H', summary: `ev-${i}`, confidence: 0.5 });
      ev.timestamp = `2026-04-03T${String(i).padStart(2, '0')}:00:00Z`;
      saveEvidence(ev);
    }

    const recent = loadRecentEvidence(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].summary).toBe('ev-4');
    expect(recent[2].summary).toBe('ev-2');
  });

  it('loadAllEvidence returns empty for missing directory', () => {
    fs.rmSync(tmpEvDir, { recursive: true, force: true });
    expect(loadAllEvidence()).toEqual([]);
  });
});
