<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.svg" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>越用越懂你的 AI 编程工具</strong>
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="#什么是-tenetx">简介</a> &middot;
  <a href="#为什么选择-tenetx">优势</a> &middot;
  <a href="#快速上手">快速上手</a> &middot;
  <a href="#核心功能">核心功能</a> &middot;
  <a href="#架构">架构</a>
</p>

---

## 什么是 Tenetx？

Tenetx 是一款基于 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 的**个性化 AI 编程工具**。它不会让你手动调整配置文件，而是通过扫描你的项目、分析你的编程习惯，自动构建专属于你的开发环境。

用得越多，它就越了解你。

```
$ claude                        $ tenetx
│                                │
│ 默认 Claude Code               │ Tenetx 先运行
│ 通用设置，千人一面              │  ├── Forge: 生成你的 5 维画像
│                                │  ├── Lab: 追踪使用模式
│                                │  ├── 根据画像生成 hooks & 路由
│                                │  ├── 同步知识包
│                                │  └── 启动 Claude Code（已个性化配置）
│                                │
│ 通用工具                        │ 为你量身打造的工具
```

**Tenetx 不会 fork 或修改 Claude Code。** 它只配置 Claude Code 本身已经读取的 settings、hooks 和 CLAUDE.md，并根据你的个性化画像进行塑造。

---

## 为什么选择 Tenetx？

- **个性化优先**：Forge 扫描项目并通过访谈生成你的 5 维画像，所有配置从画像自动派生。
- **自我进化**：Lab 持续追踪使用行为，8 个模式检测器自动优化画像，形成闭环。
- **开放共享**：Remix 允许你从他人的配置中挑选组件，站在巨人肩上。
- **多模型协同**：跨 Claude/Codex/Gemini 的置信度评分，综合多模型的判断力。

---

---

## 快速上手

### 前置条件

- **Node.js** >= 20
- **Claude Code** 已安装并完成认证
  > Tenetx 封装 Claude Code 并依赖其 Hook API。Claude Code 的更新可能需要 tenetx 同步更新。

### 何时使用 Tenetx

| 场景 | 适合度 |
|------|--------|
| 有重复模式的长期项目 | 非常适合 |
| 个人工作流优化 | 非常适合 |
| 轻量级工具（3个运行时依赖） | 非常适合 |
| 一次性脚本或临时代码 | 不太适合 |
| 没有 Claude Code 的环境 | 不支持 |

### 安装与 Forge 初始化

```bash
# 全局安装
npm install -g tenetx

# Forge 初始化 — 扫描项目 + 交互式访谈 → 生成画像
tenetx forge

# 用你的画像启动 Claude Code
tenetx
```

Forge 流程分三步：

1. **扫描** -- 分析项目结构、技术栈、依赖关系
2. **访谈** -- 了解你的编程风格、偏好、工作方式
3. **生成** -- 输出 5 维画像，自动派生全部配置（agents、skills、hooks、rules）

```bash
# 查看你的画像
tenetx me
```

### 界面预览

<p align="center">
  <img src="assets/demo-preview.svg" alt="Tenetx in action" width="700"/>
</p>

---

## 核心功能

### Forge：画像生成引擎

Forge 是 Tenetx 的起点。它扫描你的项目并通过交互式访谈，生成你的个性化 5 维画像。

| 维度 | 描述 | 示例输出 |
|------|------|---------|
| **품질 초점** (qualityFocus) | 速度 vs 彻底性 | 偏好彻底验证，覆盖率优先 |
| **자율성 선호** (autonomyPreference) | 监督 vs 自主 | 倾向自主，减少确认步骤 |
| **위험 감수도** (riskTolerance) | 保守 vs 激进 | 偏保守，小步迭代 |
| **추상화 수준** (abstractionLevel) | 务实 vs 架构驱动 | 直接实现，避免过度抽象 |
| **커뮤니케이션 스타일** (communicationStyle) | 详细 vs 简洁 | 简洁回复，减少冗余 |

画像生成后，Tenetx 自动派生匹配你风格的 agent 配置、适配你流程的 skill 组合、对应你质量标准的 hook 规则、以及基于你领域的知识路由。

```bash
tenetx forge              # 初始化 Forge
tenetx forge --refresh    # 重新生成画像
tenetx me                 # 查看当前画像
```

### Lab：自适应进化引擎

Lab 在后台持续运行，追踪你的使用模式，用 8 个检测器自动优化画像。用得越多，配置越精准。

