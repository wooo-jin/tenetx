/**
 * Dependency Direction Constraint — 레이어 간 의존 방향 검사
 *
 * 상위 레이어(앞)는 하위 레이어(뒤)만 import 가능.
 * 예: layers: ["ui", "domain", "infra"] → ui는 domain/infra만, domain은 infra만, infra는 아무것도 import 불가
 */

import type { DependencyDirectionRule, ConstraintViolation } from './types.js';

/** import/require 구문에서 경로 추출 */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // ESM: import ... from '...'
  const esmRegex = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = esmRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // CJS: require('...')
  const cjsRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Dynamic import: import('...')
  const dynRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = dynRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

/** 파일 경로가 어떤 레이어에 속하는지 판별 */
function getLayer(filePath: string, layers: string[]): string | null {
  const normalized = filePath.replace(/\\/g, '/');
  for (const layer of layers) {
    if (normalized.includes(`/${layer}/`) || normalized.startsWith(`${layer}/`)) {
      return layer;
    }
  }
  return null;
}

export function checkDependencyDirection(
  relativePath: string,
  content: string,
  rule: DependencyDirectionRule,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const { layers } = rule;

  const currentLayer = getLayer(relativePath, layers);
  if (!currentLayer) return []; // 레이어에 속하지 않는 파일 — 검사 불필요

  const currentLayerIndex = layers.indexOf(currentLayer);
  const imports = extractImports(content);

  for (const importPath of imports) {
    // 상대 경로 import만 검사 (외부 패키지 제외)
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) continue;

    const importLayer = getLayer(importPath, layers);
    if (!importLayer) continue;

    const importLayerIndex = layers.indexOf(importLayer);

    // 상위(인덱스 작은) 레이어를 하위(인덱스 큰) 레이어가 import하면 위반
    if (importLayerIndex < currentLayerIndex) {
      violations.push({
        constraintId: rule.id,
        severity: rule.severity,
        filePath: relativePath,
        message: `"${currentLayer}" 레이어가 상위 레이어 "${importLayer}"를 import합니다`,
        suggestion: `의존 방향: ${layers.join(' → ')}. 하위 레이어는 상위 레이어를 참조할 수 없습니다.`,
      });
    }
  }

  return violations;
}
