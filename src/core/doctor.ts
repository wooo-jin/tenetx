import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { COMPOUND_HOME, ME_DIR, ME_PHILOSOPHY, ME_SOLUTIONS, ME_RULES, PACKS_DIR, SESSIONS_DIR } from './paths.js';

/** ~/.claude/projects/ — Claude Code 세션 저장 경로 */
const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

function check(label: string, condition: boolean, hint?: string): void {
  const icon = condition ? '✓' : '✗';
  const hintStr = !condition && hint ? ` — ${hint}` : '';
  console.log(`  ${icon} ${label}${hintStr}`);
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(): Promise<void> {
  console.log('\n  Tenet — 환경 진단\n');

  // 필수 도구
  console.log('  [도구]');
  check('claude CLI', commandExists('claude'));
  check('tmux', commandExists('tmux'));
  check('git', commandExists('git'));
  check('gh (GitHub CLI)', commandExists('gh'), '팀 PR 기능에 필요: brew install gh');
  console.log();

  // 디렉토리 구조
  console.log('  [디렉토리]');
  check('~/.compound/', exists(COMPOUND_HOME));
  check('~/.compound/me/', exists(ME_DIR));
  check('~/.compound/me/solutions/', exists(ME_SOLUTIONS));
  check('~/.compound/me/rules/', exists(ME_RULES));
  check('~/.compound/packs/', exists(PACKS_DIR));
  check('~/.compound/sessions/', exists(SESSIONS_DIR));
  console.log();

  // 철학
  console.log('  [철학]');
  check('philosophy.json', exists(ME_PHILOSOPHY));
  console.log();

  // 환경
  console.log('  [환경]');
  check('tmux 세션 내', !!process.env.TMUX);
  check('COMPOUND_HARNESS 환경변수', process.env.COMPOUND_HARNESS === '1');
  console.log();

  // 솔루션/규칙 수
  if (exists(ME_SOLUTIONS)) {
    const solutions = fs.readdirSync(ME_SOLUTIONS).filter((f) => f.endsWith('.md')).length;
    console.log(`  개인 솔루션: ${solutions}개`);
  }
  if (exists(ME_RULES)) {
    const rules = fs.readdirSync(ME_RULES).filter((f) => f.endsWith('.md')).length;
    console.log(`  개인 규칙: ${rules}개`);
  }
  console.log();

  // 로그 저장 위치
  console.log('  [로그 위치]');
  console.log(`  세션 로그: ${SESSIONS_DIR}`);

  // 세션 파일 수 표시
  if (exists(SESSIONS_DIR)) {
    const sessionCount = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json')).length;
    console.log(`  저장된 세션: ${sessionCount}개`);
  }

  // Claude Code 세션 경로
  console.log(`  Claude Code 세션: ${CLAUDE_PROJECTS_DIR}`);
  console.log();

  // 프로바이더 상태
  console.log('  [프로바이더]');
  try {
    const { getProviderSummary } = await import('../engine/provider.js');
    const providers = getProviderSummary();
    for (const p of providers) {
      const detail = p.available ? p.model : (p.reason ?? 'unknown');
      check(`${p.name} (${detail})`, p.available);
    }
  } catch {
    console.log('  (프로바이더 모듈 로드 실패)');
  }
  console.log();

  // 현재 디렉토리 git 정보
  console.log('  [Git]');
  try {
    const remote = execSync('git remote get-url origin', { stdio: 'pipe' }).toString().trim();
    console.log(`  remote (origin): ${remote}`);
  } catch {
    // git 저장소가 아니거나 origin이 없으면 표시하지 않음
    console.log('  git remote: (없음)');
  }
  console.log();
}
