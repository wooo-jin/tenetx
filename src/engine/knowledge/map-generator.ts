/**
 * Map Generator — 프로젝트 구조 자동 맵 생성
 *
 * 코드베이스를 스캔하여 구조 맵을 생성합니다:
 * - 디렉토리 구조 + 목적 추론
 * - 파일별 언어, 줄 수, export/import
 * - 진입점(entry point) 탐지
 * - 외부 의존성 목록
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ProjectMap,
  ProjectSummary,
  FileEntry,
  DirectoryEntry,
  ExternalDependency,
  ScanOptions,
} from './types.js';

const DEFAULT_IGNORE = [
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__pycache__', '.venv', 'venv', '.tox',
  '.compound', '.claude', '.idea', '.vscode',
  'vendor', 'target', 'out', '.cache',
];

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript',
  '.py': 'python', '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin',
  '.rb': 'ruby',
  '.php': 'php',
  '.cs': 'csharp',
  '.swift': 'swift',
  '.vue': 'vue', '.svelte': 'svelte',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.html': 'html',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.dockerfile': 'docker',
};

/** 디렉토리 이름에서 목적 추론 */
const DIR_PURPOSE_MAP: Record<string, string> = {
  'src': 'source code',
  'lib': 'library',
  'test': 'tests', 'tests': 'tests', '__tests__': 'tests',
  'spec': 'test specs',
  'components': 'UI components',
  'pages': 'pages/routes',
  'hooks': 'React hooks or event hooks',
  'utils': 'utilities',
  'helpers': 'helper functions',
  'models': 'data models',
  'services': 'service layer',
  'controllers': 'controllers',
  'routes': 'routing',
  'middleware': 'middleware',
  'config': 'configuration',
  'types': 'type definitions',
  'interfaces': 'interfaces',
  'api': 'API endpoints',
  'core': 'core modules',
  'engine': 'engine/business logic',
  'assets': 'static assets',
  'public': 'public files',
  'static': 'static files',
  'scripts': 'scripts',
  'docs': 'documentation',
  'migrations': 'DB migrations',
  'schemas': 'schema definitions',
  'fixtures': 'test fixtures',
  'mocks': 'mock data',
  'store': 'state management',
  'redux': 'Redux state',
  'atoms': 'atomic documents',
  'agents': 'agent definitions',
  'skills': 'skill definitions',
  'templates': 'templates',
  'layouts': 'layouts',
  'i18n': 'internationalization', 'locales': 'locales',
};

/** 프로젝트 구조 맵 생성 */
export function generateProjectMap(options: ScanOptions): ProjectMap {
  const { cwd, maxFiles = 1000, ignorePatterns = [] } = options;
  const ignore = [...DEFAULT_IGNORE, ...ignorePatterns];

  const files: FileEntry[] = [];
  const directories: DirectoryEntry[] = [];
  const languages: Record<string, number> = {};
  let totalLines = 0;

  // 파일 수집
  function walk(dir: string): string[] {
    const children: string[] = [];
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return children;
    }

    const dirFiles: string[] = [];

    for (const entry of entries) {
      if (ignore.includes(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;
      if (files.length >= maxFiles) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(cwd, fullPath);
      children.push(relativePath);

      if (entry.isDirectory()) {
        const subChildren = walk(fullPath);
        const purpose = DIR_PURPOSE_MAP[entry.name.toLowerCase()];
        directories.push({
          path: relativePath,
          type: 'directory',
          purpose,
          fileCount: subChildren.length,
          children: subChildren,
        });
      } else if (entry.isFile()) {
        dirFiles.push(relativePath);
        const ext = path.extname(entry.name).toLowerCase();
        const language = LANGUAGE_MAP[ext] ?? 'other';

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lineCount = content.split('\n').length;
          totalLines += lineCount;

          languages[language] = (languages[language] ?? 0) + lineCount;

          const fileEntry: FileEntry = {
            path: relativePath,
            type: 'file',
            language,
            lines: lineCount,
            exports: extractExports(content, language),
            imports: extractImportSources(content),
          };
          files.push(fileEntry);
        } catch {
          files.push({
            path: relativePath,
            type: 'file',
            language,
            lines: 0,
            exports: [],
            imports: [],
          });
        }
      }
    }

    return children;
  }

  walk(cwd);

  // 진입점 탐지
  const entryPoints = detectEntryPoints(cwd, files);

  // 외부 의존성
  const dependencies = loadDependencies(cwd);

  // 프로젝트명 추론
  const projectName = detectProjectName(cwd);

  // 프레임워크 감지
  const framework = detectFramework(cwd, dependencies);

  // 패키지 매니저 감지
  const packageManager = detectPackageManager(cwd);

  const summary: ProjectSummary = {
    name: projectName,
    totalFiles: files.length,
    totalLines,
    languages,
    framework,
    packageManager,
  };

  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    projectRoot: cwd,
    summary,
    directories,
    files,
    entryPoints,
    dependencies,
  };
}

