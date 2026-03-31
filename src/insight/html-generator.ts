/**
 * Tenetx Insight — HTML Dashboard Generator
 *
 * 단일 HTML 파일로 Phase 1의 모든 시각화를 통합.
 * Shneiderman(1996) 3계층: Overview → Zoom → Details-on-Demand.
 *
 * 설계 결정:
 *   - Chart.js CDN: 런타임 로드, 패키지 사이즈 0 추가
 *   - noscript + ASCII fallback: CDN 불가 환경 대응
 *   - template literal: 외부 템플릿 엔진 의존성 0
 *   - XSS 방어: 모든 사용자 데이터를 escapeHtml()로 이스케이프
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { buildKnowledgeMap, toMermaid } from './knowledge-map.js';
import { buildTimelineData, toChartData, renderAsciiTimeline } from './evolution-timeline.js';
import { loadForgeProfile } from '../forge/profile.js';
import { SESSIONS_DIR, ME_SOLUTIONS } from '../core/paths.js';
import type { DashboardInput } from './types.js';

// ── XSS Defense ────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function safeJsonInline(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// ── Data Collection ────────────────────────────────

function collectDashboardData(cwd?: string): DashboardInput {
  const graph = buildKnowledgeMap(cwd);
  const timeline = buildTimelineData();
  const profile = loadForgeProfile(cwd);

  let sessionCount = 0;
  try {
    if (fs.existsSync(SESSIONS_DIR)) {
      sessionCount = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json')).length;
    }
  } catch { /* sessions dir read failure — count stays 0 */ }

  let solutionCount = 0;
  try {
    if (fs.existsSync(ME_SOLUTIONS)) {
      solutionCount = fs.readdirSync(ME_SOLUTIONS).filter(f => f.endsWith('.md')).length;
    }
  } catch { /* solutions dir read failure — count stays 0 */ }

  return {
    graph,
    timeline,
    retrospectives: [],
    currentProfile: profile?.dimensions ?? null,
    solutionCount,
    sessionCount,
    generatedAt: new Date().toISOString(),
  };
}

// ── HTML Sections ──────────────────────────────────

function renderProfileSection(profile: Record<string, number> | null): string {
  if (!profile) {
    return `<div class="card"><h2>Forge Profile</h2><p class="muted">프로필 미생성. <code>tenetx forge</code>를 실행하거나 세션을 시작하세요.</p></div>`;
  }

  const dims = Object.entries(profile).slice(0, 5);
  const labels = dims.map(([k]) => `'${escapeHtml(k)}'`).join(',');
  const values = dims.map(([, v]) => v.toFixed(2)).join(',');

  return `
    <div class="card">
      <h2>Forge Profile</h2>
      <div class="chart-container" style="max-width:400px;margin:0 auto">
        <canvas id="radarChart"></canvas>
      </div>
      <script>
        if(typeof Chart !== 'undefined') {
          new Chart(document.getElementById('radarChart'), {
            type: 'radar',
            data: {
              labels: [${labels}],
              datasets: [{
                label: 'Current Profile',
                data: [${values}],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.15)',
                pointBackgroundColor: '#3b82f6'
              }]
            },
            options: {
              scales: { r: { min: 0, max: 1, ticks: { stepSize: 0.2 } } },
              plugins: { legend: { display: false } }
            }
          });
        }
      </script>
      <noscript>
        <pre>${dims.map(([k, v]) => `${escapeHtml(k).padEnd(24)} ${'#'.repeat(Math.round(v * 20)).padEnd(20, '.')} ${v.toFixed(2)}`).join('\n')}</pre>
      </noscript>
    </div>`;
}

function renderTimelineSection(data: DashboardInput): string {
  const chartData = toChartData(data.timeline);
  const asciiFallback = escapeHtml(renderAsciiTimeline(data.timeline));

  if (data.timeline.points.length === 0) {
    return `<div class="card"><h2>Evolution Timeline</h2><p class="muted">데이터 수집 중... 세션을 진행하면 차원 변화 추이가 표시됩니다.</p></div>`;
  }

  return `
    <div class="card">
      <h2>Evolution Timeline</h2>
      <div class="chart-container">
        <canvas id="timelineChart"></canvas>
      </div>
      <script>
        if(typeof Chart !== 'undefined') {
          new Chart(document.getElementById('timelineChart'), {
            type: 'line',
            data: ${safeJsonInline(chartData)},
            options: {
              responsive: true,
              scales: { y: { min: 0, max: 1 } },
              plugins: { legend: { position: 'bottom' } },
              elements: { point: { radius: 2 }, line: { tension: 0.3 } }
            }
          });
        }
      </script>
      <noscript><pre>${asciiFallback}</pre></noscript>
    </div>`;
}

