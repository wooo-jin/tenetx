import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { SwarmManager } from '../../src/engine/swarm.js';
import { DEFAULT_CLAIM_TIMEOUT_MS } from '../../src/engine/swarm-types.js';

describe('SwarmManager', () => {
  let tmpDir: string;
  let manager: SwarmManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swarm-test-'));
    manager = new SwarmManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- Task CRUD ---

  it('createTask: pending 상태의 task를 생성한다', () => {
    const task = manager.createTask('implement feature X');

    expect(task.id).toBeTruthy();
    expect(task.description).toBe('implement feature X');
    expect(task.status).toBe('pending');
    expect(task.claimedBy).toBeNull();
    expect(task.claimedAt).toBeNull();
    expect(task.timeout).toBe(DEFAULT_CLAIM_TIMEOUT_MS);
    expect(task.createdAt).toBeTruthy();
  });

  it('createTask: 커스텀 timeout을 설정할 수 있다', () => {
    const task = manager.createTask('quick task', 60_000);
    expect(task.timeout).toBe(60_000);
  });

  it('getTask: 생성된 task를 ID로 조회한다', () => {
    const created = manager.createTask('read task');
    const fetched = manager.getTask(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(created.id);
    expect(fetched!.description).toBe('read task');
  });

  it('getTask: 존재하지 않는 ID는 null을 반환한다', () => {
    expect(manager.getTask('nonexistent-id')).toBeNull();
  });

  it('completeTask: task를 completed 상태로 전환한다', () => {
    const task = manager.createTask('complete me');
    // claim 먼저
    manager.claimTask('agent-1');

    const completed = manager.completeTask(task.id, 'done successfully');
    expect(completed).not.toBeNull();
    expect(completed!.status).toBe('completed');
    expect(completed!.result).toBe('done successfully');
  });

  it('completeTask: 존재하지 않는 task는 null을 반환한다', () => {
    expect(manager.completeTask('nonexistent', 'result')).toBeNull();
  });

  it('failTask: task를 failed 상태로 전환한다', () => {
    const task = manager.createTask('fail me');
    manager.claimTask('agent-1');

    const failed = manager.failTask(task.id, 'timeout exceeded');
    expect(failed).not.toBeNull();
    expect(failed!.status).toBe('failed');
    expect(failed!.error).toBe('timeout exceeded');
  });

  it('failTask: 존재하지 않는 task는 null을 반환한다', () => {
    expect(manager.failTask('nonexistent', 'error')).toBeNull();
  });

  // --- Claiming ---

  it('claimTask: pending task를 claim하면 claimed 상태가 된다', () => {
    manager.createTask('claim me');
    const claimed = manager.claimTask('agent-alpha');

    expect(claimed).not.toBeNull();
    expect(claimed!.status).toBe('claimed');
    expect(claimed!.claimedBy).toBe('agent-alpha');
    expect(claimed!.claimedAt).toBeTruthy();
  });

  it('claimTask: pending task가 없으면 null을 반환한다', () => {
    expect(manager.claimTask('agent-1')).toBeNull();
  });

  it('claimTask: 이미 claimed된 task는 다른 에이전트가 claim할 수 없다 (atomic lock)', () => {
    manager.createTask('single task');

    const first = manager.claimTask('agent-1');
    const second = manager.claimTask('agent-2');

    expect(first).not.toBeNull();
    // second는 pending task가 더 없으므로 null
    expect(second).toBeNull();
  });

  it('claimTask: 여러 pending task 중 순서대로 claim한다', () => {
    const t1 = manager.createTask('task 1');
    const t2 = manager.createTask('task 2');
    const t3 = manager.createTask('task 3');

    const claimed1 = manager.claimTask('agent-a');
    const claimed2 = manager.claimTask('agent-b');
    const claimed3 = manager.claimTask('agent-c');
    const claimed4 = manager.claimTask('agent-d'); // 더 이상 없음

    expect(claimed1).not.toBeNull();
    expect(claimed2).not.toBeNull();
    expect(claimed3).not.toBeNull();
    expect(claimed4).toBeNull();

    // 3개 모두 서로 다른 task
    const ids = new Set([claimed1!.id, claimed2!.id, claimed3!.id]);
    expect(ids.size).toBe(3);
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
    expect(ids).toContain(t3.id);
  });

  it('claimTask: 동시 접근 시뮬레이션 — lock 파일이 이미 존재하면 claim 실패', () => {
    const task = manager.createTask('contested task');

    // 수동으로 lock 파일 생성하여 다른 에이전트가 claim한 상황 시뮬레이션
    const lockPath = path.join(tmpDir, '.compound', 'swarm', `${task.id}.lock`);
    fs.writeFileSync(lockPath, 'agent-sneaky', { flag: 'wx' });

    // 이 에이전트는 해당 task를 claim할 수 없어야 함
    const claimed = manager.claimTask('agent-late');
    expect(claimed).toBeNull();
  });

  // --- Status ---

  it('getStatus: 전체 swarm 상태를 올바르게 집계한다', () => {
    const t1 = manager.createTask('pending task');
    const t2 = manager.createTask('to be claimed');
    const t3 = manager.createTask('to be completed');
    const t4 = manager.createTask('to be failed');

    manager.claimTask('agent-1'); // t1 또는 t2 claim
    manager.claimTask('agent-2'); // 나머지 claim

    // t3 complete, t4 fail
    manager.completeTask(t3.id, 'done');
    manager.failTask(t4.id, 'error');

    const status = manager.getStatus();
    expect(status.total).toBe(4);
    expect(status.completed).toBe(1);
    expect(status.failed).toBe(1);
    // claimed + pending = 2 (두 개가 claim됨, t3/t4는 각각 complete/fail)
    expect(status.claimed + status.pending).toBe(2);
    expect(status.tasks).toHaveLength(4);
  });

  it('getStatus: task가 없으면 모두 0을 반환한다', () => {
    const status = manager.getStatus();
    expect(status.total).toBe(0);
    expect(status.pending).toBe(0);
    expect(status.claimed).toBe(0);
    expect(status.completed).toBe(0);
    expect(status.failed).toBe(0);
    expect(status.tasks).toHaveLength(0);
  });

  // --- Cleanup (stale lock 정리) ---

  it('cleanup: 타임아웃 초과된 claimed task를 pending으로 복원한다', () => {
    const task = manager.createTask('stale task', 100); // 100ms timeout
    manager.claimTask('agent-slow');

    // claimedAt을 과거로 조작하여 타임아웃 시뮬레이션
    const filePath = path.join(tmpDir, '.compound', 'swarm', `${task.id}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    data.claimedAt = new Date(Date.now() - 200).toISOString(); // 200ms 전
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    const restored = manager.cleanup();
    expect(restored).toContain(task.id);

    const updated = manager.getTask(task.id);
    expect(updated!.status).toBe('pending');
    expect(updated!.claimedBy).toBeNull();
    expect(updated!.claimedAt).toBeNull();
  });

  it('cleanup: 타임아웃 이내인 claimed task는 복원하지 않는다', () => {
    manager.createTask('fresh task'); // 기본 5분 timeout
    manager.claimTask('agent-fast');

    const restored = manager.cleanup();
    expect(restored).toHaveLength(0);
  });

  it('cleanup: lock 파일도 함께 삭제한다', () => {
    const task = manager.createTask('lock cleanup test', 100);
    manager.claimTask('agent-1');

    const lockPath = path.join(tmpDir, '.compound', 'swarm', `${task.id}.lock`);
    expect(fs.existsSync(lockPath)).toBe(true);

    // 타임아웃 시뮬레이션
    const filePath = path.join(tmpDir, '.compound', 'swarm', `${task.id}.json`);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    data.claimedAt = new Date(Date.now() - 200).toISOString();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    manager.cleanup();
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
