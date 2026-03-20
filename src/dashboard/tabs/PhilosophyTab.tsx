
import { Box, Text } from 'ink';
import { Panel } from '../ui/index.js';
import type { DashboardData } from '../data.js';

interface PhilosophyTabProps {
  data: DashboardData;
}

export function PhilosophyTab({ data }: PhilosophyTabProps) {
  const { philosophy } = data;

  return (
    <Box flexDirection="column">
      <Panel title="philosophy overview">
        <Text><Text dimColor>name    </Text><Text color="cyan" bold>{philosophy.name}</Text><Text dimColor> v{philosophy.version}</Text></Text>
        {philosophy.description && <Text dimColor>{philosophy.description}</Text>}
      </Panel>

      {Object.entries(philosophy.principles).map(([name, principle]) => (
        <Panel key={name} title={`● ${name}`}>
          <Text italic dimColor>"{principle.belief}"</Text>
          <Text> </Text>
          {principle.generates.map((gen, i) => {
            if (typeof gen === 'string') {
              return <Text key={i}><Text color="green">  → </Text>{gen}</Text>;
            }
            if (typeof gen === 'object' && gen !== null) {
              const g = gen as Record<string, string>;
              if (g.alert) {
                return <Text key={i}><Text color="yellow">  ⚠ </Text><Text color="yellow">{g.alert}</Text></Text>;
              }
              if (g.routing) {
                return <Text key={i}><Text color="magenta">  ⇄ </Text><Text color="magenta">{g.routing}</Text></Text>;
              }
              if (g.steps || g.step) {
                return <Text key={i}><Text color="cyan">  ◆ </Text>{g.steps ?? g.step}</Text>;
              }
              if (g.hook) {
                return <Text key={i}><Text color="green">  ⚙ </Text>{g.hook}</Text>;
              }
            }
            return null;
          })}
        </Panel>
      ))}
    </Box>
  );
}
