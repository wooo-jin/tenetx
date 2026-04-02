import { describe, it, expect } from 'vitest';
import { buildRoutingTable, toModelTaskMap } from '../src/core/routing-engine.js';

const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;
const REQUIRED_TASKS = ['explore', 'implement', 'review', 'design', 'security', 'architecture'];

describe('buildRoutingTable', () => {
  it('default 프리셋이 모든 필수 태스크를 포함한다', () => {
    const table = buildRoutingTable('default');
    for (const task of REQUIRED_TASKS) {
      expect(table.routes).toHaveProperty(task);
    }
  });

  it('max-quality 프리셋이 모든 필수 태스크를 포함한다', () => {
    const table = buildRoutingTable('max-quality');
    for (const task of REQUIRED_TASKS) {
      expect(table.routes).toHaveProperty(task);
    }
  });

  it('cost-saving 프리셋이 모든 필수 태스크를 포함한다', () => {
    const table = buildRoutingTable('cost-saving');
    for (const task of REQUIRED_TASKS) {
      expect(table.routes).toHaveProperty(task);
    }
  });

  it('모든 모델 값이 유효하다 (opus/sonnet/haiku)', () => {
    for (const preset of ['default', 'max-quality', 'cost-saving']) {
      const table = buildRoutingTable(preset);
      for (const [task, model] of Object.entries(table.routes)) {
        expect(VALID_MODELS).toContain(model);
      }
    }
  });

  it('max-quality는 default보다 opus를 더 많이 사용한다', () => {
    const defaultTable = buildRoutingTable('default');
    const maxQTable = buildRoutingTable('max-quality');

    const countOpus = (routes: Record<string, string>) =>
      Object.values(routes).filter(m => m === 'opus').length;

    expect(countOpus(maxQTable.routes)).toBeGreaterThan(countOpus(defaultTable.routes));
  });

  it('cost-saving은 default보다 haiku를 더 많이 사용한다', () => {
    const defaultTable = buildRoutingTable('default');
    const costTable = buildRoutingTable('cost-saving');

    const countHaiku = (routes: Record<string, string>) =>
      Object.values(routes).filter(m => m === 'haiku').length;

    expect(countHaiku(costTable.routes)).toBeGreaterThan(countHaiku(defaultTable.routes));
  });

  it('알 수 없는 프리셋은 default로 폴백한다', () => {
    const table = buildRoutingTable('unknown-preset');
    const defaultTable = buildRoutingTable('default');
    expect(table.routes).toEqual(defaultTable.routes);
  });
});

describe('toModelTaskMap', () => {
  it('task→model 테이블을 model→tasks[] 형태로 변환한다', () => {
    const table = buildRoutingTable('default');
    const map = toModelTaskMap(table);

    // map의 키는 모델 이름, 값은 태스크 배열
    for (const [model, tasks] of Object.entries(map)) {
      expect(VALID_MODELS).toContain(model);
      expect(Array.isArray(tasks)).toBe(true);
      for (const task of tasks) {
        expect(table.routes[task]).toBe(model);
      }
    }
  });

  it('변환 후 모든 태스크가 보존된다', () => {
    const table = buildRoutingTable('max-quality');
    const map = toModelTaskMap(table);

    const allTasks = Object.values(map).flat();
    for (const task of REQUIRED_TASKS) {
      expect(allTasks).toContain(task);
    }
  });
});
