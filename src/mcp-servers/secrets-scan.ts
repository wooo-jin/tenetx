/**
 * Secrets Scan MCP Server — 비밀 키 탐지
 *
 * 소스 파일에서 노출된 API 키, 토큰, 비밀번호 등을 스캔.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServerDefinition, SecretFinding } from './types.js';

export const SECRETS_SCAN_DEFINITION: McpServerDefinition = {
  name: 'secrets-scan',
  description: 'Detect exposed secrets/tokens/passwords in source files',
  command: 'node',
  args: ['secrets-scan-server.js'],
  builtin: true,
};

interface SecretPattern {
  name: string;
  regex: RegExp;
  severity: SecretFinding['severity'];
}

const SECRET_PATTERNS: SecretPattern[] = [
  // API Keys
  { name: 'AWS Access Key', regex: /AKIA[0-9A-Z]{16}/, severity: 'high' },
  { name: 'AWS Secret Key', regex: /(?:aws_secret_access_key|AWS_SECRET_ACCESS_KEY)\s*[=:]\s*["']?([A-Za-z0-9/+=]{40})/, severity: 'high' },
  { name: 'GitHub Token', regex: /gh[pousr]_[A-Za-z0-9_]{36,}/, severity: 'high' },
  { name: 'Slack Token', regex: /xox[baprs]-[0-9A-Za-z-]{10,}/, severity: 'high' },
  { name: 'Google API Key', regex: /AIza[0-9A-Za-z_-]{35}/, severity: 'medium' },
  { name: 'Stripe Key', regex: /(?:sk|pk)_(?:test|live)_[A-Za-z0-9]{20,}/, severity: 'high' },
  { name: 'Generic SK/PK Key', regex: /(?:sk|pk)[_-][\w\-.]{20,}/, severity: 'medium' },

  // Tokens / Passwords
  { name: 'Generic API Key', regex: /(?:api_key|apikey|api-key)\s*[=:]\s*["']([A-Za-z0-9_-]{20,})["']/, severity: 'medium' },
  { name: 'Generic Secret', regex: /(?:secret|SECRET)\s*[=:]\s*["']([A-Za-z0-9_-]{20,})["']/, severity: 'medium' },
  { name: 'Password Assignment', regex: /(?:password|passwd|pwd)\s*[=:]\s*["'](?![\s*])([^"']{8,})["']/i, severity: 'medium' },
  { name: 'Bearer Token', regex: /Bearer\s+[A-Za-z0-9_-]{20,}/, severity: 'medium' },

  // Private Keys
  { name: 'Private Key', regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/, severity: 'high' },

  // Connection Strings
  { name: 'Database URL', regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s"']+@[^\s"']+/, severity: 'high' },
];

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  'coverage', '__pycache__', '.venv', 'venv', '.compound', '.claude',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.bz2',
  '.exe', '.dll', '.so', '.dylib',
  '.pdf', '.doc', '.docx',
  '.lock',
]);

const MAX_FILES = 10_000; // 대형 프로젝트 보호

/** 프로젝트 파일에서 비밀 키 스캔 */
export function scanForSecrets(cwd: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  let fileCount = 0;

  function walk(dir: string): void {
    if (fileCount >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        if (fileCount >= MAX_FILES) return;
        fileCount++;
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        // 대형 파일 스킵 (50KB 초과 — 로그, 번들 등)
        try {
          const stat = fs.statSync(fullPath);
          if (stat.size > 50 * 1024) continue;
        } catch { continue; }

        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const lines = content.split('\n');
          const relativePath = path.relative(cwd, fullPath);

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // 주석 줄이나 예제/테스트 패턴 건너뛰기
            if (line.trimStart().startsWith('//') && line.includes('example')) continue;

            for (const pattern of SECRET_PATTERNS) {
              const match = pattern.regex.exec(line);
              if (match) {
                // 스니펫: 민감값을 마스킹하여 노출 방지
                const rawSnippet = line.trim().slice(0, 120);
                const sensitiveValue = match[1] ?? match[0];
                const masked = sensitiveValue.length > 8
                  ? `${sensitiveValue.slice(0, 4)}****${sensitiveValue.slice(-4)}`
                  : '****';
                const snippet = rawSnippet.replace(sensitiveValue, masked);
                findings.push({
                  file: relativePath,
                  line: i + 1,
                  pattern: pattern.name,
                  snippet,
                  severity: pattern.severity,
                });
                break; // 같은 줄에서 여러 패턴 중 첫 매치만 보고
              }
            }
          }
        } catch {
          // 읽기 실패 시 무시
        }
      }
    }
  }

  walk(cwd);
  return findings;
}
