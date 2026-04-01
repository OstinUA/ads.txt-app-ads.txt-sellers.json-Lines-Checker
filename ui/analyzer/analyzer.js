(() => {
  /* ═══════════════════════════════════════════════════════════════════════════
     analyzer.js — Enhanced ads.txt / app-ads.txt Analyzer
     Version 7.0.1
     ═══════════════════════════════════════════════════════════════════════════ */

  // ── DOM refs: top bar & status ──────────────────────────────────────────
  const domainInput  = document.getElementById("domain-input");
  const analyzeBtn   = document.getElementById("analyze-btn");
  const statsBar     = document.getElementById("stats-bar");
  const workspace    = document.getElementById("workspace");
  const statusMsg    = document.getElementById("status-msg");

  // ── DOM refs: column content ────────────────────────────────────────────
  const adsContent    = document.getElementById("ads-content");
  const appadsContent = document.getElementById("appads-content");

  // ── DOM refs: column headers / links ────────────────────────────────────
  const adsLink        = document.getElementById("ads-link");
  const appadsLink     = document.getElementById("appads-link");
  const adsRedirect    = document.getElementById("ads-redirect");
  const appadsRedirect = document.getElementById("appads-redirect");

  // ── DOM refs: stats ─────────────────────────────────────────────────────
  const adsTotal         = document.getElementById("ads-total");
  const adsDupes         = document.getElementById("ads-dupes");
  const adsErrors        = document.getElementById("ads-errors");
  const adsRatioDisplay  = document.getElementById("ads-ratio-display");
  const appadsTotal        = document.getElementById("appads-total");
  const appadsDupes        = document.getElementById("appads-dupes");
  const appadsErrors       = document.getElementById("appads-errors");
  const appadsRatioDisplay = document.getElementById("appads-ratio-display");

  // ── DOM refs: search (ads) ──────────────────────────────────────────────
  const adsSearchInput = document.getElementById("ads-search");
  const adsSearchCount = document.getElementById("ads-search-count");
  const adsSearchPrev  = document.getElementById("ads-search-prev");
  const adsSearchNext  = document.getElementById("ads-search-next");

  // ── DOM refs: search (appads) ───────────────────────────────────────────
  const appadsSearchInput = document.getElementById("appads-search");
  const appadsSearchCount = document.getElementById("appads-search-count");
  const appadsSearchPrev  = document.getElementById("appads-search-prev");
  const appadsSearchNext  = document.getElementById("appads-search-next");

  // ── DOM refs: seat panels ───────────────────────────────────────────────
  const adsSeatPanel       = document.getElementById("ads-seat-panel");
  const adsSspDropdown     = document.getElementById("ads-ssp-dropdown");
  const adsVerifyBtn       = document.getElementById("ads-verify-btn");
  const adsVerifyAllBtn    = document.getElementById("ads-verify-all-btn");
  const adsSeatResults     = document.getElementById("ads-seat-results");
  const adsVerifyProgress  = document.getElementById("ads-verify-progress");
  const adsProgressBar     = document.getElementById("ads-progress-bar");
  const adsProgressMsg     = document.getElementById("ads-progress-msg");
  const adsProgressCount   = document.getElementById("ads-progress-count");

  const appadsSeatPanel       = document.getElementById("appads-seat-panel");
  const appadsSspDropdown     = document.getElementById("appads-ssp-dropdown");
  const appadsVerifyBtn       = document.getElementById("appads-verify-btn");
  const appadsVerifyAllBtn    = document.getElementById("appads-verify-all-btn");
  const appadsSeatResults     = document.getElementById("appads-seat-results");
  const appadsVerifyProgress  = document.getElementById("appads-verify-progress");
  const appadsProgressBar     = document.getElementById("appads-progress-bar");
  const appadsProgressMsg     = document.getElementById("appads-progress-msg");
  const appadsProgressCount   = document.getElementById("appads-progress-count");

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. LINK NAVIGATION — open in new tab instead of navigating away
  /**
   * Attach a click handler to an anchor element that opens its href in a new tab, using chrome.tabs.create when available.
   *
   * The handler prevents default navigation and does nothing for empty or "#" href values.
   * @param {HTMLAnchorElement} linkEl - Anchor element whose clicks should open the element's href in a new tab.
   */

  function setupLinkNavigation(linkEl) {
    linkEl.addEventListener("click", (e) => {
      e.preventDefault();
      const href = linkEl.href;
      if (!href || href === "#") return;
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: href });
      } else {
        window.open(href, "_blank", "noopener,noreferrer");
      }
    });
  }

  setupLinkNavigation(adsLink);
  setupLinkNavigation(appadsLink);

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. DOMAIN NORMALIZATION & FETCH
  /**
   * Normalize a domain string by trimming, converting to lowercase, and removing URL scheme, leading `www.`, and trailing slashes.
   * @param {string} raw - Input domain or URL (may include `http(s)://`, `www.`, or trailing slashes).
   * @returns {string} The normalized domain (e.g., `example.com` or `sub.example.com`).
   */

  function normalizeDomain(raw) {
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, "");
    d = d.replace(/^www\./, "");
    d = d.replace(/\/+$/, "");
    return d;
  }

  /**
   * Fetches a specified file (e.g., `ads.txt` or `app-ads.txt`) from a domain and validates the response.
   *
   * Attempts an HTTPS GET to `https://<domain>/<filename>`, normalizes text newlines, and applies heuristics to
   * detect redirects, HTML responses, or "soft 404" pages. Successful fetches return the raw file text.
   *
   * @param {string} domain - The target domain (already normalized, e.g. "example.com").
   * @param {string} filename - The filename to request (for example `"ads.txt"` or `"app-ads.txt"`).
   * @returns {{ text: string|null, error: string|null, isRedirect: boolean }}
   *   - `text`: The fetched file contents when successful, otherwise `null`.
   *   - `error`: A human-readable error message when `text` is `null` (examples: `"HTTP 404"`, `"Returned HTML (likely 404)"`, `"Soft 404 (HTML content)"`, or a network error message); `null` on success.
   *   - `isRedirect`: `true` when the response was redirected or the final URL path does not end with the requested filename; otherwise `false`.
   */
  async function fetchFile(domain, filename) {
    const url = `https://${domain}/${filename}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const finalUrl = res.url || url;
      let isRedirect = res.redirected;
      if (finalUrl && !finalUrl.toLowerCase().split("?")[0].endsWith(filename.toLowerCase())) {
        isRedirect = true;
      }
      if (!res.ok) return { text: null, error: `HTTP ${res.status}`, isRedirect };
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) return { text: null, error: "Returned HTML (likely 404)", isRedirect };
      let text = await res.text();
      text = text.replace(/\r\n|\r/g, "\n");
      const trimmed = text.trim();
      if (
        trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") ||
        trimmed.startsWith("<head") || trimmed.substring(0, 300).toLowerCase().includes("<script")
      ) {
        return { text: null, error: "Soft 404 (HTML content)", isRedirect };
      }
      return { text, error: null, isRedirect };
    } catch (e) {
      return { text: null, error: e.message || "Network error", isRedirect: false };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. PARSING & ANALYSIS
  /**
   * Parse a single line from an ads.txt or app-ads.txt file and classify its content.
   *
   * The returned object has a `type` field and additional properties depending on the type:
   * - `empty`: `{ type: "empty", raw, trimmed }`
   * - `variable`: `{ type: "variable", raw, trimmed }` for lines starting with OWNERDOMAIN, MANAGERDOMAIN, CONTACT, SUBDOMAIN
   * - `comment`: `{ type: "comment", raw, trimmed }` for lines beginning with `#` or other non-alphanumeric prefixes
   * - `error`: `{ type: "error", raw, trimmed, reason }` for malformed lines (examples: "Too few fields", "Missing domain or publisher ID", `Invalid relationship: <value>`, or "Data line is commented out")
   * - `data`: `{ type: "data", raw, trimmed, domain, pubId, relationship, key }` for valid data lines where `relationship` is `"DIRECT"` or `"RESELLER"`. `domain` is lowercased, `relationship` is uppercased, and `key` equals `"<domain>|<pubId>"` lowercased.
   *
   * @param {string} raw - The raw input line to parse (may include surrounding whitespace).
   * @return {Object} A classification object as described above.
   */

  function parseLine(raw) {
    const trimmed = raw.trim();
    if (!trimmed) return { type: "empty", raw, trimmed };
    const upper = trimmed.toUpperCase();
    if (upper.startsWith("OWNERDOMAIN") || upper.startsWith("MANAGERDOMAIN") ||
        upper.startsWith("CONTACT") || upper.startsWith("SUBDOMAIN")) {
      return { type: "variable", raw, trimmed };
    }
    const startsSpecial = /^[^a-zA-Z0-9]/.test(trimmed);
    const hasComma = trimmed.includes(",");
    if (startsSpecial && hasComma) {
      return { type: "error", raw, trimmed, reason: "Data line is commented out" };
    }
    if (trimmed.startsWith("#") || startsSpecial) {
      return { type: "comment", raw, trimmed };
    }
    const parts = trimmed.split(",").map(p => p.trim());
    if (parts.length < 3) return { type: "error", raw, trimmed, reason: "Too few fields" };
    const domain = parts[0].toLowerCase();
    const pubId = parts[1];
    const relationship = parts[2].toUpperCase();
    if (!domain || !pubId) return { type: "error", raw, trimmed, reason: "Missing domain or publisher ID" };
    if (relationship !== "DIRECT" && relationship !== "RESELLER") {
      return { type: "error", raw, trimmed, reason: `Invalid relationship: ${parts[2]}` };
    }
    return {
      type: "data", raw, trimmed, domain, pubId, relationship,
      key: `${domain}|${pubId}`.toLowerCase()
    };
  }

  /**
   * Analyze ads.txt/app-ads.txt file contents and summarize parsed lines and metrics.
   *
   * Parses each line of the provided file text, classifies lines (data, comment, error, variable),
   * detects duplicate publisher entries, counts errors and DIRECT/RESELLER relationships, and groups
   * publisher seats by SSP domain.
   *
   * @param {string} text - Raw file contents (single string, may contain newlines).
   * @returns {Object} An analysis summary containing:
   *   - lines: {Array} Parsed line objects (one per input line, as returned by `parseLine`).
   *   - totalData: {number} Number of lines classified as data.
   *   - duplicates: {Set<number>} Set of line indices that are part of duplicate data entries.
   *   - errors: {number} Count of lines classified as errors.
   *   - direct: {number} Count of data lines with relationship "DIRECT".
   *   - reseller: {number} Count of data lines with relationship other than "DIRECT" (e.g., "RESELLER").
   *   - keySet: {Set<string>} Set of unique data-line keys ("<domain>|<pubId>") present.
   *   - seatsBySSP: {Object<string, Array<{id: string, type: string}>>} Mapping from SSP domain to an array
   *       of seat objects (each with `id` = publisher id and `type` = relationship).
   */
  function analyzeFile(text) {
    if (!text) return {
      lines: [], totalData: 0, duplicates: new Set(), errors: 0,
      direct: 0, reseller: 0, keySet: new Set(), seatsBySSP: {}
    };
    const rawLines = text.split("\n");
    const lines = rawLines.map(parseLine);
    const seen = {};
    const duplicates = new Set();
    let errors = 0, direct = 0, reseller = 0;
    const keySet = new Set();
    const seatsBySSP = {};

    lines.forEach((line, idx) => {
      if (line.type === "error") {
        errors++;
      } else if (line.type === "data") {
        if (seen[line.key] !== undefined) {
          duplicates.add(seen[line.key]);
          duplicates.add(idx);
        } else {
          seen[line.key] = idx;
        }
        keySet.add(line.key);
        if (line.relationship === "DIRECT") direct++;
        else reseller++;
        if (!seatsBySSP[line.domain]) seatsBySSP[line.domain] = [];
        seatsBySSP[line.domain].push({ id: line.pubId, type: line.relationship });
      }
    });

    const totalData = lines.filter(l => l.type === "data").length;
    return { lines, totalData, duplicates, errors, direct, reseller, keySet, seatsBySSP };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SPO RATIO
  /**
   * Compute the display string and CSS class for the direct-to-reseller (D/R) ratio.
   * @param {number} direct - Number of `DIRECT` entries.
   * @param {number} reseller - Number of `RESELLER` entries.
   * @returns {{text: string, cls: string}} An object where `text` is the ratio formatted to one decimal place, `"∞"` when there are resellers = 0 and direct > 0, or `"N/A"` when both are zero; `cls` is one of `"green"`, `"red"`, or `"neutral"` indicating the visual state. 
   */

  function computeRatio(direct, reseller) {
    if (reseller > 0) {
      const r = direct / reseller;
      return { text: r.toFixed(1), cls: r >= 1 ? "green" : "red" };
    } else if (direct > 0) {
      return { text: "∞", cls: "green" };
    }
    return { text: "N/A", cls: "neutral" };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. RENDERING
  /**
   * Render parsed file lines into a container, annotating lines with classes and tooltips for errors, duplicates, and cross-file discrepancies.
   *
   * @param {Element} container - DOM element that will receive the rendered lines; its contents are cleared before rendering.
   * @param {{ lines: Array<{ type: string, raw: string, reason?: string, key?: string }>, duplicates: Set<number> }} analysis - Parsed analysis object. `lines` is the array of parsed line objects; `duplicates` is a set of line indices considered duplicates.
   * @param {Set<string>} otherKeySet - Set of data-line keys present in the other file used to mark discrepancies when a data line's `key` is not found.
   */

  function renderColumn(container, analysis, otherKeySet) {
    container.innerHTML = "";
    const { lines, duplicates } = analysis;
    const fragment = document.createDocumentFragment();

    lines.forEach((line, idx) => {
      const el = document.createElement("span");
      el.className = "line";
      el.dataset.lineIdx = idx;

      if (line.type === "error") {
        el.classList.add("line-error");
        el.title = line.reason;
      } else if (line.type === "data" && duplicates.has(idx)) {
        el.classList.add("line-duplicate");
        el.title = "Duplicate line";
      } else if (line.type === "data" && !otherKeySet.has(line.key)) {
        el.classList.add("line-discrepancy");
        el.title = "Not found in the other file";
      }

      el.textContent = line.raw;
      fragment.appendChild(el);
    });

    container.appendChild(fragment);
  }

  /**
   * Update the UI stat elements for a given analysis column.
   * 
   * Updates the DOM elements with IDs of the form `<prefix>-total`, `<prefix>-dupes`,
   * `<prefix>-errors`, and `<prefix>-ratio-display` to reflect counts and the
   * computed direct/reseller ratio from the provided analysis.
   *
   * @param {string} prefix - ID prefix used to locate the target stat elements.
   * @param {Object} analysis - Analysis summary produced by `analyzeFile`.
   * @param {number} analysis.totalData - Number of data lines.
   * @param {Set} analysis.duplicates - Set of duplicate line indices/keys.
   * @param {number} analysis.errors - Number of parsing errors.
   * @param {number} analysis.direct - Count of `DIRECT` relationships.
   * @param {number} analysis.reseller - Count of `RESELLER` relationships.
   */
  function updateStats(prefix, analysis) {
    document.getElementById(`${prefix}-total`).textContent = `Lines: ${analysis.totalData}`;
    document.getElementById(`${prefix}-dupes`).textContent = `Dupes: ${analysis.duplicates.size}`;
    document.getElementById(`${prefix}-errors`).textContent = `Errors: ${analysis.errors}`;

    const ratio = computeRatio(analysis.direct, analysis.reseller);
    const ratioEl = document.getElementById(`${prefix}-ratio-display`);
    ratioEl.textContent = `D/R: ${ratio.text}`;
    ratioEl.className = `stat-item ratio-${ratio.cls}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. SEARCH SYSTEM
  /**
   * Creates a search controller for highlighting, counting, and navigating text matches inside a column of `.line` elements.
   *
   * The controller listens to the provided input and buttons, wraps matching substrings in `<mark>` elements, tracks matched lines,
   * supports previous/next navigation with wrapping, updates a match counter, and scrolls the current match into view.
   *
   * @param {HTMLInputElement} searchInput - Text input used to enter the query.
   * @param {HTMLElement} countEl - Element where the match counter (e.g., "2/5") is displayed.
   * @param {HTMLButtonElement} prevBtn - Button that navigates to the previous match.
   * @param {HTMLButtonElement} nextBtn - Button that navigates to the next match.
   * @param {HTMLElement} contentEl - Container element that holds `.line` elements to be searched/highlighted.
   * @returns {{ reset: function(): void }} An object with a `reset` method that clears all highlights, empties the match state and counter, and clears the search input.

  function createSearchController(searchInput, countEl, prevBtn, nextBtn, contentEl) {
    let matches = [];
    let currentIdx = -1;

    /**
     * Remove search highlight markup and related line classes from the controller's content.
     *
     * This replaces any <mark class="search-highlight"> or <mark class="search-highlight-current"> elements
     * inside the content element with their plain text nodes, then removes the
     * "line-search-match" and "line-search-current" classes from line elements.
     */
    function clearHighlights() {
      contentEl.querySelectorAll("mark.search-highlight, mark.search-highlight-current").forEach(m => {
        const parent = m.parentNode;
        parent.replaceChild(document.createTextNode(m.textContent), m);
        parent.normalize();
      });
      contentEl.querySelectorAll(".line-search-match, .line-search-current").forEach(el => {
        el.classList.remove("line-search-match", "line-search-current");
      });
    }

    /**
     * Performs the current search query against the column, highlights matching lines, and initializes navigation state.
     *
     * Clears any existing search highlights, finds lines that contain the query (case-insensitive), marks and highlights those lines, sets the current match to the first result when present, updates the match counter display, and enables or disables the previous/next navigation buttons accordingly.
     */
    function doSearch() {
      clearHighlights();
      matches = [];
      currentIdx = -1;
      const query = searchInput.value.trim().toLowerCase();

      if (!query) {
        countEl.textContent = "";
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
      }

      const lineEls = contentEl.querySelectorAll(".line");
      lineEls.forEach(lineEl => {
        const text = lineEl.textContent;
        if (text.toLowerCase().includes(query)) {
          matches.push(lineEl);
          lineEl.classList.add("line-search-match");
          highlightText(lineEl, query);
        }
      });

      if (matches.length > 0) {
        currentIdx = 0;
        focusCurrent();
      }

      updateCounter();
      prevBtn.disabled = matches.length === 0;
      nextBtn.disabled = matches.length === 0;
    }

    /**
     * Wraps the first occurrence of a query substring inside a line element with a <mark class="search-highlight"> element.
     *
     * The match is located by comparing each text node's lowercase content to the lowercase `query`; only the first match per text node is wrapped and original surrounding text nodes are preserved.
     * @param {Element} lineEl - Container element whose text nodes will be scanned and modified.
     * @param {string} query - Search string to match (matching is performed case-insensitively).
     */
    function highlightText(lineEl, query) {
      const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);

      textNodes.forEach(node => {
        const text = node.textContent;
        const lowerText = text.toLowerCase();
        const idx = lowerText.indexOf(query);
        if (idx === -1) return;

        const before = text.substring(0, idx);
        const matched = text.substring(idx, idx + query.length);
        const after = text.substring(idx + query.length);

        const mark = document.createElement("mark");
        mark.className = "search-highlight";
        mark.textContent = matched;

        const parent = node.parentNode;
        if (before) parent.insertBefore(document.createTextNode(before), node);
        parent.insertBefore(mark, node);
        if (after) parent.insertBefore(document.createTextNode(after), node);
        parent.removeChild(node);
      });
    }

    /**
     * Set the current search match as active, update its highlight, and scroll it into view.
     *
     * Clears any previously marked current match, converts the first highlight inside the active line
     * into the "current" highlight state when a valid match index exists, scrolls that line into view,
     * and refreshes the search match counter.
     */
    function focusCurrent() {
      contentEl.querySelectorAll(".line-search-current").forEach(el => el.classList.remove("line-search-current"));
      contentEl.querySelectorAll("mark.search-highlight-current").forEach(m => {
        m.className = "search-highlight";
      });

      if (currentIdx >= 0 && currentIdx < matches.length) {
        const lineEl = matches[currentIdx];
        lineEl.classList.add("line-search-current");
        const firstMark = lineEl.querySelector("mark.search-highlight");
        if (firstMark) firstMark.className = "search-highlight-current";
        lineEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      updateCounter();
    }

    /**
     * Updates the match counter display to reflect current search progress.
     *
     * Sets the counter to "current/total" when matches exist; if there are no matches,
     * shows "0/0" when the search input is non-empty, otherwise clears the counter.
     */
    function updateCounter() {
      if (matches.length === 0) {
        countEl.textContent = searchInput.value.trim() ? "0/0" : "";
      } else {
        countEl.textContent = `${currentIdx + 1}/${matches.length}`;
      }
    }

    prevBtn.addEventListener("click", () => {
      if (matches.length === 0) return;
      currentIdx = (currentIdx - 1 + matches.length) % matches.length;
      focusCurrent();
    });

    nextBtn.addEventListener("click", () => {
      if (matches.length === 0) return;
      currentIdx = (currentIdx + 1) % matches.length;
      focusCurrent();
    });

    let debounceTimer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(doSearch, 200);
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) {
          if (matches.length > 0) { currentIdx = (currentIdx - 1 + matches.length) % matches.length; focusCurrent(); }
        } else {
          if (matches.length > 0) { currentIdx = (currentIdx + 1) % matches.length; focusCurrent(); }
        }
      }
    });

    return { reset: () => { clearHighlights(); matches = []; currentIdx = -1; countEl.textContent = ""; searchInput.value = ""; } };
  }

  const adsSearch = createSearchController(adsSearchInput, adsSearchCount, adsSearchPrev, adsSearchNext, adsContent);
  const appadsSearch = createSearchController(appadsSearchInput, appadsSearchCount, appadsSearchPrev, appadsSearchNext, appadsContent);

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. SEAT VERIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  const sellersJsonCache = {};

  /**
   * Fetches and caches the sellers.json from the given SSP/exchange domain.
   *
   * Attempts to GET `https://<domain>/sellers.json` with a 15s timeout, parses the response JSON,
   * and builds a map of sellers keyed by their `seller_id` (string). Results are cached per domain.
   *
   * @param {string} domain - The SSP or exchange domain to query (e.g., "openx.com").
   * @returns {{map: Object|null, failed: boolean, timedOut: boolean}} An object where `map` is either
   * a mapping of seller_id (string) → seller object when successful or `null` on failure;
   * `failed` is `true` if the fetch/parse failed; `timedOut` is `true` if the request was aborted due to timeout.
   */
  async function fetchSellersJson(domain) {
    if (sellersJsonCache[domain]) return sellersJsonCache[domain];
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(`https://${domain}/sellers.json`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) { const r = { map: null, failed: true, timedOut: false }; sellersJsonCache[domain] = r; return r; }
      const json = await res.json();
      const map = {};
      (json.sellers || []).forEach(s => { if (s.seller_id != null) map[String(s.seller_id).trim()] = s; });
      const r = { map, failed: false, timedOut: false };
      sellersJsonCache[domain] = r;
      return r;
    } catch (err) {
      const r = { map: null, failed: true, timedOut: err.name === "AbortError" };
      sellersJsonCache[domain] = r;
      return r;
    }
  }

  /**
   * Update a seat status element to reflect the verification result for a given seat ID.
   *
   * Sets the element's text and class according to whether the sellers.json fetch timed out,
   * failed / is missing, the seat ID was not found, the seat is marked confidential, or is verified.
   *
   * @param {HTMLElement} statusEl - DOM element that will receive the status text and CSS class.
   * @param {string|number} seatId - The seller/seat identifier to look up in `map`.
   * @param {Object<string, Object>|null} map - Mapping of seller IDs to seller records (may be null on failure).
   *   Each seller record may include an `is_confidential` property (1 or true) when confidential.
   * @param {boolean} failed - True if fetching or parsing sellers.json failed.
   * @param {boolean} timedOut - True if fetching sellers.json timed out.
   */
  function applyStatus(statusEl, seatId, map, failed, timedOut) {
    if (timedOut) { statusEl.textContent = "⏱ Timeout"; statusEl.className = "seat-status no-sellers"; }
    else if (failed || !map) { statusEl.textContent = "🚫 No sellers.json"; statusEl.className = "seat-status no-sellers"; }
    else {
      const match = map[String(seatId).trim()];
      if (!match) { statusEl.textContent = "❌ Not found"; statusEl.className = "seat-status not-verified"; }
      else if (match.is_confidential === 1 || match.is_confidential === true) { statusEl.textContent = "⚠️ Confidential"; statusEl.className = "seat-status confidential"; }
      else { statusEl.textContent = "✅ Verified"; statusEl.className = "seat-status verified"; }
    }
  }

  /**
   * Create a DOM row representing a seat with an interactive ID, type badge, and status placeholder.
   *
   * @param {string} seatId - The seat identifier shown in the row and passed to the click handler to locate the seat in the file.
   * @param {string} type - The seat relationship, expected to be `"DIRECT"` or `"RESELLER"`; used to set the type badge class.
   * @param {(seatId: string) => void} onClickSeat - Callback invoked with `seatId` when the seat ID element is clicked.
   * @returns {HTMLDivElement} A `.seat-row` element containing three spans: `.seat-id` (clickable), `.seat-type`, and `.seat-status` (initially pending).
   */
  function buildSeatRow(seatId, type, onClickSeat) {
    const row = document.createElement("div");
    row.className = "seat-row";
    row.dataset.seatId = seatId;
    const idEl = document.createElement("span");
    idEl.className = "seat-id";
    idEl.textContent = seatId;
    idEl.title = "Click to locate in file";
    idEl.addEventListener("click", () => onClickSeat(seatId));
    const typeEl = document.createElement("span");
    typeEl.className = `seat-type ${type === "DIRECT" ? "direct" : "reseller"}`;
    typeEl.textContent = type;
    const statusEl = document.createElement("span");
    statusEl.className = "seat-status pending";
    statusEl.textContent = "—";
    row.appendChild(idEl);
    row.appendChild(typeEl);
    row.appendChild(statusEl);
    return row;
  }

  /**
   * Highlights the first occurrence of a seat ID inside the provided content container and scrolls it into view.
   *
   * Clears any existing `mark.seat-highlight` elements within contentEl, locates the first `.line` element whose
   * text contains seatId, wraps the first matched substring within that line in a `<mark class="seat-highlight">`,
   * and scrolls the line into view. Does nothing if no matching line is found.
   *
   * @param {HTMLElement} contentEl - Container element that holds `.line` elements to search.
   * @param {string} seatId - Exact seat identifier to locate and highlight.
   */
  function scrollToSeat(contentEl, seatId) {
    contentEl.querySelectorAll("mark.seat-highlight").forEach(m => {
      const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize();
    });
    const lines = contentEl.querySelectorAll(".line");
    let target = null;
    for (const line of lines) { if (line.textContent.includes(seatId)) { target = line; break; } }
    if (!target) return;
    const escaped = seatId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`);
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      const match = node.textContent.match(regex);
      if (!match) continue;
      const idx = match.index;
      const before = node.textContent.substring(0, idx);
      const matched = node.textContent.substring(idx, idx + seatId.length);
      const after = node.textContent.substring(idx + seatId.length);
      const mark = document.createElement("mark");
      mark.className = "seat-highlight";
      mark.textContent = matched;
      const parent = node.parentNode;
      if (before) parent.insertBefore(document.createTextNode(before), node);
      parent.insertBefore(mark, node);
      if (after) parent.insertBefore(document.createTextNode(after), node);
      parent.removeChild(node);
      break;
    }
    target.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  /**
   * Initialize and wire the seat-verification panel UI for a column of parsed seats.
   *
   * Configures the SSP dropdown, populates seat entries, and attaches handlers to
   * verify seats for a selected SSP or verify all SSPs concurrently. Updates the
   * given UI elements to show progress and per-seat verification status, and
   * allows clicking a seat entry to locate and highlight it inside the provided
   * content element.
   *
   * @param {Object} opts - Options and DOM elements used by the panel.
   * @param {Object<string, Array<{id: string, type: string}>>} opts.seatsBySSP - Mapping from SSP domain to an array of seats (each with `id` and `type`).
   * @param {HTMLElement} opts.seatPanel - Root container for the seat panel; will be shown or hidden depending on data.
   * @param {HTMLSelectElement} opts.sspDropdown - Dropdown element to select an SSP.
   * @param {HTMLButtonElement} opts.verifyBtn - Button to verify seats for the currently selected SSP.
   * @param {HTMLButtonElement} opts.verifyAllBtn - Button to verify seats across all SSPs.
   * @param {HTMLElement} opts.seatResults - Container where per-SSP seat rows and results will be rendered.
   * @param {HTMLElement} opts.verifyProgress - Progress UI wrapper shown while verifying all SSPs.
   * @param {HTMLElement} opts.progressBar - Element whose width represents verification progress.
   * @param {HTMLElement} opts.progressMsg - Element for optional progress messages (not required by every flow).
   * @param {HTMLElement} opts.progressCount - Element showing completed / total SSP count.
   * @param {HTMLElement} opts.contentEl - Column content element used to scroll-to and highlight a seat when its ID is clicked.
   */
  function setupSeatPanel(opts) {
    const { seatsBySSP, seatPanel, sspDropdown, verifyBtn, verifyAllBtn, seatResults, verifyProgress, progressBar, progressMsg, progressCount, contentEl } = opts;
    const sspList = Object.keys(seatsBySSP).sort();
    if (sspList.length === 0) { seatPanel.style.display = "none"; return; }
    seatPanel.style.display = "flex";
    sspDropdown.innerHTML = '<option value="">— SSP / Exchange —</option>';
    sspList.forEach(domain => {
      const opt = document.createElement("option");
      opt.value = domain;
      const count = seatsBySSP[domain].length;
      opt.textContent = `${domain}  (${count} seat${count !== 1 ? "s" : ""})`;
      sspDropdown.appendChild(opt);
    });
    verifyAllBtn.disabled = false;

    sspDropdown.onchange = () => {
      const selected = sspDropdown.value;
      seatResults.innerHTML = "";
      verifyBtn.disabled = true;
      if (!selected || !seatsBySSP[selected]) return;
      verifyBtn.disabled = false;
      seatsBySSP[selected].forEach(seat => {
        seatResults.appendChild(buildSeatRow(seat.id, seat.type, (id) => scrollToSeat(contentEl, id)));
      });
    };

    verifyBtn.onclick = async () => {
      const selected = sspDropdown.value;
      if (!selected) return;
      verifyBtn.disabled = true;
      verifyBtn.textContent = "…";
      seatResults.querySelectorAll(".seat-status").forEach(el => { el.textContent = "Fetching…"; el.className = "seat-status pending"; });
      const { map, failed, timedOut } = await fetchSellersJson(selected);
      seatResults.querySelectorAll(".seat-row").forEach(row => {
        applyStatus(row.querySelector(".seat-status"), row.dataset.seatId, map, failed, timedOut);
      });
      verifyBtn.textContent = "Verify";
      verifyBtn.disabled = false;
    };

    verifyAllBtn.onclick = async () => {
      seatResults.innerHTML = "";
      sspDropdown.value = "";
      verifyBtn.disabled = true;
      verifyAllBtn.disabled = true;
      verifyAllBtn.textContent = "Verifying…";
      verifyProgress.classList.add("visible");
      progressBar.style.width = "0%";
      const total = sspList.length;
      let completed = 0;
      progressCount.textContent = `0 / ${total}`;
      const localCache = {};
      await Promise.all(sspList.map(async domain => {
        localCache[domain] = await fetchSellersJson(domain);
        completed++;
        progressBar.style.width = `${Math.round((completed / total) * 100)}%`;
        progressCount.textContent = `${completed} / ${total}`;
      }));
      sspList.forEach(domain => {
        const group = document.createElement("div");
        group.className = "ssp-group";
        const label = document.createElement("div");
        label.className = "ssp-group-label";
        label.textContent = `${domain}  (${seatsBySSP[domain].length} seats)`;
        group.appendChild(label);
        const { map, failed, timedOut } = localCache[domain];
        seatsBySSP[domain].forEach(seat => {
          const row = buildSeatRow(seat.id, seat.type, (id) => scrollToSeat(contentEl, id));
          applyStatus(row.querySelector(".seat-status"), seat.id, map, failed, timedOut);
          group.appendChild(row);
        });
        seatResults.appendChild(group);
      });
      verifyProgress.classList.remove("visible");
      progressCount.textContent = "";
      verifyAllBtn.textContent = "All SSPs";
      verifyAllBtn.disabled = false;
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. MAIN ANALYSIS FLOW
  /**
   * Fetches and analyzes a domain's ads.txt and app-ads.txt files, then updates the UI with parsing results, stats, rendered columns, and seat-verification panels.
   *
   * This function normalizes the provided domain, attempts to retrieve both `/ads.txt` and `/app-ads.txt`, parses and summarizes their contents, updates status and statistics displays, renders each file's lines with highlights and discrepancy markers, and initializes per-column seat verification UI. If both files cannot be retrieved, a combined error message is shown.
   *
   * @param {string} domain - The domain to analyze; may include protocol or paths and will be normalized before use.
   */

  async function runAnalysis(domain) {
    domain = normalizeDomain(domain);
    if (!domain) { statusMsg.textContent = "Please enter a valid domain."; return; }

    statusMsg.style.display = "flex";
    statusMsg.textContent = `Fetching files from ${domain}…`;
    adsLink.href = `https://${domain}/ads.txt`;
    appadsLink.href = `https://${domain}/app-ads.txt`;
    adsRedirect.style.display = "none";
    appadsRedirect.style.display = "none";
    statsBar.style.display = "none";
    workspace.style.display = "none";
    analyzeBtn.disabled = true;
    adsSearch.reset();
    appadsSearch.reset();
    adsSeatPanel.style.display = "none";
    appadsSeatPanel.style.display = "none";

    const [adsResult, appadsResult] = await Promise.all([
      fetchFile(domain, "ads.txt"),
      fetchFile(domain, "app-ads.txt")
    ]);

    analyzeBtn.disabled = false;

    if (!adsResult.text && !appadsResult.text) {
      statusMsg.textContent = `Could not fetch files from ${domain}. ads.txt: ${adsResult.error}. app-ads.txt: ${appadsResult.error}.`;
      return;
    }

    if (adsResult.isRedirect) adsRedirect.style.display = "inline-block";
    if (appadsResult.isRedirect) appadsRedirect.style.display = "inline-block";

    const adsAnalysis = analyzeFile(adsResult.text);
    const appadsAnalysis = analyzeFile(appadsResult.text);

    statusMsg.style.display = "none";
    statsBar.style.display = "flex";
    workspace.style.display = "flex";

    updateStats("ads", adsAnalysis);
    updateStats("appads", appadsAnalysis);

    if (adsResult.text) {
      renderColumn(adsContent, adsAnalysis, appadsAnalysis.keySet);
    } else {
      adsContent.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "line line-error";
      msg.textContent = `Error: ${adsResult.error}`;
      adsContent.appendChild(msg);
    }

    if (appadsResult.text) {
      renderColumn(appadsContent, appadsAnalysis, adsAnalysis.keySet);
    } else {
      appadsContent.innerHTML = "";
      const msg = document.createElement("span");
      msg.className = "line line-error";
      msg.textContent = `Error: ${appadsResult.error}`;
      appadsContent.appendChild(msg);
    }

    setupSeatPanel({
      seatsBySSP: adsAnalysis.seatsBySSP, seatPanel: adsSeatPanel,
      sspDropdown: adsSspDropdown, verifyBtn: adsVerifyBtn, verifyAllBtn: adsVerifyAllBtn,
      seatResults: adsSeatResults, verifyProgress: adsVerifyProgress,
      progressBar: adsProgressBar, progressMsg: adsProgressMsg, progressCount: adsProgressCount,
      contentEl: adsContent
    });

    setupSeatPanel({
      seatsBySSP: appadsAnalysis.seatsBySSP, seatPanel: appadsSeatPanel,
      sspDropdown: appadsSspDropdown, verifyBtn: appadsVerifyBtn, verifyAllBtn: appadsVerifyAllBtn,
      seatResults: appadsSeatResults, verifyProgress: appadsVerifyProgress,
      progressBar: appadsProgressBar, progressMsg: appadsProgressMsg, progressCount: appadsProgressCount,
      contentEl: appadsContent
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. EVENT LISTENERS
  // ═══════════════════════════════════════════════════════════════════════════

  const initialDomain = normalizeDomain(new URLSearchParams(window.location.search).get("domain") || "");
  if (initialDomain) domainInput.value = initialDomain;

  analyzeBtn.addEventListener("click", () => runAnalysis(domainInput.value));
  domainInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runAnalysis(domainInput.value); });

  if (initialDomain) runAnalysis(initialDomain);
})();
