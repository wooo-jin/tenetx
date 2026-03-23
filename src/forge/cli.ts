/**
 * Tenetx Forge — CLI Handler
 *
 * tenetx forge                  Interactive: scan + interview + generate
 * tenetx forge --scan-only      Project scan only
 * tenetx forge --profile        Show current profile
 * tenetx forge --adjust         Adjust existing profile dimensions
 * tenetx forge --export         Export profile JSON
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import { scanProject } from './scanner.js';
import {
  signalsToDimensions,
  loadForgeProfile,
  saveForgeProfile,
  mergeProfiles,
  GLOBAL_FORGE_PROFILE,
  projectForgeProfile,
} from './profile.js';
import { getActiveQuestions, answersToDeltas } from './interviewer.js';
import { generateConfig, configToPhilosophy, formatConfig } from './generator.js';
import { DIMENSION_META, clampDimension, applyDeltas, dimensionLabel } from './dimensions.js';
import { projectPhilosophyPath } from '../core/paths.js';
import type { ForgeProfile, DimensionVector, ProjectSignals } from './types.js';

// ── Main Handler ────────────────────────────────────

export async function handleForge(args: string[]): Promise<void> {
  const cwd = process.cwd();

  if (args.includes('--scan-only')) {
    await handleScanOnly(cwd);
    return;
  }

  if (args.includes('--profile')) {
    handleShowProfile(cwd);
    return;
  }

  if (args.includes('--adjust')) {
    await handleAdjust(cwd);
    return;
  }

  if (args.includes('--export')) {
    handleExport(cwd);
    return;
  }

  // Default: full interactive flow
  await handleInteractiveForge(cwd, args);
}

// ── Subcommands ─────────────────────────────────────

async function handleScanOnly(cwd: string): Promise<void> {
  console.log('\n  Forge — Project Scan\n');
  const signals = scanProject(cwd);
  console.log(formatRichScanResult(signals));

  const dims = signalsToDimensions(signals);
  console.log('\n  Initial profile estimate:');
  console.log(formatDimensionBars(dims));
  console.log('');
}

function handleShowProfile(cwd: string): void {
  const profile = loadForgeProfile(cwd);
  if (!profile) {
    console.log('\n  No forge profile found.');
    console.log('  Run `tenetx forge` to create one.\n');
    return;
  }

  console.log('\n  Forge Profile\n');
  console.log(`  Version: ${profile.version}`);
  console.log(`  Created: ${profile.createdAt}`);
  console.log(`  Updated: ${profile.updatedAt}`);
  console.log('');
  console.log('  Dimensions:');
  console.log(formatDimensionBars(profile.dimensions));

  if (profile.lastScan) {
    console.log(`\n  Last scan: ${profile.lastScan.scannedAt}`);
  }

  const config = generateConfig(profile.dimensions);
  console.log('');
  console.log(formatConfig(config));
  console.log('');
}

function handleExport(cwd: string): void {
  const profile = loadForgeProfile(cwd);
  if (!profile) {
    console.log('{}');
    return;
  }
  console.log(JSON.stringify(profile, null, 2));
}

async function handleAdjust(cwd: string): Promise<void> {
  const profile = loadForgeProfile(cwd);
  if (!profile) {
    console.log('\n  No forge profile found. Run `tenetx forge` first.\n');
    return;
  }

  if (!process.stdin.isTTY) {
    console.log('  [forge] Non-interactive mode: cannot adjust');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log('\n  Forge — Dimension Adjustment\n');
  console.log('  Current dimensions:');
  console.log(formatDimensionBars(profile.dimensions));
  console.log('\n  Enter new value (0.0~1.0) or press Enter to keep current.\n');

  const newDims = { ...profile.dimensions };

  for (const meta of DIMENSION_META) {
    const current = newDims[meta.key] ?? 0.5;
    const answer = await new Promise<string>(resolve => {
      rl.question(`  ${meta.label} [${current.toFixed(2)}]: `, resolve);
    });

    const trimmed = answer.trim();
    if (trimmed === '') continue;

    const val = parseFloat(trimmed);
    if (!Number.isNaN(val)) {
      newDims[meta.key] = clampDimension(val);
    } else {
      console.log('    (invalid value, keeping current)');
    }
  }

  rl.close();

  profile.dimensions = newDims;
  const savePath = determineSavePath(cwd);
  saveForgeProfile(profile, savePath);

  console.log('\n  Updated dimensions:');
  console.log(formatDimensionBars(newDims));

  // 철학 재생성
  const config = generateConfig(newDims);
  const philosophy = configToPhilosophy(config);
  const philosophyPath = projectPhilosophyPath(cwd);
  fs.mkdirSync(path.dirname(philosophyPath), { recursive: true });
  fs.writeFileSync(philosophyPath, JSON.stringify(philosophy, null, 2));

  console.log(`\n  Philosophy regenerated: ${philosophyPath}`);
  console.log(formatConfig(config));
  console.log('');
}

async function handleInteractiveForge(cwd: string, args: string[]): Promise<void> {
  const isGlobal = args.includes('--global');

  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   Tenetx Forge — Personalization Engine      ║
  ╚══════════════════════════════════════════════╝

  This harness adapts to YOU. Answer a few questions
  and tenetx will tune its agents to your work style.
`);

  // ── Phase 1: Scan with real-time feedback ──────────
  console.log('  [forge] Scanning project signals...\n');
  const signals = scanProject(cwd);

  console.log('  Detected:');
  console.log(formatRichScanResult(signals));

  const scanDims = signalsToDimensions(signals);
  console.log('\n  Initial profile estimate:');
  console.log(formatDimensionBars(scanDims));
  console.log('');

  // ── Phase 2: Interview with live dimension updates ──
  console.log('  ─────────────────────────────────────────────');
  console.log('  Phase 2: Work style interview\n');

  const { answers, dimensions: interviewDims } = await runRichInterview(signals, scanDims);

  // ── Phase 3: Merge (scan 30% + interview 70%) ──────
  const mergedDims = mergeProfiles(scanDims, interviewDims, 0.7);

  // ── Phase 4: Generate config ───────────────────────
  const config = generateConfig(mergedDims);

  // ── Phase 5: Result summary with concrete impact ───
  printResultSummary(mergedDims, config);

  // ── Phase 6: Save profile ──────────────────────────
  const profile: ForgeProfile = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dimensions: mergedDims,
    lastScan: signals,
    interviewAnswers: answers,
  };

  const savePath = isGlobal ? GLOBAL_FORGE_PROFILE : determineSavePath(cwd);
  saveForgeProfile(profile, savePath);
  console.log(`  Profile saved: ${savePath}`);

  // ── Phase 7: Generate philosophy ──────────────────
  const philosophy = configToPhilosophy(config);
  const philosophyPath = projectPhilosophyPath(cwd);
  fs.mkdirSync(path.dirname(philosophyPath), { recursive: true });

  // 기존 철학이 있으면 확인
  if (fs.existsSync(philosophyPath) && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise<string>(resolve => {
      rl.question('\n  Existing philosophy found. Overwrite? (y/N): ', resolve);
    });
    rl.close();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('  Philosophy unchanged.\n');
      return;
    }
  }

  fs.writeFileSync(philosophyPath, JSON.stringify(philosophy, null, 2));
  console.log(`  Philosophy generated: ${philosophyPath}`);
  console.log('');
  console.log('  Your harness will keep evolving — tenetx learns from your behavior.');
  console.log('  Run `tenetx me` anytime to see your current profile.');
  console.log('');
}

// ── Helpers ─────────────────────────────────────────

/** 저장 경로 결정: .compound/ 디렉토리가 있으면 프로젝트, 없으면 글로벌 */
function determineSavePath(cwd: string): string {
  const projPath = projectForgeProfile(cwd);
  const projDir = path.dirname(projPath);
  if (fs.existsSync(projDir) || fs.existsSync(path.join(cwd, '.git'))) {
    return projPath;
  }
  return GLOBAL_FORGE_PROFILE;
}

