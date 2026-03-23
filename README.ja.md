<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.svg" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>使うほど、あなたに合わせるAIコーディングツール</strong>
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.zh.md">简体中文</a>
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> &middot;
  <a href="#コア機能">コア機能</a> &middot;
  <a href="#アーキテクチャ">アーキテクチャ</a> &middot;
  <a href="#統計">統計</a>
</p>

---

## Tenetx とは？

Tenetx は [Claude Code](https://docs.anthropic.com/en/docs/claude-code) のための**パーソナライズ型AIコーディングハーネス**です。

プロジェクトをスキャンし、あなたにインタビューし、5次元のプロファイルを生成し、そのプロファイルに基づいてエージェント、スキル、フック、ルールの設定を自動生成します。使い続けるほど、あなたの開発スタイルを学習し、ツールが進化していきます。

```
$ claude                        $ tenetx
|                                |
| Default Claude Code            | Tenetx が先に起動
| 汎用の設定                      |  ├── Forge: プロファイル生成
|                                |  ├── Lab: 使用パターンを検出
|                                |  ├── 最適な設定を自動適用
|                                |  └── Claude Code を起動（あなた仕様）
|                                |
| 誰にでも同じツール               | あなただけのツール
```

**Tenetx は Claude Code をフォークしません。** Claude Code が読み込む設定（hooks、CLAUDE.md、settings）を、あなたのプロファイルに合わせて構成するだけです。

### なぜ Tenetx なのか？

- **パーソナライズ優先**: Forge がプロジェクト + 開発者を分析し、5次元プロファイルを自動生成。汎用設定は不要。
- **自律的に進化**: Lab が使用パターンを追跡し、8種類の検出器でプロファイルを自動更新。閉ループで成長する。
- **共有と再利用**: Remix で他の開発者のハーネスから必要なコンポーネントだけを取り込める。
- **マルチモデル統合**: Claude / Codex / Gemini の回答に信頼度スコアを付与し、最適な結果を合成する。

---

---

## クイックスタート

### 前提条件

- **Node.js** >= 18
- **Claude Code** がインストール・認証済みであること

### Forge フロー（推奨）

```bash
# 1. インストール
npm install -g tenetx

# 2. Forge を実行 — プロジェクトスキャン + インタビュー → プロファイル生成
tenetx forge

# 3. 生成されたプロファイルで Claude Code を起動
tenetx
```

Forge は以下のステップを実行します:

1. プロジェクト構造をスキャンし、技術スタック、規模、複雑度を把握
2. あなたの開発スタイル、優先事項、リスク許容度についてインタビュー
3. 5次元プロファイルを生成
4. プロファイルに基づいてエージェント、スキル、フック、ルールの設定を自動出力

### 従来のセットアップ

```bash
# 質問ベースの簡易セットアップ（3問、30秒）
tenetx setup

# 哲学を適用して Claude Code を起動
tenetx
```

### Claude Code プラグインとして

```bash
tenetx install --plugin
```

### 動作イメージ

<p align="center">
  <img src="assets/demo-preview.svg" alt="Tenetx in action" width="700"/>
</p>

> フルデモを録画するには [VHS](https://github.com/charmbracelet/vhs) をインストールして `vhs demo/demo.tape` を実行してください。

---

## コア機能

### 1. Forge -- パーソナライズドプロファイル生成

Forge はプロジェクトスキャンとインタビューを組み合わせて、あなた専用の5次元プロファイルを生成します。

```bash
tenetx forge
```

**5次元プロファイル:**

| 次元 | 内容 | 例 |
|------|------|-----|
| 품질 초점 (qualityFocus) | スピード vs 徹底性 | 高品質重視、網羅的レビュー |
| 자율성 선호 (autonomyPreference) | 監視 vs 自律 | 自律寄り、確認ステップ削減 |
| 위험 감수도 (riskTolerance) | 保守 vs 積極 | 保守的、小さなPR単位 |
| 추상화 수준 (abstractionLevel) | 実用主義 vs アーキテクチャ優先 | 直接実装、過度な抽象化を避ける |
| 커뮤니케이션 스타일 (communicationStyle) | 詳細 vs 簡潔 | 簡潔な応答、冗長さを排除 |

プロファイルに基づいて以下が自動生成されます:
- **エージェント設定**: あなたのドメインに最適化されたエージェント構成
- **スキル優先度**: よく使うワークフローに合わせたスキルの重み付け
- **フック設定**: コーディングスタイルに合った警告・自動アクション
- **ルール設定**: リスク許容度に基づくガードレール

### 2. Lab -- 自動進化エンジン

Lab はあなたの使用パターンをバックグラウンドで追跡し、8種類のパターン検出器でプロファイルを自動更新します。

```bash
# Lab の状態を確認
tenetx lab status

# 検出されたパターンを表示
tenetx lab patterns

# 進化提案を確認・適用
tenetx lab evolve
```

**8種類のパターン検出器:**

| 検出器 | 検出対象 | 適用例 |
|--------|----------|--------|
| 編集パターン | 頻繁に編集するファイル種別 | そのファイル種別向けのルール強化 |
| コマンド頻度 | よく使うコマンドの傾向 | ショートカットやエイリアスを提案 |
| エラー再発 | 繰り返し発生するエラー | 予防ルールを自動生成 |
| モデル選択 | タスク別のモデル利用傾向 | ルーティングテーブルを最適化 |
| 時間帯分析 | 集中力が高い時間帯 | 通知タイミングを調整 |
| セッション長 | 平均的なセッションの長さ | コンパクション閾値を調整 |
| スキル利用 | 頻繁に使うスキル | 起動時に優先ロード |
| レビュー傾向 | 修正が多い領域 | その領域のチェックを強化 |

Lab は「検出 → 提案 → 承認 → 適用」の閉ループで動作します。プロファイルは勝手に変更されず、常にあなたの承認を経て更新されます。

### 3. Remix -- コンポーネント単位の再利用

他の開発者が公開しているハーネス設定から、必要なコンポーネントだけをチェリーピックで取り込めます。

```bash
# 公開ハーネスを検索
tenetx remix search "react performance"

# 特定のコンポーネントだけを取り込む
tenetx remix pick @user/harness --agents architect,verifier
tenetx remix pick @user/harness --hooks pre-commit
tenetx remix pick @user/harness --rules security

# 取り込んだコンポーネントを確認
tenetx remix list
```

フォーク全体をコピーするのではなく、エージェント、スキル、フック、ルールをコンポーネント単位で選択的にインポートします。取り込んだ設定は自分のプロファイルにマージされ、既存の設定と競合する場合は確認が求められます。

### 4. Me ダッシュボード -- プロファイル可視化

`tenetx me` でプロファイルの現在状態、進化の履歴、検出されたパターンを一覧表示します。

```bash
tenetx me
```

表示される内容:
- **プロファイルサマリー**: 5次元の現在値をレーダーチャートで表示
- **進化ログ**: Lab による変更履歴（いつ、何が、なぜ変わったか）
- **パターン統計**: 検出されたパターンの頻度と傾向
- **設定マップ**: 現在アクティブなエージェント、スキル、フック、ルールの全体像

### 5. コードインテリジェンス (AST + LSP)

インストール済みのツールと連携し、実際のコード構造を理解します。

**AST-grep** — 正規表現ではなく構文木ベースのコード検索:

```bash
tenetx ast search "function $NAME($$$)" --lang ts   # 関数検索
tenetx ast classes                                    # クラス一覧
tenetx ast calls handleForge                          # 呼び出し箇所検索
```

`sg` 未インストール時は正規表現にフォールバック。TypeScript、Python、Go、Rust 対応。

**LSP** — 言語サーバー統合による型認識操作:

```bash
tenetx lsp status                              # 検出されたサーバー
tenetx lsp hover src/forge/types.ts 14 10      # 型情報
tenetx lsp definition src/cli.ts 50 20         # 定義へジャンプ
```

tsserver、pylsp、gopls、rust-analyzer を自動検出。未インストール時は優雅にフォールバック。

### 6. マルチモデル合成 -- 信頼度スコアリング

Claude、Codex、Gemini など複数のモデルに同じタスクを投げ、それぞれの回答に信頼度スコアを付与して最適な結果を合成します。

```bash
# 複数モデルで比較
tenetx ask "この関数のパフォーマンスを改善するには？" --compare

# フォールバック付きで質問
tenetx ask "セキュリティレビュー" --fallback
```

**信頼度スコアリングの仕組み:**

1. 同一タスクを複数モデルに送信
2. 各回答にコード正確性、説明品質、実行可能性のスコアを付与
3. スコアが高い部分を組み合わせて合成結果を生成
4. 矛盾する回答がある場合は両方を提示し、選択を促す

プロバイダーの管理:

```bash
tenetx providers                     # 設定済みプロバイダーを一覧表示
tenetx providers enable codex        # Codex を有効化
tenetx providers model gemini flash  # Gemini のモデルを指定
```

---

## 実行モード

各モードは異なるワークフローに最適化されています。

| フラグ | モード | 内容 |
|------|------|-------------|
| `-a` | **autopilot** | 5段階自律パイプライン（explore → plan → implement → QA → verify） |
| `-r` | **ralph** | PRDベースの完遂保証（verify/fixループ付き） |
| `-t` | **team** | 専門ロール付きマルチエージェント並列パイプライン |
| `-u` | **ultrawork** | 最大並列バースト |
| `-p` | **pipeline** | 順次ステージ処理 |
| | **ccg** | 3モデルクロスバリデーション |
| | **ralplan** | コンセンサスベース設計（Planner → Architect → Critic） |
| | **deep-interview** | ソクラテス式要件明確化 |
| | **tdd** | テスト駆動開発モード |

```bash
tenetx --autopilot "ユーザー認証を実装"
tenetx --ralph "決済連携を完了"
tenetx --team "ダッシュボードを再設計"
tenetx deep-interview "本質的な課題は何か？"
```

### マジックキーワード

プロンプト内のどこでも入力できます。フラグは不要です。

```
autopilot <タスク>      autopilot モードを有効化
ralph <タスク>          ralph モードを有効化
ultrawork <タスク>      最大並列処理
tdd                     テスト駆動開発モード
ultrathink              拡張推論
deepsearch              コードベース深掘り検索
ccg                     3モデルクロスバリデーション
deep-interview          ソクラテス式要件明確化
canceltenetx             すべてのアクティブモードをキャンセル
```

---

## モデルルーティング

Tenetx は 16シグナルスコアリングでタスクを最適なモデル層に自動ルーティングします。

```
┌─────────┬─────────────────────────────────────┐
│  Haiku  │  explore, file-search, simple-qa    │
├─────────┼─────────────────────────────────────┤
│ Sonnet  │  code-review, analysis, design      │
├─────────┼─────────────────────────────────────┤
│  Opus   │  implement, architect, debug        │
└─────────┴─────────────────────────────────────┘
```

ルーティングは語彙的・構造的・文脈的・パターンベースの16シグナルで駆動されます。Lab が検出した使用傾向に基づき、ルーティングテーブルは自動的に最適化されます。

---

## パックシステム

ナレッジは3つのスコープに存在し、時間とともに蓄積されます。

| スコープ | 場所 | 読み込みタイミング |
|-------|----------|-------------|
| **Me** | `~/.compound/me/` | 常時 |
| **Team** | `~/.compound/packs/<name>/` | チームリポジトリ内 |
| **Project** | `{repo}/.compound/` | そのリポジトリ内 |

```bash
# チームナレッジパックをインストール
tenetx pack install https://github.com/your-org/pack-backend

# 最新ナレッジを同期
tenetx pack sync

# 解決策を個人コレクションにチェリーピック
tenetx pick api-caching --from backend

# 個人パターンをチームに提案
tenetx propose retry-pattern --to backend

# パック内容を表示
tenetx pack list
```

**パック継承**: philosophy.yaml の `extends` で別パックのルールを継承できます。

```yaml
extends:
  - github: https://github.com/your-org/tenetx-pack-core
  - local: ~/mycompany-standards
```

---

## エージェント

19のエージェントが3レーンに編成されています。

| レーン | エージェント | 目的 |
|------|--------|---------|
| **BUILD** | explore → analyst → planner → architect → debugger → executor → verifier → code-simplifier → refactoring-expert | 探索 → 実装 → 検証 |
| **REVIEW** | code-reviewer, security-reviewer, critic | 品質保証（3エージェント） |
| **DOMAIN** | designer, test-engineer, writer, qa-tester, performance-reviewer, scientist, git-master | 専門知識（7エージェント） |

Forge はあなたのプロファイルに基づいて、各エージェントの起動優先度と振る舞いをカスタマイズします。たとえば、セキュリティ重視のプロファイルでは security-reviewer が早い段階で起動し、チェック項目も厳格になります。

---

## アーキテクチャ

<p align="center">
  <img src="assets/architecture.svg" alt="Tenetx Architecture" width="100%"/>
</p>

Tenetx は4層構造で設計されています。

### レイヤー0: Profile（WHO）

あなたのプロファイルがすべての出発点です。Forge によって生成され、Lab によって継続的に更新される5次元プロファイルが、下位レイヤーすべての振る舞いを決定します。

### レイヤー1: Adapt（LEARN）

Lab の8種類のパターン検出器がセッションデータを分析し、プロファイルの進化提案を生成します。検出から適用までの閉ループにより、ツールは使うほど賢くなります。

### レイヤー2: How（EXECUTE）

プロファイルに基づいて実行環境を構成するエンジン層です。

- **9実行モード** -- シンプルなチャットから完全自律パイプラインまで
- **21スキル** -- autopilot, ralph, team, ultrawork, pipeline, ccg, ralplan, deep-interview, tdd, code-review, security-review, compound, debug-detective, ecomode, git-master, migrate, pack-builder, ralph-craft, cancel-ralph, refactor, benchmark
- **3層モデルルーティング** -- Haiku / Sonnet / Opus（16シグナルスコアリング）
- **19次元チューニング済みエージェント** -- 3レーン構成
- **17フック** -- UserPromptSubmit, SessionStart, PreToolUse, PostToolUse, PostToolFailure, PreCompact ほか
- **10イベントタイプ** -- 包括的な可観測性
- **3セキュリティフック** -- permission-handler, secret-filter, db-guard
- **リアルタイムモニター** -- コスト、編集数、コンテキスト使用量の追跡

### レイヤー3: Share（GROW）

Remix によるコンポーネント単位の共有と、パックシステムによるチーム間ナレッジ蓄積を担うレイヤーです。

- **パックシステム**: Me / Team / Project の3スコープ
- **Remix**: 他者のハーネスからコンポーネント単位で取り込み
- **Compound ループ**: セッションからパターン、解決策、ルール、ゴールデンプロンプトを抽出
- **提案システム**: 個人ナレッジをチームに提案、レビュー、マージ

---

## 全コマンド（45+）

### コア

| コマンド | 用途 |
|---------|---------|
| `tenetx` | ハーネスを適用して起動 |
| `tenetx "prompt"` | プロンプト付きで起動 |
| `tenetx setup` | 初期セットアップ（グローバル） |
| `tenetx setup --project` | プロジェクト固有の設定 |
| `tenetx --resume` | 前のセッションを再開 |
| `tenetx init` | プロジェクトタイプを自動検出して初期化 |
| `tenetx init --team` | チームパックを初期化 |

### Forge / Lab / Remix / Me

| コマンド | 用途 |
|---------|---------|
| `tenetx forge` | プロファイル生成（スキャン + インタビュー） |
| `tenetx lab status` | Lab の状態を確認 |
| `tenetx lab patterns` | 検出されたパターンを表示 |
| `tenetx lab evolve` | 進化提案を確認・適用 |
| `tenetx remix search <query>` | 公開ハーネスを検索 |
| `tenetx remix pick <source>` | コンポーネントを取り込む |
| `tenetx remix list` | 取り込み済みコンポーネントを一覧表示 |
| `tenetx me` | プロファイルダッシュボードを表示 |

### パック管理

| コマンド | 用途 |
|---------|---------|
| `tenetx pack install <source>` | パックをインストール（GitHub URL、ローカルパス対応） |
| `tenetx pack sync [name]` | 全パックまたは指定パックを同期 |
| `tenetx pack setup <source>` | ワンクリックセットアップ（install → connect → sync） |
| `tenetx pack list` / `connected` / `outdated` | パックの一覧表示・状態確認 |
| `tenetx pick` / `propose` / `proposals` | ナレッジのチェリーピック・チーム提案・レビュー |
| `tenetx compound` | セッションインサイトを抽出（個人/チーム自動分類） |

### その他

| コマンド | 用途 |
|---------|---------|
| `tenetx ask "question"` | マルチプロバイダー質問（`--compare`, `--fallback`） |
| `tenetx providers` | AIプロバイダーを管理 |
| `tenetx dashboard` / `stats` / `status` | セッション監視・統計 |
| `tenetx mcp` / `marketplace` | MCPサーバー・プラグイン管理 |
| `tenetx scan` / `verify` / `doctor` | プロジェクトスキャン・検証・診断 |
| `tenetx notify` / `wait` | 通知送信・レート制限待機 |

---

## 統計

- **1465テスト**（92テストファイル、100%パス）
- **19次元チューニング済みエージェント**（3レーン: BUILD 9、REVIEW 3、DOMAIN 7）
- **21スキル**、9実行モード
- **17フック**、10イベントタイプ、3セキュリティフック
- **8組み込みMCPサーバー**（実行可能、JSON-RPC 2.0）
- **16シグナルモデルルーティング**（Haiku/Sonnet/Opus）
- **8パターン検出器**（Lab 自動進化エンジン）
- **5次元プロファイル**（Forge パーソナライズ生成）
- **マルチモデル信頼度合成**（Claude / Codex / Gemini）
- **45+ CLIコマンド**

---

## 謝辞

Tenetx は Yeachan Heo による [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) から多大なインスピレーションを受けています。マルチエージェントオーケストレーションパターン、マジックキーワードシステム、実行モード、そして Claude Code をハーネスレイヤーで強化するという全体的なビジョンは、OMC の先駆的な取り組みから深く影響を受けています。

oh-my-claudecode から採用した主要概念:
- 専門ロールを持つマルチエージェントオーケストレーション
- 実行モード（autopilot、ralph、team、ultrawork）
- フック経由のマジックキーワード検出
- クロスAI統合のための tmux ベース CLI ワーカー
- セッション監視と通知システム

Tenetx は**パーソナライズ型アプローチ** -- Forge によるプロファイル生成、Lab による自動進化、Remix によるコンポーネント単位の共有 -- によって、使うほど開発者に適応するツールとして差別化されています。

また、Claude Code 向けの事前設定済み開発スイートとして「oh-my-zsh for Claude Code」というアプローチを示した [Claude Forge](https://github.com/sangrokjung/claude-forge) にも感謝します。

---

## ライセンス

MIT
