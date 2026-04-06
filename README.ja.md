<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>Claude Code パーソナライゼーション ハーネス。</strong><br/>
  <strong>使えば使うほど、あなたを理解する Claude。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20"/></a>
</p>

<p align="center">
  <a href="#tenetx-を使うと起こること">動作フロー</a> &middot;
  <a href="#クイックスタート">クイックスタート</a> &middot;
  <a href="#仕組み">仕組み</a> &middot;
  <a href="#4軸パーソナライゼーション">4軸</a> &middot;
  <a href="#コマンド">コマンド</a> &middot;
  <a href="#アーキテクチャ">アーキテクチャ</a> &middot;
  <a href="#セーフティ">セーフティ</a>
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  日本語 &middot;
  <a href="README.zh.md">简体中文</a>
</p>

---

## 2人の開発者。同じ Claude。まったく異なる振る舞い。

開発者 A は慎重派です。Claude にすべてのテストを実行させ、理由を説明させ、現在のファイル以外を変更する前に必ず確認を求めます。

開発者 B はスピード重視です。Claude に前提を置いて判断させ、関連ファイルも直接修正させ、結果を2行で報告させます。

tenetx なしでは、両者とも同じ汎用的な Claude を使うことになります。tenetx を使えば、それぞれが自分のやり方に合った Claude を手に入れます。

```
開発者 A の Claude:                     開発者 B の Claude:
「関連する問題を3件発見しました。           「ログイン + 関連ファイル2件を修正。
進める前にセッションハンドラも               テスト通過。リスク1件: セッション
修正しますか? 各問題の分析は               タイムアウト未カバー。完了。」
以下の通りです...」
```

tenetx がこれを実現します。作業スタイルをプロファイリングし、修正から学習し、Claude が毎セッション従うパーソナライズされたルールをレンダリングします。

---

## tenetx を使うと起こること

### 初回実行（1回のみ、約1分）

```bash
npm install -g tenetx
tenetx
```

初回実行を検出すると、4問のオンボーディングが始まります。各質問は具体的なシナリオです:

```
  Q1: Ambiguous implementation request

  You receive "improve the login feature." Requirements are
  unclear and adjacent modules may be affected.

  A) Clarify requirements/scope first. Ask if scope expansion is possible.
  B) Proceed if within same flow. Check when major scope expansion appears.
  C) Make reasonable assumptions and fix adjacent files directly.

  Choice (A/B/C):
```

4つの質問。4つの軸を測定。各軸にパックときめ細かなファセットを含むプロファイルが作成されます。パーソナライズされたルールファイルがレンダリングされ、Claude が読み取る場所に配置されます。

### 毎セッション（日常使用）

```bash
tenetx                    # `claude` の代わりに使用
```

内部の動作:

1. ハーネスが `~/.tenetx/me/forge-profile.json` からプロファイルをロード
2. プリセットマネージャがセッションを合成: グローバル安全ルール + パック基本ルール + 個人オーバーレイ + セッションオーバーレイ
3. ルールレンダラがすべてを自然言語に変換し、`~/.claude/rules/v1-rules.md` に書き込み
4. Claude Code が起動し、それらのルールを行動指針として読み取る
5. セーフティフックが有効化: 危険なコマンドのブロック、シークレットのフィルタリング、プロンプトインジェクションの検出

### Claude を修正するとき

あなたが言います: 「頼んでいないファイルをリファクタリングしないで。」

Claude が `correction-record` MCP ツールを呼び出します。修正は、軸分類（`judgment_philosophy`）、種類（`avoid-this`）、信頼度スコアを含む構造化されたエビデンスとして保存されます。現在のセッションに即座に効果を持つ一時ルールが作成されます。

### セッション間（自動）

セッション終了時に auto-compound が抽出します:
- ソリューション（コンテキスト付きの再利用可能なパターン）
- 行動観察（あなたの作業の仕方）
- セッション学習サマリー

蓄積されたエビデンスに基づいてファセットが微調整されます。修正が継続的に現在のパックと異なる方向を指している場合、3セッション後にミスマッチ検出がトリガーされ、パック変更を提案します。

### 次のセッション

修正が反映された更新ルールがレンダリングされます。Compound 知識が MCP 経由で検索可能になります。Claude が「あなたの」Claude になっていきます。

---

## クイックスタート

```bash
# 1. インストール
npm install -g tenetx

# 2. 初回実行 — 4問オンボーディング（英語/韓国語選択）
tenetx

# 3. 以降毎日
tenetx
```

### 前提条件

- **Node.js** >= 20（SQLite セッション検索には >= 22 を推奨）
- **Claude Code** インストール・認証済み（`npm i -g @anthropic-ai/claude-code`）

---

## 仕組み

### 学習ループ

