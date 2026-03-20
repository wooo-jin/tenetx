/**
 * dashboard.ts -- Tenetx TUI Dashboard
 *
 * Ink/React based terminal UI running inside a tmux pane.
 */

import { execFileSync } from 'node:child_process';

const PANE_TITLE = 'compound-dashboard';

// ── tmux Pane management ────────────────────────────────────────────────────

/** Find dashboard pane ID in current tmux session */
function findDashboardPane(): string | null {
  try {
    const output = execFileSync('tmux', ['list-panes', '-F', '#{pane_id}:#{pane_title}'], {
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
    console.log('[tenetx] Dashboard is not supported on Windows.');
    console.log('  Please use WSL or macOS/Linux.');
    return;
  }
  if (!process.env.TMUX) {
    console.log('[tenetx] Dashboard is only available inside a tmux session.');
    console.log('  Install: brew install tmux (macOS) / apt install tmux (Linux)');
    return;
  }

  const existingPane = findDashboardPane();
  if (existingPane) {
    // Already open -> close
    try { execFileSync('tmux', ['kill-pane', '-t', existingPane], { stdio: 'ignore' }); } catch { /* expected: pane이 이미 닫혀있을 수 있음 */ }
  } else {
    // Open new pane
    try {
      execFileSync('tmux', ['split-window', '-h', '-l', '40%', 'tenetx dashboard'], { stdio: 'ignore' });
      execFileSync('tmux', ['select-pane', '-T', PANE_TITLE], { stdio: 'ignore' });
      execFileSync('tmux', ['last-pane'], { stdio: 'ignore' });
    } catch (err) {
      console.error('[tenetx] Failed to open dashboard:', err);
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
