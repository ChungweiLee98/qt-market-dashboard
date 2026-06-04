const palette = {
  taiex: "#2667b8",
  fmr: "#197b57",
  vix: "#b84a4a",
  usd: "#7751a8",
  wti: "#b86523",
  bond30y: "#0d7f83",
  foreign_oi: "#5a6670",
  mtx: "#d19a21",
};

let dashboard = null;
let activeRange = 365;
let trendChart = null;
let signalChart = null;

const trendMetricKeys = ["taiex", "fmr", "vix", "usd", "wti", "bond30y"];
const riskMetricKeys = ["fmr", "vix", "bond30y", "foreign_oi"];

fetch("./data/dashboard.json", { cache: "no-store" })
  .then((response) => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then((payload) => {
    dashboard = payload;
    boot();
  })
  .catch((error) => {
    document.body.innerHTML = `<main class="shell"><section class="panel"><h1>Dashboard data unavailable</h1><p>${escapeHtml(error.message)}</p></section></main>`;
  });

function boot() {
  trendChart = echarts.init(document.getElementById("trend-chart"));
  signalChart = echarts.init(document.getElementById("signal-chart"));

  document.getElementById("latest-date").textContent = dashboard.latest_data_date || "--";
  document.getElementById("generated-at").textContent = formatDateTime(dashboard.generated_at);
  renderCards();
  renderRiskList();
  renderSignalHeader();
  renderTrendChart();
  renderSignalChart();
  bindRangeControl();

  window.addEventListener("resize", () => {
    trendChart.resize();
    signalChart.resize();
  });
}

function bindRangeControl() {
  document.querySelectorAll("#range-control button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("#range-control button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      activeRange = Number(button.dataset.range || "365");
      renderTrendChart();
      renderSignalChart();
    });
  });
}

function renderCards() {
  const grid = document.getElementById("metric-grid");
  grid.innerHTML = dashboard.metrics.map((metric) => {
    const tone = changeTone(metric);
    const change = formatChange(metric);
    return `
      <article class="metric-card">
        <div class="metric-top">
          <span>${escapeHtml(metric.label)}</span>
          <div class="metric-date">${escapeHtml(metric.latest_date || "--")}</div>
        </div>
        <div class="metric-value">${formatValue(metric.latest, metric.precision)}${metric.unit ? `<span> ${escapeHtml(metric.unit)}</span>` : ""}</div>
        <div class="metric-change ${tone}">${change}</div>
      </article>
    `;
  }).join("");
}

function renderRiskList() {
  const list = document.getElementById("risk-list");
  const metricMap = byKey(dashboard.metrics);
  list.innerHTML = riskMetricKeys.map((key) => {
    const metric = metricMap[key];
    const pct = riskPercent(metric);
    return `
      <div class="risk-row">
        <div class="risk-name">${escapeHtml(metric.label)}</div>
        <div class="risk-value">${formatValue(metric.latest, metric.precision)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}</div>
        <div class="risk-bar"><span style="width: ${pct}%"></span></div>
      </div>
    `;
  }).join("");
}

function renderSignalHeader() {
  const latest = dashboard.signals.latest;
  const badge = document.getElementById("signal-badge");
  const subtitle = document.getElementById("signal-subtitle");
  if (!latest) return;

  badge.textContent = latest.signal_label || "--";
  badge.className = `signal-badge ${signalTone(latest)}`;
  const confidence = latest.confidence == null ? "--" : `${formatValue(latest.confidence, 1)}%`;
  subtitle.textContent = `${latest.date} / confidence ${confidence}`;
}

