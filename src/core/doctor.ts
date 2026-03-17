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
    const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(): Promise<void> {
  console.log('\n  Tenetx — 환경 진단\n');

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

  // 프로젝트 팩 연결 상태
  console.log('  [팩 연결]');
  try {
    const { loadPackConfigs, packConfigPath } = await import('./pack-config.js');
    const packPath = packConfigPath(process.cwd());
    if (exists(packPath)) {
      // 구 형식 감지: packs 배열이 아닌 단일 객체
      const raw = JSON.parse(fs.readFileSync(packPath, 'utf-8'));
      const isLegacy = !Array.isArray(raw.packs) && raw.type && raw.name;
      if (isLegacy) {
        check('pack.json 형식', false, '구 형식 감지됨. 자동 마이그레이션하려면: tenetx doctor --migrate-packs');
        // --migrate-packs 플래그 처리
        if (process.argv.includes('--migrate-packs')) {
          const packs = loadPackConfigs(process.cwd()); // 내부에서 자동 래핑
          const { savePackConfigs } = await import('./pack-config.js');
          savePackConfigs(process.cwd(), packs);
          console.log(`    → 마이그레이션 완료: ${packs.length}개 팩을 새 형식으로 변환`);
        }
      } else {
        check('pack.json 형식', true);
      }
      const packs = loadPackConfigs(process.cwd());
      console.log(`  연결된 팩: ${packs.length}개`);
      for (const p of packs) {
        const detail = p.type === 'github' ? p.repo : p.type;
        console.log(`    • ${p.name} (${detail})`);
      }

      // 팩별 requires 검사
      const { PACKS_DIR } = await import('./paths.js');
      const { readPackMeta } = await import('../pack/remote.js');
      let totalIssues = 0;
      for (const p of packs) {
        const packDir = path.join(PACKS_DIR, p.name);
        const meta = readPackMeta(packDir);
        if (meta?.requires) {
          const req = meta.requires;
          // MCP 서버 체크
          if (req.mcpServers) {
            for (const mcp of req.mcpServers) {
              const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
              let found = false;
              try {
                if (exists(settingsPath)) {
                  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
                  found = mcp.name in (settings.mcpServers ?? {});
                }
              } catch { /* ignore */ }
              check(`  [${p.name}] MCP: ${mcp.name}`, found, mcp.installCmd ?? mcp.npm ?? '설치 필요');
              if (!found) totalIssues++;
            }
          }
          // CLI 도구 체크
          if (req.tools) {
            for (const tool of req.tools) {
              const ok = commandExists(tool.name);
              check(`  [${p.name}] CLI: ${tool.name}`, ok, tool.installCmd ?? '설치 필요');
              if (!ok) totalIssues++;
            }
          }
          // 환경변수 체크
          if (req.envVars) {
            for (const env of req.envVars) {
              if (env.required === false) continue;
              const ok = !!process.env[env.name];
              check(`  [${p.name}] ENV: ${env.name}`, ok, env.description);
              if (!ok) totalIssues++;
            }
          }
        }
      }
      if (totalIssues > 0) {
        console.log(`\n  ⚠ 미충족 의존성 ${totalIssues}건`);
      }
    } else {
      console.log('  팩 미연결 (개인 모드)');
    }
  } catch {
    console.log('  (팩 설정 확인 실패)');
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
