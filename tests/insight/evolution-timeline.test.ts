import { describe, it, expect } from 'vitest';
import { renderSparkline } from '../../src/insight/evolution-timeline.js';

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
