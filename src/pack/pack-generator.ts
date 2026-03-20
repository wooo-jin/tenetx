/**
 * pack-generator.ts — 프로젝트 분석 기반 팩 컨텍스트 생성
 *
 * --from-project 옵션으로 현재 프로젝트를 스캔하여
 * AI가 팩을 채울 수 있도록 _context.md 브리핑 문서를 생성합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { detectProjectType } from '../core/init.js';

/** package.json 읽기 */
function readPackageJson(cwd: string): Record<string, unknown> | null {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try { return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); } catch { return null; }
}

/** 디렉토리 구조 요약 (depth 1) */
function summarizeStructure(cwd: string): string[] {
  const entries: string[] = [];
  const ignore = new Set([
    'node_modules', '.git', '.next', '.nuxt', 'dist', 'build',
    'coverage', '.turbo', '.vercel', '__pycache__', '.venv',
  ]);

  try {
    const items = fs.readdirSync(cwd, { withFileTypes: true });
    for (const item of items) {
      if (ignore.has(item.name)) continue;
      if (item.name.startsWith('.') && item.name !== '.github') continue;
      if (item.isDirectory()) {
        const subItems = fs.readdirSync(path.join(cwd, item.name)).length;
        entries.push(`${item.name}/ (${subItems}개 파일)`);
      } else {
        entries.push(item.name);
      }
    }
  } catch { /* ignore */ }

  return entries;
}

/** 기존 규칙/컨벤션 파일 감지 */
function detectExistingConventions(cwd: string): string[] {
  const conventions: string[] = [];
  const checks: Array<[string, string]> = [
    ['CLAUDE.md', 'Claude Code 프로젝트 지침'],
    ['.eslintrc.json', 'ESLint 설정'],
    ['.eslintrc.js', 'ESLint 설정'],
    ['eslint.config.js', 'ESLint Flat Config'],
    ['.prettierrc', 'Prettier 설정'],
    ['tsconfig.json', 'TypeScript 설정'],
    ['.editorconfig', 'EditorConfig'],
    ['Dockerfile', 'Docker 컨테이너화'],
    ['docker-compose.yml', 'Docker Compose'],
    ['.github/workflows', 'GitHub Actions CI/CD'],
    ['Makefile', 'Make 빌드 시스템'],
    ['vitest.config.ts', 'Vitest 테스트'],
    ['jest.config.ts', 'Jest 테스트'],
    ['jest.config.js', 'Jest 테스트'],
    ['.env.example', '환경변수 템플릿'],
  ];

  for (const [file, desc] of checks) {
    if (fs.existsSync(path.join(cwd, file))) {
      conventions.push(`- ${desc} (${file})`);
    }
  }

  return conventions;
}

/** 스크립트 명령어 추출 */
function extractScripts(pkg: Record<string, unknown>): string[] {
  const scripts = pkg.scripts as Record<string, string> | undefined;
  if (!scripts) return [];
  return Object.entries(scripts).map(([k, v]) => `- \`${k}\`: ${v}`);
}

export interface PackContextOptions {
  cwd: string;
  packDir: string;
  packName: string;
}

