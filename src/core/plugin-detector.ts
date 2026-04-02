/**
 * Tenetx — Plugin Detector
 *
 * 다른 Claude Code 플러그인이 설치되어 있는지 감지하고,
 * tenetx와 기능이 중복되는 스킬/훅 목록을 반환합니다.
 *
 * 감지 방법:
 *   1. ~/.claude/plugins/ 디렉토리에서 설치된 플러그인 스캔
 *   2. 알려진 플러그인의 파일 시그니처 (.omc/, .claude-mem/ 등) 확인
 *   3. 결과를 ~/.compound/state/detected-plugins.json에 캐시 (1시간 TTL)
 *
 * 설계 결정:
 *   - 감지는 읽기 전용 — 다른 플러그인의 파일을 수정하지 않음
 *   - 실패 시 빈 배열 반환 (failure-tolerant) — 감지 실패 = 충돌 없음으로 간주
 *   - 캐시 TTL 1시간 — 플러그인 설치/제거 빈도가 낮으므로 충분
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { STATE_DIR } from './paths.js';

// ── 타입 ──

export interface DetectedPlugin {
  name: string;
  /** 이 플러그인과 중복되는 tenetx 스킬 이름 */
  overlappingSkills: string[];
  /** 이 플러그인과 중복되는 tenetx 훅 이름 */
  overlappingHooks: string[];
  /** 감지 방법 (디버깅용) */
  detectedBy: 'plugin-dir' | 'signature' | 'both';
}

interface PluginCacheData {
  plugins: DetectedPlugin[];
  timestamp: string;
  /** 감지 시 사용된 cwd (다른 프로젝트에서 캐시 오염 방지) */
  cwd?: string;
}

// ── 알려진 플러그인 데이터베이스 ──

interface KnownPluginEntry {
  /** 플러그인 디렉토리 또는 파일 시그니처 (homedir 상대) */
  signatures: string[];
  /** 프로젝트 로컬 시그니처 (cwd 상대) */
  localSignatures: string[];
  /** tenetx와 중복되는 스킬 */
  overlappingSkills: string[];
  /** tenetx와 중복되는 훅 (비활성 권장) */
  overlappingHooks: string[];
}

const KNOWN_PLUGINS: Record<string, KnownPluginEntry> = {
  'oh-my-claudecode': {
    signatures: ['.omc'],
    localSignatures: ['.omc'],
    overlappingSkills: [
      'autopilot', 'team', 'code-review', 'tdd', 'debug-detective',
      'refactor', 'security-review', 'git-master', 'migrate',
      'pipeline', 'ultrawork',
    ],
    overlappingHooks: ['intent-classifier', 'keyword-detector'],
  },
  'claude-mem': {
    signatures: ['.claude-mem'],
    localSignatures: [],
    // claude-mem은 MCP 기반이라 스킬 충돌은 없지만 컨텍스트 주입 경쟁 있음
    overlappingSkills: [],
    overlappingHooks: [],
  },
  'macrodata': {
    signatures: ['.macrodata'],
    localSignatures: ['.macrodata'],
    overlappingSkills: [],
    overlappingHooks: [],
  },
  'superpowers': {
    signatures: ['.codex/superpowers'],  // Superpowers installs to ~/.codex/superpowers/
    localSignatures: [],
    overlappingSkills: [
      'tdd', 'debug-detective', 'refactor', 'code-review',
    ],
    overlappingHooks: [],  // Superpowers uses skills, not conflicting hooks
  },
  'feature-dev': {
    signatures: [],
    localSignatures: [],
    overlappingSkills: ['pipeline'],
    overlappingHooks: [],
  },
  'code-review-plugin': {
    signatures: [],
    localSignatures: [],
    overlappingSkills: ['code-review'],
    overlappingHooks: [],
  },
  'commit-commands': {
    signatures: [],
    localSignatures: [],
    overlappingSkills: ['git-master'],
    overlappingHooks: [],
  },
};

// ── 캐시 ──

const CACHE_PATH = path.join(STATE_DIR, 'detected-plugins.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

function loadCache(cwd?: string): DetectedPlugin[] | null {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const data: PluginCacheData = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    const age = Date.now() - new Date(data.timestamp).getTime();
    if (!Number.isFinite(age) || age > CACHE_TTL_MS) return null;
    // cwd가 다르면 캐시 무효 (프로젝트별 로컬 시그니처가 다를 수 있음)
    if (data.cwd && cwd && data.cwd !== cwd) return null;
    return data.plugins;
  } catch {
    return null;
  }
}

function saveCache(plugins: DetectedPlugin[], cwd?: string): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify({
      plugins,
      timestamp: new Date().toISOString(),
      cwd: cwd ?? undefined,
    } satisfies PluginCacheData));
  } catch {
    // 캐시 저장 실패는 무시
  }
}

