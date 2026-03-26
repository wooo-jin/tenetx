/**
 * Swarm Manager — 파일 기반 분산 task claiming
 *
 * 설계 결정:
 *   - SQLite 대신 파일 기반 atomic lock (O_EXCL 플래그)으로 동시성 제어
 *   - 이유: 런타임 의존성 최소화 원칙 유지 (현재 deps 3개)
 *   - 트레이드오프: 높은 동시성(100+ 에이전트)에서는 SQLite가 더 적합하지만,
 *     tenetx 사용 패턴(5-20 에이전트)에서는 파일 락으로 충분
 *
 * 동시성 제어 메커니즘:
 *   1. task 파일: .compound/swarm/{id}.json
 *   2. lock 파일: .compound/swarm/{id}.lock
 *   3. claimTask 시 O_EXCL 플래그로 lock 파일 생성 시도
 *      - 성공하면 해당 에이전트가 task를 claim
 *      - EEXIST 에러면 다른 에이전트가 이미 claim한 것
 *   4. cleanup()으로 타임아웃된 stale lock 정리
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { SwarmTask, SwarmStatus } from './swarm-types.js';
import { DEFAULT_CLAIM_TIMEOUT_MS } from './swarm-types.js';

export class SwarmManager {
  private readonly swarmDir: string;

  constructor(cwd: string) {
    this.swarmDir = path.join(cwd, '.compound', 'swarm');
  }

  /** swarm 디렉토리 초기화 */
  private ensureDir(): void {
    fs.mkdirSync(this.swarmDir, { recursive: true });
  }

  /** task 파일 경로 */
  private taskPath(taskId: string): string {
    return path.join(this.swarmDir, `${taskId}.json`);
  }

  /** lock 파일 경로 */
  private lockPath(taskId: string): string {
    return path.join(this.swarmDir, `${taskId}.lock`);
  }

  /**
   * 새로운 task 생성
   * @returns 생성된 SwarmTask
   */
  createTask(description: string, timeout: number = DEFAULT_CLAIM_TIMEOUT_MS): SwarmTask {
    this.ensureDir();

    const task: SwarmTask = {
      id: crypto.randomUUID(),
      description,
      status: 'pending',
      claimedBy: null,
      claimedAt: null,
      timeout,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(this.taskPath(task.id), JSON.stringify(task, null, 2));
    return task;
  }

  /**
   * pending 상태의 task를 하나 claim
   *
   * O_EXCL 플래그로 lock 파일 생성을 시도하여 atomic claiming을 보장한다.
   * lock 파일 생성에 성공한 에이전트만 해당 task를 claim할 수 있다.
   *
   * @returns claim된 task, 또는 가용 task가 없으면 null
   */
  claimTask(agentId: string): SwarmTask | null {
    this.ensureDir();

    const files = fs.readdirSync(this.swarmDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(this.swarmDir, file);
      let task: SwarmTask;
      try {
        task = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        continue; // 손상된 파일 스킵
      }

      if (task.status !== 'pending') continue;

      // O_EXCL로 lock 파일 생성 시도 — atomic operation
      const lockFile = this.lockPath(task.id);
      try {
        const fd = fs.openSync(lockFile, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL);
        fs.writeSync(fd, agentId);
        fs.closeSync(fd);
      } catch (err: unknown) {
        // EEXIST: 다른 에이전트가 이미 lock을 획득함 → 다음 task 시도
        if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw err;
      }

      // lock 획득 성공 → task 상태 업데이트
      task.status = 'claimed';
      task.claimedBy = agentId;
      task.claimedAt = new Date().toISOString();
      fs.writeFileSync(filePath, JSON.stringify(task, null, 2));

      return task;
    }

    return null;
  }

  /**
   * task 완료 처리
   * @returns 업데이트된 task, 또는 존재하지 않으면 null
   */
  completeTask(taskId: string, result: string): SwarmTask | null {
    const filePath = this.taskPath(taskId);
    if (!fs.existsSync(filePath)) return null;

    const task: SwarmTask = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    task.status = 'completed';
    task.result = result;
    fs.writeFileSync(filePath, JSON.stringify(task, null, 2));

    // lock 파일 정리
    this.removeLock(taskId);

    return task;
  }

  /**
   * task 실패 처리
   * @returns 업데이트된 task, 또는 존재하지 않으면 null
   */
  failTask(taskId: string, error: string): SwarmTask | null {
    const filePath = this.taskPath(taskId);
    if (!fs.existsSync(filePath)) return null;

    const task: SwarmTask = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    task.status = 'failed';
    task.error = error;
    fs.writeFileSync(filePath, JSON.stringify(task, null, 2));

    // lock 파일 정리
    this.removeLock(taskId);

    return task;
  }

  /**
   * 단일 task 조회
   * @returns task 또는 존재하지 않으면 null
   */
  getTask(taskId: string): SwarmTask | null {
    const filePath = this.taskPath(taskId);
    if (!fs.existsSync(filePath)) return null;

    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * 전체 swarm 상태 반환
   */
  getStatus(): SwarmStatus {
    this.ensureDir();

    const files = fs.readdirSync(this.swarmDir).filter(f => f.endsWith('.json'));
    const tasks: SwarmTask[] = [];

    for (const file of files) {
      try {
        const task: SwarmTask = JSON.parse(
          fs.readFileSync(path.join(this.swarmDir, file), 'utf-8'),
        );
        tasks.push(task);
      } catch {
        // 손상된 파일 스킵
      }
    }

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      claimed: tasks.filter(t => t.status === 'claimed').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      failed: tasks.filter(t => t.status === 'failed').length,
      tasks,
    };
  }

  /**
   * stale lock 정리 — 타임아웃 초과된 claimed task를 pending으로 복원
   *
   * @returns 복원된 task ID 목록
   */
  cleanup(): string[] {
    this.ensureDir();

    const now = Date.now();
    const restored: string[] = [];
    const files = fs.readdirSync(this.swarmDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(this.swarmDir, file);
      let task: SwarmTask;
      try {
        task = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        continue;
      }

      if (task.status !== 'claimed' || !task.claimedAt) continue;

      const elapsed = now - new Date(task.claimedAt).getTime();
      if (elapsed > task.timeout) {
        // 타임아웃 → pending으로 복원
        task.status = 'pending';
        task.claimedBy = null;
        task.claimedAt = null;
        fs.writeFileSync(filePath, JSON.stringify(task, null, 2));
        this.removeLock(task.id);
        restored.push(task.id);
      }
    }

    return restored;
  }

  /** lock 파일 안전 삭제 */
  private removeLock(taskId: string): void {
    const lockFile = this.lockPath(taskId);
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // lock 파일이 이미 없으면 무시
    }
  }
}
