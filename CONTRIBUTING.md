# Contributing to tenetx

Thank you for your interest in contributing! tenetx is a philosophy-driven Claude Code harness built for individual developers who value intentional, compound-growth workflows.

## Quick Start

```bash
git clone https://github.com/wooo-jin/tenetx.git
cd tenetx
npm install
npm run build
npm test
```

## Code Style

- **Language**: TypeScript with strict mode enabled
- **No linter yet**: Follow the existing code style in the file you're editing
- Keep functions under 50 lines; split if larger
- No nested depth beyond 4 levels — use early returns
- No unnecessary abstractions — implement only what's needed now

## Making Changes

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/your-feature`
3. Make your changes and ensure tests pass: `npm test`
4. Commit using [Conventional Commits](#commit-convention)
5. Open a Pull Request against `main`

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new skill for X
fix: resolve Y when Z
docs: update contributing guide
chore: bump version to 1.x.0
test: add scenario tests for X
refactor: extract helper from Y
```

## PR Guidelines

- Keep PRs focused — one concern per PR
- Include a brief description of what changed and why
- If fixing a bug, describe how to reproduce it
- Tests are expected for new features and bug fixes

## Philosophy

tenetx is built around five principles: `understand-before-act`, `decompose-to-control`, `capitalize-on-failure`, `focus-resources-on-judgment`, and `knowledge-comes-to-you`. Contributions that align with these principles are more likely to be accepted.

## Questions

Open a [GitHub Issue](https://github.com/wooo-jin/tenetx/issues) for questions, bug reports, or feature proposals.
