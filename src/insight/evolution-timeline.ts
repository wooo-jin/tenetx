/**
 * Tenetx Insight — Evolution Timeline
 *
 * Thompson Sampling observations + evolution history → sparkline + Chart.js 데이터.
 * 차원 벡터의 시간축 변화를 Tufte(2006)의 sparkline + small multiples로 시각화.
 *
 * 설계 결정:
 *   - 데이터 소스: thompson-state.json (observations[]) + evolution-history.json
 *   - observations가 0이면 "수집 중" 메시지 (Phase 0 데이터 부재 대응)
 *   - ASCII sparkline: 유니코드 블록 문자 (▁▂▃▄▅▆▇█), 의존성 0
 *   - HTML 차트: Chart.js CDN 데이터 JSON으로 변환
 */

import { loadThompsonState } from '../lab/thompson-sampling.js';
import { loadPreferenceStates } from '../lab/preference-tracer.js';
import { loadEvolutionHistory } from '../lab/auto-learn.js';
import { CORE_DIMENSIONS } from '../forge/dimensions.js';
import type { TimelineData, TimelinePoint } from './types.js';

// ── Preference Stability ───────────────────────────

export interface PreferenceStability {
  dimension: string;
  pKnown: number;
  observationCount: number;
  isStable: boolean; // P(known) >= 0.7
}

/** BKT P(known) 안정성 데이터 로드 */
export function getPreferenceStability(): PreferenceStability[] {
  const states = loadPreferenceStates();
  if (!states) return [];

  return Object.entries(states).map(([dim, state]) => ({
    dimension: dim,
    pKnown: state.pKnown,
    observationCount: state.observations?.length ?? 0,
    isStable: state.pKnown >= 0.7,
  }));
}

/** ASCII 안정성 바 렌더링 */
export function renderStabilityBars(stability: PreferenceStability[]): string {
  if (stability.length === 0) {
    return '  데이터 수집 중... (BKT 선호 안정성은 세션 데이터가 축적되면 표시됩니다)';
  }

  const lines: string[] = ['  ── Preference Stability ───────────────'];
  for (const s of stability) {
    const bar = '█'.repeat(Math.round(s.pKnown * 20)).padEnd(20, '░');
    const status = s.isStable ? '안정' : '학습중';
    lines.push(`  ${s.dimension.padEnd(22)} [${bar}] ${s.pKnown.toFixed(2)}  ${status}  (${s.observationCount} obs)`);
  }
  return lines.join('\n');
}

// ── Data Loading ───────────────────────────────────

/** Thompson observations + evolution history → 통합 타임라인 */
export function buildTimelineData(): TimelineData {
  const points: TimelinePoint[] = [];

  // 1. Thompson Sampling observations (최대 200개)
  const state = loadThompsonState();
  if (state?.observations) {
    for (const obs of state.observations) {
      points.push({
        timestamp: obs.timestamp,
        dimensions: obs.dimensionValues,
        reward: obs.reward,
      });
    }
  }

  // 2. Evolution history로 보완 (observations에 없는 시점)
  const history = loadEvolutionHistory();
  const obsTimestamps = new Set(points.map(p => p.timestamp));
  for (const record of history) {
    if (!obsTimestamps.has(record.timestamp)) {
      points.push({
        timestamp: record.timestamp,
        dimensions: record.newVector,
        reward: 0,
      });
    }
  }

  // 시간순 정렬
  points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const dateRange = points.length > 0
    ? { start: points[0].timestamp, end: points[points.length - 1].timestamp }
    : null;

  return {
    points,
    dimensionNames: [...CORE_DIMENSIONS],
    dateRange,
  };
}

// ── ASCII Sparkline ────────────────────────────────

const SPARK_CHARS = '▁▂▃▄▅▆▇█';

/** 값 배열을 sparkline 문자열로 변환 */
export function renderSparkline(values: number[], width: number = 30): string {
  if (values.length === 0) return '(no data)';

  // 최근 width개만 사용
  const slice = values.slice(-width);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = max - min;

  return slice.map(v => {
    if (range === 0) return SPARK_CHARS[4]; // 변화 없으면 중간값
    const idx = Math.min(Math.round(((v - min) / range) * 7), 7);
    return SPARK_CHARS[idx];
  }).join('');
}

/** 타임라인 데이터 → ASCII small multiples 렌더링 */
export function renderAsciiTimeline(data: TimelineData): string {
  if (data.points.length === 0) {
    return '  데이터 수집 중... (forge v2 파이프라인 활성화 후 세션 데이터가 축적됩니다)';
  }

  const lines: string[] = ['  ── Evolution Timeline ──────────────────'];

  for (const dim of data.dimensionNames) {
    const values = data.points.map(p => p.dimensions[dim] ?? 0.5);
    const current = values[values.length - 1];
    const spark = renderSparkline(values);
    const label = dim.padEnd(22);
    lines.push(`  ${label} ${spark}  ${current.toFixed(2)}  (${values.length} pts)`);
  }

  if (data.dateRange) {
    const start = data.dateRange.start.split('T')[0];
    const end = data.dateRange.end.split('T')[0];
    lines.push(`\n  Period: ${start} ~ ${end}`);
  }

  return lines.join('\n');
}

// ── Chart.js Data ──────────────────────────────────

/** Chart.js line chart 용 데이터 객체 생성 */
export function toChartData(data: TimelineData): {
  labels: string[];
  datasets: Array<{ label: string; data: number[]; borderColor: string }>;
} {
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const labels = data.points.map(p => p.timestamp.split('T')[0]);

  const datasets = data.dimensionNames.map((dim, i) => ({
    label: dim,
    data: data.points.map(p => p.dimensions[dim] ?? 0.5),
    borderColor: colors[i % colors.length],
  }));

  return { labels, datasets };
}
