import { describe, it, expect, vi } from 'vitest';

import { handleWorktree } from '../src/core/worktree.js';

describe('handleWorktree CLI', () => {
  it('help 출력 (인자 없음)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleWorktree([]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tenetx worktree'));
    logSpy.mockRestore();
  });

  it('--help 플래그', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleWorktree(['--help']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tenetx worktree'));
    logSpy.mockRestore();
  });

  it('-h 플래그', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleWorktree(['-h']);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('tenetx worktree'));
    logSpy.mockRestore();
  });

  it('list - 워크트리 목록 출력', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleWorktree(['list']);
    // 현재 디렉토리는 git repo이므로 워크트리 목록이 출력됨
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it('create - branch도 issue도 없으면 에러', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleWorktree(['create']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('branch 또는 issueNumber'));
    errSpy.mockRestore();
  });

  it('remove - 인자 없으면 사용법 출력', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleWorktree(['remove']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    errSpy.mockRestore();
  });

  it('teleport - 인자 없으면 사용법 출력', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleWorktree(['teleport']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    errSpy.mockRestore();
  });

  it('teleport - 없는 식별자', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleWorktree(['teleport', 'nonexistent-99999']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('No worktree found'));
    errSpy.mockRestore();
  });

  it('알 수 없는 서브커맨드', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handleWorktree(['unknown-subcmd']);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown'));
    errSpy.mockRestore();
  });
});
