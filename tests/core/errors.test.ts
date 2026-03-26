import { describe, it, expect } from 'vitest';
import {
  TenetxError,
  ProviderError,
  HookError,
  ConfigError,
  PackError,
  ForgeError,
  NonRetryableError,
} from '../../src/core/errors.js';

// ── TenetxError ──

describe('TenetxError', () => {
  it('기본 필드가 설정된다', () => {
    const err = new TenetxError('something went wrong');
    expect(err.message).toBe('something went wrong');
    expect(err.name).toBe('TenetxError');
    expect(err.code).toBe('TENETX_ERROR');
    expect(err.context).toEqual({});
  });

  it('code와 context를 옵션으로 받는다', () => {
    const err = new TenetxError('fail', { code: 'CUSTOM', context: { key: 'val' } });
    expect(err.code).toBe('CUSTOM');
    expect(err.context).toEqual({ key: 'val' });
  });

  it('Error를 상속한다', () => {
    const err = new TenetxError('x');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TenetxError);
  });

  it('toJSON()이 직렬화 가능한 객체를 반환한다', () => {
    const err = new TenetxError('fail', { code: 'C1', context: { a: 1 } });
    const json = err.toJSON();
    expect(json).toEqual({
      name: 'TenetxError',
      message: 'fail',
      code: 'C1',
      context: { a: 1 },
    });
  });
});

// ── ProviderError ──

describe('ProviderError', () => {
  it('기본 필드가 설정된다', () => {
    const err = new ProviderError('provider failed');
    expect(err.name).toBe('ProviderError');
    expect(err.code).toBe('PROVIDER_ERROR');
    expect(err.providerName).toBe('unknown');
    expect(err.statusCode).toBeUndefined();
  });

  it('providerName과 statusCode를 옵션으로 받는다', () => {
    const err = new ProviderError('rate limited', { providerName: 'claude', statusCode: 429 });
    expect(err.providerName).toBe('claude');
    expect(err.statusCode).toBe(429);
  });

  it('instanceof 체인: ProviderError → TenetxError → Error', () => {
    const err = new ProviderError('x');
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toBeInstanceOf(TenetxError);
    expect(err).toBeInstanceOf(Error);
  });

  it('toJSON()이 providerName과 statusCode를 포함한다', () => {
    const err = new ProviderError('fail', { providerName: 'gemini', statusCode: 500 });
    const json = err.toJSON();
    expect(json.name).toBe('ProviderError');
    expect(json.providerName).toBe('gemini');
    expect(json.statusCode).toBe(500);
  });
});

// ── HookError ──

describe('HookError', () => {
  it('기본 필드가 설정된다', () => {
    const err = new HookError('hook failed');
    expect(err.name).toBe('HookError');
    expect(err.code).toBe('HOOK_ERROR');
    expect(err.hookName).toBe('unknown');
    expect(err.eventType).toBe('unknown');
  });

  it('hookName과 eventType을 옵션으로 받는다', () => {
    const err = new HookError('abort', { hookName: 'secret-filter', eventType: 'PreToolUse' });
    expect(err.hookName).toBe('secret-filter');
    expect(err.eventType).toBe('PreToolUse');
  });

  it('instanceof 체인: HookError → TenetxError → Error', () => {
    const err = new HookError('x');
    expect(err).toBeInstanceOf(HookError);
    expect(err).toBeInstanceOf(TenetxError);
    expect(err).toBeInstanceOf(Error);
  });

  it('toJSON()이 hookName과 eventType을 포함한다', () => {
    const err = new HookError('fail', { hookName: 'slop-detector', eventType: 'PostToolUse' });
    const json = err.toJSON();
    expect(json.hookName).toBe('slop-detector');
    expect(json.eventType).toBe('PostToolUse');
  });
});

// ── ConfigError ──

