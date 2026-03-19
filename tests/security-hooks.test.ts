import { describe, it, expect } from 'vitest';
import { detectSecrets, SECRET_PATTERNS } from '../src/hooks/secret-filter.js';
import { checkDangerousSql, DANGEROUS_SQL_PATTERNS } from '../src/hooks/db-guard.js';
import { checkRateLimit } from '../src/hooks/rate-limiter.js';

// ── Secret Filter 테스트 ──

describe('secret-filter', () => {
  it('SECRET_PATTERNS가 6개 이상 정의됨', () => {
    expect(SECRET_PATTERNS.length).toBeGreaterThanOrEqual(6);
  });

  it('API 키를 감지한다 (sk-...)', () => {
    const found = detectSecrets('config: sk-abcdefghijklmnopqrstuvwxyz');
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('API Key');
  });

  it('API 키를 감지한다 (api_key-...)', () => {
    const found = detectSecrets('api_key-12345678901234567890');
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('API Key');
  });

  it('AWS Access Key를 감지한다', () => {
    const found = detectSecrets('aws_key = AKIAIOSFODNN7EXAMPLE');
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('AWS Access Key');
  });

  it('Bearer 토큰을 감지한다', () => {
    const found = detectSecrets('Authorization: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc');
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some(f => f.name === 'Token/Bearer/JWT')).toBe(true);
  });

  it('비밀번호를 감지한다', () => {
    const found = detectSecrets('password = "MySecretP@ss123"');
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('Password');
  });

  it('Private Key를 감지한다', () => {
    const found = detectSecrets('-----BEGIN RSA PRIVATE KEY-----\nMIIE...');
    expect(found.length).toBe(1);
    expect(found[0].name).toBe('Private Key');
  });

  it('Connection String을 감지한다', () => {
    const found = detectSecrets('DATABASE_URL=postgres://admin:secret@db.host:5432/mydb');
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found.some(f => f.name === 'Connection String')).toBe(true);
  });

  it('안전한 텍스트에서는 감지하지 않는다', () => {
    expect(detectSecrets('Hello world')).toHaveLength(0);
    expect(detectSecrets('const x = 42;')).toHaveLength(0);
    expect(detectSecrets('npm install express')).toHaveLength(0);
  });

  it('여러 패턴을 동시에 감지한다', () => {
    const text = 'sk-abc12345678901234567890\npassword = "hunter2hunter2"';
    const found = detectSecrets(text);
    expect(found.length).toBeGreaterThanOrEqual(2);
  });
});

// ── DB Guard 테스트 ──

