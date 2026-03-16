import * as fs from 'node:fs';
import { loadPhilosophyForProject, syncPhilosophy } from './philosophy-loader.js';
import { ME_PHILOSOPHY, projectPhilosophyPath } from './paths.js';

export async function handlePhilosophy(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'show';
  const cwd = process.cwd();

  if (subcommand === 'show') {
    const { philosophy, source } = loadPhilosophyForProject(cwd);
    const sourceLabel = source === 'project' ? '(프로젝트)' : source === 'global' ? '(글로벌)' : '(기본값)';
    console.log(`\n  Philosophy: ${philosophy.name} v${philosophy.version ?? '1.0.0'} ${sourceLabel}`);
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
          console.log(`    🪝 ${gen.hook}`);
        } else if (gen.step) {
          console.log(`    📋 ${gen.step}`);
        }
      }
      console.log();
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
      console.log(`  프로젝트별 철학을 만들려면: tenet setup --project`);
    }
    console.log(`  편집기로 열어주세요: $EDITOR <경로>`);
  } else {
    console.log('  사용법: tenet philosophy <show|edit|sync>');
    console.log('');
    console.log('  show          현재 철학 표시 (extends 시 병합 결과)');
    console.log('  edit          철학 파일 경로 안내');
    console.log('  sync          중앙 팩에서 최신 철학 동기화 (extends 필요)');
  }
}
