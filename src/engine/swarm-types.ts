/**
 * Swarm 모드 타입 정의
 *
 * 파일 기반 분산 task claiming 시스템.
 * SQLite 없이 fs.writeFileSync + O_EXCL 플래그로 atomic lock을 구현하여
 * 런타임 의존성 최소화 원칙(현재 3개)을 유지한다.
 */

export type SwarmTaskStatus = 'pending' | 'claimed' | 'completed' | 'failed';

export interface SwarmTask {
  /** 고유 식별자 (UUID v4 형식) */
  id: string;
  /** 작업 설명 */
  description: string;
  /** 현재 상태 */
  status: SwarmTaskStatus;
  /** claim한 에이전트 ID (null이면 미할당) */
  claimedBy: string | null;
  /** claim 시각 (ISO 8601) */
  claimedAt: string | null;
  /** claim 타임아웃 (밀리초). 기본 5분 (300_000ms) */
  timeout: number;
  /** 작업 생성 시각 (ISO 8601) */
  createdAt: string;
  /** 작업 완료 결과 (완료 시) */
  result?: string;
  /** 작업 실패 사유 (실패 시) */
  error?: string;
}

export interface SwarmStatus {
  total: number;
  pending: number;
  claimed: number;
  completed: number;
  failed: number;
  tasks: SwarmTask[];
}

/** 기본 claim 타임아웃: 5분 */
export const DEFAULT_CLAIM_TIMEOUT_MS = 300_000;