describe('ConfigError', () => {
  it('기본 필드가 설정된다', () => {
    const err = new ConfigError('bad config');
    expect(err.name).toBe('ConfigError');
    expect(err.code).toBe('CONFIG_ERROR');
    expect(err.configPath).toBe('unknown');
    expect(err.field).toBeUndefined();
  });

  it('configPath와 field를 옵션으로 받는다', () => {
    const err = new ConfigError('missing field', { configPath: '/etc/tenetx.json', field: 'apiKey' });
    expect(err.configPath).toBe('/etc/tenetx.json');
    expect(err.field).toBe('apiKey');
  });

  it('instanceof 체인: ConfigError → TenetxError → Error', () => {
    const err = new ConfigError('x');
    expect(err).toBeInstanceOf(ConfigError);
    expect(err).toBeInstanceOf(TenetxError);
    expect(err).toBeInstanceOf(Error);
  });

  it('toJSON()이 configPath와 field를 포함한다', () => {
    const err = new ConfigError('fail', { configPath: '/home/.compound/config.json', field: 'providers' });
    const json = err.toJSON();
    expect(json.configPath).toBe('/home/.compound/config.json');
    expect(json.field).toBe('providers');
  });
});

// ── PackError ──

describe('PackError', () => {
  it('기본 필드가 설정된다', () => {
    const err = new PackError('pack failed');
    expect(err.name).toBe('PackError');
    expect(err.code).toBe('PACK_ERROR');
    expect(err.packName).toBe('unknown');
  });

  it('packName을 옵션으로 받는다', () => {
    const err = new PackError('not found', { packName: 'my-pack' });
    expect(err.packName).toBe('my-pack');
  });

  it('instanceof 체인: PackError → TenetxError → Error', () => {
    const err = new PackError('x');
    expect(err).toBeInstanceOf(PackError);
    expect(err).toBeInstanceOf(TenetxError);
    expect(err).toBeInstanceOf(Error);
  });

  it('toJSON()이 packName을 포함한다', () => {
    const err = new PackError('fail', { packName: 'forge-pack' });
    expect(err.toJSON().packName).toBe('forge-pack');
  });
});

// ── ForgeError ──

describe('ForgeError', () => {
  it('기본 필드가 설정된다', () => {
    const err = new ForgeError('forge failed');
    expect(err.name).toBe('ForgeError');
    expect(err.code).toBe('FORGE_ERROR');
    expect(err.dimension).toBeUndefined();
    expect(err.profile).toBeUndefined();
  });

  it('dimension과 profile을 옵션으로 받는다', () => {
    const err = new ForgeError('invalid', { dimension: 'depth', profile: 'senior' });
    expect(err.dimension).toBe('depth');
    expect(err.profile).toBe('senior');
  });

  it('instanceof 체인: ForgeError → TenetxError → Error', () => {
    const err = new ForgeError('x');
    expect(err).toBeInstanceOf(ForgeError);
    expect(err).toBeInstanceOf(TenetxError);
    expect(err).toBeInstanceOf(Error);
  });

  it('toJSON()이 dimension과 profile을 포함한다', () => {
    const err = new ForgeError('fail', { dimension: 'velocity', profile: 'junior' });
    const json = err.toJSON();
    expect(json.dimension).toBe('velocity');
    expect(json.profile).toBe('junior');
  });
});

// ── NonRetryableError ──

describe('NonRetryableError', () => {
  it('기본 필드가 설정된다', () => {
    const err = new NonRetryableError('401 unauthorized');
    expect(err.name).toBe('NonRetryableError');
    expect(err.code).toBe('NON_RETRYABLE_ERROR');
    expect(err.message).toBe('401 unauthorized');
  });

  it('instanceof 체인: NonRetryableError → TenetxError → Error', () => {
    const err = new NonRetryableError('x');
    expect(err).toBeInstanceOf(NonRetryableError);
    expect(err).toBeInstanceOf(TenetxError);
    expect(err).toBeInstanceOf(Error);
  });

  it('toJSON()이 직렬화 가능한 객체를 반환한다', () => {
    const err = new NonRetryableError('forbidden');
    const json = err.toJSON();
    expect(json.name).toBe('NonRetryableError');
    expect(json.code).toBe('NON_RETRYABLE_ERROR');
    expect(json.message).toBe('forbidden');
  });
});
