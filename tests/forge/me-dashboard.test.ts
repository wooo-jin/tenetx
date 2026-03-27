import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before importing the module
vi.mock('../../src/forge/profile.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/forge/profile.js')>();
  return {
    ...original,
    loadForgeProfile: vi.fn(),
  };
});

vi.mock('../../src/lab/auto-learn.js', () => ({
  loadEvolutionHistory: vi.fn(() => []),
  loadStoredPatterns: vi.fn(() => []),
}));

vi.mock('../../src/lab/cost-tracker.js', () => ({
  getAllSessionCosts: vi.fn(() => []),
}));

import { runMeDashboard } from '../../src/forge/me-dashboard.js';
import { loadForgeProfile } from '../../src/forge/profile.js';
import { loadEvolutionHistory, loadStoredPatterns } from '../../src/lab/auto-learn.js';
import { getAllSessionCosts } from '../../src/lab/cost-tracker.js';
import { defaultDimensionVector } from '../../src/forge/dimensions.js';
import type { ForgeProfile } from '../../src/forge/types.js';

let consoleLogs: string[] = [];
const originalLog = console.log;

function makeProfile(overrides: Partial<ForgeProfile> = {}): ForgeProfile {
  return {
    version: '1.0.0',
    createdAt: '2026-03-20T00:00:00.000Z',
    updatedAt: '2026-03-25T00:00:00.000Z',
    dimensions: defaultDimensionVector(),
    lastScan: null,
    interviewAnswers: {},
    ...overrides,
  };
}

beforeEach(() => {
  consoleLogs = [];
  console.log = vi.fn((...args: unknown[]) => {
    consoleLogs.push(args.map(String).join(' '));
  });
  vi.clearAllMocks();
});

afterEach(() => {
  console.log = originalLog;
});

describe('runMeDashboard', () => {
  it('shows no-profile message when no profile exists', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(null);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('No profile yet');
  });

  it('renders profile section when profile exists', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('My Forge Profile');
  });

  it('renders dimension bars in profile section', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('[');
    expect(output).toContain(']');
    expect(output).toContain('0.50');
  });

  it('renders no-evolution message when history is empty', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    vi.mocked(loadEvolutionHistory).mockReturnValue([]);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('No evolution history');
  });

  it('renders evolution records when history exists', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    const dims = defaultDimensionVector();
    const newDims = { ...dims, qualityFocus: 0.6 };
    // Use 'as any' since mock only needs runtime-accessed fields
    const records = [{
      timestamp: new Date().toISOString(),
      previousVector: dims,
      newVector: newDims,
      adjustments: [{
        dimension: 'qualityFocus',
        delta: 0.1,
        confidence: 0.8,
        evidence: 'test',
        eventCount: 5,
      }],
      eventWindowDays: 7,
      totalEventsAnalyzed: 10,
    }] as any;
    vi.mocked(loadEvolutionHistory).mockReturnValue(records);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Recent Evolution');
    expect(output).toContain('qualityFocus');
  });

  it('renders no-patterns message when patterns are empty', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    vi.mocked(loadStoredPatterns).mockReturnValue([]);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('No usage data yet');
  });

  it('renders patterns when they exist', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    const patterns = [{
      id: 'frequent-escalation',
      type: 'preference',
      description: 'User frequently escalates model tier',
      confidence: 0.85,
      eventCount: 10,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    }] as any;
    vi.mocked(loadStoredPatterns).mockReturnValue(patterns);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Detected Patterns');
    expect(output).toContain('frequent-escalation');
    expect(output).toContain('0.85');
  });

  it('renders agent tuning section', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(
      makeProfile({ dimensions: { ...defaultDimensionVector(), qualityFocus: 0.9, riskTolerance: 0.1 } }),
    );
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Active Agent Tuning');
  });

  it('renders cost section with no-sessions message', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    vi.mocked(getAllSessionCosts).mockReturnValue([]);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Session Cost');
    expect(output).toContain('no sessions recorded');
  });

  it('renders cost section with session data', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    vi.mocked(getAllSessionCosts).mockReturnValue([{
      sessionId: 'test-session',
      startedAt: new Date().toISOString(),
      totalInputTokens: 50000,
      totalOutputTokens: 10000,
      estimatedCostUsd: 0.25,
      agentCalls: 3,
      modelBreakdown: {},
    }] as any);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Session Cost');
    expect(output).toContain('tokens');
  });

  it('renders suggestions when escalation pattern is detected', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    vi.mocked(loadStoredPatterns).mockReturnValue([{
      id: 'frequent-escalation',
      type: 'preference',
      description: 'Frequently escalates',
      confidence: 0.9,
      eventCount: 5,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    }] as any);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('Suggestions');
    expect(output).toContain('De-escalate');
  });

  it('renders suggestion to run evolve when no history', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    vi.mocked(loadEvolutionHistory).mockReturnValue([]);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('tenetx lab evolve');
  });

  it('renders suggestion for verbose-override pattern', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    vi.mocked(loadStoredPatterns).mockReturnValue([{
      id: 'verbose-override',
      type: 'preference',
      description: 'Frequently overrides verbose',
      confidence: 0.8,
      eventCount: 3,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    }] as any);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('communicationStyle');
  });

  it('renders suggestion for high-override-rate pattern', async () => {
    vi.mocked(loadForgeProfile).mockReturnValue(makeProfile());
    vi.mocked(loadStoredPatterns).mockReturnValue([{
      id: 'high-override-rate',
      type: 'preference',
      description: 'High override rate',
      confidence: 0.75,
      eventCount: 8,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    }] as any);
    await runMeDashboard([]);
    const output = consoleLogs.join('\n');
    expect(output).toContain('autonomyPreference');
  });
});
