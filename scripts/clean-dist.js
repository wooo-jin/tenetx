#!/usr/bin/env node
/**
 * Cross-platform dist/ cleanup + chmod.
 * Usage:
 *   node scripts/clean-dist.js clean   — rm -rf dist
 *   node scripts/clean-dist.js chmod   — chmod +x bin entries
 */
const fs = require('fs');
const cmd = process.argv[2];

if (cmd === 'clean') {
  fs.rmSync('dist', { recursive: true, force: true });
} else if (cmd === 'chmod') {
  for (const f of ['dist/cli.js', 'dist/txd.js', 'dist/mcp/server.js']) {
    try { fs.chmodSync(f, 0o755); } catch { /* Windows — no-op */ }
  }
}
