
import { Text } from 'ink';

interface BarProps {
  value: number; // 0-100
  width?: number;
  colorThresholds?: { green: number; yellow: number };
}

export function Bar({
  value,
  width = 20,
  colorThresholds = { green: 50, yellow: 80 },
}: BarProps) {
  const filled = Math.round((value / 100) * width);
  const empty = width - filled;

  const color = value < colorThresholds.green
    ? 'green'
    : value < colorThresholds.yellow
      ? 'yellow'
      : 'red';

  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text> {value}%</Text>
    </Text>
  );
}
