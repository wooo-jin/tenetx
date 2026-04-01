#!/usr/bin/env node
/**
 * Tenetx — Notepad Injector Hook
 *
 * Claude Code UserPromptSubmit 훅으로 등록.
 * notepad.md에 저장된 영구 컨텍스트를 사용자 프롬프트 앞에 자동 주입합니다.
 *
 * compaction(컨텍스트 압축) 후에도 notepad의 내용은 매 프롬프트마다
 * <tenetx-notepad> 태그로 재주입되어 컨텍스트에서 사라지지 않습니다.
 *
 * stdin:  JSON { prompt: string, ... }
 * stdout: JSON { result: "approve", message?: string }
 *
 * notepad 경로 결정 우선순위:
 *   1. COMPOUND_CWD 환경변수
 *   2. process.cwd()
 */

import { readStdinJSON } from './shared/read-stdin.js';
import { readNotepad } from '../core/notepad.js';
import { isHookEnabled } from './hook-config.js';
import { truncateContent } from './shared/injection-caps.js';
import { calculateBudget } from './shared/context-budget.js';
import { approve, approveWithContext, failOpen } from './shared/hook-response.js';

interface HookInput {
  prompt: string;
  session_id?: string;
  cwd?: string;
}

// ── 메인 ──

async function main(): Promise<void> {
  const input = await readStdinJSON<HookInput>();
  if (!isHookEnabled('notepad-injector')) {
    console.log(approve());
    return;
  }
  if (!input?.prompt) {
    console.log(approve());
    return;
  }

  const effectiveCwd = input.cwd ?? process.env.COMPOUND_CWD ?? process.cwd();
  const notepadContent = readNotepad(effectiveCwd);

  if (!notepadContent.trim()) {
    // notepad가 비어있으면 아무것도 주입하지 않음
    console.log(approve());
    return;
  }

  // 태그 이스케이프: notepad 내용 내의 닫는 태그를 안전하게 처리
  const safeContent = truncateContent(notepadContent.trim(), calculateBudget(effectiveCwd).notepadMax)
    .replace(/<\/tenetx-notepad>/g, '&lt;/tenetx-notepad&gt;');
  const injection = `<tenetx-notepad>\n${safeContent}\n</tenetx-notepad>`;

  console.log(approveWithContext(injection, 'UserPromptSubmit'));
}

main().catch((e) => {
  process.stderr.write(`[ch-hook] ${e instanceof Error ? e.message : String(e)}\n`);
  console.log(failOpen());
});
