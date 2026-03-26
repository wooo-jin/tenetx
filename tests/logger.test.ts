import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLogger, debugLog, LogLevel, Logger } from '../src/core/logger.js';

describe('Logger', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // 환경변수 초기화
    delete process.env.TENETX_LOG_LEVEL;
    delete process.env.TENETX_DEBUG;
    delete process.env.COMPOUND_DEBUG;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  describe('createLogger', () => {
    it('Logger 인스턴스를 반환한다', () => {
      const logger = createLogger('test');
      expect(logger).toBeInstanceOf(Logger);
      expect(logger.namespace).toBe('test');
    });

    it('각 namespace가 독립적인 인스턴스를 반환한다', () => {
      const a = createLogger('provider');
      const b = createLogger('hook');
      expect(a.namespace).not.toBe(b.namespace);
    });
  });

  describe('LogLevel 제어 (TENETX_LOG_LEVEL)', () => {
    it('기본 레벨(info)에서는 info/warn/error만 출력된다', () => {
      // TENETX_LOG_LEVEL 미설정 → info가 기본
      process.env.TENETX_DEBUG = '*';
      const logger = createLogger('test');

      logger.debug('디버그 메시지');
      expect(stderrSpy).not.toHaveBeenCalled();

      logger.info('인포 메시지');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('TENETX_LOG_LEVEL=debug 설정 시 debug 메시지가 출력된다', () => {
      process.env.TENETX_LOG_LEVEL = 'debug';
      process.env.TENETX_DEBUG = '*';
      const logger = createLogger('test');

      logger.debug('디버그 메시지');
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[tenetx:test] [debug] 디버그 메시지')
      );
    });

    it('TENETX_LOG_LEVEL=warn 설정 시 warn/error만 출력된다', () => {
      process.env.TENETX_LOG_LEVEL = 'warn';
      const logger = createLogger('test');

      logger.info('인포 메시지');
      expect(stderrSpy).not.toHaveBeenCalled();

      logger.warn('경고 메시지');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });

    it('TENETX_LOG_LEVEL=error 설정 시 error만 출력된다', () => {
      process.env.TENETX_LOG_LEVEL = 'error';
      const logger = createLogger('test');

      logger.warn('경고 메시지');
      expect(stderrSpy).not.toHaveBeenCalled();

      logger.error('에러 메시지');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('namespace 필터링 (TENETX_DEBUG)', () => {
    it('TENETX_DEBUG 미설정 시 debug 메시지는 출력되지 않는다', () => {
      process.env.TENETX_LOG_LEVEL = 'debug';
      const logger = createLogger('provider');
      logger.debug('디버그');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('TENETX_DEBUG=* 설정 시 모든 namespace debug가 출력된다', () => {
      process.env.TENETX_LOG_LEVEL = 'debug';
      process.env.TENETX_DEBUG = '*';
      createLogger('provider').debug('프로바이더 디버그');
      createLogger('hook').debug('훅 디버그');
      expect(stderrSpy).toHaveBeenCalledTimes(2);
    });

    it('TENETX_DEBUG=provider 설정 시 provider만 출력된다', () => {
      process.env.TENETX_LOG_LEVEL = 'debug';
      process.env.TENETX_DEBUG = 'provider';
      createLogger('provider').debug('프로바이더');
      createLogger('hook').debug('훅');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[tenetx:provider]'));
    });

    it('TENETX_DEBUG=provider,hook 쉼표 구분 시 해당 namespace만 출력된다', () => {
      process.env.TENETX_LOG_LEVEL = 'debug';
      process.env.TENETX_DEBUG = 'provider,hook';
      createLogger('provider').debug('프로바이더');
      createLogger('hook').debug('훅');
      createLogger('harness').debug('하네스');
      expect(stderrSpy).toHaveBeenCalledTimes(2);
    });

    it('namespace 필터는 info 이상 레벨에는 적용되지 않는다', () => {
      // TENETX_DEBUG 미설정이어도 info는 출력됨
      const logger = createLogger('anything');
      logger.info('정보 메시지');
      expect(stderrSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('출력 형식', () => {
    it('[tenetx:namespace] [level] message 형식으로 출력된다', () => {
      const logger = createLogger('provider');
      logger.info('테스트 메시지');
      expect(stderrSpy).toHaveBeenCalledWith('[tenetx:provider] [info] 테스트 메시지');
    });

    it('error 인자가 있으면 ": message" 형식으로 이어진다', () => {
      const logger = createLogger('test');
      logger.error('처리 실패', new Error('연결 거부'));
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[tenetx:test] [error] 처리 실패: 연결 거부')
      );
    });

    it('Error가 아닌 값도 문자열로 변환된다', () => {
      const logger = createLogger('test');
      logger.warn('경고', 42);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining(': 42')
      );
    });
  });

  describe('레거시 호환 (debugLog)', () => {
    it('COMPOUND_DEBUG=1 설정 시 debugLog가 출력된다', () => {
      process.env.COMPOUND_DEBUG = '1';
      debugLog('legacy', '레거시 메시지');
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CH:legacy] 레거시 메시지')
      );
    });

    it('COMPOUND_DEBUG 미설정 시 debugLog는 출력하지 않는다', () => {
      debugLog('legacy', '레거시 메시지');
      expect(stderrSpy).not.toHaveBeenCalled();
    });

    it('TENETX_DEBUG=* 설정으로도 debugLog가 활성화된다', () => {
      process.env.TENETX_LOG_LEVEL = 'debug';
      process.env.TENETX_DEBUG = '*';
      debugLog('legacy', '레거시');
      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('[CH:legacy] 레거시'));
    });

    it('error 인자가 있으면 ": errorMessage" 형식으로 출력된다', () => {
      process.env.COMPOUND_DEBUG = '1';
      debugLog('ctx', '파싱 실패', new Error('파일 없음'));
      expect(stderrSpy).toHaveBeenCalledWith('[CH:ctx] 파싱 실패: 파일 없음');
    });

    it('TENETX_LOG_LEVEL=warn일 때 debugLog는 출력되지 않는다', () => {
      process.env.TENETX_LOG_LEVEL = 'warn';
      process.env.COMPOUND_DEBUG = '1';
      debugLog('ctx', '레거시 디버그');
      expect(stderrSpy).not.toHaveBeenCalled();
    });
  });

  describe('LogLevel enum', () => {
    it('debug < info < warn < error 순서다', () => {
      expect(LogLevel.debug).toBeLessThan(LogLevel.info);
      expect(LogLevel.info).toBeLessThan(LogLevel.warn);
      expect(LogLevel.warn).toBeLessThan(LogLevel.error);
    });
  });
});
