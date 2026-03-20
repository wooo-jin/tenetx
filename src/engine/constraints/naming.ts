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
        message: `Filename "${fileName}" does not match naming convention (pattern: ${rule.pattern})`,
        suggestion: `Rename the file to match the convention.`,
      }];
    }
  } catch {
    // 잘못된 정규식 — 무시
  }

  return [];
}
