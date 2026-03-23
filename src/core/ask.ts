import {
  type ProviderName,
  callProvider,
  callWithFallback,
  callAllProviders,
  loadProviderConfigs,
  saveProviderConfigs,
  getProviderSummary,
  checkProviderAvailability,
  type ProviderResponse,
} from '../engine/provider.js';

/** CLI 핸들러: tenetx ask */
export async function handleAsk(args: string[]): Promise<void> {
  if (args.length === 0) {
    printAskHelp();
    return;
  }

  // 인자 파싱
  const providerIdx = args.indexOf('--provider');
  const provider = providerIdx !== -1
    ? args[providerIdx + 1] as ProviderName
    : undefined;
  const modelIdx = args.indexOf('--model');
  const model = modelIdx !== -1 ? args[modelIdx + 1] : undefined;
  const askAll = args.includes('--all');
  const compare = args.includes('--compare');
  const fallback = args.includes('--fallback');

  // 옵션 플래그와 그 값의 인덱스를 수집하여 제외
  const skipIndices = new Set<number>();
  if (providerIdx !== -1) { skipIndices.add(providerIdx); skipIndices.add(providerIdx + 1); }
  if (modelIdx !== -1) { skipIndices.add(modelIdx); skipIndices.add(modelIdx + 1); }
  for (const flag of ['--all', '--compare', '--fallback']) {
    const idx = args.indexOf(flag);
    if (idx !== -1) skipIndices.add(idx);
  }

  // 알 수 없는 플래그 경고
  const knownFlags = new Set(['--provider', '--model', '--all', '--compare', '--fallback']);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && !knownFlags.has(args[i]) && !skipIndices.has(i)) {
      console.log(`  ⚠ Unknown option: ${args[i]} (ignored)`);
    }
  }

  const prompt = args.filter((a, i) =>
    !skipIndices.has(i) && !a.startsWith('--')
  ).join(' ');

  if (!prompt) {
    console.log('  Please enter a question.');
    return;
  }

  // --compare / --all: 모든 프로바이더 병렬 호출 + 합성/비교 출력
  if (askAll || compare) {
    const results = await callAllProviders(prompt, model);
    if (results.length === 0) {
      console.log('  No available providers.');
      return;
    }

    const validResults = results.filter(r => !r.error && r.content.length > 0);

    // Use synthesizer when 2+ valid responses available
    if (validResults.length >= 2) {
      const { synthesize } = await import('../engine/synthesizer.js');
      const synthesis = synthesize(results, prompt);

      if (askAll) {
        // --all: Show synthesized result
        console.log(synthesis.synthesizedContent);
      } else {
        // --compare: Show individual results + evaluation + agreement
        for (const r of results) {
          printProviderResult(r);
        }
        printSynthesisComparison(synthesis);
      }
    } else {
      // Not enough valid responses — show raw results + basic comparison
      for (const r of results) {
        printProviderResult(r);
      }
      if (compare && validResults.length >= 2) {
        printComparison(validResults);
      }
    }
    return;
  }

  // --fallback: 순차 폴백 호출
  if (fallback) {
    const result = await callWithFallback(prompt, model);
    if (result.error) {
      console.error(`  ✗ ${result.error}`);
      process.exit(1);
    }
    console.log(`  ${DIM}[${result.provider}${result.model ? ` · ${result.model}` : ''} · ${result.latencyMs}ms]${RST}`);
    console.log(result.content);
    return;
  }

  // 단일 프로바이더 호출
  const configs = loadProviderConfigs();
  const targetProvider = provider ?? 'claude';
  const config = configs.find(c => c.name === targetProvider);

  if (!config) {
    console.error(`  ✗ Unsupported provider: ${targetProvider}`);
    console.log('  Supported: claude, codex, gemini');
    return process.exit(1);
  }

  const availability = checkProviderAvailability(config);
  if (!availability.available) {
    console.error(`  ✗ ${targetProvider} unavailable: ${availability.reason}`);
    return process.exit(1);
  }

  const result = await callProvider(config, prompt, model);
  if (result.error) {
    console.error(`  ✗ ${result.error}`);
    process.exit(1);
  } else {
    console.log(result.content);
  }
}

