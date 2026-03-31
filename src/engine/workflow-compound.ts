/**
 * Tenetx — Workflow-Compound Integration
 *
 * Connects execution modes (autopilot, ralph, team, tdd, etc.)
 * with compound learning. Each mode's completion triggers
 * phase-aware pattern extraction.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { STATE_DIR, ME_SOLUTIONS } from '../core/paths.js';
import { serializeSolutionV3, DEFAULT_EVIDENCE } from './solution-format.js';
import type { SolutionV3 } from './solution-format.js';
import { track } from '../lab/tracker.js';
import { createLogger } from '../core/logger.js';

const log = createLogger('workflow-compound');

const WORKFLOW_STATE_PATH = path.join(STATE_DIR, 'workflow-state.json');

interface WorkflowState {
  activeMode: string | null;
  startedAt: string | null;
  promptCount: number;
  toolCallCount: number;
  sessionId: string;
}

/** Record that a workflow mode was activated */
export function recordModeStart(mode: string, sessionId: string): void {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const state: WorkflowState = {
      activeMode: mode,
      startedAt: new Date().toISOString(),
      promptCount: 0,
      toolCallCount: 0,
      sessionId,
    };
    fs.writeFileSync(WORKFLOW_STATE_PATH, JSON.stringify(state));
  } catch (e) {
    log.debug('mode start 기록 실패', e);
  }
}

/** Increment counters for the active workflow */
export function incrementWorkflowCounter(type: 'prompt' | 'toolCall'): void {
  try {
    if (!fs.existsSync(WORKFLOW_STATE_PATH)) return;
    const state: WorkflowState = JSON.parse(fs.readFileSync(WORKFLOW_STATE_PATH, 'utf-8'));
    if (!state.activeMode) return;
    if (type === 'prompt') state.promptCount++;
    else state.toolCallCount++;
    fs.writeFileSync(WORKFLOW_STATE_PATH, JSON.stringify(state));
  } catch (e) { log.debug('workflow 카운터 증가 실패 — 통계 손실 가능', e); }
}

/** Check if a workflow completed successfully and extract a workflow pattern */
export function checkWorkflowCompletion(sessionId: string): void {
  try {
    if (!fs.existsSync(WORKFLOW_STATE_PATH)) return;
    const state: WorkflowState = JSON.parse(fs.readFileSync(WORKFLOW_STATE_PATH, 'utf-8'));
    if (!state.activeMode || !state.startedAt) return;

    const duration = Date.now() - new Date(state.startedAt).getTime();
    const durationMin = Math.round(duration / 60000);

    // Only extract if the workflow had meaningful activity
    if (state.toolCallCount < 3) return;

    // Generate workflow-specific insight
    const insight = generateWorkflowInsight(state, durationMin);
    if (!insight) return;

    // Save as compound solution
    const today = new Date().toISOString().split('T')[0];
    const solution: SolutionV3 = {
      frontmatter: {
        name: insight.name,
        version: 1,
        status: 'experiment',
        confidence: 0.3,
        type: 'decision',
        scope: 'me',
        tags: insight.tags,
        identifiers: [],
        evidence: { ...DEFAULT_EVIDENCE },
        created: today,
        updated: today,
        supersedes: null,
        extractedBy: 'auto',
      },
      context: insight.context,
      content: insight.content,
    };

    const solutionPath = path.join(ME_SOLUTIONS, `${insight.name}.md`);
    if (fs.existsSync(solutionPath)) {
      // Already exists — don't overwrite
      clearWorkflowState();
      return;
    }

    fs.mkdirSync(ME_SOLUTIONS, { recursive: true });
    fs.writeFileSync(solutionPath, serializeSolutionV3(solution));

    track('compound-extracted', sessionId, {
      solutionName: insight.name,
      type: 'decision',
      source: 'workflow-completion',
      mode: state.activeMode,
      duration: durationMin,
    });

    log.debug(`워크플로우 패턴 추출: ${insight.name}`);
    clearWorkflowState();
  } catch (e) {
    log.debug('workflow completion 체크 실패', e);
  }
}

function clearWorkflowState(): void {
  try { fs.unlinkSync(WORKFLOW_STATE_PATH); } catch (e) { log.debug('workflow 상태 파일 삭제 실패 — 다음 실행에서 재시도', e); }
}

interface WorkflowInsight {
  name: string;
  tags: string[];
  context: string;
  content: string;
}

function generateWorkflowInsight(state: WorkflowState, durationMin: number): WorkflowInsight | null {
  const mode = state.activeMode ?? '';
  const efficiency = state.toolCallCount > 0
    ? `${state.promptCount} prompts, ${state.toolCallCount} tool calls in ${durationMin}min`
    : '';

  switch (mode) {
    case 'autopilot':
      return {
        name: `autopilot-run-${Date.now()}`,
        tags: ['workflow', 'autopilot', 'autonomous', 'pipeline'],
        context: 'Autopilot mode completed a task autonomously',
        content: `Autopilot execution: ${efficiency}. 5-stage pipeline (explore→plan→implement→QA→verify) was used for this task.`,
      };

    case 'ralph':
      return {
        name: `ralph-completion-${Date.now()}`,
        tags: ['workflow', 'ralph', 'iterative', 'completion'],
        context: 'Ralph mode completed with verify/fix loop',
        content: `Ralph iteration: ${efficiency}. Task was completed through iterative verify/fix cycles until all criteria were met.`,
      };

    case 'team':
      return {
        name: `team-execution-${Date.now()}`,
        tags: ['workflow', 'team', 'parallel', 'multi-agent'],
        context: 'Team mode completed with parallel agents',
        content: `Team execution: ${efficiency}. Multiple specialized agents worked in parallel to complete the task.`,
      };

    case 'tdd':
      return {
        name: `tdd-cycle-${Date.now()}`,
        tags: ['workflow', 'tdd', 'testing', 'red-green-refactor'],
        context: 'TDD cycle completed (red→green→refactor)',
        content: `TDD cycle: ${efficiency}. Tests were written first, then implementation, then refactoring.`,
      };

    case 'ultrawork':
      return {
        name: `ultrawork-burst-${Date.now()}`,
        tags: ['workflow', 'ultrawork', 'parallel', 'burst'],
        context: 'Ultrawork burst mode completed',
        content: `Ultrawork burst: ${efficiency}. Maximum parallelism was used for independent tasks.`,
      };

    case 'pipeline':
      return {
        name: `pipeline-run-${Date.now()}`,
        tags: ['workflow', 'pipeline', 'sequential', 'stages'],
        context: 'Pipeline mode completed sequential stages',
        content: `Pipeline execution: ${efficiency}. Tasks were processed sequentially through defined stages.`,
      };

    case 'ccg':
      return {
        name: `ccg-synthesis-${Date.now()}`,
        tags: ['workflow', 'ccg', 'multi-model', 'synthesis'],
        context: 'CCG tri-model synthesis completed',
        content: `CCG synthesis: ${efficiency}. Three models (Claude/Codex/Gemini) cross-validated the result.`,
      };

    default:
      // Unknown/external mode (e.g. triggered via OMC or third-party plugin) —
      // record as external-{modeName} so compound learning is not silently skipped
      return {
        name: `external-${mode}-${Date.now()}`,
        tags: ['workflow', 'external', mode],
        context: `External mode "${mode}" completed`,
        content: `External workflow execution: ${efficiency}. Mode "${mode}" was triggered outside tenetx core (e.g. OMC or plugin).`,
      };
  }
}
