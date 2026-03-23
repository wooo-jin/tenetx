import { describe, it, expect, afterEach } from 'vitest';
import { LspManager } from '../../src/engine/lsp-manager.js';

describe('lsp-manager', () => {
  let manager: LspManager;

  afterEach(async () => {
    if (manager) {
      await manager.shutdownAll();
    }
  });

  describe('LspManager', () => {
    it('초기 상태에서 activeCount가 0이다', () => {
      manager = new LspManager();
      expect(manager.activeCount).toBe(0);
    });

    it('초기 상태에서 activeLanguages가 빈 배열이다', () => {
      manager = new LspManager();
      expect(manager.activeLanguages).toEqual([]);
    });

    it('존재하지 않는 서버에 대해 null을 반환한다', async () => {
      manager = new LspManager();
      const client = await manager.getClient('nonexistent-language', '/tmp');
      expect(client).toBeNull();
    });

    it('알 수 없는 확장자의 파일에 대해 null을 반환한다', async () => {
      manager = new LspManager();
      const client = await manager.getClientForFile('/tmp/test.xyz', '/tmp');
      expect(client).toBeNull();
    });

    it('hoverAt은 서버가 없으면 null을 반환한다', async () => {
      manager = new LspManager();
      const result = await manager.hoverAt('/tmp/test.xyz', 0, 0, '/tmp');
      expect(result).toBeNull();
    });

    it('definitionOf는 서버가 없으면 빈 배열을 반환한다', async () => {
      manager = new LspManager();
      const result = await manager.definitionOf('/tmp/test.xyz', 0, 0, '/tmp');
      expect(result).toEqual([]);
    });

    it('referencesOf는 서버가 없으면 빈 배열을 반환한다', async () => {
      manager = new LspManager();
      const result = await manager.referencesOf('/tmp/test.xyz', 0, 0, '/tmp');
      expect(result).toEqual([]);
    });

    it('getDiagnostics는 서버가 없으면 빈 배열을 반환한다', async () => {
      manager = new LspManager();
      const result = await manager.getDiagnostics('/tmp/test.xyz', '/tmp');
      expect(result).toEqual([]);
    });

    it('getCompletions는 서버가 없으면 빈 배열을 반환한다', async () => {
      manager = new LspManager();
      const result = await manager.getCompletions('/tmp/test.xyz', 0, 0, '/tmp');
      expect(result).toEqual([]);
    });

    it('shutdownAll은 에러 없이 실행된다', async () => {
      manager = new LspManager();
      await expect(manager.shutdownAll()).resolves.not.toThrow();
    });
  });
});