function renderTrendChart() {
  const metricMap = byKey(dashboard.metrics);
  const series = trendMetricKeys.map((key) => {
    const metric = metricMap[key];
    const points = trimPoints(metric.points, activeRange);
    const normalized = normalize(points);
    return {
      name: metric.label,
      type: "line",
      smooth: true,
      showSymbol: false,
      lineStyle: { width: 2 },
      emphasis: { focus: "series" },
      data: normalized.map((point) => [point.date, point.value]),
      color: palette[key],
    };
  });

  trendChart.setOption({
    animation: false,
    tooltip: { trigger: "axis", valueFormatter: (value) => Number(value).toFixed(2) },
    legend: { top: 0, type: "scroll" },
    grid: { left: 48, right: 20, top: 48, bottom: 46 },
    xAxis: { type: "time", axisLine: { lineStyle: { color: "#aab1a8" } } },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { formatter: "{value}" },
      splitLine: { lineStyle: { color: "#edf0ea" } },
    },
    dataZoom: [{ type: "inside" }, { type: "slider", height: 22, bottom: 8 }],
    series,
  }, true);
}

function renderSignalChart() {
  const points = trimPoints(dashboard.signals.points, activeRange);
  const closeData = points.map((point) => [point.date, point.close]);
  const riskOnMarks = points.filter((point) => point.risk_on === 1).map((point) => ({
    coord: [point.date, point.close],
    value: "R+",
  }));
  const riskOffMarks = points.filter((point) => point.risk_off === 1).map((point) => ({
    coord: [point.date, point.close],
    value: "R-",
  }));

  signalChart.setOption({
    animation: false,
    tooltip: { trigger: "axis" },
    grid: { left: 54, right: 18, top: 24, bottom: 38 },
    xAxis: { type: "time", axisLine: { lineStyle: { color: "#aab1a8" } } },
    yAxis: {
      type: "value",
      scale: true,
      splitLine: { lineStyle: { color: "#edf0ea" } },
    },
    dataZoom: [{ type: "inside" }],
    series: [
      {
        name: "TAIEX close",
        type: "line",
        smooth: true,
        showSymbol: false,
        data: closeData,
        color: palette.taiex,
        lineStyle: { width: 2 },
        markPoint: {
          symbolSize: 34,
          data: [
            ...riskOnMarks.map((item) => ({ ...item, itemStyle: { color: palette.fmr } })),
            ...riskOffMarks.map((item) => ({ ...item, itemStyle: { color: palette.vix } })),
          ],
        },
      },
    ],
  }, true);
}

function signalTone(latest) {
  const signal = String(latest.signal || "");
  if (signal === "1") return "risk-on";
  if (signal === "2") return "risk-off";
  return "neutral";
}

function byKey(metrics) {
  return Object.fromEntries(metrics.map((metric) => [metric.key, metric]));
}

function trimPoints(points, days) {
  if (!Array.isArray(points) || days === 0 || points.length === 0) return points || [];
  const latest = new Date(points[points.length - 1].date).getTime();
  const start = latest - days * 24 * 60 * 60 * 1000;
  return points.filter((point) => new Date(point.date).getTime() >= start);
}

function normalize(points) {
  const valid = points.filter((point) => point.value != null && Number(point.value) !== 0);
  if (valid.length === 0) return [];
  const start = Number(valid[0].value);
  return valid.map((point) => ({
    date: point.date,
    value: Number(((Number(point.value) / start) * 100).toFixed(2)),
  }));
}

function riskPercent(metric) {
  const points = trimPoints(metric.points, 365).map((point) => Number(point.value)).filter(Number.isFinite);
  if (!points.length || metric.latest == null) return 0;
  const min = Math.min(...points);
  const max = Math.max(...points);
  if (max === min) return 50;
  return Math.max(4, Math.min(100, ((Number(metric.latest) - min) / (max - min)) * 100));
}

function changeTone(metric) {
  if (metric.change == null || metric.change === 0 || metric.higher_is_good == null) return "neutral";
  const good = metric.higher_is_good ? metric.change > 0 : metric.change < 0;
  return good ? "good" : "bad";
}

function formatChange(metric) {
  if (metric.change == null) return "no prior value";
  const sign = metric.change > 0 ? "+" : "";
  const pct = metric.change_pct == null ? "" : ` (${metric.change_pct > 0 ? "+" : ""}${metric.change_pct}%)`;
  return `${sign}${formatValue(metric.change, metric.precision)}${pct}`;
}

function formatValue(value, precision = 2) {
  if (value == null || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
