import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
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

  try {
    switch (subcommand) {
      case 'list':
        listPacks();
        break;

      case 'install': {
        const source = args[1];
        if (!source) {
          console.log('  사용법: tenetx pack install <github-url|owner/repo|path>');
          console.log('  예시:');
          console.log('    tenetx pack install medistream/emr-pack');
          console.log('    tenetx pack install https://github.com/team/pack.git');
          console.log('    tenetx pack install ./local-pack');
          return;
        }
        const name = args.includes('--name') ? args[args.indexOf('--name') + 1] : undefined;
        console.log(`\n  팩 설치: ${source}\n`);
        const meta = await installPack(source, name);
        console.log(`\n  ✓ ${meta.name} v${meta.version} 설치 완료`);
        if (meta.provides) {
          const parts: string[] = [];
          if (meta.provides.rules) parts.push(`규칙 ${meta.provides.rules}`);
          if (meta.provides.solutions) parts.push(`솔루션 ${meta.provides.solutions}`);
          if (meta.provides.skills) parts.push(`스킬 ${meta.provides.skills}`);
          if (meta.provides.agents) parts.push(`에이전트 ${meta.provides.agents}`);
          if (meta.provides.workflows) parts.push(`워크플로우 ${meta.provides.workflows}`);
          if (meta.provides.atoms) parts.push(`아톰 ${meta.provides.atoms}`);
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
        console.log('\n  팩 동기화\n');
        if (packName) {
          await syncPack(packName);
        } else {
          await syncAllPacks();
        }
        console.log();
        break;
      }

      case 'init': {
        const name = args[1];
        if (!name) {
          console.log('  사용법: tenetx pack init <name> [--from-project] [--starter]');
          console.log('    --from-project    현재 프로젝트를 분석하여 AI 브리핑 생성');
          console.log('    --starter         예제 규칙/스킬/워크플로우 포함');
          return;
        }
        const fromProject = args.includes('--from-project') ? process.cwd() : undefined;
        const starter = args.includes('--starter');
        initPack(name, undefined, { fromProject, starter });
        console.log(`\n  ✓ 팩 '${name}' 생성 완료`);
        console.log(`  경로: ~/.compound/packs/${name}/`);
        if (fromProject) {
          console.log(`  _context.md 생성됨 — AI가 이 컨텍스트를 읽고 팩을 채울 수 있습니다.`);
        }
        if (starter) {
          console.log(`  스타터 템플릿 포함됨 — 팀에 맞게 수정하세요.`);
        }
        console.log(`\n  다음 단계:`);
        console.log(`    1. tenetx를 실행하고 "팩 채워줘"라고 말하면 AI가 도와줍니다.`);
        console.log(`    2. 또는 직접 ~/.compound/packs/${name}/ 파일을 편집하세요.\n`);
        break;
      }

      default:
        console.log('  사용법: tenetx pack <list|install|add|remove|connected|setup|lock|unlock|outdated|sync|init>');
        console.log('    list              설치된 팩 목록');
        console.log('    install <source>  팩 설치 (GitHub, 로컬)');
        console.log('    add <name>        프로젝트에 팩 연결 (--repo, --type)');
        console.log('    remove <name>     프로젝트에서 팩 연결 해제');
        console.log('    connected         현재 프로젝트에 연결된 팩 목록');
        console.log('    setup <source>    원클릭 셋업 (설치+연결+동기화+의존성 검사)');
        console.log('    lock              팩 버전 고정 (pack.lock 생성, git 커밋 가능)');
        console.log('    unlock            팩 버전 고정 해제');
        console.log('    outdated          업데이트 가능한 팩 확인');
        console.log('    sync [name]       팩 동기화 (전체 또는 지정)');
        console.log('    init <name>       새 팩 생성');
    }
  } catch (err) {
    console.error(`  ✗ ${(err as Error).message}\n`);
    process.exit(1);
  }
}

