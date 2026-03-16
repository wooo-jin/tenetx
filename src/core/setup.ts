import * as fs from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPOUND_HOME, ME_DIR, ME_SOLUTIONS, ME_RULES, ME_PHILOSOPHY, PACKS_DIR, SESSIONS_DIR, projectPhilosophyPath } from './paths.js';
import { initDefaultPhilosophy, loadPhilosophy, DEFAULT_PHILOSOPHY } from './philosophy-loader.js';
import { loadGlobalConfig, saveGlobalConfig } from './global-config.js';
import { validateWebhookUrl, loadNotifyConfig, saveNotifyConfig } from './notify.js';
import { sampleUserHistory, generatePhilosophy, formatPhilosophy } from './philosophy-generator.js';

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function promptChoice(rl: readline.Interface, question: string, choices: string[], defaultIdx = 0): Promise<number> {
  while (true) {
    const answer = await prompt(rl, question);
    const trimmed = answer.trim();

    // 엔터만 치면 기본값
    if (trimmed === '') return defaultIdx;

    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= choices.length) {
      return num - 1;
    }
    console.log(`  1~${choices.length} 사이의 숫자를 입력하세요.`);
  }
}

async function promptYesNo(rl: readline.Interface, question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await prompt(rl, `${question} ${hint}: `);
  const trimmed = answer.trim().toLowerCase();
  if (trimmed === '') return defaultYes;
  return trimmed === 'y' || trimmed === 'yes';
}

