/**
 * slop-detector: main() 함수 경로를 모킹으로 테스트
 * readStdinJSON을 모킹하여 다양한 stdin 입력에 대한 stdout 출력 검증
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// readStdinJSON mock — vi.hoisted로 모듈 로드 전에 설정
const { mockReadStdinJSON } = vi.hoisted(() => ({
  mockReadStdinJSON: vi.fn(),
}));

vi.mock('../src/hooks/shared/read-stdin.js', () => ({
  readStdinJSON: mockReadStdinJSON,
}));

// hook-config mock — 로컬 ~/.compound/hook-config.json에 의존하지 않도록 격리
vi.mock('../src/hooks/hook-config.js', () => ({
  loadHookConfig: vi.fn().mockReturnValue(null),
  isHookEnabled: vi.fn().mockReturnValue(true),
}));

// logger mock
vi.mock('../src/core/logger.js', () => ({
  debugLog: vi.fn(),
  createLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// console.log를 캡처
let logOutput: string[];
let logSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logOutput = [];
  logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logOutput.push(args.map(a => String(a)).join(' '));
  });
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  logSpy.mockRestore();
  stderrSpy.mockRestore();
  vi.resetModules();
});

describe('slop-detector main()', () => {
  it('stdin이 null이면 approve', async () => {
    mockReadStdinJSON.mockResolvedValue(null);
    await import('../src/hooks/slop-detector.js');
    // main()이 catch에서 실행됨 — approve 출력
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('"continue":true'))).toBe(true);
    });
  });

  it('Write 도구에 슬롭 패턴이 있으면 경고', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Write',
      tool_input: { content: '// TODO: implement this later' },
    });
    await import('../src/hooks/slop-detector.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('compound-slop-warning'))).toBe(true);
    });
  });

  it('Write 도구에 클린 코드면 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Write',
      tool_input: { content: 'function add(a: number, b: number): number { return a + b; }' },
    });
    await import('../src/hooks/slop-detector.js');
    await vi.waitFor(() => {
      const lastOutput = logOutput[logOutput.length - 1];
      expect(lastOutput).toContain('"continue":true');
      expect(lastOutput).not.toContain('compound-slop-warning');
    });
  });

  it('Write/Edit 이외의 도구면 approve', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Read',
      tool_input: {},
    });
    await import('../src/hooks/slop-detector.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('"continue":true'))).toBe(true);
    });
  });

  it('Edit 도구의 new_string에 as any가 있으면 경고', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Edit',
      tool_input: { new_string: 'const x = foo as any;' },
    });
    await import('../src/hooks/slop-detector.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('compound-slop-warning'))).toBe(true);
    });
  });

  it('toolResponse에 슬롭 패턴이 있으면 경고', async () => {
    mockReadStdinJSON.mockResolvedValue({
      tool_name: 'Write',
      tool_input: {},
      tool_response: 'try { x() } catch (e) {}',
    });
    await import('../src/hooks/slop-detector.js');
    await vi.waitFor(() => {
      expect(logOutput.some(l => l.includes('compound-slop-warning'))).toBe(true);
    });
  });
});
