
import { Text } from 'ink';

interface BarProps {
  value: number; // 0-100
  width?: number;
  colorThresholds?: { green: number; yellow: number };
}

/** Bar 색상 결정 순수 함수 (value < green → 'green', value < yellow → 'yellow', else → 'red') */
export function resolveBarColor(
  value: number,
  thresholds = { green: 50, yellow: 80 },
): 'green' | 'yellow' | 'red' {
  if (value < thresholds.green) return 'green';
  if (value < thresholds.yellow) return 'yellow';
  return 'red';
}

/** filled/empty 블록 수 계산 순수 함수 */
export function calcBarBlocks(value: number, width = 20): { filled: number; empty: number } {
  const filled = Math.round((value / 100) * width);
  return { filled, empty: width - filled };
}

export function Bar({
  value,
  width = 20,
  colorThresholds = { green: 50, yellow: 80 },
}: BarProps) {
  const { filled, empty } = calcBarBlocks(value, width);
  const color = resolveBarColor(value, colorThresholds);

  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text> {value}%</Text>
    </Text>
  );
}
