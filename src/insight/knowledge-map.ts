/**
 * Tenetx Insight — Knowledge Map
 *
 * 솔루션 간 관계를 Jaccard similarity 기반 그래프로 표현.
 * solution-index의 인덱스 데이터를 재사용하여 추가 I/O 없이 그래프를 생성.
 *
 * 설계 결정:
 *   - Jaccard similarity: 태그가 소규모 집합(평균 3-5개)이므로 cosine 대비 단순하고 직관적
 *   - 임계값 0.3: detectContradictions(70%)과 다른 척도이나, 약한 관계도 시각화 대상에 포함
 *   - O(N^2) 쌍 비교: 솔루션 상한 100개 → 최대 4,950 쌍, 무시 가능한 비용
 */

import { getOrBuildIndex, resetIndexCache } from '../engine/solution-index.js';
import { defaultSolutionDirs } from '../mcp/solution-reader.js';
import type { SolutionIndexEntry } from '../engine/solution-format.js';
import type { KnowledgeGraph, KnowledgeNode, KnowledgeEdge } from './types.js';

const EDGE_THRESHOLD = 0.3;

/** 두 태그 집합의 Jaccard similarity */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const tag of setA) {
    if (setB.has(tag)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** SolutionIndexEntry → KnowledgeNode 변환 */
function toNode(entry: SolutionIndexEntry): KnowledgeNode {
  return {
    id: entry.name,
    title: entry.name,
    status: entry.status,
    confidence: entry.confidence,
    type: entry.type,
    scope: entry.scope,
    tags: entry.tags,
    identifiers: entry.identifiers,
  };
}

/** 솔루션 인덱스에서 Knowledge Map 빌드 */
export function buildKnowledgeMap(cwd?: string): KnowledgeGraph {
  resetIndexCache();
  const dirs = defaultSolutionDirs(cwd);
  const index = getOrBuildIndex(dirs);

  const nodes: KnowledgeNode[] = index.entries.map(toNode);
  const edges: KnowledgeEdge[] = [];

  // 모든 노드 쌍에 대해 Jaccard similarity 계산
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const sim = jaccardSimilarity(nodes[i].tags, nodes[j].tags);
      if (sim >= EDGE_THRESHOLD) {
        edges.push({
          source: nodes[i].id,
          target: nodes[j].id,
          similarity: Math.round(sim * 1000) / 1000,
        });
      }
    }
  }

  // 메타데이터
  const statusDist: Record<string, number> = {};
  let totalConf = 0;
  for (const node of nodes) {
    statusDist[node.status] = (statusDist[node.status] ?? 0) + 1;
    totalConf += node.confidence;
  }

  return {
    nodes,
    edges,
    metadata: {
      generatedAt: new Date().toISOString(),
      totalSolutions: nodes.length,
      avgConfidence: nodes.length > 0 ? Math.round((totalConf / nodes.length) * 100) / 100 : 0,
      statusDistribution: statusDist,
    },
  };
}

/** Mermaid 텍스트 직렬화 (터미널/MCP용) */
export function toMermaid(graph: KnowledgeGraph): string {
  if (graph.nodes.length === 0) return 'graph LR\n  empty["No solutions yet"]';

  const lines: string[] = ['graph LR'];
  const statusStyle: Record<string, string> = {
    experiment: ':::experiment',
    candidate: ':::candidate',
    verified: ':::verified',
    mature: ':::mature',
  };

  for (const node of graph.nodes) {
    const label = `${node.title}\\n(${node.status}, ${node.confidence.toFixed(2)})`;
    lines.push(`  ${node.id}["${label}"]${statusStyle[node.status] ?? ''}`);
  }

  for (const edge of graph.edges) {
    const weight = edge.similarity >= 0.7 ? '====' : edge.similarity >= 0.5 ? '===' : '---';
    lines.push(`  ${edge.source} ${weight}|${edge.similarity}| ${edge.target}`);
  }

  lines.push('  classDef experiment fill:#fef3c7,stroke:#f59e0b');
  lines.push('  classDef candidate fill:#dbeafe,stroke:#3b82f6');
  lines.push('  classDef verified fill:#d1fae5,stroke:#10b981');
  lines.push('  classDef mature fill:#ede9fe,stroke:#8b5cf6');

  return lines.join('\n');
}