| 检测器 | 追踪内容 | 优化行为 |
|--------|---------|---------|
| 命令频率 | 高频 / 低频命令 | 提升常用技能权重 |
| 模式匹配 | 反复出现的编码模式 | 自动生成复用规则 |
| 错误模式 | 重复失败类型 | 生成预防性 hooks |
| 时间分布 | 工作时段与节奏 | 调整资源分配策略 |
| 模型偏好 | 各模型使用率与满意度 | 优化路由权重 |
| 上下文效率 | Token 使用效率 | 调整压缩策略 |
| 知识命中 | 知识包的实际复用率 | 优先加载高价值知识 |
| 协作模式 | 团队互动频率与方式 | 调整提案与共享策略 |

```bash
tenetx me --patterns    # 查看 Lab 检测到的模式
tenetx me --history     # 查看画像进化历史
```

### Remix：配置组件挑选

Remix 让你可以从他人的 Tenetx 配置中挑选单个组件（agents、skills、hooks、rules），而不是整包复制。

```bash
tenetx remix browse                          # 浏览可用的配置组件
tenetx remix pick <component> --from <source>  # 挑选特定组件
tenetx remix preview <component>             # 预览组件效果
```

### Me Dashboard：画像仪表板

`tenetx me` 展示你的完整画像，包含 5 维雷达图、进化日志、模式列表和配置来源。

```bash
tenetx me               # 完整画像视图
tenetx me --history      # 画像演化时间线
tenetx me --patterns     # Lab 检测到的使用模式
tenetx me --export       # 导出画像
```

### 代码智能 (AST + LSP)

安装相关工具后，Tenetx 能真正理解代码结构：

**AST-grep** — 基于语法树的代码搜索（非正则）：

```bash
tenetx ast search "function $NAME($$$)" --lang ts   # 搜索函数
tenetx ast classes                                    # 列出类
tenetx ast calls handleForge                          # 查找调用点
```

未安装 `sg` 时自动回退到正则。支持 TypeScript、Python、Go、Rust。

**LSP** — 语言服务器集成，类型感知操作：

```bash
tenetx lsp status                              # 检测到的服务器
tenetx lsp hover src/forge/types.ts 14 10      # 类型信息
tenetx lsp definition src/cli.ts 50 20         # 跳转到定义
```

自动检测 tsserver、pylsp、gopls、rust-analyzer。未安装时优雅降级。

### Multi-model Synthesis：多模型综合

跨 Claude、Codex、Gemini 的置信度评分系统。每个模型独立给出答案和置信度，系统自动对比输出、标记分歧点，在高分歧区域触发更深层分析。画像数据影响模型权重分配。

```bash
tenetx ask "这段代码有安全隐患吗？" --compare    # 多模型对比
tenetx ask "优化数据库查询" --fallback            # 自动回退
```

---

## 执行模式与路由

### 9 种模式，21 个技能

| 标志 | 模式 | 说明 |
|------|------|------|
| `-a` | **autopilot** | 5 阶段自主流水线（探索 → 规划 → 实现 → QA → 验证） |
| `-r` | **ralph** | 基于 PRD 的完成保障，含验证/修复循环 |
| `-t` | **team** | 多智能体并行流水线，含专业角色分工 |
| `-u` | **ultrawork** | 最大并行度突发模式 |
| `-p` | **pipeline** | 逐阶段顺序处理 |
| | **ccg** | 3 模型交叉验证 |
| | **ralplan** | 基于共识的设计（规划者 → 架构师 → 评审者） |
| | **deep-interview** | 苏格拉底式需求澄清 |
| | **tdd** | 测试驱动开发模式 |

```bash
tenetx --autopilot "实现用户认证"
tenetx --ralph "完成支付集成"
tenetx --team "重新设计仪表板"
```

魔法关键词可在提示词中直接输入（无需标志）：`autopilot`、`ralph`、`ultrawork`、`tdd`、`ultrathink`、`deepsearch`、`ccg`、`deep-interview`、`canceltenetx`。

### 16 信号模型路由

```
┌─────────┬─────────────────────────────────────┐
│  Haiku  │  探索、文件搜索、简单问答             │
├─────────┼─────────────────────────────────────┤
│ Sonnet  │  代码审查、分析、设计                 │
├─────────┼─────────────────────────────────────┤
│  Opus   │  实现、架构、调试                     │
└─────────┴─────────────────────────────────────┘
```

路由由 16 信号评分驱动（词法、结构、上下文、模式匹配）。画像数据和 Lab 检测到的偏好持续影响路由权重。

---

## 知识包与团队协作

### Pack 系统（3 个范围）

