/**
 * LSP Detector — 사용 가능한 Language Server 탐지
 *
 * 시스템에 설치된 Language Server를 탐지하고
 * 파일 확장자에 맞는 서버를 매칭한다.
 */

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

export interface LanguageServerInfo {
  language: string;
  command: string;
  args: string[];
  available: boolean;
}

/** 알려진 Language Server 목록 */
const KNOWN_SERVERS: Omit<LanguageServerInfo, 'available'>[] = [
  { language: 'typescript', command: 'typescript-language-server', args: ['--stdio'] },
  { language: 'python', command: 'pylsp', args: [] },
  { language: 'python', command: 'pyright-langserver', args: ['--stdio'] },
  { language: 'go', command: 'gopls', args: ['serve'] },
  { language: 'rust', command: 'rust-analyzer', args: [] },
  { language: 'java', command: 'jdtls', args: [] },
];

/** 파일 확장자 → 언어 매핑 */
const EXT_TO_LANGUAGE: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'typescript',
  '.jsx': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.mjs': 'typescript',
  '.cjs': 'typescript',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.kt': 'java',
};

/** 명령이 시스템에 존재하는지 확인 */
function commandExists(command: string): boolean {
  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(whichCmd, [command], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** 시스템에서 사용 가능한 모든 Language Server를 탐지 */
export async function detectAvailableServers(): Promise<LanguageServerInfo[]> {
  return KNOWN_SERVERS.map((server) => ({
    ...server,
    available: commandExists(server.command),
  }));
}

/** 파일 경로에 맞는 Language Server를 반환 (설치된 것 중 첫 번째) */
export function getServerForFile(filePath: string): LanguageServerInfo | null {
  const ext = path.extname(filePath).toLowerCase();
  const language = EXT_TO_LANGUAGE[ext];
  if (!language) return null;

  for (const server of KNOWN_SERVERS) {
    if (server.language === language && commandExists(server.command)) {
      return { ...server, available: true };
    }
  }

  return null;
}

/** 특정 언어에 맞는 Language Server를 반환 (설치된 것 중 첫 번째) */
export function getServerForLanguage(language: string): LanguageServerInfo | null {
  for (const server of KNOWN_SERVERS) {
    if (server.language === language && commandExists(server.command)) {
      return { ...server, available: true };
    }
  }
  return null;
}

/** 알려진 서버 목록 (검사 없이) */
export function getKnownServers(): Omit<LanguageServerInfo, 'available'>[] {
  return [...KNOWN_SERVERS];
}
