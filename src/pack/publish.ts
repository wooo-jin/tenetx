/**
 * Tenetx — Pack Publish
 *
 * 팩을 wooo-jin/tenetx-registry에 직접 발행합니다.
 * 별도 레포 생성 없이, 중앙 레지스트리에 팩 디렉토리를 push합니다.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { PACKS_DIR } from '../core/paths.js';

const DEFAULT_REGISTRY_REPO = 'wooo-jin/tenetx-registry';

interface PublishOptions {
  registryRepo?: string;
  dryRun?: boolean;
}

/** Check if gh CLI is available */
function hasGhCli(): boolean {
  try {
    execSync('gh --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch { return false; }
}

/** Get current GitHub user */
function getGitHubUser(): string {
  try {
    return execSync('gh api user --jq .login', { encoding: 'utf-8', timeout: 10000 }).trim();
  } catch { return 'unknown'; }
}

/** Count .md files in a directory */
function countFiles(dir: string, ext = '.md'): number {
  if (!fs.existsSync(dir)) return 0;
  try { return fs.readdirSync(dir).filter(f => f.endsWith(ext)).length; } catch { return 0; }
}

/** Copy directory contents recursively */
function copyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry);
    const destPath = path.join(dest, entry);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/** Publish a pack directly to the central tenetx-registry */
export async function publishPack(packName: string, options: PublishOptions = {}): Promise<void> {
  if (!hasGhCli()) {
    console.log('\n  ✗ GitHub CLI (gh) is required for publishing.');
    console.log('  Install: https://cli.github.com/\n');
    return;
  }

  const author = getGitHubUser();
  const registryRepo = options.registryRepo ?? DEFAULT_REGISTRY_REPO;

  // 1. Find the pack
  const packDir = path.join(PACKS_DIR, packName);
  if (!fs.existsSync(packDir)) {
    console.log(`\n  ✗ Pack "${packName}" not found at ${packDir}`);
    console.log('  Create a pack first: tenetx pack init <name>\n');
    return;
  }

  // 2. Count contents
  const counts = {
    rules: countFiles(path.join(packDir, 'rules')),
    solutions: countFiles(path.join(packDir, 'solutions')),
    skills: countFiles(path.join(packDir, 'skills')),
    agents: countFiles(path.join(packDir, 'agents')),
    workflows: countFiles(path.join(packDir, 'workflows'), '.json'),
  };

  const total = counts.rules + counts.solutions + counts.skills + counts.agents + counts.workflows;
  if (total === 0) {
    console.log(`\n  ✗ Pack "${packName}" is empty.\n`);
    return;
  }

  // 3. Read or create pack.json
  const packJsonPath = path.join(packDir, 'pack.json');
  let packMeta: Record<string, unknown> = {};
  if (fs.existsSync(packJsonPath)) {
    try { packMeta = JSON.parse(fs.readFileSync(packJsonPath, 'utf-8')); } catch { /* pack.json parse failure — packMeta stays empty, defaults used for description/version */ }
  }

  const description = (packMeta.description as string) ?? `${packName} — tenetx pack by @${author}`;
  const version = (packMeta.version as string) ?? '1.0.0';
  const tags = (packMeta.tags as string[]) ?? [];

  console.log(`\n  Pack: ${packName}`);
  console.log(`  Author: @${author}`);
  console.log(`  Contents: ${counts.rules}R ${counts.solutions}S ${counts.skills}Sk ${counts.agents}A ${counts.workflows}W`);
  console.log(`  Description: ${description}`);

  if (options.dryRun) {
    console.log('\n  [Dry run] Would publish to registry. No changes made.\n');
    return;
  }

  // 4. Clone registry, add pack, push
  console.log(`\n  Publishing to ${registryRepo}...\n`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-publish-'));
  try {
    execSync(`gh repo clone ${registryRepo} "${tmpDir}/registry"`, {
      encoding: 'utf-8', timeout: 30000, stdio: 'pipe',
    });

    const registryDir = path.join(tmpDir, 'registry');
    const destPackDir = path.join(registryDir, 'packs', packName);

    // Copy pack contents to registry
    if (fs.existsSync(destPackDir)) {
      fs.rmSync(destPackDir, { recursive: true, force: true });
    }
    copyDir(packDir, destPackDir);

    // Ensure pack.json exists in the published pack
    const destPackJson = path.join(destPackDir, 'pack.json');
    if (!fs.existsSync(destPackJson)) {
      fs.writeFileSync(destPackJson, JSON.stringify({
        name: packName, version, description, author, tags,
        provides: counts,
      }, null, 2));
    }

    // Update registry.json
    const registryJsonPath = path.join(registryDir, 'registry.json');
    let registry: { version: number; updated: string; packs: Array<Record<string, unknown>>; [k: string]: unknown } = {
      version: 1, updated: '', packs: [],
    };
    try {
      registry = JSON.parse(fs.readFileSync(registryJsonPath, 'utf-8'));
    } catch { /* use default */ }

    const entry = {
      name: packName, version, description, author, tags,
      source: 'registry',
      provides: counts,
    };

    const existingIdx = registry.packs.findIndex((p) => p.name === packName);
    if (existingIdx >= 0) {
      registry.packs[existingIdx] = entry;
      console.log(`  Updating existing pack: ${packName}`);
    } else {
      registry.packs.push(entry);
      console.log(`  Adding new pack: ${packName}`);
    }
    registry.updated = new Date().toISOString().split('T')[0];

    fs.writeFileSync(registryJsonPath, `${JSON.stringify(registry, null, 2)}\n`);

    // Commit and push
    execSync('git add -A', { cwd: registryDir, stdio: 'pipe' });
    try {
      execSync(
        `git commit -m "feat: publish pack ${packName} by @${author}"`,
        { cwd: registryDir, stdio: 'pipe' },
      );
      execSync('git push', { cwd: registryDir, stdio: 'pipe', timeout: 30000 });
      console.log(`\n  ✓ Published! "${packName}" is now available in the registry.`);
      console.log(`  Install: tenetx pack install ${packName}\n`);
    } catch {
      console.log('  (no changes to push — pack may already be up to date)\n');
    }
  } catch (e) {
    console.log(`  ✗ Publish failed: ${(e as Error).message}`);
    console.log(`  Make sure you have push access to ${registryRepo}\n`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
