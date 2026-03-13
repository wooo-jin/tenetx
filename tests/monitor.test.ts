import { describe, it, expect } from 'vitest';
import { SessionMonitor } from '../src/engine/monitor.js';
import type { Philosophy } from '../src/core/types.js';

/** 테스트용 최소 Philosophy 생성 */
function makePhilosophy(overrides?: Partial<Philosophy>): Philosophy {
  return {
    name: 'test',
    version: '1.0.0',
    principles: {
      'decompose-to-control': {
        maxim: 'test',
        generates: [
          { alert: '같은 파일 5회 편집 시 중단 권고' },
          { routing: { explore: 'sonnet' } },
        ],
      },
      'focus-resources-on-judgment': {
        maxim: 'test',
        generates: [
          { alert: '세션 비용 $10+ 시 경고' },
        ],
      },
    },
    ...overrides,
  } as Philosophy;
}

describe('SessionMonitor', () => {
  it('초기 메트릭은 모두 0', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    const metrics = monitor.getMetrics();
    expect(metrics.estimatedCost).toBe(0);
    expect(metrics.contextPercent).toBe(0);
    expect(Object.keys(metrics.fileEdits)).toHaveLength(0);
  });

  it('파일 편집 기록', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    monitor.recordFileEdit('/src/app.ts');
    monitor.recordFileEdit('/src/app.ts');
    expect(monitor.getMetrics().fileEdits['/src/app.ts']).toBe(2);
  });

  it('파일 5회 편집 시 critical 알림', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    for (let i = 0; i < 5; i++) {
      monitor.recordFileEdit('/src/app.ts');
    }
    const alerts = monitor.check();
    const critical = alerts.find(a => a.level === 'critical');
    expect(critical).toBeDefined();
    expect(critical!.message).toContain('5회 편집');
    expect(critical!.principle).toBe('decompose-to-control');
  });

  it('4회 편집은 알림 없음', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    for (let i = 0; i < 4; i++) {
      monitor.recordFileEdit('/src/app.ts');
    }
    const alerts = monitor.check();
    expect(alerts.filter(a => a.level === 'critical')).toHaveLength(0);
  });

  it('비용 $10 이상 시 warning 알림', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    monitor.updateCost(10);
    const alerts = monitor.check();
    const warning = alerts.find(a => a.message.includes('비용'));
    expect(warning).toBeDefined();
    expect(warning!.level).toBe('warning');
  });

  it('비용 $5는 알림 없음', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    monitor.updateCost(5);
    const alerts = monitor.check();
    expect(alerts.filter(a => a.message.includes('비용'))).toHaveLength(0);
  });

  it('컨텍스트 70% 이상 시 warning', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    monitor.updateContext(75);
    const alerts = monitor.check();
    const warning = alerts.find(a => a.message.includes('컨텍스트'));
    expect(warning).toBeDefined();
    expect(warning!.message).toContain('75%');
  });

  it('복합 알림 (파일+비용+컨텍스트 동시)', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    for (let i = 0; i < 5; i++) monitor.recordFileEdit('/a.ts');
    monitor.updateCost(15);
    monitor.updateContext(80);
    const alerts = monitor.check();
    expect(alerts.length).toBeGreaterThanOrEqual(3);
  });

  it('여러 파일 각각 추적', () => {
    const monitor = new SessionMonitor(makePhilosophy());
    for (let i = 0; i < 3; i++) monitor.recordFileEdit('/a.ts');
    for (let i = 0; i < 5; i++) monitor.recordFileEdit('/b.ts');
    const alerts = monitor.check();
    // /b.ts만 5회 → critical 1개
    const critical = alerts.filter(a => a.level === 'critical');
    expect(critical).toHaveLength(1);
    expect(critical[0].message).toContain('b.ts');
  });
});
