/**
 * Tenetx — Unified Logger
 *
 * 환경변수:
 *   TENETX_LOG_LEVEL   — debug | info | warn | error (기본: info)
 *   TENETX_DEBUG       — 활성화할 namespace 목록 (쉼표 구분, 예: 'provider,hook')
 *                        '*' 이면 전체 네임스페이스 활성화
 *   COMPOUND_DEBUG=1   — 레거시 호환: 전체 debug 출력 활성화 (TENETX_DEBUG='*' 와 동일)
 *
 * 출력 형식: [tenetx:namespace] message
 * 출력 스트림: stderr (CLI 사용자 출력과 분리)
 *
 * ADR: debugLog()를 직접 대체하지 않고 내부 구현으로 유지.
 *      기존 호출자는 현행 동작을 유지하면서 점진적으로 createLogger()로 마이그레이션.
 */

export enum LogLevel {
  debug = 0,
  info = 1,
  warn = 2,
  error = 3,
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.debug]: 'debug',
  [LogLevel.info]: 'info',
  [LogLevel.warn]: 'warn',
  [LogLevel.error]: 'error',
};

function parseLogLevel(raw: string | undefined): LogLevel {
  switch (raw?.toLowerCase()) {
    case 'debug': return LogLevel.debug;
    case 'warn':  return LogLevel.warn;
    case 'error': return LogLevel.error;
    case 'info':  return LogLevel.info;
    default:
      // COMPOUND_DEBUG=1이 설정되어 있고 TENETX_LOG_LEVEL이 명시되지 않으면 debug 레벨로 동작
      if (process.env.TENETX_DEBUG === '1' || process.env.COMPOUND_DEBUG === '1') return LogLevel.debug;
      return LogLevel.info;
  }
}

function resolveEnabledNamespaces(): Set<string> | '*' | null {
  // 레거시 COMPOUND_DEBUG=1 → 전체 활성화
  if (process.env.TENETX_DEBUG === '1' || process.env.COMPOUND_DEBUG === '1') return '*';

  const raw = process.env.TENETX_DEBUG;
  if (!raw) return null;
  if (raw === '*') return '*';
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

export class Logger {
  readonly namespace: string;

  constructor(namespace: string) {
    this.namespace = namespace;
  }

  private shouldOutput(level: LogLevel): boolean {
    const configuredLevel = parseLogLevel(process.env.TENETX_LOG_LEVEL);

    // info 이상은 namespace 필터 무관하게 레벨만 체크
    if (level >= LogLevel.info) {
      return level >= configuredLevel;
    }

    // debug 레벨: namespace 필터 + 레벨 체크 모두 통과해야 함
    if (level < configuredLevel) return false;

    const enabled = resolveEnabledNamespaces();
    if (enabled === null) return false;
    if (enabled === '*') return true;
    return enabled.has(this.namespace);
  }

  private write(level: LogLevel, msg: string, error?: unknown): void {
    if (!this.shouldOutput(level)) return;
    const label = LEVEL_LABELS[level];
    const errPart = error !== undefined
      ? `: ${error instanceof Error ? error.message : String(error)}`
      : '';
    const line = `[tenetx:${this.namespace}] [${label}] ${msg}${errPart}`;
    // warn/error → console.error, debug/info → console.error (stderr, CLI 출력과 분리)
    console.error(line);
  }

  debug(msg: string, error?: unknown): void { this.write(LogLevel.debug, msg, error); }
  info(msg: string, error?: unknown): void  { this.write(LogLevel.info, msg, error); }
  warn(msg: string, error?: unknown): void  { this.write(LogLevel.warn, msg, error); }
  error(msg: string, error?: unknown): void { this.write(LogLevel.error, msg, error); }
}

/** namespace 기반 Logger 인스턴스 팩토리 */
export function createLogger(namespace: string): Logger {
  return new Logger(namespace);
}

// ── 레거시 호환 API ──────────────────────────────────────────────────────────
//
// 기존 debugLog(context, msg, error?) 호출자는 변경 없이 동작합니다.
// 내부적으로 createLogger를 사용하여 동일한 환경변수 제어를 따릅니다.
// 레거시 형식 출력: [CH:context] message  (기존 형식 유지로 로그 파서 호환)

export function debugLog(context: string, msg: string, error?: unknown): void {
  // 레거시 호환: COMPOUND_DEBUG=1이면 레벨 체크 없이 무조건 출력
  // TENETX_LOG_LEVEL이 명시적으로 설정된 경우에만 레벨 우선순위를 따름
  const isLegacyForced = process.env.TENETX_DEBUG === '1' || process.env.COMPOUND_DEBUG === '1';

  if (!isLegacyForced) {
    const configuredLevel = parseLogLevel(process.env.TENETX_LOG_LEVEL);
    if (LogLevel.debug < configuredLevel) return;
  } else if (process.env.TENETX_LOG_LEVEL) {
    // COMPOUND_DEBUG=1이더라도 명시적 LOG_LEVEL 설정은 존중
    const configuredLevel = parseLogLevel(process.env.TENETX_LOG_LEVEL);
    if (LogLevel.debug < configuredLevel) return;
  }

  const enabled = resolveEnabledNamespaces();
  if (enabled === null && !isLegacyForced) return;
  if (enabled !== null && enabled !== '*' && !enabled.has(context)) return;

  const errMsg = error instanceof Error ? error.message : String(error ?? '');
  console.error(`[CH:${context}] ${msg}${errMsg ? `: ${errMsg}` : ''}`);
}
