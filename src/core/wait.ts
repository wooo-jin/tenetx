import { notify } from './notify.js';

/**
 * tenetx wait — Rate limit 대기
 * Claude Code가 rate limit에 걸렸을 때 지정 시간 대기 후 알림
 */
export async function handleWait(args: string[]): Promise<void> {
  if (args.length === 0 || args[0] === '--help') {
    console.log('  Usage: tenetx wait <minutes>');
    console.log('  Options:');
    console.log('    --notify          Notify on completion (default: on)');
    console.log('    --no-notify       Disable notification');
    console.log('    --then "command"  Command to run after waiting\n');
    console.log('  Examples:');
    console.log('    tenetx wait 5           Wait 5 minutes then notify');
    console.log('    tenetx wait 10 --then "tenetx"  Run tenetx after 10 minutes\n');
    return;
  }

  const minutes = parseFloat(args[0]);
  if (Number.isNaN(minutes) || minutes <= 0) {
    console.log('  Please enter a valid number of minutes. (e.g., tenetx wait 5)');
    return;
  }

  const noNotify = args.includes('--no-notify');
  const thenIdx = args.indexOf('--then');
  const thenCmd = thenIdx !== -1 ? args.slice(thenIdx + 1).join(' ') : null;

  const totalSeconds = Math.round(minutes * 60);
  console.log(`\n  ⏳ Waiting ${minutes} minute(s)...`);

  // 카운트다운
  const startTime = Date.now();
  const endTime = startTime + totalSeconds * 1000;

  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, endTime - Date.now());
      const remainMin = Math.floor(remaining / 60000);
      const remainSec = Math.floor((remaining % 60000) / 1000);

      process.stdout.write(`\r  ⏳ Remaining: ${remainMin}m ${remainSec.toString().padStart(2, '0')}s  `);

      if (remaining <= 0) {
        clearInterval(interval);
        process.stdout.write('\r  ✓ Wait complete!                        \n\n');
        resolve();
      }
    }, 1000);
  });

  // 알림
  if (!noNotify) {
    await notify({
      title: 'Tenetx',
      message: `${minutes}m wait complete. Rate limit may have been lifted.`,
      sound: true,
    });
  }

  // then 명령 실행
  if (thenCmd) {
    console.log(`  Running: ${thenCmd}\n`);
    const { execSync } = await import('node:child_process');
    try {
      execSync(thenCmd, { stdio: 'inherit', shell: '/bin/sh' });
    } catch { /* expected: 사용자 명령의 exit code는 무시 */ }
  }
}
