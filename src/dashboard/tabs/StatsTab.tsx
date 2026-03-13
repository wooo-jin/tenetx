
import { Box, Text } from 'ink';
import { Panel, SparkLine } from '../ui/index.js';
import type { DashboardData } from '../data.js';

interface StatsTabProps {
  data: DashboardData;
}

export function StatsTab({ data }: StatsTabProps) {
  const {
    sessions, todayCount, avgDuration, totalDuration,
    dailyCounts, meSolutions, meRules, packs,
  } = data;

  const packSolutions = packs.reduce((s, p) => s + p.solutions, 0);
  const packRules = packs.reduce((s, p) => s + p.rules, 0);

  const now = new Date();
  const dayLabels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    dayLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }

  return (
    <Box flexDirection="column">
      <Box>
        <Panel title="session stats" width="50%">
          <Text><Text dimColor>total       </Text><Text color="yellow" bold>{sessions.length}</Text></Text>
          <Text><Text dimColor>today       </Text><Text color="green" bold>{todayCount}</Text></Text>
          <Text><Text dimColor>avg time    </Text><Text color="yellow" bold>{avgDuration > 0 ? `${avgDuration}m` : '-'}</Text></Text>
          <Text><Text dimColor>total time  </Text><Text color="yellow" bold>{totalDuration > 0 ? `${Math.round(totalDuration / 60)}h` : '-'}</Text></Text>
        </Panel>

        <Panel title="knowledge stats" width="50%">
          <Text><Text dimColor>solutions   </Text><Text color="yellow" bold>{meSolutions}</Text></Text>
          <Text><Text dimColor>rules       </Text><Text color="yellow" bold>{meRules}</Text></Text>
          <Text><Text dimColor>pack sol.   </Text><Text color="yellow">{packSolutions}</Text></Text>
          <Text><Text dimColor>pack rules  </Text><Text color="yellow">{packRules}</Text></Text>
        </Panel>
      </Box>

      <Panel title="7-day session trend">
        <SparkLine data={dailyCounts} color="cyan" labels={dayLabels} />
      </Panel>
    </Box>
  );
}
