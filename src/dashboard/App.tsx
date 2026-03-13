import React, { useState, useEffect, useCallback } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { loadDashboardData } from './data.js';
import { HomeTab } from './tabs/HomeTab.js';
import { PhilosophyTab } from './tabs/PhilosophyTab.js';
import { PackTab } from './tabs/PackTab.js';
import { StatsTab } from './tabs/StatsTab.js';
import { LogsTab } from './tabs/LogsTab.js';
import { CompoundTab } from './tabs/CompoundTab.js';

const VERSION = '0.1.0';
const REFRESH_INTERVAL_MS = 15_000;

const TABS = [
  { key: '1', label: '홈',   icon: '⚡' },
  { key: '2', label: '철학', icon: '📜' },
  { key: '3', label: '팩',   icon: '📦' },
  { key: '4', label: '통계', icon: '📊' },
  { key: '5', label: '로그', icon: '📋' },
  { key: '6', label: '복리', icon: '🔄' },
] as const;

export function App() {
  const { exit } = useApp();
  const [activeTab, setActiveTab] = useState(0);

  // Lazy initializer: load data once on first render
  const [data, setData] = useState(() => loadDashboardData());
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refreshData = useCallback(() => {
    setData(loadDashboardData());
    setLastRefresh(new Date());
  }, []);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const timer = setInterval(refreshData, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refreshData]);

  useInput((input: string, key: { tab?: boolean }) => {
    // Tab key: cycle tabs
    if (key.tab) {
      setActiveTab((prev: number) => (prev + 1) % TABS.length);
      return;
    }

    // Number keys: switch tabs
    const tabIndex = parseInt(input) - 1;
    if (tabIndex >= 0 && tabIndex < TABS.length) {
      setActiveTab(tabIndex);
      return;
    }

    // r: manual refresh
    if (input === 'r') {
      refreshData();
      return;
    }

    // q: quit
    if (input === 'q') {
      exit();
    }
  });

  const now = lastRefresh;
  const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const termHeight = process.stdout.rows ?? 40;

  return (
    <Box flexDirection="column" height={termHeight}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan"> Tenet v{VERSION} </Text>
        <Text dimColor> | {dateStr} {timeStr} | 15s auto-refresh</Text>
      </Box>

      {/* Tab bar */}
      <Box marginBottom={1}>
        {TABS.map((tab, i) => (
          <Box key={tab.key} marginRight={1}>
            <Text
              bold={i === activeTab}
              color={i === activeTab ? 'cyan' : 'gray'}
              inverse={i === activeTab}
            >
              {' '}{tab.icon} {tab.label}{' '}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Tab content */}
      <Box flexDirection="column" flexGrow={1}>
        {activeTab === 0 && <HomeTab data={data} />}
        {activeTab === 1 && <PhilosophyTab data={data} />}
        {activeTab === 2 && <PackTab data={data} />}
        {activeTab === 3 && <StatsTab data={data} />}
        {activeTab === 4 && <LogsTab data={data} />}
        {activeTab === 5 && <CompoundTab data={data} />}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text dimColor>
          [1-6] 탭 전환  [Tab] 이동  [r] 새로고침  [q] 종료
        </Text>
      </Box>
    </Box>
  );
}
