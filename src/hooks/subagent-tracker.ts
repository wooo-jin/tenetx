#!/usr/bin/env node
/**
 * Tenetx — SubagentStart/Stop Hook
 *
 * 에이전트 생성/종료 추적.
 * - 활성 에이전트 수 모니터링
 * - 에이전트 동시 실행 제한 (10개 초과 시 경고)
 * - 에이전트 실행 이력 기록
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { readStdinJSON } from './shared/read-stdin.js';

const STATE_DIR = path.join(os.homedir(), '.compound', 'state');

const MAX_CONCURRENT_AGENTS = 10;
const AGENT_GC_AGE_MS = 60 * 60 * 1000; // 1시간 이상 종료된 에이전트는 GC

interface AgentEntry {
  agentId: string;
  agentType?: string;
  startedAt: string;
  stoppedAt?: string;
}

interface AgentsState {
  sessionId: string;
  agents: AgentEntry[];
}

function getAgentsStatePath(sessionId: string): string {
  return path.join(STATE_DIR, `active-agents-${sessionId}.json`);
}

function loadAgentsState(sessionId: string): AgentsState {
  try {
    const filePath = getAgentsStatePath(sessionId);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { sessionId, agents: [] };
}

function saveAgentsState(state: AgentsState): void {
  // GC: 1시간 이상 종료된 에이전트 제거
  const now = Date.now();
  state.agents = state.agents.filter(a => {
    if (!a.stoppedAt) return true; // 활성 에이전트는 유지
    return now - new Date(a.stoppedAt).getTime() < AGENT_GC_AGE_MS;
  });
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(getAgentsStatePath(state.sessionId), JSON.stringify(state));
}

async function main(): Promise<void> {
  const data = await readStdinJSON();
  if (!data) {
    console.log(JSON.stringify({ result: 'approve' }));
    return;
  }

  const sessionId = (data.session_id as string) ?? 'default';
  // 이벤트 타입은 argv[2] 또는 data 필드에서 판별
  const action = process.argv[2] ?? (data.action as string) ?? '';
  const agentId = (data.agent_id as string) ?? (data.agentId as string) ?? `agent-${Date.now()}`;
  const agentType = (data.agent_type as string) ?? (data.agentType as string) ?? (data.subagent_type as string) ?? '';

  const state = loadAgentsState(sessionId);

  if (action === 'start') {
    state.agents.push({
      agentId,
      agentType: agentType || undefined,
      startedAt: new Date().toISOString(),
    });
    saveAgentsState(state);

    // 활성 에이전트 수 체크
    const activeCount = state.agents.filter(a => !a.stoppedAt).length;
    if (activeCount > MAX_CONCURRENT_AGENTS) {
      console.log(JSON.stringify({
        result: 'approve',
        message: `<compound-tool-warning>\n[Tenetx] ⚠ 활성 에이전트 ${activeCount}개 — 동시 실행이 많습니다. 리소스 사용에 주의하세요.\n</compound-tool-warning>`,
      }));
      return;
    }
  } else if (action === 'stop') {
    // 해당 에이전트 종료 표시
    const agent = state.agents.find(a => a.agentId === agentId && !a.stoppedAt);
    if (agent) {
      agent.stoppedAt = new Date().toISOString();
    }
    saveAgentsState(state);
  }

  console.log(JSON.stringify({ result: 'approve' }));
}

main().catch((e) => {
  process.stderr.write('[ch-hook] ' + (e instanceof Error ? e.message : String(e)) + '\n');
  console.log(JSON.stringify({ result: 'approve' }));
});
