/**
 * Tenetx — Platform CLI
 *
 * `tenetx init <platform>` — Initialize tenetx for a platform
 * `tenetx sync <platform>` — Sync solutions to a platform
 */

import type { Platform } from './adapter.js';

const SUPPORTED_PLATFORMS: Platform[] = ['codex', 'gemini', 'opencode', 'copilot'];

export async function handlePlatformInit(args: string[]): Promise<void> {
  const platform = args[0] as Platform;

  if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
    console.log('\n  Usage: tenetx init <platform>');
    console.log('  Supported platforms: ' + SUPPORTED_PLATFORMS.join(', '));
    console.log('\n  Examples:');
    console.log('    tenetx init codex       # Initialize for Codex CLI');
    console.log('    tenetx init gemini      # Initialize for Gemini CLI');
    console.log('    tenetx init opencode    # Initialize for OpenCode');
    console.log('    tenetx init copilot     # Initialize for Copilot CLI\n');
    return;
  }

  const cwd = process.cwd();
  console.log(`\n  Initializing tenetx for ${platform}...\n`);

  switch (platform) {
    case 'codex': {
      const { initCodex } = await import('./codex.js');
      const result = initCodex(cwd);
      console.log(`  ✓ Created/updated ${result.files.length} files:`);
      for (const f of result.files) console.log(`    ${f}`);
      console.log('\n  Run Codex with: codex -c features.codex_hooks=true');
      break;
    }
    case 'gemini': {
      const { initGemini } = await import('./gemini.js');
      const result = initGemini(cwd);
      console.log(`  ✓ Created/updated ${result.files.length} files:`);
      for (const f of result.files) console.log(`    ${f}`);
      break;
    }
    case 'opencode': {
      const { initOpenCode } = await import('./opencode.js');
      const result = initOpenCode(cwd);
      console.log(`  ✓ Created/updated ${result.files.length} files:`);
      for (const f of result.files) console.log(`    ${f}`);
      break;
    }
    case 'copilot': {
      const { initCopilot } = await import('./copilot.js');
      const result = initCopilot(cwd);
      console.log(`  ✓ Created/updated ${result.files.length} files:`);
      for (const f of result.files) console.log(`    ${f}`);
      break;
    }
  }
  console.log();
}

export async function handlePlatformSync(args: string[]): Promise<void> {
  const platform = args[0] as Platform;
  const quiet = args.includes('--quiet');

  if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
    console.log('\n  Usage: tenetx sync <platform> [--quiet]');
    console.log('  Supported: ' + SUPPORTED_PLATFORMS.join(', ') + '\n');
    return;
  }

  const cwd = process.cwd();

  switch (platform) {
    case 'codex': {
      const { syncCodex } = await import('./codex.js');
      syncCodex(cwd, quiet);
      break;
    }
    case 'gemini': {
      const { syncGemini } = await import('./gemini.js');
      syncGemini(cwd, quiet);
      break;
    }
    case 'opencode': {
      const { syncOpenCode } = await import('./opencode.js');
      syncOpenCode(cwd, quiet);
      break;
    }
    case 'copilot': {
      const { syncCopilot } = await import('./copilot.js');
      syncCopilot(cwd, quiet);
      break;
    }
  }
}
