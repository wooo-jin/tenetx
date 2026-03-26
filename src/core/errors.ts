/**
 * Tenetx — Domain Error Classes
 *
 * 도메인별 에러 계층:
 *   TenetxError (base)
 *   ├── ProviderError    — AI provider 호출 실패
 *   ├── HookError        — hook 실행 실패
 *   ├── ConfigError      — 설정 파일 파싱/검증 실패
 *   ├── PackError        — pack 설치/로드 실패
 *   ├── ForgeError       — forge dimension/profile 관련 실패
 *   └── NonRetryableError — 재시도 불가 에러 (provider 내부 사용)
 */

// ── Base ──

export interface TenetxErrorOptions {
  code?: string;
  context?: Record<string, unknown>;
  cause?: unknown;
}

/** 모든 tenetx 에러의 기반 클래스 */
export class TenetxError extends Error {
  readonly code: string;
  readonly context: Record<string, unknown>;

  constructor(message: string, options: TenetxErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = 'TenetxError';
    this.code = options.code ?? 'TENETX_ERROR';
    this.context = options.context ?? {};
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
    };
  }
}

// ── Provider ──

export interface ProviderErrorOptions extends TenetxErrorOptions {
  providerName?: string;
  statusCode?: number;
}

/** AI provider 호출 실패 */
export class ProviderError extends TenetxError {
  readonly providerName: string;
  readonly statusCode: number | undefined;

  constructor(message: string, options: ProviderErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'PROVIDER_ERROR' });
    this.name = 'ProviderError';
    this.providerName = options.providerName ?? 'unknown';
    this.statusCode = options.statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      providerName: this.providerName,
      statusCode: this.statusCode,
    };
  }
}

// ── Hook ──

export interface HookErrorOptions extends TenetxErrorOptions {
  hookName?: string;
  eventType?: string;
}

/** hook 실행 실패 */
export class HookError extends TenetxError {
  readonly hookName: string;
  readonly eventType: string;

  constructor(message: string, options: HookErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'HOOK_ERROR' });
    this.name = 'HookError';
    this.hookName = options.hookName ?? 'unknown';
    this.eventType = options.eventType ?? 'unknown';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      hookName: this.hookName,
      eventType: this.eventType,
    };
  }
}

// ── Config ──

export interface ConfigErrorOptions extends TenetxErrorOptions {
  configPath?: string;
  field?: string;
}

/** 설정 파일 파싱/검증 실패 */
export class ConfigError extends TenetxError {
  readonly configPath: string;
  readonly field: string | undefined;

  constructor(message: string, options: ConfigErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'CONFIG_ERROR' });
    this.name = 'ConfigError';
    this.configPath = options.configPath ?? 'unknown';
    this.field = options.field;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      configPath: this.configPath,
      field: this.field,
    };
  }
}

// ── Pack ──

export interface PackErrorOptions extends TenetxErrorOptions {
  packName?: string;
}

/** pack 설치/로드 실패 */
export class PackError extends TenetxError {
  readonly packName: string;

  constructor(message: string, options: PackErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'PACK_ERROR' });
    this.name = 'PackError';
    this.packName = options.packName ?? 'unknown';
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      packName: this.packName,
    };
  }
}

// ── Forge ──

export interface ForgeErrorOptions extends TenetxErrorOptions {
  dimension?: string;
  profile?: string;
}

/** forge dimension/profile 관련 실패 */
export class ForgeError extends TenetxError {
  readonly dimension: string | undefined;
  readonly profile: string | undefined;

  constructor(message: string, options: ForgeErrorOptions = {}) {
    super(message, { ...options, code: options.code ?? 'FORGE_ERROR' });
    this.name = 'ForgeError';
    this.dimension = options.dimension;
    this.profile = options.profile;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      dimension: this.dimension,
      profile: this.profile,
    };
  }
}

// ── NonRetryable ──

/** 재시도 불가 에러 (401/403 등) — provider 내부에서 사용 */
export class NonRetryableError extends TenetxError {
  constructor(message: string) {
    super(message, { code: 'NON_RETRYABLE_ERROR' });
    this.name = 'NonRetryableError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
