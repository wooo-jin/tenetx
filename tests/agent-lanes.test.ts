import { describe, it, expect } from 'vitest';
import { LANES, getLaneForAgent, getAgentsInLane, getNextAgent } from '../src/engine/agent-lanes.js';
import type { AgentLane } from '../src/engine/agent-lanes.js';

describe('agent-lanes', () => {
  describe('LANES', () => {
    it('should define all three lanes', () => {
      expect(Object.keys(LANES)).toEqual(['build', 'review', 'domain']);
    });

    it('build lane should have ordered pipeline agents', () => {
      expect(LANES.build.agents).toEqual([
        'explore', 'analyst', 'planner', 'architect',
        'debugger', 'executor', 'verifier', 'code-simplifier', 'refactoring-expert',
      ]);
    });

    it('review lane should have quality agents', () => {
      expect(LANES.review.agents).toEqual(['code-reviewer', 'security-reviewer', 'critic']);
    });

    it('domain lane should have domain-specific agents', () => {
      expect(LANES.domain.agents).toEqual([
        'designer', 'test-engineer', 'writer', 'qa-tester', 'performance-reviewer',
        'scientist', 'git-master',
      ]);
    });

    it('no agent should appear in multiple lanes', () => {
      const allAgents = Object.values(LANES).flatMap(l => l.agents);
      const unique = new Set(allAgents);
      expect(allAgents.length).toBe(unique.size);
    });
  });

  describe('getLaneForAgent', () => {
    it('should return build for build-lane agents', () => {
      expect(getLaneForAgent('explore')).toBe('build');
      expect(getLaneForAgent('executor')).toBe('build');
      expect(getLaneForAgent('verifier')).toBe('build');
    });

    it('should return review for review-lane agents', () => {
      expect(getLaneForAgent('code-reviewer')).toBe('review');
      expect(getLaneForAgent('security-reviewer')).toBe('review');
      expect(getLaneForAgent('critic')).toBe('review');
    });

    it('should return domain for domain-lane agents', () => {
      expect(getLaneForAgent('designer')).toBe('domain');
      expect(getLaneForAgent('writer')).toBe('domain');
      expect(getLaneForAgent('qa-tester')).toBe('domain');
    });

    it('should return domain for new domain agents', () => {
      expect(getLaneForAgent('scientist')).toBe('domain');
      expect(getLaneForAgent('git-master')).toBe('domain');
    });

    it('should return build for code-simplifier', () => {
      expect(getLaneForAgent('code-simplifier')).toBe('build');
    });

    it('should return null for unknown agents', () => {
      expect(getLaneForAgent('unknown-agent')).toBeNull();
    });
  });

  describe('getAgentsInLane', () => {
    it('should return agents for each lane', () => {
      const lanes: AgentLane[] = ['build', 'review', 'domain'];
      for (const lane of lanes) {
        expect(getAgentsInLane(lane)).toEqual(LANES[lane].agents);
      }
    });
  });

  describe('getNextAgent', () => {
    it('should return next agent in build pipeline', () => {
      expect(getNextAgent('explore')).toBe('analyst');
      expect(getNextAgent('analyst')).toBe('planner');
      expect(getNextAgent('planner')).toBe('architect');
      expect(getNextAgent('executor')).toBe('verifier');
      expect(getNextAgent('verifier')).toBe('code-simplifier');
      expect(getNextAgent('code-simplifier')).toBe('refactoring-expert');
    });

    it('should return null for last agent in build pipeline', () => {
      expect(getNextAgent('refactoring-expert')).toBeNull();
    });

    it('should return null for non-build agents', () => {
      expect(getNextAgent('code-reviewer')).toBeNull();
      expect(getNextAgent('designer')).toBeNull();
    });

    it('should return null for unknown agents', () => {
      expect(getNextAgent('unknown')).toBeNull();
    });
  });
});
