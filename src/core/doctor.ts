import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
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
    const checker = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(checker, [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export async function runDoctor(): Promise<void> {
  console.log('\n  Tenetx — Diagnostics\n');

  console.log('  [Tools]');
  check('claude CLI', commandExists('claude'));
  check('tmux', commandExists('tmux'));
  check('git', commandExists('git'));
  check('gh (GitHub CLI)', commandExists('gh'), 'Required for team PR features: brew install gh');
  console.log();

  console.log('  [Plugins]');
  const ralphLoopInstalled = exists(
    path.join(os.homedir(), '.claude', 'plugins', 'cache', 'claude-plugins-official', 'ralph-loop')
  );
  check('ralph-loop plugin', ralphLoopInstalled,
    'Required for ralph mode auto-iteration. Install: claude plugins install ralph-loop');
  console.log();

  console.log('  [Directories]');
  check('~/.compound/', exists(COMPOUND_HOME));
  check('~/.compound/me/', exists(ME_DIR));
  check('~/.compound/me/solutions/', exists(ME_SOLUTIONS));
  check('~/.compound/me/rules/', exists(ME_RULES));
  check('~/.compound/packs/', exists(PACKS_DIR));
  check('~/.compound/sessions/', exists(SESSIONS_DIR));
  console.log();

  console.log('  [Philosophy]');
  check('philosophy.json', exists(ME_PHILOSOPHY));
  console.log();

  console.log('  [Environment]');
  check('Inside tmux session', !!process.env.TMUX);
  check('COMPOUND_HARNESS env var', process.env.COMPOUND_HARNESS === '1');
  console.log();

  // 솔루션/규칙 수
  if (exists(ME_SOLUTIONS)) {
    const solutions = fs.readdirSync(ME_SOLUTIONS).filter((f) => f.endsWith('.md')).length;
    console.log(`  Personal solutions: ${solutions}`);
  }
  if (exists(ME_RULES)) {
    const rules = fs.readdirSync(ME_RULES).filter((f) => f.endsWith('.md')).length;
    console.log(`  Personal rules: ${rules}`);
  }
  console.log();

  console.log('  [Log Locations]');
  console.log(`  Session logs: ${SESSIONS_DIR}`);

  if (exists(SESSIONS_DIR)) {
    const sessionCount = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith('.json')).length;
    console.log(`  Saved sessions: ${sessionCount}`);
  }

  console.log(`  Claude Code sessions: ${CLAUDE_PROJECTS_DIR}`);
  console.log();

  console.log('  [Providers]');
  try {
    const { getProviderSummary } = await import('../engine/provider.js');
    const providers = getProviderSummary();
    for (const p of providers) {
      const detail = p.available ? p.model : (p.reason ?? 'unknown');
      check(`${p.name} (${detail})`, p.available);
    }
  } catch {
    console.log('  (Failed to load provider module)');
  }
  console.log();

  console.log('  [Pack Connections]');
  try {
    const { loadPackConfigs, packConfigPath } = await import('./pack-config.js');
    const packPath = packConfigPath(process.cwd());
    if (exists(packPath)) {
      // 구 형식 감지: packs 배열이 아닌 단일 객체
      const raw = JSON.parse(fs.readFileSync(packPath, 'utf-8'));
      const isLegacy = !Array.isArray(raw.packs) && raw.type && raw.name;
      if (isLegacy) {
        check('pack.json format', false, 'Legacy format detected. Auto-migrate: tenetx doctor --migrate-packs');
        // --migrate-packs 플래그 처리
        if (process.argv.includes('--migrate-packs')) {
          const packs = loadPackConfigs(process.cwd()); // 내부에서 자동 래핑
          const { savePackConfigs } = await import('./pack-config.js');
          savePackConfigs(process.cwd(), packs);
          console.log(`    → Migration complete: ${packs.length} packs converted to new format`);
        }
      } else {
        check('pack.json format', true);
      }
      const packs = loadPackConfigs(process.cwd());
      console.log(`  Connected packs: ${packs.length}`);
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
              } catch { /* settings.json parse failure — treats MCP as not found, shows install hint */ }
              check(`  [${p.name}] MCP: ${mcp.name}`, found, mcp.installCmd ?? mcp.npm ?? 'Installation required');
              if (!found) totalIssues++;
            }
          }
          // CLI 도구 체크
          if (req.tools) {
            for (const tool of req.tools) {
              const ok = commandExists(tool.name);
              check(`  [${p.name}] CLI: ${tool.name}`, ok, tool.installCmd ?? 'Installation required');
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
        console.log(`\n  ⚠ ${totalIssues} unmet dependencies`);
      }
    } else {
      console.log('  No packs connected (personal mode)');
    }
  } catch {
    console.log('  (Failed to check pack config)');
  }
  console.log();

  // 현재 디렉토리 git 정보
  console.log('  [Git]');
  try {
    const remote = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf-8', stdio: 'pipe' }).trim();
    console.log(`  remote (origin): ${remote}`);
  } catch {
    // git 저장소가 아니거나 origin이 없으면 표시하지 않음
    console.log('  git remote: (none)');
  }
  console.log();
}
