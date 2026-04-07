/**
 * Tenetx — Session Store (Node.js built-in SQLite)
 *
 * 세션 대화를 SQLite에 저장하여 과거 세션을 전문 검색할 수 있게 함.
 * MCP session-search 도구가 이 데이터를 조회.
 * 외부 의존성 없음 — Node.js 22+ 내장 node:sqlite 사용.
 */

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createLogger } from './logger.js';
import { TENETX_HOME } from './paths.js';

const require = createRequire(import.meta.url);

// Suppress ExperimentalWarning for node:sqlite (Node.js 22+)
{
  const origWarningListeners = process.listeners('warning');
  process.removeAllListeners('warning');
  process.on('warning', (warning) => {
    if (warning.name === 'ExperimentalWarning') return;
    for (const listener of origWarningListeners) {
      (listener as (w: Error) => void)(warning);
    }
  });
}

const log = createLogger('session-store');

const DB_PATH = path.join(TENETX_HOME, 'sessions.db');

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...args: unknown[]): { lastInsertRowid: number };
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
  close(): void;
}

interface SessionRow {
  session_id: string;
  role: string;
  content: string;
  timestamp: string;
  cwd: string;
}

let fts5Available = false;

function openDb(): SqliteDb | null {
  try {
    // Node.js 22+ experimental node:sqlite
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(DB_PATH);
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        started_at TEXT NOT NULL,
        message_count INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TEXT NOT NULL
      );
    `);

    // FTS5 가상 테이블 생성 (미지원 시 LIKE 폴백)
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
          content,
          content=messages,
          content_rowid=id,
          tokenize='unicode61 remove_diacritics 2'
        );
      `);
      fts5Available = true;
    } catch (e) {
      log.debug('FTS5 미지원 — LIKE 폴백 사용', e);
      fts5Available = false;
    }

    return db;
  } catch (e) {
    log.debug('SQLite 초기화 실패 (Node.js 22+ 필요)', e);
    return null;
  }
}

/**
 * Transcript JSONL을 SQLite에 인덱싱.
 */
export async function indexSession(cwd: string, transcriptPath: string, sessionId: string): Promise<void> {
  const db = openDb();
  if (!db) return;

  try {
    const existing = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
    if (existing) return;

    const content = fs.readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(Boolean);

    db.prepare(
      'INSERT INTO sessions (id, cwd, started_at, message_count) VALUES (?, ?, ?, 0)'
    ).run(sessionId, cwd, new Date().toISOString());

    let messageCount = 0;
    const insertMsg = db.prepare(
      'INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)'
    );

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        let role = '';
        let text = '';

        if ((entry.type === 'user' || entry.type === 'queue-operation') && typeof entry.content === 'string') {
          role = 'user';
          text = entry.content;
        } else if (entry.type === 'assistant') {
          role = 'assistant';
          text = typeof entry.content === 'string'
            ? entry.content
            : Array.isArray(entry.content)
              ? entry.content.filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('\n')
              : '';
        }

        if (role && text) {
          const truncated = text.slice(0, 10000);
          const result = insertMsg.run(sessionId, role, truncated, entry.timestamp ?? '');
          // FTS5 인덱스 동기화
          if (fts5Available) {
            try {
              db.prepare('INSERT INTO messages_fts(rowid, content) VALUES (?, ?)').run(result.lastInsertRowid, truncated);
            } catch { /* FTS sync failure — search may miss this message */ }
          }
          messageCount++;
        }
      } catch { /* skip malformed lines */ }
    }

    db.prepare('UPDATE sessions SET message_count = ? WHERE id = ?').run(messageCount, sessionId);
    log.debug(`세션 인덱싱 완료: ${sessionId} (${messageCount} messages)`);
  } catch (e) {
    log.debug('세션 인덱싱 실패', e);
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

/**
 * 과거 세션 검색.
 * FTS5 MATCH 우선 사용 (전문 검색, 순위 정렬).
 * FTS5 미지원 시 LIKE 기반 폴백.
 */
export function searchSessions(query: string, limit = 10): Array<{
  sessionId: string;
  role: string;
  content: string;
  timestamp: string;
  cwd: string;
  tokens: string[];
}> {
  const db = openDb();
  if (!db) return [];

  const tokens = query
    .split(/\s+/)
    .map(t => t.toLowerCase())
    .filter(t => t.length >= 2);

  if (tokens.length === 0) return [];

  try {
    let results: SessionRow[];

    if (fts5Available) {
      // FTS5 MATCH — 전문 검색 + BM25 순위 정렬
      const ftsQuery = tokens.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
      results = db.prepare(`
        SELECT m.session_id, m.role, m.content, m.timestamp, s.cwd
        FROM messages_fts fts
        JOIN messages m ON fts.rowid = m.id
        JOIN sessions s ON m.session_id = s.id
        WHERE messages_fts MATCH ?
        ORDER BY fts.rank
        LIMIT ?
      `).all(ftsQuery, limit) as SessionRow[];
    } else {
      // LIKE 폴백
      const conditions = tokens.map(() => "LOWER(m.content) LIKE ? ESCAPE '\\'").join(' AND ');
      const escapedTokens = tokens.map(t => t.replace(/%/g, '\\%').replace(/_/g, '\\_'));
      const params: (string | number)[] = escapedTokens.map(t => `%${t}%`);
      params.push(limit);

      results = db.prepare(`
        SELECT m.session_id, m.role, m.content, m.timestamp, s.cwd
        FROM messages m
        JOIN sessions s ON m.session_id = s.id
        WHERE ${conditions}
        ORDER BY m.id DESC
        LIMIT ?
      `).all(...params) as SessionRow[];
    }

    return results.map((r: SessionRow) => ({
      sessionId: r.session_id,
      role: r.role,
      content: r.content,
      timestamp: r.timestamp,
      cwd: r.cwd,
      tokens,
    }));
  } catch (e) {
    log.debug('세션 검색 실패', e);
    return [];
  } finally {
    try { db.close(); } catch { /* ignore */ }
  }
}

/**
 * 매칭 토큰 위치를 기준으로 컨텍스트 윈도우를 추출.
 */
export function extractContextWindow(content: string, tokens: string[], windowSize = 120): string {
  const lower = content.toLowerCase();
  const positions: number[] = [];
  for (const token of tokens) {
    const idx = lower.indexOf(token);
    if (idx !== -1) positions.push(idx);
  }
  if (positions.length === 0) return content.slice(0, 200);
  positions.sort((a, b) => a - b);
  const center = positions[0];
  const start = Math.max(0, center - windowSize);
  const end = Math.min(content.length, center + windowSize);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < content.length ? '...' : '';
  return `${prefix}${content.slice(start, end)}${suffix}`;
}
