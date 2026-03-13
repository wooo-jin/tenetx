import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  COMPOUND_HOME,
  ME_DIR,
  ME_PHILOSOPHY,
  ME_SOLUTIONS,
  ME_RULES,
  PACKS_DIR,
  STATE_DIR,
  SESSIONS_DIR,
  GLOBAL_CONFIG,
  ALL_MODES,
  projectDir,
  packLinkPath,
} from '../src/core/paths.js';

const HOME = os.homedir();

describe('paths', () => {
  it('COMPOUND_HOME은 ~/.compound/', () => {
    expect(COMPOUND_HOME).toBe(path.join(HOME, '.compound'));
  });

  it('ME_DIR은 ~/.compound/me/', () => {
    expect(ME_DIR).toBe(path.join(HOME, '.compound', 'me'));
  });

  it('ME_PHILOSOPHY은 ~/.compound/me/philosophy.json', () => {
    expect(ME_PHILOSOPHY).toContain('philosophy.json');
    expect(ME_PHILOSOPHY).toContain('.compound');
  });

  it('ME_SOLUTIONS은 ~/.compound/me/solutions/', () => {
    expect(ME_SOLUTIONS).toContain('solutions');
  });

  it('ME_RULES은 ~/.compound/me/rules/', () => {
    expect(ME_RULES).toContain('rules');
  });

  it('PACKS_DIR은 ~/.compound/packs/', () => {
    expect(PACKS_DIR).toBe(path.join(HOME, '.compound', 'packs'));
  });

  it('STATE_DIR은 ~/.compound/state/', () => {
    expect(STATE_DIR).toBe(path.join(HOME, '.compound', 'state'));
  });

  it('SESSIONS_DIR은 ~/.compound/sessions/', () => {
    expect(SESSIONS_DIR).toBe(path.join(HOME, '.compound', 'sessions'));
  });

  it('GLOBAL_CONFIG은 ~/.compound/config.json', () => {
    expect(GLOBAL_CONFIG).toContain('config.json');
  });

  it('ALL_MODES는 8개 모드를 포함', () => {
    expect(ALL_MODES.length).toBe(8);
    expect(ALL_MODES).toContain('ralph');
    expect(ALL_MODES).toContain('autopilot');
    expect(ALL_MODES).toContain('ultrawork');
  });

  it('projectDir는 cwd/.compound/ 반환', () => {
    expect(projectDir('/tmp/myproject')).toBe('/tmp/myproject/.compound');
  });

  it('packLinkPath는 cwd/.compound/pack.link 반환', () => {
    expect(packLinkPath('/tmp/myproject')).toBe('/tmp/myproject/.compound/pack.link');
  });

  it('모든 경로가 절대 경로', () => {
    const paths = [COMPOUND_HOME, ME_DIR, ME_PHILOSOPHY, ME_SOLUTIONS, ME_RULES, PACKS_DIR, STATE_DIR, SESSIONS_DIR, GLOBAL_CONFIG];
    for (const p of paths) {
      expect(path.isAbsolute(p)).toBe(true);
    }
  });
});
