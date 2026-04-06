/**
 * Tenetx v1 — Runtime Capability Detection
 *
 * 현재 Claude Code 권한 상태를 감지.
 * Authoritative: docs/plans/2026-04-03-tenetx-component-interface-design.md §4
 */

import { SETTINGS_PATH } from './paths.js';
import { safeReadJSON } from '../hooks/shared/atomic-write.js';
import type { RuntimeCapabilityState } from '../store/types.js';

export function detectRuntimeCapability(): RuntimeCapabilityState {
  // 1. CLI 플래그 확인
  const args = process.argv.join(' ');
  const dangerousSkip = args.includes('--dangerously-skip-permissions')
    || process.env.CLAUDE_DANGEROUS_SKIP_PERMISSIONS === 'true';

  if (dangerousSkip) {
    return {
      permission_mode: 'bypassed',
      dangerous_skip_permissions: true,
      auto_accept_scope: ['all'],
      detected_from: 'cli-flag',
    };
  }

  // 2. settings.json에서 permission 관련 설정 확인
  const settings = safeReadJSON<Record<string, unknown>>(SETTINGS_PATH, {});

  const autoApprove = settings.autoApprovePermissions as boolean | undefined;

  if (autoApprove === true) {
    return {
      permission_mode: 'relaxed',
      dangerous_skip_permissions: false,
      auto_accept_scope: ['auto-approve'],
      detected_from: 'settings',
    };
  }

  // 3. 환경변수 확인
  if (process.env.CLAUDE_AUTO_ACCEPT === 'true') {
    return {
      permission_mode: 'relaxed',
      dangerous_skip_permissions: false,
      auto_accept_scope: ['env-auto-accept'],
      detected_from: 'env',
    };
  }

  // 4. 기본값: guarded
  return {
    permission_mode: 'guarded',
    dangerous_skip_permissions: false,
    auto_accept_scope: [],
    detected_from: 'default',
  };
}
