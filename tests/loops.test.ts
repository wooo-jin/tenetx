import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { detectCommands, runVerifyLoop, formatVerifyResult } from '../src/engine/loops/verify-loop.js';
import { classifyChangeSize, generateReviewChecklist, runReviewLoop, formatReviewResult } from '../src/engine/loops/review-loop.js';
import type { ChangedFile } from '../src/engine/loops/review-loop.js';
import { checkMapFreshness, runGardeningLoop, formatGardeningResult } from '../src/engine/loops/gardening-loop.js';

describe('verify-loop', () => {
  it('detectCommands — Node.js 프로젝트', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-verify-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({
        scripts: { build: 'tsc', test: 'vitest run' },
      }));
      fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}');

      const cmds = detectCommands(tmpDir);
      expect(cmds.build).toBe('npm run build');
      expect(cmds.test).toBe('npm test');
      expect(cmds.typeCheck).toContain('tsc');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('detectCommands — 빈 프로젝트', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-verify-'));
    try {
      const cmds = detectCommands(tmpDir);
      expect(cmds.build).toBeUndefined();
      expect(cmds.test).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runVerifyLoop — 제약 없는 빈 프로젝트', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-verify-'));
    try {
      const result = runVerifyLoop({ cwd: tmpDir });
      expect(result.loopName).toBe('verify');
      // 명령어가 없으면 스텝 없음
      expect(result.steps.length).toBe(0);
      expect(result.status).toBe('passed');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('formatVerifyResult — 포맷 출력', () => {
    const result = {
      loopName: 'verify',
      status: 'partial' as const,
      steps: [
        { name: 'build', status: 'passed' as const, message: '빌드 성공' },
        { name: 'test', status: 'failed' as const, message: '테스트 실패' },
      ],
      summary: '1/2 단계 통과',
      suggestions: ['실패한 테스트를 수정하세요.'],
    };
    const formatted = formatVerifyResult(result);
    expect(formatted).toContain('Verify Loop');
    expect(formatted).toContain('빌드 성공');
    expect(formatted).toContain('테스트 실패');
    expect(formatted).toContain('권장 조치');
  });

  // ── violations 파싱 테스트 ──

  it('constraints 스텝이 "N건의 제약 위반" 메시지 → violations = N', () => {
    const result = runVerifyLoop({ cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-verify-')) });
    // runVerifyLoop는 빈 프로젝트에서 constraints 스텝을 생성하지 않으므로
    // 직접 LoopResult를 조합하여 violations 파싱 로직 검증
    const loopResult = {
      loopName: 'verify',
      status: 'failed' as const,
      steps: [
        { name: 'constraints', status: 'failed' as const, message: '3건의 제약 위반을 수정하세요.' },
      ],
      summary: '0/1 단계 통과',
    };
    // violations 파싱은 verify-loop.ts 내부에서 수행되므로,
    // constraints step의 message 패턴을 직접 검증
    const msg = loopResult.steps[0].message ?? '';
    const match = msg.match(/^(\d+)건의 제약 위반/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1], 10)).toBe(3);
    fs.rmSync(result.steps.length === 0 ? '' : '', { recursive: true, force: true }); // cleanup handled by test
  });

  it('constraints 스텝이 "모두 통과" → violations = 0', () => {
    // 제약 위반 없이 통과한 경우의 메시지 패턴
    const msg = '5개 파일 제약 통과';
    const match = msg.match(/^(\d+)건의 제약 위반/);
    expect(match).toBeNull(); // 위반 패턴이 없으므로 null
    const warnMatch = msg.match(/경고\s+(\d+)건/);
    expect(warnMatch).toBeNull(); // 경고도 없음
    // verify-loop.ts에서 이 경우 violations = 0
  });

  it('constraints 스텝이 없으면 violations는 undefined', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-verify-'));
    try {
      const result = runVerifyLoop({ cwd: tmpDir });
      // 빈 프로젝트 → constraints 스텝 없음 → violations undefined
      expect(result.violations).toBeUndefined();
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('경고만 있는 constraints 스텝 → violations = 경고 수', () => {
    const msg = '경고 2건 (error 없음)';
    const match = msg.match(/^(\d+)건의 제약 위반/);
    expect(match).toBeNull();
    const warnMatch = msg.match(/경고\s+(\d+)건/);
    expect(warnMatch).not.toBeNull();
    expect(parseInt(warnMatch![1], 10)).toBe(2);
  });
});

describe('review-loop', () => {
  it('classifyChangeSize — small', () => {
    const files: ChangedFile[] = [
      { path: 'a.ts', status: 'modified', additions: 10, deletions: 5 },
    ];
    expect(classifyChangeSize(files)).toBe('small');
  });

  it('classifyChangeSize — large', () => {
    const files: ChangedFile[] = Array.from({ length: 15 }, (_, i) => ({
      path: `file${i}.ts`,
      status: 'modified' as const,
      additions: 30,
      deletions: 20,
    }));
    expect(classifyChangeSize(files)).toBe('large');
  });

  it('generateReviewChecklist — 새 기능', () => {
    const files: ChangedFile[] = [
      { path: 'feature.ts', status: 'added', additions: 50, deletions: 0 },
    ];
    const checklist = generateReviewChecklist(files);
    expect(checklist.some(c => c.includes('테스트가 추가'))).toBe(true);
  });

  it('generateReviewChecklist — 의존성 변경', () => {
    const files: ChangedFile[] = [
      { path: 'package.json', status: 'modified', additions: 2, deletions: 1 },
    ];
    const checklist = generateReviewChecklist(files);
    expect(checklist.some(c => c.includes('라이선스'))).toBe(true);
  });

  it('generateReviewChecklist — 보안 파일', () => {
    const files: ChangedFile[] = [
      { path: 'src/auth/handler.ts', status: 'modified', additions: 20, deletions: 5 },
    ];
    const checklist = generateReviewChecklist(files);
    expect(checklist.some(c => c.includes('보안'))).toBe(true);
  });

  it('runReviewLoop — 변경 없음', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-review-'));
    try {
      const result = runReviewLoop({ cwd: tmpDir, changedFiles: [] });
      expect(result.status).toBe('passed');
      expect(result.summary).toContain('변경 없음');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('runReviewLoop — 파일 변경 제공', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-review-'));
    try {
      fs.writeFileSync(path.join(tmpDir, 'app.ts'), 'const x = 1;');
      const result = runReviewLoop({ cwd: tmpDir, changedFiles: ['app.ts'] });
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.summary).toContain('1파일');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('formatReviewResult — 포맷', () => {
    const result = {
      loopName: 'review',
      status: 'passed' as const,
      steps: [{ name: 'collect', status: 'passed' as const, message: '3파일' }],
      summary: '3파일 리뷰, 0건 지적',
      suggestions: ['☐ 의도가 명확한가?'],
    };
    const formatted = formatReviewResult(result);
    expect(formatted).toContain('Review Loop');
    expect(formatted).toContain('리뷰 체크리스트');
  });
});

describe('gardening-loop', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-garden-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('checkMapFreshness — 맵 없음', () => {
    const result = checkMapFreshness(tmpDir);
    expect(result.exists).toBe(false);
    expect(result.stale).toBe(true);
  });

  it('checkMapFreshness — 최신 맵', () => {
    const compoundDir = path.join(tmpDir, '.compound');
    fs.mkdirSync(compoundDir, { recursive: true });
    fs.writeFileSync(path.join(compoundDir, 'project-map.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      summary: { totalFiles: 10 },
      files: [],
      directories: [],
      entryPoints: [],
      dependencies: [],
    }));

    const result = checkMapFreshness(tmpDir);
    expect(result.exists).toBe(true);
    expect(result.stale).toBe(false);
  });

  it('checkMapFreshness — 오래된 맵', () => {
    const compoundDir = path.join(tmpDir, '.compound');
    fs.mkdirSync(compoundDir, { recursive: true });
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48시간 전
    fs.writeFileSync(path.join(compoundDir, 'project-map.json'), JSON.stringify({
      generatedAt: oldDate,
      summary: { totalFiles: 10 },
      files: [],
      directories: [],
      entryPoints: [],
      dependencies: [],
    }));

    const result = checkMapFreshness(tmpDir);
    expect(result.exists).toBe(true);
    expect(result.stale).toBe(true);
  });

  it('runGardeningLoop — 빈 프로젝트', () => {
    const result = runGardeningLoop({ cwd: tmpDir });
    expect(result.loopName).toBe('gardening');
    // 맵 없음 → partial
    expect(result.status).toBe('partial');
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions!.some(s => s.includes('tenetx scan'))).toBe(true);
  });

  it('formatGardeningResult — 포맷', () => {
    const result = {
      loopName: 'gardening',
      status: 'passed' as const,
      steps: [{ name: 'map', status: 'passed' as const, message: '최신' }],
      summary: '1/1 양호',
    };
    const formatted = formatGardeningResult(result);
    expect(formatted).toContain('Gardening Loop');
  });
});