```
                          +-------------------+
                          | オンボーディング    |
                          |   （4問）          |
                          +--------+----------+
                                   |
                                   v
                   +-------------------------------+
                   |      プロファイル作成           |
                   |  4軸 x パック + ファセット + trust |
                   +-------------------------------+
                                   |
           +-----------------------+------------------------+
           |                                                |
           v                                                |
  +------------------+                                      |
  | ルールレンダリング |   ~/.claude/rules/v1-rules.md        |
  | Claude 形式に変換 |                                      |
  +--------+---------+                                      |
           |                                                |
           v                                                |
  +------------------+                                      |
  | セッション実行    |   Claude がパーソナライズルールに従う    |
  |   修正すると     | ---> correction-record MCP            |
  |   Claude が学習  |      エビデンス保存                    |
  +--------+---------+      一時ルール作成                    |
           |                                                |
           v                                                |
  +------------------+                                      |
  | セッション終了    |   auto-compound 抽出:                 |
  |                  |   ソリューション + 観察 + サマリー       |
  +--------+---------+                                      |
           |                                                |
           v                                                |
  +------------------+                                      |
  | ファセット調整    |   プロファイル微調整                    |
  | ミスマッチ確認    |   直近3セッション rolling 分析          |
  +--------+---------+                                      |
           |                                                |
           +------------------------------------------------+
                    （次のセッション: 更新されたルール）
```

### Compound 知識

知識はセッションを跨いで蓄積され、検索可能になります:

| 種類 | ソース | Claude の活用方法 |
|------|--------|------------------|
| **ソリューション** | セッションから抽出 | MCP 経由の `compound-search` |
| **スキル** | 検証済みソリューションから昇格 | スラッシュコマンドとして自動ロード |
| **行動パターン** | 3回以上の観察で自動検出 | `forge-behavioral.md` に適用 |
| **エビデンス** | 修正 + 観察 | ファセット調整の根拠 |

---

## 4軸パーソナライゼーション

各軸には3つのパックがあります。各パックにはきめ細かなファセット（0-1の数値）が含まれ、修正に応じて時間とともに微調整されます。

### 品質/安全性

| パック | Claude の振る舞い |
|--------|-----------------|
| **堅実型** | 完了報告前にすべてのテストを実行。型チェック。エッジケース検証。すべてのチェックが通過するまで「完了」と言わない。 |
| **バランス型** | 主要な検証を実行し、残りのリスクを要約。徹底さと速度のバランス。 |
| **スピード型** | クイックスモークテスト。結果とリスクを即座に報告。納品を優先。 |

### 自律性

| パック | Claude の振る舞い |
|--------|-----------------|
| **確認優先型** | 隣接ファイルの変更前に確認。あいまいな要件を明確化。スコープ拡大に承認を要求。 |
| **バランス型** | 同じフロー内なら進行。大きなスコープ拡大が見えたら確認。 |
| **自律実行型** | 合理的に仮定。関連ファイルを直接修正。完了後に何をしたか報告。 |

### 判断哲学

| パック | Claude の振る舞い |
|--------|-----------------|
| **最小変更型** | 既存構造を維持。動作するコードをリファクタリングしない。修正範囲を最小限に保つ。 |
| **バランス型** | 現在のタスクに集中。明確な改善機会が見えたら提案。 |
| **構造的アプローチ型** | 繰り返しパターンや技術的負債を発見したら積極的に構造改善を提案。抽象化と再利用設計を好む。アーキテクチャの一貫性を維持。 |

### コミュニケーション

| パック | Claude の振る舞い |
|--------|-----------------|
| **簡潔型** | コードと結果のみ。先回りして説明しない。聞かれた時だけ補足。 |
| **バランス型** | 主要な変更と理由を要約。必要に応じてフォローアップを促す。 |
| **詳細型** | 何を、なぜ、影響範囲、代替案まで説明。教育的コンテキストを提供。レポートをセクション構造で整理。 |

---

## レンダリングされたルールの実際の様子

tenetx がセッションを合成すると、Claude が読む `v1-rules.md` ファイルをレンダリングします。異なるプロファイルがまったく異なる Claude の振る舞いを生み出す2つの実例です。

### 例1: 堅実型 + 確認優先型 + 構造的アプローチ型 + 詳細型

