/**
 * 훅 공유 유틸: timeout-protected stdin 읽기
 *
 * event-based 패턴으로 Linux에서 hang을 방지합니다.
 * (for await of process.stdin은 일부 환경에서 hang 발생)
 */

/** stdin에서 JSON 데이터를 읽어 파싱. 실패 시 null 반환. */
export async function readStdinJSON<T = Record<string, unknown>>(timeoutMs = 3000): Promise<T | null> {
  const chunks: Buffer[] = [];
  let settled = false;

  const raw = await new Promise<string>((resolve) => {
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        process.stdin.removeAllListeners();
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    }, timeoutMs);

    process.stdin.on('data', (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    process.stdin.on('end', () => {
      if (!settled) { settled = true; clearTimeout(timeout); resolve(Buffer.concat(chunks).toString('utf-8')); }
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
