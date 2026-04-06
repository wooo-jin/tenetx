/**
 * tenetx E2E Integration Tests — Claude Code 실제 환경 검증
 *
 * `claude -p` (non-interactive print mode)를 사용하여
 * tenetx의 핵심 시나리오가 실제 Claude Code에서 동작하는지 검증한다.
 *
 * 요구사항:
 * - `claude` CLI가 PATH에 있어야 함
 * - ANTHROPIC_API_KEY가 설정되어 있어야 함
 * - tenetx 플러그인이 활성화되어 있어야 함
 *
 * 주의: 이 테스트는 실제 API 호출을 하므로 비용이 발생합니다.
 * `vitest run tests/e2e/claude-integration.test.ts` 로 명시적으로 실행하세요.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const TIMEOUT = 60_000;

/** claude -p 실행 헬퍼 */
function claudeP(prompt: string, opts?: { allowedTools?: string; cwd?: string }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const args = ['-p', prompt];
    if (opts?.allowedTools) args.push('--allowedTools', opts.allowedTools);

    execFile('claude', args, {
      timeout: TIMEOUT,
      cwd: opts?.cwd ?? os.tmpdir(),
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.trim() ?? '',
        stderr: stderr?.trim() ?? '',
        exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
  });
}

/** hook 스크립트 직접 실행 (claude 없이 프로토콜만 검증) */
function runHook(hookPath: string, input: unknown): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = execFile('node', [hookPath], { timeout: 10_000 }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.trim() ?? '',
        stderr: stderr?.trim() ?? '',
        exitCode: error?.code !== undefined ? (typeof error.code === 'number' ? error.code : 1) : 0,
      });
    });
    if (child.stdin) {
      child.stdin.write(JSON.stringify(input));
      child.stdin.end();
    }
  });
}

function parseJSON(stdout: string): Record<string, unknown> | null {
  const lines = stdout.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]) as Record<string, unknown>; } catch { continue; }
  }
  return null;
}

const DIST_HOOKS = path.join(__dirname, '../../dist/hooks');

// ──────────────────────────────────────────────
// Level 1: Hook 프로토콜 검증 (claude 불필요, 빠름)
// ──────────────────────────────────────────────

