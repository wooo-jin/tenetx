/**
 * Autonomy Loop Types — 에이전트 자율 루프 타입
 */

export type LoopStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export interface LoopStep {
  name: string;
  status: LoopStatus;
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface LoopResult {
  loopName: string;
  status: 'passed' | 'failed' | 'partial';
  steps: LoopStep[];
  summary: string;
  violations?: number;
  suggestions?: string[];
}

export interface VerifyLoopOptions {
  cwd: string;
  /** 빌드 명령어 (기본: 자동 감지) */
  buildCommand?: string;
  /** 테스트 명령어 (기본: 자동 감지) */
  testCommand?: string;
  /** 제약 검사 포함 여부 (기본: true) */
  checkConstraints?: boolean;
  /** 타입 체크 포함 여부 (기본: true) */
  checkTypes?: boolean;
}

export interface ReviewLoopOptions {
  cwd: string;
  /** 변경된 파일 목록 (없으면 git diff에서 추출) */
  changedFiles?: string[];
  /** 리뷰 깊이 */
  depth?: 'quick' | 'standard' | 'thorough';
}

export interface GardeningLoopOptions {
  cwd: string;
  /** 맵 신선도 체크 포함 */
  checkMapFreshness?: boolean;
  /** 고아 파일 탐지 포함 */
  detectOrphans?: boolean;
}
