/**
 * Tenetx AST CLI — ast-grep 기반 코드 검색 커맨드
 *
 * tenetx ast search "pattern" [--lang ts] [--cwd .]
 * tenetx ast functions [--cwd .]
 * tenetx ast classes [--cwd .]
 * tenetx ast calls <name> [--cwd .]
 * tenetx ast status
 */

import { execFileSync } from 'node:child_process';
import {
  isAstGrepAvailable,
  astGrepSearch,
  findFunctions,
  findClasses,
  findCallsTo,
  AST_PATTERNS,
  type AstMatch,
} from './ast-adapter.js';

// ── Helpers ─────────────────────────────────────────

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

function formatMatches(matches: AstMatch[]): void {
  if (matches.length === 0) {
    console.log('  No matches found.');
    return;
  }

  for (const m of matches) {
    const node = m.matchedNode !== m.text ? ` [${m.matchedNode}]` : '';
    console.log(`  ${m.file}:${m.line}:${m.column}${node}`);
    // 긴 텍스트는 첫 줄만 표시
    const firstLine = m.text.split('\n')[0].trim();
    const preview = firstLine.length > 100 ? firstLine.slice(0, 100) + '...' : firstLine;
    console.log(`    ${preview}`);
  }

  console.log(`\n  Total: ${matches.length} match(es)`);
}

// ── Subcommands ─────────────────────────────────────

async function handleSearch(args: string[]): Promise<void> {
  const pattern = args[0];
  if (!pattern) {
    console.error('[tenetx ast] Usage: tenetx ast search "<pattern>" [--lang ts] [--cwd .]');
    process.exit(1);
  }

  const lang = parseFlag(args, '--lang');
  const cwd = parseFlag(args, '--cwd') ?? process.cwd();

  console.log(`[tenetx ast] Searching: ${pattern}${lang ? ` (lang: ${lang})` : ''}`);
  const matches = await astGrepSearch({ pattern, language: lang, cwd });
  formatMatches(matches);
}

async function handleFunctions(args: string[]): Promise<void> {
  const cwd = parseFlag(args, '--cwd') ?? process.cwd();

  console.log('[tenetx ast] Finding all functions...');
  const matches = await findFunctions(cwd);
  formatMatches(matches);
}

async function handleClasses(args: string[]): Promise<void> {
  const cwd = parseFlag(args, '--cwd') ?? process.cwd();

  console.log('[tenetx ast] Finding all classes...');
  const matches = await findClasses(cwd);
  formatMatches(matches);
}

async function handleCalls(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error('[tenetx ast] Usage: tenetx ast calls <functionName> [--cwd .]');
    process.exit(1);
  }

  const cwd = parseFlag(args, '--cwd') ?? process.cwd();

  console.log(`[tenetx ast] Finding calls to: ${name}`);
  const matches = await findCallsTo(name, cwd);
  formatMatches(matches);
}

function handleStatus(): void {
  const available = isAstGrepAvailable();
  console.log(`[tenetx ast] ast-grep (sg): ${available ? 'installed' : 'not installed'}`);

  if (available) {
    try {
      const version = execFileSync('sg', ['--version'], { encoding: 'utf-8', timeout: 5000 }).trim();
      console.log(`  Version: ${version}`);
    } catch {
      console.log('  Version: unknown');
    }
  } else {
    console.log('  Install: npm i -g @ast-grep/cli  or  cargo install ast-grep');
    console.log('  Fallback: regex-based search is active');
  }

  console.log('\n  Available patterns:');
  for (const [lang, patterns] of Object.entries(AST_PATTERNS)) {
    const keys = Object.keys(patterns).join(', ');
    console.log(`    ${lang}: ${keys}`);
  }
}

function printUsage(): void {
  console.log(`
  tenetx ast — AST-based code search

  Subcommands:
    tenetx ast search "<pattern>" [--lang ts] [--cwd .]   Search by AST pattern
    tenetx ast functions [--cwd .]                         List all functions
    tenetx ast classes [--cwd .]                           List all classes
    tenetx ast calls <name> [--cwd .]                      Find all calls to a function
    tenetx ast status                                      Check ast-grep installation

  Examples:
    tenetx ast search "function $NAME($$$ARGS) { $$$ }" --lang ts
    tenetx ast search "class $NAME { $$$ }"
    tenetx ast calls handleForge
    tenetx ast functions --cwd ./src
`);
}

// ── Main Handler ────────────────────────────────────

export async function handleAst(args: string[]): Promise<void> {
  const sub = args[0];

  if (!sub || sub === '--help' || sub === '-h') {
    printUsage();
    return;
  }

  // ast-grep이 필요한 명령은 설치 확인
  if (sub !== 'status' && !isAstGrepAvailable()) {
    console.error('[tenetx ast] ast-grep (sg) is not installed.');
    console.error('  Install: npm i -g @ast-grep/cli  or  cargo install ast-grep');
    console.error('  Run "tenetx ast status" for details.');
    process.exit(1);
  }

  switch (sub) {
    case 'search':
      await handleSearch(args.slice(1));
      break;
    case 'functions':
      await handleFunctions(args.slice(1));
      break;
    case 'classes':
      await handleClasses(args.slice(1));
      break;
    case 'calls':
      await handleCalls(args.slice(1));
      break;
    case 'status':
      handleStatus();
      break;
    default:
      console.error(`[tenetx ast] Unknown subcommand: ${sub}`);
      printUsage();
      process.exit(1);
  }
}
