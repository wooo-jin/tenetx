/**
 * tenetx verify — 자동 검증/리뷰/가드닝 CLI
 *
 * - tenetx verify              → 전체 verify loop (빌드+테스트+제약)
 * - tenetx verify --review     → 변경 파일 리뷰 루프
 * - tenetx verify --gardening  → 지식 유지보수 루프
 * - tenetx verify --all        → 세 루프 모두 실행
 */

import { runVerifyLoop, formatVerifyResult } from '../engine/loops/verify-loop.js';
import { runReviewLoop, formatReviewResult } from '../engine/loops/review-loop.js';
import { runGardeningLoop, formatGardeningResult } from '../engine/loops/gardening-loop.js';

export async function handleVerify(args: string[]): Promise<void> {
  const cwd = process.cwd();

  console.log('\n  Tenetx — Verify\n');

  const runAll = args.includes('--all');
  const runReview = args.includes('--review') || runAll;
  const runGardening = args.includes('--gardening') || runAll;
  const runVerify = !runReview && !runGardening || runAll || args.length === 0;

  if (runVerify) {
    const result = runVerifyLoop({ cwd });
    console.log(formatVerifyResult(result));
    console.log('');
  }

  if (runReview) {
    const result = runReviewLoop({ cwd });
    console.log(formatReviewResult(result));
    console.log('');
  }

  if (runGardening) {
    const result = runGardeningLoop({ cwd });
    console.log(formatGardeningResult(result));
    console.log('');
  }
}