/** export 구문 추출 */
function extractExports(content: string, language: string): string[] {
  const exports: string[] = [];

  if (['typescript', 'javascript', 'vue', 'svelte'].includes(language)) {
    // export function/class/const/type/interface
    const regex = /export\s+(?:default\s+)?(?:function|class|const|let|var|type|interface|enum)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      exports.push(match[1]);
    }
  } else if (language === 'python') {
    // class/def at top level (no indentation)
    const regex = /^(?:class|def)\s+(\w+)/gm;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      exports.push(match[1]);
    }
  }

  return exports.slice(0, 20); // 최대 20개
}

/** import 소스 추출 */
function extractImportSources(content: string): string[] {
  const sources = new Set<string>();

  // ESM
  const esmRegex = /(?:import|export)\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = esmRegex.exec(content)) !== null) {
    sources.add(match[1]);
  }

  // CJS
  const cjsRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = cjsRegex.exec(content)) !== null) {
    sources.add(match[1]);
  }

  return [...sources].slice(0, 30);
}

/** 진입점 탐지 */
function detectEntryPoints(cwd: string, files: FileEntry[]): string[] {
  const entryPoints: string[] = [];

  // package.json의 main/bin 필드
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.main) entryPoints.push(pkg.main);
      if (pkg.bin) {
        const bins = typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : pkg.bin;
        for (const binPath of Object.values(bins)) {
          entryPoints.push(binPath as string);
        }
      }
    } catch { /* ignore */ }
  }

  // 일반적인 진입점 파일명
  const commonEntryNames = [
    'index.ts', 'index.js', 'main.ts', 'main.js',
    'app.ts', 'app.js', 'server.ts', 'server.js',
    'cli.ts', 'cli.js',
  ];

  for (const file of files) {
    const basename = path.basename(file.path);
    const dirName = path.dirname(file.path);
    if (dirName === 'src' && commonEntryNames.includes(basename)) {
      if (!entryPoints.includes(file.path)) {
        entryPoints.push(file.path);
      }
    }
  }

  return entryPoints;
}

/** package.json에서 의존성 로드 */
function loadDependencies(cwd: string): ExternalDependency[] {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return [];

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps: ExternalDependency[] = [];

    for (const [name, version] of Object.entries(pkg.dependencies ?? {})) {
      deps.push({ name, version: version as string, type: 'production' });
    }
    for (const [name, version] of Object.entries(pkg.devDependencies ?? {})) {
      deps.push({ name, version: version as string, type: 'development' });
    }

    return deps;
  } catch {
    return [];
  }
}

/** 프로젝트명 추론 */
function detectProjectName(cwd: string): string {
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf-8')).name ?? path.basename(cwd);
    } catch { /* fallthrough */ }
  }
  return path.basename(cwd);
}

