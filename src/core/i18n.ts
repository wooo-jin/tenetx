/**
 * i18n — 최소 다국어 지원 (ko/en)
 * CLI 첫 실행 + setup 흐름에서 사용
 */
import * as fs from 'node:fs';
import { GLOBAL_CONFIG } from './paths.js';

export type Locale = 'ko' | 'en';

/** 런타임에서 설정한 로캘 (config.json보다 우선) */
let _locale: Locale | null = null;

export function setLocale(locale: Locale): void {
  _locale = locale;
}

export function getLocale(): Locale {
  if (_locale) return _locale;
  try {
    if (fs.existsSync(GLOBAL_CONFIG)) {
      const config = JSON.parse(fs.readFileSync(GLOBAL_CONFIG, 'utf-8'));
      if (config.locale === 'ko' || config.locale === 'en') return config.locale;
    }
  } catch { /* ignore */ }
  return 'en';
}

type Messages = Record<string, string>;

// ---------------------------------------------------------------------------
// English messages
// ---------------------------------------------------------------------------
const en: Messages = {
  // Language selection
  'lang.title': '  Select Language / 언어 선택                ',
  'lang.select': '  Select / 선택 [1]: ',

  // First run — welcome
  'welcome.title': '       Welcome to Tenetx!                    ',
  'welcome.desc':
    '  Tenetx injects your development philosophy into Claude Code.\n' +
    '  Declare principles, and hooks, model routing, and agents are\n' +
    '  configured automatically.',
  'welcome.setting_up': '  Setting up the default environment now...',
  'welcome.complete': '  ✓ Initial setup complete!',
  'welcome.next_steps': '  Next steps:',
  'welcome.cmd.init': '    tenetx init              Detect project type → generate philosophy',
  'welcome.cmd.init_team': '    tenetx init --team       Start in team mode (share philosophy)',
  'welcome.cmd.philosophy': '    tenetx philosophy show   View current philosophy',
  'welcome.cmd.doctor': '    tenetx doctor            Run diagnostics',
  'welcome.learn_more': '  Learn more: https://github.com/wooo-jin/tenetx',

  // Setup
  'setup.title': '     Tenetx — Initial Setup          ',
  'setup.dir_created': '  ✓ Directory structure created',
  'setup.step.lang': '  ── Language / 언어 ──',
  'setup.step.profile': '  ── 1/5. Profile ──',
  'setup.profile_name': '  Name (optional, press Enter to skip): ',
  'setup.skipped': '  → Skipped',
  'setup.step.philosophy': '  ── 2/5. Development Philosophy ──',
  'setup.philosophy.desc1': '  Analyzes your Claude Code conversation history',
  'setup.philosophy.desc2': '  to auto-generate a philosophy matching your dev style.',
  'setup.philosophy.desc3': '  (More messages = more accurate philosophy)',
  'setup.philosophy.found': '  Found {0} conversation messages.',
  'setup.philosophy.generate': '  Generate philosophy via AI analysis?',
  'setup.philosophy.analyzing': '\n  Analyzing... (inferring patterns using Claude Code)\n',
  'setup.philosophy.result': '  ── Analysis Result ──',
  'setup.philosophy.choices': '  1) Use as-is  2) Edit first  3) Use default [1]: ',
  'setup.philosophy.saved': '  ✓ Philosophy "{0}" saved',
  'setup.philosophy.edit_intro': '\n  You can edit each principle. Press Enter to keep original.\n',
  'setup.philosophy.name_prompt': '  Philosophy name [{0}]: ',
  'setup.philosophy.desc_prompt': '  Description [{0}]: ',
  'setup.philosophy.belief': '    Current belief: {0}',
  'setup.philosophy.edit_keep': '    Edit (Enter=keep): ',
  'setup.philosophy.keep_item': '    → Keep "{0}"?',
  'setup.philosophy.keep_principle': '\n  Keep principle [{0}]?',
  'setup.philosophy.using_default': '  → Using default philosophy',
  'setup.philosophy.gen_failed': '  [!] Philosophy generation failed. Using default philosophy.',
  'setup.philosophy.skip': '  → Using default philosophy (edit later with tenetx philosophy edit)',
  'setup.philosophy.no_history1': '  No Claude Code conversation history found.',
  'setup.philosophy.no_history2': '  Starting with default philosophy. Run tenetx setup again after',
  'setup.philosophy.no_history3': '  some usage to generate a philosophy from your history.',
  'setup.step.routing': '  ── 3/5. Model Routing ──',
  'setup.routing.desc': '  Automatically distributes AI models by task type.\n',
  'setup.routing.1': 'default      — explore:Sonnet, implement:Opus, search:Haiku (recommended)',
  'setup.routing.2': 'cost-saving  — mostly Sonnet, Opus only for core design',
  'setup.routing.3': 'max-quality  — mostly Opus (higher cost)',
  'setup.select': '  Select [1]: ',
  'setup.step.notify': '  ── 4/5. Notifications ──',
  'setup.notify.desc': '  Receive notifications on task completion or errors.\n',
  'setup.notify.ask': '  Set up external notifications?',
  'setup.notify.skipped': '  → Skipped (configure later with tenetx notify config)',
  'setup.step.permission': '  ── 5/5. Permission Mode ──',
  'setup.perm.desc1': '  Using --dangerously-skip-permissions by default allows',
  'setup.perm.desc2': '  autonomous operation without tool approval prompts.',
  'setup.perm.desc3': '  (You can also use txd command for the same effect)\n',
  'setup.perm.ask': '  Always skip permissions when running tenetx?',
  'setup.perm.on': '  ✓ --dangerously-skip-permissions applied automatically',
  'setup.perm.off': '  ✓ Default permission mode (use txd when needed)',
  'setup.done.line': '  ══════════════════════════════════════',
  'setup.done': '  Setup complete!',
  'setup.getting_started': '\n  Getting started:',
  'setup.cmd.run': '    tenetx              Run Claude Code',
  'setup.cmd.txd': '    txd             Run with skip-permissions',
  'setup.cmd.philosophy': '    tenetx philosophy   View/edit philosophy',
  'setup.cmd.doctor': '    tenetx doctor       Run diagnostics',
  'setup.cmd.setup': '    tenetx setup        Run this setup again',
  'setup.non_interactive1': '[tenetx] Initial setup complete with defaults (non-interactive)',
  'setup.non_interactive2': '  ✓ Directories created, default philosophy, routing: default',
  'setup.non_interactive3': '  Interactive setup: tenetx setup (in TTY environment)',
  'setup.prompt_range': '  Please enter a number between 1 and {0}.',

  // Notification sub-flow
  'notify.discord.webhook': '  Discord webhook URL: ',
  'notify.discord.ok': '  ✓ Discord notification configured',
  'notify.discord.fail': '  ✗ Invalid URL (HTTPS required). Configure later: tenetx notify config discord <url>',
  'notify.slack.webhook': '  Slack webhook URL: ',
  'notify.slack.ok': '  ✓ Slack notification configured',
  'notify.slack.fail': '  ✗ Invalid URL (HTTPS required). Configure later: tenetx notify config slack <url>',
  'notify.telegram.token': '  Telegram Bot Token: ',
  'notify.telegram.chat': '  Telegram Chat ID: ',
  'notify.telegram.ok': '  ✓ Telegram notification configured',
  'notify.telegram.fail': '  ✗ Required values are empty. Configure later: tenetx notify config telegram <token> <chatId>',

  // CLI errors
  'error.no_claude': '\n  [tenetx] Claude Code is not installed.',
  'error.install_claude': '  Install: https://docs.anthropic.com/en/docs/claude-code',
  'error.verify': '  Verify: tenetx doctor\n',
  'error.no_git': '\n  [tenetx] Git is not installed.',
  'error.install_git': '  Install: https://git-scm.com/downloads\n',
  'error.no_node': '\n  [tenetx] Node.js 18 or higher is required.',
  'error.permission': '\n  [tenetx] Permission denied. Check file permissions or use sudo.',
  'error.generic': '\n  [tenetx] Error:',
  'error.persist': '  If the problem persists: run tenetx doctor for diagnostics.',
  'error.issues': '  Issues: https://github.com/wooo-jin/tenetx/issues\n',
};

