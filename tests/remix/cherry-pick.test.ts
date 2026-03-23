import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  buildRemixPlan,
  selectComponents,
  formatRemixPlan,
  getLocalComponentPath,
} from '../../src/remix/cherry-pick.js';
import { hashContent } from '../../src/remix/registry.js';
import type {
  RemixableComponent,
  PublishedHarness,
} from '../../src/remix/types.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

function makeFakeComponent(overrides: Partial<RemixableComponent> = {}): RemixableComponent {
  return {
    type: 'agent',
    name: `test-agent-${Math.random().toString(36).slice(2)}`,
    description: 'A test component',
    contentHash: hashContent('some content ' + Math.random()),
    content: 'some content',
    ...overrides,
  };
}

function makeFakeHarness(): PublishedHarness {
  return {
    id: 'test-harness',
    name: '@test-harness',
    author: 'tester',
    description: 'A test harness',
    source: 'https://github.com/test/test',
    tags: ['test'],
  };
}

describe('selectComponents', () => {
  const components: RemixableComponent[] = [
    { type: 'agent', name: 'executor', description: 'Executor agent', contentHash: hashContent('a') },
    { type: 'rule', name: 'tdd-rule', description: 'TDD rule', contentHash: hashContent('b') },
    { type: 'skill', name: 'autopilot', description: 'Autopilot skill', contentHash: hashContent('c') },
  ];

  it('returns all components when no names specified', () => {
    const result = selectComponents(components);
    expect(result.length).toBe(3);
  });

  it('returns all components when names array is empty', () => {
    const result = selectComponents(components, []);
    expect(result.length).toBe(3);
  });

  it('selects components by plain name', () => {
    const result = selectComponents(components, ['executor']);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('executor');
  });

  it('selects components by type:name format', () => {
    const result = selectComponents(components, ['rule:tdd-rule']);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('tdd-rule');
  });

  it('returns empty array when no names match', () => {
    const result = selectComponents(components, ['nonexistent']);
    expect(result.length).toBe(0);
  });

  it('handles multiple names', () => {
    const result = selectComponents(components, ['executor', 'autopilot']);
    expect(result.length).toBe(2);
    expect(result.map(c => c.name)).toContain('executor');
    expect(result.map(c => c.name)).toContain('autopilot');
  });
});

describe('buildRemixPlan - conflict detection', () => {
  const tmpDir = path.join(os.tmpdir(), `tenetx-test-remix-${process.pid}`);
  const harness = makeFakeHarness();

  beforeAll(() => {
    fs.mkdirSync(path.join(tmpDir, '.claude', 'agents'), { recursive: true });
  });

  afterAll(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('categorizes new components as additions', () => {
    const component = makeFakeComponent({ type: 'agent', name: 'brand-new-agent-xyz' });
    const plan = buildRemixPlan(harness, [component], tmpDir);
    expect(plan.additions.length).toBe(1);
    expect(plan.conflicts.length).toBe(0);
    expect(plan.skipped.length).toBe(0);
  });

  it('categorizes identical existing component as skipped', () => {
    const content = 'my agent content for skip test';
    const agentName = 'skip-test-agent';
    const agentPath = path.join(tmpDir, '.claude', 'agents', `${agentName}.md`);
    fs.writeFileSync(agentPath, content);

    const component: RemixableComponent = {
      type: 'agent',
      name: agentName,
      description: 'Test',
      contentHash: hashContent(content), // Same hash as local file
      content,
    };

    const plan = buildRemixPlan(harness, [component], tmpDir);
    expect(plan.skipped.length).toBe(1);
    expect(plan.additions.length).toBe(0);
    expect(plan.conflicts.length).toBe(0);
  });

  it('categorizes different existing component as conflict', () => {
    const localContent = 'original agent content';
    const incomingContent = 'different agent content';
    const agentName = 'conflict-test-agent';
    const agentPath = path.join(tmpDir, '.claude', 'agents', `${agentName}.md`);
    fs.writeFileSync(agentPath, localContent);

    const component: RemixableComponent = {
      type: 'agent',
      name: agentName,
      description: 'Test',
      contentHash: hashContent(incomingContent), // Different hash
      content: incomingContent,
    };

    const plan = buildRemixPlan(harness, [component], tmpDir);
    expect(plan.conflicts.length).toBe(1);
    expect(plan.additions.length).toBe(0);
    expect(plan.skipped.length).toBe(0);
  });

  it('conflict entry contains localHash and incomingHash', () => {
    const localContent = 'local content abc';
    const incomingContent = 'incoming content xyz';
    const agentName = 'hash-test-agent';
    const agentPath = path.join(tmpDir, '.claude', 'agents', `${agentName}.md`);
    fs.writeFileSync(agentPath, localContent);

    const component: RemixableComponent = {
      type: 'agent',
      name: agentName,
      description: 'Test',
      contentHash: hashContent(incomingContent),
      content: incomingContent,
    };

    const plan = buildRemixPlan(harness, [component], tmpDir);
    const conflict = plan.conflicts[0];
    expect(conflict.localHash).toBe(hashContent(localContent));
    expect(conflict.incomingHash).toBe(hashContent(incomingContent));
  });

  it('handles mixed components (addition + skip + conflict) correctly', () => {
    const newComponent = makeFakeComponent({ type: 'agent', name: 'fresh-new-agent' });

    const skipContent = 'skip me content';
    const skipName = 'skip-multi-test';
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'agents', `${skipName}.md`),
      skipContent,
    );
    const skipComponent: RemixableComponent = {
      type: 'agent', name: skipName, description: 'Skip',
      contentHash: hashContent(skipContent), content: skipContent,
    };

    const conflictLocalContent = 'local conflict multi';
    const conflictName = 'conflict-multi-test';
    fs.writeFileSync(
      path.join(tmpDir, '.claude', 'agents', `${conflictName}.md`),
      conflictLocalContent,
    );
    const conflictComponent: RemixableComponent = {
      type: 'agent', name: conflictName, description: 'Conflict',
      contentHash: hashContent('incoming conflict multi'), content: 'incoming conflict multi',
    };

    const plan = buildRemixPlan(harness, [newComponent, skipComponent, conflictComponent], tmpDir);
    expect(plan.additions.length).toBe(1);
    expect(plan.skipped.length).toBe(1);
    expect(plan.conflicts.length).toBe(1);
  });

  it('plan contains sourceHarnessId and sourceHarnessName', () => {
    const plan = buildRemixPlan(harness, [], tmpDir);
    expect(plan.sourceHarnessId).toBe('test-harness');
    expect(plan.sourceHarnessName).toBe('@test-harness');
  });
});

describe('formatRemixPlan', () => {
  it('returns a string containing the harness name', () => {
    const harness = makeFakeHarness();
    const plan = buildRemixPlan(harness, [], os.tmpdir());
    const output = formatRemixPlan(plan);
    expect(typeof output).toBe('string');
    expect(output).toContain('@test-harness');
  });

  it('mentions "Nothing to remix" when plan is empty', () => {
    const harness = makeFakeHarness();
    const plan = buildRemixPlan(harness, [], os.tmpdir());
    const output = formatRemixPlan(plan);
    expect(output).toContain('Nothing to remix');
  });
});
