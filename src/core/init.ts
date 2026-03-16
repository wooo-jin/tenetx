/**
 * tenet init — 원커맨드 프로젝트 초기화
 *
 * 프로젝트 타입을 자동 감지하여 적절한 철학 팩을 추천하고,
 * 철학 파일 생성 + .gitignore 업데이트까지 한 번에 처리합니다.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectPhilosophyPath } from './paths.js';
import { DEFAULT_PHILOSOPHY } from './philosophy-loader.js';
import { savePackConfig, type PackConnection } from './pack-config.js';

// ── 프로젝트 타입 감지 ──

export type ProjectType = 'frontend' | 'backend' | 'devops' | 'data' | 'security' | 'fullstack' | 'unknown';

interface DetectionResult {
  type: ProjectType;
  pack: string;
  confidence: number;  // 0-100
  signals: string[];
}

/** package.json 의존성에서 프레임워크 감지 */
function detectFromPackageJson(cwd: string): { deps: string[]; devDeps: string[] } {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return { deps: [], devDeps: [] };
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return {
      deps: Object.keys(pkg.dependencies ?? {}),
      devDeps: Object.keys(pkg.devDependencies ?? {}),
    };
  } catch { return { deps: [], devDeps: [] }; }
}

/** 프로젝트 타입 자동 감지 */
export function detectProjectType(cwd: string): DetectionResult {
  const signals: string[] = [];
  let frontendScore = 0;
  let backendScore = 0;
  let devopsScore = 0;
  let dataScore = 0;

  const { deps, devDeps } = detectFromPackageJson(cwd);
  const allDeps = [...deps, ...devDeps];

  // Frontend signals
  const frontendLibs = ['react', 'vue', 'svelte', 'angular', 'next', 'nuxt', 'vite', '@angular/core', 'solid-js', 'preact'];
  for (const lib of frontendLibs) {
    if (allDeps.some(d => d === lib || d.startsWith(`@${lib}/`))) {
      frontendScore += 20;
      signals.push(`frontend: ${lib}`);
    }
  }
  if (fs.existsSync(path.join(cwd, 'src', 'App.tsx')) || fs.existsSync(path.join(cwd, 'src', 'App.vue'))) {
    frontendScore += 15;
    signals.push('frontend: App component');
  }
  if (allDeps.includes('tailwindcss') || allDeps.includes('styled-components')) {
    frontendScore += 10;
    signals.push('frontend: CSS-in-JS/utility');
  }

  // Backend signals
  const backendLibs = ['express', 'fastify', 'nestjs', '@nestjs/core', 'koa', 'hapi', 'django', 'flask', 'spring', 'gin'];
  for (const lib of backendLibs) {
    if (allDeps.some(d => d === lib || d.startsWith(`@${lib}/`))) {
      backendScore += 20;
      signals.push(`backend: ${lib}`);
    }
  }
  const dbLibs = ['prisma', '@prisma/client', 'typeorm', 'sequelize', 'mongoose', 'knex', 'drizzle-orm'];
  for (const lib of dbLibs) {
    if (allDeps.includes(lib)) {
      backendScore += 15;
      signals.push(`backend: ${lib} (DB)`);
    }
  }
  if (fs.existsSync(path.join(cwd, 'Dockerfile'))) {
    backendScore += 5;
    signals.push('backend: Dockerfile');
  }

  // DevOps signals
  if (fs.existsSync(path.join(cwd, 'terraform')) || fs.existsSync(path.join(cwd, 'main.tf'))) {
    devopsScore += 30;
    signals.push('devops: terraform');
  }
  if (fs.existsSync(path.join(cwd, 'docker-compose.yml')) || fs.existsSync(path.join(cwd, 'docker-compose.yaml'))) {
    devopsScore += 15;
    signals.push('devops: docker-compose');
  }
  if (fs.existsSync(path.join(cwd, '.github', 'workflows'))) {
    devopsScore += 10;
    signals.push('devops: GitHub Actions');
  }
  if (fs.existsSync(path.join(cwd, 'Jenkinsfile')) || fs.existsSync(path.join(cwd, '.gitlab-ci.yml'))) {
    devopsScore += 15;
    signals.push('devops: CI pipeline');
  }
  if (fs.existsSync(path.join(cwd, 'k8s')) || fs.existsSync(path.join(cwd, 'helm'))) {
    devopsScore += 20;
    signals.push('devops: kubernetes');
  }

  // Data signals
  const dataLibs = ['pandas', 'numpy', 'tensorflow', 'torch', 'scikit-learn', 'jupyter'];
  if (fs.existsSync(path.join(cwd, 'requirements.txt'))) {
    try {
      const reqs = fs.readFileSync(path.join(cwd, 'requirements.txt'), 'utf-8').toLowerCase();
      for (const lib of dataLibs) {
        if (reqs.includes(lib)) {
          dataScore += 20;
          signals.push(`data: ${lib}`);
        }
      }
    } catch { /* ignore */ }
  }
  if (fs.existsSync(path.join(cwd, 'notebooks')) || fs.readdirSync(cwd).some(f => f.endsWith('.ipynb'))) {
    dataScore += 25;
    signals.push('data: Jupyter notebooks');
  }

  // Python-only projects
  if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) {
    if (backendScore === 0 && frontendScore === 0 && dataScore === 0) {
      backendScore += 10;
      signals.push('backend: Python project');
    }
  }

  // Go projects
  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    backendScore += 20;
    signals.push('backend: Go module');
  }

  // Rust projects
  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    backendScore += 15;
    signals.push('backend: Rust/Cargo');
  }

  // Determine winner
  const scores = { frontend: frontendScore, backend: backendScore, devops: devopsScore, data: dataScore };
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topType, topScore] = sorted[0];
  // sorted[1] = second place (unused but available for fullstack detection above)

  // Fullstack: frontend + backend both strong
  if (frontendScore >= 20 && backendScore >= 20) {
    return {
      type: 'fullstack',
      pack: 'backend',  // fullstack은 backend 팩 추천 (보안/데이터 중심)
      confidence: Math.min(100, frontendScore + backendScore),
      signals,
    };
  }

  if (topScore === 0) {
    return { type: 'unknown', pack: 'backend', confidence: 0, signals: ['감지된 신호 없음 — 기본 backend 팩 사용'] };
  }

  return {
    type: topType as ProjectType,
    pack: topType === 'frontend' ? 'frontend' : topType === 'devops' ? 'devops' : topType === 'data' ? 'data' : 'backend',
    confidence: Math.min(100, topScore),
    signals,
  };
}

