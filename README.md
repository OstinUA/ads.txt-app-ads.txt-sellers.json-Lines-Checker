# Ads.txt / App-ads.txt & Sellers.json Lines Checker

> AdOps-grade Chrome Extension for fast, no-nonsense supply-path sanity checks.

[![Version](https://img.shields.io/badge/version-6.4.3-21aeb3?style=for-the-badge)](https://github.com/OstinUA/ads.txt-app-ads.txt-sellers.json-Lines-Checker)
[![Chrome Extension](https://img.shields.io/badge/Platform-Chrome_Extension-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-2ea44f?style=for-the-badge)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![License: MIT](https://img.shields.io/badge/License-MIT-21aeb3?style=for-the-badge)](LICENSE)
[![Last Commit](https://img.shields.io/github/last-commit/OstinUA/ads.txt-app-ads.txt-sellers.json-Lines-Checker?style=for-the-badge)](https://github.com/OstinUA/ads.txt-app-ads.txt-sellers.json-Lines-Checker/commits)

This project is a Manifest V3 Chrome extension that validates `ads.txt` and `app-ads.txt`, cross-checks seller IDs against `sellers.json`, surfaces syntax/data mismatches, and gives you a pragmatic UI to triage monetization hygiene in seconds.

> [!IMPORTANT]
> This tool is designed for operational validation workflows (AdOps / Yield / Publisher Engineering). It helps you spot bad lines quickly, but it does not replace end-to-end business logic validation of your entire ad stack.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Technical Deep Dive](#technical-deep-dive)
  - [Project Structure](#project-structure)
  - [Key Design Decisions](#key-design-decisions)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Usage](#usage)
- [Configuration](#configuration)
- [Community and Support](#community-and-support)
- [License](#license)
- [Contacts](#contacts)

## Features

### Core Validation Engine

- Parses both `ads.txt` and `app-ads.txt` from the active domain.
- Detects lines matching a target seller brand derived from a `sellers.json` URL.
- Flags critical syntax issues (for example, valid-looking lines that are commented out and therefore ignored by crawlers).
- Performs seller ID cross-checking against fetched `sellers.json` records.
- Verifies `OWNERDOMAIN` and `MANAGERDOMAIN` fields and marks them as `MATCH`, `MISMATCH`, or `NOT FOUND`.
- Detects soft-404 style failures when a server returns HTML junk instead of a real text payload.

### Data Fetching and Caching

- Fetches `sellers.json` from a default endpoint or your custom URL.
- Caches `sellers.json` in `chrome.storage.local` with fixed TTL behavior to avoid unnecessary requests.
- Uses retry and timeout logic to reduce false negatives caused by flaky networks.

### UX and Operator Workflow

- Tab-based popup UI with dedicated views for `sellers.json`, `ads.txt`, and `app-ads.txt`.
- Highlighting for risky lines and suspicious entries.
- Inline status badges for warnings and hard errors.
- Dynamic badge count on extension icon for quick at-a-glance signal.
- Optional filtering mode to focus only on the target brand footprint.

> [!TIP]
> If you audit multiple publishers daily, keep a custom `sellers.json` endpoint configured per SSP to reduce context switching and improve hit quality.

## Technology Stack

- `JavaScript (ES6+)` for extension logic.
- `Chrome Extensions API (Manifest V3)`:
  - `chrome.scripting`
  - `chrome.storage.local`
  - `chrome.action`
  - `tabs`
- `HTML5 + CSS3` for popup UI.
- `Service Worker` architecture (`background.js`) for caching and badge orchestration.

## Technical Deep Dive

### Project Structure

```text
.
├── manifest.json       # Extension manifest, permissions, content scripts
├── background.js       # Service worker: fetch, cache, retries, badge updates
├── popup.html          # Popup shell and tab containers
├── popup.js            # Parsing, validation, render pipeline
├── popup.css           # Popup styles and state visuals
├── overlay.js          # On-page overlay for .txt route context
├── utils.js            # Shared helpers (domain parsing, brand extraction, etc.)
├── icons/              # Extension assets
├── LICENSE             # MIT license
└── README.md           # Project docs
```

### Key Design Decisions

1. `Manifest V3` service worker is used instead of persistent background pages to stay aligned with Chrome extension platform direction.
2. Validation logic is split between popup-level parsing and background-level coordination to keep UI responsive.
3. Caching strategy uses `chrome.storage.local` with TTL to balance data freshness and request overhead.
4. Domain/brand extraction is centralized in utility helpers to avoid duplicated parsing logic across modules.
5. App behavior favors resilient fallbacks (timeouts, retries, local+network attempts) over optimistic one-shot requests.

> [!NOTE]
> This repo intentionally keeps the stack lightweight (vanilla JS + extension APIs) to minimize runtime and dependency attack surface.

## Getting Started

### Prerequisites

Make sure your environment has:

- `Google Chrome` (latest stable recommended).
- Access to `chrome://extensions` with Developer Mode enabled.
- Git installed (for cloning and contributing).

### Installation

```bash
# 1) Clone the repository
git clone https://github.com/OstinUA/ads.txt-app-ads.txt-sellers.json-Lines-Checker.git

# 2) Move into the project directory
cd ads.txt-app-ads.txt-sellers.json-Lines-Checker

# 3) Open Chrome extensions page
# Navigate to: chrome://extensions

# 4) Enable Developer Mode
# Toggle switch in the top-right corner

# 5) Load unpacked extension
# Click "Load unpacked" and select this project folder (where manifest.json lives)
```

## Testing

This repository does not currently ship a dedicated automated test suite. Validation is primarily done through deterministic manual scenarios.

Recommended smoke test matrix:

```bash
# No build step is required; load as unpacked extension.
# Then verify the following manually in Chrome:

# Scenario A: Site with valid ads.txt lines for your target brand
# Expected: matching lines highlighted, badge counter > 0

# Scenario B: Site with missing ads.txt/app-ads.txt
# Expected: graceful fallback, no crash, sane status output

# Scenario C: Site returning HTML instead of text (soft 404 behavior)
# Expected: response handled as invalid source, warnings shown

# Scenario D: sellers.json mismatch for known IDs
# Expected: warning markers for IDs not present in sellers registry
```

> [!WARNING]
> When testing locally, disable aggressive cache extensions/tools that mutate fetch behavior. They can hide real-world timeout and retry behavior.

## Deployment

For this project, “deployment” usually means extension packaging and release distribution.

```bash
# 1) Ensure manifest version is bumped
# Edit manifest.json -> "version"

# 2) Validate the extension by loading unpacked in Chrome
# chrome://extensions

# 3) Pack extension (optional local package)
# chrome://extensions -> "Pack extension"

# 4) Publish via Chrome Web Store workflow (if applicable)
# Follow your release checklist and listing metadata updates
```

If you run CI/CD, recommended pipeline stages:

1. Lint/check JavaScript formatting conventions.
2. Run static checks (manifest integrity, forbidden permission diff guard).
3. Generate signed package artifact.
4. Promote release after manual QA approval.

## Usage

```bash
# 1) Open a target publisher domain in Chrome
# Example: https://example.com

# 2) Click the extension icon
# You will see tabs for sellers.json, ads.txt, app-ads.txt

# 3) Inspect the validation output
# - (X) => hard syntax problem
# - (!) => seller ID mismatch warning

# 4) Open settings in the popup
# Set custom sellers.json URL if needed for your SSP workflow

# 5) Re-run checks
# Refresh the page or re-open popup to re-evaluate content
```

## Configuration

This extension has no `.env` file. Runtime config is stored in browser storage.

Main runtime knobs:

- Custom `sellers.json` URL (stored in `chrome.storage.local`).
- Internal cache TTL and fetch retry behavior (defined in source constants).

Configuration notes:

- Default `sellers.json` source is used when custom URL is absent.
- Host permissions are currently broad (`http://*/*`, `https://*/*`) to support multi-domain checks.

> [!CAUTION]
> Broad host permissions are operationally convenient but sensitive. If you fork this project for production, scope permissions down to the minimum viable domain set.

## Community and Support

- Use GitHub Issues for reproducible bugs and actionable feature requests.
- Use Discussions (or equivalent community channels) for Q&A and implementation chat.
- PRs are welcome for parser hardening, better UX, and safer defaults.

## License

Distributed under the MIT License. See `LICENSE` for the full text.

## Contacts

## ❤️ Support the Project

If you find this tool useful, consider leaving a ⭐ on GitHub or supporting the author directly:

[![Patreon](https://img.shields.io/badge/Patreon-OstinFCT-f96854?style=flat-square&logo=patreon)](https://www.patreon.com/OstinFCT)
[![Ko-fi](https://img.shields.io/badge/Ko--fi-fctostin-29abe0?style=flat-square&logo=ko-fi)](https://ko-fi.com/fctostin)
[![Boosty](https://img.shields.io/badge/Boosty-Support-f15f2c?style=flat-square)](https://boosty.to/ostinfct)
[![YouTube](https://img.shields.io/badge/YouTube-FCT--Ostin-red?style=flat-square&logo=youtube)](https://www.youtube.com/@FCT-Ostin)
[![Telegram](https://img.shields.io/badge/Telegram-FCTostin-2ca5e0?style=flat-square&logo=telegram)](https://t.me/FCTostin)