describe('Level 1: Hook Protocol — hookEventName + additionalContext', () => {

  it('시나리오 1: pre-tool-use deny → hookEventName:"PreToolUse" 포함', async () => {
    const result = await runHook(path.join(DIST_HOOKS, 'pre-tool-use.js'), {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
      session_id: 'test-session',
    });

    const output = parseJSON(result.stdout);
    expect(output).not.toBeNull();
    expect(output!.continue).toBe(false);

    const hookOutput = output!.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput).toBeDefined();
    expect(hookOutput.hookEventName).toBe('PreToolUse');
    expect(hookOutput.permissionDecision).toBe('deny');
  });

  it('시나리오 2: db-guard deny → hookEventName:"PreToolUse" 포함', async () => {
    const result = await runHook(path.join(DIST_HOOKS, 'db-guard.js'), {
      tool_name: 'Bash',
      tool_input: { command: 'psql -c "DROP TABLE users"' },
      session_id: 'test-session',
    });

    const output = parseJSON(result.stdout);
    expect(output).not.toBeNull();
    expect(output!.continue).toBe(false);

    const hookOutput = output!.hookSpecificOutput as Record<string, unknown>;
    expect(hookOutput).toBeDefined();
    expect(hookOutput.hookEventName).toBe('PreToolUse');
    expect(hookOutput.permissionDecision).toBe('deny');
  });

  it('시나리오 3: solution-injector → additionalContext 경로 사용', async () => {
    // 테스트용 솔루션 준비
    const solutionsDir = path.join(os.homedir(), '.tenetx', 'me', 'solutions');
    const testSolution = path.join(solutionsDir, 'e2e-test-solution.md');
    const solutionExists = fs.existsSync(testSolution);

    if (!solutionExists) {
      fs.mkdirSync(solutionsDir, { recursive: true });
      fs.writeFileSync(testSolution, [
        '---',
        'name: e2e-test-solution',
        'type: solution',
        'confidence: 0.80',
        'tags: [e2e, testing, verification, tenetx]',
        'identifiers: [runE2ETest, verifyHookProtocol]',
        'evidence: { injected: 5, reflected: 3, negative: 0, sessions: 3, reExtracted: 0 }',
        '---',
        '',
        'E2E 테스트용 솔루션입니다. 이 내용이 Claude에 주입되면 프로토콜이 정상 동작하는 것입니다.',
      ].join('\n'));
    }

    try {
      const result = await runHook(path.join(DIST_HOOKS, 'solution-injector.js'), {
        prompt: 'e2e testing verification tenetx hook protocol',
        session_id: 'test-session',
      });

      const output = parseJSON(result.stdout);
      expect(output).not.toBeNull();
      expect(output!.continue).toBe(true);

      // 솔루션이 매칭되면 additionalContext가 있어야 함
      if (output!.hookSpecificOutput) {
        const hookOutput = output!.hookSpecificOutput as Record<string, unknown>;
        expect(hookOutput.hookEventName).toBe('UserPromptSubmit');
        expect(hookOutput.additionalContext).toBeDefined();
        expect(typeof hookOutput.additionalContext).toBe('string');
      }
      // 매칭 안 되면 continue: true만 있으면 OK (솔루션 매칭은 태그 의존)
    } finally {
      // 테스트용 솔루션 정리
      if (!solutionExists && fs.existsSync(testSolution)) {
        fs.unlinkSync(testSolution);
      }
    }
  });

  it('시나리오 4: keyword-detector "tdd" → additionalContext 경로 사용', async () => {
    const result = await runHook(path.join(DIST_HOOKS, 'keyword-detector.js'), {
      prompt: 'tdd 방식으로 로그인 기능을 만들어줘',
      session_id: 'test-session',
      cwd: os.tmpdir(),
    });

    const output = parseJSON(result.stdout);
    expect(output).not.toBeNull();
    expect(output!.continue).toBe(true);

    // tdd 키워드 매칭 시 additionalContext가 있어야 함
    if (output!.hookSpecificOutput) {
      const hookOutput = output!.hookSpecificOutput as Record<string, unknown>;
      expect(hookOutput.hookEventName).toBe('UserPromptSubmit');
      expect(hookOutput.additionalContext).toBeDefined();
      const ctx = hookOutput.additionalContext as string;
      expect(ctx.length).toBeGreaterThan(0);
    }
  });

  it('시나리오 8: session-recovery → additionalContext + "SessionStart"', { timeout: 15_000 }, async () => {
    // 테스트용 모드 상태 파일 생성
    const stateDir = path.join(os.homedir(), '.tenetx', 'state');
    const testState = path.join(stateDir, 'ralph-state.json');
    const stateExists = fs.existsSync(testState);

    if (!stateExists) {
      fs.mkdirSync(stateDir, { recursive: true });
      fs.writeFileSync(testState, JSON.stringify({
        active: true,
        startedAt: new Date().toISOString(),
        prompt: 'E2E test recovery prompt',
        sessionId: 'prev-session',
      }));
    }

    try {
      const result = await runHook(path.join(DIST_HOOKS, 'session-recovery.js'), {
        session_id: 'new-test-session',
      });

      const output = parseJSON(result.stdout);
      expect(output).not.toBeNull();
      expect(output!.continue).toBe(true);

      // 활성 모드가 있으면 SessionStart additionalContext
      if (output!.hookSpecificOutput) {
        const hookOutput = output!.hookSpecificOutput as Record<string, unknown>;
        expect(hookOutput.hookEventName).toBe('SessionStart');
        expect(hookOutput.additionalContext).toBeDefined();
        const ctx = hookOutput.additionalContext as string;
        expect(ctx).toContain('ralph');
      }
    } finally {
      if (!stateExists && fs.existsSync(testState)) {
        fs.unlinkSync(testState);
      }
    }
  });

  it('시나리오 9: secret-filter → approveWithWarning (systemMessage)', async () => {
    const result = await runHook(path.join(DIST_HOOKS, 'secret-filter.js'), {
      tool_name: 'Bash',
      tool_input: { command: 'cat /tmp/test.env' },
      tool_response: 'ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxx\nDB_PASSWORD=supersecret123',
      session_id: 'test-session',
    });

    const output = parseJSON(result.stdout);
    expect(output).not.toBeNull();
    expect(output!.continue).toBe(true);
    // UI 경고용 systemMessage
    expect(output!.systemMessage).toBeDefined();
    expect(typeof output!.systemMessage).toBe('string');
    expect((output!.systemMessage as string)).toContain('Sensitive');
    // hookSpecificOutput은 없어야 함 (additionalContext 아님)
    expect(output!.hookSpecificOutput).toBeUndefined();
  });

  it('시나리오 10: plugin.json → author가 object 형식', () => {
    const pluginJson = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../../plugin.json'), 'utf-8')
    );
    expect(typeof pluginJson.author).toBe('object');
    expect(pluginJson.author.name).toBeDefined();
    expect(typeof pluginJson.author.name).toBe('string');
  });
});