// ── CLI 핸들러 ──

export async function handleInit(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const isYes = args.includes('--yes') || args.includes('-y');
  const extendsMode = args.includes('--extends');
  const isTeam = args.includes('--team');
  const packRepoIdx = args.indexOf('--pack-repo');
  const packRepo = packRepoIdx !== -1 ? args[packRepoIdx + 1] : undefined;

  // 기존 철학 확인
  const existingPath = projectPhilosophyPath(cwd);
  if (fs.existsSync(existingPath)) {
    const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
    console.log(`\n  이미 프로젝트 철학이 있습니다: "${existing.name}"`);
    console.log(`  경로: ${existingPath}`);
    console.log(`  재설정하려면 삭제 후 다시 실행: rm ${existingPath}\n`);
    return;
  }

  // 프로젝트 감지
  const detection = detectProjectType(cwd);
  const projectName = path.basename(cwd);

  console.log(`\n  Tenet Init — ${projectName}\n`);
  console.log(`  프로젝트 타입: ${detection.type} (신뢰도 ${detection.confidence}%)`);
  console.log(`  감지 신호:`);
  for (const sig of detection.signals.slice(0, 5)) {
    console.log(`    • ${sig}`);
  }
  console.log(`  추천 팩: ${detection.pack}\n`);

  if (!isYes && process.stdin.isTTY) {
    // interactive: 확인
    const readline = await import('node:readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question(`  이대로 진행할까요? (Y/n): `, resolve);
    });
    rl.close();
    if (answer.trim().toLowerCase() === 'n') {
      console.log('  취소됨. 직접 설정: tenet setup --project\n');
      return;
    }
  }

  // 철학 생성
  const projDir = path.join(cwd, '.compound');
  fs.mkdirSync(projDir, { recursive: true });

  const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const packPath = path.join(pkgRoot, 'packs', `${detection.pack}.json`);

  if (extendsMode) {
    // 중앙 관리 모드
    const philosophy = {
      name: projectName,
      version: '1.0.0',
      author: 'project',
      extends: `pack:${detection.pack}`,
      principles: {},
    };
    fs.writeFileSync(existingPath, JSON.stringify(philosophy, null, 2));
    console.log(`  ✓ 중앙 관리 철학 생성 (extends: pack:${detection.pack})`);
  } else if (fs.existsSync(packPath)) {
    // 독립 복사 모드
    const packContent = JSON.parse(fs.readFileSync(packPath, 'utf-8'));
    packContent.name = projectName;
    fs.writeFileSync(existingPath, JSON.stringify(packContent, null, 2));
    console.log(`  ✓ "${detection.pack}" 팩 기반 철학 생성`);
  } else {
    // 폴백: 기본 철학
    const philosophy = JSON.parse(JSON.stringify(DEFAULT_PHILOSOPHY));
    philosophy.name = projectName;
    fs.writeFileSync(existingPath, JSON.stringify(philosophy, null, 2));
    console.log(`  ✓ 기본 철학 생성`);
  }

  console.log(`  경로: ${existingPath}`);
  console.log(`  원칙 수: ${Object.keys(JSON.parse(fs.readFileSync(existingPath, 'utf-8')).principles).length}개`);

  // 팀 팩 설정
  if (isTeam) {
    const projDir = path.join(cwd, '.compound');
    fs.mkdirSync(path.join(projDir, 'rules'), { recursive: true });
    fs.mkdirSync(path.join(projDir, 'solutions'), { recursive: true });

    const projectName = path.basename(cwd);

    if (packRepo) {
      // GitHub 연결 모드
      const config: PackConnection = {
        type: 'github',
        name: projectName,
        repo: packRepo,
      };
      savePackConfig(cwd, config);
      console.log(`  ✓ 팩 설정: github (${packRepo})`);
      console.log('  팩 동기화: tenet harness 실행 시 자동 동기화됩니다.');
    } else {
      // 인라인 모드 (이 레포가 팩)
      const config: PackConnection = {
        type: 'inline',
        name: projectName,
      };
      savePackConfig(cwd, config);
      console.log('  ✓ 팩 설정: inline (이 레포가 팩)');
      console.log('  팀원에게 공유: git add .compound/ && git commit');
    }
  }

  console.log('');
  console.log('  다음 단계:');
  if (isTeam) {
    console.log('    git add .compound/ && git commit -m "chore: add tenet team config"');
  } else {
    console.log('    git add .compound/philosophy.json && git commit -m "chore: add tenet philosophy"');
  }
  console.log('    tenet philosophy show     # 철학 확인');
  console.log('    tenet philosophy edit     # 커스터마이즈');
  console.log('');
}
