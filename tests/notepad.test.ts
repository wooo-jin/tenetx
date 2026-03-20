import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  getNotepadPath,
  readNotepad,
  writeNotepad,
  appendToNotepad,
  clearNotepad,
  handleNotepad,
} from '../src/core/notepad.js';

// 각 테스트마다 임시 디렉토리 사용
let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'notepad-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('notepad', () => {
  // ── getNotepadPath ──

  it('getNotepadPath는 {cwd}/.compound/notepad.md 반환', () => {
    const result = getNotepadPath('/some/project');
    expect(result).toBe('/some/project/.compound/notepad.md');
  });

  it('getNotepadPath 결과는 절대 경로', () => {
    expect(path.isAbsolute(getNotepadPath(tmpDir))).toBe(true);
  });

  // ── readNotepad ──

  it('readNotepad — 파일이 없으면 빈 문자열 반환', () => {
    const result = readNotepad(tmpDir);
    expect(result).toBe('');
  });

  it('readNotepad — 파일이 있으면 내용 반환', () => {
    const notepadPath = getNotepadPath(tmpDir);
    fs.mkdirSync(path.dirname(notepadPath), { recursive: true });
    fs.writeFileSync(notepadPath, '# 메모\n테스트 내용', 'utf-8');

    const result = readNotepad(tmpDir);
    expect(result).toBe('# 메모\n테스트 내용');
  });

  // ── writeNotepad ──

  it('writeNotepad — 내용을 파일에 씀', () => {
    const content = '# 테스트 노트\n내용입니다.';
    writeNotepad(tmpDir, content);

    const notepadPath = getNotepadPath(tmpDir);
    const saved = fs.readFileSync(notepadPath, 'utf-8');
    expect(saved).toBe(content);
  });

  it('writeNotepad — .compound 디렉토리가 없어도 자동 생성', () => {
    const notepadPath = getNotepadPath(tmpDir);
    expect(fs.existsSync(path.dirname(notepadPath))).toBe(false);

    writeNotepad(tmpDir, '내용');
    expect(fs.existsSync(notepadPath)).toBe(true);
  });

  // ── appendToNotepad ──

  it('appendToNotepad — 타임스탬프 형식이 [YYYY-MM-DD HH:mm]', () => {
    appendToNotepad(tmpDir, '첫 번째 항목');
    const content = readNotepad(tmpDir);
    expect(content).toMatch(/## \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}\]/);
  });

  it('appendToNotepad — 항목 내용이 포함됨', () => {
    appendToNotepad(tmpDir, '중요한 결정 사항');
    const content = readNotepad(tmpDir);
    expect(content).toContain('중요한 결정 사항');
  });

  it('appendToNotepad — 여러 번 호출 시 누적됨', () => {
    appendToNotepad(tmpDir, '첫 번째');
    appendToNotepad(tmpDir, '두 번째');
    appendToNotepad(tmpDir, '세 번째');

    const content = readNotepad(tmpDir);
    expect(content).toContain('첫 번째');
    expect(content).toContain('두 번째');
    expect(content).toContain('세 번째');
  });

  it('appendToNotepad — .compound 디렉토리가 없어도 자동 생성', () => {
    const notepadPath = getNotepadPath(tmpDir);
    expect(fs.existsSync(path.dirname(notepadPath))).toBe(false);

    appendToNotepad(tmpDir, '자동 생성 테스트');
    expect(fs.existsSync(notepadPath)).toBe(true);
  });

  // ── clearNotepad ──

  it('clearNotepad — 내용이 있을 때 초기화', () => {
    writeNotepad(tmpDir, '지워야 할 내용');
    clearNotepad(tmpDir);

    const content = readNotepad(tmpDir);
    expect(content).toBe('');
  });

  it('clearNotepad — 파일이 없어도 오류 없이 동작', () => {
    expect(() => clearNotepad(tmpDir)).not.toThrow();
  });

  // ── handleNotepad CLI ──

  describe('handleNotepad', () => {
    beforeEach(() => {
      process.env.COMPOUND_CWD = tmpDir;
    });

    afterEach(() => {
      delete process.env.COMPOUND_CWD;
    });

    it('show - 비어있을 때', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotepad(['show']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('empty'));
      logSpy.mockRestore();
    });

    it('show - 내용이 있을 때', async () => {
      writeNotepad(tmpDir, '# 메모\n내용');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotepad(['show']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('메모'));
      logSpy.mockRestore();
    });

    it('인자 없으면 show 실행', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotepad([]);
      expect(logSpy).toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it('add - 항목 추가', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotepad(['add', '테스트', '메모']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Added'));
      const content = readNotepad(tmpDir);
      expect(content).toContain('테스트 메모');
      logSpy.mockRestore();
    });

    it('edit - 파일 경로 출력', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotepad(['edit']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('notepad.md'));
      logSpy.mockRestore();
    });

    it('clear - notepad 초기화', async () => {
      writeNotepad(tmpDir, '삭제할 내용');
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotepad(['clear']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('cleared'));
      const content = readNotepad(tmpDir);
      expect(content).toBe('');
      logSpy.mockRestore();
    });

    it('알 수 없는 서브커맨드', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      await handleNotepad(['unknown']);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
      logSpy.mockRestore();
    });
  });
});
