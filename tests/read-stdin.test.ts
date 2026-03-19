import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

describe('readStdinJSON — string chunk 처리', () => {
  let originalStdin: typeof process.stdin;
  let mockStdin: EventEmitter;

  beforeEach(() => {
    originalStdin = process.stdin;
    mockStdin = new EventEmitter();
    // process.stdin을 모킹
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'stdin', {
      value: originalStdin,
      writable: true,
      configurable: true,
    });
  });

  it('string chunk가 Buffer로 변환되어 정상 파싱된다', async () => {
    // readStdinJSON을 동적 import (stdin 모킹 후)
    const { readStdinJSON } = await import('../src/hooks/shared/read-stdin.js');

    const promise = readStdinJSON<{ prompt: string }>(1000);

    // string으로 chunk 전송 (Buffer가 아닌 string)
    mockStdin.emit('data', '{"prompt": "hello"}');
    mockStdin.emit('end');

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result?.prompt).toBe('hello');
  });

  it('Buffer chunk도 정상 처리된다', async () => {
    const { readStdinJSON } = await import('../src/hooks/shared/read-stdin.js');

    const promise = readStdinJSON<{ key: string }>(1000);

    // Buffer로 chunk 전송
    mockStdin.emit('data', Buffer.from('{"key": "value"}'));
    mockStdin.emit('end');

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result?.key).toBe('value');
  });

  it('여러 string chunk가 결합되어 파싱된다', async () => {
    const { readStdinJSON } = await import('../src/hooks/shared/read-stdin.js');

    const promise = readStdinJSON<{ name: string }>(1000);

    // 분할된 string chunk 전송
    mockStdin.emit('data', '{"name":');
    mockStdin.emit('data', ' "test"}');
    mockStdin.emit('end');

    const result = await promise;
    expect(result).not.toBeNull();
    expect(result?.name).toBe('test');
  });

  it('잘못된 JSON은 null을 반환한다', async () => {
    const { readStdinJSON } = await import('../src/hooks/shared/read-stdin.js');

    const promise = readStdinJSON(1000);

    mockStdin.emit('data', 'not valid json');
    mockStdin.emit('end');

    const result = await promise;
    expect(result).toBeNull();
  });
});