| 范围 | 位置 | 加载时机 |
|------|------|---------|
| **Me** | `~/.compound/me/` | 始终加载 |
| **Team** | `~/.compound/packs/<name>/` | 在团队仓库中 |
| **Project** | `{repo}/.compound/` | 在对应仓库中 |

```bash
tenetx pack install https://github.com/your-org/pack-backend  # 安装
tenetx pack sync                                               # 同步
tenetx pick api-caching --from backend                         # 精选
tenetx propose retry-pattern --to backend                      # 提案
```

支持通过 `extends` 继承其他包的规则：

```yaml
extends:
  - github: https://github.com/your-org/tenetx-pack-core
  - local: ~/mycompany-standards
```

### Compound 循环

每次有意义的工作结束后，`tenetx compound` 分析会话并提取模式、解决方案、规则和黄金提示词。提取的知识自动分类为个人级或团队级，并反馈给 Lab 用于画像优化。

### 实时监控

| 监控项 | 触发条件 | 处理动作 |
|--------|----------|----------|
| 文件编辑 | 同一文件编辑 5+ 次 | 停止并重新设计 |
| 会话费用 | $10+ | 缩减范围 |
| 会话时长 | 40+ 分钟 | 建议压缩 |
| 上下文窗口 | 使用率 70%+ | 可视化警告 |
| 知识库 | 存在相关解决方案 | 建议复用 |

---

## 内置智能体与技能

### 智能体（3 个通道共 19 个，维度调优）

每个智能体根据你的画像维度进行调优：

| 通道 | 智能体 | 用途 |
|------|--------|------|
| **BUILD** | explore, analyst, planner, architect, debugger, executor, verifier, code-simplifier, refactoring-expert | 探索 → 实现 → 验证 |
| **REVIEW** | code-reviewer, security-reviewer, critic | 质量保障 |
| **DOMAIN** | designer, test-engineer, writer, qa-tester, performance-reviewer, scientist, git-master | 专业领域专家 |

### 技能（21 个）与 MCP 服务器（8 个）

```
技能: autopilot, ralph, team, ultrawork, pipeline, ccg, ralplan, deep-interview,
      tdd, code-review, security-review, compound, debug-detective, ecomode,
      git-master, migrate, pack-builder, ralph-craft, cancel-ralph, refactor, benchmark

MCP:  lsp-bridge, ast-search, test-runner, repo-index, secrets-scan,
      python-repl, file-watcher, dependency-analyzer
```

---

<details>
<summary>txd — 跳过权限检查</summary>

```bash
txd                   # 等同于: tenetx --dangerously-skip-permissions
```

**警告**: `txd` 禁用所有 Claude Code 权限检查。工具将不经确认直接执行。仅在受信任的隔离环境中使用。

</details>

---

## 架构

<p align="center">
  <img src="assets/architecture.svg" alt="Tenetx Architecture" width="100%"/>
</p>

Tenetx 采用 4 层架构，从画像到共享形成完整闭环：

### 第 1 层：Profile（画像层）

Forge 生成你的 5 维画像，Lab 持续追踪使用行为并自动调优。画像数据驱动所有下游配置的生成。

### 第 2 层：Adapt（适配层）

根据画像自动派生可执行配置：16 信号模型路由、17 个 Hooks、实时监控、Multi-model Synthesis。

### 第 3 层：How（执行层）

将配置转化为实际工作流：9 种执行模式、21 个技能、19 个维度调优智能体（BUILD / REVIEW / DOMAIN）、8 个 MCP 服务器、Compound 循环。

### 第 4 层：Share（共享层）

知识在个人、团队、社区之间流转：Pack 系统（Me / Team / Project）、Remix 组件级挑选、Propose/Proposals 提案机制、Extends 继承。

---

## 全部命令（45+）

### 核心与画像

| 命令 | 用途 |
|------|------|
| `tenetx` | 应用画像配置后启动 |
| `tenetx "prompt"` | 携带提示词启动 |
| `tenetx forge` | Forge 初始化（扫描 + 访谈 → 画像） |
| `tenetx forge --refresh` | 刷新画像（项目或偏好变化后） |
| `tenetx me` | 查看画像、进化历史、使用模式 |
| `tenetx me --patterns` | 查看 Lab 检测到的使用模式 |
| `tenetx me --history` | 查看画像进化时间线 |
| `tenetx me --export` | 导出画像 |
| `tenetx setup` | 初始化设置（全局） |
| `tenetx setup --project` | 项目专属配置（`--pack`、`--extends`、`--yes`） |
| `tenetx --resume` | 恢复上次会话 |
| `tenetx init` | 自动检测项目类型并初始化 |
| `tenetx init --team` | 初始化团队包（在仓库中） |