/** CLI 핸들러: tenetx providers */
export async function handleProviders(args: string[]): Promise<void> {
  const sub = args[0];

  if (sub === 'enable' || sub === 'disable') {
    const name = args[1] as ProviderName;
    if (!name || (name !== 'claude' && name !== 'codex' && name !== 'gemini')) {
      console.log(`  Usage: tenetx providers ${sub} <claude|codex|gemini>`);
      return;
    }
    const configs = loadProviderConfigs();
    const config = configs.find(c => c.name === name);
    if (!config) {
      console.log(`  ✗ Provider '${name}' not found.`);
      return;
    }
    config.enabled = sub === 'enable';
    saveProviderConfigs(configs);
    console.log(`  ${sub === 'enable' ? '✓' : '✗'} ${name} ${sub === 'enable' ? 'enabled' : 'disabled'}`);
    return;
  }

  if (sub === 'model') {
    const name = args[1] as ProviderName;
    const model = args[2];
    if (!name || !model) {
      console.log('  Usage: tenetx providers model <claude|codex|gemini> <model-name>');
      return;
    }
    const configs = loadProviderConfigs();
    const config = configs.find(c => c.name === name);
    if (!config) {
      console.log(`  ✗ Provider '${name}' not found.`);
      return;
    }
    config.defaultModel = model;
    saveProviderConfigs(configs);
    console.log(`  ✓ ${name} default model → ${model}`);
    return;
  }

  if (sub === 'auth') {
    const mode = args[1] as 'oauth' | 'cli' | 'apikey';
    if (!mode || !['oauth', 'cli', 'apikey'].includes(mode)) {
      console.log('  Usage: tenetx providers auth <oauth|cli|apikey>');
      console.log('    oauth   — Use OAuth token from ~/.codex/auth.json (default)');
      console.log('    cli     — Call codex CLI directly');
      console.log('    apikey  — Use OPENAI_API_KEY environment variable');
      return;
    }
    const configs = loadProviderConfigs();
    const config = configs.find(c => c.name === 'codex');
    if (!config) {
      console.log('  ✗ Codex provider not found.');
      return;
    }
    config.authMode = mode;
    if (mode === 'apikey' && !config.apiKey) {
      config.apiKey = 'OPENAI_API_KEY';
    }
    saveProviderConfigs(configs);
    console.log(`  ✓ codex auth mode → ${mode}`);
    return;
  }

  if (sub === 'priority') {
    const name = args[1] as ProviderName;
    const priority = parseInt(args[2], 10);
    if (!name || Number.isNaN(priority)) {
      console.log('  Usage: tenetx providers priority <claude|codex|gemini> <number>');
      return;
    }
    const configs = loadProviderConfigs();
    const config = configs.find(c => c.name === name);
    if (!config) {
      console.log(`  ✗ Provider '${name}' not found.`);
      return;
    }
    config.priority = priority;
    saveProviderConfigs(configs);
    console.log(`  ✓ ${name} priority → ${priority}`);
    return;
  }

  // 기본: 상태 표시
  printProviderStatus();
}

// ── ANSI ──
const RST = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';

function printProviderStatus(): void {
  const summary = getProviderSummary();
  console.log('\n  Tenetx — Provider Status\n');

  for (const p of summary) {
    const statusIcon = p.available ? `${GREEN}●${RST}` : `${RED}○${RST}`;
    const enabledLabel = p.enabled ? '' : `${DIM}(disabled)${RST}`;
    const modelLabel = p.model ? `${DIM}${p.model}${RST}` : '';
    const authLabel = p.authMode ? `${DIM}[${p.authMode}]${RST}` : '';
    const reason = !p.available && p.reason ? `${DIM}— ${p.reason}${RST}` : '';

    console.log(`  ${statusIcon} ${BOLD}${p.name}${RST} ${modelLabel} ${authLabel} ${enabledLabel} ${reason}`.trimEnd());
  }

  console.log(`\n  ${DIM}Manage: tenetx providers <enable|disable|model|priority|auth> <provider> [value]${RST}\n`);
}

function printProviderResult(r: ProviderResponse): void {
  console.log(`\n  ─── ${r.provider.toUpperCase()}${r.model ? ` (${r.model})` : ''} ───`);
  if (r.error) {
    console.log(`  ${RED}✗ ${r.error}${RST}\n`);
  } else {
    console.log(`  ${DIM}[${r.latencyMs}ms · ~${r.tokenEstimate ?? '?'}tok]${RST}`);
    console.log(`  ${r.content}\n`);
  }
}

