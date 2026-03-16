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
      console.log(`  ⚠ 알 수 없는 옵션: ${args[i]} (무시됨)`);
    }
  }

  const prompt = args.filter((a, i) =>
    !skipIndices.has(i) && !a.startsWith('--')
  ).join(' ');

  if (!prompt) {
    console.log('  질문을 입력하세요.');
    return;
  }

  // --compare: 모든 프로바이더 병렬 호출 + 비교 출력
  if (askAll || compare) {
    const results = await callAllProviders(prompt, model);
    if (results.length === 0) {
      console.log('  가용한 프로바이더가 없습니다.');
      return;
    }
    for (const r of results) {
      printProviderResult(r);
    }
    if (compare && results.filter(r => !r.error).length >= 2) {
      printComparison(results.filter(r => !r.error));
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
    console.error(`  ✗ 지원하지 않는 프로바이더: ${targetProvider}`);
    console.log('  지원: claude, codex');
    return process.exit(1);
  }

  const availability = checkProviderAvailability(config);
  if (!availability.available) {
    console.error(`  ✗ ${targetProvider} 사용 불가: ${availability.reason}`);
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
    if (!name || (name !== 'claude' && name !== 'codex')) {
      console.log(`  사용법: tenetx providers ${sub} <claude|codex>`);
      return;
    }
    const configs = loadProviderConfigs();
    const config = configs.find(c => c.name === name);
    if (!config) {
      console.log(`  ✗ 프로바이더 '${name}'을 찾을 수 없습니다.`);
      return;
    }
    config.enabled = sub === 'enable';
    saveProviderConfigs(configs);
    console.log(`  ${sub === 'enable' ? '✓' : '✗'} ${name} ${sub === 'enable' ? '활성화' : '비활성화'}`);
    return;
  }

  if (sub === 'model') {
    const name = args[1] as ProviderName;
    const model = args[2];
    if (!name || !model) {
      console.log('  사용법: tenetx providers model <claude|codex> <model-name>');
      return;
    }
    const configs = loadProviderConfigs();
    const config = configs.find(c => c.name === name);
    if (!config) {
      console.log(`  ✗ 프로바이더 '${name}'을 찾을 수 없습니다.`);
      return;
    }
    config.defaultModel = model;
    saveProviderConfigs(configs);
    console.log(`  ✓ ${name} 기본 모델 → ${model}`);
    return;
  }

  if (sub === 'auth') {
    const mode = args[1] as 'oauth' | 'cli' | 'apikey';
    if (!mode || !['oauth', 'cli', 'apikey'].includes(mode)) {
      console.log('  사용법: tenetx providers auth <oauth|cli|apikey>');
      console.log('    oauth   — ~/.codex/auth.json의 OAuth 토큰 사용 (기본)');
      console.log('    cli     — codex CLI 직접 호출');
      console.log('    apikey  — OPENAI_API_KEY 환경변수 사용');
      return;
    }
    const configs = loadProviderConfigs();
    const config = configs.find(c => c.name === 'codex');
    if (!config) {
      console.log('  ✗ codex 프로바이더를 찾을 수 없습니다.');
      return;
    }
    config.authMode = mode;
    if (mode === 'apikey' && !config.apiKey) {
      config.apiKey = 'OPENAI_API_KEY';
    }
    saveProviderConfigs(configs);
    console.log(`  ✓ codex 인증 모드 → ${mode}`);
    return;
  }

  if (sub === 'priority') {
    const name = args[1] as ProviderName;
    const priority = parseInt(args[2], 10);
    if (!name || isNaN(priority)) {
      console.log('  사용법: tenetx providers priority <claude|codex> <number>');
      return;
    }
    const configs = loadProviderConfigs();
    const config = configs.find(c => c.name === name);
    if (!config) {
      console.log(`  ✗ 프로바이더 '${name}'을 찾을 수 없습니다.`);
      return;
    }
    config.priority = priority;
    saveProviderConfigs(configs);
    console.log(`  ✓ ${name} 우선순위 → ${priority}`);
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
  console.log('\n  Tenetx — 프로바이더 현황\n');

  for (const p of summary) {
    const statusIcon = p.available ? `${GREEN}●${RST}` : `${RED}○${RST}`;
    const enabledLabel = p.enabled ? '' : `${DIM}(비활성)${RST}`;
    const modelLabel = p.model ? `${DIM}${p.model}${RST}` : '';
    const authLabel = p.authMode ? `${DIM}[${p.authMode}]${RST}` : '';
    const reason = !p.available && p.reason ? `${DIM}— ${p.reason}${RST}` : '';

    console.log(`  ${statusIcon} ${BOLD}${p.name}${RST} ${modelLabel} ${authLabel} ${enabledLabel} ${reason}`.trimEnd());
  }

  console.log(`\n  ${DIM}관리: tenetx providers <enable|disable|model|priority|auth> <provider> [value]${RST}\n`);
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

function printComparison(results: ProviderResponse[]): void {
  console.log(`  ─── 비교 요약 ───`);
  const fastest = results.reduce((a, b) => a.latencyMs < b.latencyMs ? a : b);
  const longest = results.reduce((a, b) => (a.content?.length ?? 0) > (b.content?.length ?? 0) ? a : b);

  console.log(`  ${CYAN}최고 속도${RST}: ${fastest.provider} (${fastest.latencyMs}ms)`);
  console.log(`  ${YELLOW}가장 긴 응답${RST}: ${longest.provider} (${longest.content.length}자)`);

  // 응답 유사도 (간단한 자카드 유사도)
  if (results.length === 2) {
    const similarity = jaccardSimilarity(results[0].content, results[1].content);
    console.log(`  ${DIM}응답 유사도${RST}: ${(similarity * 100).toFixed(0)}%`);
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
  사용법: tenetx ask "질문"

  옵션:
    --provider <claude|codex>  프로바이더 (기본: claude)
    --model <model-name>        모델 지정
    --all                       모든 가용 프로바이더에 동시 질문
    --compare                   병렬 질문 + 비교 분석
    --fallback                  자동 폴백 (실패 시 다음 프로바이더)

  Codex 인증 (기본: OAuth):
    1. codex login              — OAuth 로그인 (브라우저)
    2. tenetx providers auth oauth  — OAuth 토큰 사용 (기본)
    3. tenetx providers auth cli    — codex CLI 직접 호출
    4. tenetx providers auth apikey — OPENAI_API_KEY 환경변수

  프로바이더 관리:
    tenetx providers                         상태 확인
    tenetx providers enable codex            Codex 활성화
    tenetx providers auth <oauth|cli|apikey> 인증 모드 변경
    tenetx providers model codex o4-mini     기본 모델 변경
`);
}