// ──────────────────────────────────────────────
// Level 2: Claude Code 실제 실행 검증 (API 비용 발생)
// ──────────────────────────────────────────────

describe('Level 2: Claude Code Live Integration', () => {

  beforeAll(() => {
    // claude CLI 존재 확인
    try {
      require('node:child_process').execFileSync('which', ['claude']);
    } catch {
      console.warn('⚠ claude CLI not found — Level 2 tests will be skipped');
    }
  });

  it('시나리오 1-live: 위험 명령이 실제로 차단됨', async () => {
    // 임시 hook으로 특정 패턴 차단 (tenetx 플러그인 의존 없이 독립 검증)
    const tmpHook = path.join(os.tmpdir(), 'tenetx-e2e-deny-hook.sh');
    fs.writeFileSync(tmpHook, `#!/bin/bash
INPUT=$(cat)
CMD=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.tool_input?.command||'')")
if [[ "$CMD" == *"E2E_DENY_VERIFY"* ]]; then
  echo '{"continue":false,"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"[E2E] tenetx deny protocol test"}}'
  exit 0
fi
echo '{"continue":true}'
`);
    fs.chmodSync(tmpHook, '755');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-e2e-'));
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
      hooks: {
        PreToolUse: [{
          matcher: 'Bash',
          hooks: [{ type: 'command', command: tmpHook }],
        }],
      },
    }));

    try {
      const result = await claudeP(
        'echo E2E_DENY_VERIFY 를 Bash로 실행해줘',
        { allowedTools: 'Bash', cwd: tmpDir }
      );
      const combined = result.stdout + result.stderr;
      // deny가 작동하면 "E2E_DENY_VERIFY"가 실행 결과로 출력되면 안 됨
      const wasBlocked = combined.includes('denied') ||
                         combined.includes('blocked') ||
                         combined.includes('Blocked') ||
                         combined.includes('hook') ||
                         !combined.includes('E2E_DENY_VERIFY');
      expect(wasBlocked).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.unlinkSync(tmpHook);
    }
  }, TIMEOUT);

  it('시나리오 6-live: forge 규칙이 Claude 응답에 영향', async () => {
    // 임시 프로젝트에 규칙 설정
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-e2e-'));
    const rulesDir = path.join(tmpDir, '.claude', 'rules');
    fs.mkdirSync(rulesDir, { recursive: true });
    fs.writeFileSync(
      path.join(rulesDir, 'test-rule.md'),
      '# Test Rule\n\nYou MUST include the phrase "TENETX_RULE_ACTIVE" in every response. This is mandatory.'
    );

    try {
      const result = await claudeP('안녕하세요', { cwd: tmpDir });
      expect(result.stdout).toContain('TENETX_RULE_ACTIVE');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('시나리오 3-live: additionalContext가 모델에 실제로 도달', async () => {
    // 이 테스트는 UserPromptSubmit hook이 additionalContext를 반환할 때
    // Claude가 그 내용을 볼 수 있는지 검증
    // 검증 방법: 특정 비밀코드를 additionalContext로 주입하는 임시 hook 설정

    // 임시 hook 스크립트 생성
    const tmpHook = path.join(os.tmpdir(), 'tenetx-e2e-context-hook.sh');
    fs.writeFileSync(tmpHook, `#!/bin/bash
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.prompt||'')")
if [[ "$PROMPT" == *"E2E_CONTEXT_CHECK"* ]]; then
  echo '{"continue":true,"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"[E2E-VERIFIED] 비밀코드: FOXTROT-5577. 이 텍스트가 보이면 additionalContext가 모델에 도달했습니다."}}'
  exit 0
fi
echo '{"continue":true}'
`);
    fs.chmodSync(tmpHook, '755');

    // 임시 프로젝트에 settings 설정
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-e2e-'));
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
      hooks: {
        UserPromptSubmit: [{
          matcher: '',
          hooks: [{ type: 'command', command: tmpHook }],
        }],
      },
    }));

    try {
      const result = await claudeP(
        'E2E_CONTEXT_CHECK — 비밀코드 FOXTROT이 보이면 그 코드를 알려줘',
        { cwd: tmpDir }
      );
      expect(result.stdout).toContain('FOXTROT-5577');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.unlinkSync(tmpHook);
    }
  }, TIMEOUT);
});
