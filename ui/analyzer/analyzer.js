(() => {
  /* ═══════════════════════════════════════════════════════════════════════════
     analyzer.js — Enhanced ads.txt / app-ads.txt Analyzer
     Version 7.4.0
     ═══════════════════════════════════════════════════════════════════════════ */

  const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
  const FETCH_CONCURRENCY = 15;
  const SELLERS_CACHE_TTL_MS = 10 * 60 * 1000;

  const domainInput  = document.getElementById("domain-input");
  const analyzeBtn   = document.getElementById("analyze-btn");
  const statsBar     = document.getElementById("stats-bar");
  const workspace    = document.getElementById("workspace");
  const statusMsg    = document.getElementById("status-msg");

  const adsContent    = document.getElementById("ads-content");
  const appadsContent = document.getElementById("appads-content");

  const adsLink        = document.getElementById("ads-link");
  const appadsLink     = document.getElementById("appads-link");
  const adsRedirect    = document.getElementById("ads-redirect");
  const appadsRedirect = document.getElementById("appads-redirect");

  const adsTotal         = document.getElementById("ads-total");
  const adsDupes         = document.getElementById("ads-dupes");
  const adsErrors        = document.getElementById("ads-errors");
  const adsRatioDisplay  = document.getElementById("ads-ratio-display");
  const appadsTotal        = document.getElementById("appads-total");
  const appadsDupes        = document.getElementById("appads-dupes");
  const appadsErrors       = document.getElementById("appads-errors");
  const appadsRatioDisplay = document.getElementById("appads-ratio-display");

  const adsSearchInput = document.getElementById("ads-search");
  const adsSearchCount = document.getElementById("ads-search-count");
  const adsSearchPrev  = document.getElementById("ads-search-prev");
  const adsSearchNext  = document.getElementById("ads-search-next");

  const appadsSearchInput = document.getElementById("appads-search");
  const appadsSearchCount = document.getElementById("appads-search-count");
  const appadsSearchPrev  = document.getElementById("appads-search-prev");
  const appadsSearchNext  = document.getElementById("appads-search-next");

  const adslinePanel       = document.getElementById("ads-line-panel");
  const adsSspDropdown     = document.getElementById("ads-ssp-dropdown");
  const adsVerifyBtn       = document.getElementById("ads-verify-btn");
  const adsVerifyAllBtn    = document.getElementById("ads-verify-all-btn");
  const adsCancelBtn       = document.getElementById("ads-cancel-btn");
  const adslineResults     = document.getElementById("ads-line-results");
  const adsVerifyProgress  = document.getElementById("ads-verify-progress");
  const adsProgressBar     = document.getElementById("ads-progress-bar");
  const adsProgressMsg     = document.getElementById("ads-progress-msg");
  const adsProgressCount   = document.getElementById("ads-progress-count");

  const appadslinePanel       = document.getElementById("appads-line-panel");
  const appadsSspDropdown     = document.getElementById("appads-ssp-dropdown");
  const appadsVerifyBtn       = document.getElementById("appads-verify-btn");
  const appadsVerifyAllBtn    = document.getElementById("appads-verify-all-btn");
  const appadsCancelBtn       = document.getElementById("appads-cancel-btn");
  const appadslineResults     = document.getElementById("appads-line-results");
  const appadsVerifyProgress  = document.getElementById("appads-verify-progress");
  const appadsProgressBar     = document.getElementById("appads-progress-bar");
  const appadsProgressMsg     = document.getElementById("appads-progress-msg");
  const appadsProgressCount   = document.getElementById("appads-progress-count");

  let analysisGeneration = 0;

  function setupLinkNavigation(linkEl) {
    if (!linkEl) return;
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

  async function readResponseWithLimit(response, limit) {
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > limit) return null;

    const reader = response.body.getReader();
    const chunks = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.length;
      if (totalBytes > limit) {
        reader.cancel();
        return null;
      }
      chunks.push(value);
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder().decode(merged);
  }

  async function fetchFile(domain, filename) {
    const url = `https://${domain}/${filename}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const finalUrl = res.url || url;
      let isRedirect = res.redirected;
      try {
        const finalPath = new URL(finalUrl).pathname.toLowerCase().replace(/\/$/, "");
        if (!finalPath.endsWith("/" + filename.toLowerCase()) && finalPath !== "/" + filename.toLowerCase()) {
          isRedirect = true;
        }
      } catch { }

      if (!res.ok) return { text: null, error: `HTTP ${res.status}`, isRedirect };
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (ct.includes("text/html")) return { text: null, error: "Returned HTML (likely 404)", isRedirect };

      const text = await readResponseWithLimit(res, MAX_RESPONSE_BYTES);
      if (text === null) return { text: null, error: "Response too large (>5 MB)", isRedirect };

      const normalized = text.replace(/\r\n|\r/g, "\n");
      const trimmed = normalized.trim();
      if (
        trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") ||
        trimmed.startsWith("<head") || trimmed.substring(0, 300).toLowerCase().includes("<script")
      ) {
        return { text: null, error: "Soft 404 (HTML content)", isRedirect };
      }
      return { text: normalized, error: null, isRedirect };
    } catch (e) {
      return { text: null, error: e.message || "Network error", isRedirect: false };
    }
  }

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
    if (startsSpecial && hasComma) return { type: "error", raw, trimmed, reason: "Data line is commented out" };
    if (trimmed.startsWith("#") || startsSpecial) return { type: "comment", raw, trimmed };
    const dataOnly = trimmed.replace(/#.*$/, "").trim();
    const parts = dataOnly.split(",").map(p => p.trim());
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
      key: `${domain}|${pubId}|${relationship}`.toLowerCase()
    };
  }

  function analyzeFile(text) {
    const empty = {
      lines: [], totalData: 0, duplicateCount: 0, duplicateIndices: new Set(),
      errors: 0, direct: 0, reseller: 0, keySet: new Set(), linesBySSP: {},
      loaded: false
    };
    if (!text) return empty;
    const rawLines = text.split("\n");
    const lines = rawLines.map(parseLine);
    const seen = {};
    const duplicateIndices = new Set();
    let errors = 0, direct = 0, reseller = 0, duplicateCount = 0;
    const keySet = new Set();
    const linesBySSP = {};

    lines.forEach((line, idx) => {
      if (line.type === "error") {
        errors++;
      } else if (line.type === "data") {
        if (seen[line.key] !== undefined) {
          if (!duplicateIndices.has(seen[line.key])) duplicateIndices.add(seen[line.key]);
          duplicateIndices.add(idx);
          duplicateCount++;
        } else {
          seen[line.key] = idx;
        }
        keySet.add(line.key);
        if (line.relationship === "DIRECT") direct++;
        else reseller++;
        if (!linesBySSP[line.domain]) linesBySSP[line.domain] = [];
        linesBySSP[line.domain].push({ id: line.pubId, type: line.relationship });
      }
    });
    const totalData = lines.filter(l => l.type === "data").length;
    return {
      lines, totalData, duplicateCount, duplicateIndices,
      errors, direct, reseller, keySet, linesBySSP, loaded: true
    };
  }

  function computeRatio(direct, reseller) {
    if (reseller > 0) {
      const r = direct / reseller;
      return { text: r.toFixed(1), cls: r >= 1 ? "green" : "red" };
    } else if (direct > 0) {
      return { text: "∞", cls: "green" };
    }
    return { text: "N/A", cls: "neutral" };
  }

  function renderColumn(container, analysis, otherAnalysis) {
    container.innerHTML = "";
    const { lines, duplicateIndices } = analysis;
    const otherKeySet = otherAnalysis.loaded ? otherAnalysis.keySet : null;
    const fragment = document.createDocumentFragment();
    lines.forEach((line, idx) => {
      const el = document.createElement("span");
      el.className = "line";
      el.dataset.lineIdx = idx;
      if (line.type === "error") {
        el.classList.add("line-error");
        el.title = line.reason;
      } else if (line.type === "data" && duplicateIndices.has(idx)) {
        el.classList.add("line-duplicate");
        el.title = "Duplicate line";
      } else if (line.type === "data" && otherKeySet && !otherKeySet.has(line.key)) {
        el.classList.add("line-discrepancy");
        el.title = "Not found in the other file";
      }
      el.textContent = line.raw;
      fragment.appendChild(el);
    });
    container.appendChild(fragment);
  }

  function updateStats(prefix, analysis) {
    const totalEl = document.getElementById(`${prefix}-total`);
    const dupesEl = document.getElementById(`${prefix}-dupes`);
    const errorsEl = document.getElementById(`${prefix}-errors`);
    const ratioEl = document.getElementById(`${prefix}-ratio-display`);
    if (totalEl) totalEl.textContent = `Lines: ${analysis.totalData}`;
    if (dupesEl) dupesEl.textContent = `Dupes: ${analysis.duplicateCount}`;
    if (errorsEl) errorsEl.textContent = `Errors: ${analysis.errors}`;
    if (ratioEl) {
      const ratio = computeRatio(analysis.direct, analysis.reseller);
      ratioEl.textContent = `D/R: ${ratio.text}`;
      ratioEl.className = `stat-item ratio-${ratio.cls}`;
    }
  }

  function createSearchController(searchInput, countEl, prevBtn, nextBtn, contentEl) {
    let matches = [];
    let currentIdx = -1;

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

    function highlightAllOccurrences(lineEl, query) {
      const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      for (const node of textNodes) {
        const text = node.textContent;
        const lower = text.toLowerCase();
        let searchFrom = 0;
        const fragments = [];
        let lastEnd = 0;
        while (searchFrom < lower.length) {
          const idx = lower.indexOf(query, searchFrom);
          if (idx === -1) break;
          if (idx > lastEnd) fragments.push(document.createTextNode(text.substring(lastEnd, idx)));
          const mark = document.createElement("mark");
          mark.className = "search-highlight";
          mark.textContent = text.substring(idx, idx + query.length);
          fragments.push(mark);
          lastEnd = idx + query.length;
          searchFrom = lastEnd;
        }
        if (fragments.length === 0) continue;
        if (lastEnd < text.length) fragments.push(document.createTextNode(text.substring(lastEnd)));
        const parent = node.parentNode;
        for (const frag of fragments) parent.insertBefore(frag, node);
        parent.removeChild(node);
      }
    }

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
        if (lineEl.textContent.toLowerCase().includes(query)) {
          matches.push(lineEl);
          lineEl.classList.add("line-search-match");
          highlightAllOccurrences(lineEl, query);
        }
      });
      if (matches.length > 0) { currentIdx = 0; focusCurrent(); }
      updateCounter();
      prevBtn.disabled = matches.length === 0;
      nextBtn.disabled = matches.length === 0;
    }

    function focusCurrent() {
      contentEl.querySelectorAll(".line-search-current").forEach(el => el.classList.remove("line-search-current"));
      contentEl.querySelectorAll("mark.search-highlight-current").forEach(m => { m.className = "search-highlight"; });
      if (currentIdx >= 0 && currentIdx < matches.length) {
        const lineEl = matches[currentIdx];
        lineEl.classList.add("line-search-current");
        const firstMark = lineEl.querySelector("mark.search-highlight");
        if (firstMark) firstMark.className = "search-highlight-current";
        lineEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      updateCounter();
    }

    function updateCounter() {
      if (matches.length === 0) countEl.textContent = searchInput.value.trim() ? "0/0" : "";
      else countEl.textContent = `${currentIdx + 1}/${matches.length}`;
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
        if (e.shiftKey) { if (matches.length > 0) { currentIdx = (currentIdx - 1 + matches.length) % matches.length; focusCurrent(); } }
        else { if (matches.length > 0) { currentIdx = (currentIdx + 1) % matches.length; focusCurrent(); } }
      }
    });
    return { reset: () => { clearHighlights(); matches = []; currentIdx = -1; countEl.textContent = ""; searchInput.value = ""; } };
  }

  const adsSearch = createSearchController(adsSearchInput, adsSearchCount, adsSearchPrev, adsSearchNext, adsContent);
  const appadsSearch = createSearchController(appadsSearchInput, appadsSearchCount, appadsSearchPrev, appadsSearchNext, appadsContent);

  const sellersJsonCache = {};

  function getCachedSellers(domain) {
    const entry = sellersJsonCache[domain];
    if (!entry) return null;
    if (Date.now() - entry.ts > SELLERS_CACHE_TTL_MS) { delete sellersJsonCache[domain]; return null; }
    return entry.data;
  }

  function setCachedSellers(domain, data) {
    const keys = Object.keys(sellersJsonCache);
    if (keys.length > 200) {
      keys.sort((a, b) => sellersJsonCache[a].ts - sellersJsonCache[b].ts);
      for (let i = 0; i < 50; i++) delete sellersJsonCache[keys[i]];
    }
    sellersJsonCache[domain] = { data, ts: Date.now() };
  }

  async function fetchSellersJson(domain, signal) {
    const cached = getCachedSellers(domain);
    if (cached) return cached;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      if (signal) signal.addEventListener("abort", () => controller.abort(), { once: true });
      const res = await fetch(`https://${domain}/sellers.json`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) {
        const r = { map: null, failed: true, timedOut: false };
        setCachedSellers(domain, r);
        return r;
      }
      const text = await readResponseWithLimit(res, MAX_RESPONSE_BYTES);
      if (text === null) {
        const r = { map: null, failed: true, timedOut: false };
        setCachedSellers(domain, r);
        return r;
      }
      let json;
      try { json = JSON.parse(text); } catch {
        const r = { map: null, failed: true, timedOut: false };
        setCachedSellers(domain, r);
        return r;
      }
      const map = {};
      (json.sellers || []).forEach(s => { if (s.seller_id != null) map[String(s.seller_id).trim()] = s; });
      const r = { map, failed: false, timedOut: false };
      setCachedSellers(domain, r);
      return r;
    } catch (err) {
      const r = { map: null, failed: true, timedOut: err.name === "AbortError" };
      if (!r.timedOut) setCachedSellers(domain, r);
      return r;
    }
  }

  async function runWithConcurrency(tasks, limit, signal) {
    const results = new Array(tasks.length);
    let nextIdx = 0;
    async function worker() {
      while (nextIdx < tasks.length) {
        if (signal && signal.aborted) return;
        const idx = nextIdx++;
        results[idx] = await tasks[idx]();
      }
    }
    const workers = [];
    for (let i = 0; i < Math.min(limit, tasks.length); i++) workers.push(worker());
    await Promise.all(workers);
    return results;
  }

  function applyStatus(statusEl, lineId, map, failed, timedOut) {
    if (timedOut) { statusEl.textContent = "⧖ Timeout"; statusEl.className = "line-status timeout"; }
    else if (failed || !map) { statusEl.textContent = "∅ No sellers.json"; statusEl.className = "line-status no-sellers"; }
    else {
      const match = map[String(lineId).trim()];
      if (!match) { statusEl.textContent = "✕ Not found"; statusEl.className = "line-status not-verified"; }
      else if (match.is_confidential === 1 || match.is_confidential === true) { statusEl.textContent = "! Confidential"; statusEl.className = "line-status confidential"; }
      else { statusEl.textContent = "✓ Verified"; statusEl.className = "line-status verified"; }
    }
  }

  function buildlineRow(lineId, type, onClickline) {
    const row = document.createElement("div");
    row.className = "line-row";
    row.dataset.lineId = lineId;
    const idEl = document.createElement("span");
    idEl.className = "line-id";
    idEl.textContent = lineId;
    idEl.title = "Click to locate in file";
    idEl.addEventListener("click", () => onClickline(lineId));
    const typeEl = document.createElement("span");
    typeEl.className = `line-type ${type === "DIRECT" ? "direct" : "reseller"}`;
    typeEl.textContent = type;
    const statusEl = document.createElement("span");
    statusEl.className = "line-status pending";
    statusEl.textContent = "—";
    row.appendChild(idEl);
    row.appendChild(typeEl);
    row.appendChild(statusEl);
    return row;
  }

  function scrollToline(contentEl, lineId) {
    contentEl.querySelectorAll("mark.line-highlight").forEach(m => {
      const p = m.parentNode;
      p.replaceChild(document.createTextNode(m.textContent), m);
      p.normalize();
    });
    if (!/^[\w.\-:]+$/.test(lineId)) return;
    const lines = contentEl.querySelectorAll(".line");
    let target = null;
    for (const line of lines) { if (line.textContent.includes(lineId)) { target = line; break; } }
    if (!target) return;
    const escaped = lineId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(${escaped})`);
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, null);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);
    for (const node of textNodes) {
      const match = node.textContent.match(regex);
      if (!match) continue;
      const idx = match.index;
      const before = node.textContent.substring(0, idx);
      const matched = node.textContent.substring(idx, idx + lineId.length);
      const after = node.textContent.substring(idx + lineId.length);
      const mark = document.createElement("mark");
      mark.className = "line-highlight";
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

  function setuplinePanel(opts) {
    const {
      linesBySSP, linePanel, sspDropdown, verifyBtn, verifyAllBtn, cancelBtn,
      lineResults, verifyProgress, progressBar, progressMsg, progressCount, contentEl
    } = opts;

    const sspList = Object.keys(linesBySSP).sort();
    if (sspList.length === 0) { linePanel.style.display = "none"; return; }
    linePanel.style.display = "flex";

    sspDropdown.innerHTML = '<option value="">Select SSP platform</option>';
    sspList.forEach(domain => {
      const opt = document.createElement("option");
      opt.value = domain;
      const count = linesBySSP[domain].length;
      opt.textContent = `${domain}  (${count} line${count !== 1 ? "s" : ""})`;
      sspDropdown.appendChild(opt);
    });
    verifyAllBtn.disabled = false;

    let allSspAbort = null;

    sspDropdown.onchange = () => {
      const selected = sspDropdown.value;
      lineResults.innerHTML = "";
      verifyBtn.disabled = true;
      if (!selected || !linesBySSP[selected]) return;
      verifyBtn.disabled = false;
      linesBySSP[selected].forEach(line => {
        lineResults.appendChild(buildlineRow(line.id, line.type, (id) => scrollToline(contentEl, id)));
      });
    };

    verifyBtn.onclick = async () => {
      const selected = sspDropdown.value;
      if (!selected) return;
      verifyBtn.disabled = true;
      verifyBtn.textContent = "…";
      lineResults.querySelectorAll(".line-status").forEach(el => {
        el.textContent = "Fetching…";
        el.className = "line-status pending";
      });
      const { map, failed, timedOut } = await fetchSellersJson(selected);
      lineResults.querySelectorAll(".line-row").forEach(row => {
        applyStatus(row.querySelector(".line-status"), row.dataset.lineId, map, failed, timedOut);
      });
      verifyBtn.textContent = "Verify";
      verifyBtn.disabled = false;
    };

    cancelBtn.onclick = () => { if (allSspAbort) allSspAbort.abort(); };

    verifyAllBtn.onclick = async () => {
      lineResults.innerHTML = "";
      sspDropdown.value = "";
      verifyBtn.disabled = true;
      
      verifyAllBtn.style.display = "none";
      cancelBtn.style.display = "inline-block";
      
      verifyProgress.classList.add("visible");
      progressBar.style.width = "0%";
      const total = sspList.length;
      let completed = 0;
      progressCount.textContent = `0 / ${total}`;

      allSspAbort = new AbortController();
      const localCache = {};

      const tasks = sspList.map(domain => async () => {
        if (allSspAbort.signal.aborted) return;
        localCache[domain] = await fetchSellersJson(domain, allSspAbort.signal);
        completed++;
        progressBar.style.width = `${Math.round((completed / total) * 100)}%`;
        progressCount.textContent = `${completed} / ${total}`;
      });

      await runWithConcurrency(tasks, FETCH_CONCURRENCY, allSspAbort.signal);

      sspList.forEach(domain => {
        if (!localCache[domain]) return;
        const group = document.createElement("div");
        group.className = "ssp-group";
        const label = document.createElement("div");
        label.className = "ssp-group-label";
        label.textContent = `${domain}  (${linesBySSP[domain].length} lines)`;
        group.appendChild(label);
        const { map, failed, timedOut } = localCache[domain];
        linesBySSP[domain].forEach(line => {
          const row = buildlineRow(line.id, line.type, (id) => scrollToline(contentEl, id));
          applyStatus(row.querySelector(".line-status"), line.id, map, failed, timedOut);
          group.appendChild(row);
        });
        lineResults.appendChild(group);
      });

      verifyProgress.classList.remove("visible");
      progressCount.textContent = "";
      
      cancelBtn.style.display = "none";
      verifyAllBtn.style.display = "inline-block";
      verifyAllBtn.disabled = false;
      allSspAbort = null;
    };
  }

  async function runAnalysis(domain) {
    domain = (typeof cleanDomain === "function" ? cleanDomain(domain) : normalizeDomainFallback(domain));
    if (!domain) { statusMsg.textContent = "Please enter a valid domain."; return; }
    const thisGeneration = ++analysisGeneration;

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
    adslinePanel.style.display = "none";
    appadslinePanel.style.display = "none";

    const [adsResult, appadsResult] = await Promise.all([
      fetchFile(domain, "ads.txt"),
      fetchFile(domain, "app-ads.txt")
    ]);

    if (thisGeneration !== analysisGeneration) return;
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

    if (adsResult.text) renderColumn(adsContent, adsAnalysis, appadsAnalysis);
    else { adsContent.innerHTML = ""; const msg = document.createElement("span"); msg.className = "line line-error"; msg.textContent = `Error: ${adsResult.error}`; adsContent.appendChild(msg); }

    if (appadsResult.text) renderColumn(appadsContent, appadsAnalysis, adsAnalysis);
    else { appadsContent.innerHTML = ""; const msg = document.createElement("span"); msg.className = "line line-error"; msg.textContent = `Error: ${appadsResult.error}`; appadsContent.appendChild(msg); }

    setuplinePanel({
      linesBySSP: adsAnalysis.linesBySSP, linePanel: adslinePanel,
      sspDropdown: adsSspDropdown, verifyBtn: adsVerifyBtn, verifyAllBtn: adsVerifyAllBtn,
      cancelBtn: adsCancelBtn, lineResults: adslineResults,
      verifyProgress: adsVerifyProgress, progressBar: adsProgressBar,
      progressMsg: adsProgressMsg, progressCount: adsProgressCount,
      contentEl: adsContent
    });

    setuplinePanel({
      linesBySSP: appadsAnalysis.linesBySSP, linePanel: appadslinePanel,
      sspDropdown: appadsSspDropdown, verifyBtn: appadsVerifyBtn, verifyAllBtn: appadsVerifyAllBtn,
      cancelBtn: appadsCancelBtn, lineResults: appadslineResults,
      verifyProgress: appadsVerifyProgress, progressBar: appadsProgressBar,
      progressMsg: appadsProgressMsg, progressCount: appadsProgressCount,
      contentEl: appadsContent
    });
  }

  function normalizeDomainFallback(raw) {
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, "");
    d = d.replace(/^www\./, "");
    d = d.replace(/\/+$/, "");
    return d;
  }

  const initialDomain = (typeof cleanDomain === "function" ? cleanDomain : normalizeDomainFallback)(
    new URLSearchParams(window.location.search).get("domain") || ""
  );
  if (initialDomain) domainInput.value = initialDomain;

  analyzeBtn.addEventListener("click", () => runAnalysis(domainInput.value));
  domainInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runAnalysis(domainInput.value); });
  if (initialDomain) runAnalysis(initialDomain);
})();