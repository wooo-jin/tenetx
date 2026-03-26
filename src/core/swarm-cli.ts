/**
 * Tenetx — Swarm CLI Handler
 *
 * CLI에서 SwarmManager를 호출하여 task 생성, 상태 조회, stale lock 정리를 수행합니다.
 *
 * 서브커맨드:
 *   create <description>  — 새로운 task 생성
 *   status                — 전체 swarm 상태 조회
 *   cleanup               — stale lock 정리 (타임아웃 초과 claimed → pending 복원)
 */

import { SwarmManager } from '../engine/swarm.js';

export async function handleSwarm(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'status';
  const cwd = process.cwd();
  const manager = new SwarmManager(cwd);

  switch (subcommand) {
    case 'create': {
      const description = args.slice(1).join(' ');
      if (!description) {
        console.log('  Usage: tenetx swarm create <description>');
        console.log('  Example: tenetx swarm create "Refactor auth module"');
        return;
      }
      const task = manager.createTask(description);
      console.log(`\n  Task created`);
      console.log(`    ID: ${task.id}`);
      console.log(`    Description: ${task.description}`);
      console.log(`    Status: ${task.status}`);
      console.log();
      break;
    }

    case 'status': {
      const status = manager.getStatus();
      console.log(`\n  Swarm Status\n`);
      console.log(`    Total: ${status.total}  Pending: ${status.pending}  Claimed: ${status.claimed}  Completed: ${status.completed}  Failed: ${status.failed}`);

      if (status.tasks.length > 0) {
        console.log();
        for (const task of status.tasks) {
          const agent = task.claimedBy ? ` (${task.claimedBy})` : '';
          console.log(`    [${task.status.padEnd(9)}] ${task.id.slice(0, 8)}.. ${task.description}${agent}`);
        }
      } else {
        console.log('\n    No tasks.');
      }
      console.log();
      break;
    }

    case 'cleanup': {
      const restored = manager.cleanup();
      if (restored.length === 0) {
        console.log('\n  No stale locks found.\n');
      } else {
        console.log(`\n  Cleaned up ${restored.length} stale lock(s):`);
        for (const id of restored) {
          console.log(`    ${id.slice(0, 8)}.. restored to pending`);
        }
        console.log();
      }
      break;
    }

    default:
      console.log('  Usage: tenetx swarm <create|status|cleanup>');
      console.log();
      console.log('  Subcommands:');
      console.log('    create <description>   Create a new task');
      console.log('    status                 Show swarm status');
      console.log('    cleanup                Clean up stale locks');
  }
}