function renderKnowledgeSection(data: DashboardInput): string {
  if (data.graph.nodes.length === 0) {
    return `<div class="card"><h2>Knowledge Map</h2><p class="muted">솔루션이 아직 없습니다.</p></div>`;
  }

  const mermaidFallback = escapeHtml(toMermaid(data.graph));

  // vis-network 용 데이터 변환
  const visNodes = data.graph.nodes.map(n => ({
    id: n.id,
    label: n.title,
    value: n.confidence,
    color: ({ experiment: '#fef3c7', candidate: '#dbeafe', verified: '#d1fae5', mature: '#ede9fe', retired: '#f3f4f6' } as Record<string, string>)[n.status] ?? '#f3f4f6',
    title: `${n.title}\nStatus: ${n.status}\nConfidence: ${n.confidence}\nTags: ${n.tags.join(', ')}`,
  }));
  const visEdges = data.graph.edges.map(e => ({
    from: e.source,
    to: e.target,
    value: e.similarity,
    title: `Similarity: ${e.similarity}`,
  }));

  return `
    <div class="card">
      <h2>Knowledge Map (${data.graph.nodes.length} solutions, ${data.graph.edges.length} connections)</h2>
      <div id="knowledgeGraph" style="height:400px;border:1px solid #e5e7eb;border-radius:8px"></div>
      <script>
        if(typeof vis !== 'undefined') {
          var container = document.getElementById('knowledgeGraph');
          var data = {
            nodes: new vis.DataSet(${safeJsonInline(visNodes)}),
            edges: new vis.DataSet(${safeJsonInline(visEdges)})
          };
          new vis.Network(container, data, {
            physics: { stabilization: { iterations: 100 } },
            nodes: { shape: 'dot', scaling: { min: 10, max: 30 } },
            edges: { scaling: { min: 1, max: 5 }, color: { color: '#94a3b8' } }
          });
        } else {
          document.getElementById('knowledgeGraph').innerHTML = '<pre>' + ${safeJsonInline(mermaidFallback)} + '</pre>';
        }
      </script>
      <noscript><pre>${mermaidFallback}</pre></noscript>
    </div>`;
}

function renderStatsSection(data: DashboardInput): string {
  const dist = data.graph.metadata.statusDistribution;
  return `
    <div class="card">
      <h2>Overview</h2>
      <div class="stats-grid">
        <div class="stat"><span class="stat-value">${data.solutionCount}</span><span class="stat-label">Solutions</span></div>
        <div class="stat"><span class="stat-value">${data.sessionCount}</span><span class="stat-label">Sessions</span></div>
        <div class="stat"><span class="stat-value">${data.timeline.points.length}</span><span class="stat-label">Observations</span></div>
        <div class="stat"><span class="stat-value">${data.graph.metadata.avgConfidence.toFixed(2)}</span><span class="stat-label">Avg Confidence</span></div>
      </div>
      <div class="status-bar">
        ${Object.entries(dist).map(([status, count]) =>
          `<span class="status-chip status-${escapeHtml(status)}">${escapeHtml(status)}: ${count}</span>`
        ).join(' ')}
      </div>
    </div>`;
}

// ── Full HTML ──────────────────────────────────────

function generateFullHtml(data: DashboardInput): string {
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tenetx Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"><\/script>
  <script src="https://cdn.jsdelivr.net/npm/vis-network@9/standalone/umd/vis-network.min.js"><\/script>
  <style>
    :root { --bg: #0f172a; --card: #1e293b; --text: #e2e8f0; --muted: #64748b; --accent: #3b82f6; --border: #334155; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); padding: 24px; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    h2 { font-size: 1.1rem; margin-bottom: 16px; color: var(--accent); }
    .header { text-align: center; margin-bottom: 32px; }
    .header small { color: var(--muted); }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; max-width: 1200px; margin: 0 auto; }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .chart-container { position: relative; width: 100%; }
    .muted { color: var(--muted); font-style: italic; }
    .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 12px; }
    .stat { text-align: center; }
    .stat-value { display: block; font-size: 1.5rem; font-weight: 700; color: var(--accent); }
    .stat-label { font-size: 0.75rem; color: var(--muted); }
    .status-bar { display: flex; gap: 8px; flex-wrap: wrap; }
    .status-chip { font-size: 0.75rem; padding: 2px 8px; border-radius: 12px; }
    .status-experiment { background: #fef3c7; color: #92400e; }
    .status-candidate { background: #dbeafe; color: #1e40af; }
    .status-verified { background: #d1fae5; color: #065f46; }
    .status-mature { background: #ede9fe; color: #5b21b6; }
    pre { background: #0f172a; padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 0.8rem; color: #94a3b8; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } .stats-grid { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>
<body>
  <div class="header">
    <h1>Tenetx Dashboard</h1>
    <small>Generated: ${escapeHtml(data.generatedAt.split('T')[0])} | Solutions: ${data.solutionCount} | Sessions: ${data.sessionCount}</small>
  </div>
  <div class="grid">
    ${renderStatsSection(data)}
    ${renderProfileSection(data.currentProfile)}
    ${renderTimelineSection(data)}
    ${renderKnowledgeSection(data)}
  </div>
  <div style="text-align:center;margin-top:32px;color:var(--muted);font-size:0.75rem">
    Tenetx v3 — The more you use Claude, the better it knows you.
  </div>
</body>
</html>`;
}

// ── Helpers ─────────────────────────────────────────

/** 파일을 기본 브라우저로 열기 (cross-platform) */
export function openInBrowser(filePath: string): void {
  const { execFileSync } = childProcess;
  const cmds: [string, string[]] = process.platform === 'win32' ? ['start', [filePath]]
    : process.platform === 'darwin' ? ['open', [filePath]]
    : ['xdg-open', [filePath]];
  try { execFileSync(cmds[0], cmds[1], { stdio: 'ignore' }); } catch { /* manual open — browser launch failed */ }
}

// ── Public API ──────────────────────────────────────

/** 대시보드 HTML 생성 후 파일 경로 반환 */
export function generateDashboard(cwd?: string): string {
  const data = collectDashboardData(cwd);
  const html = generateFullHtml(data);

  const tmpDir = os.tmpdir();
  const filename = `tenetx-dashboard-${Date.now()}.html`;
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, html);

  return filePath;
}

/** 대시보드 데이터만 수집 (테스트용) */
export function collectData(cwd?: string): DashboardInput {
  return collectDashboardData(cwd);
}
