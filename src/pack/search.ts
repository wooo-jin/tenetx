/**
 * Tenetx — Pack Search & Registry Browser
 *
 * GitHub 기반 중앙 레지스트리에서 팩을 검색하고 통계를 표시합니다.
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_REGISTRY_REPO = 'wooo-jin/tenetx-registry';

interface PackEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  source: string;
  provides: { rules: number; solutions: number; skills?: number; agents?: number };
  downloads?: number;
}

/** Load registry from GitHub or fall back to builtin */
function loadRegistry(registryRepo: string): PackEntry[] {
  try {
    const content = execSync(
      `gh api repos/${registryRepo}/contents/registry.json --jq .content`,
      { encoding: 'utf-8', timeout: 10000 },
    ).trim();
    const decoded = Buffer.from(content, 'base64').toString('utf-8');
    const registry = JSON.parse(decoded);
    return registry.packs ?? [];
  } catch {
    try {
      const builtinPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'packs', 'registry.json',
      );
      const content = fs.readFileSync(builtinPath, 'utf-8');
      return JSON.parse(content).packs ?? [];
    } catch {
      return [];
    }
  }
}

/** Format download count */
function formatDownloads(n: number | undefined): string {
  if (!n || n === 0) return 'new';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Search packs by query */
export function searchPacks(query: string, registryRepo?: string): void {
  const repo = registryRepo ?? DEFAULT_REGISTRY_REPO;
  const packs = loadRegistry(repo);

  if (packs.length === 0) {
    console.log('\n  No packs found in registry.\n');
    return;
  }

  const q = query.toLowerCase();
  const matches = packs.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.description.toLowerCase().includes(q) ||
    p.tags.some(t => t.toLowerCase().includes(q)),
  );

  if (matches.length === 0) {
    console.log(`\n  No packs matching "${query}".\n`);
    console.log(`  Total ${packs.length} packs in registry. Try a different query.\n`);
    return;
  }

  // Sort by downloads (highest first)
  matches.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));

  console.log(`\n  Found ${matches.length} pack(s) matching "${query}":\n`);
  for (const p of matches) {
    const dl = formatDownloads(p.downloads);
    const provides = [
      p.provides.rules ? `${p.provides.rules} rules` : '',
      p.provides.solutions ? `${p.provides.solutions} solutions` : '',
      p.provides.skills ? `${p.provides.skills} skills` : '',
      p.provides.agents ? `${p.provides.agents} agents` : '',
    ].filter(Boolean).join(', ');

    console.log(`  ${p.name} v${p.version} by @${p.author}  (${dl} downloads)`);
    console.log(`    ${p.description}`);
    console.log(`    [${p.tags.join(', ')}]  |  ${provides}`);
    console.log(`    tenetx pack install ${p.name}`);
    console.log();
  }
}

/** List all packs in registry sorted by downloads */
export function listRegistryPacks(registryRepo?: string): void {
  const repo = registryRepo ?? DEFAULT_REGISTRY_REPO;
  const packs = loadRegistry(repo);

  if (packs.length === 0) {
    console.log('\n  Registry is empty.\n');
    return;
  }

  // Sort by downloads
  packs.sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0));

  console.log(`\n  Tenetx Pack Registry (${packs.length} packs)\n`);
  console.log(`  ${'NAME'.padEnd(22)} ${'VER'.padEnd(8)} ${'DL'.padEnd(8)} ${'AUTHOR'.padEnd(15)} DESCRIPTION`);
  console.log(`  ${'─'.repeat(22)} ${'─'.repeat(8)} ${'─'.repeat(8)} ${'─'.repeat(15)} ${'─'.repeat(30)}`);

  for (const p of packs) {
    const dl = formatDownloads(p.downloads);
    console.log(`  ${p.name.padEnd(22)} ${p.version.padEnd(8)} ${dl.padEnd(8)} @${p.author.padEnd(14)} ${p.description.slice(0, 50)}`);
  }
  console.log();
}

/** Increment download count for a pack in the registry */
export function trackDownload(packName: string, registryRepo?: string): void {
  const repo = registryRepo ?? DEFAULT_REGISTRY_REPO;
  try {
    // Clone registry, increment, push
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-dl-'));
    execSync(`gh repo clone ${repo} "${tmpDir}/reg"`, { stdio: 'pipe', timeout: 15000 });

    const regPath = path.join(tmpDir, 'reg', 'registry.json');
    const registry = JSON.parse(fs.readFileSync(regPath, 'utf-8'));
    const pack = registry.packs.find((p: PackEntry) => p.name === packName);
    if (pack) {
      pack.downloads = (pack.downloads ?? 0) + 1;
      fs.writeFileSync(regPath, JSON.stringify(registry, null, 2) + '\n');
      execSync('git add -A', { cwd: path.join(tmpDir, 'reg'), stdio: 'pipe' });
      try {
        const safeName = packName.replace(/[^a-zA-Z0-9가-힣_-]/g, '');
        execSync(`git commit -m "stats: download ${safeName}"`, { cwd: path.join(tmpDir, 'reg'), stdio: 'pipe' });
        execSync('git push', { cwd: path.join(tmpDir, 'reg'), stdio: 'pipe', timeout: 15000 });
      } catch { /* no changes or push failed — non-blocking */ }
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* non-blocking — download tracking is best-effort */ }
}
