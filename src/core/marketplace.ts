/**
 * Tenetx — 플러그인 마켓플레이스
 *
 * GitHub 기반 플러그인의 검색/설치/목록/제거를 지원합니다.
 * 로컬 레지스트리(~/.compound/plugins/registry.json)를 통해
 * 네트워크 없이도 기본 동작이 가능하며, GitHub URL을 직접 지정하면
 * git clone으로 설치합니다.
 *
 * CLI: `tenetx marketplace search|install|list|remove`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { COMPOUND_HOME, PACKS_DIR } from './paths.js';

// ---------------------------------------------------------------------------
// 팩 레지스트리 타입 정의
// ---------------------------------------------------------------------------

/** 팩 카탈로그 엔트리 — packs/registry.json 의 각 항목 */
export interface PackEntry {
  name: string;
  version: string;
  description: string;
  author: string;
  tags: string[];
  source: string;
  provides: { rules: number; solutions: number };
}

/** 팩 레지스트리 파일 구조 */
export interface PackRegistry {
  version: number;
  updated: string;
  packs: PackEntry[];
}

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------

/** 플러그인 매니페스트 — 레지스트리 및 설치 메타정보 */
export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  /** 플러그인 종류: 스킬 / 에이전트 / 훅 / 팩 */
  type: 'skill' | 'agent' | 'hook' | 'pack';
  repository: string;
  /** 레지스트리에서 제공하는 권장 설치 경로 (선택) */
  installPath?: string;
}

/** 로컬 레지스트리 파일 구조 */
export interface PluginRegistry {
  plugins: PluginManifest[];
  updatedAt: string;
}

/** 설치된 플러그인 — 매니페스트 + 설치 메타 */
export interface InstalledPlugin extends PluginManifest {
  installedAt: string;
  localPath: string;
}

// ---------------------------------------------------------------------------
// 경로 헬퍼
// ---------------------------------------------------------------------------

/** ~/.compound/plugins/ 경로 반환 */
export function getPluginsDir(): string {
  return path.join(COMPOUND_HOME, 'plugins');
}

/** ~/.compound/plugins/registry.json 경로 반환 */
export function getRegistryPath(): string {
  return path.join(getPluginsDir(), 'registry.json');
}

/** ~/.compound/plugins/installed.json 경로 반환 */
function getInstalledPath(): string {
  return path.join(getPluginsDir(), 'installed.json');
}

// ---------------------------------------------------------------------------
// 기본 내장 레지스트리
// ---------------------------------------------------------------------------

/** 기본 내장 플러그인 레지스트리 — 로컬 registry.json이 없어도 검색 가능 */
const DEFAULT_PLUGINS: PluginManifest[] = [
  {
    name: 'tenetx-skill-tdd',
    version: '1.0.0',
    description: 'TDD 모드 스킬 — 테스트 주도 개발 워크플로우',
    author: 'tenetx-community',
    type: 'skill',
    repository: 'https://github.com/tenetx-community/skill-tdd',
  },
  {
    name: 'tenetx-skill-codebase-search',
    version: '1.0.0',
    description: '코드베이스 심층 검색 스킬',
    author: 'tenetx-community',
    type: 'skill',
    repository: 'https://github.com/tenetx-community/skill-codebase-search',
  },
  {
    name: 'tenetx-agent-reviewer',
    version: '1.0.0',
    description: 'AI 코드 리뷰 에이전트',
    author: 'tenetx-community',
    type: 'agent',
    repository: 'https://github.com/tenetx-community/agent-reviewer',
  },
  {
    name: 'tenetx-hook-auto-commit',
    version: '1.0.0',
    description: '자동 커밋 훅 — PostToolUse 후 자동 커밋',
    author: 'tenetx-community',
    type: 'hook',
    repository: 'https://github.com/tenetx-community/hook-auto-commit',
  },
  {
    name: 'tenetx-pack-fullstack',
    version: '1.0.0',
    description: '풀스택 개발 팩 (React + Node.js)',
    author: 'tenetx-community',
    type: 'pack',
    repository: 'https://github.com/tenetx-community/pack-fullstack',
  },
];

// ---------------------------------------------------------------------------
// 레지스트리 I/O
// ---------------------------------------------------------------------------

