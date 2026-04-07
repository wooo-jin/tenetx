/**
 * Tenetx — config hooks display
 *
 * `tenetx config hooks` 명령 구현.
 * 훅 상태, 감지된 플러그인, 컨텍스트 버짓을 ANSI 컬러로 출력합니다.
 */

import * as path from 'node:path';
import { HOOK_REGISTRY, type HookTier } from '../hooks/hook-registry.js';
import { TENETX_HOME } from './paths.js';
import { detectInstalledPlugins } from './plugin-detector.js';
import { isHookEnabled } from '../hooks/hook-config.js';
import { calculateBudget } from '../hooks/shared/context-budget.js';
import { INJECTION_CAPS } from '../hooks/shared/injection-caps.js';
import { getHookConflicts } from './plugin-detector.js';

// ── ANSI helpers ──

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function green(s: string)  { return `${GREEN}${s}${RESET}`; }
function red(s: string)    { return `${RED}${s}${RESET}`; }
function yellow(s: string) { return `${YELLOW}${s}${RESET}`; }
function dim(s: string)    { return `${DIM}${s}${RESET}`; }
function bold(s: string)   { return `${BOLD}${s}${RESET}`; }

// ── 표시 로직 ──

const TIER_ORDER: HookTier[] = ['compound-core', 'safety', 'workflow'];

const TIER_LABELS: Record<HookTier, string> = {
  'compound-core': 'compound-core (always active)',
  'safety': 'safety',
  'workflow': 'workflow',
};

/**
 * 훅 상태와 플러그인 감지 결과를 출력합니다.
 */
export async function displayHookStatus(cwd?: string): Promise<void> {
  const plugins      = detectInstalledPlugins(cwd);
  const budget       = calculateBudget(cwd);
  const hookConflicts = getHookConflicts(cwd);

  console.log();
  console.log(bold('  Tenetx — Hook Configuration'));
  console.log();

  // ── 감지된 플러그인 ──
  if (plugins.length > 0) {
    console.log('  Detected plugins:');
    for (const p of plugins) {
      const skillCount = p.overlappingSkills.length;
      const detail = skillCount > 0 ? `(${skillCount} overlapping skills)` : '';
      console.log(`    ${green('●')} ${p.name.padEnd(20)} ${dim(detail)}`);
    }
    console.log();
  }

  // ── 훅 상태 ──
  // 전체 활성 수 계산
  let activeCount = 0;
  for (const h of HOOK_REGISTRY) {
    if (isEffectivelyEnabled(h.name, h.tier, hookConflicts, plugins.length > 0)) activeCount++;
  }
  console.log(`  Hook Status (${activeCount}/${HOOK_REGISTRY.length} active):`);

  for (const tier of TIER_ORDER) {
    const tierHooks = HOOK_REGISTRY.filter(h => h.tier === tier);
    if (tierHooks.length === 0) continue;

    // workflow 티어가 자동 비활성화되었는지 확인
    const tierAutoDisabled =
      tier === 'workflow' &&
      plugins.length > 0 &&
      tierHooks.some(h => hookConflicts.has(h.name));

    const tierLabel = tierAutoDisabled
      ? `${TIER_LABELS[tier]} ${yellow(`(auto-disabled — ${getConflictingPluginName(hookConflicts)} detected)`)}`
      : TIER_LABELS[tier];

    console.log(`    ${dim(tierLabel)}:`);

    for (const hook of tierHooks) {
      const enabled = isEffectivelyEnabled(hook.name, hook.tier, hookConflicts, plugins.length > 0);
      const mark    = enabled ? green('✓') : red('✗');
      const nameCol = hook.name.padEnd(26);
      const eventCol = hook.event.padEnd(20);
      const timeoutStr = dim(`${hook.timeout}s`);
      console.log(`      ${mark} ${nameCol} ${dim(eventCol)} ${timeoutStr}`);
    }

    console.log();
  }

  // ── 컨텍스트 버짓 ──
  console.log('  Context Budget:');
  const factorStr = budget.otherPluginsDetected
    ? `${budget.factor} ${yellow('(reduced — other plugins detected)')}`
    : `${budget.factor}`;
  console.log(`    Factor: ${factorStr}`);
  console.log(`    Solution injection: ${budget.solutionSessionMax} chars/session ${dim(`(default: ${INJECTION_CAPS.solutionSessionMax})`)}`);
  console.log(`    Notepad cap:        ${budget.notepadMax} chars ${dim(`(default: ${INJECTION_CAPS.notepadMax})`)}`);
  console.log();

  // ── 경로 ──
  const hooksJson = path.join(process.cwd(), 'hooks', 'hooks.json');
  const configPath = path.join(TENETX_HOME, 'hook-config.json');
  console.log(`  hooks.json: ${dim(hooksJson)} ${dim('(auto-generated)')}`);
  console.log(`  Config:     ${dim(configPath)}`);
  console.log();
}

/** 충돌 맵에서 첫 번째 플러그인 이름 반환 */
function getConflictingPluginName(conflicts: Map<string, string>): string {
  const first = conflicts.values().next();
  return first.done ? 'plugin' : first.value;
}

/** 실효 활성 여부 (plugin 감지 + tier + hook-config 모두 반영) */
function isEffectivelyEnabled(
  name: string,
  tier: HookTier,
  hookConflicts: Map<string, string>,
  hasPlugins: boolean,
): boolean {
  if (!isHookEnabled(name)) return false;
  if (hasPlugins && tier === 'workflow' && hookConflicts.has(name)) return false;
  return true;
}
