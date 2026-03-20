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
        console.log(`    🪝 ${gen.hook} (not implemented)`);
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
    const sourceLabel = source === 'project' ? 'Project' : source === 'global' ? 'Global' : 'Default';

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
              printPhilosophy(packPhil, `pack:${pack.name}`);
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
      console.log(`  Principles: ${Object.keys(result.philosophy.principles).length} (base + override merged)`);
      console.log(`  extends: ${result.philosophy.extends}\n`);
    } else {
      console.log(`\n  ${result.message}`);
      if (!result.philosophy.extends) {
        console.log('  To use central management, add "extends": "pack:<name>" to philosophy.json');
      }
      console.log();
    }
  } else if (subcommand === 'edit') {
    const projectPath = projectPhilosophyPath(cwd);
    const hasProject = fs.existsSync(projectPath);
    if (hasProject) {
      console.log(`  Project philosophy: ${projectPath}`);
    } else {
      console.log(`  Global philosophy: ${ME_PHILOSOPHY}`);
      console.log(`  To create a project-specific philosophy: tenetx setup --project`);
    }
    console.log(`  Open with your editor: $EDITOR <path>`);
  } else {
    console.log('  Usage: tenetx philosophy <show|edit|sync>');
    console.log('');
    console.log('  show          Show current philosophy (merged result if extends)');
    console.log('  edit          Show philosophy file path');
    console.log('  sync          Sync latest philosophy from central pack (requires extends)');
  }
}
