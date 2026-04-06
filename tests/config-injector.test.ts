import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generateClaudeRules,
  generateClaudeRuleFiles,
  generateSecurityRules,
  generateAntiPatternRules,
  generateCompoundRules,
  buildEnv,
} from '../src/core/config-injector.js';

describe('generateSecurityRules', () => {
  it('보안 관련 키워드를 포함한다', () => {
    const result = generateSecurityRules();
    expect(result).toContain('Security Rules');
    expect(result).toContain('Dangerous Command');
    expect(result).toContain('Secret Key Protection');
  });
});

describe('generateAntiPatternRules', () => {
  it('안티패턴 관련 규칙을 포함한다', () => {
    const result = generateAntiPatternRules();
    expect(result).toContain('Anti-Pattern Detection');
    expect(result).toContain('Repeated Edit Warning');
    expect(result).toContain('Error Suppression Warning');
  });
});

describe('generateCompoundRules', () => {
  it('Compound Loop 헤더를 포함한다', () => {
    const result = generateCompoundRules('/tmp/nonexistent');
    expect(result).toContain('Compound Loop');
  });
});

describe('generateClaudeRuleFiles', () => {
  it('project-context.md를 포함한다', () => {
    const files = generateClaudeRuleFiles('/tmp/nonexistent');
    expect(Object.keys(files)).toContain('project-context.md');
  });

  it('project-context.md에 Security와 Anti-Pattern이 포함된다', () => {
    const files = generateClaudeRuleFiles('/tmp/nonexistent');
    const content = files['project-context.md'];
    expect(content).toContain('Security');
    expect(content).toContain('Anti-Pattern');
  });

  it('모든 파일이 비어있지 않다', () => {
    const files = generateClaudeRuleFiles('/tmp/nonexistent');
    for (const [name, content] of Object.entries(files)) {
      expect(content.length, `${name} should not be empty`).toBeGreaterThan(0);
    }
  });
});

describe('generateClaudeRules', () => {
  it('Security와 Anti-Pattern을 포함한다', () => {
    const result = generateClaudeRules('/tmp/nonexistent');
    expect(result).toContain('Security');
    expect(result).toContain('Anti-Pattern');
  });
});

describe('generateClaudeRules — 프로젝트 맵 주입', () => {
  it('프로젝트 맵이 있으면 구조 섹션을 포함한다', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenetx-rules-'));
    try {
      const compoundDir = path.join(tmpDir, '.compound');
      fs.mkdirSync(compoundDir, { recursive: true });
      fs.writeFileSync(path.join(compoundDir, 'project-map.json'), JSON.stringify({
        version: '1.0',
        generatedAt: new Date().toISOString(),
        projectRoot: tmpDir,
        summary: {
          name: 'my-app',
          totalFiles: 42,
          totalLines: 5000,
          languages: { typescript: 4000, json: 1000 },
          framework: 'React',
          packageManager: 'pnpm',
        },
        directories: [
          { path: 'src', type: 'directory', purpose: '소스 코드', fileCount: 30, children: [] },
        ],
        files: [],
        entryPoints: ['src/index.ts'],
        dependencies: [],
      }));

      const rules = generateClaudeRules(tmpDir);
      expect(rules).toContain('Project Structure');
      expect(rules).toContain('my-app');
      expect(rules).toContain('React');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('buildEnv', () => {
  it('COMPOUND_HARNESS가 1이다', () => {
    const env = buildEnv('/tmp/test');
    expect(env['COMPOUND_HARNESS']).toBe('1');
  });

  it('TENETX_V1이 1이다', () => {
    const env = buildEnv('/tmp/test');
    expect(env['TENETX_V1']).toBe('1');
  });

  it('COMPOUND_CWD에 경로가 설정된다', () => {
    const env = buildEnv('/tmp/test');
    expect(env['COMPOUND_CWD']).toBe('/tmp/test');
  });
});
