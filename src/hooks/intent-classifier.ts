#!/usr/bin/env node
/**
 * Tenetx — Intent Classifier Hook
 *
 * Claude Code UserPromptSubmit 훅으로 등록.
 * 사용자 프롬프트를 분석하여 의도를 분류하고, 의도별 가이드를 주입합니다.
 *
 * stdin: JSON { prompt: string, ... }
 * stdout: JSON { result: "approve", message?: string }
 */

import { readStdinJSON } from './shared/read-stdin.js';

type Intent = 'implement' | 'debug' | 'refactor' | 'explain' | 'review' | 'explore' | 'design' | 'general';

interface HookInput {
  prompt: string;
  session_id?: string;
  cwd?: string;
}

interface IntentRule {
  intent: Intent;
  pattern: RegExp;
}

const INTENT_RULES: IntentRule[] = [
  { intent: 'implement', pattern: /(?:만들어|추가해|구현해|생성해|작성해|넣어|create|add|implement|build|write|make)\b/i },
  { intent: 'debug', pattern: /(?:에러|버그|안돼|안\s*되|안\s*됨|왜|고쳐|수정해|fix|bug|error|debug|문제|실패|fail|crash|broken)/i },
  { intent: 'refactor', pattern: /(?:리팩토링|리팩터|정리|개선|refactor|clean\s*up|improve|optimize|최적화)/i },
  { intent: 'explain', pattern: /(?:설명|알려|뭐야|뭔가요|어떻게|explain|what\s+is|how\s+does|why\s+does|tell\s+me)/i },
  { intent: 'review', pattern: /(?:리뷰|검토|review|check|audit|평가)/i },
  { intent: 'explore', pattern: /(?:찾아|어디|검색|find|search|where|locate|grep|어디에|어디서)/i },
  { intent: 'design', pattern: /(?:설계|아키텍처|구조|design|architect|structure|다이어그램|diagram)/i },
];

const INTENT_HINTS: Record<Intent, string> = {
  implement: '구현 작업입니다. 테스트도 고려하세요.',
  debug: '디버깅 모드. 재현→격리→수정 순서로 접근하세요.',
  refactor: '리팩토링 작업. 기존 동작을 보존하면서 구조를 개선하세요.',
  explain: '설명 요청. 핵심 개념을 간결하게 전달하세요.',
  review: '코드 리뷰. 심각도별로 분류하여 피드백하세요.',
  explore: '탐색 작업. Glob/Grep으로 빠르게 찾으세요.',
  design: '설계 작업. 트레이드오프를 명시하세요.',
  general: '일반 요청.',
};

function classifyIntent(prompt: string): Intent {
  for (const rule of INTENT_RULES) {
    if (rule.pattern.test(prompt)) {
      return rule.intent;
    }
  }
  return 'general';
}

async function main(): Promise<void> {
  const input = await readStdinJSON<HookInput>();
  if (!input?.prompt) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const intent = classifyIntent(input.prompt);

  if (intent === 'general') {
    // 일반 요청은 힌트 없이 통과
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const hint = INTENT_HINTS[intent];
  console.log(JSON.stringify({
    result: 'approve',
    message: `[intent: ${intent}] ${hint}`,
  }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