function printSynthesisComparison(synthesis: {
  strategy: string;
  evaluations: Array<{ provider: string; scores: { relevance: number; completeness: number; codeQuality: number; confidence: number }; overallScore: number; issues: string[] }>;
  agreement: { consensus: string[]; uniqueInsights: Array<{ provider: string; insight: string }>; contradictions: Array<{ providers: string[]; description: string }>; agreementScore: number };
  bestProvider: string;
  taskType?: string;
}): void {
  console.log(`\n  ─── Synthesis Analysis ───`);
  console.log(`  ${DIM}Strategy: ${synthesis.strategy} | Task: ${synthesis.taskType ?? 'general'} | Agreement: ${(synthesis.agreement.agreementScore * 100).toFixed(0)}%${RST}`);
  console.log(`  ${GREEN}Best provider${RST}: ${synthesis.bestProvider}\n`);

  // Score table
  console.log(`  ${'Provider'.padEnd(12)} ${'Relevance'.padEnd(12)} ${'Complete'.padEnd(12)} ${'CodeQual'.padEnd(12)} ${'Confidence'.padEnd(12)} ${'Overall'.padEnd(10)}`);
  console.log(`  ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(12)} ${'-'.repeat(10)}`);
  for (const ev of synthesis.evaluations) {
    const s = ev.scores;
    console.log(
      `  ${ev.provider.padEnd(12)} ${`${(s.relevance * 100).toFixed(0)}%`.padEnd(12)} ${`${(s.completeness * 100).toFixed(0)}%`.padEnd(12)} ${`${(s.codeQuality * 100).toFixed(0)}%`.padEnd(12)} ${`${(s.confidence * 100).toFixed(0)}%`.padEnd(12)} ${BOLD}${(ev.overallScore * 100).toFixed(0)}%${RST}`
    );
  }

  if (synthesis.agreement.consensus.length > 0) {
    console.log(`\n  ${CYAN}Consensus points${RST}:`);
    for (const point of synthesis.agreement.consensus.slice(0, 5)) {
      console.log(`    - ${point.slice(0, 100)}`);
    }
  }

  if (synthesis.agreement.contradictions.length > 0) {
    console.log(`\n  ${YELLOW}Contradictions${RST}:`);
    for (const c of synthesis.agreement.contradictions.slice(0, 3)) {
      console.log(`    - ${c.providers.join(' vs ')}: ${c.description}`);
    }
  }

  console.log();
}

function printComparison(results: ProviderResponse[]): void {
  console.log(`  ─── Comparison Summary ───`);
  const fastest = results.reduce((a, b) => a.latencyMs < b.latencyMs ? a : b);
  const longest = results.reduce((a, b) => (a.content?.length ?? 0) > (b.content?.length ?? 0) ? a : b);

  console.log(`  ${CYAN}Fastest${RST}: ${fastest.provider} (${fastest.latencyMs}ms)`);
  console.log(`  ${YELLOW}Longest response${RST}: ${longest.provider} (${longest.content.length} chars)`);

  // 응답 유사도 (간단한 자카드 유사도)
  if (results.length === 2) {
    const similarity = jaccardSimilarity(results[0].content, results[1].content);
    console.log(`  ${DIM}Response similarity${RST}: ${(similarity * 100).toFixed(0)}%`);
  }
  console.log();
}

/** 간단한 자카드 유사도 (단어 기반) */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\s+/));
  const setB = new Set(b.toLowerCase().split(/\s+/));
  let intersection = 0;
  for (const w of setA) {
    if (setB.has(w)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function printAskHelp(): void {
  console.log(`
  Usage: tenetx ask "question"

  Options:
    --provider <claude|codex|gemini>  Provider (default: claude)
    --model <model-name>        Specify model
    --all                       Query all available providers simultaneously
    --compare                   Parallel query + comparison analysis
    --fallback                  Auto fallback (try next provider on failure)

  Codex authentication (default: OAuth):
    1. codex login              — OAuth login (browser)
    2. tenetx providers auth oauth  — Use OAuth token (default)
    3. tenetx providers auth cli    — Call codex CLI directly
    4. tenetx providers auth apikey — Use OPENAI_API_KEY env var

  Gemini authentication:
    Requires GEMINI_API_KEY environment variable

  Provider management:
    tenetx providers                         Check status
    tenetx providers enable codex            Enable Codex
    tenetx providers enable gemini           Enable Gemini
    tenetx providers auth <oauth|cli|apikey> Change auth mode
    tenetx providers model codex o4-mini     Change default model
    tenetx providers model gemini gemini-2.5-pro  Change Gemini model
`);
}
