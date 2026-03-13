/**
 * Tenet — Plugin Format Installer
 *
 * .claude-plugin 표준 포맷 기반 설치를 지원합니다.
 * `tenet install --plugin` 또는 자동 감지로 플러그인 모드 활성화.
 *
 * 설치 흐름:
 * 1. plugin.json 로드
 * 2. ~/.claude/plugins/tenet/ 에 플러그인 등록
 * 3. settings.json에 플러그인 참조 추가
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { debugLog } from './logger.js';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const PLUGINS_DIR = path.join(CLAUDE_DIR, 'plugins');
const PLUGIN_NAME = 'tenet';

function getPackageRoot(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
}

/** 플러그인 매니페스트 로드 */
function loadPluginManifest(): Record<string, unknown> | null {
  const manifestPath = path.join(getPackageRoot(), 'plugin.json');
  try {
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }
  } catch (e) {
    debugLog('plugin-installer', 'plugin.json 파싱 실패', e);
  }
  return null;
}

/** ${PLUGIN_DIR} 변수를 실제 경로로 치환 */
function resolvePluginPaths(obj: unknown, pluginDir: string): unknown {
  if (typeof obj === 'string') {
    return obj.replace(/\$\{PLUGIN_DIR\}/g, pluginDir);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => resolvePluginPaths(item, pluginDir));
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolvePluginPaths(val, pluginDir);
    }
    return result;
  }
  return obj;
}

/** 플러그인 형식으로 설치 */
export function installAsPlugin(): { success: boolean; pluginDir: string; error?: string } {
  const manifest = loadPluginManifest();
  if (!manifest) {
    return { success: false, pluginDir: '', error: 'plugin.json을 찾을 수 없습니다' };
  }

  const pkgRoot = getPackageRoot();
  const pluginDir = path.join(PLUGINS_DIR, PLUGIN_NAME);

  try {
    // 1. 플러그인 디렉토리 생성
    fs.mkdirSync(pluginDir, { recursive: true });

    // 2. 매니페스트를 경로 치환하여 저장
    const resolved = resolvePluginPaths(manifest, pkgRoot) as Record<string, unknown>;
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify(resolved, null, 2),
    );

    // 3. 심볼릭 링크: dist, agents, skills
    const links: Array<{ src: string; dst: string }> = [
      { src: path.join(pkgRoot, 'dist'), dst: path.join(pluginDir, 'dist') },
      { src: path.join(pkgRoot, 'agents'), dst: path.join(pluginDir, 'agents') },
      { src: path.join(pkgRoot, 'skills'), dst: path.join(pluginDir, 'skills') },
    ];

    for (const { src, dst } of links) {
      if (!fs.existsSync(src)) continue;
      // 기존 링크/디렉토리 제거 후 재생성
      if (fs.existsSync(dst)) {
        const stat = fs.lstatSync(dst);
        if (stat.isSymbolicLink()) fs.unlinkSync(dst);
        else continue; // 실제 디렉토리면 건너뛰기
      }
      fs.symlinkSync(src, dst, 'dir');
    }

    // 4. settings.json에 플러그인 참조 등록
    registerPluginInSettings(pluginDir);

    return { success: true, pluginDir };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    debugLog('plugin-installer', '플러그인 설치 실패', e);
    return { success: false, pluginDir, error: msg };
  }
}

/** settings.json의 plugins 배열에 등록 */
function registerPluginInSettings(pluginDir: string): void {
  const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
  let settings: Record<string, unknown> = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch { /* start fresh */ }
  }

  const plugins = (settings.plugins as string[]) ?? [];
  if (!plugins.includes(pluginDir)) {
    plugins.push(pluginDir);
    settings.plugins = plugins;
    fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  }
}

/** 플러그인 설치 여부 확인 */
export function isPluginInstalled(): boolean {
  const pluginDir = path.join(PLUGINS_DIR, PLUGIN_NAME);
  return fs.existsSync(path.join(pluginDir, 'plugin.json'));
}

/** 플러그인 제거 */
export function uninstallPlugin(): boolean {
  const pluginDir = path.join(PLUGINS_DIR, PLUGIN_NAME);
  try {
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }

    // settings.json에서 플러그인 참조 제거
    const settingsPath = path.join(CLAUDE_DIR, 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      if (Array.isArray(settings.plugins)) {
        settings.plugins = (settings.plugins as string[]).filter(p => !p.includes(PLUGIN_NAME));
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    }
    return true;
  } catch (e) {
    debugLog('plugin-installer', '플러그인 제거 실패', e);
    return false;
  }
}
