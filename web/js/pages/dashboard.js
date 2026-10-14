TG.pages.dashboard = (function () {

  const state = {
    channels: [],
    selectedId: null,
    period: 30,
    data: null,
    loading: false,
  };

  function render() {
    const el = document.createElement("div");
    el.className = "dashboard-page";
    el.id = "dashboard-root";
    return el;
  }

  function onMount() {
    loadChannels().then(() => renderFrame());
  }

  async function loadChannels() {
    try {
      const r = await TG.api.listTracked();
      state.channels = (r && r.items) || [];
      if (!state.selectedId && state.channels.length) {
        state.selectedId = state.channels[0].id;
      }
    } catch (e) {
      console.error("listTracked failed", e);
      state.channels = [];
    }
  }

  function renderFrame() {
    const root = document.getElementById("dashboard-root");
    if (!root) return;

    if (!state.channels.length) {
      root.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${TG.ui.icon("dashboard", "icon-lg")}</div>
          <h2 class="empty-title">${TG.i18n.t("dash.empty_title")}</h2>
          <p class="empty-hint">${TG.i18n.t("dash.empty_hint")}</p>
          <button class="btn btn-primary" id="go-channels-btn"
                  style="margin-top:16px;">
            ${TG.ui.icon("channels")}
            <span>${TG.i18n.t("nav.channels")}</span>
          </button>
        </div>`;
      const btn = document.getElementById("go-channels-btn");
      if (btn) btn.onclick = () => TG.router.go("channels");
      return;
    }

    root.innerHTML = `
      <div class="dash-toolbar">
        <div class="dash-toolbar-left">
          <select class="input dash-select" id="dash-channel-select">
            ${state.channels.map(c =>
              `<option value="${c.id}" ${c.id === state.selectedId ? "selected" : ""}>
                ${escapeHtml(c.title)}
              </option>`
            ).join("")}
          </select>
        </div>
        <div class="dash-toolbar-right">
          <div class="tabs" id="period-tabs">
            <button class="tab ${state.period === 7  ? "active" : ""}" data-days="7">7D</button>
            <button class="tab ${state.period === 30 ? "active" : ""}" data-days="30">30D</button>
            <button class="tab ${state.period === 90 ? "active" : ""}" data-days="90">90D</button>
            <button class="tab ${state.period === 0  ? "active" : ""}" data-days="0">${TG.i18n.t("dash.tab_all")}</button>
          </div>
          <button class="btn settings-btn" id="export-btn">
            ${TG.ui.icon("download")}
            <span>${TG.i18n.t("dash.export_btn")}</span>
          </button>
        </div>
      </div>
      <div id="dash-body"></div>`;

    document.getElementById("dash-channel-select").onchange = e => {
      state.selectedId = parseInt(e.target.value, 10);
      loadData();
    };

    document.getElementById("period-tabs").querySelectorAll(".tab").forEach(t => {
      t.onclick = () => {
        const days = parseInt(t.dataset.days, 10);
        if (days === state.period) return;
        state.period = days;
        document.getElementById("period-tabs")
          .querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
        t.classList.add("active");
        loadData();
      };
    });

    document.getElementById("export-btn").onclick = () => showExportModal();

    loadData();
  }

  async function loadData() {
    const body = document.getElementById("dash-body");
    if (!body) return;

    body.innerHTML = `<div class="dash-loading"><div class="spinner-dark"></div></div>`;

    try {
      const r = await TG.api.getDashboard(state.selectedId, state.period);
      if (r && r.ok) {
        state.data = r.data;
        renderBody(body, state.data);
      } else {
        body.innerHTML = `<div class="chart-empty">
          ${escapeHtml((r && r.message) || "Failed to load")}</div>`;
      }
    } catch (e) {
      body.innerHTML = `<div class="chart-empty">${escapeHtml(String(e))}</div>`;
    }
  }

  function renderBody(body, d) {
    const s = d.stats;
    const ch = d.channel;
    const periodLabel = TG.i18n.t("dash.period_suffix", { n: d.period_days });

    body.innerHTML = `
      <div class="dash-channel-header">
        <div class="dash-channel-title">${escapeHtml(ch.title)}</div>
        ${ch.username
          ? `<div class="dash-channel-handle">@${escapeHtml(ch.username)}</div>`
          : ""}
      </div>

      <div class="stats-grid">
        ${statCard(
          TG.i18n.t("dash.stat_subscribers"),
          TG.charts.fmtNum(s.subscribers),
          s.change_period, periodLabel)}
        ${statCard(
          TG.i18n.t("dash.stat_avg_views"),
          TG.charts.fmtNum(s.avg_views),
          null, "")}
        ${statCard(
          TG.i18n.t("dash.stat_er"),
          s.er.toFixed(2) + "%",
          null, "")}
        ${statCard(
          TG.i18n.t("dash.stat_posts"),
          String(s.posts_count),
          null, "")}
      </div>

      <div class="dash-row dash-row-2col">
        <div class="dash-card">
          <div class="dash-card-header">
            <h3>${TG.i18n.t("dash.growth_title")}</h3>
            ${renderGrowthNote(d)}
          </div>
          <div class="dash-card-body">
            <div id="growth-chart"></div>
          </div>
        </div>
        <div class="dash-card">
          <div class="dash-card-header">
            <h3>${TG.i18n.t("dash.mix_title")} · ${periodLabel}</h3>
          </div>
          <div class="dash-card-body dash-mix-body">
            <div id="mix-chart"></div>
            <div id="mix-legend" class="mix-legend"></div>
          </div>
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <h3>${TG.i18n.t("dash.recent_title")} · ${periodLabel}</h3>
        </div>
        <div class="dash-card-body">
          <div id="recent-chart"></div>
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <h3>${TG.i18n.t("dash.best_time_title")} · ${periodLabel}</h3>
          <span class="dash-best-time" id="best-time-label"></span>
        </div>
        <div class="dash-card-body">
          <div id="heatmap-chart"></div>
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <h3>${TG.i18n.t("dash.top_posts_title")} · ${periodLabel}</h3>
        </div>
        <div class="dash-card-body">
          ${renderTopPosts(d.top_posts)}
        </div>
      </div>
    `;

    const growthContainer = document.getElementById("growth-chart");
    const growthPoints = (d.growth_series || []).map(p => ({
      label: p.label || formatShortDate(p.date),
      value: p.subscribers,
    }));
    TG.charts.lineChart(growthContainer, growthPoints, {
      height: 260,
      color: "#4d9eff",
      emptyText: TG.i18n.t("dash.not_enough_data"),
      singleNote: TG.i18n.t("dash.growth_single_note"),
    });

    const mixContainer = document.getElementById("mix-chart");
    const colors = {
      text: "#4d9eff", photo: "#a855f7", video: "#f472b6",
      document: "#fbbf24", poll: "#4ade80", other: "#94a3b8",
    };
    const mixSegments = (d.content_mix || []).map(m => ({
      label: m.type,
      value: m.count,
      color: colors[m.type] || colors.other,
    }));
    const totalPosts = mixSegments.reduce((s, x) => s + x.value, 0);
    TG.charts.doughnut(mixContainer, mixSegments, {
      size: 180, thickness: 24,
      centerValue: String(totalPosts),
      centerLabel: TG.i18n.t("dash.posts_unit"),
      emptyText: TG.i18n.t("dash.no_data"),
    });

    const legendEl = document.getElementById("mix-legend");
    if (legendEl) {
      legendEl.innerHTML = mixSegments.map((seg, i) => {
        const src = d.content_mix[i] || {};
        const stats = [];
        stats.push(`${src.count || 0} ${TG.i18n.t("mix.posts")}`);
        if (src.avg_views) {
          stats.push(`${TG.charts.fmtNum(src.avg_views)} ${TG.i18n.t("mix.avg_views")}`);
        }
        if (src.er) {
          stats.push(`${src.er.toFixed(2)}% ${TG.i18n.t("mix.er")}`);
        }
        return `
          <div class="mix-legend-row">
            <div class="mix-dot" style="background:${seg.color}"></div>
            <div class="mix-info">
              <div class="mix-label">
                ${TG.i18n.t("content." + seg.label) || seg.label}
              </div>
              <div class="mix-stats">${stats.join(" · ")}</div>
            </div>
          </div>`;
      }).join("");
    }

    const recentContainer = document.getElementById("recent-chart");
    const recentBars = (d.recent_views || []).map(p => ({
      label: p.date || "",
      value: p.views,
      meta: p,
    }));
    TG.charts.barChart(recentContainer, recentBars, {
      height: 220, color: "#4d9eff",
      emptyText: TG.i18n.t("dash.no_data"),
    });

    const heatContainer = document.getElementById("heatmap-chart");
    const bestLabel = document.getElementById("best-time-label");
    const hm = d.heatmap || { matrix: [], best: null };
    TG.charts.heatmap(heatContainer, hm.matrix, {
      best: hm.best,
      emptyText: TG.i18n.t("dash.no_data"),
    });
    if (bestLabel && hm.best && hm.best.avg > 0) {
      const days = [
        TG.i18n.t("day.mon"), TG.i18n.t("day.tue"), TG.i18n.t("day.wed"),
        TG.i18n.t("day.thu"), TG.i18n.t("day.fri"), TG.i18n.t("day.sat"),
        TG.i18n.t("day.sun"),
      ];
      bestLabel.textContent = TG.i18n.t("dash.best_time_value", {
        day: days[hm.best.weekday],
        hour: String(hm.best.hour).padStart(2, "0") + ":00",
      });
    }
  }

  function statCard(label, value, delta, deltaUnit) {
    let deltaHtml = "";
    if (delta !== null && delta !== undefined) {
      const sign = delta > 0 ? "+" : "";
      const cls = delta > 0 ? "up" : delta < 0 ? "down" : "";
      deltaHtml = `<div class="stat-delta ${cls}">
        ${delta > 0 ? "▲" : delta < 0 ? "▼" : ""} ${sign}${TG.charts.fmtNum(delta)} ${deltaUnit || ""}
      </div>`;
    }
    return `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        ${deltaHtml}
      </div>`;
  }

  function renderGrowthNote(d) {
    const series = d.growth_series || [];
    const n = d.stats && d.stats.snapshots_count != null
      ? d.stats.snapshots_count
      : series.length;

    if (n === 0) {
      return `<span class="dash-card-note">${TG.i18n.t("dash.not_enough_data")}</span>`;
    }

    const first = series[0];
    let since = "";
    if (first && first.date) {
      const dt = new Date(first.date);
      if (!isNaN(dt.getTime())) {
        const pad = x => String(x).padStart(2, "0");
        since = `${pad(dt.getDate())}.${pad(dt.getMonth() + 1)} ` +
                `${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
      }
    }

    const text = TG.i18n.t("dash.growth_note", {
      count: n,
      since: since || "—",
    });
    return `<span class="dash-card-note">${text}</span>`;
  }

  function renderTopPosts(posts) {
    if (!posts || !posts.length) {
      return `<div class="chart-empty">${TG.i18n.t("dash.no_data")}</div>`;
    }
    return `
      <div class="top-posts">
        ${posts.map((p, i) => `
          <div class="top-post-row">
            <div class="top-post-rank">${i + 1}</div>
            <div class="top-post-body">
              <div class="top-post-text">${escapeHtml(p.text || "—")}</div>
              <div class="top-post-meta">
                <span>${escapeHtml(p.date)}</span>
                <span class="dot">•</span>
                <span>${TG.charts.fmtNum(p.views)} ${TG.i18n.t("dash.views_short")}</span>
                ${p.reactions ? `<span class="dot">•</span><span>❤ ${TG.charts.fmtNum(p.reactions)}</span>` : ""}
                ${p.forwards ? `<span class="dot">•</span><span>↗ ${TG.charts.fmtNum(p.forwards)}</span>` : ""}
              </div>
            </div>
          </div>
        `).join("")}
      </div>`;
  }

  function showExportModal() {
    if (!state.selectedId) return;

    const wrap = document.createElement("div");
    wrap.innerHTML = `
      <p style="margin:0 0 14px;font-size:12.5px;color:var(--text-secondary);">
        ${TG.i18n.t("dash.export_hint", { days: state.period })}
      </p>

      <button class="export-format" data-fmt="pdf">
        <div class="export-format-icon" style="color:#f87171;">
          ${TG.ui.icon("download", "icon-lg")}
        </div>
        <div class="export-format-body">
          <div class="export-format-title">PDF</div>
          <div class="export-format-hint">${TG.i18n.t("dash.export_pdf_hint")}</div>
        </div>
      </button>

      <button class="export-format" data-fmt="json">
        <div class="export-format-icon" style="color:#a855f7;">
          ${TG.ui.icon("settings", "icon-lg")}
        </div>
        <div class="export-format-body">
          <div class="export-format-title">JSON</div>
          <div class="export-format-hint">${TG.i18n.t("dash.export_json_hint")}</div>
        </div>
      </button>

      <button class="export-format" data-fmt="csv">
        <div class="export-format-icon" style="color:#4ade80;">
          ${TG.ui.icon("dashboard", "icon-lg")}
        </div>
        <div class="export-format-body">
          <div class="export-format-title">CSV</div>
          <div class="export-format-hint">${TG.i18n.t("dash.export_csv_hint")}</div>
        </div>
      </button>`;

    const m = TG.ui.modal({
      title: TG.i18n.t("dash.export_title"),
      content: wrap,
      actions: [
        { label: TG.i18n.t("common.cancel"), variant: "ghost" },
      ],
      width: 460,
    });

    setTimeout(() => {
      wrap.querySelectorAll(".export-format").forEach(btn => {
        btn.onclick = async () => {
          const fmt = btn.dataset.fmt;
          m.close();
          await doExport(fmt);
        };
      });
    }, 0);
  }

  async function doExport(fmt) {
    TG.ui.toast(TG.i18n.t("dash.export_working"), "info", 2000);
    try {
      const r = await TG.api.exportChannelData(
        state.selectedId, state.period, fmt,
      );
      if (r && r.ok) {
        TG.ui.toast(
          TG.i18n.t("dash.export_done", { path: r.path }),
          "ok", 6000,
        );
      } else if (r && r.message === "cancelled") {

      } else {
        TG.ui.toast(
          TG.i18n.t("dash.export_failed", {
            error: (r && r.message) || "unknown",
          }),
          "err",
        );
      }
    } catch (e) {
      TG.ui.toast(
        TG.i18n.t("dash.export_failed", { error: String(e) }),
        "err",
      );
    }
  }

  function formatShortDate(iso) {
    if (!iso) return "";
    const parts = iso.split("-");
    if (parts.length !== 3) return iso;
    return parts[2] + "." + parts[1];
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function refresh() {
    loadChannels().then(() => {
      const root = document.getElementById("dashboard-root");
      if (root && root.querySelector("#dash-body")) {
        loadData();
      } else {
        renderFrame();
      }
    });
  }

  return { titleKey: "nav.dashboard", render, onMount, refresh };
})();