// ---------------------------------------------------------------------------
// Korean messages
// ---------------------------------------------------------------------------
const ko: Messages = {
  // Language selection
  'lang.title': '  Select Language / 언어 선택                ',
  'lang.select': '  선택 [1]: ',

  // First run — welcome
  'welcome.title': '     테넷엑스에 오신 것을 환영합니다!        ',
  'welcome.desc':
    '  테넷엑스는 당신의 개발 철학을 Claude Code에 주입합니다.\n' +
    '  원칙을 선언하면 훅, 모델 라우팅, 에이전트가\n' +
    '  자동으로 구성됩니다.',
  'welcome.setting_up': '  기본 환경을 설정하고 있습니다...',
  'welcome.complete': '  ✓ 초기 설정 완료!',
  'welcome.next_steps': '  다음 단계:',
  'welcome.cmd.init': '    tenetx init              프로젝트 타입 감지 → 철학 생성',
  'welcome.cmd.init_team': '    tenetx init --team       팀 모드로 시작 (철학 공유)',
  'welcome.cmd.philosophy': '    tenetx philosophy show   현재 철학 보기',
  'welcome.cmd.doctor': '    tenetx doctor            환경 진단',
  'welcome.learn_more': '  더 알아보기: https://github.com/wooo-jin/tenetx',

  // Setup
  'setup.title': '     테넷엑스 — 초기 설정              ',
  'setup.dir_created': '  ✓ 디렉토리 구조 생성 완료',
  'setup.step.lang': '  ── 언어 / Language ──',
  'setup.step.profile': '  ── 1/5. 프로필 ──',
  'setup.profile_name': '  이름 (선택, Enter로 건너뛰기): ',
  'setup.skipped': '  → 건너뜀',
  'setup.step.philosophy': '  ── 2/5. 개발 철학 ──',
  'setup.philosophy.desc1': '  Claude Code 대화 기록을 분석하여',
  'setup.philosophy.desc2': '  당신의 개발 스타일에 맞는 철학을 자동 생성합니다.',
  'setup.philosophy.desc3': '  (메시지가 많을수록 정확한 철학이 생성됩니다)',
  'setup.philosophy.found': '  {0}개의 대화 메시지를 발견했습니다.',
  'setup.philosophy.generate': '  AI 분석으로 철학을 생성하시겠습니까?',
  'setup.philosophy.analyzing': '\n  분석 중... (Claude Code로 패턴 추론)\n',
  'setup.philosophy.result': '  ── 분석 결과 ──',
  'setup.philosophy.choices': '  1) 그대로 사용  2) 수정 후 사용  3) 기본값 사용 [1]: ',
  'setup.philosophy.saved': '  ✓ 철학 "{0}" 저장 완료',
  'setup.philosophy.edit_intro': '\n  각 원칙을 수정할 수 있습니다. Enter를 누르면 원본 유지.\n',
  'setup.philosophy.name_prompt': '  철학 이름 [{0}]: ',
  'setup.philosophy.desc_prompt': '  설명 [{0}]: ',
  'setup.philosophy.belief': '    현재 신념: {0}',
  'setup.philosophy.edit_keep': '    수정 (Enter=유지): ',
  'setup.philosophy.keep_item': '    → "{0}" 유지?',
  'setup.philosophy.keep_principle': '\n  원칙 [{0}] 유지?',
  'setup.philosophy.using_default': '  → 기본 철학 사용',
  'setup.philosophy.gen_failed': '  [!] 철학 생성 실패. 기본 철학을 사용합니다.',
  'setup.philosophy.skip': '  → 기본 철학 사용 (나중에 tenetx philosophy edit로 수정 가능)',
  'setup.philosophy.no_history1': '  Claude Code 대화 기록을 찾을 수 없습니다.',
  'setup.philosophy.no_history2': '  기본 철학으로 시작합니다. 사용 후',
  'setup.philosophy.no_history3': '  tenetx setup을 다시 실행하여 철학을 생성하세요.',
  'setup.step.routing': '  ── 3/5. 모델 라우팅 ──',
  'setup.routing.desc': '  작업 유형에 따라 AI 모델을 자동 분배합니다.\n',
  'setup.routing.1': 'default      — 탐색:Sonnet, 구현:Opus, 검색:Haiku (권장)',
  'setup.routing.2': 'cost-saving  — 주로 Sonnet, 핵심 설계만 Opus',
  'setup.routing.3': 'max-quality  — 주로 Opus (비용 높음)',
  'setup.select': '  선택 [1]: ',
  'setup.step.notify': '  ── 4/5. 알림 ──',
  'setup.notify.desc': '  작업 완료나 오류 발생 시 알림을 받습니다.\n',
  'setup.notify.ask': '  외부 알림을 설정하시겠습니까?',
  'setup.notify.skipped': '  → 건너뜀 (나중에 tenetx notify config로 설정)',
  'setup.step.permission': '  ── 5/5. 권한 모드 ──',
  'setup.perm.desc1': '  --dangerously-skip-permissions를 기본으로 사용하면',
  'setup.perm.desc2': '  도구 승인 프롬프트 없이 자율 운영됩니다.',
  'setup.perm.desc3': '  (txd 명령어로도 같은 효과를 얻을 수 있습니다)\n',
  'setup.perm.ask': '  tenetx 실행 시 항상 권한 건너뛰기?',
  'setup.perm.on': '  ✓ --dangerously-skip-permissions 자동 적용',
  'setup.perm.off': '  ✓ 기본 권한 모드 (필요시 txd 사용)',
  'setup.done.line': '  ══════════════════════════════════════',
  'setup.done': '  설정 완료!',
  'setup.getting_started': '\n  시작하기:',
  'setup.cmd.run': '    tenetx              Claude Code 실행',
  'setup.cmd.txd': '    txd             권한 건너뛰기로 실행',
  'setup.cmd.philosophy': '    tenetx philosophy   철학 보기/수정',
  'setup.cmd.doctor': '    tenetx doctor       환경 진단',
  'setup.cmd.setup': '    tenetx setup        설정 다시 실행',
  'setup.non_interactive1': '[tenetx] 기본값으로 초기 설정 완료 (비대화형)',
  'setup.non_interactive2': '  ✓ 디렉토리 생성, 기본 철학, 라우팅: default',
  'setup.non_interactive3': '  대화형 설정: tenetx setup (TTY 환경에서)',
  'setup.prompt_range': '  1에서 {0} 사이의 숫자를 입력하세요.',

  // Notification sub-flow
  'notify.discord.webhook': '  Discord 웹훅 URL: ',
  'notify.discord.ok': '  ✓ Discord 알림 설정 완료',
  'notify.discord.fail': '  ✗ 잘못된 URL (HTTPS 필요). 나중에 설정: tenetx notify config discord <url>',
  'notify.slack.webhook': '  Slack 웹훅 URL: ',
  'notify.slack.ok': '  ✓ Slack 알림 설정 완료',
  'notify.slack.fail': '  ✗ 잘못된 URL (HTTPS 필요). 나중에 설정: tenetx notify config slack <url>',
  'notify.telegram.token': '  Telegram 봇 토큰: ',
  'notify.telegram.chat': '  Telegram 채팅 ID: ',
  'notify.telegram.ok': '  ✓ Telegram 알림 설정 완료',
  'notify.telegram.fail': '  ✗ 필수값이 비어있음. 나중에 설정: tenetx notify config telegram <token> <chatId>',

  // CLI errors
  'error.no_claude': '\n  [tenetx] Claude Code가 설치되어 있지 않습니다.',
  'error.install_claude': '  설치: https://docs.anthropic.com/en/docs/claude-code',
  'error.verify': '  확인: tenetx doctor\n',
  'error.no_git': '\n  [tenetx] Git이 설치되어 있지 않습니다.',
  'error.install_git': '  설치: https://git-scm.com/downloads\n',
  'error.no_node': '\n  [tenetx] Node.js 18 이상이 필요합니다.',
  'error.permission': '\n  [tenetx] 권한 거부. 파일 권한을 확인하거나 sudo를 사용하세요.',
  'error.generic': '\n  [tenetx] 오류:',
  'error.persist': '  문제가 지속되면: tenetx doctor로 진단을 실행하세요.',
  'error.issues': '  이슈: https://github.com/wooo-jin/tenetx/issues\n',
};

// ---------------------------------------------------------------------------
const allMessages: Record<Locale, Messages> = { en, ko };

/**
 * 번역 키를 로캘에 맞는 메시지로 변환
 * {0}, {1}, ... 플레이스홀더는 순서대로 args로 치환
 */
export function t(key: string, ...args: string[]): string {
  const locale = getLocale();
  let msg = allMessages[locale]?.[key] ?? allMessages.en[key] ?? key;
  for (let i = 0; i < args.length; i++) {
    msg = msg.replace(`{${i}}`, args[i]);
  }
  return msg;
}
