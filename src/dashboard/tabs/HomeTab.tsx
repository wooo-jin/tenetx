
import { Box, Text } from 'ink';
import { Panel, SparkLine } from '../ui/index.js';
import type { DashboardData } from '../data.js';

interface HomeTabProps {
  data: DashboardData;
}

export function HomeTab({ data }: HomeTabProps) {
  const {
    philosophy, packs, meSolutions, meRules,
    todayCount, sessions, dailyCounts, claudeSessionCount,
  } = data;

  const philosophyName = process.env.COMPOUND_PHILOSOPHY ?? philosophy.name;
  const scope = process.env.COMPOUND_SCOPE ?? '-';
  const pack = process.env.COMPOUND_PACK;

  const packSolutions = packs.reduce((s, p) => s + p.solutions, 0);
  const packRules = packs.reduce((s, p) => s + p.rules, 0);

  return (
    <Box flexDirection="column">
      {/* Top row: harness info + Me stats */}
      <Box>
        <Panel title="harness info" width="50%">
          <Text><Text dimColor>philosophy  </Text><Text color="magenta" bold>{philosophyName}</Text></Text>
          <Text><Text dimColor>scope       </Text><Text color="green" bold>{scope}</Text></Text>
          <Text><Text dimColor>pack        </Text>{pack ? <Text color="cyan" bold>{pack}</Text> : <Text dimColor>not connected</Text>}</Text>
          <Text><Text dimColor>version     </Text><Text dimColor bold>0.1.0</Text></Text>
        </Panel>

        <Panel title="Me stats" width="50%">
          <Text><Text dimColor>solutions   </Text><Text color="yellow" bold>{meSolutions}</Text></Text>
          <Text><Text dimColor>rules       </Text><Text color="yellow" bold>{meRules}</Text></Text>
          <Text><Text dimColor>packs       </Text><Text color="cyan" bold>{packs.length}</Text></Text>
          <Text><Text dimColor>pack sol.   </Text><Text color="yellow">{packSolutions}</Text></Text>
          <Text><Text dimColor>pack rules  </Text><Text color="yellow">{packRules}</Text></Text>
        </Panel>
      </Box>

      {/* Session summary */}
      <Panel title="session summary">
        <Text><Text dimColor>today       </Text><Text color="green" bold>{todayCount}</Text></Text>
        <Text><Text dimColor>total       </Text><Text color="yellow" bold>{sessions.length}</Text></Text>
        <Text><Text dimColor>harness log </Text><Text dimColor bold>~/.compound/sessions/</Text></Text>
        <Text><Text dimColor>claude      </Text><Text dimColor bold>~/.claude/projects/ ({claudeSessionCount})</Text></Text>
      </Panel>

      {/* 7-day sparkline */}
      <Panel title="7-day session trend">
        <SparkLine data={dailyCounts} color="cyan" />
      </Panel>
    </Box>
  );
}
