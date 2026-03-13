/**
 * Naming Convention Constraint — 파일명 규칙 검사
 */

import * as path from 'node:path';
import type { NamingRule, ConstraintViolation } from './types.js';

export function checkNaming(
  relativePath: string,
  rule: NamingRule,
): ConstraintViolation[] {
  const fileName = path.basename(relativePath);

  try {
    const regex = new RegExp(rule.pattern);
    if (!regex.test(fileName)) {
      return [{
        constraintId: rule.id,
        severity: rule.severity,
        filePath: relativePath,
        message: `파일명 "${fileName}"이 네이밍 규칙에 맞지 않습니다 (패턴: ${rule.pattern})`,
        suggestion: `파일명을 규칙에 맞게 변경하세요.`,
      }];
    }
  } catch {
    // 잘못된 정규식 — 무시
  }

  return [];
}