```markdown
[Conservative quality / Confirm-first autonomy / Structural judgment / Detailed communication]

## Must Not
- Never commit or expose .env, credentials, or API keys.
- Never execute destructive commands (rm -rf, DROP, force-push) without user confirmation.

## Working Defaults
- Trust: Dangerous bypass disabled. Always confirm before destructive commands or sensitive path access.
- Proactively suggest structural improvements when you spot repeated patterns or tech debt.
- Prefer abstraction and reusable design, but avoid over-abstraction.
- Maintain architectural consistency across changes.

## When To Ask
- Clarify requirements before starting ambiguous tasks.
- Ask before modifying files outside the explicitly requested scope.

## How To Validate
- Run all related tests, type checks, and key verifications before reporting completion.
- Do not say "done" until all checks pass.

## How To Report
- Explain what changed, why, impact scope, and alternatives considered.
- Provide educational context — why this approach is better, compare with alternatives.
- Structure reports: changes, reasoning, impact, next steps.

## Evidence Collection
- When the user corrects your behavior ("don't do that", "always do X", "stop doing Y"), call the correction-record MCP tool to record it as evidence.
- kind: fix-now (immediate fix), prefer-from-now (going forward), avoid-this (never do this)
- axis_hint: quality_safety, autonomy, judgment_philosophy, communication_style
- Do not record general feedback — only explicit behavioral corrections.
```

### 例2: スピード型 + 自律実行型 + 最小変更型 + 簡潔型

```markdown
[Speed-first quality / Autonomous autonomy / Minimal-change judgment / Concise communication]

## Must Not
- Never commit or expose .env, credentials, or API keys.
- Never execute destructive commands (rm -rf, DROP, force-push) without user confirmation.

## Working Defaults
- Trust: Minimal runtime friction. Free execution except explicit bans and destructive commands.
- Preserve existing code structure. Do not refactor working code unnecessarily.
- Keep modification scope minimal. Change adjacent files only when strictly necessary.
- Secure evidence (tests, error logs) before making changes.

## How To Validate
- Quick smoke test. Report results and risks immediately.

## How To Report
- Keep responses short and to the point. Focus on code and results.
- Only elaborate when asked. Do not proactively write long explanations.

## Evidence Collection
- When the user corrects your behavior ("don't do that", "always do X", "stop doing Y"), call the correction-record MCP tool to record it as evidence.
- kind: fix-now (immediate fix), prefer-from-now (going forward), avoid-this (never do this)
- axis_hint: quality_safety, autonomy, judgment_philosophy, communication_style
- Do not record general feedback — only explicit behavioral corrections.
```

同じ Claude。同じコードベース。まったく異なる作業スタイル。1分間のオンボーディングが生み出す違いです。

---

## コマンド

### コア

```bash
tenetx                          # パーソナライズされた Claude Code を起動
tenetx "ログインのバグを修正して"  # プロンプト付きで起動
tenetx --resume                 # 前回のセッションを再開
```

### パーソナライゼーション

```bash
tenetx onboarding               # 4問オンボーディングを実行
tenetx forge --profile          # 現在のプロファイルを表示
tenetx forge --reset soft       # プロファイルをリセット (soft / learning / full)
tenetx forge --export           # プロファイルをエクスポート
```

### 状態確認

```bash
tenetx inspect profile          # 4軸プロファイル + パック + ファセット
tenetx inspect rules            # アクティブ/抑制されたルール
tenetx inspect evidence         # 修正履歴
tenetx inspect session          # 現在のセッション状態
tenetx me                       # パーソナルダッシュボード（inspect profile のショートカット）
```

### 知識管理

```bash
tenetx compound                 # 蓄積された知識をプレビュー
tenetx compound --save          # 自動分析されたパターンを保存
tenetx skill promote <名前>     # 検証済みソリューションをスキルに昇格
tenetx skill list               # 昇格されたスキルの一覧
```

### システム

```bash
tenetx init                     # プロジェクトを初期化
tenetx doctor                   # システム診断
tenetx config hooks             # フック状態を確認
tenetx config hooks --regenerate # フックを再生成
tenetx mcp                      # MCP サーバー管理
tenetx uninstall                # tenetx をきれいに削除
```

### MCP ツール（セッション中に Claude が使用可能）

| ツール | 目的 |
|--------|------|
| `compound-search` | クエリで蓄積された知識を検索 |
| `compound-read` | ソリューション全文を読む |
| `compound-list` | フィルタ付きソリューション一覧 |
| `compound-stats` | 概要統計 |
| `session-search` | 過去のセッション会話を検索（SQLite FTS5、Node.js 22+） |
| `correction-record` | ユーザー修正を構造化されたエビデンスとして記録 |

---

## アーキテクチャ

```
~/.tenetx/                           パーソナライゼーションホーム
|-- me/
|   |-- forge-profile.json           4軸プロファイル (パック + ファセット + trust)
|   |-- rules/                       ルールストア (ルールごとの JSON ファイル)
|   |-- behavior/                    エビデンスストア (修正 + 観察)
|   |-- recommendations/             パック推薦 (オンボーディング + ミスマッチ)
|   +-- solutions/                   Compound 知識
|-- state/
|   |-- sessions/                    セッション状態スナップショット
|   +-- raw-logs/                    Raw セッションログ (7日 TTL 自動クリーンアップ)
+-- config.json                      グローバル設定 (locale, trust, packs)

~/.claude/
|-- settings.json                    フック + 環境変数 (ハーネスが注入)
|-- rules/
|   |-- forge-behavioral.md          学習された行動パターン (自動生成)
|   +-- v1-rules.md                  レンダリングされたパーソナライゼーションルール (セッションごと)
|-- commands/tenetx/                 スラッシュコマンド (昇格されたスキル)
+-- .claude.json                     MCP サーバー登録

~/.compound/                         レガシー compound ホーム (フック/MCP がまだ参照)
|-- me/
|   |-- solutions/                   蓄積された compound 知識
|   |-- behavior/                    行動パターン
|   +-- skills/                      昇格されたスキル
+-- sessions.db                      SQLite セッション履歴 (Node.js 22+)
```

