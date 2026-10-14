TG.pages.settings = (function () {

  const state = {
    config: null,
    stats: null,
    busy: false,
    _statusTimer: null,
  };

  function render() {
    const el = document.createElement("div");
    el.className = "settings-page";
    el.id = "settings-root";
    return el;
  }

  function onMount() {
    loadAll();
  }

  async function loadAll() {
    const root = document.getElementById("settings-root");
    if (!root) return;

    try { state.config = await TG.api.getConfig(); }
    catch (e) { state.config = {}; }

    try {
      const r = await TG.api.getStorageStats();
      state.stats = (r && r.ok) ? r.data : null;
    } catch (e) { state.stats = null; }

    renderAll(root);
  }

  function renderAll(root) {
    const c = state.config || {};
    const s = state.stats || {};

    root.innerHTML = `
      <section class="settings-section">
        <header class="settings-section-header">
          <h2>${TG.i18n.t("settings.general")}</h2>
          <p>${TG.i18n.t("settings.general_hint")}</p>
        </header>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.language")}</div>
            <div class="settings-item-hint">${TG.i18n.t("settings.language_hint")}</div>
          </div>
          <div class="settings-item-control">
            <select class="input settings-select" id="s-language">
              <option value="en" ${c.language === "en" ? "selected" : ""}>English</option>
              <option value="ru" ${c.language === "ru" ? "selected" : ""}>Русский</option>
              <option value="es" ${c.language === "es" ? "selected" : ""}>Español</option>
              <option value="pt" ${c.language === "pt" ? "selected" : ""}>Português</option>
              <option value="de" ${c.language === "de" ? "selected" : ""}>Deutsch</option>
            </select>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.theme")}</div>
            <div class="settings-item-hint">${TG.i18n.t("settings.theme_hint")}</div>
          </div>
          <div class="settings-item-control">
            <select class="input settings-select" id="s-theme">
              <option value="system" ${(c.theme || "system") === "system" ? "selected" : ""}>${TG.i18n.t("settings.theme_system")}</option>
              <option value="dark"   ${c.theme === "dark"   ? "selected" : ""}>${TG.i18n.t("settings.theme_dark")}</option>
              <option value="light"  ${c.theme === "light"  ? "selected" : ""}>${TG.i18n.t("settings.theme_light")}</option>
            </select>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <header class="settings-section-header">
          <h2>${TG.i18n.t("settings.collection")}</h2>
          <p>${TG.i18n.t("settings.collection_hint")}</p>
        </header>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.interval")}</div>
            <div class="settings-item-hint">${TG.i18n.t("settings.interval_hint")}</div>
          </div>
          <div class="settings-item-control">
            <select class="input settings-select" id="s-interval">
              <option value="0"   ${c.collect_interval_min === 0   ? "selected" : ""}>${TG.i18n.t("settings.interval_manual")}</option>
              <option value="15"  ${c.collect_interval_min === 15  ? "selected" : ""}>15 ${TG.i18n.t("settings.min")}</option>
              <option value="30"  ${c.collect_interval_min === 30  ? "selected" : ""}>30 ${TG.i18n.t("settings.min")}</option>
              <option value="60"  ${c.collect_interval_min === 60  ? "selected" : ""}>1 ${TG.i18n.t("settings.hour")}</option>
              <option value="120" ${c.collect_interval_min === 120 ? "selected" : ""}>2 ${TG.i18n.t("settings.hours")}</option>
              <option value="360" ${c.collect_interval_min === 360 ? "selected" : ""}>6 ${TG.i18n.t("settings.hours")}</option>
            </select>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.retention")}</div>
            <div class="settings-item-hint">${TG.i18n.t("settings.retention_hint")}</div>
          </div>
          <div class="settings-item-control">
            <select class="input settings-select" id="s-retention">
              <option value="30"   ${c.retention_days === 30   ? "selected" : ""}>30 ${TG.i18n.t("settings.days")}</option>
              <option value="90"   ${c.retention_days === 90   ? "selected" : ""}>90 ${TG.i18n.t("settings.days")}</option>
              <option value="180"  ${c.retention_days === 180  ? "selected" : ""}>180 ${TG.i18n.t("settings.days")}</option>
              <option value="365"  ${c.retention_days === 365  ? "selected" : ""}>1 ${TG.i18n.t("settings.year")}</option>
              <option value="3650" ${c.retention_days === 3650 ? "selected" : ""}>${TG.i18n.t("settings.forever")}</option>
            </select>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.collector_status_title")}</div>
            <div class="settings-item-hint" id="s-collector-status">
              ${TG.i18n.t("settings.collector_loading")}
            </div>
          </div>
          <div class="settings-item-control">
            <button class="btn settings-btn" id="s-collect-now">
              ${TG.ui.icon("refresh")}
              <span>${TG.i18n.t("settings.collect_now_btn")}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section">
        <header class="settings-section-header">
          <h2>${TG.i18n.t("settings.storage")}</h2>
          <p>${TG.i18n.t("settings.storage_hint")}</p>
        </header>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.export_dir")}</div>
            <div class="settings-item-hint" id="s-export-path">
              ${escapeHtml(c.export_dir || "—")}
            </div>
          </div>
          <div class="settings-item-control">
            <button class="btn settings-btn" id="s-choose-dir">
              ${TG.ui.icon("folder")}
              <span>${TG.i18n.t("settings.choose_dir")}</span>
            </button>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.storage_stats")}</div>
            <div class="settings-item-hint">${TG.i18n.t("settings.storage_stats_hint")}</div>
          </div>
          <div class="settings-item-control">
            <div class="storage-pills">
              <span class="storage-pill"><b>${s.channels || 0}</b> ${TG.i18n.t("settings.channels")}</span>
              <span class="storage-pill"><b>${s.posts || 0}</b> ${TG.i18n.t("settings.posts")}</span>
              <span class="storage-pill"><b>${s.snapshots || 0}</b> ${TG.i18n.t("settings.snapshots")}</span>
            </div>
          </div>
        </div>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.purge")}</div>
            <div class="settings-item-hint">${TG.i18n.t("settings.purge_hint")}</div>
          </div>
          <div class="settings-item-control">
            <button class="btn settings-btn" id="s-purge">
              ${TG.ui.icon("alert")}
              <span>${TG.i18n.t("settings.purge_btn")}</span>
            </button>
          </div>
        </div>
        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.logs_title")}</div>
            <div class="settings-item-hint" id="s-logs-info">
              ${TG.i18n.t("settings.logs_loading")}
            </div>
          </div>
          <div class="settings-item-control">
            <button class="btn settings-btn" id="s-open-logs">
              ${TG.ui.icon("folder")}
              <span>${TG.i18n.t("settings.logs_open")}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="settings-section settings-danger">
        <header class="settings-section-header">
          <h2>${TG.i18n.t("settings.danger")}</h2>
          <p>${TG.i18n.t("settings.danger_hint")}</p>
        </header>

        <div class="settings-item">
          <div class="settings-item-info">
            <div class="settings-item-title">${TG.i18n.t("settings.delete_all")}</div>
            <div class="settings-item-hint">${TG.i18n.t("settings.delete_all_hint")}</div>
          </div>
          <div class="settings-item-control">
            <button class="btn btn-danger settings-btn" id="s-delete-all">
              ${TG.ui.icon("trash")}
              <span>${TG.i18n.t("settings.delete_all_btn")}</span>
            </button>
          </div>
        </div>
      </section>
    `;

    bindHandlers(root);
    refreshCollectorStatus(root);
    refreshLogsInfo(root);
    if (state._statusTimer) clearInterval(state._statusTimer);
    state._statusTimer = setInterval(
      () => refreshCollectorStatus(root), 15000,
    );
  }

  async function refreshCollectorStatus(root) {
    const el = root.querySelector("#s-collector-status");
    if (!el) return;
    try {
      const r = await TG.api.getCollectorStatus();
      el.textContent = formatCollectorStatus(r);
    } catch (e) {
      el.textContent = "—";
    }
  }

  async function refreshLogsInfo(root) {
    const el = root.querySelector("#s-logs-info");
    if (!el) return;
    try {
      const info = await TG.api.getLogsInfo();
      el.textContent = formatLogsInfo(info);
    } catch (e) {
      el.textContent = "—";
    }
  }

  function formatLogsInfo(info) {
    if (!info) return "—";
    const fmtBytes = (b) => {
      b = Number(b) || 0;
      if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
      if (b >= 1024) return (b / 1024).toFixed(0) + " KB";
      return b + " B";
    };
    const parts = [
      `${TG.i18n.t("settings.logs_app")}: ${fmtBytes(info.app_log_size)}`,
    ];
    if (info.crash_log_exists && info.crash_log_size > 0) {
      parts.push(
        `<span style="color:var(--warning)">${TG.i18n.t("settings.logs_crash")}: ${fmtBytes(info.crash_log_size)}</span>`
      );
    } else {
      parts.push(`${TG.i18n.t("settings.logs_crash")}: —`);
    }
    return parts.join(" · ");
  }

  function formatCollectorStatus(r) {
    if (!r) return "—";
    const interval = r.interval_min || 0;
    if (interval <= 0) {
      return TG.i18n.t("settings.collector_manual");
    }
    const last = r.last_run;
    if (!last) {
      return TG.i18n.t("settings.collector_waiting", { n: interval });
    }
    let minutesAgo = 0;
    try {
      const dt = new Date(last);
      minutesAgo = Math.max(0, Math.round((Date.now() - dt.getTime()) / 60000));
    } catch (e) {  }

    let nextIn = "";
    if (r.next_in_sec != null) {
      const nextMin = Math.round(r.next_in_sec / 60);
      nextIn = TG.i18n.t("settings.collector_next", { n: nextMin });
    }

    return TG.i18n.t("settings.collector_auto", {
      ago: minutesAgo,
      interval: interval,
      next: nextIn,
    });
  }

  function bindHandlers(root) {
    const $ = id => root.querySelector("#" + id);

    $("s-language").onchange = async e => {
      const lang = e.target.value;
      await TG.api.setLanguage(lang);
      await TG.i18n.load(lang);
      if (TG.app && TG.app.refreshAll) TG.app.refreshAll();
      else location.reload();
    };

    $("s-theme").onchange = async e => {
      const theme = e.target.value;
      await TG.api.setTheme(theme);
      if (TG.app && TG.app.applyTheme) {
        TG.app.applyTheme(theme);
      } else {
        document.documentElement.setAttribute("data-theme", theme);
      }
      if (TG.router && TG.router.current === "dashboard"
          && TG.pages.dashboard && TG.pages.dashboard.refresh) {
        TG.pages.dashboard.refresh();
      }
      TG.ui.toast(TG.i18n.t("settings.theme_saved"), "ok");
    };

    $("s-interval").onchange = async e => {
      const minutes = parseInt(e.target.value, 10);
      await TG.api.setCollectInterval(minutes);
      TG.ui.toast(TG.i18n.t("settings.interval_saved"), "ok");

      setTimeout(() => refreshCollectorStatus(root), 300);
    };

    $("s-retention").onchange = async e => {
      const days = parseInt(e.target.value, 10);
      await TG.api.setRetentionDays(days);
      TG.ui.toast(TG.i18n.t("settings.retention_saved"), "ok");
    };

    $("s-collect-now").onclick = async () => {
      if (state.busy) return;
      state.busy = true;
      TG.ui.toast(TG.i18n.t("settings.collect_started"), "info");
      await TG.api.triggerCollectNow();
      state.busy = false;
      setTimeout(() => refreshCollectorStatus(root), 2000);
    };

    $("s-choose-dir").onclick = async () => {
      const r = await TG.api.chooseExportDir();
      if (r && r.ok) {
        state.config.export_dir = r.path;
        const pathEl = root.querySelector("#s-export-path");
        if (pathEl) pathEl.textContent = r.path;
        TG.ui.toast(TG.i18n.t("settings.dir_saved"), "ok");
      }
    };

    $("s-purge").onclick = async () => {
      TG.ui.modal({
        title: TG.i18n.t("settings.purge_btn"),
        content: TG.i18n.t("settings.purge_confirm"),
        actions: [
          { label: TG.i18n.t("common.cancel"), variant: "ghost" },
          { label: TG.i18n.t("common.confirm"), variant: "primary",
            onClick: async () => {
              const r = await TG.api.purgeOldData();
              if (r && r.ok) {
                TG.ui.toast(TG.i18n.t("settings.purge_done"), "ok");
                loadAll();
              }
            } },
        ],
      });
    };

    $("s-delete-all").onclick = async () => {
      TG.ui.modal({
        title: TG.i18n.t("settings.delete_all_btn"),
        content: TG.i18n.t("settings.delete_all_confirm"),
        actions: [
          { label: TG.i18n.t("common.cancel"), variant: "ghost" },
          { label: TG.i18n.t("common.confirm"), variant: "danger",
            onClick: async () => {
              const r = await TG.api.deleteAllTracked();
              if (r && r.ok) {
                TG.ui.toast(TG.i18n.t("settings.deleted_toast"), "ok");
                loadAll();
              }
            } },
        ],
      });
    };

    $("s-open-logs").onclick = async () => {
      await TG.api.openLogsDir();
    };
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  return { titleKey: "nav.settings", render, onMount };
})();
