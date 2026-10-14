TG.pages.compare = (function () {

  const state = {
    channels: [],
    selected: new Set(),
    period: 30,
    data: null,
    loading: false,
  };

  const PALETTE = [
    "#4d9eff", "#a855f7", "#f472b6",
    "#fbbf24", "#4ade80", "#fb923c",
  ];

  function render() {
    const el = document.createElement("div");
    el.className = "compare-page";
    el.id = "compare-root";
    return el;
  }

  function onMount() {
    loadChannels().then(() => renderFrame());
  }

  async function loadChannels() {
    try {
      const r = await TG.api.listTracked();
      state.channels = (r && r.items) || [];

      state.channels.slice(0, 2).forEach(c => state.selected.add(c.id));
    } catch (e) {
      state.channels = [];
    }
  }

  function renderFrame() {
    const root = document.getElementById("compare-root");
    if (!root) return;

    if (state.channels.length < 2) {
      root.innerHTML = `
        <div class="empty">
          <div class="empty-icon">${TG.ui.icon("compare", "icon-lg")}</div>
          <h2 class="empty-title">${TG.i18n.t("compare.empty_title")}</h2>
          <p class="empty-hint">${TG.i18n.t("compare.empty_hint")}</p>
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
      <div class="compare-toolbar">
        <div class="compare-channels" id="compare-channels">
          ${state.channels.map(c => `
            <label class="channel-toggle ${state.selected.has(c.id) ? "active" : ""}"
                   data-id="${c.id}">
              <input type="checkbox" ${state.selected.has(c.id) ? "checked" : ""}>
              <span class="channel-toggle-title">${escapeHtml(c.title)}</span>
              <span class="channel-toggle-subs">${TG.charts.fmtNum(c.subscribers)}</span>
            </label>
          `).join("")}
        </div>
        <div class="tabs" id="period-tabs">
          <button class="tab ${state.period === 7  ? "active" : ""}" data-days="7">7D</button>
          <button class="tab ${state.period === 30 ? "active" : ""}" data-days="30">30D</button>
          <button class="tab ${state.period === 90 ? "active" : ""}" data-days="90">90D</button>
          <button class="tab ${state.period === 0  ? "active" : ""}" data-days="0">${TG.i18n.t("dash.tab_all")}</button>
        </div>
      </div>
      <div id="compare-body"></div>`;

    document.querySelectorAll(".channel-toggle").forEach(lbl => {
      lbl.onclick = e => {
        e.preventDefault();
        const id = parseInt(lbl.dataset.id, 10);
        if (state.selected.has(id)) {
          state.selected.delete(id);
          lbl.classList.remove("active");
        } else {
          if (state.selected.size >= 6) {
            TG.ui.toast(TG.i18n.t("compare.max_six"), "info");
            return;
          }
          state.selected.add(id);
          lbl.classList.add("active");
        }
        const cb = lbl.querySelector("input");
        if (cb) cb.checked = state.selected.has(id);
        loadData();
      };
    });

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

    loadData();
  }

  async function loadData() {
    const body = document.getElementById("compare-body");
    if (!body) return;

    if (state.selected.size < 2) {
      body.innerHTML = `<div class="chart-empty" style="padding:80px 20px;">
        ${TG.i18n.t("compare.need_two")}
      </div>`;
      return;
    }

    body.innerHTML = `<div class="dash-loading"><div class="spinner-dark"></div></div>`;

    try {
      const ids = Array.from(state.selected);
      const r = await TG.api.compareChannels(ids, state.period);
      if (r && r.ok) {
        state.data = r.data;
        renderBody(body, r.data);
      } else {
        body.innerHTML = `<div class="chart-empty">
          ${escapeHtml((r && r.message) || "Failed to load")}</div>`;
      }
    } catch (e) {
      body.innerHTML = `<div class="chart-empty">${escapeHtml(String(e))}</div>`;
    }
  }

  function renderBody(body, d) {
    const channels = d.channels || [];
    const periodLabel = TG.i18n.t("dash.period_suffix", { n: d.period_days });

    const withColors = channels.map((c, i) => ({
      ...c,
      _color: PALETTE[i % PALETTE.length],
    }));

    body.innerHTML = `
      <div class="dash-card">
        <div class="dash-card-header">
          <h3>${TG.i18n.t("compare.table_title")} · ${periodLabel}</h3>
        </div>
        <div class="dash-card-body">
          ${renderCompareTable(withColors)}
        </div>
      </div>

      <div class="dash-card">
        <div class="dash-card-header">
          <h3>${TG.i18n.t("compare.growth_title")} · ${periodLabel}</h3>
        </div>
        <div class="dash-card-body">
          <div id="compare-growth"></div>
        </div>
      </div>

      <div class="dash-row dash-row-2col">
        <div class="dash-card">
          <div class="dash-card-header">
            <h3>${TG.i18n.t("compare.avg_views_title")}</h3>
          </div>
          <div class="dash-card-body">
            <div id="compare-avg"></div>
          </div>
        </div>
        <div class="dash-card">
          <div class="dash-card-header">
            <h3>${TG.i18n.t("compare.er_title")}</h3>
          </div>
          <div class="dash-card-body">
            <div id="compare-er"></div>
          </div>
        </div>
      </div>
    `;

    const { labels, series } = alignSeries(withColors);
    TG.charts.multiLineChart(
      document.getElementById("compare-growth"),
      { labels, series },
      { height: 280, emptyText: TG.i18n.t("compare.not_enough_data") },
    );

    TG.charts.barChart(
      document.getElementById("compare-avg"),
      withColors.map(c => ({
        label: c.channel.title,
        value: c.stats.avg_views,
      })),
      { height: 240, color: "#4d9eff", emptyText: TG.i18n.t("dash.no_data") },
    );

    TG.charts.barChart(
      document.getElementById("compare-er"),
      withColors.map(c => ({
        label: c.channel.title,
        value: c.stats.er,
      })),
      { height: 240, color: "#a855f7", emptyText: TG.i18n.t("dash.no_data") },
    );
  }

  function renderCompareTable(channels) {
    const rows = [
      {
        label: TG.i18n.t("compare.metric_subscribers"),
        get: c => TG.charts.fmtNum(c.stats.subscribers),
      },
      {
        label: TG.i18n.t("compare.metric_change"),
        get: c => {
          const v = c.stats.change_period;
          if (v === null || v === undefined) return "—";
          const sign = v > 0 ? "+" : "";
          const cls = v > 0 ? "up" : v < 0 ? "down" : "";
          return `<span class="delta ${cls}">${sign}${TG.charts.fmtNum(v)}</span>`;
        },
      },
      {
        label: TG.i18n.t("compare.metric_avg_views"),
        get: c => TG.charts.fmtNum(c.stats.avg_views),
      },
      {
        label: TG.i18n.t("compare.metric_er"),
        get: c => c.stats.er.toFixed(2) + "%",
      },
      {
        label: TG.i18n.t("compare.metric_posts"),
        get: c => String(c.stats.posts_count),
      },
    ];

    return `
      <table class="compare-table">
        <thead>
          <tr>
            <th></th>
            ${channels.map(c => `
              <th>
                <div class="compare-th-color"
                     style="background:${c._color}"></div>
                <div class="compare-th-name">${escapeHtml(c.channel.title)}</div>
              </th>
            `).join("")}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="compare-row-label">${r.label}</td>
              ${channels.map(c => `<td>${r.get(c)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function alignSeries(channels) {
    const allDates = new Set();
    const dateToLabel = {};
    channels.forEach(c => {
      (c.growth_series || []).forEach(p => {
        allDates.add(p.date);
        dateToLabel[p.date] = p.label || p.date;
      });
    });
    const sortedDates = Array.from(allDates).sort();
    const displayLabels = sortedDates.map(d => dateToLabel[d] || d);

    const series = channels.map(c => {
      const map = {};
      (c.growth_series || []).forEach(p => { map[p.date] = p.subscribers; });
      let last = null;
      const values = sortedDates.map(d => {
        if (map[d] !== undefined) last = map[d];
        return last;
      });
      return {
        name: c.channel.title,
        color: c._color,
        values,
      };
    });

    return { labels: displayLabels, series };
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function refresh() {
    loadChannels().then(() => renderFrame());
  }

  return { titleKey: "nav.compare", render, onMount, refresh };
})();
