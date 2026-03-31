import { describe, it, expect } from 'vitest';
import { inferAgentType, formatOverlayMessage, buildOverlayInjection } from '../../src/orchestration/agent-overlay-injector.js';
import type { AgentOverlay } from '../../src/forge/types.js';

describe('inferAgentType', () => {
  it('detects code-reviewer from Korean prompt', () => {
    expect(inferAgentType('코드 리뷰해줘')).toBe('code-reviewer');
  });

  it('detects code-reviewer from English prompt', () => {
    expect(inferAgentType('review this code')).toBe('code-reviewer');
  });

  it('detects security-reviewer', () => {
    expect(inferAgentType('보안 리뷰 진행해')).toBe('security-reviewer');
  });

  it('detects debugger', () => {
    expect(inferAgentType('이 버그 디버그해줘')).toBe('debugger');
  });

  it('detects test-engineer', () => {
    expect(inferAgentType('테스트 먼저 작성해줘')).toBe('test-engineer');
  });

  it('detects architect', () => {
    expect(inferAgentType('시스템 설계를 잡아보자')).toBe('architect');
  });

  it('detects refactoring-expert', () => {
    expect(inferAgentType('이 코드 리팩토링')).toBe('refactoring-expert');
  });

  it('defaults to executor for generic prompt', () => {
    expect(inferAgentType('이거 구현해줘')).toBe('executor');
  });

  it('defaults to executor for empty prompt', () => {
    expect(inferAgentType('')).toBe('executor');
  });
});

describe('formatOverlayMessage', () => {
  const overlay: AgentOverlay = {
    agentName: 'code-reviewer',
    behaviorModifiers: ['Review depth: thorough', 'Focus on SOLID principles'],
    parameters: { strictness: 0.8, verbosity: 0.5, autonomy: 0.6, depth: 0.7 },
  };

  it('includes agent name in XML tag', () => {
    const msg = formatOverlayMessage('code-reviewer', overlay);
    expect(msg).toContain('agent="code-reviewer"');
  });

  it('includes behavior modifiers', () => {
    const msg = formatOverlayMessage('code-reviewer', overlay);
    expect(msg).toContain('SOLID principles');
  });

  it('includes parameters', () => {
    const msg = formatOverlayMessage('code-reviewer', overlay);
    expect(msg).toContain('strictness=0.80');
    expect(msg).toContain('depth=0.70');
  });
});

describe('buildOverlayInjection', () => {
  const overlays: AgentOverlay[] = [
    {
      agentName: 'code-reviewer',
      behaviorModifiers: ['Be thorough'],
      parameters: { strictness: 0.8, verbosity: 0.5, autonomy: 0.6, depth: 0.7 },
    },
    {
      agentName: 'executor',
      behaviorModifiers: ['Move fast'],
      parameters: { strictness: 0.4, verbosity: 0.3, autonomy: 0.8, depth: 0.5 },
    },
  ];

  it('returns null when overlays is empty', () => {
    expect(buildOverlayInjection('코드 리뷰', [])).toBeNull();
  });

  it('matches code-reviewer for review prompt', () => {
    const result = buildOverlayInjection('코드 리뷰해줘', overlays);
    expect(result).not.toBeNull();
    expect(result!.agentType).toBe('code-reviewer');
    expect(result!.message).toContain('Be thorough');
  });

  it('matches executor for generic prompt', () => {
    const result = buildOverlayInjection('이거 만들어줘', overlays);
    expect(result).not.toBeNull();
    expect(result!.agentType).toBe('executor');
  });

  it('returns null when inferred agent has no overlay', () => {
    const result = buildOverlayInjection('보안 리뷰', overlays); // security-reviewer 없음
    expect(result).toBeNull();
  });

  it('recommends opus when depth >= 0.7', () => {
    const result = buildOverlayInjection('코드 리뷰', overlays);
    expect(result!.recommendedModel).toBe('opus');
  });

  it('recommends sonnet when depth < 0.7', () => {
    const result = buildOverlayInjection('이거 구현해', overlays);
    expect(result!.recommendedModel).toBe('sonnet');
  });
});