// ── Rich Display Helpers ─────────────────────────────

/** 0.0~1.0 값을 10칸짜리 #/· 바로 렌더 */
function renderCompactBar(value: number): string {
  const width = 10;
  const filled = Math.round(value * width);
  const bar = '#'.repeat(filled) + '·'.repeat(width - filled);
  return `[${bar}]`;
}

/** 스캔 결과를 사람이 읽기 좋게 포맷 (간결한 형태) */
function formatRichScanResult(signals: ProjectSignals): string {
  const lines: string[] = [];
  const g = signals.git;
  const d = signals.dependencies;
  const cs = signals.codeStyle;
  const arch = signals.architecture;

  if (g.totalCommits > 0) {
    lines.push(`    Git: ${g.totalCommits} commits, strategy: ${g.branchStrategy}`);
  }

  const stack: string[] = [];
  if (d.hasTypeChecker) stack.push('TypeScript');
  if (cs.testFramework.length > 0) stack.push(...cs.testFramework);
  if (cs.linterConfig.length > 0) stack.push(...cs.linterConfig);
  if (stack.length > 0) {
    lines.push(`    Stack: ${stack.join(', ')}`);
  }

  if (cs.hasCI) {
    lines.push('    CI: detected');
  }

  if (cs.testPattern !== 'none') {
    lines.push(`    Tests: ${cs.testPattern} pattern`);
  }

  const docs: string[] = [];
  if (arch.hasReadme) docs.push('README');
  if (arch.hasChangelog) docs.push('CHANGELOG');
  if (arch.hasDocs) docs.push('docs/');
  if (docs.length > 0) {
    lines.push(`    Docs: ${docs.join(', ')}`);
  }

  return lines.join('\n');
}

