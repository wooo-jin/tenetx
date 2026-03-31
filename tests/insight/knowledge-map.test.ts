import { describe, it, expect } from 'vitest';
import { jaccardSimilarity, toMermaid } from '../../src/insight/knowledge-map.js';
import type { KnowledgeGraph } from '../../src/insight/types.js';

describe('jaccardSimilarity', () => {
  it('returns 1 for identical sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['a', 'b'])).toBe(1);
  });

  it('returns 0 for disjoint sets', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('returns 0 for two empty sets', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });

  it('returns correct value for partial overlap', () => {
    // intersection={b}, union={a,b,c} → 1/3
    expect(jaccardSimilarity(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
  });

  it('handles one empty set', () => {
    expect(jaccardSimilarity(['a'], [])).toBe(0);
  });

  it('handles duplicates in input (Set deduplication)', () => {
    expect(jaccardSimilarity(['a', 'a', 'b'], ['a', 'b'])).toBe(1);
  });
});

describe('toMermaid', () => {
  it('returns empty graph message when no nodes', () => {
    const graph: KnowledgeGraph = {
      nodes: [],
      edges: [],
      metadata: { generatedAt: '', totalSolutions: 0, avgConfidence: 0, statusDistribution: {} },
    };
    expect(toMermaid(graph)).toContain('No solutions yet');
  });

  it('includes node labels with status and confidence', () => {
    const graph: KnowledgeGraph = {
      nodes: [{
        id: 'test-pattern', title: 'test-pattern', status: 'candidate',
        confidence: 0.75, type: 'pattern', scope: 'me', tags: ['test'],
        identifiers: [], lastUpdated: '',
      }],
      edges: [],
      metadata: { generatedAt: '', totalSolutions: 1, avgConfidence: 0.75, statusDistribution: { candidate: 1 } },
    };
    const mermaid = toMermaid(graph);
    expect(mermaid).toContain('test-pattern');
    expect(mermaid).toContain('candidate');
    expect(mermaid).toContain('0.75');
  });

  it('includes edges with similarity', () => {
    const graph: KnowledgeGraph = {
      nodes: [
        { id: 'a', title: 'a', status: 'candidate', confidence: 0.5, type: 'pattern', scope: 'me', tags: [], identifiers: [], lastUpdated: '' },
        { id: 'b', title: 'b', status: 'candidate', confidence: 0.5, type: 'pattern', scope: 'me', tags: [], identifiers: [], lastUpdated: '' },
      ],
      edges: [{ source: 'a', target: 'b', similarity: 0.6 }],
      metadata: { generatedAt: '', totalSolutions: 2, avgConfidence: 0.5, statusDistribution: { candidate: 2 } },
    };
    const mermaid = toMermaid(graph);
    expect(mermaid).toContain('a');
    expect(mermaid).toContain('b');
    expect(mermaid).toContain('0.6');
  });
});