export async function runSetup(options?: { yes?: boolean }): Promise<void> {
  const nonInteractive = options?.yes ?? !process.stdin.isTTY;

  // non-interactive 모드: 모든 기본값으로 자동 설정
  if (nonInteractive) {
    const config = loadGlobalConfig();
    const dirs = [COMPOUND_HOME, ME_DIR, ME_SOLUTIONS, ME_RULES, PACKS_DIR, SESSIONS_DIR];
    for (const dir of dirs) fs.mkdirSync(dir, { recursive: true });
    initDefaultPhilosophy();
    config.modelRouting = config.modelRouting ?? 'default';
    saveGlobalConfig(config);
    console.log('[tenet] 기본값으로 초기 설정 완료 (non-interactive)');
    console.log('  ✓ 디렉토리 생성, 기본 철학, 라우팅: default');
    console.log('  대화형 설정: tenet setup (TTY 환경에서)');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const config = loadGlobalConfig();

  console.log(`
  ╔══════════════════════════════════════╗
  ║     Tenet — 초기 설정     ║
  ╚══════════════════════════════════════╝
`);

  // ─── Step 0: 디렉토리 생성 ───
  const dirs = [COMPOUND_HOME, ME_DIR, ME_SOLUTIONS, ME_RULES, PACKS_DIR, SESSIONS_DIR];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  initDefaultPhilosophy();
  console.log('  ✓ 디렉토리 구조 생성 완료\n');

  // ─── Step 1: 프로필 ───
  console.log('  ── 1/5. 프로필 ──');
  const name = await prompt(rl, '  이름 (선택사항, 엔터로 건너뛰기): ');
  if (name.trim()) {
    config.name = name.trim();
    console.log(`  ✓ ${config.name}\n`);
  } else {
    console.log('  → 건너뜀\n');
  }

  // ─── Step 2: 개발 철학 생성 ───
  console.log('  ── 2/5. 개발 철학 ──');
  console.log('  Claude Code 대화 히스토리를 분석하여');
  console.log('  당신의 개발 스타일에 맞는 철학을 자동 생성합니다.\n');

  const messages = sampleUserHistory(80);
  if (messages.length > 0) {
    console.log(`  ${messages.length}개의 대화 메시지를 발견했습니다.`);
    const wantGenerate = await promptYesNo(rl, '  AI가 분석하여 철학을 생성할까요?', true);

    if (wantGenerate) {
      console.log('\n  분석 중... (Claude Code를 사용하여 패턴을 추론합니다)\n');
      const generated = generatePhilosophy(messages);

      if (generated) {
        console.log('  ── 분석 결과 ──\n');
        console.log(formatPhilosophy(generated));

        const accept = await promptChoice(rl, '  1) 이대로 사용  2) 수정 후 사용  3) 기본 철학 사용 [1]: ', ['이대로', '수정', '기본'], 0);

        if (accept === 0) {
          // 그대로 저장
          fs.writeFileSync(ME_PHILOSOPHY, JSON.stringify(generated, null, 2));
          console.log(`  ✓ 철학 "${generated.name}" 저장 완료\n`);
        } else if (accept === 1) {
          // 편집 모드: 이름과 설명만 수정 가능하게
          console.log('\n  원칙별로 수정할 수 있습니다. 엔터를 치면 원본 유지.\n');

          const newName = await prompt(rl, `  철학 이름 [${generated.name}]: `);
          if (newName.trim()) generated.name = newName.trim();

          const newDesc = await prompt(rl, `  설명 [${generated.description ?? ''}]: `);
          if (newDesc.trim()) generated.description = newDesc.trim();

          for (const [key, principle] of Object.entries(generated.principles)) {
            console.log(`\n  [${key}]`);
            console.log(`    현재 신념: ${principle.belief}`);
            const newBelief = await prompt(rl, '    수정 (엔터=유지): ');
            if (newBelief.trim()) principle.belief = newBelief.trim();

            // generates는 복잡하므로 삭제만 지원
            for (let i = 0; i < principle.generates.length; i++) {
              const gen = principle.generates[i];
              const display = typeof gen === 'string' ? gen : JSON.stringify(gen);
              const keep = await promptYesNo(rl, `    → "${display}" 유지?`, true);
              if (!keep) {
                principle.generates.splice(i, 1);
                i--;
              }
            }
          }

          // 원칙 삭제 여부
          const removeKeys: string[] = [];
          for (const key of Object.keys(generated.principles)) {
            const keep = await promptYesNo(rl, `\n  원칙 [${key}] 유지?`, true);
            if (!keep) removeKeys.push(key);
          }
          for (const key of removeKeys) {
            delete generated.principles[key];
          }

          fs.writeFileSync(ME_PHILOSOPHY, JSON.stringify(generated, null, 2));
          console.log(`\n  ✓ 철학 "${generated.name}" 저장 완료\n`);
        } else {
          console.log('  → 기본 철학 사용\n');
        }
      } else {
        console.log('  [!] 철학 생성에 실패했습니다. 기본 철학을 사용합니다.\n');
      }
    } else {
      console.log('  → 기본 철학 사용 (나중에 tenet philosophy edit 으로 수정 가능)\n');
    }
  } else {
    console.log('  Claude Code 대화 히스토리가 없습니다.');
    console.log('  기본 철학으로 시작합니다. 사용 후 tenet setup 을 다시 실행하면');
    console.log('  그때의 히스토리를 기반으로 철학을 생성할 수 있습니다.\n');
  }

  // ─── Step 3: 모델 라우팅 ───
  console.log('  ── 3/5. 모델 라우팅 ──');
  console.log('  AI 모델을 작업 유형에 따라 자동 배분합니다.\n');

  const routingChoices = [
    'default      — 탐색:Sonnet, 구현:Opus, 검색:Haiku (권장)',
    'cost-saving  — 대부분 Sonnet, 핵심 설계만 Opus',
    'max-quality  — 대부분 Opus (비용 높음)',
  ];
  for (let i = 0; i < routingChoices.length; i++) {
    const marker = i === 0 ? ' (기본)' : '';
    console.log(`  ${i + 1}) ${routingChoices[i]}${marker}`);
  }
  console.log();
  const routingIdx = await promptChoice(rl, '  선택 [1]: ', routingChoices, 0);
  config.modelRouting = (['default', 'cost-saving', 'max-quality'] as const)[routingIdx];
  console.log(`  ✓ ${config.modelRouting}\n`);

  // ─── Step 4: 알림 설정 ───
  console.log('  ── 4/5. 외부 알림 ──');
  console.log('  작업 완료/에러 시 알림을 받을 수 있습니다.\n');

  const wantNotify = await promptYesNo(rl, '  외부 알림을 설정하시겠습니까?', false);
  if (wantNotify) {
    await setupNotifications(rl);
  } else {
    console.log('  → 건너뜀 (나중에 tenet notify config 으로 설정 가능)\n');
  }

  // ─── Step 5: 권한 모드 ───
  console.log('  ── 5/5. 권한 모드 ──');
  console.log('  --dangerously-skip-permissions 를 기본으로 사용하면');
  console.log('  매번 도구 실행 승인 없이 자율적으로 동작합니다.');
  console.log('  (tenet 대신 tenetx 명령어로도 동일하게 사용 가능)\n');

  const skipPerms = await promptYesNo(rl, '  tenet 실행 시 항상 권한 건너뛰기를 기본으로 할까요?', false);
  config.dangerouslySkipPermissions = skipPerms;
  if (skipPerms) {
    console.log('  ✓ tenet 실행 시 자동으로 --dangerously-skip-permissions 적용\n');
  } else {
    console.log('  ✓ 기본 권한 모드 (필요시 chx 사용)\n');
  }

  // ─── 저장 ───
  saveGlobalConfig(config);

  console.log('  ══════════════════════════════════════');
  console.log('  설정 완료!');
  console.log();
  console.log('  시작하기:');
  console.log('    tenet              Claude Code 실행');
  if (!skipPerms) {
    console.log('    chx             권한 건너뛰기 모드로 실행');
  }
  console.log('    tenet philosophy   철학 확인/편집');
  console.log('    tenet doctor       환경 진단');
  console.log('    tenet setup        이 설정 다시 실행');
  console.log();

  rl.close();
}

/** 알림 채널 설정 서브플로우 */
async function setupNotifications(rl: readline.Interface): Promise<void> {
  const notifyChoices = ['Discord', 'Slack', 'Telegram'];
  for (let i = 0; i < notifyChoices.length; i++) {
    console.log(`  ${i + 1}) ${notifyChoices[i]}`);
  }
  console.log();
  const channelIdx = await promptChoice(rl, '  채널 선택 [1]: ', notifyChoices, 0);

  const notifyConfig = loadNotifyConfig();
  notifyConfig.enabled = true;

  switch (channelIdx) {
    case 0: { // Discord
      const webhook = await prompt(rl, '  Discord 웹훅 URL: ');
      if (webhook.trim() && validateWebhookUrl(webhook.trim())) {
        notifyConfig.discord = { webhook: webhook.trim() };
        saveNotifyConfig(notifyConfig);
        console.log('  ✓ Discord 알림 설정 완료\n');
      } else {
        console.log('  ✗ 유효하지 않은 URL (HTTPS 필요). 나중에 tenet notify config discord <url> 로 설정하세요.\n');
      }
      break;
    }
    case 1: { // Slack
      const webhook = await prompt(rl, '  Slack 웹훅 URL: ');
      if (webhook.trim() && validateWebhookUrl(webhook.trim())) {
        notifyConfig.slack = { webhook: webhook.trim() };
        saveNotifyConfig(notifyConfig);
        console.log('  ✓ Slack 알림 설정 완료\n');
      } else {
        console.log('  ✗ 유효하지 않은 URL (HTTPS 필요). 나중에 tenet notify config slack <url> 로 설정하세요.\n');
      }
      break;
    }
    case 2: { // Telegram
      const botToken = await prompt(rl, '  Telegram Bot Token: ');
      const chatId = await prompt(rl, '  Telegram Chat ID: ');
      if (botToken.trim() && chatId.trim()) {
        notifyConfig.telegram = { botToken: botToken.trim(), chatId: chatId.trim() };
        saveNotifyConfig(notifyConfig);
        console.log('  ✓ Telegram 알림 설정 완료\n');
      } else {
        console.log('  ✗ 필수 값이 비어 있습니다. 나중에 tenet notify config telegram <token> <chatId> 로 설정하세요.\n');
      }
      break;
    }
  }
}

/** 프로젝트별 철학 설정 (tenet setup --project) */
export async function runProjectSetup(cwd: string, options?: { pack?: string; extends?: string; yes?: boolean }): Promise<void> {
  // non-interactive: --pack, --extends, 또는 --yes로 바로 생성
  if (options?.pack || options?.extends || options?.yes) {
    const projDir = path.join(cwd, '.compound');
    const philosophyPath = projectPhilosophyPath(cwd);
    fs.mkdirSync(projDir, { recursive: true });

    if (options.extends) {
      // 중앙 관리 모드: extends로 팩 참조 (대규모 팀)
      const packName = options.extends.replace(/^pack:/, '');
      const extendsValue = `pack:${packName}`;
      const philosophy = {
        name: path.basename(cwd),
        version: '1.0.0',
        author: 'project',
        extends: extendsValue,
        principles: {} as Record<string, { belief: string; generates: Array<string | Record<string, string>> }>,
      };
      fs.writeFileSync(philosophyPath, JSON.stringify(philosophy, null, 2));
      console.log(`[tenet] 중앙 관리 프로젝트 철학 생성 (extends: ${extendsValue})`);
      console.log(`  → 팩 "${packName}"의 철학을 베이스로 사용합니다.`);
      console.log(`  → 프로젝트별 오버라이드: ${philosophyPath} 의 principles에 추가`);
      console.log(`  → 동기화: tenet philosophy sync`);
    } else if (options.pack) {
      // 복사 모드: 팩 내용을 직접 복사 (소규모 팀)
      const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
      const packPath = path.join(pkgRoot, 'packs', `${options.pack}.json`);
      const globalPackPath = path.join(PACKS_DIR, options.pack, 'philosophy.json');

      if (fs.existsSync(packPath)) {
        fs.copyFileSync(packPath, philosophyPath);
        console.log(`[tenet] 팩 "${options.pack}" 기반 프로젝트 철학 생성 (독립 복사)`);
      } else if (fs.existsSync(globalPackPath)) {
        fs.copyFileSync(globalPackPath, philosophyPath);
        console.log(`[tenet] 글로벌 팩 "${options.pack}" 기반 프로젝트 철학 생성 (독립 복사)`);
      } else {
        const available = ['frontend', 'backend', 'devops', 'security', 'data'];
        console.error(`[tenet] 팩 "${options.pack}"을 찾을 수 없습니다.`);
        console.error(`  사용 가능: ${available.join(', ')}`);
        process.exit(1);
      }
    } else {
      // --yes: 기본 철학으로 생성
      const philosophy = JSON.parse(JSON.stringify(DEFAULT_PHILOSOPHY));
      philosophy.name = path.basename(cwd);
      fs.writeFileSync(philosophyPath, JSON.stringify(philosophy, null, 2));
      console.log(`[tenet] 기본 프로젝트 철학 생성: ${philosophyPath}`);
    }
    console.log('  팀원에게 공유: git add .compound/philosophy.json && git commit');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const projectDir = path.join(cwd, '.compound');
  const philosophyPath = projectPhilosophyPath(cwd);

  console.log(`
  ╔══════════════════════════════════════════╗
  ║   Tenet — 프로젝트 철학 설정  ║
  ╚══════════════════════════════════════════╝
`);
  console.log(`  프로젝트: ${cwd}\n`);

  // 기존 프로젝트 철학 확인
  if (fs.existsSync(philosophyPath)) {
    const existing = loadPhilosophy(philosophyPath);
    console.log(`  기존 프로젝트 철학: "${existing.name}" (v${existing.version})`);
    console.log(`  원칙 ${Object.keys(existing.principles).length}개\n`);

    const overwrite = await promptYesNo(rl, '  새로 설정하시겠습니까?', false);
    if (!overwrite) {
      console.log('  → 기존 철학 유지\n');
      rl.close();
      return;
    }
    console.log();
  }

  // 글로벌 철학을 기반으로 할지 선택
  const globalPhil = fs.existsSync(ME_PHILOSOPHY) ? loadPhilosophy(ME_PHILOSOPHY) : DEFAULT_PHILOSOPHY;

  console.log('  ── 프로젝트 철학 소스 선택 ──\n');
  const sourceChoices = [
    `글로벌 철학 복사 ("${globalPhil.name}")`,
    '기본 철학에서 시작',
    '빈 철학 (직접 편집)',
  ];
  for (let i = 0; i < sourceChoices.length; i++) {
    console.log(`  ${i + 1}) ${sourceChoices[i]}`);
  }
  console.log();
  const sourceIdx = await promptChoice(rl, '  선택 [1]: ', sourceChoices, 0);

  let philosophy;
  if (sourceIdx === 0) {
    philosophy = JSON.parse(JSON.stringify(globalPhil)); // deep clone
  } else if (sourceIdx === 1) {
    philosophy = JSON.parse(JSON.stringify(DEFAULT_PHILOSOPHY));
  } else {
    philosophy = {
      name: path.basename(cwd),
      version: '1.0.0',
      author: 'project',
      principles: {},
    };
  }

  // 이름 커스터마이즈
  const newName = await prompt(rl, `\n  프로젝트 철학 이름 [${philosophy.name}]: `);
  if (newName.trim()) philosophy.name = newName.trim();

  // 설명 추가
  const desc = await prompt(rl, `  설명 (선택): `);
  if (desc.trim()) philosophy.description = desc.trim();

  // 모델 라우팅 프리셋
  console.log('\n  ── 프로젝트별 모델 라우팅 ──\n');
  const routingChoices = [
    '글로벌 설정 따르기 (변경 없음)',
    'default      — 탐색:Sonnet, 구현:Opus, 검색:Haiku',
    'cost-saving  — 대부분 Sonnet, 핵심 설계만 Opus',
    'max-quality  — 대부분 Opus (비용 높음)',
  ];
  for (let i = 0; i < routingChoices.length; i++) {
    console.log(`  ${i + 1}) ${routingChoices[i]}`);
  }
  console.log();
  const routingIdx = await promptChoice(rl, '  선택 [1]: ', routingChoices, 0);

  if (routingIdx > 0) {
    const presets = ['default', 'cost-saving', 'max-quality'];
    const selectedPreset = presets[routingIdx - 1];
    // routing 정보를 principles에 추가
    if (!philosophy.principles['focus-resources-on-judgment']) {
      philosophy.principles['focus-resources-on-judgment'] = {
        belief: '자원은 판단이 필요한 곳에 집중해야 한다',
        generates: [],
      };
    }
    const principle = philosophy.principles['focus-resources-on-judgment'];
    // 기존 routing 항목 제거 후 재추가
    principle.generates = principle.generates.filter(
      (g: unknown) => !(typeof g === 'object' && g !== null && 'routing' in (g as Record<string, unknown>))
    );
    const routingMap: Record<string, string> = {
      'default': 'explore → Sonnet, implement → Opus, file-search → Haiku',
      'cost-saving': 'explore → Haiku, implement → Sonnet, architect → Opus',
      'max-quality': 'explore → Sonnet, implement → Opus, code-review → Opus',
    };
    principle.generates.push({ routing: routingMap[selectedPreset] });
    console.log(`  ✓ 프로젝트 라우팅: ${selectedPreset}\n`);
  } else {
    console.log('  → 글로벌 설정 따르기\n');
  }

  // 저장
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(philosophyPath, JSON.stringify(philosophy, null, 2));

  console.log('  ══════════════════════════════════════');
  console.log(`  ✓ 프로젝트 철학 저장: ${philosophyPath}`);
  console.log(`    이름: "${philosophy.name}"`);
  console.log(`    원칙: ${Object.keys(philosophy.principles).length}개`);
  console.log();
  console.log('  이 프로젝트에서 chx 실행 시 프로젝트 철학이 우선 적용됩니다.');
  console.log('  직접 편집: vi ' + philosophyPath);
  console.log();

  rl.close();
}
