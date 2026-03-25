
import { Box, Text } from 'ink';
import { Panel } from '../ui/index.js';
import { getGitRemote, formatDateTime } from '../data.js';
import type { DashboardData } from '../data.js';
import * as path from 'node:path';

interface LogsTabProps {
  data: DashboardData;
}

export function LogsTab({ data }: LogsTabProps) {
  const { sessions } = data;
  const recent = sessions.slice(0, 15);
  const gitRemote = getGitRemote();

  return (
    <Box flexDirection="column">
      <Panel title="storage locations">
        <Text><Text dimColor>harness log  </Text><Text dimColor bold>~/.compound/sessions/</Text></Text>
        <Text><Text dimColor>claude       </Text><Text dimColor bold>~/.claude/projects/</Text></Text>
        <Text>
          <Text dimColor>git remote   </Text>
          {gitRemote ? <Text color="cyan">{gitRemote}</Text> : <Text dimColor>none</Text>}
        </Text>
      </Panel>

      <Panel title="recent session logs">
        {recent.length === 0 ? (
          <Text dimColor>No recorded sessions.</Text>
        ) : (
          <Box flexDirection="column">
            {/* Header */}
            <Text bold>
              <Text>{'date/time    '}</Text>
              <Text>{'project              '}</Text>
              <Text>{'time     '}</Text>
              <Text>{'mode'}</Text>
            </Text>

            {recent.map((session, i) => {
              const dateStr = formatDateTime(session.date);
              const isToday = session.date.toDateString() === new Date().toDateString();
              const projectName = session.project ? path.basename(session.project) : '-';
              const durStr = session.durationMinutes != null ? `${session.durationMinutes}m` : '-';
              const modeStr = session.mode ?? '-';
              const sessionKey = `${session.date.toISOString()}-${i}`;

              return (
                <Text key={sessionKey}>
                  <Text color={isToday ? 'green' : undefined} dimColor={!isToday}>
                    {dateStr.padEnd(13)}
                  </Text>
                  <Text color="cyan">{projectName.slice(0, 20).padEnd(21)}</Text>
                  <Text color="yellow">{durStr.padEnd(9)}</Text>
                  <Text dimColor>{modeStr}</Text>
                </Text>
              );
            })}

            {sessions.length > 15 && (
              <Text dimColor>... and {sessions.length - 15} more sessions</Text>
            )}
          </Box>
        )}
      </Panel>
    </Box>
  );
}