describe('db-guard', () => {
  it('DANGEROUS_SQL_PATTERNS가 5개 이상 정의됨', () => {
    expect(DANGEROUS_SQL_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });

  it('DROP TABLE을 차단한다', () => {
    const result = checkDangerousSql('Bash', { command: 'mysql -e "DROP TABLE users;"' });
    expect(result.action).toBe('block');
  });

  it('DROP DATABASE를 차단한다', () => {
    const result = checkDangerousSql('Bash', { command: 'psql -c "DROP DATABASE production"' });
    expect(result.action).toBe('block');
  });

  it('TRUNCATE TABLE을 차단한다', () => {
    const result = checkDangerousSql('Bash', { command: 'mysql -e "TRUNCATE TABLE logs;"' });
    expect(result.action).toBe('block');
  });

  it('WHERE 없는 DELETE를 차단한다', () => {
    const result = checkDangerousSql('Bash', { command: 'psql -c "DELETE FROM users;"' });
    expect(result.action).toBe('block');
  });

  it('WHERE 있는 DELETE는 통과한다', () => {
    const result = checkDangerousSql('Bash', { command: 'psql -c "DELETE FROM users WHERE id = 1;"' });
    expect(result.action).toBe('pass');
  });

  it('ALTER TABLE DROP COLUMN을 경고한다', () => {
    const result = checkDangerousSql('Bash', { command: 'mysql -e "ALTER TABLE users DROP COLUMN email"' });
    expect(result.action).toBe('warn');
  });

  it('안전한 SQL은 통과한다', () => {
    expect(checkDangerousSql('Bash', { command: 'psql -c "SELECT * FROM users;"' }).action).toBe('pass');
    expect(checkDangerousSql('Bash', { command: 'mysql -e "INSERT INTO users VALUES (1, \'test\');"' }).action).toBe('pass');
  });

  it('Bash 이외의 도구는 항상 pass', () => {
    expect(checkDangerousSql('Read', { command: 'DROP TABLE users;' }).action).toBe('pass');
  });

  it('문자열 입력도 처리한다', () => {
    const result = checkDangerousSql('Bash', 'DROP TABLE users;');
    expect(result.action).toBe('block');
  });

  // ── SQL 주석 처리 테스트 ──

  it('라인 주석 안의 DELETE는 차단하지 않는다', () => {
    const result = checkDangerousSql('Bash', { command: '-- DELETE FROM users' });
    expect(result.action).toBe('pass');
  });

  it('WHERE 절이 있는 DELETE는 차단하지 않는다', () => {
    const result = checkDangerousSql('Bash', { command: 'DELETE FROM users WHERE id=1' });
    expect(result.action).toBe('pass');
  });

  it('WHERE 절이 없는 DELETE는 차단한다', () => {
    const result = checkDangerousSql('Bash', { command: 'DELETE FROM users' });
    expect(result.action).toBe('block');
  });

  it('블록 주석 안의 DROP TABLE은 차단하지 않는다', () => {
    const result = checkDangerousSql('Bash', { command: '/* DROP TABLE users; */ SELECT 1' });
    expect(result.action).toBe('pass');
  });

  it('주석 뒤의 실제 SQL은 차단한다', () => {
    const result = checkDangerousSql('Bash', { command: '-- this is a comment\nDROP TABLE users;' });
    expect(result.action).toBe('block');
  });
});

// ── Rate Limiter 테스트 ──

describe('rate-limiter', () => {
  it('제한 내 호출은 통과한다', () => {
    const state = { calls: [] };
    const result = checkRateLimit(state, Date.now(), 30);
    expect(result.exceeded).toBe(false);
    expect(result.count).toBe(1);
  });

  it('제한 초과 시 exceeded를 반환한다', () => {
    const now = Date.now();
    const calls = Array.from({ length: 30 }, (_, i) => now - i * 1000);
    const state = { calls };
    const result = checkRateLimit(state, now, 30);
    expect(result.exceeded).toBe(true);
    expect(result.count).toBe(31);
  });

  it('1분 이전 호출은 정리된다', () => {
    const now = Date.now();
    const oldCalls = Array.from({ length: 50 }, (_, i) => now - 120_000 - i * 1000);
    const state = { calls: oldCalls };
    const result = checkRateLimit(state, now, 30);
    expect(result.exceeded).toBe(false);
    expect(result.count).toBe(1); // old calls removed, only new one
  });

  it('경계값: 정확히 제한에서는 통과한다', () => {
    const now = Date.now();
    const calls = Array.from({ length: 29 }, (_, i) => now - i * 1000);
    const state = { calls };
    const result = checkRateLimit(state, now, 30);
    expect(result.exceeded).toBe(false);
    expect(result.count).toBe(30);
  });

  it('updatedState에 현재 호출이 포함된다', () => {
    const now = Date.now();
    const state = { calls: [now - 1000] };
    const result = checkRateLimit(state, now, 30);
    expect(result.updatedState.calls).toContain(now);
    expect(result.updatedState.calls.length).toBe(2);
  });

  it('커스텀 limit를 지원한다', () => {
    const now = Date.now();
    const calls = Array.from({ length: 5 }, (_, i) => now - i * 1000);
    const state = { calls };
    const result = checkRateLimit(state, now, 5);
    expect(result.exceeded).toBe(true);
  });

  // ── reject 시 호출 미기록 테스트 ──

  it('제한 초과(reject) 시 recentCalls에 새 타임스탬프가 추가되지 않는다', () => {
    const baseTime = 1700000000000; // 고정 타임스탬프
    // 30개 호출 (baseTime-1000 ~ baseTime-30000) — baseTime 자체는 포함 안 됨
    const calls = Array.from({ length: 30 }, (_, i) => baseTime - (i + 1) * 1000);
    const state = { calls };
    const now = baseTime; // 새 호출 시점
    const result = checkRateLimit(state, now, 30);
    expect(result.exceeded).toBe(true);
    // reject된 호출의 타임스탬프(now=baseTime)가 updatedState.calls에 포함되지 않아야 함
    expect(result.updatedState.calls).not.toContain(now);
    // 기존 호출 수만 유지 (새 호출은 추가되지 않음)
    expect(result.updatedState.calls.length).toBe(30);
  });

  it('reject 후 시간이 지나면 정상적으로 rate limit이 풀린다', () => {
    const baseTime = Date.now();
    // 30개 호출을 baseTime 기준으로 생성
    const calls = Array.from({ length: 30 }, (_, i) => baseTime - i * 1000);
    const state = { calls };

    // 현재 시점에서는 제한 초과
    const result1 = checkRateLimit(state, baseTime, 30);
    expect(result1.exceeded).toBe(true);

    // 61초 후 — 모든 기존 호출이 윈도우 밖으로 밀려남
    const futureTime = baseTime + 61_000;
    const result2 = checkRateLimit(result1.updatedState, futureTime, 30);
    expect(result2.exceeded).toBe(false);
    expect(result2.count).toBe(1); // 새 호출만 카운트
  });
});
