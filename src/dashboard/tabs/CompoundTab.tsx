
import { Box, Text } from 'ink';
import { Panel } from '../ui/index.js';
import type { DashboardData } from '../data.js';

interface CompoundTabProps {
  data: DashboardData;
}

export function CompoundTab({ data }: CompoundTabProps) {
  const { meSolutions, meRules, packs } = data;

  return (
    <Box flexDirection="column">
      <Box>
        <Panel title="personal knowledge" width="50%">
          <Text><Text dimColor>solutions  </Text><Text color="yellow" bold>{meSolutions}</Text></Text>
          <Text><Text dimColor>rules      </Text><Text color="yellow" bold>{meRules}</Text></Text>
          <Text> </Text>
          <Text dimColor>location: ~/.compound/me/</Text>
        </Panel>

        <Panel title="pack contributions" width="50%">
          {packs.length === 0 ? (
            <Text dimColor>No packs installed</Text>
          ) : (
            <Box flexDirection="column">
              {packs.slice(0, 4).map(pack => (
                <Text key={pack.name}>
                  <Text color="magenta">{pack.name}</Text>
                  <Text dimColor> v{pack.version}</Text>
                  <Text dimColor>  S:</Text><Text color="yellow">{pack.solutions}</Text>
                  <Text dimColor> R:</Text><Text color="yellow">{pack.rules}</Text>
                </Text>
              ))}
              {packs.length > 4 && <Text dimColor>... and {packs.length - 4} more</Text>}
            </Box>
          )}
        </Panel>
      </Box>

      <Panel title="compound commands">
        <Text><Text color="cyan" bold>compound</Text> analyzes sessions and extracts knowledge.</Text>
        <Text> </Text>
        <Text>  <Text color="green">tenetx compound</Text><Text dimColor>        -- analyze current session</Text></Text>
        <Text>  <Text color="green">tenetx compound --all</Text><Text dimColor>  -- re-analyze all sessions</Text></Text>
        <Text>  <Text color="green">tenetx pack sync</Text><Text dimColor>       -- sync packs</Text></Text>
        <Text> </Text>
        <Text dimColor>Solutions saved to <Text color="yellow">~/.compound/me/solutions/</Text></Text>
        <Text dimColor>Rules saved to <Text color="yellow">~/.compound/me/rules/</Text></Text>
      </Panel>

      <Panel title="compound effect">
        <Text color="yellow">Compound Principle:</Text>
        <Text> </Text>
        <Text>  <Text color="green">→</Text> Convert every session's mistakes into <Text color="cyan">solutions</Text></Text>
        <Text>  <Text color="green">→</Text> Auto-generate prevention <Text color="cyan">rules</Text> from failures</Text>
        <Text>  <Text color="green">→</Text> <Text color="cyan">Share</Text> knowledge across team via packs</Text>
        <Text> </Text>
        <Text dimColor>"Making the same mistake twice is a system failure"</Text>
      </Panel>
    </Box>
  );
}
