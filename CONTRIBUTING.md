# Contributing to Lines Checker

Thank you for your interest in contributing to the **ads.txt & sellers.json Lines Checker**. This extension is built to help AdOps professionals validate monetization files efficiently.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone [https://github.com/OstinUA/ads.txt-app-ads.txt-sellers.json-Lines-Checker.git](https://github.com/OstinUA/ads.txt-app-ads.txt-sellers.json-Lines-Checker.git)
    ```
3.  **Load the extension** in Chrome:
    * Go to `chrome://extensions/`
    * Enable "Developer mode"
    * Click "Load unpacked" and select the folder.

## Development Guidelines

### Technology Stack
* **Core:** Native JavaScript (ES6+).
* **Platform:** Chrome Extensions API (Manifest V3).
* **UI:** Vanilla HTML/CSS (Flexbox).

### Code Style
* **Clean Code:** We prefer concise, self-explanatory code.
* **No Comments:** Avoid redundant comments. The code logic should be clear enough to read without them. Only comment on complex regular expressions or strictly necessary workarounds.
* **English Only:** All variable names, commit messages, and documentation must be in English.

### Project Structure
* **`manifest.json`**: The entry point. Ensure any new permissions are justified.
* **`background.js`**: Service worker. Handles logic that persists across tabs (caching, timers).
* **`popup.js`**: UI logic. Handles parsing the text files and rendering the visual validation.
* **`popup.css`**: Keep styles modular. Use variables for colors (`--brand-color`, `--bg-color`).

## Submitting Changes

1.  Create a new branch for your feature or fix:
    ```bash
    git checkout -b feature/improved-parsing
    ```
2.  Make your changes.
3.  Test thoroughly:
    * Test on sites with valid `ads.txt`.
    * Test on sites with missing files (404).
    * Test on sites returning Soft 404s (HTML).
4.  Commit your changes (use clear, present-tense messages):
    ```bash
    git commit -m "Add support for parsing inline comments"
    ```
5.  Push to your fork and submit a **Pull Request**.

## Reporting Bugs

If you find a parsing error or a logic mismatch:
1.  Open an Issue.
2.  Include the URL of the `ads.txt` file causing the issue.
3.  Describe the expected behavior vs. the actual result.
