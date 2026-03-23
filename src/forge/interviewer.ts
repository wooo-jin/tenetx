/**
 * Tenetx Forge — Pain-Point Interviewer
 *
 * 자기 분류가 아닌 작업 스타일에 대한 대화형 질문.
 * 각 답변은 여러 차원에 동시에 영향을 줌.
 * 질문은 이전 답변과 스캔 결과에 따라 조건부로 표시.
 */

import * as readline from 'node:readline';
import type { ForgeQuestion, ProjectSignals, DimensionVector } from './types.js';
import { defaultDimensionVector, applyDeltas, clampDimension, CORE_DIMENSIONS } from './dimensions.js';

// ── Question Bank ───────────────────────────────────

export const FORGE_QUESTIONS: ForgeQuestion[] = [
  {
    id: 'ai-code-edit',
    text: 'AI가 제안한 코드를 얼마나 자주 수정하시나요?',
    options: [
      {
        text: '거의 수정 없이 그대로 사용',
        deltas: { autonomyPreference: 0.25, qualityFocus: -0.20 },
      },
      {
        text: '가끔 스타일이나 네이밍 수정',
        deltas: { autonomyPreference: 0.10, qualityFocus: 0.10 },
      },
      {
        text: '항상 로직까지 꼼꼼히 검토',
        deltas: { autonomyPreference: -0.25, qualityFocus: 0.25 },
      },
    ],
  },
  {
    id: 'pre-commit-check',
    text: '커밋하기 전에 보통 뭘 확인하시나요?',
    options: [
      {
        text: 'git diff만 빠르게 확인',
        deltas: { riskTolerance: 0.15, qualityFocus: -0.15, communicationStyle: 0.10 },
      },
      {
        text: '빌드/린트 통과 확인',
        deltas: { riskTolerance: -0.10, qualityFocus: 0.15 },
      },
      {
        text: '테스트 전체 통과 + 수동 확인',
        deltas: { riskTolerance: -0.25, qualityFocus: 0.25 },
      },
      {
        text: 'CI에 맡기고 바로 푸시',
        deltas: { riskTolerance: 0.25, autonomyPreference: 0.15 },
      },
    ],
  },
  {
    id: 'new-feature-start',
    text: '새 기능 구현을 시작할 때 먼저 하는 것은?',
    options: [
      {
        text: '바로 코드부터 작성',
        deltas: { abstractionLevel: -0.25, riskTolerance: 0.15 },
      },
      {
        text: '관련 코드 탐색 후 바로 구현',
        deltas: { abstractionLevel: -0.10, qualityFocus: 0.10 },
      },
      {
        text: '설계 스케치 또는 인터페이스 정의부터',
        deltas: { abstractionLevel: 0.25, qualityFocus: 0.15 },
      },
      {
        text: 'ADR/문서 작성부터',
        deltas: { abstractionLevel: 0.30, communicationStyle: -0.20 },
      },
    ],
  },
  {
    id: 'code-review-focus',
    text: '코드 리뷰에서 가장 신경 쓰는 부분은?',
    options: [
      {
        text: '동작 여부 (버그 없는지)',
        deltas: { qualityFocus: 0.10, abstractionLevel: -0.10 },
      },
      {
        text: '네이밍과 가독성',
        deltas: { qualityFocus: 0.15, communicationStyle: -0.10 },
      },
      {
        text: '아키텍처 적합성 / 의존성 방향',
        deltas: { abstractionLevel: 0.25, qualityFocus: 0.15 },
      },
      {
        text: '성능과 엣지 케이스',
        deltas: { qualityFocus: 0.25, riskTolerance: -0.15 },
      },
    ],
  },
  {
    id: 'ai-frustration',
    text: 'AI에게 가장 답답한 순간은?',
    options: [
      {
        text: '설명이 너무 길 때',
        deltas: { communicationStyle: 0.30, autonomyPreference: 0.10 },
      },
      {
        text: '확인 질문을 너무 많이 할 때',
        deltas: { autonomyPreference: 0.25, communicationStyle: 0.15 },
      },
      {
        text: '맥락을 놓치고 엉뚱한 코드를 작성할 때',
        deltas: { autonomyPreference: -0.15, qualityFocus: 0.15 },
      },
      {
        text: '위험한 변경을 경고 없이 할 때',
        deltas: { riskTolerance: -0.25, autonomyPreference: -0.20 },
      },
    ],
  },
  {
    id: 'time-waste',
    text: '프로젝트에서 가장 시간 낭비라고 느끼는 것은?',
    options: [
      {
        text: '과도한 리뷰/승인 프로세스',
        deltas: { riskTolerance: 0.20, autonomyPreference: 0.15, qualityFocus: -0.10 },
      },
      {
        text: '불명확한 요구사항으로 인한 재작업',
        deltas: { abstractionLevel: 0.15, communicationStyle: -0.15 },
      },
      {
        text: '기술 부채 누적으로 인한 디버깅',
        deltas: { qualityFocus: 0.25, abstractionLevel: 0.10 },
      },
      {
        text: '불필요한 추상화/오버엔지니어링',
        deltas: { abstractionLevel: -0.25, riskTolerance: 0.10 },
      },
    ],
  },
  {
    id: 'test-timing',
    text: '테스트를 언제 작성하시나요?',
    options: [
      {
        text: '버그가 발견됐을 때만',
        deltas: { qualityFocus: -0.25, riskTolerance: 0.15 },
      },
      {
        text: '핵심 로직에만 작성',
        deltas: { qualityFocus: 0.10, riskTolerance: 0.10 },
      },
      {
        text: '구현과 함께 작성',
        deltas: { qualityFocus: 0.15, riskTolerance: -0.10 },
      },
      {
        text: 'TDD: 테스트 먼저 작성',
        deltas: { qualityFocus: 0.30, riskTolerance: -0.20 },
      },
    ],
    condition: (_answers, signals) => {
      // 테스트 프레임워크가 있는 프로젝트에서만 질문
      return signals === null || signals.codeStyle.testFramework.length > 0
        || signals.codeStyle.testPattern !== 'none';
    },
  },
  {
    id: 'refactoring-timing',
    text: '리팩토링을 언제 하시나요?',
    options: [
      {
        text: '거의 하지 않음 (동작하면 건드리지 않음)',
        deltas: { riskTolerance: -0.15, abstractionLevel: -0.15 },
      },
      {
        text: '기능 추가할 때 필요한 부분만',
        deltas: { abstractionLevel: 0.10, riskTolerance: 0.10 },
      },
      {
        text: '정기적으로 코드 품질 개선 시간 확보',
        deltas: { abstractionLevel: 0.15, qualityFocus: 0.15 },
      },
      {
        text: 'AI에게 대규모 리팩토링 위임',
        deltas: { autonomyPreference: 0.25, riskTolerance: 0.15, abstractionLevel: 0.10 },
      },
    ],
  },
  {
    id: 'error-handling',
    text: '에러 처리에 대한 접근 방식은?',
    options: [
      {
        text: 'happy path 우선, 에러는 나중에',
        deltas: { riskTolerance: 0.25, qualityFocus: -0.15 },
      },
      {
        text: '주요 에러만 try-catch',
        deltas: { riskTolerance: 0.10, qualityFocus: 0.10 },
      },
      {
        text: '모든 에러 경로를 미리 설계',
        deltas: { riskTolerance: -0.25, qualityFocus: 0.25, abstractionLevel: 0.15 },
      },
    ],
  },
  {
    id: 'doc-preference',
    text: 'AI 응답에서 선호하는 형식은?',
    options: [
      {
        text: '코드만, 설명 최소',
        deltas: { communicationStyle: 0.30, autonomyPreference: 0.10 },
      },
      {
        text: '코드 + 핵심 포인트 요약',
        deltas: { communicationStyle: 0.10 },
      },
      {
        text: '상세 설명 + 대안 제시 + 코드',
        deltas: { communicationStyle: -0.25, abstractionLevel: 0.10 },
      },
    ],
  },
];

