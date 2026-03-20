import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkFileSize } from '../src/engine/constraints/file-size.js';
import { checkNaming } from '../src/engine/constraints/naming.js';
import { checkDependencyDirection } from '../src/engine/constraints/dependency-direction.js';
import { checkCustomPattern } from '../src/engine/constraints/custom-pattern.js';
import {
  checkFile,
  matchesGlob,
  loadConstraintConfig,
  generateDefaultConfig,
  formatViolations,
  constraintConfigPath,
  runConstraintsOnProject,
} from '../src/engine/constraints/constraint-runner.js';
import type { FileSizeRule, NamingRule, DependencyDirectionRule, CustomPatternRule } from '../src/engine/constraints/types.js';

describe('file-size constraint', () => {
  const rule: FileSizeRule = {
    id: 'size-300', name: 'test', description: 'test',
    type: 'file-size', severity: 'warn', maxLines: 300,
  };

  it('작은 파일은 통과', () => {
    const content = 'line\n'.repeat(100);
    expect(checkFileSize('foo.ts', content, rule)).toEqual([]);
  });

  it('큰 파일은 위반', () => {
    const content = 'line\n'.repeat(400);
    const v = checkFileSize('big.ts', content, rule);
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe('warn');
    expect(v[0].message).toContain('300');
  });
});

describe('naming constraint', () => {
  const rule: NamingRule = {
    id: 'naming-1', name: 'kebab', description: 'kebab-case',
    type: 'naming', severity: 'warn',
    pattern: '^[a-z][a-z0-9]*(-[a-z0-9]+)*(\\.[a-z]+)+$',
    target: '**/*.ts',
  };

  it('kebab-case 통과', () => {
    expect(checkNaming('src/my-file.ts', rule)).toEqual([]);
  });

  it('camelCase 위반', () => {
    const v = checkNaming('src/myFile.ts', rule);
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('myFile.ts');
  });

  it('PascalCase 위반', () => {
    const v = checkNaming('src/MyComponent.tsx', rule);
    expect(v).toHaveLength(1);
  });
});

describe('dependency-direction constraint', () => {
  const rule: DependencyDirectionRule = {
    id: 'dep-1', name: 'layers', description: 'layer direction',
    type: 'dependency-direction', severity: 'error',
    layers: ['ui', 'domain', 'infra'],
  };

  it('하위→상위 의존은 위반', () => {
    const content = `import { Repo } from '../ui/component.js';`;
    const v = checkDependencyDirection('infra/db.ts', content, rule);
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('upper layer');
  });

  it('상위→하위 의존은 통과', () => {
    const content = `import { Repo } from '../infra/repo.js';`;
    const v = checkDependencyDirection('ui/page.ts', content, rule);
    expect(v).toEqual([]);
  });

  it('외부 패키지 import은 무시', () => {
    const content = `import React from 'react';`;
    const v = checkDependencyDirection('domain/service.ts', content, rule);
    expect(v).toEqual([]);
  });

  it('같은 레이어 import은 허용', () => {
    const content = `import { helper } from './domain/utils.js';`;
    const v = checkDependencyDirection('domain/service.ts', content, rule);
    expect(v).toEqual([]);
  });
});

describe('custom-pattern constraint', () => {
  const rule: CustomPatternRule = {
    id: 'no-console', name: 'console.log 금지', description: 'console.log 사용 금지',
    type: 'custom-pattern', severity: 'warn',
    forbiddenPattern: 'console\\.log',
  };

  it('console.log 감지', () => {
    const content = `const x = 1;\nconsole.log(x);\nreturn x;`;
    const v = checkCustomPattern('src/foo.ts', content, rule);
    expect(v).toHaveLength(1);
    expect(v[0].message).toContain('line 2');
  });

  it('console.error는 통과', () => {
    const content = `console.error('fail');`;
    expect(checkCustomPattern('src/foo.ts', content, rule)).toEqual([]);
  });

  it('예외 패턴 허용', () => {
    const ruleWithExc: CustomPatternRule = {
      ...rule,
      allowedExceptions: ['// eslint-disable'],
    };
    const content = `console.log('debug'); // eslint-disable-line`;
    expect(checkCustomPattern('src/foo.ts', content, ruleWithExc)).toEqual([]);
  });
});

describe('matchesGlob', () => {
  it('** 패턴', () => {
    expect(matchesGlob('src/core/foo.ts', ['**/*.ts'])).toBe(true);
    expect(matchesGlob('src/core/foo.js', ['**/*.ts'])).toBe(false);
  });

  it('디렉토리 패턴', () => {
    expect(matchesGlob('src/test/foo.ts', ['**/test/**'])).toBe(true);
  });
});

describe('constraint-runner 통합', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ch-constraint-'));
    fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('설정 없으면 null 반환', () => {
    expect(loadConstraintConfig(tmpDir)).toBeNull();
  });

  it('유효한 설정 로드', () => {
    const config = generateDefaultConfig();
    fs.writeFileSync(constraintConfigPath(tmpDir), JSON.stringify(config));
    const loaded = loadConstraintConfig(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.rules.length).toBeGreaterThan(0);
  });

  it('프로젝트 전체 검사', () => {
    // constraints.json + 테스트 파일 생성
    const config = generateDefaultConfig();
    fs.writeFileSync(constraintConfigPath(tmpDir), JSON.stringify(config));

    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'small.ts'), 'const x = 1;\n');
    fs.writeFileSync(path.join(srcDir, 'big.ts'), 'const x = 1;\n'.repeat(400));

    const result = runConstraintsOnProject(tmpDir);
    expect(result.checkedFiles).toBeGreaterThanOrEqual(2);
    // big.ts는 300줄 초과 → 위반
    const bigViolation = result.violations.find(v => v.filePath.includes('big.ts'));
    expect(bigViolation).toBeDefined();
  });

  it('checkFile 복합 규칙 적용', () => {
    const content = 'line\n'.repeat(400);
    const rules = generateDefaultConfig().rules;
    const violations = checkFile(
      path.join(tmpDir, 'src', 'bigFile.ts'),
      content,
      rules,
      tmpDir,
    );
    // file-size-300 warn + file-size-500 error 이상 기대 (파일명도 camelCase 경고)
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });
});

describe('formatViolations', () => {
  it('빈 위반 → 빈 문자열', () => {
    expect(formatViolations([])).toBe('');
  });

  it('에러와 경고 포맷', () => {
    const output = formatViolations([
      { constraintId: 'a', severity: 'error', filePath: 'x.ts', message: 'too big' },
      { constraintId: 'b', severity: 'warn', filePath: 'y.ts', message: 'naming' },
    ]);
    expect(output).toContain('1 constraint violations');
    expect(output).toContain('1 warnings');
  });
});
