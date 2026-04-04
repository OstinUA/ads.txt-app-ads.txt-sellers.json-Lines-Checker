# Contributing Guide

First off: thanks for considering a contribution. You’re helping keep this AdOps validator sharp, fast, and reliable for real production troubleshooting.

> [!IMPORTANT]
> Before opening issues or PRs, make sure you’ve read this document end-to-end. It will save everyone time and keep review cycles short.

## 1) Introduction

This project is a Chrome Extension (`Manifest V3`) focused on validating `ads.txt`, `app-ads.txt`, and `sellers.json` alignment. Contributions are welcome from AdOps engineers, JS developers, QA folks, and anyone who can improve reliability, DX, or UX.

What we value most:

- Reproducible bug reports.
- Focused pull requests.
- Clean, maintainable JavaScript.
- Zero hand-wavy assumptions in parser logic.

## 2) I Have a Question

Please do **not** use GitHub Issues for general usage questions.

Issues are reserved for:

- Confirmed bugs.
- Feature proposals with clear scope.
- Actionable engineering tasks.

For questions, use:

- GitHub Discussions (preferred if available in repo settings).
- Relevant AdOps/dev communities.
- Direct project contact channels listed in `README.md`.

> [!NOTE]
> “How do I use this extension for my SSP?” is a question. “Parsing fails on this valid line with reproduction steps” is an issue.

## 3) Reporting Bugs

### Search for duplicates first

Before creating a new issue, check open/closed issues for the same failure mode.

### What to include in a high-quality bug report

1. Environment details:
   - OS and version.
   - Chrome version.
   - Extension version (from `manifest.json` / installed package).
2. Exact target URL(s):
   - `ads.txt`, `app-ads.txt`, and `sellers.json` if relevant.
3. Steps to reproduce:
   - Deterministic sequence, minimal but complete.
4. Expected behavior vs actual behavior:
   - Clear statement, no ambiguity.
5. Evidence:
   - Screenshots, console output, and sample lines.

Bug report template (recommended):

```md
### Environment
- OS:
- Chrome:
- Extension version:

### Reproduction Steps
1.
2.

### Expected Behavior

### Actual Behavior

### Inputs
- ads.txt URL:
- app-ads.txt URL:
- sellers.json URL:

### Additional Context
```

## 4) Suggesting Enhancements

Feature requests are welcome when they solve a concrete operational problem.

Please include:

- Problem statement: what hurts today?
- Proposed solution: what behavior should change?
- Use cases: who benefits and how?
- Trade-offs: performance, permission scope, UX complexity, maintenance burden.

> [!TIP]
> The best enhancement requests are written like mini RFCs: problem, constraints, proposed API/UX, edge cases.

## 5) Local Development / Setup

### Fork and clone

```bash
# 1) Fork the repository on GitHub

# 2) Clone your fork
git clone https://github.com/<your-username>/ads.txt-app-ads.txt-sellers.json-Lines-Checker.git

# 3) Enter project directory
cd ads.txt-app-ads.txt-sellers.json-Lines-Checker
```

### Load extension locally

```bash
# 1) Open Chrome extensions manager
# chrome://extensions

# 2) Enable Developer Mode

# 3) Click "Load unpacked"
# Select the repository folder (contains manifest.json)
```

### Runtime config

No `.env` file is required. Runtime options (like custom `sellers.json` URL) are stored via `chrome.storage.local`.

## 6) Pull Request Process

### Branch naming strategy

Use branch names that describe intent:

- `feature/<short-feature-name>`
- `bugfix/<issue-or-problem-key>`
- `chore/<maintenance-task>`
- `docs/<docs-scope>`

Examples:

- `feature/sellers-json-cache-invalidation`
- `bugfix/soft-404-html-detection`

### Commit message format

Use Conventional Commits:

- `feat: add ownerdomain mismatch tooltip`
- `fix: handle commented seller lines correctly`
- `docs: rewrite usage and testing sections`
- `chore: normalize popup css spacing`

### Keep your branch synced

Before opening PR:

```bash
git fetch upstream
git rebase upstream/main
```

(If your default branch is not `main`, use the repo’s canonical default branch.)

### PR description checklist

A solid PR description should include:

- Linked issue(s): `Closes #123` or `Refs #123`.
- What changed and why.
- Testing notes (manual scenarios and outcomes).
- Screenshots/GIFs for UI changes.
- Any backward compatibility or permission implications.

## 7) Styleguides

### General coding standards

- Use modern, readable JavaScript (`ES6+`).
- Keep functions cohesive and side effects explicit.
- Prefer small pure helpers for parsing and normalization.
- Avoid dead code and speculative abstractions.

### Formatting and linting

This repository is intentionally lightweight and may not enforce formal linters yet. If you introduce lint/format tooling, keep it minimal and document it in PR.

If you run local checks, include command outputs in PR notes.

### Architectural fit

- Keep extension concerns separated:
  - Background worker for orchestration/caching.
  - Popup for rendering and interaction.
  - Utils for shared parsing/domain logic.
- Do not introduce heavy frameworks for simple workflows.

> [!WARNING]
> Permission changes (`manifest.json`) are high impact. Any new permission must be justified in the PR description with concrete necessity.

## 8) Testing

All behavior changes should be validated.

Minimum expectation:

- Reproduce the issue on current branch.
- Verify fix on your branch.
- Verify no regression in related flows.

Recommended manual scenarios:

1. Valid `ads.txt` with matching seller IDs.
2. Missing files / 404 responses.
3. Soft-404 HTML response instead of text.
4. Mismatched `OWNERDOMAIN` / `MANAGERDOMAIN`.
5. Custom `sellers.json` URL with cache refresh behavior.

If you add automated tests or scripts, document how to run them and keep scope focused.

## 9) Code Review Process

- Maintainer reviews all incoming PRs.
- At least one maintainer approval is required before merge.
- Reviewer feedback should be addressed with follow-up commits or explicit technical rationale.
- Keep discussions technical, concise, and respectful.

Fast merge tips:

- Keep PRs atomic.
- Avoid mixing unrelated refactors with bug fixes.
- Provide evidence for behavior changes.

Thanks again for contributing and helping keep the validator production-ready.
