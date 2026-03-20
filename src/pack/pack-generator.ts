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
        entries.push(`${item.name}/ (${subItems} files)`);
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
    ['CLAUDE.md', 'Claude Code project instructions'],
    ['.eslintrc.json', 'ESLint config'],
    ['.eslintrc.js', 'ESLint config'],
    ['eslint.config.js', 'ESLint Flat Config'],
    ['.prettierrc', 'Prettier config'],
    ['tsconfig.json', 'TypeScript config'],
    ['.editorconfig', 'EditorConfig'],
    ['Dockerfile', 'Docker containerization'],
    ['docker-compose.yml', 'Docker Compose'],
    ['.github/workflows', 'GitHub Actions CI/CD'],
    ['Makefile', 'Make build system'],
    ['vitest.config.ts', 'Vitest tests'],
    ['jest.config.ts', 'Jest tests'],
    ['jest.config.js', 'Jest tests'],
    ['.env.example', 'Environment variable template'],
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
    `# Pack Context: ${packName}`,
    '',
    '> This file is a project briefing for AI to reference when filling the pack.',
    '> Say "fill pack" and the AI will help based on this context.',
    '',
    '## Project Summary',
    '',
    `- **Name**: ${(pkg?.name as string) ?? path.basename(cwd)}`,
    `- **Type**: ${detection.type} (confidence: ${detection.confidence}%)`,
    `- **Detected signals**: ${detection.signals.join(', ') || 'none'}`,
    '',
    '## Tech Stack',
    '',
  ];

  if (deps.length > 0) {
    lines.push(`### Production Dependencies (${deps.length})`);
    lines.push('```');
    lines.push(deps.join(', '));
    lines.push('```');
    lines.push('');
  }

  if (devDeps.length > 0) {
    lines.push(`### Dev Dependencies (${devDeps.length})`);
    lines.push('```');
    lines.push(devDeps.join(', '));
    lines.push('```');
    lines.push('');
  }

  if (scripts.length > 0) {
    lines.push('### Scripts');
    lines.push(...scripts);
    lines.push('');
  }

  lines.push('## Project Structure');
  lines.push('```');
  for (const entry of structure.slice(0, 30)) {
    lines.push(entry);
  }
  lines.push('```');
  lines.push('');

  if (conventions.length > 0) {
    lines.push('## Existing Conventions/Config');
    lines.push(...conventions);
    lines.push('');
  }

  // CLAUDE.md가 있으면 내용도 포함
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    if (content.trim()) {
      lines.push('## CLAUDE.md (Existing Project Instructions)');
      lines.push('');
      // 너무 길면 앞부분만
      const truncated = content.length > 2000 ? `${content.slice(0, 2000)}\n...(truncated)` : content;
      lines.push(truncated);
      lines.push('');
    }
  }

  lines.push('## What to Ask AI');
  lines.push('');
  lines.push('Based on this project, please fill in the following:');
  lines.push('');
  lines.push('1. **rules/** — Coding rules for this project/team');
  lines.push('   - Code style, naming conventions, architecture principles');
  lines.push('   - Review checklists, forbidden patterns');
  lines.push('');
  lines.push('2. **skills/** — Skills to automate repetitive tasks');
  lines.push('   - Deploy, migration, review, and other frequent team tasks');
  lines.push('   - Include trigger keywords in both English and native language');
  lines.push('');
  lines.push('3. **agents/** — Domain-specific expert agents');
  lines.push('   - Domain reviewers, security auditors, etc.');
  lines.push('');
  lines.push('4. **workflows/** — Team-specific task pipelines');
  lines.push('   - Code review, QA, release processes, etc.');
  lines.push('');
  lines.push('5. **philosophy.json** — Team philosophy/principles (optional)');
  lines.push('');

  fs.writeFileSync(path.join(packDir, '_context.md'), lines.join('\n'));
}

/** 스타터 템플릿 생성 */
export function generateStarterTemplates(packDir: string): void {
  // 예시 규칙
  fs.writeFileSync(path.join(packDir, 'rules', 'code-style.md'), `# Code Style Guide

<!-- Customize this file to match your team's code style -->

## Naming Conventions
- Variables/functions: camelCase
- Classes/types: PascalCase
- Constants: UPPER_SNAKE_CASE

## Forbidden Patterns
- No \`any\` type (use \`unknown\`)
- No console.log in production code (use logger)
`);

  // 예시 스킬
  fs.writeFileSync(path.join(packDir, 'skills', 'deploy-check.md'), `---
name: deploy-check
description: Auto-inject pre-deploy checklist
triggers:
  - "deploy"
  - "release"
---
<Purpose>
Guides through mandatory pre-deploy checks.
</Purpose>

<Steps>
<!-- Customize to match your team's deploy process -->
1. Verify all tests pass
2. Verify build succeeds
3. Check environment variable diff
4. Check DB migrations
5. Prepare rollback plan
</Steps>
`);

  // 예시 워크플로우
  fs.writeFileSync(path.join(packDir, 'workflows', 'team-review.json'), JSON.stringify({
    name: 'team-review',
    description: 'Team code review pipeline',
    claudeArgs: [],
    envOverrides: {},
    principle: 'understand-before-act',
    persistent: false,
  }, null, 2));
}
