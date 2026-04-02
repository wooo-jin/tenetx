<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>从你身上学习的 Claude Code harness。</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/tenetx"><img src="https://img.shields.io/npm/v/tenetx.svg" alt="npm version"/></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"/></a>
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> &middot;
  <a href="#工作原理">工作原理</a> &middot;
  <a href="#命令">命令</a> &middot;
  <a href="README.md">English</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.ja.md">日本語</a>
</p>

---

## 什么是 Tenetx？

Tenetx 将 Claude Code 包装为一个 **harness** — 它启动 `claude`，监控你的会话，并**自动积累可复用的知识**，使 Claude 随着时间推移对你越来越有帮助。

```bash
npm install -g tenetx
tenetx                    # 用这个替代 `claude`
```

### 使用 `tenetx` 时会发生什么:

1. **项目信息** 自动检测 (TypeScript? Vitest? CI?) → `.claude/rules/project-context.md`
2. **Safety hook** 激活 — 阻止危险命令，过滤敏感信息
3. **Compound 知识** 可搜索 — Claude 通过 MCP 主动搜索过去的模式
4. **会话结束** → auto-compound 从对话中提取可复用模式
5. **下次会话** → Claude 利用积累的知识提供更好的回答

### 用户旅程

```
npm i -g tenetx          → 安装: 注册 hook、MCP、skill
tenetx forge             → 一次性访谈: 设置你的偏好 (全局)
tenetx                   → 日常使用: Claude + safety + compound + 自动学习
/compound                → 可选: 会话中手动提取模式
```

---

## 快速开始

```bash
# 安装
npm install -g tenetx

# 个性化 (一次性, 可选)
tenetx forge

# 日常使用 (替代 `claude`)
tenetx
```

### 前提条件

- **Node.js** >= 22 (用于内置 SQLite 会话搜索)
- **Claude Code** 已安装并通过认证 (`npm i -g @anthropic-ai/claude-code`)

---

## 工作原理

```
tenetx (harness 模式)
├── 携带 safety hook + 项目信息启动 claude
├── 会话正常进行 — 像平时一样工作
├── 会话结束 (exit, /new, /compact)
│   ├── Claude 分析对话 (auto-compound)
│   ├── 可复用模式保存至 ~/.compound/me/solutions/
│   └── 观察到的用户模式 → ~/.compound/me/behavior/
└── 下次会话
    ├── MCP 指令引导 Claude 了解 compound 知识
    ├── Claude 主动搜索过去的模式
    └── 积累的知识改善回答质量
```

### Compound 知识

知识跨会话积累:

- **Solutions** — 带有"为什么"上下文的可复用模式
- **Skills** — 通过 `tenetx skill promote` 从已验证的 solution 晋升
- **行为模式** — 观察到的用户习惯自动积累至 `~/.compound/me/behavior/`，转换为 `.claude/rules/forge-behavioral.md`

Claude 通过 MCP 工具 (`compound-search` → `compound-read`) 搜索这些知识。
无正则表达式匹配 — **由 Claude 决定什么是相关的**。

### Forge (个性化)

一次性访谈设置你的偏好:

```bash
tenetx forge
```

- 根据你的工作风格生成**全局规则** (`~/.claude/rules/forge-*.md`)
- 质量关注度、风险承受度、沟通风格等
- **项目扫描只收集事实** — "TypeScript, Vitest, ESLint"（不推断偏好）

### Safety

激活的 hook (已注册至 settings.json):

| Hook | 功能 |
|------|------|
| `pre-tool-use` | 阻止危险命令 (rm -rf, curl\|sh, force-push) |
| `db-guard` | 阻止危险 SQL (DROP TABLE, 无 WHERE 的 DELETE) |
| `secret-filter` | 警告 API 密钥泄露 |
| `slop-detector` | 检测 AI slop (TODO 残留, eslint-disable, as any) |
| `context-guard` | 上下文接近限制时发出警告 |
| `rate-limiter` | MCP 工具调用频率限制 |

安全扫描使用**严重程度分类** (block/warn)，包含数据泄露和混淆检测。

---

## 命令

```bash
tenetx                    # 启动 Claude Code (harness 模式)
tenetx forge              # 个性化你的配置文件
tenetx compound           # 管理积累的知识
tenetx compound --save    # 保存自动分析的模式
tenetx skill promote <n>  # 将已验证的 solution 晋升为 skill
tenetx skill list         # 列出已晋升的 skill
tenetx me                 # 个人仪表盘
tenetx config hooks       # Hook 管理
tenetx doctor             # 系统诊断
tenetx uninstall          # 干净地卸载 tenetx
```

### MCP 工具 (会话中 Claude 可使用)

| 工具 | 用途 |
|------|------|
| `compound-search` | 按查询搜索积累的知识 (含内容预览) |
| `compound-read` | 读取完整的 solution 内容 |
| `compound-list` | 带过滤器的 solution 列表 |
| `compound-stats` | 概览统计 |
| `session-search` | 搜索过去的会话对话 (分词, 含上下文窗口) |

---

## 架构

```
~/.claude/
├── settings.json          ← hook 注册在这里 (绝对路径)
├── rules/
│   └── forge-*.md         ← 全局用户偏好 (来自访谈)
├── skills/
│   └── {promoted}/SKILL.md ← 已晋升的 skill (Claude Code 自动识别)
└── .claude.json           ← MCP 服务器注册在这里

{project}/
└── .claude/
    ├── rules/
    │   └── project-context.md  ← 项目信息 (自动扫描)
    └── agents/
        └── ch-*.md             ← 带记忆 + MCP 访问权限的自定义 agent

~/.compound/
├── me/
│   ├── solutions/         ← 积累的 compound 知识
│   ├── skills/            ← 已晋升的 skill (tenetx 管理副本)
│   ├── behavior/          ← 观察到的用户模式 → forge-behavioral.md
│   └── forge-profile.json ← 性格维度
├── sessions.db            ← SQLite 会话历史 (Node.js 22+ 内置)
└── state/                 ← auto-compound 状态
```

### 核心设计决策

- **Harness，而非单纯的插件** — `tenetx` 启动 `claude` 并控制会话生命周期
- **Claude 是提取者** — 无正则表达式模式匹配；Claude 分析对话
- **Pull，而非 push** — MCP 指令引导 Claude 搜索知识；无强制注入
- **事实，而非推断** — 项目扫描收集事实；偏好仅来自访谈
- **基于严重程度的安全** — block vs warn 分类防止因误报导致知识丢失

---

## 共存

Tenetx 在安装时检测其他插件 (oh-my-claudecode, superpowers, claude-mem)，并禁用重叠的 workflow hook。核心 safety 和 compound hook 始终保持激活。

---

## 许可证

MIT