function handlePackAdd(args: string[]): void {
  const name = args[0];
  if (!name) {
    console.log('  사용법: tenetx pack add <name> [--repo <org/repo>] [--type <github|inline|local>] [--path <local-path>]');
    console.log('  예시:');
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
  console.log(`\n  ✓ 팩 '${name}' 연결 완료 (${type})`);
  if (repo) console.log(`  레포: ${repo}`);
  console.log(`  현재 연결된 팩: ${existing.length}개`);
  console.log();
}

function handlePackRemove(args: string[]): void {
  const name = args[0];
  if (!name) {
    console.log('  사용법: tenetx pack remove <name>');
    return;
  }

  const cwd = process.cwd();
  const removed = removePack(cwd, name);
  if (removed) {
    const remaining = loadPackConfigs(cwd);
    console.log(`\n  ✓ 팩 '${name}' 연결 해제 완료`);
    console.log(`  남은 팩: ${remaining.length}개`);
  } else {
    console.log(`\n  ✗ 팩 '${name}'이 연결되어 있지 않습니다.`);
    const packs = loadPackConfigs(cwd);
    if (packs.length > 0) {
      console.log('  연결된 팩:');
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

  console.log('\n  프로젝트 연결 팩\n');
  if (packs.length === 0) {
    console.log('  연결된 팩이 없습니다.');
    console.log('  tenetx pack add <name> --repo <org/repo> 로 연결하세요.\n');
    return;
  }

  for (const pack of packs) {
    const detail = pack.type === 'github' ? `(${pack.repo})` :
                   pack.type === 'local' ? `(${pack.localPath})` : '(inline)';
    const sync = pack.lastSync ? `sync: ${pack.lastSync.slice(0, 7)}` : 'sync: 없음';
    console.log(`  ■ ${pack.name} ${detail}`);
    console.log(`    ${pack.type} · ${sync}`);
  }
  console.log();
}

function handlePackLock(): void {
  const cwd = process.cwd();
  const { locked, skipped } = lockPacks(cwd);

  console.log('\n  팩 버전 고정\n');
  if (locked.length === 0) {
    console.log('  고정할 github 팩이 없습니다.');
    console.log('  (github 팩을 연결하고 sync한 후 실행하세요)\n');
    return;
  }

  for (const name of locked) {
    const lock = loadPackLock(cwd);
    const entry = lock?.packs[name];
    console.log(`  ✓ ${name} → ${entry?.resolved.slice(0, 7)}`);
  }
  if (skipped.length > 0) {
    console.log(`  ─ 건너뜀 (비-github): ${skipped.join(', ')}`);
  }

  const lockPath = packLockPath(cwd);
  console.log(`\n  pack.lock 생성됨: ${path.relative(cwd, lockPath)}`);
  console.log('  이 파일을 git에 커밋하면 팀 전체가 동일한 팩 버전을 사용합니다.');
  console.log('  업데이트: tenetx pack sync → tenetx pack lock\n');
}

function handlePackUnlock(): void {
  const cwd = process.cwd();
  const lockPath = packLockPath(cwd);

  if (!fs.existsSync(lockPath)) {
    console.log('\n  pack.lock이 없습니다. (이미 잠금 해제 상태)\n');
    return;
  }

  fs.unlinkSync(lockPath);
  console.log('\n  ✓ pack.lock 삭제됨 — 팩 자동 동기화가 재활성화됩니다.\n');
}

function handlePackOutdated(): void {
  const cwd = process.cwd();
  const lock = loadPackLock(cwd);

  console.log('\n  팩 업데이트 확인\n');

  if (!lock || Object.keys(lock.packs).length === 0) {
    console.log('  pack.lock이 없습니다. tenetx pack lock으로 먼저 고정하세요.\n');
    return;
  }

  const outdated = checkPackUpdates(cwd);

  if (outdated.length === 0) {
    console.log('  모든 팩이 최신 상태입니다.\n');
    return;
  }

  for (const o of outdated) {
    console.log(`  ⬆ ${o.name} (${o.repo})`);
    console.log(`    현재: ${o.locked} → 최신: ${o.latest}`);
  }
  console.log(`\n  업데이트: tenetx pack sync → tenetx pack lock\n`);
}

/** 원클릭 셋업: 설치 → 연결 → 동기화 → 의존성 검사 */
async function handlePackSetup(args: string[]): Promise<void> {
  const source = args[0];
  if (!source) {
    console.log('  사용법: tenetx pack setup <github-url|owner/repo|path>');
    console.log('  예시:');
    console.log('    tenetx pack setup medistream/emr-pack');
    console.log('    tenetx pack setup ./local-pack');
    console.log();
    console.log('  이 명령은 다음을 자동으로 수행합니다:');
    console.log('    1. 팩 설치 (없으면)');
    console.log('    2. 현재 프로젝트에 연결');
    console.log('    3. 동기화');
    console.log('    4. 의존성(requires) 검사');
    return;
  }

  const cwd = process.cwd();
  const nameArg = args.includes('--name') ? args[args.indexOf('--name') + 1] : undefined;

  // installPack과 동일한 디렉토리명 결정 로직
  const { extractPackName: extractName } = await import('./remote.js');
  const dirName = nameArg ?? extractName(source);

  // 1. 설치
  console.log('\n  ━━ 팩 원클릭 셋업 ━━\n');
  let packName: string = dirName;
  let meta;
  try {
    console.log('  [1/4] 팩 설치...');
    meta = await installPack(source, nameArg);
    packName = dirName; // 디렉토리명 기준 (meta.name과 다를 수 있음)
    console.log(`  ✓ ${meta.name} v${meta.version} 설치 완료`);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('이미 설치')) {
      meta = readPackMeta(path.join(PACKS_DIR, dirName)) ?? undefined;
      console.log(`  ✓ ${packName} 이미 설치됨 (동기화 진행)`);
      try { await syncPack(packName); } catch { /* ignore */ }
    } else {
      throw err;
    }
  }

  // 2. 프로젝트 연결
  console.log('  [2/4] 프로젝트에 연결...');
  const isGithub = source.includes('/');
  const pack: PackConnection = {
    type: isGithub ? 'github' : 'local',
    name: packName,
    repo: isGithub ? source : undefined,
  };
  addPack(cwd, pack);
  const connected = loadPackConfigs(cwd);
  console.log(`  ✓ 연결 완료 (총 ${connected.length}개 팩)`);

  // 3. 동기화
  console.log('  [3/4] 동기화...');
  try {
    await syncPack(packName);
    console.log('  ✓ 동기화 완료');
  } catch {
    console.log('  ─ 동기화 건너뜀 (로컬 팩)');
  }

  // 4. 의존성 검사
  console.log('  [4/4] 의존성 검사...');
  const packDir = path.join(PACKS_DIR, dirName);
  const packMeta = readPackMeta(packDir);
  if (packMeta?.requires) {
    const issues = checkRequirements(packMeta.requires);
    if (issues.length === 0) {
      console.log('  ✓ 모든 의존성 충족');
    } else {
      console.log(`  ⚠ 미충족 의존성 ${issues.length}건:`);
      for (const issue of issues) {
        console.log(`    ✗ ${issue}`);
      }
    }
  } else {
    console.log('  ✓ 추가 의존성 없음');
  }

  // 자산 요약
  if (meta?.provides || packMeta?.provides) {
    const p = meta?.provides ?? packMeta?.provides ?? {};
    const parts: string[] = [];
    if (p.rules) parts.push(`규칙 ${p.rules}`);
    if (p.solutions) parts.push(`솔루션 ${p.solutions}`);
    if (p.skills) parts.push(`스킬 ${p.skills}`);
    if (p.agents) parts.push(`에이전트 ${p.agents}`);
    if (p.workflows) parts.push(`워크플로우 ${p.workflows}`);
    if (parts.length > 0) {
      console.log(`\n  자산: ${parts.join(' · ')}`);
    }
  }

  console.log('\n  ✓ 셋업 완료! tenetx를 실행하면 팩이 자동 적용됩니다.\n');
}

/** 팩 requires 검사 */
function checkRequirements(requires: PackRequirement): string[] {
  const issues: string[] = [];

  function commandExists(cmd: string): boolean {
    try {
      const check = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
      execSync(check, { stdio: 'pipe' });
      return true;
    } catch { return false; }
  }

  // MCP 서버 체크
  if (requires.mcpServers) {
    for (const mcp of requires.mcpServers) {
      // settings.json에서 MCP 서버 등록 여부 확인
      const settingsPath = path.join(process.env.HOME ?? '', '.claude', 'settings.json');
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
        issues.push(`MCP 서버 '${mcp.name}' 미등록${hint ? ` — 설치: ${hint}` : ''}`);
      }
    }
  }

  // CLI 도구 체크
  if (requires.tools) {
    for (const tool of requires.tools) {
      if (!commandExists(tool.name)) {
        const hint = tool.installCmd ?? '';
        issues.push(`CLI 도구 '${tool.name}' 미설치${hint ? ` — 설치: ${hint}` : ''}`);
      }
    }
  }

  // 환경변수 체크
  if (requires.envVars) {
    for (const env of requires.envVars) {
      if (env.required !== false && !process.env[env.name]) {
        issues.push(`환경변수 '${env.name}' 미설정${env.description ? ` — ${env.description}` : ''}`);
      }
    }
  }

  return issues;
}

function listPacks(): void {
  const packs = listInstalledPacks();
  console.log('\n  설치된 팩 목록\n');

  if (packs.length === 0) {
    console.log('  팩이 없습니다. tenetx pack install <source>로 설치하세요.\n');
    return;
  }

  for (const { name, meta } of packs) {
    const version = meta?.version ?? '?';
    const remote = meta?.remote ? `(${meta.remote.type})` : '(local)';
    const p = meta?.provides;
    const parts: string[] = [];
    if (p?.rules) parts.push(`규칙 ${p.rules}`);
    if (p?.solutions) parts.push(`솔루션 ${p.solutions}`);
    if (p?.skills) parts.push(`스킬 ${p.skills}`);
    if (p?.agents) parts.push(`에이전트 ${p.agents}`);
    if (p?.workflows) parts.push(`워크플로우 ${p.workflows}`);
    console.log(`  ■ ${name} v${version} ${remote}`);
    console.log(`    ${parts.length > 0 ? parts.join(' · ') : '(자산 없음)'}`);
  }
  console.log();
}
