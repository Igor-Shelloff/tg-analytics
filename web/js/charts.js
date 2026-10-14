window.TG = window.TG || {};

TG.charts = (function () {

  function fmtNum(n) {
    n = Number(n) || 0;
    if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (Math.abs(n) >= 1_000)     return (n / 1_000).toFixed(1) + "K";
    return String(Math.round(n));
  }

  function fmtFull(n) {
    n = Number(n) || 0;
    return Math.round(n).toLocaleString("en-US");
  }

  function fmtAxis(value, range) {
    const abs = Math.abs(value);
    const r = Math.max(0, Number(range) || 0);

    if (abs >= 1_000_000) {
      if (r >= 1_000_000)  return (value / 1_000_000).toFixed(1) + "M";
      if (r >= 100_000)    return (value / 1_000_000).toFixed(2) + "M";
      if (r >= 10_000)     return (value / 1_000_000).toFixed(3) + "M";
      if (r >= 1_000)      return (value / 1_000).toFixed(0) + "K";
      return Math.round(value).toLocaleString("en-US");
    }
    if (abs >= 1_000) {
      if (r >= 100_000)    return (value / 1_000).toFixed(0) + "K";
      if (r >= 10_000)     return (value / 1_000).toFixed(1) + "K";
      if (r >= 1_000)      return (value / 1_000).toFixed(2) + "K";
      if (r >= 100)        return Math.round(value).toLocaleString("en-US");
      if (r >= 10)         return value.toFixed(1);
      return value.toFixed(2);
    }
    if (r >= 100)    return Math.round(value).toString();
    if (r >= 10)     return value.toFixed(1);
    if (r >= 1)      return value.toFixed(2);
    return value.toFixed(3);
  }

  function niceRange(min, max) {
    if (min === max) {
      const pad = Math.max(1, Math.abs(min) * 0.001);
      return [min - pad, max + pad];
    }
    const pad = (max - min) * 0.08;
    return [Math.max(0, min - pad), max + pad];
  }

  function uid() {
    return "c" + Math.random().toString(36).slice(2, 9);
  }

  function pickXLabels(points, innerW, totalWidth) {
    const maxLabels = Math.max(4, Math.min(8, Math.floor(totalWidth / 60)));
    const total = points.length;
    if (total <= maxLabels) {
      return points.map((p, i) => i);
    }
    const step = Math.ceil(total / maxLabels);
    const result = [];
    for (let i = 0; i < total; i += step) result.push(i);
    if (result[result.length - 1] !== total - 1) result.push(total - 1);
    return result;
  }

  function lineChart(container, points, opts = {}) {
    container.innerHTML = "";

    if (!points || !points.length) {
      container.innerHTML =
        `<div class="chart-empty">${opts.emptyText || "No data"}</div>`;
      return;
    }

    const color = opts.color || "#4d9eff";
    const H = opts.height || 260;

    if (points.length === 1) {
      const p = points[0];
      container.innerHTML = `
        <div class="chart-single" style="height:${H}px;">
          <div class="chart-single-dot-wrap" style="
            background: radial-gradient(circle, ${color}44 0%, transparent 70%);
          ">
            <div class="chart-single-dot" style="
              background:${color}; box-shadow:0 0 16px ${color};
            "></div>
          </div>
          <div class="chart-single-value">${fmtNum(p.value)}</div>
          ${p.label ? `<div class="chart-single-label">${p.label}</div>` : ""}
          <div class="chart-single-note">
            ${opts.singleNote || "Collecting history — the chart will fill in over time"}
          </div>
        </div>`;
      return;
    }

    const W = container.clientWidth || 800;
    const pad = { top: 24, right: 24, bottom: 32, left: 76 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    const values = points.map(p => Number(p.value) || 0);
    let minV = Math.min(...values);
    let maxV = Math.max(...values);
    const rawRange = maxV - minV;
    [minV, maxV] = niceRange(minV, maxV);
    const displayRange = maxV - minV;

    const xScale = i => pad.left + (i / (points.length - 1)) * innerW;
    const yScale = v => pad.top + innerH - ((v - minV) / displayRange) * innerH;

    const linePath = points.map((p, i) =>
      `${i === 0 ? "M" : "L"} ${xScale(i).toFixed(2)} ${yScale(p.value).toFixed(2)}`
    ).join(" ");

    const areaPath = opts.showArea === false ? "" :
      `${linePath} L ${xScale(points.length - 1).toFixed(2)} ${pad.top + innerH} ` +
      `L ${pad.left} ${pad.top + innerH} Z`;

    const gridLines = [];
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * innerH;
      const val = maxV - (i / 4) * displayRange;
      gridLines.push(
        `<line x1="${pad.left}" y1="${y}" x2="${pad.left + innerW}" y2="${y}" ` +
        `stroke="var(--border)" stroke-width="1" stroke-dasharray="2,4"/>`,
        `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" ` +
        `fill="var(--text-tertiary)" font-size="10">` +
        `${fmtAxis(val, rawRange)}</text>`
      );
    }

    const idxToShow = pickXLabels(points, innerW, W);
    const xLabels = idxToShow.map(i => {
      const x = xScale(i);
      return `<text x="${x}" y="${H - 10}" text-anchor="middle" ` +
             `fill="var(--text-tertiary)" font-size="10">${points[i].label}</text>`;
    }).join("");

    const dots = opts.showDots === false ? "" : points.map((p, i) => {
      const x = xScale(i), y = yScale(p.value);
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.5"
                fill="var(--surface)" stroke="${color}" stroke-width="2"
                style="cursor:pointer;">
        <title>${p.label ? p.label + " · " : ""}${fmtFull(p.value)}</title>
      </circle>`;
    }).join("");

    const gradId = uid();

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           style="width:100%;height:${H}px;display:block;">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${gridLines.join("")}
        ${areaPath ? `<path d="${areaPath}" fill="url(#${gradId})"/>` : ""}
        <path d="${linePath}" fill="none" stroke="${color}"
              stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"
              class="line-anim" style="stroke-dasharray:3000;stroke-dashoffset:3000;"/>
        ${dots}
        ${xLabels}
      </svg>`;

    container.innerHTML = svg;
    requestAnimationFrame(() => {
      const path = container.querySelector(".line-anim");
      if (path) path.style.strokeDashoffset = "0";
    });
  }

  function barChart(container, bars, opts = {}) {
    container.innerHTML = "";
    if (!bars || !bars.length) {
      container.innerHTML =
        `<div class="chart-empty">${opts.emptyText || "No data"}</div>`;
      return;
    }

    const W = container.clientWidth || 800;
    const H = opts.height || 240;
    const pad = { top: 36, right: 16, bottom: 32, left: 76 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    const values = bars.map(b => Number(b.value) || 0);
    const realMax = Math.max(...values, 0);
    const realMin = Math.min(...values, 0);

    let yMin = 0;
    let yMax = realMax;
    const spread = realMax - realMin;
    if (realMax > 0 && spread < realMax * 0.5 && bars.length <= 12) {
      const padding = spread * 0.15 || realMax * 0.02;
      yMin = Math.max(0, realMin - padding);
      yMax = realMax + padding;
    } else if (realMax === 0) {
      yMax = 1;
    }
    const yRange = yMax - yMin || 1;

    const barW = Math.max(2, innerW / bars.length * 0.72);
    const gap = innerW / bars.length;

    const grid = [];
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * innerH;
      const val = yMax - (i / 4) * yRange;
      grid.push(
        `<line x1="${pad.left}" y1="${y}" x2="${pad.left + innerW}" y2="${y}" ` +
        `stroke="var(--border)" stroke-width="1" stroke-dasharray="2,4"/>`,
        `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" ` +
        `fill="var(--text-tertiary)" font-size="10">` +
        `${fmtAxis(val, yRange)}</text>`
      );
    }

    const color = opts.color || "#4d9eff";
    const showValues = bars.length <= 12;

    const barsSvg = bars.map((b, i) => {
      const v = Number(b.value) || 0;
      const h = ((v - yMin) / yRange) * innerH;
      const x = pad.left + i * gap + (gap - barW) / 2;
      const y = pad.top + innerH - h;

      let valueLabel = "";
      if (showValues) {
        const label = fmtNum(v);
        valueLabel = `<text x="${(x + barW / 2).toFixed(2)}"
                            y="${(y - 8).toFixed(2)}"
                            text-anchor="middle"
                            fill="var(--text-secondary)"
                            font-size="10.5"
                            font-weight="600"
                            style="pointer-events:none;">
          ${label}</text>`;
      }

      return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}"
                    width="${barW.toFixed(2)}" height="${h.toFixed(2)}"
                    rx="3" fill="${color}" opacity="0.85"
                    class="bar-anim"
                    data-idx="${i}"
                    style="transform-origin:${x + barW / 2}px ${pad.top + innerH}px;"
              ><title>${b.label ? b.label + " · " : ""}${fmtFull(v)}</title>
              </rect>
              ${valueLabel}`;
    }).join("");

    const xLabels = bars.map((b, i) => {
      const x = pad.left + i * gap + gap / 2;
      const step = Math.max(1, Math.floor(bars.length / 8));
      if (i % step !== 0 && i !== bars.length - 1) return "";
      return `<text x="${x}" y="${H - 10}" text-anchor="middle" ` +
             `fill="var(--text-tertiary)" font-size="10">${b.label}</text>`;
    }).join("");

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           style="width:100%;height:${H}px;display:block;">
        ${grid.join("")}
        ${barsSvg}
        ${xLabels}
      </svg>`;

    container.innerHTML = svg;

    requestAnimationFrame(() => {
      container.querySelectorAll(".bar-anim").forEach((r, i) => {
        const h = parseFloat(r.getAttribute("height"));
        r.style.transition = `transform .5s cubic-bezier(0.22,1,0.36,1) ${i * 20}ms`;
        r.style.transform = "scaleY(1)";
        r.setAttribute("height", h);
      });
    });

    if (opts.onBarClick) {
      container.querySelectorAll(".bar-anim").forEach(r => {
        r.style.cursor = "pointer";
        r.addEventListener("click", () => {
          const idx = parseInt(r.dataset.idx, 10);
          opts.onBarClick(bars[idx], idx);
        });
      });
    }
  }

  function heatmap(container, matrix, opts = {}) {
    container.innerHTML = "";
    if (!matrix || !matrix.length) {
      container.innerHTML =
        `<div class="chart-empty">${opts.emptyText || "No data"}</div>`;
      return;
    }

    let maxV = 0;
    for (const row of matrix) for (const v of row) if (v > maxV) maxV = v;
    if (maxV === 0) {
      container.innerHTML =
        `<div class="chart-empty">${opts.emptyText || "No data"}</div>`;
      return;
    }

    const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const best = opts.best || null;

    const html = [];
    html.push('<div class="heatmap">');
    html.push('<div class="heatmap-row heatmap-header">');
    html.push('<div class="heatmap-corner"></div>');
    for (let h = 0; h < 24; h++) {
      const show = h % 3 === 0;
      html.push(`<div class="heatmap-hcell">${show ? h : ""}</div>`);
    }
    html.push('</div>');

    for (let d = 0; d < 7; d++) {
      html.push('<div class="heatmap-row">');
      html.push(`<div class="heatmap-label">${dayLabels[d]}</div>`);
      for (let h = 0; h < 24; h++) {
        const v = matrix[d][h] || 0;
        const intensity = v / maxV;
        const isBest = best && best.weekday === d && best.hour === h;
        const style = v > 0
          ? `background: rgba(77,158,255,${0.08 + intensity * 0.75});`
          : "";
        const cls = "heatmap-cell" + (isBest ? " best" : "");
        const title = `${dayLabels[d]} ${String(h).padStart(2, "0")}:00 — ` +
                       (v > 0 ? `${fmtNum(v)} avg views` : "no data");
        html.push(
          `<div class="${cls}" style="${style}" title="${title}"></div>`
        );
      }
      html.push('</div>');
    }
    html.push('</div>');

    container.innerHTML = html.join("");
  }

  function doughnut(container, segments, opts = {}) {
    container.innerHTML = "";
    const filtered = (segments || []).filter(s => s.value > 0);
    if (!filtered.length) {
      container.innerHTML =
        `<div class="chart-empty">${opts.emptyText || "No data"}</div>`;
      return;
    }

    const size = opts.size || 200;
    const thick = opts.thickness || 26;
    const r = (size - thick) / 2;
    const cx = size / 2;
    const cy = size / 2;
    const C = 2 * Math.PI * r;

    const total = filtered.reduce((s, x) => s + x.value, 0);
    let offset = 0;
    const circles = filtered.map(seg => {
      const frac = seg.value / total;
      const len = frac * C;
      const el = `<circle cx="${cx}" cy="${cy}" r="${r}"
        fill="none" stroke="${seg.color}" stroke-width="${thick}"
        stroke-dasharray="${len} ${C - len}"
        stroke-dashoffset="${-offset}"
        transform="rotate(-90 ${cx} ${cy})"
        style="transition: stroke-dasharray .6s cubic-bezier(0.22,1,0.36,1);"
      />`;
      offset += len;
      return el;
    }).join("");

    const centerLabel = opts.centerLabel || "";
    const centerValue = opts.centerValue || "";

    const svg = `
      <svg viewBox="0 0 ${size} ${size}" style="width:${size}px;height:${size}px;">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
                stroke="var(--border)" stroke-width="${thick}" opacity="0.4"/>
        ${circles}
        <text x="${cx}" y="${cy - 2}" text-anchor="middle"
              fill="var(--text)" font-size="20" font-weight="600">
          ${centerValue}
        </text>
        <text x="${cx}" y="${cy + 18}" text-anchor="middle"
              fill="var(--text-tertiary)" font-size="11">
          ${centerLabel}
        </text>
      </svg>`;

    container.innerHTML = svg;
  }

  function multiLineChart(container, data, opts = {}) {
    container.innerHTML = "";
    const { labels, series } = data || {};
    if (!labels || !labels.length || !series || !series.length) {
      container.innerHTML =
        `<div class="chart-empty">${opts.emptyText || "No data"}</div>`;
      return;
    }

    const W = container.clientWidth || 800;
    const H = opts.height || 260;
    const pad = { top: 24, right: 24, bottom: 32, left: 76 };
    const innerW = W - pad.left - pad.right;
    const innerH = H - pad.top - pad.bottom;

    let minV = Infinity, maxV = -Infinity;
    series.forEach(s => {
      s.values.forEach(v => {
        if (v === null || v === undefined) return;
        if (v < minV) minV = v;
        if (v > maxV) maxV = v;
      });
    });
    if (!isFinite(minV)) { minV = 0; maxV = 100; }
    const rawRange = maxV - minV;
    [minV, maxV] = niceRange(minV, maxV);
    const displayRange = maxV - minV;

    const xScale = i =>
      pad.left + (i / Math.max(1, labels.length - 1)) * innerW;
    const yScale = v =>
      pad.top + innerH - ((v - minV) / displayRange) * innerH;

    const grid = [];
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (i / 4) * innerH;
      const val = maxV - (i / 4) * displayRange;
      grid.push(
        `<line x1="${pad.left}" y1="${y}" x2="${pad.left + innerW}" y2="${y}" ` +
        `stroke="var(--border)" stroke-width="1" stroke-dasharray="2,4"/>`,
        `<text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" ` +
        `fill="var(--text-tertiary)" font-size="10">` +
        `${fmtAxis(val, rawRange)}</text>`
      );
    }

    const total = labels.length;
    const maxLabels = Math.max(4, Math.min(7, Math.floor(W / 90)));
    const idxToShow = [];
    if (total <= maxLabels) {
      for (let i = 0; i < total; i++) idxToShow.push(i);
    } else {
      const step = Math.ceil(total / maxLabels);
      for (let i = 0; i < total; i += step) idxToShow.push(i);
      if (idxToShow[idxToShow.length - 1] !== total - 1) idxToShow.push(total - 1);
    }

    const xLabels = idxToShow.map(i =>
      `<text x="${xScale(i)}" y="${H - 10}" text-anchor="middle" ` +
      `fill="var(--text-tertiary)" font-size="10">${labels[i]}</text>`
    ).join("");

    const paths = series.map(s => {
      let d = "";
      let started = false;
      for (let i = 0; i < s.values.length; i++) {
        const v = s.values[i];
        if (v === null || v === undefined) continue;
        const x = xScale(i).toFixed(2);
        const y = yScale(v).toFixed(2);
        d += `${started ? "L" : "M"} ${x} ${y} `;
        started = true;
      }
      const pathEl = (d.match(/[ML]/g) || []).length >= 2
        ? `<path d="${d.trim()}" fill="none" stroke="${s.color}" ` +
          `stroke-width="2.5" stroke-linejoin="round" ` +
          `stroke-linecap="round"/>`
        : "";

      const dots = s.values.map((v, i) => {
        if (v === null || v === undefined) return "";
        const x = xScale(i).toFixed(2);
        const y = yScale(v).toFixed(2);
        return `<circle cx="${x}" cy="${y}" r="3.5"
                  fill="var(--surface)" stroke="${s.color}" stroke-width="2">
          <title>${s.name} · ${labels[i]} · ${fmtFull(v)}</title>
        </circle>`;
      }).join("");

      return pathEl + dots;
    }).join("");

    const legend = series.map(s => `
      <span class="ml-legend-item">
        <span class="ml-legend-dot" style="background:${s.color}"></span>
        <span>${s.name}</span>
      </span>
    `).join("");

    const svg = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
           style="width:100%;height:${H}px;display:block;">
        ${grid.join("")}
        ${paths}
        ${xLabels}
      </svg>
      <div class="ml-legend">${legend}</div>`;

    container.innerHTML = svg;
  }

  return {
    lineChart, barChart, heatmap, doughnut, multiLineChart,
    fmtNum, fmtFull, fmtAxis,
  };
})();
