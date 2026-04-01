(() => {
  const adsTab = document.getElementById("ads-tab");
  const appAdsTab = document.getElementById("appads-tab");
  const sellerTab = document.getElementById("seller-tab");
  const output = document.getElementById("output");

  const filterArea = document.getElementById("filter-area");
  const filterLeftSection = document.getElementById("filter-left-section");
  const linkBlock = document.getElementById("link-block");
  const filterStatusText = document.getElementById("filter-status-text");

  const settingsToggle = document.getElementById("settings-toggle");
  const settingsPanel = document.getElementById("settings-panel");
  const urlInput = document.getElementById("sellers-url-input");
  const saveBtn = document.getElementById("save-settings");
  const refreshCacheBtn = document.getElementById("force-refresh-cache");

  const adsCountEl = document.getElementById("ads-line-count");
  const appAdsCountEl = document.getElementById("appads-line-count");
  const sellerCountEl = document.getElementById("seller-line-count");

  const statusContainer = document.getElementById("status-container");
  const fileDateEl = document.getElementById("file-date");
  const ownerBadgeEl = document.getElementById("owner-badge");
  const managerBadgeEl = document.getElementById("manager-badge");

  const qaBar = document.getElementById("quick-analyzer-bar");
  const qaLines = document.getElementById("qa-lines");
  const qaDupes = document.getElementById("qa-dupes");
  const qaErrors = document.getElementById("qa-errors");
  const qaRatio = document.getElementById("qa-ratio");
  const qaDR = document.getElementById("qa-dr");
  const qaBtn = document.getElementById("qa-btn");

  let adsData = { text: "", url: "", date: null };
  let appAdsData = { text: "", url: "", date: null };

  let sellersData = [];
  let current = "seller";
  let isFilterActive = true;
  let currentSellersUrl = DEFAULT_SELLERS_URL;
  let currentTabDomain = "";

  function sendMessageSafe(message, callback = () => {}) {
    if (!chrome.runtime || !chrome.runtime.id) return;
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) return;
      if (callback) callback(response);
    });
  }

  function updateFilterText() {
    const brand = getBrandName(currentSellersUrl);
    const icon = isFilterActive ? "✔" : "✖";
    filterStatusText.textContent = "";
    const iconSpan = document.createElement("span");
    iconSpan.className = "filter-icon";
    iconSpan.textContent = icon;
    filterStatusText.appendChild(iconSpan);
    filterStatusText.appendChild(document.createTextNode(` Show only ${brand}`));
  }

  function countLines(text, isError) {
    if (!text || isError) return "";
    const count = text.split("\n").filter(line => line.trim().length > 0).length;
    return count > 0 ? count : "0";
  }

  async function fetchTxtFile(base, name, force = false) {
    if (!base) return { text: `File ${name} not found.`, isError: true };
    const url = `${base.replace(/\/$/, "")}/${name}`;
    const fetchOptions = force ? { cache: "reload" } : {};
    try {
      const res = await fetchWithTimeoutAndRetry(url, { timeout: 8000, retries: 1, fetchOptions });
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.toLowerCase().includes("text/html")) {
        return { text: `Error: ${name} returned HTML header (likely a 404 page).`, isError: true };
      }
      let text = await res.text();
      text = text.replace(/\r\n|\r/g, "\n");
      const textTrimmed = text.trim();
      if (
        textTrimmed.startsWith("<!DOCTYPE") ||
        textTrimmed.startsWith("<html") ||
        textTrimmed.startsWith("<head") ||
        textTrimmed.startsWith("<body") ||
        textTrimmed.substring(0, 300).toLowerCase().includes("<script")
      ) {
        return { text: `Error: ${name} appears to be an HTML page (Soft 404), not a valid text file.`, isError: true };
      }
      const lastModified = res.headers.get("Last-Modified");
      return { text, finalUrl: res.url || url, lastModified, isError: false };
    } catch {
      return { text: `File ${name} not found (Network Error).`, isError: true };
    }
  }

  function checkDomainField(text, fieldName) {
    if (!text) return { status: "NOT FOUND", value: null };
    const lines = text.split(/\r?\n/);
    let foundRawValue = null;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (line.toUpperCase().startsWith(fieldName)) {
        let val = line.substring(fieldName.length).trim().replace(/^[,=:]/, "").trim();
        if (val) { foundRawValue = val.split(/\s+/)[0]; break; }
      }
    }
    if (!foundRawValue) return { status: "NOT FOUND", value: null };
    const valClean = cleanDomain(foundRawValue);
    const siteClean = cleanDomain(currentTabDomain);
    if (valClean === siteClean || siteClean.endsWith("." + valClean)) {
      return { status: "MATCH", value: foundRawValue };
    }
    return { status: "MISMATCH", value: foundRawValue };
  }

  function renderBadge(element, label, result) {
    element.innerHTML = "";
    if (result.status === "NOT FOUND") {
      element.className = "badge neutral";
      element.textContent = `${label}: NOT FOUND`;
    } else if (result.status === "MATCH") {
      element.className = "badge success";
      element.textContent = `${label}: MATCH`;
    } else {
      element.className = "badge error";
      element.textContent = `${label}: `;
      const href = safeHref(result.value);
      if (href) {
        const link = document.createElement("a");
        link.href = href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = result.value;
        link.style.color = "inherit";
        link.style.textDecoration = "underline";
        element.appendChild(link);
      } else {
        element.appendChild(document.createTextNode(result.value));
      }
    }
  }

  function buildSellerIdSet() {
    const idSet = new Set();
    if (!sellersData || sellersData.length === 0) return idSet;
    for (const s of sellersData) {
      idSet.add(String(s.seller_id));
    }
    return idSet;
  }

  function renderTextSafe(container, text) {
    container.innerHTML = "";
    if (!text) return;
    const brand = getBrandName(currentSellersUrl).toLowerCase();
    const highlightRegex = new RegExp(`(${brand})`, "gi");
    const sellerIdSet = buildSellerIdSet();
    const hasSellerData = sellersData && sellersData.length > 0;
    const fragment = document.createDocumentFragment();

    text.split("\n").forEach(line => {
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) return;

      const lineNode = document.createElement("div");
      lineNode.className = "line-row";
      let warningTitle = "";
      let isError = false;
      let isMismatch = false;

      if (trimmedLine.toLowerCase().includes(brand)) {
        const hasComma = trimmedLine.includes(",");
        const startsWithSpecial = /^[^a-zA-Z0-9]/.test(trimmedLine);

        if (startsWithSpecial && hasComma) {
          isError = true;
          warningTitle = "Error: Data line is commented out!";
          lineNode.classList.add("line-critical-error");
        }

        const parts = trimmedLine.split(",").map(p => p.trim());
        if (parts.length >= 2) {
          const cleanId = parts[1].split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, "");
          if (cleanId && hasSellerData && !sellerIdSet.has(cleanId)) {
            isMismatch = true;
            if (!isError && !startsWithSpecial) {
              lineNode.classList.add("line-warning");
              warningTitle = "Warning: ID not found in sellers.json";
            }
          }
        }
      }

      let lastIndex = 0; let match;
      while ((match = highlightRegex.exec(line)) !== null) {
        lineNode.appendChild(document.createTextNode(line.substring(lastIndex, match.index)));
        const b = document.createElement("b"); b.textContent = match[0];
        lineNode.appendChild(b);
        lastIndex = highlightRegex.lastIndex;
      }
      lineNode.appendChild(document.createTextNode(line.substring(lastIndex)));

      if (isError || (isMismatch && !/^[^a-zA-Z0-9]/.test(trimmedLine))) {
        const warnSpan = document.createElement("span");
        warnSpan.className = "warning-icon";
        warnSpan.textContent = isError ? "(X)" : "(!)";
        warnSpan.title = warningTitle;
        lineNode.appendChild(warnSpan);
      }
      fragment.appendChild(lineNode);
    });
    container.appendChild(fragment);
  }

  function filterAndRender(text, container) {
    const brand = getBrandName(currentSellersUrl).toLowerCase();
    if (!isFilterActive) { renderTextSafe(container, text); return; }
    const filtered = (text || "").split("\n").filter(l => l.toLowerCase().includes(brand));
    if (filtered.length === 0) { container.textContent = `No ${brand} matches.`; }
    else { renderTextSafe(container, filtered.join("\n")); }
  }

  function findSellerMatches() {
    const brand = getBrandName(currentSellersUrl).toLowerCase();
    const extractIds = (t) => {
      const set = new Set();
      (t || "").split("\n").forEach(l => {
        const trimmed = l.trim();
        if (trimmed.toLowerCase().includes(brand) && !/^[^a-zA-Z0-9]/.test(trimmed)) {
          const p = l.split(",").map(x => x.trim());
          if (p.length >= 2) { const id = p[1].replace(/[^a-zA-Z0-9]/g, ""); if (id) set.add(id); }
        }
      });
      return set;
    };
    const ids = new Set([...extractIds(adsData.text), ...extractIds(appAdsData.text)]);
    return sellersData.filter(rec => ids.has(String(rec.seller_id)));
  }

  /**
   * Update visibility and contents of the status area for the selected view.
   *
   * When `type` is "seller" the status area is hidden. For "ads" or "appads" the status
   * area is shown; the file's Last-Modified date (if present) is formatted as
   * "Modified: DD.MM.YYYY" and placed into the date element, and OWNER/MANAGER domain
   * checks are performed and rendered into their respective badges.
   *
   * @param {"seller"|"ads"|"appads"} type - The active view type determining what to display.
   */
  function updateStatusInfo(type) {
    if (type === "seller") { statusContainer.style.display = "none"; return; }
    statusContainer.style.display = "flex";
    const data = type === "ads" ? adsData : appAdsData;
    if (data.date) {
      const d = new Date(data.date);
      fileDateEl.textContent = `Modified: ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    } else { fileDateEl.textContent = ""; }

    const ownerRes = checkDomainField(data.text, "OWNERDOMAIN");
    renderBadge(ownerBadgeEl, "OWNER", ownerRes);

    const managerRes = checkDomainField(data.text, "MANAGERDOMAIN");
    renderBadge(managerBadgeEl, "MANAGER", managerRes);
  }

  /**
   * Create an anchor element that opens the given URL in a new tab or popup without navigating away from the current page.
   * @param {string} url - The destination URL the link should open.
   * @param {string} text - The visible text for the link.
   * @returns {HTMLAnchorElement} The configured anchor element. */
  function createNonClosingLink(url, text) {
    const a = document.createElement("a");
    a.href = url;
    a.textContent = text;
    a.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    });
    return a;
  }

  /**
   * Update the UI to display the active view (seller, ads, or app-ads), render the appropriate content, and update the extension badge count.
   *
   * When the active view is "seller", hides status and filter controls, renders matching sellers (highlighting any whose domain equals the current tab's domain), and updates the seller count. For "ads" or "appads", shows status and filter controls, displays the source URL (using a non-closing link when the URL is safe) and renders the file text according to the current filter settings. Always sends a message to set the extension badge to the current number of seller matches.
   */
  function showCurrent() {
    linkBlock.textContent = "";
    const brand = getBrandName(currentSellersUrl);
    if (current === "seller") {
      statusContainer.style.display = "none";
      filterArea.style.display = "none";
      const matches = findSellerMatches();
      sellerCountEl.textContent = matches.length || "0";
      output.innerHTML = "";
      if (matches.length === 0) {
        output.textContent = `No ${brand} matches.`;
      } else {
        const currentDomainClean = cleanDomain(currentTabDomain);
        matches.forEach(m => {
          const d = document.createElement("div");
          d.className = "line-row";
          const sellerDomainClean = cleanDomain(m.domain);
          if (sellerDomainClean === currentDomainClean && currentDomainClean !== "") {
            d.classList.add("highlight-own-domain");
          }
          d.textContent = `${m.domain} (${m.seller_id}) — ${m.seller_type}`;
          output.appendChild(d);
        });
      }
    } else {
      updateStatusInfo(current);
      filterArea.style.display = "flex";
      const data = current === "ads" ? adsData : appAdsData;
      if (data.url) {
        const href = safeHref(data.url);
        if (href) {
          // Use non-closing link instead of regular <a>
          const link = createNonClosingLink(href, data.url);
          linkBlock.appendChild(link);
        } else {
          linkBlock.textContent = data.url;
        }
      }
      filterAndRender(data.text, output);
    }
    sendMessageSafe({ type: "setBadge", count: findSellerMatches().length });
  }

  function setActive(tab) { current = tab; [adsTab, appAdsTab, sellerTab].forEach(b => b.classList.toggle("active", b.id === `${tab}-tab`)); showCurrent(); }

  settingsToggle.addEventListener("click", () => { settingsPanel.style.display = settingsPanel.style.display === "none" ? "flex" : "none"; });

  saveBtn.addEventListener("click", () => {
    const newUrl = urlInput.value.trim();
    if (newUrl) {
      chrome.storage.local.set({ [CUSTOM_URL_KEY]: newUrl }, () => {
        if (chrome.runtime.lastError) return;
        currentSellersUrl = newUrl; updateFilterText();
        sendMessageSafe({ type: "refreshSellers" }, () => loadData(true));
      });
    }
  });

  refreshCacheBtn.addEventListener("click", () => {
    refreshCacheBtn.textContent = "..."; refreshCacheBtn.disabled = true;
    sendMessageSafe({ type: "refreshSellers" }, () => {
      loadData(true).then(() => {
        refreshCacheBtn.textContent = "Cache"; refreshCacheBtn.disabled = false;
      });
    });
  });

  adsTab.addEventListener("click", () => setActive("ads"));
  appAdsTab.addEventListener("click", () => setActive("appads"));
  sellerTab.addEventListener("click", () => setActive("seller"));
  filterLeftSection.addEventListener("click", () => { isFilterActive = !isFilterActive; filterArea.classList.toggle("active", isFilterActive); updateFilterText(); showCurrent(); });

  qaBtn.addEventListener("click", () => {
      const targetUrl = chrome.runtime.getURL(`ui/analyzer/analyzer.html?domain=${currentTabDomain || ""}`);
    
      chrome.windows.create({
        url: targetUrl,
        type: "popup",
        width: 1050,
        height: 700
      });
    });

  function calcFileStats(text) {
    if (!text) return { lines: 0, dupes: 0, errors: 0, direct: 0, reseller: 0 };
    const lines = text.split("\n");
    let validLines = 0, errors = 0, direct = 0, reseller = 0;
    const seen = new Set();
    let dupes = 0;

    lines.forEach(raw => {
      const trimmed = raw.trim();
      if (!trimmed) return;

      const startsSpecial = /^[^a-zA-Z0-9]/.test(trimmed);
      const hasComma = trimmed.includes(",");

      if (startsSpecial && hasComma) {
        errors++;
        return;
      }
      if (startsSpecial) return; 

      const upper = trimmed.toUpperCase();
      if (upper.startsWith("OWNERDOMAIN") || upper.startsWith("MANAGERDOMAIN") || upper.startsWith("CONTACT") || upper.startsWith("SUBDOMAIN")) {
        return;
      }

      const parts = trimmed.split(",").map(p => p.trim());
      if (parts.length < 3) { errors++; return; }

      const domain = parts[0].toLowerCase();
      const pubId = parts[1];
      const relationship = parts[2].toUpperCase();

      if (!domain || !pubId || (relationship !== "DIRECT" && relationship !== "RESELLER")) {
        errors++;
        return;
      }

      const key = `${domain}|${pubId}`.toLowerCase();
      if (seen.has(key)) { dupes++; } else { seen.add(key); }

      validLines++;
      if (relationship === "DIRECT") direct++;
      else if (relationship === "RESELLER") reseller++;
    });

    return { lines: validLines, dupes, errors, direct, reseller };
  }

  /**
   * Update the quick-analyzer UI with aggregated statistics from the loaded ads and app-ads texts.
   *
   * Updates and shows the analyzer bar, fills total lines, duplicates, errors, and the direct/reseller counts,
   * and sets the D/R ratio display (text and CSS class) according to three states:
   * - "—" when both direct and reseller counts are zero (neutral),
   * - a one-decimal numeric ratio when reseller > 0 (green when ratio >= 1, red when < 1),
   * - "∞" when reseller is zero and direct > 0 (green).
   *
   * This function mutates DOM elements: qaBar, qaLines, qaDupes, qaErrors, qaRatio, and qaDR.
   */
  function updateQuickAnalyzer() {
    if (!qaBar) return;
    qaBar.style.display = "flex";
    const adsStats = calcFileStats(adsData.text);
    const appStats = calcFileStats(appAdsData.text);

    const tLines = adsStats.lines + appStats.lines;
    const tDupes = adsStats.dupes + appStats.dupes;
    const tErrors = adsStats.errors + appStats.errors;
    const tDirect = adsStats.direct + appStats.direct;
    const tReseller = adsStats.reseller + appStats.reseller;

    qaLines.textContent = tLines;
    qaDupes.textContent = tDupes;
    qaErrors.textContent = tErrors;
    qaRatio.textContent = `${tDirect} / ${tReseller}`;

    // D/R ratio with color coding
    if (qaDR) {
      let drText = "—";
      let drClass = "dr-neutral";
      if (tReseller > 0) {
        const r = tDirect / tReseller;
        drText = r.toFixed(1);
        drClass = r >= 1 ? "dr-green" : "dr-red";
      } else if (tDirect > 0) {
        drText = "∞";
        drClass = "dr-green";
      }
      qaDR.textContent = drText;
      qaDR.className = `qa-dr-value ${drClass}`;
    }
  }

  /**
   * Load ads.txt and app-ads.txt (optionally forcing reload), refresh the sellers cache, and update UI state.
   *
   * Reads a custom sellers URL from storage and updates filter text, determines the active tab's origin and domain,
   * fetches and normalizes ads/app-ads contents (respecting the `force` hint), updates internal data objects
   * (`adsData`, `appAdsData`), updates line counters and the quick-analyzer, requests the sellers cache to populate
   * `sellersData`, and re-renders the current view.
   *
   * @param {boolean} [force=false] - When true, attempt to bypass cached responses and force reloading remote files.
   */
  async function loadData(force = false) {
    output.textContent = "Loading...";
    return new Promise((resolve) => {
      chrome.storage.local.get([CUSTOM_URL_KEY], (res) => {
        if (chrome.runtime.lastError) return resolve();
        if (res[CUSTOM_URL_KEY]) { currentSellersUrl = res[CUSTOM_URL_KEY]; urlInput.value = currentSellersUrl; }
        updateFilterText();
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
          if (chrome.runtime.lastError || !tabs || !tabs[0]) return resolve();
          let origin = "";
          try { const u = new URL(tabs[0].url); if (u.protocol.startsWith("http")) { origin = u.origin; currentTabDomain = u.hostname; } } catch {}
          const [adsRes, appRes] = await Promise.all([
            fetchTxtFile(origin, "ads.txt", force),
            fetchTxtFile(origin, "app-ads.txt", force)
          ]);
          adsData = { text: adsRes.text, url: adsRes.finalUrl || (origin ? `${origin}/ads.txt` : ""), date: adsRes.lastModified };
          appAdsData = { text: appRes.text, url: appRes.finalUrl || (origin ? `${origin}/app-ads.txt` : ""), date: appRes.lastModified };
          
          adsCountEl.textContent = countLines(adsData.text, adsRes.isError);
          appAdsCountEl.textContent = countLines(appAdsData.text, appRes.isError);
          
          updateQuickAnalyzer();

          sendMessageSafe({ type: "getSellersCache" }, (resp) => {
            sellersData = (resp && resp.sellers) || [];
            showCurrent(); resolve();
          });
        });
      });
    });
  }

  loadData(false);
  if (isFilterActive) filterArea.classList.add("active");
})();
