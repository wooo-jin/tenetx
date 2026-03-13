/**
 * Architecture Constraint Types
 *
 * 프로젝트별 아키텍처 제약을 정의하고 검증하기 위한 타입 시스템.
 */

export type ConstraintSeverity = 'error' | 'warn' | 'info';

export interface ConstraintViolation {
  constraintId: string;
  severity: ConstraintSeverity;
  filePath: string;
  message: string;
  suggestion?: string;
}

export interface ConstraintRule {
  id: string;
  name: string;
  description: string;
  severity: ConstraintSeverity;
  /** 이 제약이 적용되는 glob 패턴 (기본: 모든 파일) */
  include?: string[];
  /** 제외 패턴 */
  exclude?: string[];
  /** 활성화 여부 (기본: true) */
  enabled?: boolean;
}

export interface FileSizeRule extends ConstraintRule {
  type: 'file-size';
  maxLines: number;
}

export interface NamingRule extends ConstraintRule {
  type: 'naming';
  /** 파일명 패턴 (정규식 문자열) */
  pattern: string;
  /** 적용 대상 glob */
  target: string;
}

export interface DependencyDirectionRule extends ConstraintRule {
  type: 'dependency-direction';
  /** 레이어 순서 (상위 → 하위). 상위 레이어는 하위만 import 가능 */
  layers: string[];
}

export interface CustomPatternRule extends ConstraintRule {
  type: 'custom-pattern';
  /** 금지 패턴 (정규식 문자열) */
  forbiddenPattern: string;
  /** 허용 패턴 예외 (정규식 문자열) */
  allowedExceptions?: string[];
}

export type AnyConstraintRule =
  | FileSizeRule
  | NamingRule
  | DependencyDirectionRule
  | CustomPatternRule;

export interface ConstraintConfig {
  version: string;
  rules: AnyConstraintRule[];
}

export interface ConstraintResult {
  violations: ConstraintViolation[];
  checkedFiles: number;
  passedFiles: number;
}
