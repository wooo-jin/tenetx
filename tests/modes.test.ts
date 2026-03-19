import { describe, it, expect } from 'vitest';
import { parseMode, getModeConfig, getEffectiveModeConfig, listModes } from '../src/engine/modes.js';

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

  // ── composedOf 병합 테스트 ──

  describe('getEffectiveModeConfig', () => {
    it('autopilot → ralph + ultrawork 설정이 병합된다', () => {
      const effective = getEffectiveModeConfig('autopilot');
      // autopilot은 composedOf: ['ralph', 'ultrawork']
      expect(effective.name).toBe('autopilot');
      expect(effective.composedOf).toEqual(['ralph', 'ultrawork']);
      // description에 합성 표시
      expect(effective.description).toContain('합성');
      expect(effective.description).toContain('ralph');
      expect(effective.description).toContain('ultrawork');
      // envOverrides에 autopilot 자체 값이 최우선 (상위 모드가 하위를 오버라이드)
      expect(effective.envOverrides.COMPOUND_MODE).toBe('autopilot');
      // ralph의 envOverrides도 병합되어 있어야 함 (ultrawork도)
      // 하위 모드 envOverrides는 상위에 의해 오버라이드될 수 있으므로 COMPOUND_MODE는 autopilot
    });

    it('ecomode → composedOf 없으므로 원본 그대로', () => {
      const effective = getEffectiveModeConfig('ecomode');
      const original = getModeConfig('ecomode');
      expect(effective.name).toBe('ecomode');
      expect(effective.description).toBe(original.description);
      expect(effective.claudeArgs).toEqual(original.claudeArgs);
      expect(effective.envOverrides).toEqual(original.envOverrides);
      // composedOf가 없으므로 합성 표시가 없어야 함
      expect(effective.description).not.toContain('합성');
    });

    it('ralph → ultrawork 설정이 병합된다 (ralph.composedOf = ["ultrawork"])', () => {
      const effective = getEffectiveModeConfig('ralph');
      expect(effective.composedOf).toEqual(['ultrawork']);
      expect(effective.description).toContain('합성');
      expect(effective.description).toContain('ultrawork');
      // ralph의 envOverrides가 ultrawork를 오버라이드
      expect(effective.envOverrides.COMPOUND_MODE).toBe('ralph');
    });

    it('순환 참조 시 무한 루프에 빠지지 않는다', () => {
      // getEffectiveModeConfig는 visited Set으로 순환 방지
      // 실제 MODE_CONFIGS에 순환이 없지만, 함수가 안전하게 동작하는지 확인
      // autopilot → ralph → ultrawork 체인이 정상 종료됨
      const effective = getEffectiveModeConfig('autopilot');
      expect(effective).toBeDefined();
      expect(effective.name).toBe('autopilot');
    });

    it('composedOf가 없는 모드는 persistent가 원본과 같다', () => {
      const effective = getEffectiveModeConfig('normal');
      expect(effective.persistent).toBe(false);
    });

    it('composedOf 병합 시 하위 모드의 persistent가 true면 결과도 true', () => {
      const effective = getEffectiveModeConfig('autopilot');
      // ultrawork.persistent = true, ralph.persistent = true
      expect(effective.persistent).toBe(true);
    });
  });
});
