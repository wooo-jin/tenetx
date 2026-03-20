/**
 * Governance — 철학 준수 리포트 생성
 *
 * philosophy.yaml 원칙별 위반 리포트, 준수율 계산, 세션별 트렌드.
 * constraint-runner의 위반 이력과 세션 로그를 종합 분석.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPhilosophyForProject } from '../core/philosophy-loader.js';
import { runConstraintsOnProject } from './constraints/constraint-runner.js';
import { SESSIONS_DIR, STATE_DIR } from '../core/paths.js';
import type { Philosophy, Principle } from '../core/types.js';
import type { ConstraintViolation } from './constraints/types.js';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface PrincipleReport {
  principle: string;
  belief: string;
  generatedRules: string[];
  violations: ViolationEntry[];
  complianceRate: number; // 0-100
}

export interface ViolationEntry {
  type: 'constraint' | 'hook-trigger' | 'pattern';
  description: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface GovernanceReport {
  philosophy: string;
  generatedAt: string;
  principles: PrincipleReport[];
  overallCompliance: number;
  trends: TrendEntry[];
}

export interface TrendEntry {
  date: string;
  compliance: number;
  violations: number;
}

const GOVERNANCE_DIR = path.join(STATE_DIR, 'governance');

// ────────────────────────────────────────────────────────────────────────────
// Core
// ────────────────────────────────────────────────────────────────────────────

/** 거버넌스 리포트 생성 */
export async function generateGovernanceReport(cwd: string): Promise<GovernanceReport> {
  const { philosophy } = loadPhilosophyForProject(cwd);

  // Constraint 위반 수집
  const constraintResult = runConstraintsOnProject(cwd);
  const violations = constraintResult.violations;

  // 원칙별 리포트 생성
  const principleReports = buildPrincipleReports(philosophy, violations);

  // 전체 준수율
  const overallCompliance = principleReports.length > 0
    ? Math.round(
        principleReports.reduce((sum, p) => sum + p.complianceRate, 0) / principleReports.length,
      )
    : 100;

  // 세션 기반 트렌드
  const trends = buildTrends();

  const report: GovernanceReport = {
    philosophy: philosophy.name,
    generatedAt: new Date().toISOString(),
    principles: principleReports,
    overallCompliance,
    trends,
  };

  // 리포트 저장
  saveReport(report);

  return report;
}

/** 원칙별 리포트 빌드 */
function buildPrincipleReports(
  philosophy: Philosophy,
  constraintViolations: ConstraintViolation[],
): PrincipleReport[] {
  const reports: PrincipleReport[] = [];

  for (const [name, principle] of Object.entries(philosophy.principles)) {
    const generatedRules = extractRuleNames(principle);
    const principleViolations = matchViolationsToPrinciple(
      name,
      principle,
      constraintViolations,
    );

    // 준수율: 위반이 없으면 100, 위반 수에 따라 감소
    const criticalCount = principleViolations.filter(v => v.severity === 'critical').length;
    const warningCount = principleViolations.filter(v => v.severity === 'warning').length;
    const penalty = criticalCount * 20 + warningCount * 5;
    const complianceRate = Math.max(0, 100 - penalty);

    reports.push({
      principle: name,
      belief: principle.belief,
      generatedRules,
      violations: principleViolations,
      complianceRate,
    });
  }

  return reports;
}

/** 원칙에서 생성된 규칙 이름 추출 */
function extractRuleNames(principle: Principle): string[] {
  return principle.generates.map(g => {
    if (typeof g === 'string') return g;
    return Object.entries(g).map(([k, v]) => `${k}: ${v}`).join(', ');
  });
}

