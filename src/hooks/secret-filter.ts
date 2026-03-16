#!/usr/bin/env node
/**
 * Tenet — PostToolUse: Secret Filter Hook
 *
 * 도구 실행 결과에서 API 키, 토큰, 비밀번호 등 민감 정보 노출을 감지합니다.
 * 차단하지 않고 경고 메시지만 출력합니다.
 */

import { readStdinJSON } from './shared/read-stdin.js';

interface PostToolInput {
  tool_name?: string;
  toolName?: string;
  tool_input?: Record<string, unknown>;
  toolInput?: Record<string, unknown>;
  tool_response?: string;
  toolOutput?: string;
  session_id?: string;
}

export interface SecretPattern {
  name: string;
  pattern: RegExp;
}

export const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'API Key', pattern: /(sk|pk|api[_-]?key)[_-][\w\-.]{20,}/i },
  { name: 'AWS Access Key', pattern: /AKIA[\w]{16}/ },
  { name: 'Token/Bearer/JWT', pattern: /(token|bearer|jwt)[=:\s]["']?[\w\-.]{20,}/i },
  { name: 'Password', pattern: /(password|passwd|pwd)\s*[=:]\s*["']?[^\s"']{8,}/i },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----/ },
  { name: 'Connection String', pattern: /(mongodb|postgres|mysql|redis):\/\/\w+:[^@]+@/ },
];

/** 텍스트에서 민감 정보 패턴 감지 (순수 함수) */
export function detectSecrets(text: string): SecretPattern[] {
  const found: SecretPattern[] = [];
  for (const sp of SECRET_PATTERNS) {
    if (sp.pattern.test(text)) {
      found.push(sp);
    }
  }
  return found;
}

async function main(): Promise<void> {
  const data = await readStdinJSON<PostToolInput>();
  if (!data) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const toolName = data.tool_name ?? data.toolName ?? '';
  const toolResponse = data.tool_response ?? data.toolOutput ?? '';
  const toolInput = data.tool_input ?? data.toolInput ?? {};

  // Write/Edit/Bash 도구만 검사
  if (!['Write', 'Edit', 'Bash'].includes(toolName)) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  // 도구 입력 + 출력 모두 검사
  const inputStr = typeof toolInput === 'string' ? toolInput : JSON.stringify(toolInput);
  const textToScan = `${inputStr}\n${toolResponse}`;

  const secrets = detectSecrets(textToScan);
  if (secrets.length > 0) {
    const names = secrets.map(s => s.name).join(', ');
    console.log(JSON.stringify({
      result: 'approve',
      message: `<compound-security-warning>\n[Tenet] ⚠ 민감 정보 노출 감지: ${names}\n출력에 시크릿이 포함되어 있을 수 있습니다. 확인하세요.\n</compound-security-warning>`,
    }));
    return;
  }

  console.log(JSON.stringify({ result: 'approve' }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
