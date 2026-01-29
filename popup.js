const adsTab = document.getElementById("ads-tab");
const appAdsTab = document.getElementById("appads-tab");
const sellerTab = document.getElementById("seller-tab");
const output = document.getElementById("output");
const filterCheckbox = document.getElementById("filter-checkbox");
const filterBlock = document.getElementById("filter-block");

let adsText = "";
let appAdsText = "";
let sellersData = [];
let current = "ads";
let matchedSellerIds = new Set();

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

async function fetchTxtFile(baseUrl, filename) {
  if (!baseUrl) return `${filename} file not found.`;
  try {
    const res = await fetch(`${baseUrl}/${filename}`);
    if (!res.ok) throw new Error("not found");
    return await res.text();
  } catch {
    return `${filename} file not found.`;
  }
}

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

async function loadData() {
  const domain = await getDomain();
  adsText = await fetchTxtFile(domain, "ads.txt");
  appAdsText = await fetchTxtFile(domain, "app-ads.txt");
  await fetchSellers();
  showCurrent();
}

function filterText(text) {
  matchedSellerIds.clear();

  if (!filterCheckbox.checked) return highlightAdwmg(text);

  const filtered = text
    .split("\n")
    .filter(line => /adwmg/i.test(line))
    .map(line => {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length >= 2 && /^\d+$/.test(parts[1])) {
        matchedSellerIds.add(parts[1]);
      }
      return line;
    });

  return highlightAdwmg(filtered.join("\n") || "No matches found.");
}

function highlightAdwmg(text) {
  return text.replace(/(adwmg.com)/gi, "<b>$1</b>");
}

function findSellerMatchesFromFiltered() {
  if (matchedSellerIds.size === 0) return [];

  const results = [];
  for (const id of matchedSellerIds) {
    const found = sellersData.filter(s => String(s.seller_id) === id);
    for (const rec of found) {
      results.push({
        domain: rec.domain || "-",
        seller_id: id,
        seller_type: rec.seller_type || "-"
      });
    }
  }
  return results;
}

function showCurrent() {
  if (current === "ads") {
    filterBlock.style.display = "block";
    output.innerHTML = filterText(adsText);
  } else if (current === "appads") {
    filterBlock.style.display = "block";
    output.innerHTML = filterText(appAdsText);
  } else if (current === "seller") {
    filterBlock.style.display = "none";
    const matches = findSellerMatchesFromFiltered();
    if (matches.length === 0) {
      output.innerText = "No matches found.";
      return;
    }
    const lines = matches.map(m => `${m.domain} (${m.seller_id}) — ${m.seller_type}`);
    output.innerText = lines.join("\n");
  }
}

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

loadData();