/** 프로젝트 분석 → _context.md 생성 */
export function generatePackContext(opts: PackContextOptions): void {
  const { cwd, packDir, packName } = opts;
  const detection = detectProjectType(cwd);
  const pkg = readPackageJson(cwd);
  const structure = summarizeStructure(cwd);
  const conventions = detectExistingConventions(cwd);
  const scripts = pkg ? extractScripts(pkg) : [];

  const deps = Object.keys((pkg?.dependencies ?? {}) as Record<string, string>);
  const devDeps = Object.keys((pkg?.devDependencies ?? {}) as Record<string, string>);

  const lines: string[] = [
    `# 팩 컨텍스트: ${packName}`,
    '',
    '> 이 파일은 AI가 팩을 채울 때 참고하는 프로젝트 브리핑입니다.',
    '> "팩 채워줘" 또는 "fill pack"이라고 말하면 이 컨텍스트를 기반으로 도와줍니다.',
    '',
    '## 프로젝트 요약',
    '',
    `- **이름**: ${(pkg?.name as string) ?? path.basename(cwd)}`,
    `- **타입**: ${detection.type} (신뢰도: ${detection.confidence}%)`,
    `- **감지 신호**: ${detection.signals.join(', ') || '없음'}`,
    '',
    '## 기술 스택',
    '',
  ];

  if (deps.length > 0) {
    lines.push(`### 프로덕션 의존성 (${deps.length}개)`);
    lines.push('```');
    lines.push(deps.join(', '));
    lines.push('```');
    lines.push('');
  }

  if (devDeps.length > 0) {
    lines.push(`### 개발 의존성 (${devDeps.length}개)`);
    lines.push('```');
    lines.push(devDeps.join(', '));
    lines.push('```');
    lines.push('');
  }

  if (scripts.length > 0) {
    lines.push('### 스크립트');
    lines.push(...scripts);
    lines.push('');
  }

  lines.push('## 프로젝트 구조');
  lines.push('```');
  for (const entry of structure.slice(0, 30)) {
    lines.push(entry);
  }
  lines.push('```');
  lines.push('');

  if (conventions.length > 0) {
    lines.push('## 기존 컨벤션/설정');
    lines.push(...conventions);
    lines.push('');
  }

  // CLAUDE.md가 있으면 내용도 포함
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    if (content.trim()) {
      lines.push('## CLAUDE.md (기존 프로젝트 지침)');
      lines.push('');
      // 너무 길면 앞부분만
      const truncated = content.length > 2000 ? `${content.slice(0, 2000)}\n...(이하 생략)` : content;
      lines.push(truncated);
      lines.push('');
    }
  }

  lines.push('## AI에게 요청할 것');
  lines.push('');
  lines.push('이 프로젝트를 기반으로 다음을 채워주세요:');
  lines.push('');
  lines.push('1. **rules/** — 이 프로젝트/팀에서 지켜야 할 코딩 규칙');
  lines.push('   - 코드 스타일, 네이밍 컨벤션, 아키텍처 원칙');
  lines.push('   - 리뷰 체크리스트, 금지 패턴');
  lines.push('');
  lines.push('2. **skills/** — 반복되는 작업을 자동화하는 스킬');
  lines.push('   - 배포, 마이그레이션, 리뷰 등 팀이 자주 하는 작업');
  lines.push('   - 트리거 키워드를 한국어/영어 모두 포함');
  lines.push('');
  lines.push('3. **agents/** — 이 도메인에 특화된 전문 에이전트');
  lines.push('   - 도메인 리뷰어, 보안 감사자 등');
  lines.push('');
  lines.push('4. **workflows/** — 팀 고유 작업 파이프라인');
  lines.push('   - 코드 리뷰, QA, 릴리즈 프로세스 등');
  lines.push('');
  lines.push('5. **philosophy.json** — 팀 철학/원칙 (선택)');
  lines.push('');

  fs.writeFileSync(path.join(packDir, '_context.md'), lines.join('\n'));
}

/** 스타터 템플릿 생성 */
export function generateStarterTemplates(packDir: string): void {
  // 예시 규칙
  fs.writeFileSync(path.join(packDir, 'rules', 'code-style.md'), `# 코드 스타일 가이드

<!-- 이 파일을 팀 코드 스타일에 맞게 수정하세요 -->

## 네이밍 규칙
- 변수/함수: camelCase
- 클래스/타입: PascalCase
- 상수: UPPER_SNAKE_CASE

## 금지 패턴
- any 타입 사용 금지 (unknown 사용)
- console.log 프로덕션 코드 금지 (logger 사용)
`);

  // 예시 스킬
  fs.writeFileSync(path.join(packDir, 'skills', 'deploy-check.md'), `---
name: deploy-check
description: 배포 전 체크리스트 자동 주입
triggers:
  - "배포"
  - "deploy"
  - "릴리즈"
  - "release"
---
<Purpose>
배포 전 필수 확인 사항을 안내합니다.
</Purpose>

<Steps>
<!-- 팀 배포 프로세스에 맞게 수정하세요 -->
1. 테스트 전체 통과 확인
2. 빌드 성공 확인
3. 환경변수 diff 확인
4. DB 마이그레이션 확인
5. 롤백 계획 수립
</Steps>
`);

  // 예시 워크플로우
  fs.writeFileSync(path.join(packDir, 'workflows', 'team-review.json'), JSON.stringify({
    name: 'team-review',
    description: '팀 코드 리뷰 파이프라인',
    claudeArgs: [],
    envOverrides: {},
    principle: 'understand-before-act',
    persistent: false,
  }, null, 2));
}
