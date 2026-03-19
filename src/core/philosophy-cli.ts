import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPhilosophyForProject, syncPhilosophy } from './philosophy-loader.js';
import { ME_PHILOSOPHY, projectPhilosophyPath, PACKS_DIR } from './paths.js';
import { loadPackConfigs } from './pack-config.js';

function printPhilosophy(philosophy: ReturnType<typeof loadPhilosophyForProject>['philosophy'], label: string): void {
  console.log(`  ── ${label}: ${philosophy.name} v${philosophy.version ?? '1.0.0'} ──`);
  if (philosophy.author) console.log(`  Author: ${philosophy.author}`);
  if (philosophy.description) console.log(`  Description: ${philosophy.description}`);
  console.log();

  for (const [name, principle] of Object.entries(philosophy.principles)) {
    console.log(`  ■ ${name}`);
    console.log(`    "${principle.belief}"`);
    for (const gen of principle.generates) {
      if (typeof gen === 'string') {
        console.log(`    → ${gen}`);
      } else if (gen.alert) {
        console.log(`    ⚠ ${gen.alert}`);
      } else if (gen.routing) {
        console.log(`    🔀 ${gen.routing}`);
      } else if (gen.hook) {
        console.log(`    🪝 ${gen.hook} (미구현)`);
      } else if (gen.step) {
        console.log(`    📋 ${gen.step}`);
      }
    }
    console.log();
  }
}

export async function handlePhilosophy(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'show';
  const cwd = process.cwd();

  if (subcommand === 'show') {
    const { philosophy, source } = loadPhilosophyForProject(cwd);
    const sourceLabel = source === 'project' ? '프로젝트' : source === 'global' ? '글로벌' : '기본값';

    console.log();
    printPhilosophy(philosophy, sourceLabel);

    // 연결된 팩의 철학도 표시
    const packs = loadPackConfigs(cwd);
    for (const pack of packs) {
      const candidates = [
        path.join(PACKS_DIR, pack.name, 'philosophy.json'),
        path.join(cwd, '.compound', 'packs', pack.name, 'philosophy.json'),
      ];
      if (pack.type === 'local' && pack.localPath) {
        candidates.push(path.join(pack.localPath, 'philosophy.json'));
      }

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          try {
            const packPhil = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
            if (packPhil.principles && Object.keys(packPhil.principles).length > 0) {
              printPhilosophy(packPhil, `팩:${pack.name}`);
            }
          } catch { /* skip malformed */ }
          break;
        }
      }
    }
  } else if (subcommand === 'sync') {
    const result = syncPhilosophy(cwd);
    if (result.updated) {
      console.log(`\n  ✓ ${result.message}`);
      console.log(`  원칙 ${Object.keys(result.philosophy.principles).length}개 (베이스 + 오버라이드 병합)`);
      console.log(`  extends: ${result.philosophy.extends}\n`);
    } else {
      console.log(`\n  ${result.message}`);
      if (!result.philosophy.extends) {
        console.log('  중앙 관리를 사용하려면 philosophy.json에 "extends": "pack:<name>" 추가');
      }
      console.log();
    }
  } else if (subcommand === 'edit') {
    const projectPath = projectPhilosophyPath(cwd);
    const hasProject = fs.existsSync(projectPath);
    if (hasProject) {
      console.log(`  프로젝트 철학: ${projectPath}`);
    } else {
      console.log(`  글로벌 철학: ${ME_PHILOSOPHY}`);
      console.log(`  프로젝트별 철학을 만들려면: tenetx setup --project`);
    }
    console.log(`  편집기로 열어주세요: $EDITOR <경로>`);
  } else {
    console.log('  사용법: tenetx philosophy <show|edit|sync>');
    console.log('');
    console.log('  show          현재 철학 표시 (extends 시 병합 결과)');
    console.log('  edit          철학 파일 경로 안내');
    console.log('  sync          중앙 팩에서 최신 철학 동기화 (extends 필요)');
  }
}