/** 프레임워크 감지 */
function detectFramework(cwd: string, deps: ExternalDependency[]): string | undefined {
  const depNames = new Set(deps.map(d => d.name));

  // CLI/Terminal UI tools (ink+react는 터미널 UI이므로 React 프레임워크가 아님)
  const cliLibs = ['ink', 'commander', 'yargs', 'meow', 'oclif', 'clipanion', 'cac', 'citty'];
  const isCli = cliLibs.some(lib => depNames.has(lib));
  if (isCli && depNames.has('ink')) return 'Ink (Terminal UI)';
  if (isCli) return undefined;  // CLI 도구는 프레임워크 없음으로 처리

  if (depNames.has('next')) return 'Next.js';
  if (depNames.has('nuxt')) return 'Nuxt';
  if (depNames.has('remix')) return 'Remix';
  if (depNames.has('@angular/core')) return 'Angular';
  if (depNames.has('vue')) return 'Vue';
  if (depNames.has('svelte')) return 'Svelte';
  if (depNames.has('react')) return 'React';
  if (depNames.has('express')) return 'Express';
  if (depNames.has('fastify')) return 'Fastify';
  if (depNames.has('nest') || depNames.has('@nestjs/core')) return 'NestJS';

  // Python
  const requirementsPath = path.join(cwd, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    try {
      const content = fs.readFileSync(requirementsPath, 'utf-8');
      if (content.includes('django')) return 'Django';
      if (content.includes('fastapi')) return 'FastAPI';
      if (content.includes('flask')) return 'Flask';
    } catch { /* ignore */ }
  }

  return undefined;
}

/** 패키지 매니저 감지 */
function detectPackageManager(cwd: string): string | undefined {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(cwd, 'package-lock.json'))) return 'npm';
  if (fs.existsSync(path.join(cwd, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(cwd, 'Pipfile.lock'))) return 'pipenv';
  if (fs.existsSync(path.join(cwd, 'poetry.lock'))) return 'poetry';
  if (fs.existsSync(path.join(cwd, 'go.sum'))) return 'go modules';
  if (fs.existsSync(path.join(cwd, 'Cargo.lock'))) return 'cargo';
  return undefined;
}

/** 프로젝트 맵을 Markdown으로 포맷 */
export function formatMapAsMarkdown(map: ProjectMap): string {
  const lines: string[] = [];
  const { summary } = map;

  lines.push(`# ${summary.name} — Project Map`);
  lines.push('');
  lines.push(`> Generated: ${map.generatedAt.split('T')[0]}`);
  lines.push('');

  // 요약
  lines.push('## Project Summary');
  lines.push(`- Files: ${summary.totalFiles}`);
  lines.push(`- Total lines: ${summary.totalLines.toLocaleString()}`);
  if (summary.framework) lines.push(`- Framework: ${summary.framework}`);
  if (summary.packageManager) lines.push(`- Package manager: ${summary.packageManager}`);
  lines.push('');

  // 언어 분포
  lines.push('## Language Distribution');
  const sortedLangs = Object.entries(summary.languages)
    .sort((a, b) => b[1] - a[1])
    .filter(([lang]) => lang !== 'other');
  for (const [lang, lineCount] of sortedLangs) {
    const pct = ((lineCount / summary.totalLines) * 100).toFixed(1);
    lines.push(`- ${lang}: ${lineCount.toLocaleString()} lines (${pct}%)`);
  }
  lines.push('');

  // 디렉토리 구조
  lines.push('## Directory Structure');
  const topDirs = map.directories.filter(d => !d.path.includes('/'));
  for (const dir of topDirs) {
    const purpose = dir.purpose ? ` — ${dir.purpose}` : '';
    lines.push(`- \`${dir.path}/\`${purpose} (${dir.fileCount} items)`);
  }
  lines.push('');

  // 진입점
  if (map.entryPoints.length > 0) {
    lines.push('## Entry Points');
    for (const ep of map.entryPoints) {
      lines.push(`- \`${ep}\``);
    }
    lines.push('');
  }

  // 핵심 파일 (줄 수 상위 10개)
  const topFiles = [...map.files]
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 10);
  if (topFiles.length > 0) {
    lines.push('## Key Files (by line count)');
    for (const f of topFiles) {
      const exps = f.exports.length > 0 ? ` — exports: ${f.exports.slice(0, 5).join(', ')}` : '';
      lines.push(`- \`${f.path}\` (${f.lines} lines, ${f.language})${exps}`);
    }
    lines.push('');
  }

  // 외부 의존성
  const prodDeps = map.dependencies.filter(d => d.type === 'production');
  if (prodDeps.length > 0) {
    lines.push('## Key Dependencies');
    for (const d of prodDeps) {
      lines.push(`- ${d.name} ${d.version}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
