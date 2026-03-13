import type { Philosophy } from '../core/types.js';

export interface MonitorAlert {
  level: 'info' | 'warning' | 'critical';
  message: string;
  principle?: string;
}

export interface SessionMetrics {
  fileEdits: Record<string, number>;  // 파일별 편집 횟수
  sessionStartTime: number;           // 세션 시작 시각 (ms)
  estimatedCost: number;              // 추정 비용 ($)
  contextPercent: number;             // 컨텍스트 사용률 (%)
}

/** 철학에서 경고 임계값 추출 */
interface Thresholds {
  maxFileEdits: number;
  maxCost: number;
  maxSessionMinutes: number;
  contextWarning: number;
}

function extractThresholds(philosophy: Philosophy): Thresholds {
  const defaults: Thresholds = {
    maxFileEdits: 5,
    maxCost: 10,
    maxSessionMinutes: 40,
    contextWarning: 70,
  };

  for (const principle of Object.values(philosophy.principles)) {
    for (const gen of principle.generates) {
      if (typeof gen === 'object' && gen.alert) {
        const alert = gen.alert;
        // "같은 파일 5회 편집 시 중단 권고" → maxFileEdits = 5
        const editMatch = alert.match(/(\d+)회\s*편집/);
        if (editMatch) defaults.maxFileEdits = parseInt(editMatch[1]);

        // "세션 비용 $10+ 시 경고" → maxCost = 10
        const costMatch = alert.match(/\$(\d+)/);
        if (costMatch) defaults.maxCost = parseInt(costMatch[1]);
      }
    }
  }

  return defaults;
}

export class SessionMonitor {
  private metrics: SessionMetrics;
  private thresholds: Thresholds;

  constructor(philosophy: Philosophy) {
    this.thresholds = extractThresholds(philosophy);
    this.metrics = {
      fileEdits: {},
      sessionStartTime: Date.now(),
      estimatedCost: 0,
      contextPercent: 0,
    };
  }

  /** 파일 편집 기록 */
  recordFileEdit(filePath: string): void {
    this.metrics.fileEdits[filePath] = (this.metrics.fileEdits[filePath] ?? 0) + 1;
  }

  /** 비용 업데이트 */
  updateCost(cost: number): void {
    this.metrics.estimatedCost = cost;
  }

  /** 컨텍스트 사용률 업데이트 */
  updateContext(percent: number): void {
    this.metrics.contextPercent = percent;
  }

  /** 현재 상태 체크하여 경고 생성 */
  check(): MonitorAlert[] {
    const alerts: MonitorAlert[] = [];

    // 파일 편집 횟수 체크
    for (const [file, count] of Object.entries(this.metrics.fileEdits)) {
      if (count >= this.thresholds.maxFileEdits) {
        const shortName = file.split('/').slice(-2).join('/');
        alerts.push({
          level: 'critical',
          message: `🔴 ${shortName} ${count}회 편집 — 중단하고 구조를 재검토하세요`,
          principle: 'decompose-to-control',
        });
      }
    }

    // 비용 체크
    if (this.metrics.estimatedCost >= this.thresholds.maxCost) {
      alerts.push({
        level: 'warning',
        message: `⚠ 세션 비용 $${this.metrics.estimatedCost.toFixed(2)} — 범위 축소를 권고합니다`,
        principle: 'focus-resources-on-judgment',
      });
    }

    // 세션 시간 체크
    const elapsed = (Date.now() - this.metrics.sessionStartTime) / 60000;
    if (elapsed >= this.thresholds.maxSessionMinutes) {
      alerts.push({
        level: 'warning',
        message: `⚠ 세션 ${Math.round(elapsed)}분 경과 — compact 또는 새 세션을 권고합니다`,
        principle: 'decompose-to-control',
      });
    }

    // 컨텍스트 체크
    if (this.metrics.contextPercent >= this.thresholds.contextWarning) {
      alerts.push({
        level: 'warning',
        message: `⚠ 컨텍스트 ${this.metrics.contextPercent}% — 곧 compact 됩니다`,
      });
    }

    return alerts;
  }

  /** 현재 메트릭 반환 */
  getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }
}
