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
      message: `File has ${lineCount} lines (exceeds max ${rule.maxLines})`,
      suggestion: `Split the file or modularize the logic.`,
    }];
  }

  return [];
}