/** 차원 벡터를 #/· 바 형태로 포맷 */
function formatDimensionBars(dims: DimensionVector): string {
  const lines: string[] = [];
  for (const meta of DIMENSION_META) {
    const val = dims[meta.key] ?? 0.5;
    const bar = renderCompactBar(val);
    const label = dimensionLabel(meta.key, val);
    lines.push(
      `    ${meta.label.padEnd(14)} ${bar}  ${val.toFixed(2)}  ${label}`,
    );
  }
  return lines.join('\n');
}

/** 인터뷰 1문항 처리: 답변 받고 차원 변화 출력 */
async function runRichInterview(
  signals: ProjectSignals | null,
  scanDims: DimensionVector,
): Promise<{ answers: Record<string, number>; dimensions: DimensionVector }> {
  const answers: Record<string, number> = {};

  if (!process.stdin.isTTY) {
    console.log('  [forge] Non-interactive mode: skipping interview');
    return { answers, dimensions: answersToDeltas(answers) };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const questions = getActiveQuestions(answers, signals);

  console.log(`  ${questions.length}개 질문에 답해주세요. 번호를 입력하세요.\n`);

  // 현재 차원 (스캔 기반 초기값에서 시작)
  let currentDims: DimensionVector = { ...scanDims };

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    if (q.condition && !q.condition(answers, signals)) continue;

    console.log(`  [${i + 1}/${questions.length}] ${q.text}`);
    for (let j = 0; j < q.options.length; j++) {
      console.log(`    ${j + 1}) ${q.options[j].text}`);
    }

    const raw = await new Promise<string>(resolve => {
      rl.question('  > ', resolve);
    });

    const idx = parseInt(raw.trim(), 10) - 1;
    if (idx >= 0 && idx < q.options.length) {
      answers[q.id] = idx;

      // 선택한 옵션의 델타를 적용하고 변화를 표시
      const deltas = q.options[idx].deltas;
      const prevDims = { ...currentDims };
      const newDims = applyDeltas(currentDims, deltas);
      currentDims = newDims;

      // 의미 있는 변화가 있는 차원만 표시
      const changed: string[] = [];
      for (const meta of DIMENSION_META) {
        const key = meta.key;
        const before = prevDims[key] ?? 0.5;
        const after = newDims[key] ?? 0.5;
        const diff = after - before;
        if (Math.abs(diff) >= 0.03) {
          const arrow = diff > 0 ? '\u2191' : '\u2193';
          changed.push(
            `    ${meta.label.padEnd(14)} ${renderCompactBar(before)}  ${before.toFixed(2)}`
            + `  \u2192  ${renderCompactBar(after)}  ${after.toFixed(2)}  ${arrow}`,
          );
        }
      }

      if (changed.length > 0) {
        console.log('');
        for (const line of changed) {
          console.log(line);
        }
      }
    } else {
      console.log('    (잘못된 입력, 건너뜀)');
    }

    console.log('');
  }

  rl.close();

  const dimensions = answersToDeltas(answers);
  return { answers, dimensions };
}

/** 결과 요약 출력 (aha moment) */
function printResultSummary(dims: DimensionVector, config: ReturnType<typeof generateConfig>): void {
  console.log('');
  console.log('  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('   Your forge profile is ready!');
  console.log('  \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log('');
  console.log('  Final Profile:');
  console.log(formatDimensionBars(dims));
  console.log('');

  console.log('  What this changes for you:');

  // 활성화된 에이전트
  const activeAgents = config.agents.filter(a => a.enabled);
  for (const agent of activeAgents) {
    const strictnessLabel = agent.strictness >= 4 ? 'strict mode' : agent.strictness <= 2 ? 'relaxed mode' : 'standard mode';
    console.log(`    \u2713 ${agent.name}: ${strictnessLabel} (strictness ${agent.strictness}/5)`);
  }

  // 훅 심각도
  if (config.hookSeverity === 'strict') {
    console.log('    \u2713 pre-commit: build + lint + type check enforced');
  } else if (config.hookSeverity === 'balanced') {
    console.log('    \u2713 pre-commit: lint + type check');
  } else {
    console.log('    \u2713 pre-commit: relaxed (errors only)');
  }

  // 모델 라우팅
  if (config.routingPreset === 'max-quality') {
    console.log('    \u2713 Model routing: prefer opus for reviews');
  } else if (config.routingPreset === 'cost-saving') {
    console.log('    \u2713 Model routing: haiku/sonnet preferred (cost-saving)');
  } else {
    console.log('    \u2713 Model routing: default (sonnet/opus balanced)');
  }

  // verbosity
  if (config.verbosity === 'terse') {
    console.log('    \u2713 Responses: concise, code-focused');
  } else if (config.verbosity === 'verbose') {
    console.log('    \u2713 Responses: detailed with explanations');
  } else {
    console.log('    \u2713 Responses: balanced (code + key points)');
  }

  // 에이전트 오버레이 요약
  if (config.agentOverlays.length > 0) {
    console.log(`    \u2713 Agent tuning: ${config.agentOverlays.map(o => o.agentName).join(', ')}`);
  }

  console.log('');
}
