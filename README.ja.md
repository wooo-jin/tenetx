<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>あなたから学習する Claude Code harness。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
</p>

<p align="center">
  <a href="#クイックスタート">クイックスタート</a> &middot;
  <a href="#仕組み">仕組み</a> &middot;
  <a href="#コマンド">コマンド</a> &middot;
  <a href="README.md">English</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.zh.md">简体中文</a>
</p>

---

## Tenetx とは？

Tenetx は Claude Code を **harness** としてラップします — `claude` を起動し、セッションを監視し、時間の経過とともに Claude をより賢くする**再利用可能な知識を自動蓄積**します。

```bash
npm install -g tenetx
tenetx                    # `claude` の代わりにこれを使う
```

### `tenetx` を使うと起こること:

1. **プロジェクト情報** の自動検出 (TypeScript? Vitest? CI?) → `.claude/rules/project-context.md`
2. **Safety hook** が有効 — 危険なコマンドをブロック、シークレットをフィルタリング
3. **Compound 知識** が検索可能 — Claude が MCP 経由で過去のパターンを能動的に検索
4. **セッション終了** → auto-compound が会話から再利用可能なパターンを抽出
5. **次のセッション** → Claude が蓄積された知識を活用してより良い回答を提供

### ユーザージャーニー

```
npm i -g tenetx          → インストール: hook, MCP, skill が登録される
tenetx forge             → 1回限りの面談: 好みの設定 (グローバル)
tenetx                   → 日常使用: Claude + safety + compound + 自動学習
/compound                → オプション: セッション中に手動でパターン抽出
```

---

## クイックスタート

```bash
# インストール
npm install -g tenetx

# パーソナライズ (1回のみ, オプション)
tenetx forge

# 毎日の使用 (`claude` の代わりに)
tenetx
```

### 前提条件

- **Node.js** >= 22 (組み込み SQLite セッション検索用)
- **Claude Code** インストール・認証済み (`npm i -g @anthropic-ai/claude-code`)

---

## 仕組み

```
tenetx (harness モード)
├── safety hook + プロジェクト情報を付与して claude を起動
├── セッションが通常通り進行 — 普段通りに作業
├── セッション終了 (exit, /new, /compact)
│   ├── Claude が会話を分析 (auto-compound)
│   ├── 再利用可能なパターンを保存 → ~/.compound/me/solutions/
│   └── ユーザーパターンを観察 → ~/.compound/me/behavior/
└── 次のセッション
    ├── MCP 指示が Claude に compound 知識を案内
    ├── Claude が過去のパターンを能動的に検索
    └── 蓄積された知識が回答品質を向上
```

### Compound 知識

知識がセッションを跨いで蓄積されます:

- **Solutions** — 「なぜ」という文脈を持つ再利用可能なパターン
- **Skills** — `tenetx skill promote` で検証済みソリューションから昇格
- **行動パターン** — 観察されたユーザー習慣が `~/.compound/me/behavior/` に自動蓄積、`.claude/rules/forge-behavioral.md` に変換

Claude が MCP ツール (`compound-search` → `compound-read`) でこの知識を検索します。
正規表現マッチングなし — **Claude が何が関連するかを判断**。

### Forge (パーソナライズ)

1回限りの面談で好みを設定します:

```bash
tenetx forge
```

- 作業スタイルに基づいて**グローバルルール** (`~/.claude/rules/forge-*.md`) を生成
- 品質へのこだわり、リスク許容度、コミュニケーションスタイルなど
- **プロジェクトスキャンは事実のみ** — "TypeScript, Vitest, ESLint"（好みの推論なし）

### Safety

有効な hook (settings.json に登録済み):

| Hook | 機能 |
|------|------|
| `pre-tool-use` | 危険なコマンドをブロック (rm -rf, curl\|sh, force-push) |
| `db-guard` | 危険な SQL をブロック (DROP TABLE, WHERE なし DELETE) |
| `secret-filter` | API キー露出を警告 |
| `slop-detector` | AI slop を検出 (TODO の残骸, eslint-disable, as any) |
| `context-guard` | コンテキスト上限接近時に警告 |
| `rate-limiter` | MCP ツールのレート制限 |

セキュリティスキャンは exfiltration・難読化検出とともに**重大度分類** (block/warn) を使用。

---

## コマンド

```bash
tenetx                    # Claude Code を起動 (harness モード)
tenetx forge              # プロフィールのパーソナライズ
tenetx compound           # 蓄積された知識の管理
tenetx compound --save    # 自動分析されたパターンを保存
tenetx skill promote <n>  # 検証済みソリューションを skill に昇格
tenetx skill list         # 昇格された skill の一覧
tenetx me                 # パーソナルダッシュボード
tenetx config hooks       # Hook 管理
tenetx doctor             # システム診断
tenetx uninstall          # tenetx を削除
```

### MCP ツール (セッション中に Claude が使用可能)

| ツール | 目的 |
|--------|------|
| `compound-search` | クエリで蓄積された知識を検索 (内容プレビュー付き) |
| `compound-read` | ソリューションの全文を読む |
| `compound-list` | フィルタ付きソリューション一覧 |
| `compound-stats` | 概要統計 |
| `session-search` | 過去のセッション会話を検索 (トークン化、コンテキストウィンドウ付き) |

---

## アーキテクチャ

```
~/.claude/
├── settings.json          ← hook が登録される (絶対パス)
├── rules/
│   └── forge-*.md         ← グローバルユーザー設定 (面談から)
├── skills/
│   └── {promoted}/SKILL.md ← 昇格された skill (Claude Code が自動認識)
└── .claude.json           ← MCP サーバーが登録される

{project}/
└── .claude/
    ├── rules/
    │   └── project-context.md  ← プロジェクト情報 (自動スキャン)
    └── agents/
        └── ch-*.md             ← メモリ + MCP アクセス付きカスタムエージェント

~/.compound/
├── me/
│   ├── solutions/         ← 蓄積された compound 知識
│   ├── skills/            ← 昇格された skill (tenetx 管理コピー)
│   ├── behavior/          ← 観察されたユーザーパターン → forge-behavioral.md
│   └── forge-profile.json ← パーソナリティ次元
├── sessions.db            ← SQLite セッション履歴 (Node.js 22+ 組み込み)
└── state/                 ← auto-compound の状態
```

### 主要設計上の決定

- **Harness、単なるプラグインではない** — `tenetx` が `claude` を起動し、セッションのライフサイクルを制御
- **Claude が抽出者** — 正規表現パターンマッチングなし; Claude が会話を分析
- **Pull、push ではない** — MCP 指示が Claude に知識検索を促す; 強制注入なし
- **事実、推論ではない** — プロジェクトスキャンは事実収集; 好みは面談からのみ
- **重大度ベースのセキュリティ** — block vs warn 分類で誤検知による知識損失を防止

---

## 共存

Tenetx はインストール時に他のプラグイン (oh-my-claudecode, superpowers, claude-mem) を検出し、重複する workflow hook を無効化します。コアの safety・compound hook は常に有効です。

---

## ライセンス

MIT
