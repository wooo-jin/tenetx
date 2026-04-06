import { describe, it, expect } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  COMPOUND_HOME,
  TENETX_HOME,
  ME_DIR,
  ME_PHILOSOPHY,
  ME_SOLUTIONS,
  ME_BEHAVIOR,
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
  it('COMPOUND_HOME은 ~/.compound/ (레거시 호환)', () => {
    expect(COMPOUND_HOME).toBe(path.join(HOME, '.compound'));
  });

  it('TENETX_HOME은 ~/.tenetx/', () => {
    expect(TENETX_HOME).toBe(path.join(HOME, '.tenetx'));
  });

  it('ME_DIR은 ~/.tenetx/me/', () => {
    expect(ME_DIR).toBe(path.join(HOME, '.tenetx', 'me'));
  });

  it('ME_PHILOSOPHY은 ~/.tenetx/me/philosophy.json', () => {
    expect(ME_PHILOSOPHY).toContain('philosophy.json');
    expect(ME_PHILOSOPHY).toContain('.tenetx');
  });

  it('ME_SOLUTIONS은 ~/.tenetx/me/solutions/', () => {
    expect(ME_SOLUTIONS).toContain('solutions');
    expect(ME_SOLUTIONS).toContain('.tenetx');
  });

  it('ME_BEHAVIOR은 ~/.tenetx/me/behavior/', () => {
    expect(ME_BEHAVIOR).toContain('behavior');
    expect(ME_BEHAVIOR).toContain('.tenetx');
  });

  it('ME_RULES은 ~/.tenetx/me/rules/', () => {
    expect(ME_RULES).toContain('rules');
    expect(ME_RULES).toContain('.tenetx');
  });

  it('PACKS_DIR은 ~/.tenetx/packs/', () => {
    expect(PACKS_DIR).toBe(path.join(HOME, '.tenetx', 'packs'));
  });

  it('STATE_DIR은 ~/.tenetx/state/', () => {
    expect(STATE_DIR).toBe(path.join(HOME, '.tenetx', 'state'));
  });

  it('SESSIONS_DIR은 ~/.tenetx/sessions/', () => {
    expect(SESSIONS_DIR).toBe(path.join(HOME, '.tenetx', 'sessions'));
  });

  it('GLOBAL_CONFIG은 ~/.tenetx/config.json', () => {
    expect(GLOBAL_CONFIG).toContain('config.json');
    expect(GLOBAL_CONFIG).toContain('.tenetx');
  });

  it('ALL_MODES는 9개 모드를 포함', () => {
    expect(ALL_MODES.length).toBe(9);
    expect(ALL_MODES).toContain('ralph');
    expect(ALL_MODES).toContain('autopilot');
    expect(ALL_MODES).toContain('ultrawork');
    expect(ALL_MODES).toContain('ecomode');
  });

  it('projectDir는 cwd/.compound/ 반환', () => {
    expect(projectDir('/tmp/myproject')).toBe('/tmp/myproject/.compound');
  });

  it('packLinkPath는 cwd/.compound/pack.link 반환', () => {
    expect(packLinkPath('/tmp/myproject')).toBe('/tmp/myproject/.compound/pack.link');
  });

  it('모든 경로가 절대 경로', () => {
    const paths = [COMPOUND_HOME, TENETX_HOME, ME_DIR, ME_PHILOSOPHY, ME_SOLUTIONS, ME_BEHAVIOR, ME_RULES, PACKS_DIR, STATE_DIR, SESSIONS_DIR, GLOBAL_CONFIG];
    for (const p of paths) {
      expect(path.isAbsolute(p)).toBe(true);
    }
  });
});
