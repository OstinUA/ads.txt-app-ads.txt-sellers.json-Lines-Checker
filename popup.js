(() => {
  const tabs = { appads: document.getElementById("appads-tab"), ads: document.getElementById("ads-tab") };
  const output = document.getElementById("output"), filter = document.getElementById("filter-checkbox"), link = document.getElementById("link-block");
  let data = { ads: { text: "0", url: "" }, appads: { text: "0", url: "" } }, sellers = [], current = "appads";

  const loadFile = async (origin, name) => {
    try {
      const r = await fetch(`${origin.replace(/\/$/, "")}/${name}`);
      return { text: r.ok ? await r.text() : "0", url: r.ok ? r.url : "" };
    } catch { return { text: "0", url: "" }; }
  };

  const render = () => {
    link.innerHTML = data[current].url ? `<a href="${data[current].url}" target="_blank">${data[current].url}</a>` : "";
    let lines = data[current].text.split("\n");
    if (filter.checked) lines = lines.filter(l => l.includes("adwmg.com"));
    output.innerHTML = "";
    if (lines.length === 0 || (lines.length === 1 && lines[0] === "0")) {
      output.textContent = "0";
    } else {
      lines.forEach(l => {
        const d = document.createElement("div");
        d.innerHTML = l.replace(/(adwmg\.com)/gi, "<b>$1</b>");
        output.appendChild(d);
      });
    }
  };

  const init = async () => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (t) => {
      const origin = new URL(t[0].url).origin;
      const res = await Promise.all([loadFile(origin, "app-ads.txt"), loadFile(origin, "ads.txt")]);
      data.appads = res[0]; data.ads = res[1];
      chrome.runtime.sendMessage({ type: "getSellersCache" }, r => { sellers = r?.sellers || []; render(); });
    });
  };

  tabs.appads.onclick = () => { current = "appads"; tabs.appads.className = "tab active"; tabs.ads.className = "tab"; render(); };
  tabs.ads.onclick = () => { current = "ads"; tabs.ads.className = "tab active"; tabs.appads.className = "tab"; render(); };
  filter.onchange = render;
  init();
})();