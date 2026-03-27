/**
 * Reward Function 수학적 검증 테스트
 *
 * 검증 대상:
 * 1. 가중합이 [0, 1] 범위
 * 2. 각 구성요소의 경계 동작
 * 3. NaN 방어
 * 4. 빈 이벤트 핸들링
 */

import { describe, it, expect } from 'vitest';
import { computeRewardComponents, computeSessionRewards } from '../../src/lab/reward.js';
import type { LabEvent } from '../../src/lab/types.js';

function makeEvent(type: string, payload: Record<string, unknown> = {}, sessionId = 'test'): LabEvent {
  return {
    id: Math.random().toString(36),
    type: type as LabEvent['type'],
    timestamp: new Date().toISOString(),
    sessionId,
    payload,
  };
}

describe('Reward Function', () => {
  describe('computeRewardComponents', () => {
    it('override 없는 세션은 nonOverrideRate=1.0', () => {
      const events = [
        makeEvent('agent-call', { result: 'success' }),
        makeEvent('skill-invocation', { result: 'success' }),
      ];
      const comp = computeRewardComponents(events);
      expect(comp.nonOverrideRate).toBe(1.0);
    });

    it('50% override 세션은 nonOverrideRate=0.5', () => {
      const events = [
        makeEvent('agent-call', { result: 'success' }),
        makeEvent('user-override', {}),
      ];
      const comp = computeRewardComponents(events);
      expect(comp.nonOverrideRate).toBe(0.5);
    });

    it('100% 성공 세션은 successRate=1.0', () => {
      const events = [
        makeEvent('agent-call', { result: 'success' }),
        makeEvent('skill-invocation', { result: 'success' }),
      ];
      const comp = computeRewardComponents(events);
      expect(comp.successRate).toBe(1.0);
    });

    it('task 이벤트 없으면 successRate=0.5 (중립)', () => {
      const events = [makeEvent('hook-trigger', { result: 'approve' })];
      const comp = computeRewardComponents(events);
      expect(comp.successRate).toBe(0.5);
    });

    it('훅 차단 없으면 lowBlockRate=1.0', () => {
      const events = [
        makeEvent('hook-trigger', { result: 'approve' }),
        makeEvent('hook-trigger', { result: 'approve' }),
      ];
      const comp = computeRewardComponents(events);
      expect(comp.lowBlockRate).toBe(1.0);
    });

    it('모든 구성요소가 [0, 1] 범위', () => {
      const events = [
        makeEvent('agent-call', { result: 'error' }),
        makeEvent('user-override', {}),
        makeEvent('hook-trigger', { result: 'block' }),
        makeEvent('session-metrics', { estimatedCost: 100 }),
      ];
      const comp = computeRewardComponents(events);
      for (const val of Object.values(comp)) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });

    it('빈 이벤트 배열도 안전하게 처리', () => {
      const comp = computeRewardComponents([]);
      expect(comp.nonOverrideRate).toBe(1.0);
      expect(comp.successRate).toBe(0.5);
      expect(comp.lowBlockRate).toBe(1.0);
    });
  });

  describe('computeSessionRewards', () => {
    it('3개 미만 이벤트 세션은 제외된다', () => {
      const events = [makeEvent('agent-call', {}, 'short'), makeEvent('agent-call', {}, 'short')];
      const rewards = computeSessionRewards(events);
      expect(rewards.length).toBe(0);
    });

    it('세션별로 분리하여 보상을 계산한다', () => {
      const events = [
        makeEvent('agent-call', { result: 'success' }, 'session-a'),
        makeEvent('agent-call', { result: 'success' }, 'session-a'),
        makeEvent('agent-call', { result: 'success' }, 'session-a'),
        makeEvent('agent-call', { result: 'error' }, 'session-b'),
        makeEvent('agent-call', { result: 'error' }, 'session-b'),
        makeEvent('agent-call', { result: 'error' }, 'session-b'),
      ];
      const rewards = computeSessionRewards(events);
      expect(rewards.length).toBe(2);
      const a = rewards.find(r => r.sessionId === 'session-a')!;
      const b = rewards.find(r => r.sessionId === 'session-b')!;
      expect(a.reward).toBeGreaterThan(b.reward);
    });

    it('최종 보상이 [0, 1] 범위', () => {
      const events = Array.from({ length: 10 }, () =>
        makeEvent('agent-call', { result: Math.random() > 0.5 ? 'success' : 'error' }),
      );
      const rewards = computeSessionRewards(events);
      for (const r of rewards) {
        expect(r.reward).toBeGreaterThanOrEqual(0);
        expect(r.reward).toBeLessThanOrEqual(1);
      }
    });
  });
});
