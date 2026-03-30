const DEFAULT_SELLERS_URL = "https://adwmg.com/sellers.json";
const CUSTOM_URL_KEY = "custom_sellers_url";

function getBrandName(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split(".");
    if (parts.length >= 2) {
      const last = parts[parts.length - 1];
      const secondLast = parts[parts.length - 2];
      if (parts.length > 2 && (secondLast === "co" || secondLast === "com") && last.length === 2) {
        return parts[parts.length - 3];
      }
      return secondLast;
    }
    return parts[0] || "adwmg";
  } catch {
    return "adwmg";
  }
}

function cleanDomain(input) {
  if (!input) return "";
  let d = input.trim().toLowerCase();
  try {
    const withProtocol = d.includes("://") ? d : "https://" + d;
    const hostname = new URL(withProtocol).hostname;
    return hostname.replace(/^www\./, "").replace(/\.+/g, ".");
  } catch {
    d = d.replace(/^https?:\/\//, "");
    d = d.replace(/^www\./, "");
    d = d.replace(/\.+/g, ".");
    d = d.split(/[/?#\s,;=:@]/)[0];
    return d;
  }
}

function safeHref(value) {
  if (!value) return null;
  let href = value.trim();
  if (!href.startsWith("http://") && !href.startsWith("https://")) {
    href = "https://" + href;
  }
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    return null;
  } catch {
    return null;
  }
}

async function fetchWithTimeoutAndRetry(url, { timeout = 8000, retries = 1, fetchOptions = {} } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal, ...fetchOptions });
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
