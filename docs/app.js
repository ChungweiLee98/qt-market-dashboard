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
    const assessment = assessRisk(metric);
    return `
      <div class="risk-row">
        <div class="risk-row-head">
          <div>
            <div class="risk-name">${escapeHtml(metric.label)}</div>
            <div class="risk-dimension">${escapeHtml(assessment.dimension)}</div>
          </div>
          <div class="risk-pill ${assessment.tone}">${escapeHtml(assessment.status)}</div>
        </div>
        <div class="risk-reading">
          <span>Latest</span>
          <strong>${formatValue(metric.latest, metric.precision)}${metric.unit ? ` ${escapeHtml(metric.unit)}` : ""}</strong>
        </div>
        <p class="risk-note">${escapeHtml(assessment.note)}</p>
        <div class="risk-meta">${escapeHtml(assessment.meta)}</div>
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

function assessRisk(metric) {
  const value = Number(metric.latest);
  const percentile = valuePercentile(metric);
  const meta = percentile == null ? "1Y percentile: --" : `1Y percentile: ${formatValue(percentile, 0)}%`;

  if (metric.key === "fmr") {
    if (value < 145) {
      return riskAssessment("Margin Safety", "High Risk", "danger", "FMR is below 145%, indicating elevated forced-selling and margin pressure risk.", meta);
    }
    if (value < 160) {
      return riskAssessment("Margin Safety", "Medium Risk", "watch", "FMR is below the comfort zone, so leveraged positioning needs monitoring.", meta);
    }
    return riskAssessment("Margin Safety", "Low Risk", "calm", "FMR is above 160%, suggesting a relatively healthy margin safety buffer.", meta);
  }

  if (metric.key === "vix") {
    if (value >= 40) {
      return riskAssessment("Global Volatility", "Panic Zone", "danger", "VIX is above 40, indicating an extreme risk-off environment.", meta);
    }
    if (value >= 30) {
      return riskAssessment("Global Volatility", "High Volatility", "danger", "VIX is above 30, showing clear volatility pressure across risk assets.", meta);
    }
    if (value >= 20) {
      return riskAssessment("Global Volatility", "Volatility Rising", "watch", "VIX is above 20, suggesting risk aversion is rising.", meta);
    }
    return riskAssessment("Global Volatility", "Low Volatility", "calm", "VIX is below 20, so external volatility is currently contained.", meta);
  }

  if (metric.key === "bond30y") {
    if (value >= 5) {
      return riskAssessment("Rate Pressure", "High Pressure", "danger", "The 30Y Treasury yield is near or above 5%, weighing on valuation and funding costs.", meta);
    }
    if (value >= 4.58) {
      return riskAssessment("Rate Pressure", "Elevated Pressure", "watch", "The 30Y Treasury yield is above the 4.58% watch level, so growth-stock valuation pressure should be monitored.", meta);
    }
    if (value >= 4.3) {
      return riskAssessment("Rate Pressure", "Moderately Elevated", "watch", "Long-end rates remain relatively high and may still pressure valuations.", meta);
    }
    return riskAssessment("Rate Pressure", "Lower Pressure", "calm", "Long-end rates are below the main pressure zone, so funding-cost pressure is relatively moderate.", meta);
  }

  if (metric.key === "foreign_oi") {
    if (value <= -35000) {
      return riskAssessment("Foreign Positioning", "Foreign Bearish", "danger", "Foreign futures open interest is below -35,000, showing a clear bearish positioning bias.", meta);
    }
    if (value < 0) {
      return riskAssessment("Foreign Positioning", "Foreign Cautious", "watch", "Foreign futures open interest is still negative, indicating a cautious bias.", meta);
    }
    if (value >= 35000) {
      return riskAssessment("Foreign Positioning", "Foreign Bullish", "calm", "Foreign futures open interest is above 35,000, showing a clear bullish positioning bias.", meta);
    }
    return riskAssessment("Foreign Positioning", "Foreign Neutral", "neutral", "Foreign futures open interest is near neutral, so the positioning signal is not strong.", meta);
  }

  return riskAssessment("Risk Monitor", "Pending", "neutral", "No risk rule is configured for this metric yet.", meta);
}

function riskAssessment(dimension, status, tone, note, meta) {
  return { dimension, status, tone, note, meta };
}

function valuePercentile(metric) {
  const points = trimPoints(metric.points, 365).map((point) => Number(point.value)).filter(Number.isFinite);
  const value = Number(metric.latest);
  if (!points.length || !Number.isFinite(value)) return null;
  const rank = points.filter((point) => point <= value).length / points.length;
  return rank * 100;
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
  return date.toLocaleString("en-US", {
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
