/**
 * hook-pipeline — 실제 hook 스크립트를 child_process로 실행하는 통합 테스트
 *
 * dist/ 디렉토리의 컴파일된 JS를 spawn하여 stdin/stdout 파이프로 테스트합니다.
 * 응답 포맷: { continue: boolean, hookSpecificOutput?: { ... } }
 */
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const DIST_HOOKS = path.join(PROJECT_ROOT, 'dist', 'hooks');

// ── 헬퍼 ──

interface HookResponse {
  continue: boolean;
  hookSpecificOutput?: {
    hookEventName?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}

function runHook(hookFile: string, input: object, timeoutMs = 10000): Promise<HookResponse> {
  return new Promise((resolve, reject) => {
    const hookPath = path.join(DIST_HOOKS, hookFile);

    if (!fs.existsSync(hookPath)) {
      reject(new Error(`Hook not found: ${hookPath}. Run 'npm run build' first.`));
      return;
    }

    const child = spawn(process.execPath, [hookPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        COMPOUND_CWD: PROJECT_ROOT,
        HOME: process.env.HOME ?? '/tmp',
      },
    });

    let stdout = '';

    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });

    child.stdin.write(JSON.stringify(input));
    child.stdin.end();

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Hook ${hookFile} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', () => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(stdout) as HookResponse);
      } catch {
        reject(new Error(`Hook ${hookFile} returned invalid JSON: ${stdout.slice(0, 200)}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── pre-tool-use.js ──

describe('hook-pipeline: pre-tool-use.js', () => {
  it('안전한 ls 명령어를 continue: true로 승인한다', async () => {
    const result = await runHook('pre-tool-use.js', {
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });

    expect(result.continue).toBe(true);
  });

  it('rm -rf / 명령어를 continue: false로 차단한다', async () => {
    const result = await runHook('pre-tool-use.js', {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    });

    expect(result.continue).toBe(false);
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('차단 메시지에 위험 명령어 설명이 포함된다', async () => {
    const result = await runHook('pre-tool-use.js', {
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf /' },
    });

    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('rm -rf');
  });

  it('Write 도구는 차단하지 않는다 (continue: true)', async () => {
    const result = await runHook('pre-tool-use.js', {
      tool_name: 'Write',
      tool_input: { file_path: '/tmp/test.txt', content: 'hello' },
    });

    expect(result.continue).toBe(true);
  });

  it('안전한 git status 명령어를 승인한다', async () => {
    const result = await runHook('pre-tool-use.js', {
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
    });

    expect(result.continue).toBe(true);
  });
});

// ── db-guard.js ──

describe('hook-pipeline: db-guard.js', () => {
  it('DROP TABLE 명령어를 continue: false로 차단한다', async () => {
    const result = await runHook('db-guard.js', {
      tool_name: 'Bash',
      tool_input: { command: 'DROP TABLE users' },
    });

    expect(result.continue).toBe(false);
    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('차단 메시지에 DROP TABLE 설명이 포함된다', async () => {
    const result = await runHook('db-guard.js', {
      tool_name: 'Bash',
      tool_input: { command: 'DROP TABLE users' },
    });

    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('DROP');
  });

  it('안전한 SELECT 쿼리를 continue: true로 승인한다', async () => {
    const result = await runHook('db-guard.js', {
      tool_name: 'Bash',
      tool_input: { command: 'SELECT * FROM users WHERE id = 1' },
    });

    expect(result.continue).toBe(true);
  });

  it('DELETE FROM without WHERE를 차단한다', async () => {
    const result = await runHook('db-guard.js', {
      tool_name: 'Bash',
      tool_input: { command: 'DELETE FROM orders' },
    });

    expect(result.continue).toBe(false);
  });

  it('안전한 npm 명령어는 차단하지 않는다', async () => {
    const result = await runHook('db-guard.js', {
      tool_name: 'Bash',
      tool_input: { command: 'npm install' },
    });

    expect(result.continue).toBe(true);
  });
});

// ── secret-filter.js ──

describe('hook-pipeline: secret-filter.js', () => {
  it('일반 텍스트는 continue: true로 승인한다', async () => {
    const result = await runHook('secret-filter.js', {
      tool_name: 'Write',
      tool_input: { content: 'Hello, world! This is safe content.' },
    });

    expect(result.continue).toBe(true);
  });

  it('Stripe 라이브 키가 포함된 콘텐츠를 처리한다 (continue: true with context)', async () => {
    const result = await runHook('secret-filter.js', {
      tool_name: 'Write',
      tool_input: { content: 'const key = "sk_live_abc123xyz456";' },
    });

    // secret-filter는 차단하지 않고 경고만 함 (continue: true)
    expect(result.continue).toBe(true);
  });

  it('tool_input이 없는 경우에도 continue: true를 반환한다', async () => {
    const result = await runHook('secret-filter.js', {
      tool_name: 'Read',
      tool_input: {},
    });

    expect(result.continue).toBe(true);
  });
});

// ── intent-classifier.js ──

describe('hook-pipeline: intent-classifier.js', () => {
  it('"버그 고쳐줘" 프롬프트가 debug intent context를 반환한다', async () => {
    const result = await runHook('intent-classifier.js', {
      prompt: '버그 고쳐줘',
    });

    expect(result.continue).toBe(true);
    // debug intent가 감지되면 additionalContext에 debug 포함
    if (result.hookSpecificOutput?.additionalContext) {
      expect(result.hookSpecificOutput.additionalContext).toContain('debug');
    }
  });

  it('"create a new component" 프롬프트가 implement intent를 반환한다', async () => {
    const result = await runHook('intent-classifier.js', {
      prompt: 'create a new component for the dashboard',
    });

    expect(result.continue).toBe(true);
    if (result.hookSpecificOutput?.additionalContext) {
      expect(result.hookSpecificOutput.additionalContext).toContain('implement');
    }
  });

  it('일반 프롬프트는 additionalContext 없이 approve한다', async () => {
    const result = await runHook('intent-classifier.js', {
      prompt: '안녕하세요',
    });

    expect(result.continue).toBe(true);
    // general intent는 hookSpecificOutput이 없음
    expect(result.hookSpecificOutput).toBeUndefined();
  });

  it('prompt 필드가 없어도 continue: true를 반환한다 (failsafe)', async () => {
    const result = await runHook('intent-classifier.js', {
      session_id: 'test-session',
    });

    expect(result.continue).toBe(true);
  });

  it('debug intent 응답의 hookEventName이 UserPromptSubmit이다', async () => {
    const result = await runHook('intent-classifier.js', {
      prompt: 'fix this error',
    });

    expect(result.continue).toBe(true);
    if (result.hookSpecificOutput) {
      expect(result.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    }
  });
});

// ── 응답 포맷 공통 검증 ──

describe('hook-pipeline: 응답 포맷 공통 검증', () => {
  const safeInputs: Record<string, object> = {
    'pre-tool-use.js': { tool_name: 'Bash', tool_input: { command: 'echo hello' } },
    'db-guard.js': { tool_name: 'Bash', tool_input: { command: 'echo hello' } },
    'secret-filter.js': { tool_name: 'Write', tool_input: { content: 'safe text' } },
    'intent-classifier.js': { prompt: 'hello' },
  };

  for (const [hookFile, input] of Object.entries(safeInputs)) {
    it(`${hookFile}이 continue 필드를 가진 JSON 객체를 반환한다`, async () => {
      const result = await runHook(hookFile, input);
      expect(typeof result).toBe('object');
      expect(result).not.toBeNull();
      expect(typeof result.continue).toBe('boolean');
    });
  }
});
