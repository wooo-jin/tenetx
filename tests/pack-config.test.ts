import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadPackConfig,
  savePackConfig,
  detectPackMode,
  packConfigPath,
  autoSyncIfNeeded,
  type PackConnection,
} from '../src/core/pack-config.js';

describe('pack-config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadPackConfig', () => {
    it('pack.json이 없으면 null 반환', () => {
      expect(loadPackConfig(tmpDir)).toBeNull();
    });

    it('inline 설정 로드', () => {
      const config: PackConnection = {
        type: 'inline',
        name: 'my-project',
      };
      fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
      fs.writeFileSync(
        packConfigPath(tmpDir),
        JSON.stringify(config, null, 2),
      );

      const loaded = loadPackConfig(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.type).toBe('inline');
      expect(loaded!.name).toBe('my-project');
    });

    it('github 설정 로드', () => {
      const config: PackConnection = {
        type: 'github',
        name: 'team-pack',
        repo: 'org/team-rules',
        lastSync: 'abc123',
      };
      fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
      fs.writeFileSync(
        packConfigPath(tmpDir),
        JSON.stringify(config, null, 2),
      );

      const loaded = loadPackConfig(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.type).toBe('github');
      expect(loaded!.repo).toBe('org/team-rules');
      expect(loaded!.lastSync).toBe('abc123');
    });

    it('잘못된 JSON이면 null 반환', () => {
      fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
      fs.writeFileSync(packConfigPath(tmpDir), 'not json{{{');

      expect(loadPackConfig(tmpDir)).toBeNull();
    });
  });

  describe('savePackConfig', () => {
    it('파일 생성 및 내용 확인', () => {
      const config: PackConnection = {
        type: 'inline',
        name: 'test-pack',
      };

      savePackConfig(tmpDir, config);

      const filePath = packConfigPath(tmpDir);
      expect(fs.existsSync(filePath)).toBe(true);

      const saved = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(saved.type).toBe('inline');
      expect(saved.name).toBe('test-pack');
    });

    it('.compound 디렉토리가 없어도 자동 생성', () => {
      const config: PackConnection = {
        type: 'github',
        name: 'remote-pack',
        repo: 'org/repo',
      };

      savePackConfig(tmpDir, config);
      expect(fs.existsSync(packConfigPath(tmpDir))).toBe(true);
    });
  });

  describe('detectPackMode', () => {
    it('pack.json 없으면 personal', () => {
      expect(detectPackMode(tmpDir)).toBe('personal');
    });

    it('inline 설정이면 inline', () => {
      savePackConfig(tmpDir, { type: 'inline', name: 'test' });
      expect(detectPackMode(tmpDir)).toBe('inline');
    });

    it('github 설정이면 github', () => {
      savePackConfig(tmpDir, { type: 'github', name: 'test', repo: 'o/r' });
      expect(detectPackMode(tmpDir)).toBe('github');
    });

    it('local 설정이면 inline (local은 inline 계열)', () => {
      savePackConfig(tmpDir, { type: 'local', name: 'test', localPath: '/tmp' });
      expect(detectPackMode(tmpDir)).toBe('inline');
    });
  });

  describe('autoSyncIfNeeded', () => {
    it('pack.json 없으면 null 반환', async () => {
      const result = await autoSyncIfNeeded(tmpDir);
      expect(result).toBeNull();
    });

    it('inline 타입이면 null 반환 (동기화 불필요)', async () => {
      savePackConfig(tmpDir, { type: 'inline', name: 'test' });
      const result = await autoSyncIfNeeded(tmpDir);
      expect(result).toBeNull();
    });

    it('github 타입이지만 최근 동기화면 null 반환', async () => {
      savePackConfig(tmpDir, {
        type: 'github',
        name: 'test',
        repo: 'org/repo',
        lastSync: 'abc123',
      });
      // pack.json mtime이 방금이므로 1시간 이내 → 스킵
      const result = await autoSyncIfNeeded(tmpDir);
      expect(result).toBeNull();
    });
  });

  describe('packConfigPath', () => {
    it('올바른 경로 반환', () => {
      const result = packConfigPath('/my/project');
      expect(result).toBe(path.join('/my/project', '.compound', 'pack.json'));
    });
  });
});
