(function () {

  let currentUser = "";

  function renderBoot() {
    const app = document.getElementById("app");
    app.innerHTML = `
      <div class="boot">
        <div class="boot-logo">
          <svg class="icon" style="width:32px;height:32px;">
            <use href="#i-send"/>
          </svg>
        </div>
        <div class="boot-text" id="boot-text"></div>
      </div>`;
    const el = document.getElementById("boot-text");
    if (el) el.textContent = TG.i18n.t("boot.checking");
  }

  function showCodeModal() {
    const input = document.createElement("input");
    input.className = "input";
    input.placeholder = "12345";
    input.style.textAlign = "center";
    input.style.fontSize = "18px";
    input.style.letterSpacing = "0.3em";

    const m = TG.ui.modal({
      title: TG.i18n.t("login.code_title"),
      content: input,
      actions: [
        { label: TG.i18n.t("common.cancel"), variant: "ghost",
          onClick: () => TG.api.cancelAuth() },
        { label: TG.i18n.t("common.confirm"), variant: "primary",
          onClick: () => {
            const code = input.value.trim();
            if (!code) return;
            TG.api.submitCode(code);
          } },
      ],
      width: 380,
    });

    input.focus();
    input.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const code = input.value.trim();
        if (code) {
          TG.api.submitCode(code);
          m.close();
        }
      }
    });
  }

  function showPasswordModal() {
    const input = document.createElement("input");
    input.className = "input";
    input.type = "password";
    input.placeholder = "••••••••";

    const m = TG.ui.modal({
      title: TG.i18n.t("login.password_title"),
      content: input,
      actions: [
        { label: TG.i18n.t("common.cancel"), variant: "ghost",
          onClick: () => TG.api.cancelAuth() },
        { label: TG.i18n.t("common.confirm"), variant: "primary",
          onClick: () => {
            const pwd = input.value;
            if (!pwd) return;
            TG.api.submitPassword(pwd);
          } },
      ],
      width: 380,
    });

    input.focus();
    input.addEventListener("keydown", e => {
      if (e.key === "Enter" && input.value) {
        TG.api.submitPassword(input.value);
        m.close();
      }
    });
  }

  let activeQrModal = null;

  function showQrModal(url, image) {
    if (activeQrModal) {
      try { activeQrModal.close(); } catch (_) {}
      activeQrModal = null;
    }
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <div class="modal-qr"><img src="${image}" alt="QR"></div>
      <p class="muted" style="font-size:11px;text-align:center;word-break:break-all;">
        ${url}
      </p>`;
    activeQrModal = TG.ui.modal({
      title: TG.i18n.t("login.qr_title"),
      content: wrap,
      actions: [
        { label: TG.i18n.t("common.cancel"), variant: "ghost",
          onClick: () => {
            activeQrModal = null;
            TG.api.cancelAuth();
          } },
      ],
      width: 420,
    });
  }

  let currentThemeMode = "system";
  let systemThemeMq = null;

  function systemPrefersDark() {
    if (!systemThemeMq) {
      systemThemeMq = window.matchMedia("(prefers-color-scheme: dark)");
    }
    return systemThemeMq.matches;
  }

  function applyTheme(theme) {
    if (theme !== "light" && theme !== "dark" && theme !== "system") {
      theme = "system";
    }
    currentThemeMode = theme;
    document.documentElement.setAttribute("data-theme", theme);
    updateSystemThemeListener();
    updateThemeButton();
  }

  function updateSystemThemeListener() {
    if (!systemThemeMq) {
      systemThemeMq = window.matchMedia("(prefers-color-scheme: dark)");
    }
    if (systemThemeMq._tgHandler) {
      if (systemThemeMq.removeEventListener) {
        systemThemeMq.removeEventListener("change", systemThemeMq._tgHandler);
      } else if (systemThemeMq.removeListener) {
        systemThemeMq.removeListener(systemThemeMq._tgHandler);
      }
      systemThemeMq._tgHandler = null;
    }

    if (currentThemeMode !== "system") return;

    systemThemeMq._tgHandler = () => {
      document.documentElement.setAttribute("data-theme", "system");
      try {
        if (TG.router && TG.router.current) {
          TG.router.go(TG.router.current);
        }
      } catch (_) {}
    };

    if (systemThemeMq.addEventListener) {
      systemThemeMq.addEventListener("change", systemThemeMq._tgHandler);
    } else if (systemThemeMq.addListener) {
      systemThemeMq.addListener(systemThemeMq._tgHandler);
    }
  }

  function updateThemeButton() {
    const btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;
    const iconName = currentThemeMode === "light" ? "sun"
                   : currentThemeMode === "dark" ? "moon"
                   : "monitor";
    const titleKey = `theme.tooltip_${currentThemeMode}`;
    btn.innerHTML = TG.ui.icon(iconName);
    btn.setAttribute("title", TG.i18n.t(titleKey));
  }

  function cycleTheme() {
    const order = ["system", "dark", "light"];
    const idx = order.indexOf(currentThemeMode);
    const next = order[(idx + 1) % order.length];
    applyTheme(next);
    TG.api.setTheme(next);
    TG.ui.toast(TG.i18n.t(`theme.changed_${next}`), "ok", 2000);

    if (TG.router && TG.router.current === "dashboard"
        && TG.pages.dashboard && TG.pages.dashboard.refresh) {
      TG.pages.dashboard.refresh();
    }
  }

  let collectState = { active: false, done: 0, total: 0, title: "" };

  function updateCollectorBar() {
    const el = document.getElementById("topbar-status");
    if (!el) return;
    if (!collectState.active || collectState.total === 0) {
      el.innerHTML = "";
      el.classList.remove("visible");
      return;
    }
    el.classList.add("visible");
    const text = TG.i18n.t("topbar.collecting", {
      done: collectState.done,
      total: collectState.total,
    });
    el.innerHTML = `
      <span class="topbar-spinner">${TG.ui.icon("loader")}</span>
      <span class="topbar-status-text">${text}</span>
    `;
  }

  TG.onEvent = function (payload) {
    const { type, data } = payload || {};
    if (!type) return;

    switch (type) {
      case "log":
        console.log("[py]", data.message);
        break;
      case "auth.code_needed":
        showCodeModal();
        break;
      case "auth.password_needed":
        showPasswordModal();
        break;
      case "auth.qr_url":
        showQrModal(data.url, data.image);
        break;
      case "channels.collected":
        if (TG.pages.channels && TG.pages.channels.onCollected) {
          TG.pages.channels.onCollected(data);
        }
        if (TG.router && TG.router.current === "dashboard"
            && TG.pages.dashboard && TG.pages.dashboard.refresh) {
          TG.pages.dashboard.refresh();
        }
        if (TG.router && TG.router.current === "compare"
            && TG.pages.compare && TG.pages.compare.refresh) {
          TG.pages.compare.refresh();
        }
        break;
      case "channels.collect_failed":
        if (TG.pages.channels && TG.pages.channels.onCollectFailed) {
          TG.pages.channels.onCollectFailed(data);
        }
        break;
      case "collector.started":
        collectState = {
          active: true, done: 0, total: data.count || 0, title: "",
        };
        updateCollectorBar();
        break;
      case "collector.progress":
        collectState.done = data.done || 0;
        collectState.total = data.total || 0;
        collectState.title = data.title || "";
        updateCollectorBar();
        break;
      case "collector.finished":
        collectState = { active: false, done: 0, total: 0, title: "" };
        updateCollectorBar();
        break;
      case "collector.error":
        console.error("[collector]", data.message);
        break;
      case "data.cleared":
        if (TG.pages.dashboard && TG.pages.dashboard.refresh) {
          TG.pages.dashboard.refresh();
        }
        if (TG.pages.channels && TG.pages.channels.refresh) {
          TG.pages.channels.refresh();
        }
        if (TG.pages.compare && TG.pages.compare.refresh) {
          TG.pages.compare.refresh();
        }
        break;
      default:
        console.warn("Unknown event:", type, data);
    }
  };

  function renderShell(user) {
    if (user) currentUser = user;
    const display = currentUser || "";
    const handleMatch = display.match(/\(@([^)]+)\)/);
    const handle = handleMatch ? "@" + handleMatch[1] : "";
    const name = display.replace(/\s*\(@[^)]+\)\s*/, "").trim() || display;
    const initial = (name[0] || "?").toUpperCase();

    document.getElementById("app").innerHTML = `
      <div class="app">
        <aside class="sidebar">
          <div class="sidebar-brand">
            <div class="brand-mark">${TG.ui.icon("send")}</div>
            <div class="brand-text">
              <div class="brand-name">${TG.i18n.t("app.title")}</div>
              <div class="brand-version">v1.0.0</div>
            </div>
          </div>
          <nav class="sidebar-nav">
            <div class="nav-item" data-route="dashboard">
              ${TG.ui.icon("dashboard")}<span>${TG.i18n.t("nav.dashboard")}</span>
            </div>
            <div class="nav-item" data-route="channels">
              ${TG.ui.icon("channels")}<span>${TG.i18n.t("nav.channels")}</span>
            </div>
            <div class="nav-item" data-route="compare">
              ${TG.ui.icon("compare")}<span>${TG.i18n.t("nav.compare")}</span>
            </div>
            <div class="nav-item" data-route="settings">
              ${TG.ui.icon("settings")}<span>${TG.i18n.t("nav.settings")}</span>
            </div>
          </nav>
          <div class="sidebar-spacer"></div>
          <div class="sidebar-promo" id="promo-card"
               title="${TG.i18n.t("promo.tooltip")}">
            <div class="promo-badge">${TG.i18n.t("promo.badge")}</div>
            <div class="promo-title">${TG.i18n.t("promo.title")}</div>
            <div class="promo-text">${TG.i18n.t("promo.text")}</div>
            <div class="promo-btn">${TG.i18n.t("promo.cta")} →</div>
          </div>
          <div class="sidebar-user">
            <div class="user-avatar">${initial}</div>
            <div class="user-info">
              <div class="user-name">${name}</div>
              <div class="user-handle">${handle}</div>
            </div>
          </div>
        </aside>

        <main class="main">
          <header class="topbar">
            <h1 class="page-title" id="page-title"></h1>
            <div class="topbar-center" id="topbar-status"></div>
            <div class="topbar-right">
              <button class="btn-icon" id="theme-toggle-btn"
                      title=""></button>
              <button class="btn-icon" id="logout-btn"
                      title="${TG.i18n.t("main.logout")}">
                ${TG.ui.icon("logout")}
              </button>
            </div>
          </header>
          <div class="page-container" id="page-container"></div>
        </main>
      </div>`;

    TG.router.init({
      container: document.getElementById("page-container"),
      titleEl: document.getElementById("page-title"),
    });

    document.querySelectorAll(".nav-item").forEach(el => {
      el.onclick = () => TG.router.go(el.dataset.route);
    });

    const promo = document.getElementById("promo-card");
    if (promo) {
      promo.onclick = () => {
        TG.api.openExternal("https://tgautoposter.com");
      };
    }

    const themeBtn = document.getElementById("theme-toggle-btn");
    if (themeBtn) themeBtn.onclick = cycleTheme;

    document.getElementById("logout-btn").onclick = async () => {
      TG.ui.modal({
        title: TG.i18n.t("main.logout"),
        content: TG.i18n.t("main.logout_confirm"),
        actions: [
          { label: TG.i18n.t("common.cancel"), variant: "ghost" },
          { label: TG.i18n.t("main.logout"), variant: "danger",
            onClick: async () => {
              await TG.api.logout();
              location.reload();
            } },
        ],
      });
    };

    updateThemeButton();
    updateCollectorBar();

    const currentRoute = (TG.router.current && TG.pages[TG.router.current])
      ? TG.router.current
      : "dashboard";
    TG.router.go(currentRoute);
  }

  const state = { config: null };

  function showLogin() {
    const app = document.getElementById("app");
    app.innerHTML = "";
    const node = TG.pages.login.render({ config: state.config });
    app.appendChild(node);
    TG.i18n.apply(app);
    TG.pages.login.onMount();
  }

  TG.app = {
    renderShell,
    showLogin,
    applyTheme,
    refreshAll: () => {
      if (currentUser) {
        const wasRoute = TG.router.current;
        renderShell(currentUser);
        if (wasRoute) TG.router.go(wasRoute);
      } else {
        showLogin();
      }
    },
  };

  document.addEventListener("tg:signed-in", e => {
    if (activeQrModal) {
      try { activeQrModal.close(); } catch (_) {}
      activeQrModal = null;
    }
    TG.ui.closeAllModals();
    setTimeout(() => renderShell(e.detail.user), 180);
  });

  document.addEventListener("tg:auth-failed", () => {
    if (activeQrModal) {
      try { activeQrModal.close(); } catch (_) {}
      activeQrModal = null;
    }
    TG.ui.closeAllModals();
  });

  async function boot() {
    window.addEventListener("error", e => {
      console.error("[TG] error:", e.error || e.message);
    });
    try {
      await TG.api.ready();
      const cfg = await TG.api.getConfig();
      state.config = cfg || {};
      await TG.i18n.load(state.config.language || "en");

      const themeFromConfig = state.config.theme || "system";
      applyTheme(themeFromConfig);

      renderBoot();

      const has = await TG.api.hasSession();
      if (has && cfg.api_id && cfg.api_hash) {
        const el = document.getElementById("boot-text");
        if (el) el.textContent = TG.i18n.t("boot.session");
        const r = await TG.api.checkSession();
        if (r && r.ok) {
          renderShell(r.message);
          return;
        }
      }
      showLogin();
    } catch (err) {
      console.error("[TG] boot failed:", err);
      try { showLogin(); } catch (_) {  }
    }
  }

  document.addEventListener("DOMContentLoaded", boot);
  if (document.readyState !== "loading") boot();

})();
