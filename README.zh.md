<p align="center">
  <img src="https://raw.githubusercontent.com/wooo-jin/tenetx/main/assets/banner.png" alt="Tenetx" width="100%"/>
</p>

<p align="center">
  <strong>学习你编码模式的 Claude Code 插件。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> &middot;
  <a href="README.ko.md">한국어</a> &middot;
  <a href="README.ja.md">日本語</a>
</p>

---

## 什么是 Tenetx？

Tenetx 观察你使用 Claude Code 的方式，**自动生成适合你的规则**。

```bash
npm install -g tenetx
tenetx                    # 以学习模式启动 Claude Code
```

无需配置。正常使用 Claude Code — tenetx 在后台学习。

- **第1天**：检测你的语言、响应风格和工作流偏好
- **第1周**：从观察到的模式自动生成 `.claude/rules/`
- **持续**：模式积累证据。好模式晋升，坏模式自动退役。

### Harness + 插件

- **Harness 模式** (`tenetx`)：完整体验 — 每次会话更新配置、生成规则、提取模式
- **插件模式**（直接 `claude`）：Hook + MCP 继续工作。学习在 harness 运行之间继续。

与其他插件（OMC、superpowers、claude-mem）兼容 — 自动让出重叠功能。

---

## 工作原理

```
正常编码
    ↓
16 个 Hook 静默观察（提示模式、工具使用、代码反射）
    ↓
检测模式 → 存储解决方案 → 跟踪证据
    ↓
上下文压缩时 → Claude 分析你的思维模式（0 额外 API 成本）
    ↓
下次会话：自动生成个性化规则 + 显示反馈
```

### 复利循环

解决方案通过实际使用获得信任：

| 状态 | 置信度 | 条件 |
|------|--------|------|
| experiment | 0.3 | 从 git diff 或 Claude 分析自动提取 |
| candidate | 0.6 | reflected >= 2, sessions >= 2 |
| verified | 0.8 | reflected >= 4, sessions >= 3 |
| mature | 0.85 | reflected >= 8, sessions >= 5, 维持 30 天 |

35 个检测模式（25 个表面 + 10 个思维）+ 压缩时 Claude 语义分析。

---

## 快速开始

```bash
npm install -g tenetx
tenetx                    # 以完整学习启动 Claude Code
tenetx forge              # 分析你的工作风格（可选）
```

**前提条件：** Node.js >= 20, Claude Code 已安装

---

## 命令

```bash
tenetx                    # 以 harness 启动
tenetx forge              # 工作风格分析
tenetx me                 # 个人仪表盘
tenetx compound           # 积累的知识管理
tenetx lab                # 自适应优化
tenetx doctor             # 系统诊断
```

---

## 联系方式

- **作者：** Woojin Jang
- **GitHub：** [@wooo-jin](https://github.com/wooo-jin)

## 许可证

MIT