/**
 * 로컬 레지스트리와 기본 내장 레지스트리를 병합하여 반환합니다.
 * 로컬 registry.json이 없거나 파싱 실패 시 기본 레지스트리만 반환합니다.
 * 동일 이름의 플러그인은 로컬이 우선합니다.
 */
export function loadRegistry(): PluginRegistry {
  const registryPath = getRegistryPath();
  let localPlugins: PluginManifest[] = [];
  try {
    if (fs.existsSync(registryPath)) {
      const raw = fs.readFileSync(registryPath, 'utf-8');
      const local = JSON.parse(raw) as PluginRegistry;
      localPlugins = local.plugins ?? [];
    }
  } catch {
    // 파싱 실패 시 로컬 플러그인 없이 진행
  }

  // 로컬 + 기본 레지스트리 병합 (로컬이 우선)
  const localNames = new Set(localPlugins.map((p) => p.name));
  const merged = [
    ...localPlugins,
    ...DEFAULT_PLUGINS.filter((p) => !localNames.has(p.name)),
  ];

  return { plugins: merged, updatedAt: new Date().toISOString() };
}

/**
 * 레지스트리를 파일에 저장합니다.
 * 디렉토리가 없으면 자동 생성합니다.
 */
export function saveRegistry(registry: PluginRegistry): void {
  const registryPath = getRegistryPath();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

// ---------------------------------------------------------------------------
// 설치된 플러그인 I/O
// ---------------------------------------------------------------------------

/** 설치된 플러그인 목록을 로드합니다. */
function loadInstalled(): InstalledPlugin[] {
  const installedPath = getInstalledPath();
  try {
    if (fs.existsSync(installedPath)) {
      return JSON.parse(fs.readFileSync(installedPath, 'utf-8')) as InstalledPlugin[];
    }
  } catch {
    // 파싱 실패 시 빈 목록
  }
  return [];
}

/** 설치된 플러그인 목록을 파일에 저장합니다. */
function saveInstalled(plugins: InstalledPlugin[]): void {
  const installedPath = getInstalledPath();
  fs.mkdirSync(path.dirname(installedPath), { recursive: true });
  fs.writeFileSync(installedPath, JSON.stringify(plugins, null, 2));
}

// ---------------------------------------------------------------------------
// 검색
// ---------------------------------------------------------------------------

/**
 * 레지스트리에서 키워드로 플러그인을 검색합니다.
 * name과 description 필드를 대소문자 무시로 매칭합니다.
 *
 * @param query - 검색 키워드 (공백 구분 시 AND 검색)
 * @param registry - 검색 대상 레지스트리 (생략 시 로컬 레지스트리 사용)
 */
export function searchPlugins(query: string, registry?: PluginRegistry): PluginManifest[] {
  const reg = registry ?? loadRegistry();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return reg.plugins;

  return reg.plugins.filter((plugin) => {
    const haystack = `${plugin.name} ${plugin.description}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

// ---------------------------------------------------------------------------
// 팩 레지스트리
// ---------------------------------------------------------------------------

/**
 * 패키지 내장 packs/registry.json을 로드합니다.
 * 파일이 없거나 파싱 실패 시 빈 레지스트리를 반환합니다.
 */
export function loadPackRegistry(): PackRegistry {
  try {
    // 패키지 루트의 packs/registry.json 경로 해석
    const registryPath = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      '../../packs/registry.json',
    );
    if (fs.existsSync(registryPath)) {
      const raw = fs.readFileSync(registryPath, 'utf-8');
      return JSON.parse(raw) as PackRegistry;
    }
  } catch {
    // 파싱/경로 오류 시 빈 레지스트리
  }
  return { version: 1, updated: '', packs: [] };
}

/**
 * 팩 레지스트리에서 키워드로 검색합니다.
 * name, description, tags를 대소문자 무시로 매칭합니다.
 *
 * @param query - 검색 키워드 (공백 구분 시 AND 검색)
 * @param registry - 검색 대상 레지스트리 (생략 시 내장 레지스트리 사용)
 */
export function searchPacks(query: string, registry?: PackRegistry): PackEntry[] {
  const reg = registry ?? loadPackRegistry();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return reg.packs;

  return reg.packs.filter((pack) => {
    const haystack = `${pack.name} ${pack.description} ${pack.tags.join(' ')}`.toLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

/**
 * 팩 레지스트리의 모든 항목을 포맷된 테이블로 출력합니다.
 */
export function formatPackList(packs: PackEntry[]): string {
  if (packs.length === 0) return '  No packs found.';

  const lines: string[] = [];
  for (const p of packs) {
    lines.push(`  ${p.name} v${p.version} [${p.source}]`);
    lines.push(`    ${p.description}`);
    lines.push(`    by ${p.author} | tags: ${p.tags.join(', ')} | rules: ${p.provides.rules}, solutions: ${p.provides.solutions}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 설치
// ---------------------------------------------------------------------------

/**
 * GitHub URL 여부를 판별합니다.
 */
function isGitHubUrl(nameOrUrl: string): boolean {
  return nameOrUrl.startsWith('http://') ||
    nameOrUrl.startsWith('https://') ||
    nameOrUrl.startsWith('git@');
}

/**
 * 플러그인 타입에 따라 설치 후 처리를 수행합니다.
 * - skill: ~/.compound/skills/ 에 심볼릭 링크
 * - agent: 프로젝트 .claude/agents/ 에 심볼릭 링크
 * - hook: 수동 설치 안내만 출력 (.claude/hooks/ 은 직접 편집 필요)
 * - pack: ~/.compound/packs/ 에 심볼릭 링크
 *
 * @param cwd - 프로젝트 루트 경로 (agent 타입의 링크 기준 디렉토리)
 */
function postInstall(localPath: string, manifest: PluginManifest, cwd: string): void {
  switch (manifest.type) {
    case 'skill': {
      const skillsDir = path.join(COMPOUND_HOME, 'skills');
      fs.mkdirSync(skillsDir, { recursive: true });
      const link = path.join(skillsDir, manifest.name);
      if (!fs.existsSync(link)) {
        try { fs.symlinkSync(localPath, link, 'dir'); } catch { /* 이미 존재 */ }
      }
      break;
    }
    case 'agent': {
      const agentsDir = path.join(cwd, '.claude', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      const link = path.join(agentsDir, manifest.name);
      if (!fs.existsSync(link)) {
        try { fs.symlinkSync(localPath, link, 'dir'); } catch { /* 이미 존재 */ }
      }
      break;
    }
    case 'hook': {
      console.log(
        `[marketplace] hook 플러그인은 .claude/hooks/ 에 직접 등록해야 합니다.\n` +
        `  설치 경로: ${localPath}`,
      );
      break;
    }
    case 'pack': {
      fs.mkdirSync(PACKS_DIR, { recursive: true });
      const link = path.join(PACKS_DIR, manifest.name);
      if (!fs.existsSync(link)) {
        try { fs.symlinkSync(localPath, link, 'dir'); } catch { /* 이미 존재 */ }
      }
      break;
    }
  }
}

/**
 * 이미 clone된 디렉토리에서 manifest를 읽어옵니다.
 */
function readManifestFromDir(destDir: string, repoUrl: string): PluginManifest {
  // plugin.json 또는 package.json에서 메타 추출
  const pluginJsonPath = path.join(destDir, 'plugin.json');
  const packageJsonPath = path.join(destDir, 'package.json');

  if (fs.existsSync(pluginJsonPath)) {
    const raw = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8')) as Record<string, unknown>;
    if (typeof raw.name !== 'string' || typeof raw.version !== 'string' || typeof raw.type !== 'string') {
      throw new Error(`plugin.json 필수 필드(name, version, type) 누락: ${pluginJsonPath}`);
    }
    return raw as unknown as PluginManifest;
  }
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8')) as Record<string, unknown>;
    return {
      name: (pkg.name as string) ?? path.basename(destDir),
      version: (pkg.version as string) ?? '0.0.0',
      description: (pkg.description as string) ?? '',
      author: (pkg.author as string) ?? '',
      type: (pkg.pluginType as PluginManifest['type']) ?? 'skill',
      repository: repoUrl,
    };
  }

  // 폴백: 디렉토리 이름으로 최소 매니페스트 생성
  return {
    name: path.basename(destDir),
    version: '0.0.0',
    description: '',
    author: '',
    type: 'skill',
    repository: repoUrl,
  };
}

/**
 * 원격 저장소를 clone한 후 manifest를 읽어옵니다.
 */
function cloneAndReadManifest(repoUrl: string, destDir: string): PluginManifest {
  execFileSync('git', ['clone', '--depth', '1', repoUrl, destDir], {
    timeout: 30_000,
    stdio: 'pipe',
  });

  return readManifestFromDir(destDir, repoUrl);
}

/**
 * 플러그인을 설치합니다.
 *
 * - GitHub URL이면 git clone으로 직접 설치
 * - 이름이면 로컬 레지스트리에서 찾아 repository URL로 설치
 *
 * @param cwd - 프로젝트 루트 경로 (agent 타입의 링크 기준 디렉토리, 기본값: process.cwd())
 * @throws 레지스트리에 없는 이름이거나 clone 실패 시 Error
 */
export async function installPlugin(nameOrUrl: string, cwd: string = process.cwd()): Promise<InstalledPlugin> {
  const pluginsDir = getPluginsDir();
  fs.mkdirSync(pluginsDir, { recursive: true });

  let repoUrl: string;
  let manifest: PluginManifest | undefined;

  if (isGitHubUrl(nameOrUrl)) {
    repoUrl = nameOrUrl;
  } else {
    // 이름 기반 검색: 레지스트리 확인
    const registry = loadRegistry();
    const found = registry.plugins.find(
      (p) => p.name.toLowerCase() === nameOrUrl.toLowerCase(),
    );
    if (!found) {
      throw new Error(
        `플러그인 '${nameOrUrl}'을(를) 레지스트리에서 찾을 수 없습니다. ` +
        `URL을 직접 지정하거나 registry.json을 업데이트하세요.`,
      );
    }
    repoUrl = found.repository;
    manifest = found;
  }

  // 클론 대상 디렉토리 결정
  const repoName = repoUrl.split('/').pop()?.replace(/\.git$/, '') ?? 'plugin';
  const destDir = path.join(pluginsDir, repoName);

  if (fs.existsSync(destDir)) {
    // 이미 존재하면 pull로 업데이트
    try {
      execFileSync('git', ['-C', destDir, 'pull', '--ff-only'], { timeout: 30_000, stdio: 'pipe' });
    } catch {
      // pull 실패는 무시 (오프라인 등)
    }
    // manifest가 아직 없으면 기존 디렉토리에서 읽기
    if (!manifest) {
      manifest = readManifestFromDir(destDir, repoUrl);
    }
  } else {
    manifest = cloneAndReadManifest(repoUrl, destDir);
  }

  // post-install 처리 (심볼릭 링크 등)
  postInstall(destDir, manifest, cwd);

  const installed: InstalledPlugin = {
    ...manifest,
    installedAt: new Date().toISOString(),
    localPath: destDir,
  };

  // installed.json 갱신
  const all = loadInstalled().filter((p) => p.name !== installed.name);
  all.push(installed);
  saveInstalled(all);

  return installed;
}

// ---------------------------------------------------------------------------
// 목록 / 제거
// ---------------------------------------------------------------------------

/**
 * 설치된 플러그인 목록을 반환합니다.
 * localPath가 실제로 존재하는 항목만 반환합니다.
 */
export function listInstalledPlugins(): InstalledPlugin[] {
  return loadInstalled().filter((p) => fs.existsSync(p.localPath));
}

/**
 * 플러그인을 제거합니다.
 * localPath 디렉토리를 삭제하고 installed.json에서 항목을 제거합니다.
 *
 * @param cwd - 프로젝트 루트 경로 (agent 타입 심볼릭 링크 정리 기준, 기본값: process.cwd())
 */
export function removePlugin(name: string, cwd: string = process.cwd()): { success: boolean; message: string } {
  const all = loadInstalled();
  const target = all.find((p) => p.name.toLowerCase() === name.toLowerCase());

  if (!target) {
    return { success: false, message: `플러그인 '${name}'이(가) 설치되어 있지 않습니다.` };
  }

  try {
    if (fs.existsSync(target.localPath)) {
      fs.rmSync(target.localPath, { recursive: true, force: true });
    }

    // 심볼릭 링크 정리
    const linksToCheck: string[] = [];
    switch (target.type) {
      case 'skill':
        linksToCheck.push(path.join(COMPOUND_HOME, 'skills', target.name));
        break;
      case 'agent':
        linksToCheck.push(path.join(cwd, '.claude', 'agents', target.name));
        break;
      case 'pack':
        linksToCheck.push(path.join(PACKS_DIR, target.name));
        break;
    }
    for (const link of linksToCheck) {
      try {
        const stat = fs.lstatSync(link);
        if (stat.isSymbolicLink()) {
          fs.unlinkSync(link);
        } else if (stat.isDirectory()) {
          fs.rmSync(link, { recursive: true });
        }
      } catch { /* 링크가 없는 경우 무시 */ }
    }

    saveInstalled(all.filter((p) => p.name.toLowerCase() !== name.toLowerCase()));
    return { success: true, message: `플러그인 '${target.name}' 제거 완료.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: `제거 실패: ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// CLI 핸들러
// ---------------------------------------------------------------------------

/**
 * `tenetx marketplace <subcommand>` CLI 진입점.
 *
 * 서브커맨드:
 * - search <query>     : 플러그인 검색
 * - install <name|url> : 플러그인 설치
 * - list               : 설치된 플러그인 목록
 * - remove <name>      : 플러그인 제거
 */
export async function handleMarketplace(args: string[]): Promise<void> {
  const sub = args[0];
  const cwd = process.cwd();

  switch (sub) {
    case 'search': {
      const query = args.slice(1).join(' ').trim();
      if (!query) {
        console.error('[marketplace] 검색어를 입력해주세요. 예: tenetx marketplace search "skill"');
        process.exit(1);
      }
      // 플러그인 검색
      const results = searchPlugins(query);
      // 팩 레지스트리 검색
      const packResults = searchPacks(query);

      if (results.length === 0 && packResults.length === 0) {
        console.log('[marketplace] 검색 결과가 없습니다.');
      } else {
        if (packResults.length > 0) {
          console.log(`[marketplace] 팩 검색 결과 (${packResults.length}개):\n`);
          console.log(formatPackList(packResults));
        }
        if (results.length > 0) {
          console.log(`[marketplace] 플러그인 검색 결과 (${results.length}개):\n`);
          for (const p of results) {
            console.log(`  ${p.name} v${p.version} [${p.type}]`);
            console.log(`    ${p.description}`);
            console.log(`    by ${p.author} — ${p.repository}\n`);
          }
        }
      }
      break;
    }

    case 'install': {
      const target = args[1];
      if (!target) {
        console.error('[marketplace] 설치할 플러그인 이름 또는 URL을 입력해주세요.');
        process.exit(1);
      }
      console.log(`[marketplace] '${target}' 설치 중...`);
      try {
        const plugin = await installPlugin(target, cwd);
        console.log(`[marketplace] 설치 완료: ${plugin.name} v${plugin.version}`);
        console.log(`  경로: ${plugin.localPath}`);
        console.log(`  타입: ${plugin.type}`);
      } catch (e) {
        console.error(`[marketplace] 설치 실패: ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
      break;
    }

    case 'list': {
      // 팩 레지스트리 표시
      const packReg = loadPackRegistry();
      if (packReg.packs.length > 0) {
        console.log(`[marketplace] 사용 가능한 팩 (${packReg.packs.length}개):\n`);
        console.log(formatPackList(packReg.packs));
      }

      // 설치된 플러그인 표시
      const installed = listInstalledPlugins();
      if (installed.length === 0) {
        console.log('[marketplace] 설치된 플러그인이 없습니다.');
      } else {
        console.log(`[marketplace] 설치된 플러그인 (${installed.length}개):\n`);
        for (const p of installed) {
          console.log(`  ${p.name} v${p.version} [${p.type}]`);
          console.log(`    설치일: ${p.installedAt}`);
          console.log(`    경로: ${p.localPath}\n`);
        }
      }
      break;
    }

    case 'remove': {
      const name = args[1];
      if (!name) {
        console.error('[marketplace] 제거할 플러그인 이름을 입력해주세요.');
        process.exit(1);
      }
      const result = removePlugin(name, cwd);
      if (result.success) {
        console.log(`[marketplace] ${result.message}`);
      } else {
        console.error(`[marketplace] ${result.message}`);
        process.exit(1);
      }
      break;
    }

    default: {
      console.log(`
  Tenetx Marketplace

  Usage:
    tenetx marketplace search <query>     플러그인/팩 검색
    tenetx marketplace install <name|url> 플러그인 설치 (GitHub URL 또는 이름)
    tenetx marketplace list               사용 가능한 팩 + 설치된 플러그인 목록
    tenetx marketplace remove <name>      플러그인 제거
`);
      break;
    }
  }
}
