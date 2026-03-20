import { notify } from './notify.js';

/**
 * tenetx wait — Rate limit 대기
 * Claude Code가 rate limit에 걸렸을 때 지정 시간 대기 후 알림
 */
export async function handleWait(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === '--help') {
    console.log('  사용법: tenetx wait <minutes>');
    console.log('  옵션:');
    console.log('    --notify          완료 시 알림 (기본: on)');
    console.log('    --no-notify       알림 끄기');
    console.log('    --then "command"  대기 후 실행할 명령\n');
    console.log('  예시:');
    console.log('    tenetx wait 5           5분 대기 후 알림');
    console.log('    tenetx wait 10 --then "tenetx"  10분 후 tenetx 실행\n');
    return;
  }

  const minutes = parseFloat(args[0]);
  if (Number.isNaN(minutes) || minutes <= 0) {
    console.log('  유효한 분 수를 입력하세요. (예: tenetx wait 5)');
    return;
  }

  const noNotify = args.includes('--no-notify');
  const thenIdx = args.indexOf('--then');
  const thenCmd = thenIdx !== -1 ? args.slice(thenIdx + 1).join(' ') : null;

  const totalSeconds = Math.round(minutes * 60);
  console.log(`\n  ⏳ ${minutes}분 대기 시작...`);

  // 카운트다운
  const startTime = Date.now();
  const endTime = startTime + totalSeconds * 1000;

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      const remainMin = Math.floor(remaining / 60000);
      const remainSec = Math.floor((remaining % 60000) / 1000);

      process.stdout.write(`\r  ⏳ 남은 시간: ${remainMin}분 ${remainSec.toString().padStart(2, '0')}초  `);

      if (remaining <= 0) {
        clearInterval(interval);
        process.stdout.write('\r  ✓ 대기 완료!                        \n\n');
        resolve();
      }
    }, 1000);
  });

  // 알림
  if (!noNotify) {
    await notify({
      title: 'Tenetx',
      message: `${minutes}분 대기 완료. Rate limit이 해제되었을 수 있습니다.`,
      sound: true,
    });
  }

  // then 명령 실행
  if (thenCmd) {
    console.log(`  실행: ${thenCmd}\n`);
    const { execSync } = await import('node:child_process');
    try {
      execSync(thenCmd, { stdio: 'inherit' });
    } catch { /* expected: 사용자 명령의 exit code는 무시 */ }
  }
}
