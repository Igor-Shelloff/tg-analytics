window.TG = window.TG || {};

TG.ui = (function () {

  function icon(name, cls) {
    const c = cls ? `icon ${cls}` : "icon";
    return `<svg class="${c}"><use href="#i-${name}"/></svg>`;
  }

  const toastRoot = () => document.getElementById("toasts");

  function toast(message, kind = "info", ttl = 4000) {
    const root = toastRoot();
    if (!root) return;
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    const ic = kind === "ok" ? "check" : kind === "err" ? "alert" : "send";
    el.innerHTML = `${icon(ic)}<div>${message}</div>`;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .25s, transform .25s";
      el.style.opacity = "0";
      el.style.transform = "translateX(40px)";
      setTimeout(() => el.remove(), 260);
    }, ttl);
  }

  function modal({ title, content, actions = [], width, closable = true }) {
    const root = document.getElementById("modals");
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const box = document.createElement("div");
    box.className = "modal";
    if (width) box.style.maxWidth = width + "px";

    const h = document.createElement("h3");
    h.textContent = title || "";
    box.appendChild(h);

    if (typeof content === "string") {
      const body = document.createElement("div");
      body.innerHTML = content;
      box.appendChild(body);
    } else if (content instanceof HTMLElement) {
      box.appendChild(content);
    }

    const actionsEl = document.createElement("div");
    actionsEl.className = "modal-actions";
    actions.forEach(a => {
      const b = document.createElement("button");
      b.className = `btn ${a.variant ? "btn-" + a.variant : ""}`;
      b.textContent = a.label;
      b.onclick = () => {
        if (a.onClick) a.onClick();
        close();
      };
      actionsEl.appendChild(b);
    });
    if (actions.length) box.appendChild(actionsEl);

    overlay.appendChild(box);
    root.appendChild(overlay);

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.style.transition = "opacity .15s";
      overlay.style.opacity = "0";
      setTimeout(() => overlay.remove(), 150);
    }

    if (closable) {
      overlay.addEventListener("click", e => {
        if (e.target === overlay) close();
      });
    }

    return { close, el: box };
  }

  function closeAllModals() {
    document.querySelectorAll("#modals .modal-overlay").forEach(el => {
      el.style.transition = "opacity .15s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 150);
    });
  }

  return { icon, toast, modal, closeAllModals };
})();
