(() => {
  function findDomainField(text, fieldName) {
    if (!text) return null;
    const lines = text.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.replace(/^[\s#]+/, "");
      const regex = new RegExp(`^${fieldName}\\s*[=,:]?\\s*([^\\s#,]+)`, "i");
      const match = line.match(regex);
      if (match) return match[1];
    }
    return null;
  }

  const content = document.body.innerText || document.body.textContent;

  const owner = findDomainField(content, "OWNERDOMAIN");
  const manager = findDomainField(content, "MANAGERDOMAIN");
  const contact = findDomainField(content, "CONTACT");
  const contactEmail = findDomainField(content, "CONTACT-EMAIL");

  if (!owner && !manager && !contact && !contactEmail) return;

  const container = document.createElement("div");
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
        link.style.cssText = "color: white; text-decoration: underline; cursor: pointer;";
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
})();