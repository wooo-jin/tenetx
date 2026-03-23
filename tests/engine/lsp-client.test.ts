import { describe, it, expect } from 'vitest';
import { pathToUri, uriToPath } from '../../src/engine/lsp-client.js';

describe('lsp-client', () => {
  describe('pathToUri', () => {
    it('절대 경로를 file:// URI로 변환한다', () => {
      const uri = pathToUri('/Users/test/project/src/index.ts');
      expect(uri).toBe('file:///Users/test/project/src/index.ts');
    });

    it('이미 절대 경로인 경우 그대로 변환한다', () => {
      const uri = pathToUri('/tmp/test.ts');
      expect(uri).toBe('file:///tmp/test.ts');
    });
  });

  describe('uriToPath', () => {
    it('file:// URI를 로컬 경로로 변환한다', () => {
      const p = uriToPath('file:///Users/test/project/src/index.ts');
      expect(p).toBe('/Users/test/project/src/index.ts');
    });

    it('file:// 접두사가 없는 경우 그대로 반환한다', () => {
      const p = uriToPath('/Users/test/project/src/index.ts');
      expect(p).toBe('/Users/test/project/src/index.ts');
    });

    it('인코딩된 문자를 디코딩한다', () => {
      const p = uriToPath('file:///Users/test/my%20project/src/index.ts');
      expect(p).toBe('/Users/test/my project/src/index.ts');
    });
  });
});