/** 제약 위반을 원칙에 매핑 */
function matchViolationsToPrinciple(
  _principleName: string,
  principle: Principle,
  constraintViolations: ConstraintViolation[],
): ViolationEntry[] {
  const entries: ViolationEntry[] = [];

  // principle.generates에서 언급된 키워드로 매칭 시도
  const keywords = principle.generates
    .map(g => (typeof g === 'string' ? g : JSON.stringify(g)))
    .join(' ')
    .toLowerCase();

  for (const v of constraintViolations) {
    // 간단한 키워드 매칭: 제약 ID나 메시지가 원칙 키워드와 관련되는지
    const matchText = `${v.constraintId} ${v.message}`.toLowerCase();
    // 불용어 제외 후 2글자 이상 키워드로 매칭 (TDD, API 등 짧은 키워드 지원)
    const stopwords = new Set(['the', 'and', 'for', 'from', 'with', 'that', 'this', 'are', 'was', 'not']);
    const hasOverlap = keywords.split(/\s+/).some(
      kw => kw.length > 2 && !stopwords.has(kw) && matchText.includes(kw),
    );

    if (hasOverlap) {
      entries.push({
        type: 'constraint',
        description: `${v.filePath}: ${v.message}`,
        timestamp: new Date().toISOString(),
        severity: v.severity === 'error' ? 'critical' : v.severity === 'warn' ? 'warning' : 'info',
      });
    }
  }

  return entries;
}

