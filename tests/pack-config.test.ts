import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  loadPackConfig,
  loadPackConfigs,
  savePackConfig,
  savePackConfigs,
  addPack,
  removePack,
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

  describe('loadPackConfigs', () => {
    it('pack.json이 없으면 빈 배열 반환', () => {
      expect(loadPackConfigs(tmpDir)).toEqual([]);
    });

    it('새 형식 (packs 배열) 로드', () => {
      fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
      fs.writeFileSync(
        packConfigPath(tmpDir),
        JSON.stringify({
          packs: [
            { type: 'github', name: 'saas-specs', repo: 'team/saas-specs' },
            { type: 'github', name: 'saas-dev-specs', repo: 'team/saas-dev-specs' },
          ],
        }, null, 2),
      );

      const packs = loadPackConfigs(tmpDir);
      expect(packs).toHaveLength(2);
      expect(packs[0].name).toBe('saas-specs');
      expect(packs[1].name).toBe('saas-dev-specs');
    });

    it('구 형식 (단일 객체) 하위 호환', () => {
      fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
      fs.writeFileSync(
        packConfigPath(tmpDir),
        JSON.stringify({ type: 'inline', name: 'my-project' }, null, 2),
      );

      const packs = loadPackConfigs(tmpDir);
      expect(packs).toHaveLength(1);
      expect(packs[0].type).toBe('inline');
      expect(packs[0].name).toBe('my-project');
    });

    it('잘못된 JSON이면 빈 배열 반환', () => {
      fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
      fs.writeFileSync(packConfigPath(tmpDir), 'not json{{{');

      expect(loadPackConfigs(tmpDir)).toEqual([]);
    });
  });

  describe('loadPackConfig (하위 호환)', () => {
    it('pack.json이 없으면 null 반환', () => {
      expect(loadPackConfig(tmpDir)).toBeNull();
    });

    it('첫 번째 팩 반환', () => {
      fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
      fs.writeFileSync(
        packConfigPath(tmpDir),
        JSON.stringify({
          packs: [
            { type: 'github', name: 'first', repo: 'org/first' },
            { type: 'github', name: 'second', repo: 'org/second' },
          ],
        }, null, 2),
      );

      const config = loadPackConfig(tmpDir);
      expect(config).not.toBeNull();
      expect(config!.name).toBe('first');
    });

    it('구 형식 단일 객체도 로드', () => {
      fs.mkdirSync(path.join(tmpDir, '.compound'), { recursive: true });
      fs.writeFileSync(
        packConfigPath(tmpDir),
        JSON.stringify({ type: 'github', name: 'team-pack', repo: 'org/team-rules', lastSync: 'abc123' }, null, 2),
      );

      const loaded = loadPackConfig(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.type).toBe('github');
      expect(loaded!.repo).toBe('org/team-rules');
      expect(loaded!.lastSync).toBe('abc123');
    });
  });

  describe('savePackConfigs', () => {
    it('packs 배열 형식으로 저장', () => {
      const packs: PackConnection[] = [
        { type: 'github', name: 'specs', repo: 'team/specs' },
        { type: 'github', name: 'dev-specs', repo: 'team/dev-specs' },
      ];

      savePackConfigs(tmpDir, packs);

      const raw = JSON.parse(fs.readFileSync(packConfigPath(tmpDir), 'utf-8'));
      expect(raw.packs).toHaveLength(2);
      expect(raw.packs[0].name).toBe('specs');
      expect(raw.packs[1].name).toBe('dev-specs');
    });
  });

  describe('savePackConfig (하위 호환)', () => {
    it('기존 배열에 팩 추가', () => {
      savePackConfigs(tmpDir, [{ type: 'inline', name: 'existing' }]);

      savePackConfig(tmpDir, { type: 'github', name: 'new-pack', repo: 'org/repo' });

      const packs = loadPackConfigs(tmpDir);
      expect(packs).toHaveLength(2);
      expect(packs[0].name).toBe('existing');
      expect(packs[1].name).toBe('new-pack');
    });

    it('같은 이름이면 교체', () => {
      savePackConfigs(tmpDir, [{ type: 'inline', name: 'my-pack' }]);

      savePackConfig(tmpDir, { type: 'github', name: 'my-pack', repo: 'org/repo' });

      const packs = loadPackConfigs(tmpDir);
      expect(packs).toHaveLength(1);
      expect(packs[0].type).toBe('github');
    });

    it('.compound 디렉토리가 없어도 자동 생성', () => {
      savePackConfig(tmpDir, { type: 'github', name: 'remote-pack', repo: 'org/repo' });
      expect(fs.existsSync(packConfigPath(tmpDir))).toBe(true);
    });
  });

  describe('addPack / removePack', () => {
    it('팩 추가', () => {
      addPack(tmpDir, { type: 'github', name: 'pack-a', repo: 'org/a' });
      addPack(tmpDir, { type: 'github', name: 'pack-b', repo: 'org/b' });

      const packs = loadPackConfigs(tmpDir);
      expect(packs).toHaveLength(2);
    });

    it('같은 이름 팩 추가 시 교체', () => {
      addPack(tmpDir, { type: 'github', name: 'pack-a', repo: 'org/a-v1' });
      addPack(tmpDir, { type: 'github', name: 'pack-a', repo: 'org/a-v2' });

      const packs = loadPackConfigs(tmpDir);
      expect(packs).toHaveLength(1);
      expect(packs[0].repo).toBe('org/a-v2');
    });

    it('팩 제거', () => {
      addPack(tmpDir, { type: 'github', name: 'pack-a', repo: 'org/a' });
      addPack(tmpDir, { type: 'github', name: 'pack-b', repo: 'org/b' });

      const removed = removePack(tmpDir, 'pack-a');
      expect(removed).toBe(true);

      const packs = loadPackConfigs(tmpDir);
      expect(packs).toHaveLength(1);
      expect(packs[0].name).toBe('pack-b');
    });

    it('없는 팩 제거 시 false', () => {
      addPack(tmpDir, { type: 'inline', name: 'pack-a' });
      const removed = removePack(tmpDir, 'nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('detectPackMode', () => {
    it('pack.json 없으면 personal', () => {
      expect(detectPackMode(tmpDir)).toBe('personal');
    });

    it('inline 설정이면 inline', () => {
      savePackConfigs(tmpDir, [{ type: 'inline', name: 'test' }]);
      expect(detectPackMode(tmpDir)).toBe('inline');
    });

    it('github 설정이면 github', () => {
      savePackConfigs(tmpDir, [{ type: 'github', name: 'test', repo: 'o/r' }]);
      expect(detectPackMode(tmpDir)).toBe('github');
    });

    it('local 설정이면 inline (local은 inline 계열)', () => {
      savePackConfigs(tmpDir, [{ type: 'local', name: 'test', localPath: '/tmp' }]);
      expect(detectPackMode(tmpDir)).toBe('inline');
    });

    it('혼합 타입이면 mixed', () => {
      savePackConfigs(tmpDir, [
        { type: 'github', name: 'specs', repo: 'team/specs' },
        { type: 'inline', name: 'local-rules' },
      ]);
      expect(detectPackMode(tmpDir)).toBe('mixed');
    });
  });

  describe('autoSyncIfNeeded', () => {
    it('pack.json 없으면 null 반환', async () => {
      const result = await autoSyncIfNeeded(tmpDir);
      expect(result).toBeNull();
    });

    it('inline 타입만 있으면 null 반환 (동기화 불필요)', async () => {
      savePackConfigs(tmpDir, [{ type: 'inline', name: 'test' }]);
      const result = await autoSyncIfNeeded(tmpDir);
      expect(result).toBeNull();
    });

    it('github 타입이지만 최근 동기화면 null 반환', async () => {
      savePackConfigs(tmpDir, [{
        type: 'github',
        name: 'test',
        repo: 'org/repo',
        lastSync: 'abc123',
      }]);
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
