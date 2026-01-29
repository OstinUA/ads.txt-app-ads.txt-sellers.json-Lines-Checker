const adsTab = document.getElementById("ads-tab");
const appAdsTab = document.getElementById("appads-tab");
const sellerTab = document.getElementById("seller-tab");
const output = document.getElementById("output");
const filterCheckbox = document.getElementById("filter-checkbox");
const filterBlock = document.getElementById("filter-block");
const linkBlock = document.getElementById("link-block");

let adsText = "";
let appAdsText = "";
let adsUrl = "";
let appAdsUrl = "";
let sellersData = [];
let current = "ads";

// --- Helper: get current domain ---
async function getDomain() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      try {
        const url = new URL(tabs[0].url);
        resolve(url.origin);
      } catch (e) {
        resolve("");
      }
    });
  });
}

// --- Fetch with redirect support ---
async function fetchTxtFile(baseUrl, filename) {
  if (!baseUrl) return { text: `File ${filename} not found.`, finalUrl: "" };
  try {
    const url = `${baseUrl}/${filename}`;
    const res = await fetch(url, { redirect: "follow" });

    let finalUrl = url;
    if (res.redirected && res.url && res.url !== url) {
      finalUrl = res.url;
      const redirectedRes = await fetch(res.url, { redirect: "follow" });
      if (!redirectedRes.ok) throw new Error("redirect fetch failed");
      return { text: await redirectedRes.text(), finalUrl };
    }

    if (!res.ok) throw new Error("not found");
    return { text: await res.text(), finalUrl };
  } catch (err) {
    console.warn("Error fetching:", baseUrl, filename, err);
    return { text: `File ${filename} not found.`, finalUrl: "" };
  }
}

// --- Load sellers.json from adWMG ---
async function fetchSellers() {
  try {
    const res = await fetch("https://adwmg.com/sellers.json");
    if (!res.ok) throw new Error("not found");
    const data = await res.json();
    sellersData = data.sellers || [];
  } catch {
    sellersData = [];
  }
}

// --- Load ads.txt and app-ads.txt ---
async function loadData() {
  const domain = await getDomain();

  const adsResult = await fetchTxtFile(domain, "ads.txt");
  adsText = adsResult.text;
  adsUrl = adsResult.finalUrl || `${domain}/ads.txt`;

  const appResult = await fetchTxtFile(domain, "app-ads.txt");
  appAdsText = appResult.text;
  appAdsUrl = appResult.finalUrl || `${domain}/app-ads.txt`;

  await fetchSellers();
  showCurrent();
}

// --- Highlight adwmg text ---
function highlightAdwmg(text) {
  return text.replace(/(adwmg)/gi, "<b>$1</b>");
}

// --- Filter text for adwmg lines ---
function filterText(text) {
  if (!filterCheckbox.checked) return highlightAdwmg(text);
  const filtered = text
    .split("\n")
    .filter(line => /adwmg/i.test(line))
    .join("\n");
  return filtered ? highlightAdwmg(filtered) : "No matches found.";
}

// --- Extract seller IDs from adwmg lines only ---
function extractAdwmgSellerIds(text) {
  const ids = new Set();
  const lines = text.split("\n");
  for (const line of lines) {
    if (/adwmg/i.test(line)) {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
        ids.add(parts[1]);
      }
    }
  }
  return ids;
}

// --- Find matches in sellers.json based only on adwmg lines ---
function findSellerMatchesForAdwmg() {
  const idsFromAds = extractAdwmgSellerIds(adsText);
  const idsFromAppAds = extractAdwmgSellerIds(appAdsText);
  const combinedIds = new Set([...idsFromAds, ...idsFromAppAds]);

  const results = [];
  for (const rec of sellersData) {
    if (combinedIds.has(String(rec.seller_id))) {
      results.push({
        domain: rec.domain || "-",
        seller_id: rec.seller_id || "-",
        seller_type: rec.seller_type || "-"
      });
    }
  }

  return results;
}

// --- Show current tab content ---
function showCurrent() {
  let linkHtml = "";

  if (current === "ads") {
    filterBlock.style.display = "block";
    linkHtml = adsUrl ? `<a href="${adsUrl}" target="_blank">${adsUrl}</a>` : "";
    output.innerHTML = filterText(adsText);

  } else if (current === "appads") {
    filterBlock.style.display = "block";
    linkHtml = appAdsUrl ? `<a href="${appAdsUrl}" target="_blank">${appAdsUrl}</a>` : "";
    output.innerHTML = filterText(appAdsText);

  } else if (current === "seller") {
    filterBlock.style.display = "none";
    linkHtml = "";

    const matches = findSellerMatchesForAdwmg();
    if (matches.length === 0) {
      output.innerText = "No adwmg.com matches found.";
    } else {
      const lines = matches.map(m => `${m.domain} (${m.seller_id}) — ${m.seller_type}`);
      output.innerText = lines.join("\n");
    }
  }

  linkBlock.innerHTML = linkHtml;
}

// --- Tab handling ---
adsTab.addEventListener("click", () => setActive("ads"));
appAdsTab.addEventListener("click", () => setActive("appads"));
sellerTab.addEventListener("click", () => setActive("seller"));
filterCheckbox.addEventListener("change", showCurrent);

function setActive(tab) {
  current = tab;
  [adsTab, appAdsTab, sellerTab].forEach(b => b.classList.remove("active"));
  if (tab === "ads") adsTab.classList.add("active");
  if (tab === "appads") appAdsTab.classList.add("active");
  if (tab === "seller") sellerTab.classList.add("active");
  showCurrent();
}

// --- Default state ---
filterCheckbox.checked = true;
loadData();
