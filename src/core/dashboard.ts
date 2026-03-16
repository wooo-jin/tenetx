/**
 * dashboard.ts -- Tenet TUI Dashboard
 *
 * Ink/React based terminal UI running inside a tmux pane.
 */

import { execSync } from 'node:child_process';

const PANE_TITLE = 'compound-dashboard';

// ── tmux Pane management ────────────────────────────────────────────────────

/** Find dashboard pane ID in current tmux session */
function findDashboardPane(): string | null {
  try {
    const output = execSync('tmux list-panes -F "#{pane_id}:#{pane_title}"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    for (const line of output.trim().split('\n')) {
      const [paneId, title] = line.split(':');
      if (title === PANE_TITLE) return paneId;
    }
  } catch { /* expected: tmux 미사용 환경에서 정상 실패 */ }
  return null;
}

/** Toggle tmux dashboard pane open/close */
export async function toggleDashboard(): Promise<void> {
  if (process.platform === 'win32') {
    console.log('[tenet] 대시보드는 현재 Windows를 지원하지 않습니다.');
    console.log('  WSL 또는 macOS/Linux에서 사용하세요.');
    return;
  }
  if (!process.env.TMUX) {
    console.log('[tenet] tmux 세션에서만 대시보드를 사용할 수 있습니다.');
    console.log('  설치: brew install tmux (macOS) / apt install tmux (Linux)');
    return;
  }

  const existingPane = findDashboardPane();
  if (existingPane) {
    // Already open -> close
    try { execSync(`tmux kill-pane -t ${existingPane}`, { stdio: 'ignore' }); } catch { /* expected: pane이 이미 닫혀있을 수 있음 */ }
  } else {
    // Open new pane
    try {
      execSync(`tmux split-window -h -l 40% "tenet dashboard"`, { stdio: 'ignore' });
      execSync(`tmux select-pane -T "${PANE_TITLE}"`, { stdio: 'ignore' });
      execSync('tmux last-pane', { stdio: 'ignore' });
    } catch (err) {
      console.error('[tenet] 대시보드 열기 실패:', err);
    }
  }
}

// ── Dashboard process entry point ───────────────────────────────────────────

/** Dashboard process (runs inside tmux pane) */
export async function runDashboard(): Promise<void> {
  // Dynamic import to avoid loading React/Ink for non-dashboard commands
  const React = await import('react');
  const { render } = await import('ink');
  const { App } = await import('../dashboard/App.js');

  render(React.createElement(App));
}
