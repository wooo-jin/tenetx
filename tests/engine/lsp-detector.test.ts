import { describe, it, expect } from 'vitest';
import { getKnownServers, getServerForFile } from '../../src/engine/lsp-detector.js';

describe('lsp-detector', () => {
  describe('getKnownServers', () => {
    it('알려진 서버 목록을 반환한다', () => {
      const servers = getKnownServers();
      expect(servers.length).toBeGreaterThan(0);
    });

    it('각 서버에 language, command, args가 있다', () => {
      const servers = getKnownServers();
      for (const s of servers) {
        expect(s.language).toBeTruthy();
        expect(s.command).toBeTruthy();
        expect(Array.isArray(s.args)).toBe(true);
      }
    });

    it('typescript 서버가 포함되어 있다', () => {
      const servers = getKnownServers();
      const ts = servers.find((s) => s.language === 'typescript');
      expect(ts).toBeDefined();
      expect(ts!.command).toBe('typescript-language-server');
    });

    it('python, go, rust, java 서버가 포함되어 있다', () => {
      const servers = getKnownServers();
      const languages = servers.map((s) => s.language);
      expect(languages).toContain('python');
      expect(languages).toContain('go');
      expect(languages).toContain('rust');
      expect(languages).toContain('java');
    });
  });

  describe('getServerForFile', () => {
    it('.ts 파일에 대해 typescript 서버를 반환한다 (설치된 경우)', () => {
      const server = getServerForFile('/tmp/test.ts');
      // 시스템에 따라 설치 여부가 다르므로 null도 가능
      if (server) {
        expect(server.language).toBe('typescript');
      }
    });

    it('.py 파일에 대해 python 서버를 반환한다 (설치된 경우)', () => {
      const server = getServerForFile('/tmp/test.py');
      if (server) {
        expect(server.language).toBe('python');
      }
    });

    it('.go 파일에 대해 go 서버를 반환한다 (설치된 경우)', () => {
      const server = getServerForFile('/tmp/test.go');
      if (server) {
        expect(server.language).toBe('go');
      }
    });

    it('.rs 파일에 대해 rust 서버를 반환한다 (설치된 경우)', () => {
      const server = getServerForFile('/tmp/test.rs');
      if (server) {
        expect(server.language).toBe('rust');
      }
    });

    it('알 수 없는 확장자에 대해 null을 반환한다', () => {
      const server = getServerForFile('/tmp/test.xyz');
      expect(server).toBeNull();
    });

    it('.txt 파일에 대해 null을 반환한다', () => {
      const server = getServerForFile('/tmp/readme.txt');
      expect(server).toBeNull();
    });
  });
});
