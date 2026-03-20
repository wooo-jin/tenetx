/**
 * Custom Pattern Constraint — 사용자 정의 금지 패턴 검사
 */

import type { CustomPatternRule, ConstraintViolation } from './types.js';

export function checkCustomPattern(
  relativePath: string,
  content: string,
  rule: CustomPatternRule,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  try {
    const forbidden = new RegExp(rule.forbiddenPattern, 'gm');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      if (forbidden.test(lines[i])) {
        // 예외 패턴 체크
        if (rule.allowedExceptions?.length) {
          const isException = rule.allowedExceptions.some(exc => {
            try {
              return new RegExp(exc).test(lines[i]);
            } catch {
              return false;
            }
          });
          if (isException) continue;
        }

        violations.push({
          constraintId: rule.id,
          severity: rule.severity,
          filePath: relativePath,
          message: `Forbidden pattern detected at line ${i + 1}: ${rule.description}`,
          suggestion: rule.name,
        });
      }
      // RegExp lastIndex 리셋
      forbidden.lastIndex = 0;
    }
  } catch {
    // 잘못된 정규식 — 무시
  }

  return violations;
}
