import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const { TEST_HOME } = vi.hoisted(() => ({
  TEST_HOME: '/tmp/tenetx-test-postinstall',
}));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => TEST_HOME };
});

const COMMANDS_DIR = path.join(TEST_HOME, '.claude', 'commands', 'tenetx');
const SETTINGS_PATH = path.join(TEST_HOME, '.claude', 'settings.json');
const COMPOUND_HOME = path.join(TEST_HOME, '.compound');
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

function runPostinstall() {
  const { execFileSync } = require('node:child_process');
  execFileSync('node', [path.resolve(__dirname, '..', 'scripts', 'postinstall.js')], {
    env: { ...process.env, HOME: TEST_HOME },
  });
}

describe('postinstall', () => {
  beforeEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_HOME, { recursive: true, force: true });
  });

  // ── Slash commands ──

  describe('slash commands', () => {
    it('should install all skill files as slash commands', () => {
      runPostinstall();

      expect(fs.existsSync(COMMANDS_DIR)).toBe(true);
      const installed = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));
      const skills = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.md'));
      expect(installed.length).toBe(skills.length);
      expect(installed.length).toBeGreaterThan(0);
    });

    it('should mark files with tenetx-managed marker', () => {
      runPostinstall();

      const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const content = fs.readFileSync(path.join(COMMANDS_DIR, file), 'utf-8');
        expect(content).toContain('<!-- tenetx-managed -->');
      }
    });

    it('should not overwrite user-customized files', () => {
      fs.mkdirSync(COMMANDS_DIR, { recursive: true });
      const customFile = path.join(COMMANDS_DIR, 'tdd.md');
      fs.writeFileSync(customFile, '# My custom TDD workflow\nUser-customized content');

      runPostinstall();

      const content = fs.readFileSync(customFile, 'utf-8');
      expect(content).toContain('User-customized content');
      expect(content).not.toContain('<!-- tenetx-managed -->');
    });

    it('should update existing tenetx-managed files', () => {
      fs.mkdirSync(COMMANDS_DIR, { recursive: true });
      const managedFile = path.join(COMMANDS_DIR, 'tdd.md');
      fs.writeFileSync(managedFile, '# Old version\n\n<!-- tenetx-managed -->\n\nOld content');

      runPostinstall();

      const content = fs.readFileSync(managedFile, 'utf-8');
      expect(content).toContain('<!-- tenetx-managed -->');
      expect(content).not.toContain('Old content');
    });
  });

  // ── Hooks injection ──

  describe('hooks', () => {
    it('should create settings.json with hooks when it does not exist', () => {
      runPostinstall();

      expect(fs.existsSync(SETTINGS_PATH)).toBe(true);
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.hooks).toBeDefined();
      expect(settings.hooks.UserPromptSubmit).toBeDefined();
      expect(settings.hooks.UserPromptSubmit.length).toBeGreaterThan(0);
    });

    it('should register all expected hook events', () => {
      runPostinstall();

      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      const expectedEvents = [
        'UserPromptSubmit', 'SessionStart', 'Stop',
        'PreToolUse', 'PostToolUse',
        'SubagentStart', 'SubagentStop',
        'PreCompact', 'PermissionRequest', 'PostToolUseFailure',
      ];
      for (const event of expectedEvents) {
        expect(settings.hooks[event], `missing hook event: ${event}`).toBeDefined();
        expect(settings.hooks[event].length, `empty hook event: ${event}`).toBeGreaterThan(0);
      }
    });

    it('should preserve existing non-tenetx hooks', () => {
      fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
      const existing = {
        hooks: {
          UserPromptSubmit: [
            { matcher: '', hooks: [{ type: 'command', command: 'my-custom-hook.sh', timeout: 1000 }] },
          ],
        },
        someOtherSetting: true,
      };
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify(existing));

      runPostinstall();

      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      // 사용자 커스텀 훅이 보존되어야 함
      const customHook = settings.hooks.UserPromptSubmit.find(
        (h) => h.hooks?.[0]?.command === 'my-custom-hook.sh',
      );
      expect(customHook).toBeDefined();
      // tenetx 훅도 추가되어야 함
      expect(settings.hooks.UserPromptSubmit.length).toBeGreaterThan(1);
      // 기존 설정 보존
      expect(settings.someOtherSetting).toBe(true);
    });

    it('should set COMPOUND_HARNESS env marker', () => {
      runPostinstall();

      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.env?.COMPOUND_HARNESS).toBe('1');
    });

    it('should create backup of existing settings.json', () => {
      fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, JSON.stringify({ existing: true }));

      runPostinstall();

      const backupPath = `${SETTINGS_PATH}.bak`;
      expect(fs.existsSync(backupPath)).toBe(true);
      const backup = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
      expect(backup.existing).toBe(true);
    });
  });

  // ── Directory structure ──

  describe('directories', () => {
    it('should create ~/.compound directory structure', () => {
      runPostinstall();

      const expectedDirs = [
        COMPOUND_HOME,
        path.join(COMPOUND_HOME, 'me'),
        path.join(COMPOUND_HOME, 'me', 'solutions'),
        path.join(COMPOUND_HOME, 'me', 'rules'),
        path.join(COMPOUND_HOME, 'me', 'skills'),
        path.join(COMPOUND_HOME, 'state'),
        path.join(COMPOUND_HOME, 'skills'),
        path.join(COMPOUND_HOME, 'packs'),
      ];
      for (const dir of expectedDirs) {
        expect(fs.existsSync(dir), `missing dir: ${dir}`).toBe(true);
      }
    });
  });

  // ── Resilience ──

  describe('resilience', () => {
    it('should not crash when ~/.claude does not exist', () => {
      fs.mkdirSync(TEST_HOME, { recursive: true });

      expect(() => runPostinstall()).not.toThrow();
      expect(fs.existsSync(COMMANDS_DIR)).toBe(true);
    });

    it('should handle corrupted settings.json gracefully', () => {
      fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
      fs.writeFileSync(SETTINGS_PATH, '{invalid json!!!');

      expect(() => runPostinstall()).not.toThrow();

      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
      expect(settings.hooks).toBeDefined();
    });
  });
});
