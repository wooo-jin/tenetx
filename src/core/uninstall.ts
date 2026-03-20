import * as fs from 'node:fs';
import * as path from 'node:path';
import * as readline from 'node:readline';
import {
  SETTINGS_PATH,
  acquireLock,
  releaseLock,
  atomicWriteFileSync,
} from './settings-lock.js';

/** 사용자에게 y/n 확인 */
function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/** settings.json에서 CH 관련 항목 제거 */
function cleanSettings(): void {
  if (!fs.existsSync(SETTINGS_PATH)) return;

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    console.error('[tenetx] settings.json 파싱 실패 — 건너뜁니다.');
    return;
  }

  // env에서 COMPOUND_ 접두어 키 제거
  const env = settings.env as Record<string, string> | undefined;
  if (env) {
    for (const key of Object.keys(env)) {
      if (key.startsWith('COMPOUND_')) delete env[key];
    }
    if (Object.keys(env).length === 0) {
      delete settings.env;
    }
  }

  // hooks에서 tenetx 관련 엔트리 제거
  const hookMarkers = ['tenetx', 'compound-harness'];
  function isCHCommand(cmd: string): boolean {
    return hookMarkers.some(m => cmd.includes(m));
  }
  function isCHHookEntry(entry: Record<string, unknown>): boolean {
    // 직접 형식: { type, command }
    if (typeof entry.command === 'string' && isCHCommand(entry.command)) return true;
    // 래핑 형식: { matcher, hooks: [{ command }] }
    const innerHooks = entry.hooks as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(innerHooks)) {
      return innerHooks.some(h => typeof h.command === 'string' && isCHCommand(h.command));
    }
    return false;
  }

  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (hooks) {
    for (const [hookType, entries] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) continue;
      const filtered = entries.filter(
        (h) => !isCHHookEntry(h as Record<string, unknown>)
      );
      if (filtered.length === 0) {
        delete hooks[hookType];
      } else {
        hooks[hookType] = filtered;
      }
    }
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }
  }

  // statusLine이 tenetx status면 제거
  const statusLine = settings.statusLine as Record<string, unknown> | undefined;
  if (statusLine?.command === 'tenetx status') {
    delete settings.statusLine;
  }

  acquireLock();
  try {
    atomicWriteFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } finally {
    releaseLock();
  }
  console.log('  ✓ settings.json에서 CH 항목 제거');
}

/** 프로젝트 .claude/agents/ch-*.md 삭제 (커스터마이즈된 파일은 보호) */
function cleanAgents(cwd: string): void {
  const agentsDir = path.join(cwd, '.claude', 'agents');
  if (!fs.existsSync(agentsDir)) return;

  let removed = 0;
  let preserved = 0;
  for (const file of fs.readdirSync(agentsDir)) {
    if (file.startsWith('ch-') && file.endsWith('.md')) {
      const filePath = path.join(agentsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes('<!-- tenetx-managed -->')) {
        // 사용자가 커스터마이즈한 파일 → 보존
        preserved++;
        continue;
      }
      fs.unlinkSync(filePath);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`  ✓ ${removed}개 에이전트 파일 제거 (.claude/agents/ch-*.md)`);
  }
  if (preserved > 0) {
    console.log(`  ⚠ ${preserved}개 커스터마이즈된 에이전트 파일 보존 (수동 삭제 필요)`);
  }
  if (removed === 0 && preserved === 0) {
    console.log('  - 에이전트 파일 없음');
  }
}

/** .claude/rules/ 의 tenetx 규칙 파일 및 레거시 compound-rules.md 제거 */
function cleanCompoundRules(cwd: string): void {
  const ruleFiles = [
    'security.md',
    'golden-principles.md',
    'anti-pattern.md',
    'routing.md',
    'compound.md',
  ];
  const rulesDir = path.join(cwd, '.claude', 'rules');
  let removedCount = 0;

  for (const file of ruleFiles) {
    const p = path.join(rulesDir, file);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      removedCount++;
    }
  }

  // 레거시 경로
  const legacyPath = path.join(cwd, '.claude', 'compound-rules.md');
  if (fs.existsSync(legacyPath)) {
    fs.unlinkSync(legacyPath);
    removedCount++;
  }

  if (removedCount > 0) {
    console.log(`  ✓ ${removedCount}개 규칙 파일 제거`);
  } else {
    console.log('  - 규칙 파일 없음');
  }
}

/** CLAUDE.md에서 tenetx 블록 제거 */
function cleanClaudeMd(cwd: string): void {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return;

  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const marker = '<!-- tenetx:start -->';
  const endMarker = '<!-- tenetx:end -->';

  if (!content.includes(marker)) {
    console.log('  - CLAUDE.md에 CH 블록 없음');
    return;
  }

  const regex = new RegExp(`\\n?${marker}[\\s\\S]*?${endMarker}\\n?`, 'g');
  const cleaned = content.replace(regex, '\n');
  fs.writeFileSync(claudeMdPath, `${cleaned.replace(/\n{3,}/g, '\n\n').trim()}\n`);
  console.log('  ✓ CLAUDE.md에서 CH 블록 제거');
}

/** tenetx uninstall 메인 */
export async function handleUninstall(cwd: string, options: { force?: boolean }): Promise<void> {
  console.log('\n[tenetx] Tenetx 제거\n');
  console.log('다음 항목을 정리합니다:');
  console.log('  1. ~/.claude/settings.json에서 CH 환경변수/훅/statusLine 제거');
  console.log('  2. .claude/agents/ch-*.md 에이전트 파일 삭제');
  console.log('  3. .claude/rules/ 규칙 파일 삭제 (security, golden-principles, anti-pattern, routing, compound)');
  console.log('  4. CLAUDE.md에서 tenetx 블록 제거');
  console.log('');
  console.log('참고: ~/.compound/ 디렉토리는 보존됩니다 (수동 삭제: rm -rf ~/.compound)\n');

  if (!options.force) {
    if (!process.stdin.isTTY) {
      console.error('[tenetx] non-interactive 환경에서는 --force 플래그를 사용하세요.');
      process.exit(1);
    }
    const ok = await confirm('계속하시겠습니까?');
    if (!ok) {
      console.log('취소되었습니다.');
      return;
    }
    console.log('');
  }

  cleanSettings();
  cleanAgents(cwd);
  cleanCompoundRules(cwd);
  cleanClaudeMd(cwd);

  console.log('\n[tenetx] 제거 완료. Claude Code를 재시작하면 순수 상태로 동작합니다.\n');
}