### データフロー

```
forge-profile.json                   パーソナライゼーションの単一真実源
        |
        v
preset-manager.ts                    セッション状態を合成:
  グローバル安全ルール                    hard constraint (常にアクティブ)
  + ベースパックルール                    プロファイルパックから
  + 個人オーバーレイ                     修正生成ルールから
  + セッションオーバーレイ                現在セッションの一時ルール
  + ランタイム能力検出                    trust ポリシー調整
        |
        v
rule-renderer.ts                     Rule[] を自然言語に変換:
  フィルタ (active のみ)                パイプライン: filter -> dedupe -> group ->
  dedupe (render_key)                  order -> template -> budget (4000文字)
  カテゴリ別グループ
  順序: Must Not -> Working Defaults -> When To Ask -> How To Validate -> How To Report
        |
        v
~/.claude/rules/v1-rules.md         Claude が実際に読むファイル
```

---

## セーフティ

セーフティフックは `settings.json` に自動登録され、Claude のすべてのツール呼び出し時に実行されます。

| フック | トリガー | 機能 |
|--------|---------|------|
| **pre-tool-use** | すべてのツール実行前 | `rm -rf`、`curl\|sh`、`--force` push、危険なパターンをブロック |
| **db-guard** | SQL 操作 | `DROP TABLE`、`WHERE` なし `DELETE`、`TRUNCATE` をブロック |
| **secret-filter** | ファイル書き込み、出力 | API キー、トークン、認証情報の露出時に警告 |
| **slop-detector** | コード生成後 | TODO 残骸、`eslint-disable`、`as any`、`@ts-ignore` を検出 |
| **prompt-injection-filter** | すべての入力 | パターン + ヒューリスティックによるプロンプトインジェクションのブロック |
| **context-guard** | セッション中 | コンテキストウィンドウの上限に近づいた時に警告 |
| **rate-limiter** | MCP ツール呼び出し | 過度な MCP ツール呼び出しを防止 |

安全ルールは**ハード制約**です -- パック選択や修正で上書きできません。レンダリングされたルールの「Must Not」セクションは、プロファイルに関係なく常に存在します。

---

## 主要な設計判断

- **4軸プロファイル、設定トグルではない。** 各軸にはパック（大分類）とファセット（0-1の数値によるきめ細かな調整）があります。パックは安定した振る舞いを提供し、ファセットは完全な再分類なしで微調整を可能にします。

- **エビデンスベースの学習、正規表現マッチングではない。** 修正は構造化されたデータ（`CorrectionRequest`: kind, axis_hint, message）です。Claude が分類し、アルゴリズムが適用します。ユーザー入力に対するパターンマッチングはありません。

- **パック + オーバーレイモデル。** ベースパックが安定したデフォルトを提供。修正から生成された個人オーバーレイがその上に重なります。セッションオーバーレイは一時ルール用。競合解決: セッション > 個人 > パック（グローバル安全は常にハード制約）。

- **自然言語でレンダリングされたルール。** `v1-rules.md` ファイルには設定ではなく英語（または韓国語）の文章が含まれます。Claude は「動作するコードを不必要にリファクタリングするな」のような指示を読みます -- 人間のメンターがガイダンスを与えるのと同じ方法です。

- **ミスマッチ検出。** 直近3セッションのローリング分析で、修正が継続的に現在のパックと異なる方向を指しているかを確認します。検出された場合、静かにドリフトするのではなく、パックの再推薦を提案します。

- **ランタイム trust 計算。** 希望する trust ポリシーが Claude Code の実際のランタイム権限モードと調整されます。Claude Code が `--dangerously-skip-permissions` で実行される場合、tenetx は effective trust レベルをそれに応じて調整します。

- **国際化。** 英語と韓国語を完全サポート。オンボーディング時に言語を選択すると、オンボーディングの質問、レンダリングされたルール、CLI 出力全体に適用されます。

---

## 共存

tenetx はインストール時に他の Claude Code プラグイン（oh-my-claudecode、superpowers、claude-mem）を検出し、重複するフックを無効化します。コアのセーフティフックと compound フックは常にアクティブを維持します。

---

## ライセンス

MIT
