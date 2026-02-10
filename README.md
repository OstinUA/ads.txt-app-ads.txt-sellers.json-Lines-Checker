# Ads.txt, App-ads.txt & Sellers.json Lines Checker

![Version](https://img.shields.io/badge/version-5.5.2-blue)
![Manifest](https://img.shields.io/badge/manifest-V3-green)
![Context](https://img.shields.io/badge/context-AdOps-orange)

A powerful Chrome Extension (Manifest V3) designed for AdOps professionals and Publishers. It automatically validates `ads.txt` and `app-ads.txt` files on any domain, cross-referencing them against a `sellers.json` registry (defaulting to adWMG) to ensure inventory authorization and syntax accuracy.

## Key Features

### 1. Automated Validation
* **Dual-File Scanning:** Simultaneously fetches `ads.txt` and `app-ads.txt` for the current tab's domain.
* **Soft 404 Detection:** Intelligently identifies if a server returns an HTML page (error page) instead of a valid text file, preventing false positives.
* **Owner Domain Validation:** Parses the `OWNERDOMAIN` field and compares it against the site's actual hostname.
    * `MATCH`: Domain is authorized.
    * `MISMATCH`: Domain does not match.
    * `NOT FOUND`: Field is missing.

### 2. Sellers.json Cross-Referencing
* **Registry Matching:** Downloads and caches the `sellers.json` database.
* **ID Verification:** Checks every Seller ID in the `ads.txt` file against the downloaded registry.
* **Gap Analysis:** Highlights lines where the Seller ID exists in the text file but is missing from `sellers.json`.

### 3. Syntax & Error Highlighting
The extension parses the file line-by-line and applies visual cues:
* **[Red] Critical Error:** Lines commented out or starting with invalid characters (ignored by crawlers).
* **[Orange] Warning:** Valid syntax, but the Seller ID is not found in the `sellers.json` registry.
* **[Green] Success:** Valid line with a confirmed match in `sellers.json`.
* **Own Domain Highlighting:** Visually distinguishes lines pointing to the current domain.

### 4. Smart Caching & Settings
* **Custom Registry:** Users can configure a custom `sellers.json` URL via the settings panel (Default: `https://adwmg.com/sellers.json`).
* **Performance:** Implements a 1-hour TTL cache for the `sellers.json` file to minimize network requests.
* **Force Refresh:** Button available to bypass the cache and fetch fresh data immediately.

---

## Installation

### From Source (Developer Mode)
1.  Clone this repository:
    ```bash
    git clone [https://github.com/OstinUA/ads.txt-app-ads.txt-sellers.json-Lines-Checker.git](https://github.com/OstinUA/ads.txt-app-ads.txt-sellers.json-Lines-Checker.git)
    ```
2.  Open Chrome and navigate to `chrome://extensions/`.
3.  Toggle **Developer mode** in the top right corner.
4.  Click **Load unpacked**.
5.  Select the directory where you cloned this repository.

---

## Configuration

By default, the extension checks against the **adWMG** registry. To change this:

1.  Open the extension popup.
2.  Click the **Settings** icon in the header.
3.  Enter your target URL in the input field (e.g., `https://example.com/sellers.json`).
4.  Click **Save**.

The extension will immediately refresh the cache and re-scan the current tab against the new registry.

---

## Technical Architecture

* **Manifest V3:** Uses Service Workers (`background.js`) instead of persistent background pages for better performance and battery life.
* **Scripting API:** Injects lightweight content scripts to safely fetch local file data without CORS issues.
* **Storage API:** Persists user settings and the `sellers.json` cache using `chrome.storage.local`.
* **Retry Logic:** `background.js` implements a robust fetch mechanism with exponential backoff and timeouts to handle unstable network conditions.

### File Structure
* `background.js`: Handles caching, badge updates, and periodic scanning.
* `popup.js`: Manages the UI logic, parsing, validation, and rendering of the results.
* `content_script.js`: Retrieves the raw text content from the active tab.

---

## Troubleshooting

**"File appears to be an HTML page"**
The extension detected that the server returned an HTML document (like a 404 page or a redirect) instead of a plain text file. This is a common misconfiguration on publisher sites.

**Badge count is 0**
This means no lines in the `ads.txt` file matched the filter domain (e.g., "adwmg") defined in your settings. Open the popup to see if the file is empty or missing.

---

## Validation Logic Details

The extension performs the following checks on every line:

```javascript
// Example Logic Flow
if (line.includes(brand)) {
    // 1. Syntax Check
    if (line_starts_with_invalid_char) {
        mark_critical_error("Ignored by crawlers");
    }
    
    // 2. ID Validation
    const sellerId = extract_id(line);
    if (!sellersJson.contains(sellerId)) {
        mark_warning("ID not found in sellers.json");
    }
}```

## Project Structure

├── background.js      # Service worker: handles caching, badges, and timers
├── content_script.js  # Injects into page to fetch local files
├── manifest.json      # Extension configuration (V3)
├── popup.html         # Main UI structure
├── popup.css          # Styling (Tabs, Warnings, Badges)
└── popup.js           # Core UI logic, parsing, and rendering
