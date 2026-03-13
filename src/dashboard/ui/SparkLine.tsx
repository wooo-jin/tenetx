
import { Box, Text } from 'ink';

const BLOCKS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

/** Generate day labels dynamically based on data length */
function generateDayLabels(length: number): string[] {
  return Array.from({ length }, (_, i) => {
    const daysAgo = length - 1 - i;
    if (daysAgo === 0) return '오늘';
    if (daysAgo === 1) return '어제';
    return `${daysAgo}일전`;
  });
}

interface SparkLineProps {
  data: number[];
  color?: string;
  suffix?: string;
  formatValue?: (v: number) => string;
  labels?: string[];
}

export function SparkLine({
  data,
  color = 'cyan',
  suffix = '',
  formatValue,
  labels,
}: SparkLineProps) {
  if (data.length === 0) return <Text dimColor>데이터 없음</Text>;

  let max = data[0];
  let min = data[0];
  for (let i = 1; i < data.length; i++) {
    if (data[i] > max) max = data[i];
    if (data[i] < min) min = data[i];
  }
  const range = max - min || 1;

  const fmt = formatValue ?? ((v: number) =>
    v >= 1000 ? `${(v / 1000).toFixed(1)}K` :
    v % 1 !== 0 ? v.toFixed(1) : String(v)
  );

  return (
    <Box flexDirection="column">
      {/* bar chart row */}
      <Box>
        {data.map((v, i) => {
          const idx = Math.round(((v - min) / range) * (BLOCKS.length - 1));
          return (
            <Box key={i} width={10} justifyContent="center">
              <Text color={color}>{BLOCKS[idx]}</Text>
            </Box>
          );
        })}
      </Box>
      {/* value row */}
      <Box>
        {data.map((v, i) => (
          <Box key={i} width={10} justifyContent="center">
            <Text dimColor>{fmt(v)}{suffix}</Text>
          </Box>
        ))}
      </Box>
      {/* label row */}
      <Box>
        {(labels ?? generateDayLabels(data.length)).map((label, i) => (
          <Box key={i} width={10} justifyContent="center">
            <Text dimColor>{label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
