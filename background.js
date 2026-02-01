const DEFAULT_SELLERS_URL = "https://adwmg.com/sellers.json";
const CACHE_KEY = "adwmg_sellers_cache";
const CACHE_TS_KEY = "adwmg_sellers_ts";

const BADGE_BG_COLOR = "#21aeb3";
const BADGE_EMPTY_COLOR = "#FF0000";
const SCAN_COOLDOWN_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

const FIXED_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const INITIAL_DELAY_MS = 3000;
const RETRY_INTERVAL_MS = 5000;
const MAX_RETRIES = 3;

const countsByTab = Object.create(null);
const lastScanAt = Object.create(null);
const scheduledTimers = Object.create(null);
const retryAttempts = Object.create(null);

async function fetchWithTimeoutAndRetry(url, { timeout = FETCH_TIMEOUT_MS, retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(id);
      if (attempt === retries) throw err;
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
}

async function fetchAndCacheSellers(force = false) {
  try {
    const res = await fetchWithTimeoutAndRetry(DEFAULT_SELLERS_URL);
    const data = await res.json();
    const sellers = Array.isArray(data.sellers) ? data.sellers : [];
    await chrome.storage.local.set({ [CACHE_KEY]: sellers, [CACHE_TS_KEY]: Date.now() });
    return sellers;
  } catch { return null; }
}

function applyBadgeForTab(tabId) {
  const count = countsByTab[tabId] || 0;
  chrome.action.setBadgeText({ text: String(count), tabId: tabId });
  chrome.action.setBadgeBackgroundColor({ 
    color: count > 0 ? BADGE_BG_COLOR : BADGE_EMPTY_COLOR, 
    tabId: tabId 
  });
}

async function executeCountAdwmgLines(tabId, origin) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (originUrl, timeoutMs) => {
        const fetchFile = (url) => new Promise(resolve => {
          const controller = new AbortController();
          const id = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
          fetch(url, { signal: controller.signal, credentials: "same-origin" })
            .then(r => r.ok ? r.text() : null).then(t => { clearTimeout(id); resolve(t); })
            .catch(() => { clearTimeout(id); resolve(null); });
        });
        const count = (text) => text ? text.split("\n").filter(l => l.includes("adwmg.com")).length : 0;
        return (async () => {
          const baseUrl = originUrl.replace(/\/$/, "");
          const [ads, app] = await Promise.all([fetchFile(`${baseUrl}/ads.txt`), fetchFile(`${baseUrl}/app-ads.txt`)]);
          return { ok: true, adsCount: count(ads), appAdsCount: count(app), appFailed: app === null };
        })();
      },
      args: [origin, FETCH_TIMEOUT_MS]
    });
    if (!results || !results[0]?.result) return { ok: false, count: 0 };
    const res = results[0].result;
    let total = res.adsCount + res.appAdsCount;
    if (res.appFailed) {
      try {
        const r = await fetchWithTimeoutAndRetry(`${origin.replace(/\/$/, "")}/app-ads.txt`, { retries: 0 });
        const t = await r.text();
        total += t.split("\n").filter(l => l.includes("adwmg.com")).length;
      } catch {}
    }
    return { ok: true, count: total };
  } catch { return { ok: false, count: 0 }; }
}

async function retryScanForTab(tabId) {
  if (scheduledTimers[tabId]) clearTimeout(scheduledTimers[tabId]);
  const current = (retryAttempts[tabId] || 0) + 1;
  retryAttempts[tabId] = current;
  
  const tab = await new Promise(r => chrome.tabs.get(tabId, t => r(chrome.runtime.lastError ? null : t)));
  if (tab?.url?.startsWith("http")) {
    const scan = await executeCountAdwmgLines(tabId, new URL(tab.url).origin);
    countsByTab[tabId] = scan.count || 0;
    applyBadgeForTab(tabId);
    if (countsByTab[tabId] === 0 && current < MAX_RETRIES) {
      scheduledTimers[tabId] = setTimeout(() => retryScanForTab(tabId), RETRY_INTERVAL_MS);
      return;
    }
  }
  delete retryAttempts[tabId];
}

chrome.tabs.onActivated.addListener(i => { applyBadgeForTab(i.tabId); setTimeout(() => retryScanForTab(i.tabId), INITIAL_DELAY_MS); });
chrome.tabs.onUpdated.addListener((id, c) => { if (c.url) { countsByTab[id] = 0; applyBadgeForTab(id); retryScanForTab(id); } });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "getSellersCache") {
    chrome.storage.local.get([CACHE_KEY, CACHE_TS_KEY], res => {
      if (!res[CACHE_TS_KEY] || (Date.now() - res[CACHE_TS_KEY]) > FIXED_CACHE_TTL_MS) fetchAndCacheSellers();
      sendResponse({ sellers: res[CACHE_KEY] || [] });
    });
    return true;
  }
  if (msg.type === "setBadge") {
    const id = sender?.tab?.id;
    if (id) { countsByTab[id] = msg.count; applyBadgeForTab(id); }
  }
});