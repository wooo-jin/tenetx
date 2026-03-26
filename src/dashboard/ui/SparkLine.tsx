
import { Box, Text } from 'ink';

export const BLOCKS = ['\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

/** Generate day labels dynamically based on data length */
export function generateDayLabels(length: number): string[] {
  return Array.from({ length }, (_, i) => {
    const daysAgo = length - 1 - i;
    if (daysAgo === 0) return '오늘';
    if (daysAgo === 1) return '어제';
    return `${daysAgo}일전`;
  });
}

/** SparkLine 블록 인덱스 계산 순수 함수 */
export function calcBlockIndex(value: number, min: number, max: number): number {
  const range = max - min || 1;
  return Math.round(((value - min) / range) * (BLOCKS.length - 1));
}

/** SparkLine 기본 숫자 포맷 순수 함수 */
export function defaultFmt(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`;
  if (v % 1 !== 0) return v.toFixed(1);
  return String(v);
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

  const fmt = formatValue ?? defaultFmt;

  const resolvedLabels = labels ?? generateDayLabels(data.length);

  const entries = data.map((v, i) => ({
    label: resolvedLabels[i] ?? String(i),
    value: v,
  }));

  return (
    <Box flexDirection="column">
      {/* bar chart row */}
      <Box>
        {entries.map((entry) => {
          const idx = calcBlockIndex(entry.value, min, max);
          return (
            <Box key={entry.label} width={10} justifyContent="center">
              <Text color={color}>{BLOCKS[idx]}</Text>
            </Box>
          );
        })}
      </Box>
      {/* value row */}
      <Box>
        {entries.map((entry) => (
          <Box key={entry.label} width={10} justifyContent="center">
            <Text dimColor>{fmt(entry.value)}{suffix}</Text>
          </Box>
        ))}
      </Box>
      {/* label row */}
      <Box>
        {resolvedLabels.map((label) => (
          <Box key={label} width={10} justifyContent="center">
            <Text dimColor>{label}</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
