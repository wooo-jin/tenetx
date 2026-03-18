import { describe, it, expect } from 'vitest';
import { parseMode, getModeConfig, listModes } from '../src/engine/modes.js';

describe('modes', () => {
  describe('parseMode', () => {
    it('플래그 없으면 normal 모드', () => {
      const { mode, cleanArgs } = parseMode(['some', 'prompt']);
      expect(mode).toBe('normal');
      expect(cleanArgs).toEqual(['some', 'prompt']);
    });

    it('--autopilot 플래그 파싱', () => {
      const { mode, cleanArgs } = parseMode(['--autopilot', 'do', 'something']);
      expect(mode).toBe('autopilot');
      expect(cleanArgs).toEqual(['do', 'something']);
    });

    it('-a 축약 플래그는 autopilot', () => {
      expect(parseMode(['-a', 'task']).mode).toBe('autopilot');
    });

    it('-r 축약 플래그는 ralph', () => {
      expect(parseMode(['-r', 'task']).mode).toBe('ralph');
    });

    it('-t 축약 플래그는 team', () => {
      expect(parseMode(['-t', 'task']).mode).toBe('team');
    });

    it('-u 축약 플래그는 ultrawork', () => {
      expect(parseMode(['-u', 'task']).mode).toBe('ultrawork');
    });

    it('-p 축약 플래그는 pipeline', () => {
      expect(parseMode(['-p', 'task']).mode).toBe('pipeline');
    });

    it('--ccg 플래그 파싱', () => {
      expect(parseMode(['--ccg', 'task']).mode).toBe('ccg');
    });

    it('--ralplan 플래그 파싱', () => {
      expect(parseMode(['--ralplan', 'task']).mode).toBe('ralplan');
    });

    it('--deep-interview 플래그 파싱', () => {
      expect(parseMode(['--deep-interview', 'task']).mode).toBe('deep-interview');
    });

    it('모드 플래그가 cleanArgs에서 제거됨', () => {
      const { cleanArgs } = parseMode(['--ralph', 'build', 'feature']);
      expect(cleanArgs).toEqual(['build', 'feature']);
    });

    it('여러 모드 플래그 시 마지막이 우선', () => {
      const { mode } = parseMode(['--autopilot', '--ralph']);
      expect(mode).toBe('ralph');
    });

    it('빈 인자 배열', () => {
      const { mode, cleanArgs } = parseMode([]);
      expect(mode).toBe('normal');
      expect(cleanArgs).toEqual([]);
    });
  });

  describe('getModeConfig', () => {
    it('normal 모드 설정 반환', () => {
      const config = getModeConfig('normal');
      expect(config.name).toBe('normal');
      expect(config.persistent).toBe(false);
    });

    it('autopilot 모드는 persistent', () => {
      const config = getModeConfig('autopilot');
      expect(config.persistent).toBe(true);
      expect(config.principle).toBe('understand-before-act');
    });

    it('ralph 모드는 capitalize-on-failure 원칙', () => {
      const config = getModeConfig('ralph');
      expect(config.principle).toBe('capitalize-on-failure');
    });

    it('team 모드는 CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 환경변수 포함', () => {
      const config = getModeConfig('team');
      expect(config.envOverrides.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS).toBe('1');
    });

    it('모든 모드에 description이 있다', () => {
      const modes = listModes();
      for (const m of modes) {
        expect(m.description).toBeTruthy();
      }
    });

    it('모든 모드에 principle이 있다', () => {
      const modes = listModes();
      for (const m of modes) {
        expect(typeof m.principle).toBe('string');
      }
    });
  });

  describe('listModes', () => {
    it('10개 모드를 반환한다', () => {
      const modes = listModes();
      expect(modes.length).toBe(10);
    });

    it('모든 모드 이름이 유니크하다', () => {
      const modes = listModes();
      const names = modes.map(m => m.name);
      expect(new Set(names).size).toBe(names.length);
    });
  });
});
