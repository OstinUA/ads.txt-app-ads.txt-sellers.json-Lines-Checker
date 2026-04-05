(() => {
  const rawText = document.body.textContent || document.body.innerText || "";

  function findDomainField(text, fieldName) {
    if (!text) return null;
    const lines = text.split(/\r\n|\r|\n/);
    for (const rawLine of lines) {
      const line = rawLine.replace(/^[\s#]+/, "");
      const regex = new RegExp(`^${fieldName}\\s*[=,:]?\\s*([^\\s#,]+)`, "i");
      const match = line.match(regex);
      if (match) return match[1];
    }
    return null;
  }

  const owner = findDomainField(rawText, "OWNERDOMAIN");
  const manager = findDomainField(rawText, "MANAGERDOMAIN");
  const contact = findDomainField(rawText, "CONTACT");
  const contactEmail = findDomainField(rawText, "CONTACT-EMAIL");

  const isAdsTxt = /,\s*(DIRECT|RESELLER)/i.test(rawText) || 
                   /OWNERDOMAIN\s*=/i.test(rawText) || 
                   /MANAGERDOMAIN\s*=/i.test(rawText);

  let container = null;

  if (owner || manager || contact || contactEmail) {
    container = document.createElement("div");
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(30, 30, 30, 0.8);
      color: #c9d1d9;
      padding: 15px 20px;
      border-radius: 6px;
      z-index: 2147483647;
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      font-size: 14px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      border: 1px solid #30363d;
      min-width: 400px;
      backdrop-filter: blur(5px);
      line-height: 1.5;
    `;

    const hasDomains = owner || manager;
    const hasContact = contact || contactEmail;

    if (hasDomains) {
      const title = document.createElement("div");
      title.textContent = "Domains Found:";
      title.style.cssText = "font-size: 12px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; font-weight: bold;";
      container.appendChild(title);
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

    function createRow(label, value, isLink) {
      if (!value) return;

      const row = document.createElement("div");
      row.style.marginBottom = "6px";

      const labelSpan = document.createElement("span");
      labelSpan.textContent = `${label}: `;
      labelSpan.style.fontWeight = "bold";
      labelSpan.style.marginRight = "5px";
      labelSpan.style.color = "#21aeb3";

      if (isLink !== false) {
        const href = safeHref(value);
        if (href) {
          const link = document.createElement("a");
          link.href = href;
          link.textContent = value;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.style.cssText = "color: white; text-decoration: none; cursor: pointer;";
          row.appendChild(labelSpan);
          row.appendChild(link);
        } else {
          row.appendChild(labelSpan);
          row.appendChild(document.createTextNode(value));
        }
      } else {
        row.appendChild(labelSpan);
        row.appendChild(document.createTextNode(value));
      }

      container.appendChild(row);
    }

    createRow("OwnerDomain", owner);
    createRow("ManagerDomain", manager);

    if (hasDomains && hasContact) {
      const divider = document.createElement("div");
      divider.style.cssText = "border-top: 1px solid #30363d; margin: 10px 0 15px 0;";
      container.appendChild(divider);
    }

    if (hasContact) {
      const contactTitle = document.createElement("div");
      contactTitle.textContent = "Contact Info:";
      contactTitle.style.cssText = "font-size: 12px; color: #aaa; margin-bottom: 8px; text-transform: uppercase; font-weight: bold;";
      container.appendChild(contactTitle);
    }

    createRow("Contact", contact);
    createRow("Contact-email", contactEmail, false);

    const closeBtn = document.createElement("div");
    closeBtn.textContent = "×";
    closeBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 8px;
      cursor: pointer;
      color: #aaa;
      font-size: 18px;
      line-height: 12px;
    `;
    closeBtn.onclick = () => container.remove();
    closeBtn.onmouseover = () => closeBtn.style.color = "#fff";
    closeBtn.onmouseout = () => closeBtn.style.color = "#aaa";
    container.appendChild(closeBtn);

    document.body.appendChild(container);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function applySyntaxHighlighting() {
    if (!isAdsTxt) return;

    const lines = rawText.split(/\r?\n/);
    const highlightedLines = lines.map(line => {
      let cleanLine = line.replace(/\r$/, '');
      
      if (cleanLine.trim().startsWith("#")) {
        return `<span style="color: #ffffff;">${escapeHtml(cleanLine)}</span>`;
      }

      let commentPart = "";
      let dataPart = cleanLine;
      const hashIdx = cleanLine.indexOf("#");
      
      if (hashIdx !== -1) {
        dataPart = cleanLine.substring(0, hashIdx);
        commentPart = cleanLine.substring(hashIdx);
      }

      let resultHtml = "";
      const varMatch = dataPart.match(/^(\s*[A-Za-z0-9-]+\s*)([=:])(.*)$/);
      const upperKey = varMatch ? varMatch[1].trim().toUpperCase() : "";

      if (varMatch && ["OWNERDOMAIN", "MANAGERDOMAIN", "CONTACT", "SUBDOMAIN", "CONTACT-EMAIL"].includes(upperKey)) {
        resultHtml = `<span style="color: #d2a8ff;">${escapeHtml(varMatch[1])}</span>` +
                     escapeHtml(varMatch[2]) +
                     `<span style="color: #79c0ff;">${escapeHtml(varMatch[3])}</span>`;
      } 
      else if (dataPart.includes(",")) {
        const parts = dataPart.split(",");
        for (let i = 0; i < parts.length; i++) {
          let partText = escapeHtml(parts[i]);
          let coloredPart = partText;
          let trimmed = parts[i].trim();

          if (i === 0) {
            if (trimmed) {
              let href = trimmed;
              if (!href.startsWith("http://") && !href.startsWith("https://")) {
                href = "https://" + href;
              }
              coloredPart = `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color: #21aeb3; text-decoration: none;">${partText}</a>`;
            } else {
              coloredPart = `<span style="color: #21aeb3;">${partText}</span>`;
            }
          } else if (i === 1) {
            coloredPart = `<span style="color: #e8a007;">${partText}</span>`;
          } else if (i === 2) {
            const upType = trimmed.toUpperCase();
            if (upType === "DIRECT") {
              coloredPart = `<span style="color: #10bc89;">${partText}</span>`;
            } else if (upType === "RESELLER") {
              coloredPart = `<span style="color: #e03131;">${partText}</span>`;
            }
          } else if (i === 3) {
            coloredPart = `<span style="color: #8896a6;">${partText}</span>`;
          }

          resultHtml += coloredPart;
          if (i < parts.length - 1) resultHtml += ",";
        }
      } else {
        resultHtml = escapeHtml(dataPart);
      }

      if (commentPart) {
        resultHtml += `<span style="color: #8896a6;">${escapeHtml(commentPart)}</span>`;
      }

      return resultHtml;
    });

    document.body.innerHTML = "";
    document.body.style.margin = "0";
    document.body.style.paddingTop = "30px";
    
    const newPre = document.createElement("pre");
    newPre.style.wordWrap = "break-word";
    newPre.style.whiteSpace = "pre-wrap";
    newPre.style.fontFamily = "monospace";
    newPre.style.fontSize = "13px";
    newPre.style.padding = "8px";
    newPre.style.margin = "0";
    newPre.innerHTML = highlightedLines.join("\n");

    document.body.appendChild(newPre);

    if (container) {
      document.body.appendChild(container);
    }

    const leftContainer = document.createElement("div");
    leftContainer.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      z-index: 2147483647;
      display: flex;
      align-items: center;
    `;

    const analyzeBtn = document.createElement("button");
    analyzeBtn.textContent = "Analyzer .txt file";
    analyzeBtn.style.cssText = `
      background: transparent;
      color: #fff;
      border: 1px solid #8896a6;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 500;
      font-size: 12px;
      font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
      transition: background 0.2s, color 0.2s;
      outline: none;
    `;
    
    analyzeBtn.onmouseover = () => {
      analyzeBtn.style.background = "#21aeb3";
      analyzeBtn.style.color = "#000";
    };
    analyzeBtn.onmouseout = () => {
      analyzeBtn.style.background = "transparent";
      analyzeBtn.style.color = "#fff";
    };
    
    analyzeBtn.onclick = () => {
      const currentDomain = window.location.hostname;
      chrome.runtime.sendMessage({ type: "openAnalyzer", domain: currentDomain });
    };

    leftContainer.appendChild(analyzeBtn);
    document.body.appendChild(leftContainer);
  }

  applySyntaxHighlighting();

})();