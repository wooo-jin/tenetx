/**
 * Tenetx v1 — Onboarding CLI
 *
 * 언어 선택 + 4문항 온보딩 인터랙티브 flow.
 */

import * as readline from 'node:readline';
import { computeOnboarding, onboardingToRecommendation } from './onboarding.js';
import type { ChoiceId } from './onboarding.js';
import { createProfile, saveProfile } from '../store/profile-store.js';
import { saveRecommendation, updateRecommendationStatus } from '../store/recommendation-store.js';
import { ensureV1Directories } from '../core/v1-bootstrap.js';
import { ONBOARDING, qualityName, autonomyName, judgmentName, communicationName, trustName, setLocale, getLocale, type Locale } from '../i18n/index.js';
import { saveGlobalConfig, loadGlobalConfig } from '../core/global-config.js';

function askChoice(rl: readline.Interface, question: string, validChoices: string[], errorMsg: string): Promise<string> {
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(question, (answer) => {
        const upper = answer.trim().toUpperCase();
        if (validChoices.includes(upper)) {
          resolve(upper);
        } else {
          console.log(errorMsg);
          ask();
        }
      });
    };
    ask();
  });
}

export async function runOnboarding(): Promise<void> {
  ensureV1Directories();

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // 0. 언어 선택
    console.log(`
  ╔══════════════════════════════════════════════╗
  ║  Tenetx — Setup                             ║
  ╚══════════════════════════════════════════════╝

  Select language / 언어를 선택하세요:

    1) English
    2) 한국어
`);

    const langChoice = await askChoice(rl, '  Choice / 선택 (1/2): ', ['1', '2'], '  Please enter 1 or 2. / 1 또는 2를 입력하세요.');
    const locale: Locale = langChoice === '2' ? 'ko' : 'en';
    setLocale(locale);

    // locale을 GlobalConfig에 저장
    const config = loadGlobalConfig();
    config.locale = locale;
    saveGlobalConfig(config);

    const strings = ONBOARDING[locale];

    console.log(`
  ╔══════════════════════════════════════════════╗
  ║${strings.header.padEnd(46)}║
  ╚══════════════════════════════════════════════╝

${strings.subtitle}`);

    // 1-4. 4문항
    const q1 = await askChoice(rl, strings.q1, ['A', 'B', 'C'], strings.invalidChoice) as ChoiceId;
    const q2 = await askChoice(rl, strings.q2, ['A', 'B', 'C'], strings.invalidChoice) as ChoiceId;
    const q3 = await askChoice(rl, strings.q3, ['A', 'B', 'C'], strings.invalidChoice) as ChoiceId;
    const q4 = await askChoice(rl, strings.q4, ['A', 'B', 'C'], strings.invalidChoice) as ChoiceId;

    const result = computeOnboarding(q1, q2, q3, q4);

    console.log(`
  ─────────────────────────────────────────
  ${strings.resultHeader}

    Quality:       ${qualityName(result.qualityPack, locale)} (confidence: ${result.qualityConfidence.toFixed(2)})
    Autonomy:      ${autonomyName(result.autonomyPack, locale)} (confidence: ${result.autonomyConfidence.toFixed(2)})
    Judgment:      ${judgmentName(result.judgmentPack, locale)} (confidence: ${result.judgmentConfidence.toFixed(2)})
    Communication: ${communicationName(result.communicationPack, locale)} (confidence: ${result.communicationConfidence.toFixed(2)})
    Trust:         ${trustName(result.suggestedTrustPolicy, locale)}
  ─────────────────────────────────────────`);

    // Recommendation 저장
    const rec = onboardingToRecommendation(result);
    saveRecommendation(rec);
    updateRecommendationStatus(rec.recommendation_id, 'accepted');

    // Profile 생성
    const profile = createProfile(
      'default',
      result.qualityPack,
      result.autonomyPack,
      result.suggestedTrustPolicy,
      'onboarding',
      result.judgmentPack,
      result.communicationPack,
    );
    saveProfile(profile);

    console.log(`
  ${strings.profileSaved}
`);
  } finally {
    rl.close();
  }
}
