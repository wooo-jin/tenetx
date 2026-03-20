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
    if (!Number.isNaN(num) && num >= 1 && num <= choices.length) {
      return num - 1;
    }
    console.log(`  Please enter a number between 1 and ${choices.length}.`);
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
    console.log('[tenetx] Initial setup complete with defaults (non-interactive)');
    console.log('  ✓ Directories created, default philosophy, routing: default');
    console.log('  Interactive setup: tenetx setup (in TTY environment)');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const config = loadGlobalConfig();

  console.log(`
  ╔══════════════════════════════════════╗
  ║     Tenetx — Initial Setup          ║
  ╚══════════════════════════════════════╝
`);

  // ─── Step 0: 디렉토리 생성 ───
  const dirs = [COMPOUND_HOME, ME_DIR, ME_SOLUTIONS, ME_RULES, PACKS_DIR, SESSIONS_DIR];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  initDefaultPhilosophy();
  console.log('  ✓ Directory structure created\n');

  // ─── Step 1: Profile ───
  console.log('  ── 1/5. Profile ──');
  const name = await prompt(rl, '  Name (optional, press Enter to skip): ');
  if (name.trim()) {
    config.name = name.trim();
    console.log(`  ✓ ${config.name}\n`);
  } else {
    console.log('  → Skipped\n');
  }

  // ─── Step 2: Development Philosophy ───
  console.log('  ── 2/5. Development Philosophy ──');
  console.log('  Analyzes your Claude Code conversation history');
  console.log('  to auto-generate a philosophy matching your dev style.');
  console.log('  (More messages = more accurate philosophy)\n');

  const messages = sampleUserHistory();
  if (messages.length > 0) {
    console.log(`  Found ${messages.length} conversation messages.`);
    const wantGenerate = await promptYesNo(rl, '  Generate philosophy via AI analysis?', true);

    if (wantGenerate) {
      console.log('\n  Analyzing... (inferring patterns using Claude Code)\n');
      const generated = generatePhilosophy(messages);

      if (generated) {
        console.log('  ── Analysis Result ──\n');
        console.log(formatPhilosophy(generated));

        const accept = await promptChoice(rl, '  1) Use as-is  2) Edit first  3) Use default [1]: ', ['as-is', 'edit', 'default'], 0);

        if (accept === 0) {
          fs.writeFileSync(ME_PHILOSOPHY, JSON.stringify(generated, null, 2));
          console.log(`  ✓ Philosophy "${generated.name}" saved\n`);
        } else if (accept === 1) {
          console.log('\n  You can edit each principle. Press Enter to keep original.\n');

          const newName = await prompt(rl, `  Philosophy name [${generated.name}]: `);
          if (newName.trim()) generated.name = newName.trim();

          const newDesc = await prompt(rl, `  Description [${generated.description ?? ''}]: `);
          if (newDesc.trim()) generated.description = newDesc.trim();

          for (const [key, principle] of Object.entries(generated.principles)) {
            console.log(`\n  [${key}]`);
            console.log(`    Current belief: ${principle.belief}`);
            const newBelief = await prompt(rl, '    Edit (Enter=keep): ');
            if (newBelief.trim()) principle.belief = newBelief.trim();

            for (let i = 0; i < principle.generates.length; i++) {
              const gen = principle.generates[i];
              const display = typeof gen === 'string' ? gen : JSON.stringify(gen);
              const keep = await promptYesNo(rl, `    → Keep "${display}"?`, true);
              if (!keep) {
                principle.generates.splice(i, 1);
                i--;
              }
            }
          }

          const removeKeys: string[] = [];
          for (const key of Object.keys(generated.principles)) {
            const keep = await promptYesNo(rl, `\n  Keep principle [${key}]?`, true);
            if (!keep) removeKeys.push(key);
          }
          for (const key of removeKeys) {
            delete generated.principles[key];
          }

          fs.writeFileSync(ME_PHILOSOPHY, JSON.stringify(generated, null, 2));
          console.log(`\n  ✓ Philosophy "${generated.name}" saved\n`);
        } else {
          console.log('  → Using default philosophy\n');
        }
      } else {
        console.log('  [!] Philosophy generation failed. Using default philosophy.\n');
      }
    } else {
      console.log('  → Using default philosophy (edit later with tenetx philosophy edit)\n');
    }
  } else {
    console.log('  No Claude Code conversation history found.');
    console.log('  Starting with default philosophy. Run tenetx setup again after');
    console.log('  some usage to generate a philosophy from your history.\n');
  }

  // ─── Step 3: Model Routing ───
  console.log('  ── 3/5. Model Routing ──');
  console.log('  Automatically distributes AI models by task type.\n');

  const routingChoices = [
    'default      — explore:Sonnet, implement:Opus, search:Haiku (recommended)',
    'cost-saving  — mostly Sonnet, Opus only for core design',
    'max-quality  — mostly Opus (higher cost)',
  ];
  for (let i = 0; i < routingChoices.length; i++) {
    const marker = i === 0 ? ' (default)' : '';
    console.log(`  ${i + 1}) ${routingChoices[i]}${marker}`);
  }
  console.log();
  const routingIdx = await promptChoice(rl, '  Select [1]: ', routingChoices, 0);
  config.modelRouting = (['default', 'cost-saving', 'max-quality'] as const)[routingIdx];
  console.log(`  ✓ ${config.modelRouting}\n`);

  // ─── Step 4: Notifications ───
  console.log('  ── 4/5. Notifications ──');
  console.log('  Receive notifications on task completion or errors.\n');

  const wantNotify = await promptYesNo(rl, '  Set up external notifications?', false);
  if (wantNotify) {
    await setupNotifications(rl);
  } else {
    console.log('  → Skipped (configure later with tenetx notify config)\n');
  }

  // ─── Step 5: Permission Mode ───
  console.log('  ── 5/5. Permission Mode ──');
  console.log('  Using --dangerously-skip-permissions by default allows');
  console.log('  autonomous operation without tool approval prompts.');
  console.log('  (You can also use txd command for the same effect)\n');

  const skipPerms = await promptYesNo(rl, '  Always skip permissions when running tenetx?', false);
  config.dangerouslySkipPermissions = skipPerms;
  if (skipPerms) {
    console.log('  ✓ --dangerously-skip-permissions applied automatically\n');
  } else {
    console.log('  ✓ Default permission mode (use txd when needed)\n');
  }

  // ─── Save ───
  saveGlobalConfig(config);

  console.log('  ══════════════════════════════════════');
  console.log('  Setup complete!');
  console.log();
  console.log('  Getting started:');
  console.log('    tenetx              Run Claude Code');
  if (!skipPerms) {
    console.log('    txd             Run with skip-permissions');
  }
  console.log('    tenetx philosophy   View/edit philosophy');
  console.log('    tenetx doctor       Run diagnostics');
  console.log('    tenetx setup        Run this setup again');
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
  const channelIdx = await promptChoice(rl, '  Select channel [1]: ', notifyChoices, 0);

  const notifyConfig = loadNotifyConfig();
  notifyConfig.enabled = true;

  switch (channelIdx) {
    case 0: { // Discord
      const webhook = await prompt(rl, '  Discord webhook URL: ');
      if (webhook.trim() && validateWebhookUrl(webhook.trim())) {
        notifyConfig.discord = { webhook: webhook.trim() };
        saveNotifyConfig(notifyConfig);
        console.log('  ✓ Discord notification configured\n');
      } else {
        console.log('  ✗ Invalid URL (HTTPS required). Configure later: tenetx notify config discord <url>\n');
      }
      break;
    }
    case 1: { // Slack
      const webhook = await prompt(rl, '  Slack webhook URL: ');
      if (webhook.trim() && validateWebhookUrl(webhook.trim())) {
        notifyConfig.slack = { webhook: webhook.trim() };
        saveNotifyConfig(notifyConfig);
        console.log('  ✓ Slack notification configured\n');
      } else {
        console.log('  ✗ Invalid URL (HTTPS required). Configure later: tenetx notify config slack <url>\n');
      }
      break;
    }
    case 2: { // Telegram
      const botToken = await prompt(rl, '  Telegram Bot Token: ');
      const chatId = await prompt(rl, '  Telegram Chat ID: ');
      if (botToken.trim() && chatId.trim()) {
        notifyConfig.telegram = { botToken: botToken.trim(), chatId: chatId.trim() };
        saveNotifyConfig(notifyConfig);
        console.log('  ✓ Telegram notification configured\n');
      } else {
        console.log('  ✗ Required values are empty. Configure later: tenetx notify config telegram <token> <chatId>\n');
      }
      break;
    }
  }
}