// ── Interview Engine ────────────────────────────────

/** 조건 필터링된 질문 목록 반환 */
export function getActiveQuestions(
  answers: Record<string, number>,
  signals: ProjectSignals | null,
): ForgeQuestion[] {
  return FORGE_QUESTIONS.filter(q => {
    if (!q.condition) return true;
    return q.condition(answers, signals);
  });
}

/** 인터뷰 답변으로부터 차원 벡터 계산 */
export function answersToDeltas(
  answers: Record<string, number>,
): DimensionVector {
  let dims = defaultDimensionVector();

  for (const q of FORGE_QUESTIONS) {
    const selectedIdx = answers[q.id];
    if (selectedIdx === undefined || selectedIdx < 0 || selectedIdx >= q.options.length) continue;
    const deltas = q.options[selectedIdx].deltas;
    dims = applyDeltas(dims, deltas);
  }

  return dims;
}

/** 대화형 인터뷰 실행 (TTY 전용) */
export async function runInterview(
  signals: ProjectSignals | null,
): Promise<{ answers: Record<string, number>; dimensions: DimensionVector }> {
  const answers: Record<string, number> = {};

  if (!process.stdin.isTTY) {
    console.log('  [forge] Non-interactive mode: skipping interview');
    return { answers, dimensions: defaultDimensionVector() };
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const questions = getActiveQuestions(answers, signals);

  console.log('\n  Forge Interview');
  console.log('  ─────────────────────────────────────────');
  console.log(`  ${questions.length}개 질문에 답해주세요. 번호를 입력하세요.\n`);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];

    // 이전 답변에 따른 조건 재확인
    if (q.condition && !q.condition(answers, signals)) continue;

    console.log(`  [${i + 1}/${questions.length}] ${q.text}`);
    for (let j = 0; j < q.options.length; j++) {
      console.log(`    ${j + 1}) ${q.options[j].text}`);
    }

    const answer = await new Promise<string>(resolve => {
      rl.question('  > ', resolve);
    });

    const idx = parseInt(answer.trim(), 10) - 1;
    if (idx >= 0 && idx < q.options.length) {
      answers[q.id] = idx;
    } else {
      // 잘못된 입력: 기본값 (첫 번째 선택지)
      console.log('    (잘못된 입력, 건너뜀)');
    }

    console.log('');
  }

  rl.close();

  const dimensions = answersToDeltas(answers);

  return { answers, dimensions };
}

/** 비대화형 인터뷰 (사전 정의된 답변 사용) */
export function applyPresetAnswers(
  presetAnswers: Record<string, number>,
  signals: ProjectSignals | null,
): { answers: Record<string, number>; dimensions: DimensionVector } {
  const answers: Record<string, number> = {};
  const questions = getActiveQuestions(presetAnswers, signals);

  for (const q of questions) {
    const idx = presetAnswers[q.id];
    if (idx !== undefined && idx >= 0 && idx < q.options.length) {
      answers[q.id] = idx;
    }
  }

  return { answers, dimensions: answersToDeltas(answers) };
}
