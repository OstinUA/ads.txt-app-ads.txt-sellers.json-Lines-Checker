(() => {

  // DOM references
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

  // Keep analyzer links in a new tab so users do not lose this view.

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

  function normalizeDomain(raw) {
    let d = raw.trim().toLowerCase();
    d = d.replace(/^https?:\/\//, "");
    d = d.replace(/^www\./, "");
    d = d.replace(/\/+$/, "");
    return d;
  }

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

  function computeRatio(direct, reseller) {
    if (reseller > 0) {
      const r = direct / reseller;
      return { text: r.toFixed(1), cls: r >= 1 ? "green" : "red" };
    } else if (direct > 0) {
      return { text: "∞", cls: "green" };
    }
    return { text: "N/A", cls: "neutral" };
  }

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

  function updateStats(prefix, analysis) {
    document.getElementById(`${prefix}-total`).textContent = `Lines: ${analysis.totalData}`;
    document.getElementById(`${prefix}-dupes`).textContent = `Dupes: ${analysis.duplicates.size}`;
    document.getElementById(`${prefix}-errors`).textContent = `Errors: ${analysis.errors}`;

    const ratio = computeRatio(analysis.direct, analysis.reseller);
    const ratioEl = document.getElementById(`${prefix}-ratio-display`);
    ratioEl.textContent = `D/R: ${ratio.text}`;
    ratioEl.className = `stat-item ratio-${ratio.cls}`;
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

  const sellersJsonCache = {};

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

  const initialDomain = normalizeDomain(new URLSearchParams(window.location.search).get("domain") || "");
  if (initialDomain) domainInput.value = initialDomain;

  analyzeBtn.addEventListener("click", () => runAnalysis(domainInput.value));
  domainInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runAnalysis(domainInput.value); });

  if (initialDomain) runAnalysis(initialDomain);
})();
