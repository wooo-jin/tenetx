import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as readline from 'node:readline';
import {
  SETTINGS_PATH,
  acquireLock,
  releaseLock,
  atomicWriteFileSync,
} from './settings-lock.js';
/** 플러그인 제거 (plugin-installer.ts 삭제 후 인라인) */
function uninstallPlugin(): boolean {
  const pluginDir = path.join(os.homedir(), '.claude', 'plugins', 'tenetx');
  try {
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (Array.isArray(settings.plugins)) {
        settings.plugins = (settings.plugins as string[]).filter(p => !p.includes('tenetx'));
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    }
    return true;
  } catch {
    return false;
  }
}

/** 플러그인 관련 아티팩트 정리 */
function cleanPluginArtifacts(): void {
  const claudeDir = path.join(os.homedir(), '.claude');
  const pluginsDir = path.join(claudeDir, 'plugins');

  // 1. ~/.claude/plugins/cache/tenetx-local/ 삭제
  try {
    const cacheDir = path.join(pluginsDir, 'cache', 'tenetx-local');
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
      console.log('  ✓ Removed plugin cache (~/.claude/plugins/cache/tenetx-local/)');
    }
  } catch (e) {
    console.error('  ✗ Failed to remove plugin cache:', e instanceof Error ? e.message : String(e));
  }

  // 2. ~/.claude/plugins/installed_plugins.json에서 tenetx@tenetx-local 제거
  try {
    const installedPluginsPath = path.join(pluginsDir, 'installed_plugins.json');
    if (fs.existsSync(installedPluginsPath)) {
      const data = JSON.parse(fs.readFileSync(installedPluginsPath, 'utf-8'));
      if (data.plugins && 'tenetx@tenetx-local' in data.plugins) {
        delete data.plugins['tenetx@tenetx-local'];
        fs.writeFileSync(installedPluginsPath, JSON.stringify(data, null, 2));
        console.log('  ✓ Removed tenetx@tenetx-local from installed_plugins.json');
      }
    }
  } catch (e) {
    console.error('  ✗ Failed to update installed_plugins.json:', e instanceof Error ? e.message : String(e));
  }

  // 3. ~/.claude/plugins/tenetx/ 삭제 (plugin-installer 경로)
  try {
    const removed = uninstallPlugin();
    if (removed) {
      console.log('  ✓ Removed plugin directory (~/.claude/plugins/tenetx/)');
    }
  } catch (e) {
    console.error('  ✗ Failed to remove plugin directory:', e instanceof Error ? e.message : String(e));
  }
}

/** ~/.claude/commands/tenetx/ 슬래시 명령 파일 제거 */
function cleanSlashCommands(): void {
  const commandsDir = path.join(os.homedir(), '.claude', 'commands', 'tenetx');
  if (!fs.existsSync(commandsDir)) {
    console.log('  - No slash command directory found');
    return;
  }

  let removed = 0;
  for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.md'))) {
    const filePath = path.join(commandsDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('<!-- tenetx-managed -->')) {
      fs.unlinkSync(filePath);
      removed++;
    }
  }

  // 디렉토리가 비었으면 삭제
  try {
    const remaining = fs.readdirSync(commandsDir);
    if (remaining.length === 0) {
      fs.rmdirSync(commandsDir);
    }
  } catch { /* ignore */ }

  if (removed > 0) {
    console.log(`  ✓ Removed ${removed} slash command(s) (~/.claude/commands/tenetx/)`);
  } else {
    console.log('  - No tenetx-managed slash commands found');
  }
}

/** 사용자에게 y/n 확인 */
function confirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/** settings.json에서 CH 관련 항목 제거 */
function cleanSettings(): void {
  if (!fs.existsSync(SETTINGS_PATH)) return;

  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    console.error('[tenetx] Failed to parse settings.json — skipping.');
    return;
  }

  // env에서 COMPOUND_ 접두어 키 제거
  const env = settings.env as Record<string, string> | undefined;
  if (env) {
    for (const key of Object.keys(env)) {
      if (key.startsWith('COMPOUND_')) delete env[key];
    }
    if (Object.keys(env).length === 0) {
      delete settings.env;
    }
  }

  // hooks에서 tenetx 관련 엔트리 제거
  const hookMarkers = ['tenetx', 'compound-harness'];
  function isCHCommand(cmd: string): boolean {
    return hookMarkers.some(m => cmd.includes(m));
  }
  function isCHHookEntry(entry: Record<string, unknown>): boolean {
    // 직접 형식: { type, command }
    if (typeof entry.command === 'string' && isCHCommand(entry.command)) return true;
    // 래핑 형식: { matcher, hooks: [{ command }] }
    const innerHooks = entry.hooks as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(innerHooks)) {
      return innerHooks.some(h => typeof h.command === 'string' && isCHCommand(h.command));
    }
    return false;
  }

  const hooks = settings.hooks as Record<string, unknown[]> | undefined;
  if (hooks) {
    for (const [hookType, entries] of Object.entries(hooks)) {
      if (!Array.isArray(entries)) continue;
      const filtered = entries.filter(
        (h) => !isCHHookEntry(h as Record<string, unknown>)
      );
      if (filtered.length === 0) {
        delete hooks[hookType];
      } else {
        hooks[hookType] = filtered;
      }
    }
    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    }
  }

  // statusLine이 tenetx status면 제거
  const statusLine = settings.statusLine as Record<string, unknown> | undefined;
  if (statusLine?.command === 'tenetx status') {
    delete settings.statusLine;
  }

  // enabledPlugins에서 tenetx@tenetx-local 제거
  const enabledPlugins = settings.enabledPlugins as Record<string, unknown> | undefined;
  if (enabledPlugins && 'tenetx@tenetx-local' in enabledPlugins) {
    delete enabledPlugins['tenetx@tenetx-local'];
    if (Object.keys(enabledPlugins).length === 0) {
      delete settings.enabledPlugins;
    }
  }

  // mcpServers에서 tenetx-compound 제거
  const mcpServers = settings.mcpServers as Record<string, unknown> | undefined;
  if (mcpServers && 'tenetx-compound' in mcpServers) {
    delete mcpServers['tenetx-compound'];
    if (Object.keys(mcpServers).length === 0) {
      delete settings.mcpServers;
    }
  }

  acquireLock();
  try {
    atomicWriteFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } finally {
    releaseLock();
  }
  console.log('  ✓ Removed CH entries from settings.json');
}

