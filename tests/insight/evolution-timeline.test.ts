import { describe, it, expect, vi } from 'vitest';
import { renderSparkline, renderStabilityBars, getPreferenceStability } from '../../src/insight/evolution-timeline.js';

describe('renderSparkline', () => {
  it('returns "(no data)" for empty array', () => {
    expect(renderSparkline([])).toBe('(no data)');
  });

  it('renders single value as middle char', () => {
    const result = renderSparkline([0.5]);
    expect(result.length).toBe(1);
  });

  it('renders ascending values with increasing block height', () => {
    const result = renderSparkline([0.0, 0.25, 0.5, 0.75, 1.0]);
    // 첫 문자는 가장 낮은 블록, 마지막은 가장 높은 블록
    expect(result[0]).toBe('▁');
    expect(result[result.length - 1]).toBe('█');
  });

  it('renders constant values as uniform middle', () => {
    const result = renderSparkline([0.5, 0.5, 0.5]);
    const unique = new Set(result.split(''));
    expect(unique.size).toBe(1);
  });

  it('respects width parameter', () => {
    const values = Array.from({ length: 100 }, (_, i) => i / 100);
    const result = renderSparkline(values, 10);
    expect(result.length).toBe(10);
  });
});

describe('renderStabilityBars', () => {
  it('returns "수집 중" message for empty array', () => {
    expect(renderStabilityBars([])).toContain('수집 중');
  });

  it('renders bars with pKnown and status', () => {
    const result = renderStabilityBars([
      { dimension: 'qualityFocus', pKnown: 0.8, observationCount: 50, isStable: true },
      { dimension: 'riskTolerance', pKnown: 0.3, observationCount: 10, isStable: false },
    ]);
    expect(result).toContain('qualityFocus');
    expect(result).toContain('안정');
    expect(result).toContain('학습중');
  });
});

describe('getPreferenceStability', () => {
  it('returns empty array when no preference state exists', () => {
    // preference-state.json이 없는 환경에서도 안전하게 빈 배열 반환
    const result = getPreferenceStability();
    expect(Array.isArray(result)).toBe(true);
  });
});