/** 세션 로그에서 트렌드 빌드 */
function buildTrends(): TrendEntry[] {
  const trends: TrendEntry[] = [];

  try {
    if (!fs.existsSync(SESSIONS_DIR)) return trends;

    const files = fs.readdirSync(SESSIONS_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .slice(-30); // 최근 30개

    // 날짜별 그룹
    const dateMap = new Map<string, number>();
    for (const file of files) {
      const date = file.slice(0, 10);
      dateMap.set(date, (dateMap.get(date) ?? 0) + 1);
    }

    // 과거 거버넌스 리포트에서 위반 수 가져오기
    const reportFiles = loadReportHistory();

    for (const [date] of dateMap) {
      const report = reportFiles.find(r => r.date === date);
      trends.push({
        date,
        compliance: report?.compliance ?? 100,
        violations: report?.violations ?? 0,
      });
    }
  } catch { /* ignore */ }

  return trends;
}

interface ReportHistoryEntry {
  date: string;
  compliance: number;
  violations: number;
}

/** 과거 거버넌스 리포트 로드 */
function loadReportHistory(): ReportHistoryEntry[] {
  const entries: ReportHistoryEntry[] = [];
  try {
    if (!fs.existsSync(GOVERNANCE_DIR)) return entries;

    const files = fs.readdirSync(GOVERNANCE_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .slice(-30);

    for (const file of files) {
      try {
        const raw = JSON.parse(
          fs.readFileSync(path.join(GOVERNANCE_DIR, file), 'utf-8'),
        );
        const date = raw.generatedAt?.slice(0, 10) ?? file.slice(0, 10);
        const totalViolations = (Array.isArray(raw.principles) ? raw.principles : []).reduce(
          (sum: number, p: PrincipleReport) => sum + p.violations.length,
          0,
        );
        entries.push({
          date,
          compliance: raw.overallCompliance ?? 100,
          violations: totalViolations,
        });
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }

  return entries;
}

/** 리포트 저장 */
function saveReport(report: GovernanceReport): void {
  try {
    fs.mkdirSync(GOVERNANCE_DIR, { recursive: true });
    const filename = `${report.generatedAt.slice(0, 10)}_${Date.now()}.json`;
    fs.writeFileSync(
      path.join(GOVERNANCE_DIR, filename),
      JSON.stringify(report, null, 2),
    );
  } catch { /* ignore */ }
}

// ────────────────────────────────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────────────────────────────────

/** 거버넌스 리포트를 Markdown으로 포맷 */
export function formatGovernanceReport(report: GovernanceReport): string {
  const lines: string[] = [];

  lines.push(`# Governance Report — ${report.philosophy}`);
  lines.push('');
  lines.push(`> 생성: ${report.generatedAt.split('T')[0]}`);
  lines.push(`> 전체 준수율: ${report.overallCompliance}%`);
  lines.push('');

  // 원칙별
  lines.push('## 원칙별 준수율');
  lines.push('');

  for (const p of report.principles) {
    const bar = complianceBar(p.complianceRate);
    lines.push(`### ${p.principle} ${bar} ${p.complianceRate}%`);
    lines.push(`> ${p.belief}`);
    lines.push('');

    if (p.generatedRules.length > 0) {
      lines.push('규칙:');
      for (const r of p.generatedRules) {
        lines.push(`  - ${r}`);
      }
      lines.push('');
    }

    if (p.violations.length > 0) {
      lines.push(`위반 (${p.violations.length}건):`);
      for (const v of p.violations) {
        const icon = v.severity === 'critical' ? '🚫' : v.severity === 'warning' ? '⚠' : 'ℹ';
        lines.push(`  ${icon} [${v.type}] ${v.description}`);
      }
      lines.push('');
    }
  }

  // 트렌드
  if (report.trends.length > 0) {
    lines.push('## 트렌드');
    lines.push('');
    lines.push('| 날짜 | 준수율 | 위반 |');
    lines.push('|------|--------|------|');
    for (const t of report.trends.slice(-10)) {
      lines.push(`| ${t.date} | ${t.compliance}% | ${t.violations} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** 준수율 시각화 바 */
function complianceBar(rate: number): string {
  const filled = Math.round(rate / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// ────────────────────────────────────────────────────────────────────────────
// CLI Handler
// ────────────────────────────────────────────────────────────────────────────

const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

export async function handleGovernance(args: string[]): Promise<void> {
  const cwd = process.cwd();
  const jsonMode = args.includes('--json');
  const trendOnly = args.includes('--trend');

  console.log(`\n  ${DIM}Generating governance report...${RST}`);

  const report = await generateGovernanceReport(cwd);

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (trendOnly) {
    console.log(`\n  ${BOLD}Tenetx — Governance Trends${RST}\n`);
    if (report.trends.length === 0) {
      console.log('  No trend data available.\n');
      return;
    }
    for (const t of report.trends.slice(-10)) {
      const color = t.compliance >= 80 ? GREEN : t.compliance >= 50 ? YELLOW : RED;
      console.log(`  ${t.date}  ${color}${complianceBar(t.compliance)}${RST} ${t.compliance}%  (${t.violations} violation(s))`);
    }
    console.log('');
    return;
  }

  // 전체 리포트
  console.log(`\n  ${BOLD}Tenetx — Governance Report${RST}`);
  console.log(`  Philosophy: ${report.philosophy}`);

  const overallColor = report.overallCompliance >= 80 ? GREEN : report.overallCompliance >= 50 ? YELLOW : RED;
  console.log(`  Overall compliance: ${overallColor}${report.overallCompliance}%${RST}\n`);

  for (const p of report.principles) {
    const color = p.complianceRate >= 80 ? GREEN : p.complianceRate >= 50 ? YELLOW : RED;
    console.log(`  ${color}${complianceBar(p.complianceRate)}${RST} ${p.complianceRate}%  ${BOLD}${p.principle}${RST}`);
    console.log(`    ${DIM}${p.belief}${RST}`);

    if (p.violations.length > 0) {
      console.log(`    ${p.violations.length} violation(s):`);
      for (const v of p.violations.slice(0, 5)) {
        const icon = v.severity === 'critical' ? `${RED}✗${RST}` : v.severity === 'warning' ? `${YELLOW}⚠${RST}` : `${DIM}ℹ${RST}`;
        console.log(`      ${icon} ${v.description}`);
      }
      if (p.violations.length > 5) {
        console.log(`      ${DIM}... and ${p.violations.length - 5} more${RST}`);
      }
    }
    console.log('');
  }

  if (report.trends.length > 0) {
    console.log(`  ${DIM}Trends (recent):${RST}`);
    for (const t of report.trends.slice(-5)) {
      const c = t.compliance >= 80 ? GREEN : t.compliance >= 50 ? YELLOW : RED;
      console.log(`    ${t.date}  ${c}${t.compliance}%${RST}  (${t.violations} violation(s))`);
    }
    console.log('');
  }

  // Markdown 리포트도 파일로 저장됨
  const md = formatGovernanceReport(report);
  const mdPath = path.join(GOVERNANCE_DIR, `report-${report.generatedAt.slice(0, 10)}.md`);
  try {
    fs.mkdirSync(GOVERNANCE_DIR, { recursive: true });
    fs.writeFileSync(mdPath, md);
    console.log(`  ${DIM}Report saved: ${mdPath}${RST}\n`);
  } catch { /* ignore */ }
}
