/**
 * 훅 공유 유틸: timeout-protected stdin 읽기
 *
 * event-based 패턴으로 Linux에서 hang을 방지합니다.
 * (for await of process.stdin은 일부 환경에서 hang 발생)
 */

const MAX_STDIN_BYTES = 10 * 1024 * 1024; // 10MB — 메모리 고갈 방지

/** stdin에서 JSON 데이터를 읽어 파싱. 실패 시 null 반환. */
export async function readStdinJSON<T = Record<string, unknown>>(timeoutMs = 2000): Promise<T | null> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  let settled = false;

  const raw = await new Promise<string>((resolve) => {
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        process.stdin.removeAllListeners();
        process.stdin.pause();
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    }, timeoutMs);

    // 일부 Node.js 환경에서 stdin이 paused 상태로 시작 — 명시적 resume 필요
    if (typeof process.stdin.resume === 'function') {
      process.stdin.resume();
    }

    process.stdin.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalSize += buf.length;
      if (totalSize > MAX_STDIN_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          process.stdin.removeAllListeners();
          if (typeof process.stdin.pause === 'function') process.stdin.pause();
          resolve('');
        }
        return;
      }
      chunks.push(buf);
    });
    process.stdin.on('end', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });
    process.stdin.on('error', () => {
      if (!settled) { settled = true; clearTimeout(timeout); resolve(''); }
    });
  });

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