/** 프로젝트 .claude/agents/ch-*.md 삭제 (커스터마이즈된 파일은 보호) */
function cleanAgents(cwd: string): void {
  const agentsDir = path.join(cwd, '.claude', 'agents');
  if (!fs.existsSync(agentsDir)) return;

  let removed = 0;
  let preserved = 0;
  for (const file of fs.readdirSync(agentsDir)) {
    if (file.startsWith('ch-') && file.endsWith('.md')) {
      const filePath = path.join(agentsDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      if (!content.includes('<!-- tenetx-managed -->')) {
        // 사용자가 커스터마이즈한 파일 → 보존
        preserved++;
        continue;
      }
      fs.unlinkSync(filePath);
      removed++;
    }
  }

  if (removed > 0) {
    console.log(`  ✓ Removed ${removed} agent file(s) (.claude/agents/ch-*.md)`);
  }
  if (preserved > 0) {
    console.log(`  ⚠ Preserved ${preserved} customized agent file(s) (manual deletion required)`);
  }
  if (removed === 0 && preserved === 0) {
    console.log('  - No agent files found');
  }
}

/** .claude/rules/ 의 tenetx 규칙 파일 및 레거시 compound-rules.md 제거 */
function cleanCompoundRules(cwd: string): void {
  const ruleFiles = [
    'security.md',
    'golden-principles.md',
    'anti-pattern.md',
    'routing.md',
    'compound.md',
  ];
  const rulesDir = path.join(cwd, '.claude', 'rules');
  let removedCount = 0;

  for (const file of ruleFiles) {
    const p = path.join(rulesDir, file);
    if (fs.existsSync(p)) {
      fs.unlinkSync(p);
      removedCount++;
    }
  }

  // 레거시 경로
  const legacyPath = path.join(cwd, '.claude', 'compound-rules.md');
  if (fs.existsSync(legacyPath)) {
    fs.unlinkSync(legacyPath);
    removedCount++;
  }

  if (removedCount > 0) {
    console.log(`  ✓ Removed ${removedCount} rule file(s)`);
  } else {
    console.log('  - No rule files found');
  }
}

/** CLAUDE.md에서 tenetx 블록 제거 */
function cleanClaudeMd(cwd: string): void {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return;

  const content = fs.readFileSync(claudeMdPath, 'utf-8');
  const marker = '<!-- tenetx:start -->';
  const endMarker = '<!-- tenetx:end -->';

  if (!content.includes(marker)) {
    console.log('  - No CH block found in CLAUDE.md');
    return;
  }

  const regex = new RegExp(`\\n?${marker}[\\s\\S]*?${endMarker}\\n?`, 'g');
  const cleaned = content.replace(regex, '\n');
  fs.writeFileSync(claudeMdPath, `${cleaned.replace(/\n{3,}/g, '\n\n').trim()}\n`);
  console.log('  ✓ Removed CH block from CLAUDE.md');
}

/** tenetx uninstall 메인 */
export async function handleUninstall(cwd: string, options: { force?: boolean }): Promise<void> {
  console.log('\n[tenetx] Uninstalling Tenetx\n');
  console.log('The following items will be cleaned up:');
  console.log('  1. Remove CH env vars/hooks/statusLine/enabledPlugins from ~/.claude/settings.json');
  console.log('  2. Delete .claude/agents/ch-*.md agent files');
  console.log('  3. Delete .claude/rules/ rule files (security, golden-principles, anti-pattern, routing, compound)');
  console.log('  4. Remove tenetx block from CLAUDE.md');
  console.log('  5. Remove slash commands (~/.claude/commands/tenetx/)');
  console.log('  6. Remove plugin artifacts (cache, installed_plugins.json, plugin directory)');
  console.log('');
  console.log('Note: ~/.compound/ directory is preserved (manual deletion: rm -rf ~/.compound)\n');

  if (!options.force) {
    if (!process.stdin.isTTY) {
      console.error('[tenetx] Use --force flag in non-interactive environments.');
      process.exit(1);
    }
    const ok = await confirm('Do you want to continue?');
    if (!ok) {
      console.log('Cancelled.');
      return;
    }
    console.log('');
  }

  cleanSettings();
  cleanAgents(cwd);
  cleanCompoundRules(cwd);
  cleanClaudeMd(cwd);
  cleanSlashCommands();
  cleanPluginArtifacts();

  console.log('\n[tenetx] Uninstall complete. Restart Claude Code for a clean state.\n');
}
