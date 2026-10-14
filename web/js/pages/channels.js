TG.pages.channels = (function () {

  const state = {
    tracked: [],
    available: [],
    loading: true,
    busy: new Set(),
    collecting: new Set(),
  };

  function render() {
    const el = document.createElement("div");
    el.className = "channels-page";
    el.innerHTML = `
      <div class="channels-toolbar">
        <div class="channels-toolbar-left">
          <button class="btn" id="refresh-btn">
            ${TG.ui.icon("refresh")}
            <span data-i18n="channels.refresh"></span>
          </button>
          <button class="btn btn-primary" id="add-public-btn">
            ${TG.ui.icon("plus")}
            <span data-i18n="channels.add_public"></span>
          </button>
        </div>
        <div class="channels-toolbar-right">
          <span class="muted" id="channels-status"></span>
        </div>
      </div>
      <div class="channels-grid">
        <section class="channels-col">
          <header class="channels-col-header">
            <h3 data-i18n="channels.tracked_title"></h3>
            <span class="badge" id="tracked-count">0</span>
          </header>
          <div class="channels-list" id="tracked-list">
            <div class="channels-loading">
              <div class="spinner-dark"></div>
            </div>
          </div>
        </section>
        <section class="channels-col">
          <header class="channels-col-header">
            <h3 data-i18n="channels.available_title"></h3>
            <span class="badge" id="available-count">0</span>
          </header>
          <div class="channels-list" id="available-list">
            <div class="channels-loading">
              <div class="spinner-dark"></div>
            </div>
          </div>
        </section>
      </div>
    `;
    return el;
  }

  function onMount() {
    document.getElementById("refresh-btn").onclick = () => loadAll(true);
    document.getElementById("add-public-btn").onclick = () => showAddPublicModal();
    loadAll(false);
  }

  async function loadAll(forceRefresh) {
    setStatus(TG.i18n.t("channels.loading_tracked"), "");
    try {
      const tracked = await TG.api.listTracked();
      state.tracked = (tracked && tracked.items) || [];
    } catch (e) {
      state.tracked = [];
      console.error("listTracked failed", e);
    }
    renderTracked();

    setStatus(TG.i18n.t("channels.loading_available"), "");
    try {
      const available = await TG.api.listDialogs();
      if (available && available.ok) {
        state.available = available.items || [];
        setStatus("", "");
      } else {
        state.available = [];
        const msg = (available && available.message) || "unknown";
        setStatus(TG.i18n.t("channels.load_failed", { error: msg }), "err");
      }
    } catch (e) {
      state.available = [];
      setStatus(TG.i18n.t("channels.load_failed", { error: String(e) }), "err");
    }
    renderAvailable();
  }

  function setStatus(text, kind) {
    const el = document.getElementById("channels-status");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = kind === "err" ? "var(--danger)"
                    : kind === "ok"  ? "var(--success)"
                    : "var(--text-secondary)";
  }

  function renderTracked() {
    const list = document.getElementById("tracked-list");
    const cnt = document.getElementById("tracked-count");
    if (!list) return;

    cnt.textContent = state.tracked.length;

    if (!state.tracked.length) {
      list.innerHTML = `
        <div class="empty empty-sm">
          <div class="empty-icon">${TG.ui.icon("channels", "icon-lg")}</div>
          <p class="empty-title">${TG.i18n.t("channels.empty_tracked_title")}</p>
          <p class="empty-hint">${TG.i18n.t("channels.empty_tracked_hint")}</p>
        </div>`;
      return;
    }

    list.innerHTML = "";
    for (const ch of state.tracked) {
      list.appendChild(renderTrackedItem(ch));
    }
  }

  function renderTrackedItem(ch) {
    const el = document.createElement("div");
    el.className = "channel-item";
    const handle = ch.username ? `@${ch.username}` : `id ${ch.tg_id}`;
    const isCollecting = state.collecting.has(ch.tg_id);
    const isPublic = !!ch.is_public;

    el.innerHTML = `
      <div class="channel-icon">${TG.ui.icon("channels")}</div>
      <div class="channel-body">
        <div class="channel-title">
          ${escapeHtml(ch.title)}
          ${isPublic
            ? `<span class="badge-pub">${TG.i18n.t("channels.badge_public")}</span>`
            : `<span class="badge-own">${TG.i18n.t("channels.badge_owner")}</span>`}
        </div>
        <div class="channel-meta">
          <span>${escapeHtml(handle)}</span>
          <span class="dot">•</span>
          <span>${fmtNum(ch.subscribers)} <span data-i18n="channels.subs"></span></span>
          <span class="dot">•</span>
          <span>${ch.posts_count} <span data-i18n="channels.posts"></span></span>
        </div>
      </div>
      <div class="channel-actions">
        <button class="btn-icon" title="${TG.i18n.t("channels.refresh_one")}"
                data-action="refresh" ${isCollecting ? "disabled" : ""}>
          ${isCollecting
            ? '<div class="spinner-dark spinner-sm"></div>'
            : TG.ui.icon("refresh")}
        </button>
        <button class="btn btn-danger" data-action="untrack"
                data-i18n="channels.untrack"></button>
      </div>`;
    TG.i18n.apply(el);

    el.querySelector('[data-action="untrack"]').onclick = () => onUntrack(ch);
    el.querySelector('[data-action="refresh"]').onclick = () => onRefresh(ch);
    return el;
  }

  function renderAvailable() {
    const list = document.getElementById("available-list");
    const cnt = document.getElementById("available-count");
    if (!list) return;

    const items = state.available.filter(ch => !ch.tracked);
    cnt.textContent = items.length;

    if (!items.length) {
      list.innerHTML = `
        <div class="empty empty-sm">
          <div class="empty-icon">${TG.ui.icon("check", "icon-lg")}</div>
          <p class="empty-title">${TG.i18n.t("channels.empty_available_title")}</p>
          <p class="empty-hint">${TG.i18n.t("channels.empty_available_hint")}</p>
        </div>`;
      return;
    }

    list.innerHTML = "";
    for (const ch of items) {
      list.appendChild(renderAvailableItem(ch));
    }
  }

  function renderAvailableItem(ch) {
    const el = document.createElement("div");
    el.className = "channel-item";
    const handle = ch.username ? `@${ch.username}` : `id ${ch.tg_id}`;
    const isBusy = state.busy.has(ch.tg_id);

    el.innerHTML = `
      <div class="channel-icon">${TG.ui.icon("channels")}</div>
      <div class="channel-body">
        <div class="channel-title">${escapeHtml(ch.title)}</div>
        <div class="channel-meta">
          <span>${escapeHtml(handle)}</span>
          <span class="dot">•</span>
          <span>${fmtNum(ch.participants_count)} <span data-i18n="channels.subs"></span></span>
          ${ch.is_creator ? `<span class="badge-sm" data-i18n="channels.owner"></span>` : ""}
        </div>
      </div>
      <div class="channel-actions">
        <button class="btn btn-primary" data-action="track" ${isBusy ? "disabled" : ""}>
          ${isBusy
            ? '<div class="spinner"></div>'
            : TG.ui.icon("check") + `<span data-i18n="channels.track"></span>`}
        </button>
      </div>`;
    TG.i18n.apply(el);

    el.querySelector('[data-action="track"]').onclick = () => onTrack(ch);
    return el;
  }

  async function onTrack(ch) {
    if (state.busy.has(ch.tg_id)) return;
    state.busy.add(ch.tg_id);
    renderAvailable();

    try {
      await TG.api.trackChannel(
        ch.tg_id, ch.username, ch.title, ch.participants_count || 0,
      );
      ch.tracked = true;
      TG.ui.toast(TG.i18n.t("channels.tracked_toast", { name: ch.title }), "ok");
    } catch (e) {
      TG.ui.toast(TG.i18n.t("channels.track_failed", { error: String(e) }), "err");
    } finally {
      state.busy.delete(ch.tg_id);
      const tracked = await TG.api.listTracked();
      state.tracked = (tracked && tracked.items) || [];
      renderTracked();
      renderAvailable();
    }
  }

  async function onUntrack(ch) {
    try {
      await TG.api.untrackChannel(ch.tg_id);
      TG.ui.toast(TG.i18n.t("channels.untracked_toast", { name: ch.title }), "ok");
    } catch (e) {
      TG.ui.toast(TG.i18n.t("channels.untrack_failed", { error: String(e) }), "err");
    }
    const tracked = await TG.api.listTracked();
    state.tracked = (tracked && tracked.items) || [];
    state.available.forEach(a => {
      if (a.tg_id === ch.tg_id) a.tracked = false;
    });
    renderTracked();
    renderAvailable();
  }

  async function onRefresh(ch) {
    if (state.collecting.has(ch.tg_id)) return;
    state.collecting.add(ch.tg_id);
    renderTracked();
    try {
      await TG.api.collectNow(ch.tg_id);
    } catch (e) {
      state.collecting.delete(ch.tg_id);
      renderTracked();
      TG.ui.toast(TG.i18n.t("channels.collect_failed", { error: String(e) }), "err");
    }
  }

  function onCollected(data) {
    state.collecting.delete(data.tg_id);
    TG.api.listTracked().then(r => {
      state.tracked = (r && r.items) || [];
      renderTracked();
    });
    TG.ui.toast(
      TG.i18n.t("channels.collected_toast", {
        subs: fmtNum(data.subscribers),
        posts: data.posts,
      }),
      "ok",
    );
  }

  function onCollectFailed(data) {
    state.collecting.delete(data.tg_id);
    renderTracked();
    TG.ui.toast(
      TG.i18n.t("channels.collect_failed", { error: data.message }),
      "err",
    );
  }

  function showAddPublicModal() {
    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <p style="margin:0 0 10px;font-size:12.5px;color:var(--text-secondary);">
        ${TG.i18n.t("channels.add_public_hint")}
      </p>
      <input class="input" id="pub-input"
             placeholder="@durov или t.me/durov"
             autocomplete="off" spellcheck="false">
      <div id="pub-error"
           style="display:none;margin-top:10px;padding:9px 12px;
                  border-radius:8px;background:var(--danger-soft);
                  color:var(--danger);font-size:12px;"></div>
      <div id="pub-preview"
           style="display:none;margin-top:12px;padding:12px;
                  border-radius:10px;background:var(--bg-elevated);
                  border:1px solid var(--border);"></div>`;

    const m = TG.ui.modal({
      title: TG.i18n.t("channels.add_public_title"),
      content: wrap,
      actions: [
        { label: TG.i18n.t("common.cancel"), variant: "ghost" },
        { label: TG.i18n.t("channels.add_public_btn"), variant: "primary",
          onClick: () => doAddPublic(wrap, m) },
      ],
      width: 480,
    });

    setTimeout(() => {
      const input = wrap.querySelector("#pub-input");
      if (!input) return;
      input.focus();
      input.addEventListener("keydown", e => {
        if (e.key === "Enter") {
          e.preventDefault();
          doAddPublic(wrap, m);
        }
      });
    }, 0);
  }

  async function doAddPublic(wrap, modal) {
    const input = wrap.querySelector("#pub-input");
    const errEl = wrap.querySelector("#pub-error");
    const prevEl = wrap.querySelector("#pub-preview");
    if (!input || !errEl || !prevEl) return;

    const identifier = input.value.trim();
    if (!identifier) {
      errEl.style.display = "";
      errEl.textContent = TG.i18n.t("channels.add_public_empty");
      return;
    }

    errEl.style.display = "none";
    prevEl.style.display = "";
    prevEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="spinner-dark"></div>
        <span style="font-size:12.5px;color:var(--text-secondary);">
          ${TG.i18n.t("channels.add_public_resolving")}
        </span>
      </div>`;

    let resolved = null;
    try {
      const r = await TG.api.resolveChannel(identifier);
      if (!r || !r.ok) {
        prevEl.style.display = "none";
        errEl.style.display = "";
        errEl.textContent = TG.i18n.t("channels.add_public_error", {
          error: (r && r.message) || "unknown",
        });
        return;
      }
      resolved = r.channel;
    } catch (e) {
      prevEl.style.display = "none";
      errEl.style.display = "";
      errEl.textContent = String(e);
      return;
    }

    const ch = resolved;
    const handle = ch.username ? `@${ch.username}` : `id ${ch.tg_id}`;
    prevEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="channel-icon">${TG.ui.icon("channels")}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13.5px;font-weight:600;color:var(--text);
                      white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${escapeHtml(ch.title)}
          </div>
          <div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">
            ${escapeHtml(handle)} · ${fmtNum(ch.participants_count)}
            <span data-i18n="channels.subs"></span>
          </div>
        </div>
      </div>`;
    TG.i18n.apply(prevEl);

    try {
      const r = await TG.api.addPublicChannel(identifier);
      if (r && r.ok) {
        modal.close();
        TG.ui.toast(
          TG.i18n.t("channels.public_added", { name: ch.title }),
          "ok",
        );
        const tracked = await TG.api.listTracked();
        state.tracked = (tracked && tracked.items) || [];
        renderTracked();
      } else {
        const msg = (r && r.message) || "unknown";
        if (msg === "already_tracked") {
          errEl.style.display = "";
          errEl.textContent = TG.i18n.t("channels.public_already");
        } else {
          errEl.style.display = "";
          errEl.textContent = TG.i18n.t("channels.add_public_error",
                                          { error: msg });
        }
      }
    } catch (e) {
      errEl.style.display = "";
      errEl.textContent = String(e);
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
    return String(n);
  }

  function refresh() {
    loadAll(false);
  }

  return {
    titleKey: "nav.channels",
    render, onMount, refresh,
    onCollected, onCollectFailed,
  };
})();