### 原则与验证

| 命令 | 用途 |
|------|------|
| `tenetx philosophy show` | 显示当前原则 |
| `tenetx philosophy edit` | 编辑 philosophy.yaml |
| `tenetx philosophy validate` | 验证语法 |

### 包管理与知识共享

| 命令 | 用途 |
|------|------|
| `tenetx pack list` | 列出已安装的包 |
| `tenetx pack install <source>` | 安装包（GitHub URL、`owner/repo`、本地路径） |
| `tenetx pack sync [name]` | 同步所有包或指定包 |
| `tenetx pack init <name>` | 创建新包 |
| `tenetx pack add <name>` | 将包关联到项目 |
| `tenetx pack remove <name>` | 取消包与项目的关联 |
| `tenetx pack setup <source>` | 一键设置（安装 → 关联 → 同步 → 依赖检查） |
| `tenetx pack lock / unlock` | 锁定/解锁包版本 |
| `tenetx pack outdated` | 检查可用的包更新 |
| `tenetx remix browse` | 浏览可用的配置组件 |
| `tenetx remix pick <component>` | 从他人配置中挑选组件 |
| `tenetx pick <pattern> --from <pack>` | 精选解决方案到个人收藏 |
| `tenetx propose <pattern> --to <pack>` | 将个人模式提案给团队 |
| `tenetx proposals` | 审核待处理的团队提案 |
| `tenetx compound` | 提取会话洞察（个人/团队自动分类） |

### AI、会话与基础设施

| 命令 | 用途 |
|------|------|
| `tenetx ask "question"` | 多提供商提问（`--compare`、`--fallback`） |
| `tenetx providers` | 管理 AI 提供商 |
| `tenetx worker` | AI Workers（spawn/list/kill/output） |
| `tenetx status` | 当前状态行 |
| `tenetx stats [--week]` | 会话统计 |
| `tenetx session` | 会话管理（search/list/show） |
| `tenetx dashboard` | 治理仪表板 |
| `tenetx governance` | 治理报告（`--json`、`--trend`） |
| `tenetx mcp` | 管理 MCP 服务器 |
| `tenetx marketplace` | 插件市场 |
| `tenetx worktree` | Git worktree 管理 |
| `tenetx scan` | 项目结构扫描 |
| `tenetx verify` | 自动验证循环 |
| `tenetx doctor` | 环境诊断 |
| `tenetx notify "message"` | 发送通知（Discord/Slack/Telegram） |
| `tenetx install --plugin` | 作为 Claude Code 插件安装 |
| `tenetx uninstall` | 卸载 |
| `tenetx help` | 完整帮助 |

---

## 统计数据

- **1555 个测试**，覆盖 98 个测试文件（100% 通过）
- **19 个维度调优智能体**，分布在 3 个通道（BUILD 9、REVIEW 3、DOMAIN 7）
- **21 个技能**，9 种执行模式
- **17 个 hooks**，10 种事件类型，3 个安全 hooks
- **8 个内置 MCP 服务器**（JSON-RPC 2.0）
- **16 信号模型路由**（Haiku/Sonnet/Opus）+ 画像驱动权重
- **8 个 Lab 模式检测器**，持续优化画像
- **5 个示例配置包**（frontend、backend、devops、security、data）
- **45+ 个 CLI 命令**

---

## 致谢

Tenetx 从 Yeachan Heo 的 [oh-my-claudecode](https://github.com/Yeachan-Heo/oh-my-claudecode) 中获得了大量灵感。多智能体编排模式、魔法关键词系统、执行模式，以及通过框架层增强 Claude Code 的整体愿景，都深受 OMC 开创性工作的影响。

从 oh-my-claudecode 借鉴的核心概念：
- 具有专业角色的多智能体编排
- 执行模式（autopilot、ralph、team、ultrawork）
- 基于 hooks 的魔法关键词检测
- 基于 tmux 的 CLI workers，用于跨 AI 集成
- 会话监控与通知系统

Tenetx 的差异化在于其**个性化优先方法** -- Forge 自动生成画像、Lab 持续进化配置 -- 以及 **Remix** 机制带来的组件级配置复用。

我们同样致谢 [Claude Forge](https://github.com/sangrokjung/claude-forge)，感谢其清晰的"oh-my-zsh for Claude Code"方法所带来的预配置开发套件理念。

---

## 许可证

MIT
