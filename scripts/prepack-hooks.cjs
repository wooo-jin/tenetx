#!/usr/bin/env node
/**
 * prepack — regenerate hooks/hooks.json in a CLEAN environment before
 * `npm pack` / `npm publish`.
 *
 * Why this exists:
 *   `hooks/hooks.json` is gitignored (postinstall regenerates it
 *   per-user) but IS included in the npm tarball via package.json's
 *   `files:` field. If the publisher's local env has a conflicting
 *   Claude Code plugin installed (e.g. `oh-my-claudecode` or
 *   `superpowers`), their postinstall rewrites hooks.json with some
 *   hooks auto-disabled, and that tarball ships with a stale
 *   "17/19 active" hooks.json — every user who installs gets the
 *   broken version until they manually run regeneration.
 *
 *   This script fixes that by forcing `writeHooksJson` into a clean
 *   tmp-HOME env where `detectInstalledPlugins` finds nothing, so
 *   the shipped file is always the pristine full-hooks baseline.
 *
 * Runs automatically on `npm pack` / `npm publish` via the `prepack`
 * script in package.json. Safe to run manually.
 */

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  // Set HOME to a throwaway empty tmp dir so `detectInstalledPlugins`
  // can't find any plugin caches. Keep the original HOME restored in
  // `finally` so we don't leak state.
  const originalHome = process.env.HOME;
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-prepack-hooks-'));
  process.env.HOME = tmpHome;

  try {
    // Dist must exist (npm `prepare` runs the build before `prepack`
    // so this is the normal state during publish).
    const distHooksGenerator = path.resolve(__dirname, '..', 'dist', 'hooks', 'hooks-generator.js');
    if (!fs.existsSync(distHooksGenerator)) {
      console.error(`[tenetx prepack] ${distHooksGenerator} not found. Run 'npm run build' first.`);
      process.exit(1);
    }

    const { writeHooksJson } = await import(distHooksGenerator);
    const hooksDir = path.resolve(__dirname, '..', 'hooks');
    const result = writeHooksJson(hooksDir, { cwd: tmpHome });

    const hookRegistry = require(path.resolve(__dirname, '..', 'dist', 'hooks', 'hook-registry.js'));
    const expectedActive = hookRegistry.HOOK_REGISTRY.length;

    if (result.active !== expectedActive) {
      console.error(
        `[tenetx prepack] ERROR: generated hooks.json has ${result.active}/${expectedActive} active. ` +
        `This means the clean-env regeneration still found a plugin conflict, which should be impossible. ` +
        `Abort the publish and investigate HOME=${tmpHome}.`,
      );
      process.exit(1);
    }

    console.log(`[tenetx prepack] hooks/hooks.json regenerated in clean env (${result.active}/${expectedActive} active)`);
  } finally {
    process.env.HOME = originalHome;
    try { fs.rmSync(tmpHome, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

main().catch(err => {
  console.error(`[tenetx prepack] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
