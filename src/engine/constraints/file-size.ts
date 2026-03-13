/**
 * File Size Constraint — 파일 줄 수 제한 검사
 */

import type { FileSizeRule, ConstraintViolation } from './types.js';

export function checkFileSize(
  relativePath: string,
  content: string,
  rule: FileSizeRule,
): ConstraintViolation[] {
  const lineCount = content.split('\n').length;

  if (lineCount > rule.maxLines) {
    return [{
      constraintId: rule.id,
      severity: rule.severity,
      filePath: relativePath,
      message: `파일 ${lineCount}줄 (최대 ${rule.maxLines}줄 초과)`,
      suggestion: `파일을 분리하거나 로직을 모듈화하세요.`,
    }];
  }

  return [];
}