/** 프로젝트별 철학 설정 (tenetx setup --project) */
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
      console.log(`[tenetx] Centrally managed project philosophy created (extends: ${extendsValue})`);
      console.log(`  → Using pack "${packName}" philosophy as base.`);
      console.log(`  → Project overrides: add to principles in ${philosophyPath}`);
      console.log(`  → Sync: tenetx philosophy sync`);
    } else if (options.pack) {
      // 복사 모드: 팩 내용을 직접 복사 (소규모 팀)
      const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
      const packPath = path.join(pkgRoot, 'packs', `${options.pack}.json`);
      const globalPackPath = path.join(PACKS_DIR, options.pack, 'philosophy.json');

      if (fs.existsSync(packPath)) {
        fs.copyFileSync(packPath, philosophyPath);
        console.log(`[tenetx] Project philosophy created from pack "${options.pack}" (independent copy)`);
      } else if (fs.existsSync(globalPackPath)) {
        fs.copyFileSync(globalPackPath, philosophyPath);
        console.log(`[tenetx] Project philosophy created from global pack "${options.pack}" (independent copy)`);
      } else {
        const available = ['frontend', 'backend', 'devops', 'security', 'data'];
        console.error(`[tenetx] Pack "${options.pack}" not found.`);
        console.error(`  Available: ${available.join(', ')}`);
        process.exit(1);
      }
    } else {
      // --yes: 기본 철학으로 생성
      const philosophy = JSON.parse(JSON.stringify(DEFAULT_PHILOSOPHY));
      philosophy.name = path.basename(cwd);
      fs.writeFileSync(philosophyPath, JSON.stringify(philosophy, null, 2));
      console.log(`[tenetx] Default project philosophy created: ${philosophyPath}`);
    }
    console.log('  Share with team: git add .compound/philosophy.json && git commit');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const projectDir = path.join(cwd, '.compound');
  const philosophyPath = projectPhilosophyPath(cwd);

  console.log(`
  ╔══════════════════════════════════════════╗
  ║   Tenetx — Project Philosophy Setup     ║
  ╚══════════════════════════════════════════╝
`);
  console.log(`  Project: ${cwd}\n`);

  // Check existing project philosophy
  if (fs.existsSync(philosophyPath)) {
    const existing = loadPhilosophy(philosophyPath);
    console.log(`  Existing project philosophy: "${existing.name}" (v${existing.version})`);
    console.log(`  Principles: ${Object.keys(existing.principles).length}\n`);

    const overwrite = await promptYesNo(rl, '  Set up new philosophy?', false);
    if (!overwrite) {
      console.log('  → Keeping existing philosophy\n');
      rl.close();
      return;
    }
    console.log();
  }

  // 글로벌 철학을 기반으로 할지 선택
  const globalPhil = fs.existsSync(ME_PHILOSOPHY) ? loadPhilosophy(ME_PHILOSOPHY) : DEFAULT_PHILOSOPHY;

  console.log('  ── Select Philosophy Source ──\n');
  const sourceChoices = [
    `Copy global philosophy ("${globalPhil.name}")`,
    'Start from default philosophy',
    'Empty philosophy (edit manually)',
  ];
  for (let i = 0; i < sourceChoices.length; i++) {
    console.log(`  ${i + 1}) ${sourceChoices[i]}`);
  }
  console.log();
  const sourceIdx = await promptChoice(rl, '  Select [1]: ', sourceChoices, 0);

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

  const newName = await prompt(rl, `\n  Project philosophy name [${philosophy.name}]: `);
  if (newName.trim()) philosophy.name = newName.trim();

  const desc = await prompt(rl, `  Description (optional): `);
  if (desc.trim()) philosophy.description = desc.trim();

  console.log('\n  ── Project Model Routing ──\n');
  const routingChoices = [
    'Follow global settings (no change)',
    'default      — explore:Sonnet, implement:Opus, search:Haiku',
    'cost-saving  — mostly Sonnet, Opus only for core design',
    'max-quality  — mostly Opus (higher cost)',
  ];
  for (let i = 0; i < routingChoices.length; i++) {
    console.log(`  ${i + 1}) ${routingChoices[i]}`);
  }
  console.log();
  const routingIdx = await promptChoice(rl, '  Select [1]: ', routingChoices, 0);

  if (routingIdx > 0) {
    const presets = ['default', 'cost-saving', 'max-quality'];
    const selectedPreset = presets[routingIdx - 1];
    // routing 정보를 principles에 추가
    if (!philosophy.principles['focus-resources-on-judgment']) {
      philosophy.principles['focus-resources-on-judgment'] = {
        belief: 'Resources should be focused where judgment is needed',
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
    console.log(`  ✓ Project routing: ${selectedPreset}\n`);
  } else {
    console.log('  → Following global settings\n');
  }

  // 저장
  fs.mkdirSync(projectDir, { recursive: true });
  fs.writeFileSync(philosophyPath, JSON.stringify(philosophy, null, 2));

  console.log('  ══════════════════════════════════════');
  console.log(`  ✓ Project philosophy saved: ${philosophyPath}`);
  console.log(`    Name: "${philosophy.name}"`);
  console.log(`    Principles: ${Object.keys(philosophy.principles).length}`);
  console.log();
  console.log('  Project philosophy takes priority when running tenetx in this project.');
  console.log(`  Edit manually: vi ${philosophyPath}`);
  console.log();

  rl.close();
}
