import {
  installPack,
  syncPack,
  syncAllPacks,
  initPack,
  listInstalledPacks,
} from './manager.js';

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
        console.log('  사용법: tenetx pack <list|install|sync|init>');
        console.log('    list              설치된 팩 목록');
        console.log('    install <source>  팩 설치 (GitHub, 로컬)');
        console.log('    sync [name]       팩 동기화 (전체 또는 지정)');
        console.log('    init <name>       새 팩 생성');
    }
  } catch (err) {
    console.error(`  ✗ ${(err as Error).message}\n`);
    process.exit(1);
  }
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
