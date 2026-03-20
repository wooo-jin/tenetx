/**
 * Tenetx — Notepad 코어 모듈
 *
 * .compound/notepad.md 파일을 관리합니다.
 * compaction(컨텍스트 압축)에서 살아남는 영구 컨텍스트 노트 저장소로,
 * 세션이 바뀌어도 유지되어야 하는 중요 메모를 보관합니다.
 *
 * 사용 위치: {프로젝트루트}/.compound/notepad.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { projectDir } from './paths.js';

/** {repo}/.compound/notepad.md 경로 반환 */
export function getNotepadPath(cwd: string): string {
  return path.join(projectDir(cwd), 'notepad.md');
}

/** notepad.md 내용 읽기. 파일이 없으면 빈 문자열 반환. */
export function readNotepad(cwd: string): string {
  const filePath = getNotepadPath(cwd);
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

/** notepad.md 전체를 content로 덮어쓰기. 부모 디렉토리가 없으면 자동 생성. */
export function writeNotepad(cwd: string, content: string): void {
  const filePath = getNotepadPath(cwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * notepad.md 끝에 타임스탬프와 함께 항목 추가.
 * 형식: `\n## [YYYY-MM-DD HH:mm]\n{entry}\n`
 */
export function appendToNotepad(cwd: string, entry: string): void {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const block = `\n## [${timestamp}]\n${entry}\n`;

  const filePath = getNotepadPath(cwd);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, block, 'utf-8');
}

/** notepad.md 내용 초기화 (빈 파일로 덮어쓰기). */
export function clearNotepad(cwd: string): void {
  writeNotepad(cwd, '');
}

/**
 * CLI 핸들러: `tenetx notepad <show|add|edit|clear>`
 *
 * - show: 현재 notepad 내용 출력
 * - add "내용": 타임스탬프와 함께 항목 추가
 * - edit: notepad.md 파일 경로 출력 (에디터에서 직접 편집용)
 * - clear: notepad 초기화
 */
export async function handleNotepad(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'show';
  const cwd = process.env.COMPOUND_CWD ?? process.cwd();

  if (subcommand === 'show') {
    const content = readNotepad(cwd);
    if (!content.trim()) {
      console.log('  (notepad is empty)');
    } else {
      console.log(content);
    }
  } else if (subcommand === 'add') {
    const entry = args.slice(1).join(' ');
    if (!entry) {
      console.error('  Usage: tenetx notepad add "content to add"');
      process.exit(1);
    }
    appendToNotepad(cwd, entry);
    console.log('  Added to notepad.');
  } else if (subcommand === 'edit') {
    const filePath = getNotepadPath(cwd);
    console.log(`  Notepad file path: ${filePath}`);
    console.log(`  Open with your editor: $EDITOR ${filePath}`);
  } else if (subcommand === 'clear') {
    clearNotepad(cwd);
    console.log('  Notepad cleared.');
  } else {
    console.log('  Usage: tenetx notepad <show|add|edit|clear>');
  }
}
