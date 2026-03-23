/**
 * LSP CLI — Language Server 관련 CLI 명령어 핸들러
 *
 * tenetx lsp status|hover|definition|references|diagnostics
 */

import * as path from 'node:path';
import { detectAvailableServers, getServerForFile } from '../engine/lsp-detector.js';
import { getLspManager, shutdownGlobalLspManager } from '../engine/lsp-manager.js';
import { uriToPath } from '../engine/lsp-client.js';

export async function handleLsp(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === 'help' || subcommand === '--help') {
    printLspHelp();
    return;
  }

  switch (subcommand) {
    case 'status':
      await handleStatus();
      break;
    case 'hover':
      await handleHover(args.slice(1));
      break;
    case 'definition':
      await handleDefinition(args.slice(1));
      break;
    case 'references':
      await handleReferences(args.slice(1));
      break;
    case 'diagnostics':
      await handleDiagnosticsCmd(args.slice(1));
      break;
    default:
      console.error(`  Unknown subcommand: ${subcommand}`);
      printLspHelp();
      break;
  }
}

function printLspHelp(): void {
  console.log(`
  Usage: tenetx lsp <command>

  Commands:
    status                              Show detected language servers
    hover <file> <line> <col>           Get hover info at position
    definition <file> <line> <col>      Go to definition
    references <file> <line> <col>      Find all references
    diagnostics <file>                  Get file diagnostics

  Notes:
    - Line and column are 1-based (human-friendly)
    - Internally converted to 0-based for LSP
    - Language server must be installed on your system
`);
}

async function handleStatus(): Promise<void> {
  const servers = await detectAvailableServers();
  const manager = getLspManager();

  console.log('\n  Language Server Status\n');
  console.log(`  ${'Language'.padEnd(14)}${'Command'.padEnd(32)}Status`);
  console.log(`  ${'─'.repeat(14)}${'─'.repeat(32)}${'─'.repeat(12)}`);

  for (const s of servers) {
    const status = s.available ? '\x1b[32minstalled\x1b[0m' : '\x1b[90mnot found\x1b[0m';
    console.log(`  ${s.language.padEnd(14)}${s.command.padEnd(32)}${status}`);
  }

  console.log('');
  console.log(`  Active clients: ${manager.activeCount}`);
  if (manager.activeCount > 0) {
    console.log(`  Active languages: ${manager.activeLanguages.join(', ')}`);
  }
  console.log('');
}

function parseFileLineCol(args: string[]): { file: string; line: number; col: number } | null {
  if (args.length < 3) {
    console.error('  Usage: tenetx lsp <command> <file> <line> <col>');
    return null;
  }

  const file = path.resolve(args[0]);
  const line = parseInt(args[1], 10);
  const col = parseInt(args[2], 10);

  if (isNaN(line) || isNaN(col)) {
    console.error('  Line and column must be numbers');
    return null;
  }

  if (line < 1 || col < 1) {
    console.error('  Line and column are 1-based (minimum: 1)');
    return null;
  }

  return { file, line: line - 1, col: col - 1 }; // 0-based로 변환
}

async function withLspCleanup<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } finally {
    await shutdownGlobalLspManager();
  }
}

async function handleHover(args: string[]): Promise<void> {
  const parsed = parseFileLineCol(args);
  if (!parsed) return;

  await withLspCleanup(async () => {
    const rootUri = process.cwd();
    const manager = getLspManager();
    const result = await manager.hoverAt(parsed.file, parsed.line, parsed.col, rootUri);

    if (!result) {
      console.log('  No hover information available');
      return;
    }

    console.log(`\n  Hover at ${path.basename(parsed.file)}:${parsed.line + 1}:${parsed.col + 1}\n`);
    console.log(`  ${result.contents.split('\n').join('\n  ')}`);
    console.log('');
  });
}

async function handleDefinition(args: string[]): Promise<void> {
  const parsed = parseFileLineCol(args);
  if (!parsed) return;

  await withLspCleanup(async () => {
    const rootUri = process.cwd();
    const manager = getLspManager();
    const locations = await manager.definitionOf(parsed.file, parsed.line, parsed.col, rootUri);

    if (locations.length === 0) {
      console.log('  No definition found');
      return;
    }

    console.log(`\n  Definition of symbol at ${path.basename(parsed.file)}:${parsed.line + 1}:${parsed.col + 1}\n`);
    for (const loc of locations) {
      const p = uriToPath(loc.uri);
      console.log(`  ${p}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`);
    }
    console.log('');
  });
}

async function handleReferences(args: string[]): Promise<void> {
  const parsed = parseFileLineCol(args);
  if (!parsed) return;

  await withLspCleanup(async () => {
    const rootUri = process.cwd();
    const manager = getLspManager();
    const locations = await manager.referencesOf(parsed.file, parsed.line, parsed.col, rootUri);

    if (locations.length === 0) {
      console.log('  No references found');
      return;
    }

    console.log(`\n  References of symbol at ${path.basename(parsed.file)}:${parsed.line + 1}:${parsed.col + 1}\n`);
    console.log(`  Found ${locations.length} reference(s):\n`);
    for (const loc of locations) {
      const p = uriToPath(loc.uri);
      console.log(`  ${p}:${loc.range.start.line + 1}:${loc.range.start.character + 1}`);
    }
    console.log('');
  });
}

async function handleDiagnosticsCmd(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.error('  Usage: tenetx lsp diagnostics <file>');
    return;
  }

  const file = path.resolve(args[0]);

  await withLspCleanup(async () => {
    const rootUri = process.cwd();
    const manager = getLspManager();
    const diags = await manager.getDiagnostics(file, rootUri);

    if (diags.length === 0) {
      console.log('  No diagnostics');
      return;
    }

    console.log(`\n  Diagnostics for ${path.basename(file)}\n`);
    for (const d of diags) {
      const severity = d.severity.toUpperCase().padEnd(7);
      const pos = `${d.range.start.line + 1}:${d.range.start.character + 1}`;
      const source = d.source ? ` (${d.source})` : '';
      console.log(`  [${severity}] ${pos} — ${d.message}${source}`);
    }
    console.log('');
  });
}
