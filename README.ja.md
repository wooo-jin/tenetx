<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.svg" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>コーディングパターンを学習する Claude Code プラグイン。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.zh.md">简体中文</a>
</p>

---

## Tenetx とは？

Tenetx は Claude Code の使い方を観察し、**あなたに合ったルールを自動生成**します。

```bash
npm install -g tenetx
tenetx                    # 学習モードで Claude Code を起動
```

設定不要。普段通り Claude Code を使うだけ — tenetx がバックグラウンドで学習します。

- **1日目**：言語、レスポンススタイル、ワークフローの好みを検出
- **1週目**：観察パターンから `.claude/rules/` を自動生成
- **継続**：パターンが証拠を蓄積。良いパターンは昇格、悪いパターンは自動退役。

### Harness + プラグイン

- **Harness モード** (`tenetx`)：フル体験 — 毎セッション、プロファイル更新、ルール生成、パターン抽出
- **プラグインモード**（`claude` を直接実行）：Hook + MCP が動作し続けます。Harness 実行間も学習継続。

他のプラグイン（OMC、superpowers、claude-mem）と共存 — 重複機能は自動的に譲歩。

---

## 仕組み

```
普段通りコーディング
    ↓
16 の Hook が静かに観察（プロンプトパターン、ツール使用、コード反映）
    ↓
パターン検出 → ソリューション保存 → 証拠追跡
    ↓
コンテキスト圧縮時 → Claude が思考パターンを分析（追加 API コスト 0）
    ↓
次のセッション：パーソナライズされたルールを自動生成 + フィードバック表示
```

### 複利ループ

ソリューションは実際の使用を通じて信頼を獲得します：

| ステータス | 信頼度 | 条件 |
|-----------|--------|------|
| experiment | 0.3 | git diff または Claude 分析から自動抽出 |
| candidate | 0.6 | reflected >= 2, sessions >= 2 |
| verified | 0.8 | reflected >= 4, sessions >= 3 |
| mature | 0.85 | reflected >= 8, sessions >= 5, 30日維持 |

35 の検出パターン（表面 25 + 思考 10）+ 圧縮時 Claude 意味分析。

---

## クイックスタート

```bash
npm install -g tenetx
tenetx                    # フル学習で Claude Code を起動
tenetx forge              # 作業スタイルを分析（オプション）
```

**前提条件：** Node.js >= 20, Claude Code インストール済み

---

## コマンド

```bash
tenetx                    # Harness で起動
tenetx forge              # 作業スタイル分析
tenetx me                 # パーソナルダッシュボード
tenetx compound           # 蓄積された知識の管理
tenetx lab                # 適応型最適化
tenetx doctor             # システム診断
```

---

## お問い合わせ

- **作者：** Woojin Jang
- **GitHub：** [@wooo-jin](https://github.com/wooo-jin)

## ライセンス

MIT
