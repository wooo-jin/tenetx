import { loadPhilosophy } from './philosophy-loader.js';
import { ME_PHILOSOPHY } from './paths.js';

export async function handlePhilosophy(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'show';

  if (subcommand === 'show') {
    const philosophy = loadPhilosophy();
    console.log(`\n  Philosophy: ${philosophy.name} v${philosophy.version}`);
    console.log(`  Author: ${philosophy.author}`);
    if (philosophy.description) {
      console.log(`  Description: ${philosophy.description}`);
    }
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
        }
      }
      console.log();
    }
  } else if (subcommand === 'edit') {
    console.log(`  철학 파일 경로: ${ME_PHILOSOPHY}`);
    console.log(`  편집기로 열어주세요: $EDITOR ${ME_PHILOSOPHY}`);
  } else {
    console.log('  사용법: tenet philosophy <show|edit>');
  }
}
