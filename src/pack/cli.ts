import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  installPack,
  syncPack,
  syncAllPacks,
  initPack,
  listInstalledPacks,
} from './manager.js';
import {
  addPack,
  removePack,
  loadPackConfigs,
  lockPacks,
  loadPackLock,
  checkPackUpdates,
  packLockPath,
  type PackConnection,
  type PackType,
} from '../core/pack-config.js';
import { PACKS_DIR } from '../core/paths.js';
import { readPackMeta } from './remote.js';
import type { PackRequirement } from '../core/types.js';

export async function handlePack(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'list';

  // --help 처리
  if (subcommand === '--help' || subcommand === '-h') {
    printPackHelp();
    return;
  }

  try {
    switch (subcommand) {
      case 'list':
        listPacks();
        break;

      case 'install': {
        const source = args[1];
        if (!source) {
          console.log('  Usage: tenetx pack install <github-url|owner/repo|path>');
          console.log('  Examples:');
          console.log('    tenetx pack install medistream/emr-pack');
          console.log('    tenetx pack install https://github.com/team/pack.git');
          console.log('    tenetx pack install ./local-pack');
          return;
        }
        const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : undefined;
        console.log(`\n  Installing pack: ${source}\n`);
        const meta = await installPack(source, name);
        console.log(`\n  ✓ ${meta.name} v${meta.version} installed`);
        if (meta.provides) {
          const parts: string[] = [];
          if (meta.provides.rules) parts.push(`rules ${meta.provides.rules}`);
          if (meta.provides.solutions) parts.push(`solutions ${meta.provides.solutions}`);
          if (meta.provides.skills) parts.push(`skills ${meta.provides.skills}`);
          if (meta.provides.agents) parts.push(`agents ${meta.provides.agents}`);
          if (meta.provides.workflows) parts.push(`workflows ${meta.provides.workflows}`);
          if (meta.provides.atoms) parts.push(`atoms ${meta.provides.atoms}`);
          if (parts.length > 0) console.log(`  ${parts.join(' · ')}`);
        }
        console.log();
        break;
      }

      case 'add': {
        handlePackAdd(args.slice(1));
        break;
      }

      case 'remove': {
        handlePackRemove(args.slice(1));
        break;
      }

      case 'connected': {
        listConnectedPacks();
        break;
      }

      case 'setup': {
        await handlePackSetup(args.slice(1));
        break;
      }

      case 'lock': {
        handlePackLock();
        break;
      }

      case 'unlock': {
        handlePackUnlock();
        break;
      }

      case 'outdated': {
        handlePackOutdated();
        break;
      }

      case 'sync': {
        const packName = args[1];
        console.log('\n  Syncing packs\n');
        if (packName) {
          await syncPack(packName);
        } else {
          await syncAllPacks();
        }
        console.log();
        break;
      }

      case 'init': {
        // 첫 번째 비-플래그 인자가 이름
        const name = args.slice(1).find(a => !a.startsWith('-'));
        if (!name) {
          console.log('  Usage: tenetx pack init <name> [--from-project] [--starter]');
          console.log('    --from-project    Analyze current project and generate AI briefing');
          console.log('    --starter         Include example rules/skills/workflows');
          return;
        }
        const fromProject = args.includes('--from-project') ? process.cwd() : undefined;
        const starter = args.includes('--starter');
        initPack(name, undefined, { fromProject, starter });
        console.log(`\n  ✓ Pack '${name}' created`);
        console.log(`  Path: ~/.compound/packs/${name}/`);
        if (fromProject) {
          console.log(`  _context.md generated — AI can read this context to fill the pack.`);
        }
        if (starter) {
          console.log(`  Starter templates included — customize for your team.`);
        }
        console.log(`\n  Next steps:`);
        console.log(`    1. Run tenetx and say "fill the pack" — AI will help.`);
        console.log(`    2. Or edit ~/.compound/packs/${name}/ files directly.\n`);
        break;
      }

      default:
        printPackHelp();
    }
  } catch (err) {
    console.error(`  ✗ ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}

function handlePackAdd(args: string[]): void {
  const name = args[0];
  if (!name || name.startsWith('-')) {
    console.log('  Usage: tenetx pack add <name> [--repo <org/repo>] [--type <github|inline|local>] [--path <local-path>]');
    console.log('  Examples:');
    console.log('    tenetx pack add saas-specs --repo team/saas-specs');
    console.log('    tenetx pack add saas-dev-specs --repo team/saas-dev-specs');
    console.log('    tenetx pack add local-rules --type inline');
    return;
  }

  const repoIdx = args.indexOf('--repo');
  const repo = repoIdx !== -1 ? args[repoIdx + 1] : undefined;

  const typeIdx = args.indexOf('--type');
  const typeArg = typeIdx !== -1 ? args[typeIdx + 1] as PackType : undefined;

  const pathIdx = args.indexOf('--path');
  const localPath = pathIdx !== -1 ? args[pathIdx + 1] : undefined;

  // 타입 결정: --repo가 있으면 github, --path가 있으면 local, 기본 inline
  const type: PackType = typeArg ?? (repo ? 'github' : localPath ? 'local' : 'inline');

  const cwd = process.cwd();
  const pack: PackConnection = { type, name, repo, localPath };
  addPack(cwd, pack);

  const existing = loadPackConfigs(cwd);
  console.log(`\n  ✓ Pack '${name}' connected (${type})`);
  if (repo) console.log(`  Repo: ${repo}`);
  console.log(`  Connected packs: ${existing.length}`);
  console.log();
}

function handlePackRemove(args: string[]): void {
  const name = args[0];
  if (!name) {
    console.log('  Usage: tenetx pack remove <name>');
    return;
  }

  const cwd = process.cwd();
  const removed = removePack(cwd, name);
  if (removed) {
    const remaining = loadPackConfigs(cwd);
    console.log(`\n  ✓ Pack '${name}' disconnected`);
    console.log(`  Remaining packs: ${remaining.length}`);
  } else {
    console.log(`\n  ✗ Pack '${name}' is not connected.`);
    const packs = loadPackConfigs(cwd);
    if (packs.length > 0) {
      console.log('  Connected packs:');
      for (const p of packs) {
        console.log(`    • ${p.name} (${p.type})`);
      }
    }
  }
  console.log();
}

function listConnectedPacks(): void {
  const cwd = process.cwd();
  const packs = loadPackConfigs(cwd);

  console.log('\n  Project connected packs\n');
  if (packs.length === 0) {
    console.log('  No packs connected.');
    console.log('  Connect with: tenetx pack add <name> --repo <org/repo>\n');
    return;
  }

  for (const pack of packs) {
    const detail = pack.type === 'github' ? `(${pack.repo})` :
                   pack.type === 'local' ? `(${pack.localPath})` : '(inline)';
    const sync = pack.lastSync ? `sync: ${pack.lastSync.slice(0, 7)}` : 'sync: none';
    console.log(`  ■ ${pack.name} ${detail}`);
    console.log(`    ${pack.type} · ${sync}`);
  }
  console.log();
}

function handlePackLock(): void {
  const cwd = process.cwd();
  const { locked, skipped } = lockPacks(cwd);

  console.log('\n  Locking pack versions\n');
  if (locked.length === 0) {
    console.log('  No github packs to lock.');
    console.log('  (Connect a github pack and sync it first)\n');
    return;
  }

  for (const name of locked) {
    const lock = loadPackLock(cwd);
    const entry = lock?.packs[name];
    console.log(`  ✓ ${name} → ${entry?.resolved.slice(0, 7)}`);
  }
  if (skipped.length > 0) {
    console.log(`  ─ Skipped (non-github): ${skipped.join(', ')}`);
  }

  const lockPath = packLockPath(cwd);
  console.log(`\n  pack.lock created: ${path.relative(cwd, lockPath)}`);
  console.log('  Commit this file to git so the whole team uses the same pack versions.');
  console.log('  Update: tenetx pack sync → tenetx pack lock\n');
}

function handlePackUnlock(): void {
  const cwd = process.cwd();
  const lockPath = packLockPath(cwd);

  if (!fs.existsSync(lockPath)) {
    console.log('\n  pack.lock not found. (Already unlocked)\n');
    return;
  }

  fs.unlinkSync(lockPath);
  console.log('\n  ✓ pack.lock removed — automatic pack sync re-enabled.\n');
}

function handlePackOutdated(): void {
  const cwd = process.cwd();
  const lock = loadPackLock(cwd);

  console.log('\n  Checking for pack updates\n');

  if (!lock || Object.keys(lock.packs).length === 0) {
    console.log('  No pack.lock found. Run tenetx pack lock first.\n');
    return;
  }

  const outdated = checkPackUpdates(cwd);

  if (outdated.length === 0) {
    console.log('  All packs are up to date.\n');
    return;
  }

  for (const o of outdated) {
    console.log(`  ⬆ ${o.name} (${o.repo})`);
    console.log(`    Current: ${o.locked} → Latest: ${o.latest}`);
  }
  console.log(`\n  Update: tenetx pack sync → tenetx pack lock\n`);
}

/** 원클릭 셋업: 설치 → 연결 → 동기화 → 의존성 검사 */
async function handlePackSetup(args: string[]): Promise<void> {
  const source = args[0];
  if (!source) {
    console.log('  Usage: tenetx pack setup <github-url|owner/repo|path>');
    console.log('  Examples:');
    console.log('    tenetx pack setup medistream/emr-pack');
    console.log('    tenetx pack setup ./local-pack');
    console.log();
    console.log('  This command automatically:');
    console.log('    1. Installs the pack (if not already installed)');
    console.log('    2. Connects it to the current project');
    console.log('    3. Syncs it');
    console.log('    4. Checks dependencies (requires)');
    return;
  }

  const cwd = process.cwd();
  const nameArg = args.includes('--name') ? args[args.indexOf('--name') + 1] : undefined;

  // installPack과 동일한 디렉토리명 결정 로직
  const { extractPackName: extractName } = await import('./remote.js');
  const dirName = nameArg ?? extractName(source);

  // 1. 설치
  console.log('\n  ━━ Pack one-click setup ━━\n');
  let packName: string = dirName;
  let meta;
  try {
    console.log('  [1/4] Installing pack...');
    meta = await installPack(source, nameArg);
    packName = dirName; // 디렉토리명 기준 (meta.name과 다를 수 있음)
    console.log(`  ✓ ${meta.name} v${meta.version} installed`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('이미 설치')) {
      meta = readPackMeta(path.join(PACKS_DIR, dirName)) ?? undefined;
      console.log(`  ✓ ${packName} already installed (syncing)`);
      try { await syncPack(packName); } catch { /* ignore */ }
    } else {
      throw err;
    }
  }

  // 2. 프로젝트 연결
  console.log('  [2/4] Connecting to project...');
  const isGithub = source.includes('/');
  const pack: PackConnection = {
    type: isGithub ? 'github' : 'local',
    name: packName,
    repo: isGithub ? source : undefined,
  };
  addPack(cwd, pack);
  const connected = loadPackConfigs(cwd);
  console.log(`  ✓ Connected (${connected.length} pack(s) total)`);

  // 3. 동기화 + lastSync 기록
  console.log('  [3/4] Syncing...');
  try {
    await syncPack(packName);
    // github 팩이면 lastSync SHA를 프로젝트 PackConnection에 기록 (pack lock에 필요)
    if (isGithub) {
      try {
        // source 검증: owner/repo 형식만 허용 (셸 인젝션 방지)
        if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(source)) {
          throw new Error(`Invalid repo format: ${source}`);
        }
        const sha = execFileSync('gh', ['api', `repos/${source}/commits/HEAD`, '--jq', '.sha'], {
          encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000,
        }).trim();
        const { savePackConfigs } = await import('../core/pack-config.js');
        const packs = loadPackConfigs(cwd);
        const idx = packs.findIndex(p => p.name === packName);
        if (idx >= 0) {
          packs[idx].lastSync = sha;
          savePackConfigs(cwd, packs);
        }
      } catch { /* SHA 조회 실패 시 무시 */ }
    }
    console.log('  ✓ Sync complete');
  } catch {
    console.log('  ─ Sync skipped (local pack)');
  }

  // 4. 의존성 검사
  console.log('  [4/4] Checking dependencies...');
  const packDir = path.join(PACKS_DIR, dirName);
  const packMeta = readPackMeta(packDir);
  if (packMeta?.requires) {
    const issues = checkRequirements(packMeta.requires);
    if (issues.length === 0) {
      console.log('  ✓ All dependencies satisfied');
    } else {
      console.log(`  ⚠ ${issues.length} unmet dependency(ies):`);
      for (const issue of issues) {
        console.log(`    ✗ ${issue}`);
      }
    }
  } else {
    console.log('  ✓ No additional dependencies');
  }

  // 자산 요약
  if (meta?.provides || packMeta?.provides) {
    const p = meta?.provides ?? packMeta?.provides ?? {};
    const parts: string[] = [];
    if (p.rules) parts.push(`rules ${p.rules}`);
    if (p.solutions) parts.push(`solutions ${p.solutions}`);
    if (p.skills) parts.push(`skills ${p.skills}`);
    if (p.agents) parts.push(`agents ${p.agents}`);
    if (p.workflows) parts.push(`workflows ${p.workflows}`);
    if (parts.length > 0) {
      console.log(`\n  Assets: ${parts.join(' · ')}`);
    }
  }

  console.log('\n  ✓ Setup complete! Run tenetx to apply the pack automatically.\n');
}

/** 팩 requires 검사 */
function checkRequirements(requires: PackRequirement): string[] {
  const issues: string[] = [];

  function commandExists(cmd: string): boolean {
    try {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      execFileSync(checker, [cmd], { stdio: 'pipe' });
      return true;
    } catch { return false; }
  }

  // MCP 서버 체크
  if (requires.mcpServers) {
    for (const mcp of requires.mcpServers) {
      // settings.json에서 MCP 서버 등록 여부 확인
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      let found = false;
      try {
        if (fs.existsSync(settingsPath)) {
          const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
          const mcpConfig = settings.mcpServers ?? {};
          found = mcp.name in mcpConfig;
        }
      } catch { /* ignore */ }

      if (!found) {
        const hint = mcp.installCmd ?? mcp.npm ?? mcp.pip ?? '';
        issues.push(`MCP server '${mcp.name}' not registered${hint ? ` — install: ${hint}` : ''}`);
      }
    }
  }

  // CLI 도구 체크
  if (requires.tools) {
    for (const tool of requires.tools) {
      if (!commandExists(tool.name)) {
        const hint = tool.installCmd ?? '';
        issues.push(`CLI tool '${tool.name}' not installed${hint ? ` — install: ${hint}` : ''}`);
      }
    }
  }

  // 환경변수 체크
  if (requires.envVars) {
    for (const env of requires.envVars) {
      if (env.required !== false && !process.env[env.name]) {
        issues.push(`Env var '${env.name}' not set${env.description ? ` — ${env.description}` : ''}`);
      }
    }
  }

  return issues;
}

function listPacks(): void {
  const packs = listInstalledPacks();
  console.log('\n  Installed packs\n');

  if (packs.length === 0) {
    console.log('  No packs found. Install with: tenetx pack install <source>\n');
    return;
  }

  for (const { name, meta } of packs) {
    const version = meta?.version ?? '?';
    const remote = meta?.remote ? `(${meta.remote.type})` : '(local)';
    const p = meta?.provides;
    const parts: string[] = [];
    if (p?.rules) parts.push(`rules ${p.rules}`);
    if (p?.solutions) parts.push(`solutions ${p.solutions}`);
    if (p?.skills) parts.push(`skills ${p.skills}`);
    if (p?.agents) parts.push(`agents ${p.agents}`);
    if (p?.workflows) parts.push(`workflows ${p.workflows}`);
    console.log(`  ■ ${name} v${version} ${remote}`);
    console.log(`    ${parts.length > 0 ? parts.join(' · ') : '(no assets)'}`);
  }
  console.log();
}

function printPackHelp(): void {
  console.log('  Usage: tenetx pack <list|install|add|remove|connected|setup|lock|unlock|outdated|sync|init>');
  console.log('    list              List installed packs');
  console.log('    install <source>  Install a pack (GitHub, local)');
  console.log('    add <name>        Connect a pack to the project (--repo, --type)');
  console.log('    remove <name>     Disconnect a pack from the project');
  console.log('    connected         List packs connected to the current project');
  console.log('    setup <source>    One-click setup (install+connect+sync+deps check)');
  console.log('    lock              Lock pack versions (creates pack.lock, git-committable)');
  console.log('    unlock            Unlock pack versions');
  console.log('    outdated          Check for updatable packs');
  console.log('    sync [name]       Sync packs (all or specific)');
  console.log('    init <name>       Create a new pack');
}