// ── 감지 로직 ──

/** ~/.claude/plugins/ 디렉토리에서 설치된 플러그인 이름 추출 */
function scanPluginDirectory(): Set<string> {
  const names = new Set<string>();
  const pluginsDir = path.join(os.homedir(), '.claude', 'plugins');
  try {
    if (!fs.existsSync(pluginsDir)) return names;
    for (const entry of fs.readdirSync(pluginsDir)) {
      const pluginJsonPath = path.join(pluginsDir, entry, 'plugin.json');
      if (fs.existsSync(pluginJsonPath)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
          names.add(manifest.name ?? entry);
        } catch {
          names.add(entry);
        }
      }
    }
  } catch {
    // 디렉토리 접근 실패
  }
  return names;
}

/** 파일 시그니처로 알려진 플러그인 감지 */
function detectBySignature(cwd?: string): Map<string, 'signature'> {
  const detected = new Map<string, 'signature'>();
  const home = os.homedir();
  const effectiveCwd = cwd ?? process.cwd();

  for (const [pluginName, entry] of Object.entries(KNOWN_PLUGINS)) {
    // 홈 디렉토리 시그니처
    for (const sig of entry.signatures) {
      if (fs.existsSync(path.join(home, sig))) {
        detected.set(pluginName, 'signature');
        break;
      }
    }

    // 프로젝트 로컬 시그니처
    if (!detected.has(pluginName)) {
      for (const sig of entry.localSignatures) {
        if (fs.existsSync(path.join(effectiveCwd, sig))) {
          detected.set(pluginName, 'signature');
          break;
        }
      }
    }
  }

  return detected;
}

// ── 공개 API ──

/**
 * 설치된 다른 플러그인을 감지합니다.
 * 캐시가 유효하면 캐시를 반환합니다 (1시간 TTL).
 */
export function detectInstalledPlugins(cwd?: string): DetectedPlugin[] {
  // 캐시 확인 (cwd별로 분리)
  const cached = loadCache(cwd);
  if (cached) return cached;

  const result: DetectedPlugin[] = [];

  // 방법 1: 플러그인 디렉토리 스캔
  const dirPlugins = scanPluginDirectory();

  // 방법 2: 파일 시그니처 감지
  const sigPlugins = detectBySignature(cwd);

  // 병합
  const allNames = new Set([...dirPlugins, ...sigPlugins.keys()]);

  for (const name of allNames) {
    const known = KNOWN_PLUGINS[name];
    const inDir = dirPlugins.has(name);
    const inSig = sigPlugins.has(name);

    result.push({
      name,
      overlappingSkills: known?.overlappingSkills ?? [],
      overlappingHooks: known?.overlappingHooks ?? [],
      detectedBy: inDir && inSig ? 'both' : inDir ? 'plugin-dir' : 'signature',
    });
  }

  saveCache(result, cwd);
  return result;
}

/** tenetx와 중복되는 스킬 이름 → 충돌 플러그인 이름 매핑 */
export function getSkillConflicts(cwd?: string): Map<string, string> {
  const conflicts = new Map<string, string>();
  for (const plugin of detectInstalledPlugins(cwd)) {
    for (const skill of plugin.overlappingSkills) {
      conflicts.set(skill, plugin.name);
    }
  }
  return conflicts;
}

/** tenetx와 중복되는 훅 이름 → 충돌 플러그인 이름 매핑 */
export function getHookConflicts(cwd?: string): Map<string, string> {
  const conflicts = new Map<string, string>();
  for (const plugin of detectInstalledPlugins(cwd)) {
    for (const hook of plugin.overlappingHooks) {
      conflicts.set(hook, plugin.name);
    }
  }
  return conflicts;
}

/**
 * 컨텍스트를 상시 주입하는 다른 플러그인이 있는지 확인합니다.
 *
 * 판정 기준: overlappingHooks가 있는 플러그인만 "컨텍스트 주입" 간주.
 * MCP 기반 플러그인(claude-mem 등)이나 스킬만 중복되는 플러그인은
 * 온디맨드 호출이므로 상시 컨텍스트를 점유하지 않아 제외합니다.
 */
export function hasContextInjectingPlugins(cwd?: string): boolean {
  return detectInstalledPlugins(cwd).some(p => p.overlappingHooks.length > 0);
}

/** 감지 캐시를 무효화합니다 (플러그인 설치/제거 후 호출) */
export function invalidatePluginCache(): void {
  try {
    if (fs.existsSync(CACHE_PATH)) fs.unlinkSync(CACHE_PATH);
  } catch {
    // 무시
  }
}
