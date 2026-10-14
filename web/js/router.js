window.TG = window.TG || {};
TG.pages = TG.pages || {};

TG.router = (function () {
  let current = null;
  let container = null;
  let titleEl = null;

  function init(opts) {
    container = opts.container;
    titleEl = opts.titleEl;
  }

  function go(name, params) {
    const page = TG.pages[name];
    if (!page) {
      console.warn("Unknown page:", name);
      return;
    }
    current = name;

    document.querySelectorAll(".nav-item").forEach(el => {
      el.classList.toggle("active", el.dataset.route === name);
    });

    if (titleEl) titleEl.textContent = TG.i18n.t(page.titleKey || "");

    container.innerHTML = "";
    const node = page.render(params || {});
    if (typeof node === "string") container.innerHTML = node;
    else if (node instanceof HTMLElement) container.appendChild(node);

    TG.i18n.apply(container);
    if (page.onMount) page.onMount();
  }

  return { init, go, get current() { return current; } };
})();
