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
  type PackConnection,
  type PackType,
} from '../core/pack-config.js';

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
          if (meta.provides.solutions) parts.push(`솔루션 ${meta.provides.solutions}`);
          if (meta.provides.rules) parts.push(`규칙 ${meta.provides.rules}`);
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
          console.log('  사용법: tenetx pack init <name>');
          return;
        }
        initPack(name);
        console.log(`\n  ✓ 팩 '${name}' 생성 완료`);
        console.log(`  경로: ~/.compound/packs/${name}/\n`);
        break;
      }

      default:
        console.log('  사용법: tenetx pack <list|install|add|remove|connected|sync|init>');
        console.log('    list              설치된 팩 목록');
        console.log('    install <source>  팩 설치 (GitHub, 로컬)');
        console.log('    add <name>        프로젝트에 팩 연결 (--repo, --type)');
        console.log('    remove <name>     프로젝트에서 팩 연결 해제');
        console.log('    connected         현재 프로젝트에 연결된 팩 목록');
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
    const solutions = meta?.provides?.solutions ?? 0;
    const rules = meta?.provides?.rules ?? 0;
    console.log(`  ■ ${name} v${version} ${remote}`);
    console.log(`    솔루션 ${solutions} · 규칙 ${rules}`);
  }
  console.log();
}
