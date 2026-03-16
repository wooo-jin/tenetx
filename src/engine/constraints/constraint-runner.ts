/**
 * Constraint Runner — 아키텍처 제약 실행 엔진
 *
 * 프로젝트별 constraint 규칙을 로드하고 파일 변경에 대해 검증합니다.
 * PostToolUse 훅에서 호출되어 Write/Edit 후 자동 검증합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLog } from '../../core/logger.js';
import type {
  AnyConstraintRule,
  ConstraintConfig,
  ConstraintResult,
  ConstraintViolation,
} from './types.js';
import { checkFileSize } from './file-size.js';
import { checkNaming } from './naming.js';
import { checkDependencyDirection } from './dependency-direction.js';
import { checkCustomPattern } from './custom-pattern.js';

const CONSTRAINT_FILENAME = 'constraints.json';

/** 프로젝트 constraint 설정 파일 경로 */
export function constraintConfigPath(cwd: string): string {
  return path.join(cwd, '.compound', CONSTRAINT_FILENAME);
}

/** 제약 설정 로드 (프로젝트 .compound/constraints.json) */
export function loadConstraintConfig(cwd: string): ConstraintConfig | null {
  const configPath = constraintConfigPath(cwd);
  try {
    if (!fs.existsSync(configPath)) return null;
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (!raw.rules || !Array.isArray(raw.rules)) return null;
    return raw as ConstraintConfig;
  } catch (e) {
    debugLog('constraint-runner', '제약 설정 로드 실패', e);
    return null;
  }
}

/** 파일이 규칙의 include/exclude 패턴에 매칭되는지 확인 */
export function matchesGlob(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  for (const pattern of patterns) {
    // 간단한 glob 매칭: **, *, ? 지원
    const regex = globToRegex(pattern);
    if (regex.test(normalized)) return true;
  }
  return false;
}

/** 간단한 glob → RegExp 변환 */
function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§DOUBLESTAR§/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`${escaped}$`);
}

/** 규칙이 해당 파일에 적용되는지 확인 */
function ruleApplies(rule: AnyConstraintRule, filePath: string): boolean {
  if (rule.enabled === false) return false;
  if (rule.exclude && matchesGlob(filePath, rule.exclude)) return false;
  if (rule.include && rule.include.length > 0) {
    return matchesGlob(filePath, rule.include);
  }
  return true; // include가 없으면 모든 파일에 적용
}

/** 단일 파일에 대해 모든 제약 검사 실행 */
export function checkFile(
  filePath: string,
  content: string,
  rules: AnyConstraintRule[],
  cwd: string,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const relativePath = path.relative(cwd, filePath);

  for (const rule of rules) {
    if (!ruleApplies(rule, relativePath)) continue;

    let ruleViolations: ConstraintViolation[] = [];

    switch (rule.type) {
      case 'file-size':
        ruleViolations = checkFileSize(relativePath, content, rule);
        break;
      case 'naming':
        ruleViolations = checkNaming(relativePath, rule);
        break;
      case 'dependency-direction':
        ruleViolations = checkDependencyDirection(relativePath, content, rule);
        break;
      case 'custom-pattern':
        ruleViolations = checkCustomPattern(relativePath, content, rule);
        break;
    }

    violations.push(...ruleViolations);
  }

  return violations;
}

/** 단일 파일 변경에 대한 제약 검사 (PostToolUse 훅에서 호출) */
export function runConstraintsOnFile(
  filePath: string,
  cwd: string,
): ConstraintResult {
  const config = loadConstraintConfig(cwd);
  if (!config) {
    return { violations: [], checkedFiles: 0, passedFiles: 0 };
  }

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { violations: [], checkedFiles: 0, passedFiles: 0 };
  }

  const violations = checkFile(filePath, content, config.rules, cwd);

  return {
    violations,
    checkedFiles: 1,
    passedFiles: violations.length === 0 ? 1 : 0,
  };
}

/** 프로젝트 전체 스캔 (tenetx scan --constraints 또는 CI용) */
export function runConstraintsOnProject(
  cwd: string,
  files?: string[],
): ConstraintResult {
  const config = loadConstraintConfig(cwd);
  if (!config) {
    return { violations: [], checkedFiles: 0, passedFiles: 0 };
  }

  const allViolations: ConstraintViolation[] = [];
  let checkedFiles = 0;
  let passedFiles = 0;

  const targetFiles = files ?? collectProjectFiles(cwd);

  for (const filePath of targetFiles) {
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf-8');
    } catch {
      continue;
    }

    checkedFiles++;
    const violations = checkFile(absPath, content, config.rules, cwd);
    if (violations.length === 0) {
      passedFiles++;
    }
    allViolations.push(...violations);
  }

  return { violations: allViolations, checkedFiles, passedFiles };
}

/** 프로젝트의 소스 파일 목록 수집 */
function collectProjectFiles(cwd: string): string[] {
  const files: string[] = [];
  const ignorePatterns = [
    'node_modules', '.git', 'dist', 'build', '.compound',
    'coverage', '.next', '.nuxt', '__pycache__',
  ];

  function walk(dir: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (ignorePatterns.includes(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  walk(cwd);
  return files;
}

/** 제약 위반을 사람이 읽을 수 있는 메시지로 포맷 */
export function formatViolations(violations: ConstraintViolation[]): string {
  if (violations.length === 0) return '';

  const errors = violations.filter(v => v.severity === 'error');
  const warns = violations.filter(v => v.severity === 'warn');
  const infos = violations.filter(v => v.severity === 'info');

  const lines: string[] = [];

  if (errors.length > 0) {
    lines.push(`🚫 제약 위반 ${errors.length}건:`);
    for (const v of errors) {
      lines.push(`  ${v.filePath}: ${v.message}`);
      if (v.suggestion) lines.push(`    → ${v.suggestion}`);
    }
  }

  if (warns.length > 0) {
    lines.push(`⚠ 경고 ${warns.length}건:`);
    for (const v of warns) {
      lines.push(`  ${v.filePath}: ${v.message}`);
    }
  }

  if (infos.length > 0 && lines.length === 0) {
    lines.push(`ℹ 정보 ${infos.length}건:`);
    for (const v of infos) {
      lines.push(`  ${v.filePath}: ${v.message}`);
    }
  }

  return lines.join('\n');
}

/** 기본 constraints.json 템플릿 생성 */
export function generateDefaultConfig(): ConstraintConfig {
  return {
    version: '1.0',
    rules: [
      {
        id: 'file-size-300',
        name: '파일 크기 제한',
        description: '단일 파일 300줄 초과 경고',
        type: 'file-size',
        severity: 'warn',
        maxLines: 300,
        include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        exclude: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'],
      },
      {
        id: 'file-size-500',
        name: '파일 크기 하드 제한',
        description: '단일 파일 500줄 초과 에러',
        type: 'file-size',
        severity: 'error',
        maxLines: 500,
        include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
        exclude: ['**/*.test.*', '**/*.spec.*', '**/*.d.ts'],
      },
      {
        id: 'naming-kebab',
        name: '파일명 kebab-case 규칙',
        description: '소스 파일은 kebab-case 파일명만 허용',
        type: 'naming',
        severity: 'warn',
        pattern: '^[a-z][a-z0-9]*(-[a-z0-9]+)*(\\.(test|spec|d))?(\\.[a-z]+)$',
        target: '**/*.ts',
      },
    ],
  };
}
