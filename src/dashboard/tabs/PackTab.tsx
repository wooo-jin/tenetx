
import { Box, Text } from 'ink';
import { Panel } from '../ui/index.js';
import type { DashboardData } from '../data.js';

interface PackTabProps {
  data: DashboardData;
}

export function PackTab({ data }: PackTabProps) {
  const { packs } = data;

  if (packs.length === 0) {
    return (
      <Panel title="pack list">
        <Text dimColor>No packs installed.</Text>
        <Text> </Text>
        <Text><Text dimColor>Install: </Text><Text color="cyan">tenetx pack install {'<source>'}</Text></Text>
      </Panel>
    );
  }

  const totalSolutions = packs.reduce((s, p) => s + p.solutions, 0);
  const totalRules = packs.reduce((s, p) => s + p.rules, 0);

  return (
    <Box flexDirection="column">
      <Panel title="pack overview">
        <Text>
          <Text dimColor>installed </Text><Text color="yellow" bold>{packs.length}</Text>
          <Text dimColor>   solutions </Text><Text color="yellow" bold>{totalSolutions}</Text>
          <Text dimColor>   rules </Text><Text color="yellow" bold>{totalRules}</Text>
        </Text>
      </Panel>

      {packs.map(pack => (
        <Panel key={pack.name} title={`pack: ${pack.name}`}>
          <Text>
            <Text dimColor>version   </Text><Text color="cyan">{pack.version}</Text>
            <Text dimColor>   remote </Text>{pack.remote ? <Text>{pack.remote}</Text> : <Text dimColor>local</Text>}
          </Text>
          <Text>
            <Text dimColor>solutions </Text><Text color="yellow" bold>{pack.solutions}</Text>
            <Text dimColor>   rules  </Text><Text color="yellow" bold>{pack.rules}</Text>
          </Text>
          <Text>
            <Text dimColor>sync      </Text>
            {pack.lastSync
              ? <Text><Text color="green">OK </Text><Text dimColor>{pack.lastSync}</Text></Text>
              : <Text dimColor>no sync info</Text>
            }
          </Text>
        </Panel>
      ))}
    </Box>
  );
}
