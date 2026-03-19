/**
 * @experimental — 설계 완료, 프로덕션 미연결
 *
 * 이 모듈은 에이전트를 lane(build/review/domain)별로 분류하고
 * 파이프라인 순서를 정의합니다. 현재 src/ 내 어떤 프로덕션 코드에서도
 * import하지 않으며, 테스트만 존재합니다.
 *
 * 향후 team/pipeline 모드에서 에이전트 자동 라우팅 시 연결 예정.
 * 연결 시 src/core/spawn.ts 또는 src/engine/modes.ts에서 import하세요.
 */

export type AgentLane = 'build' | 'review' | 'domain';

export interface LaneDefinition {
  name: AgentLane;
  description: string;
  agents: string[]; // ordered pipeline
}

export const LANES: Record<AgentLane, LaneDefinition> = {
  build: {
    name: 'build',
    description: 'Exploration → Planning → Implementation → Verification pipeline',
    agents: ['explore', 'analyst', 'planner', 'architect', 'debugger', 'executor', 'verifier', 'code-simplifier', 'refactoring-expert'],
  },
  review: {
    name: 'review',
    description: 'Quality assurance and security review',
    agents: ['code-reviewer', 'security-reviewer', 'critic'],
  },
  domain: {
    name: 'domain',
    description: 'Domain-specific expertise',
    agents: ['designer', 'test-engineer', 'writer', 'qa-tester', 'performance-reviewer', 'scientist', 'git-master'],
  },
};

/** Get the lane for a given agent name */
export function getLaneForAgent(agentName: string): AgentLane | null {
  for (const [lane, def] of Object.entries(LANES)) {
    if (def.agents.includes(agentName)) {
      return lane as AgentLane;
    }
  }
  return null;
}

/** Get all agents in a given lane (ordered) */
export function getAgentsInLane(lane: AgentLane): string[] {
  return LANES[lane].agents;
}

/** Get the next agent in the BUILD pipeline after the current one */
export function getNextAgent(currentAgent: string): string | null {
  const buildAgents = LANES.build.agents;
  const idx = buildAgents.indexOf(currentAgent);
  if (idx === -1 || idx === buildAgents.length - 1) return null;
  return buildAgents[idx + 1];
}
