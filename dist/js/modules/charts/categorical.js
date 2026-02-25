
import { normalizeToISODateOnly } from '../date.js';

// Internal chart refs
let charts = { status: null, disc: null, resp: null };
let r = true;
let aspect = false;

function palette(n, s = 70, l = 50) {
  if (n <= 0) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = Math.round((360 * i) / n);
    out.push(`hsl(${h} ${s}% ${l}%)`);
  }
  return out;
}

function prep(dist, { topN = Infinity, emptyLabel = '<empty>' } = {}) {
  const sliced = dist.slice(0, topN);
  const labels = sliced.map(([k]) => k || emptyLabel);
  const data = sliced.map(([, v]) => v);
  return { labels, data };
}

function ensureStatusChart() {
  const ctx = document.getElementById('chart-status');
  if (!ctx || charts.status || !window.Chart) return;
  charts.status = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: [], datasets: [{ data: [], backgroundColor: [], borderWidth: 1 }] },
    options: {
      responsive: r, maintainAspectRatio: aspect,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const data = ctx.dataset.data || [];
              const total = data.reduce((a, b) => a + b, 0) || 1;
              const pct = (ctx.parsed / total) * 100;
              return `${ctx.label}: ${ctx.parsed} (${pct.toFixed(1)}%)`;
            }
          }
        },
        datalabels: {
          formatter: (value, ctx) => {
            const data = ctx.dataset.data || [];
            const total = data.reduce((a, b) => a + b, 0) || 1;
            const pct = (value / total) * 100;
            return pct >= 8 ? `${Math.round(pct)}%` : null;
          },
          color: '#0f172a',
          font: { weight: 600, size: 10 },
          clamp: true
        }
      },
      animation: { duration: 200 }
    }
  });
}

function ensureBarChart(key) {
  const id = key === 'disc' ? 'chart-disc' : 'chart-resp';
  const ctx = document.getElementById(id);
  if (!ctx || charts[key] || !window.Chart) return;
  charts[key] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        { label: 'Actual', data: [], backgroundColor: '#72bf44', borderWidth: 1 },
        { label: 'No Actual', data: [], backgroundColor: '#1A383B', borderWidth: 1 },
      ]
    },
    options: {
      indexAxis: 'y',
      responsive: r,
      maintainAspectRatio: aspect,
      scales: {
        x: { stacked: true, grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { precision: 0 } },
        y: { stacked: true, grid: { display: false } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12 } },
        datalabels: {
          display: true,
          anchor: 'center',
          align: 'center',
          offset: 0,
          clamp: true,
          clip: true,
          color: '#ffffff',
          font: { weight: 600, size: 10 },
          textStrokeColor: 'rgba(0,0,0,0.25)',
          textStrokeWidth: 1,
          formatter: (value, ctx) => {
            if (!Number.isFinite(value) || value <= 0) return null;
            const i = ctx.dataIndex;
            const meta = ctx.chart.getDatasetMeta(ctx.datasetIndex);
            const el = meta?.data?.[i];
            if (!el) return null;
            const w = Math.abs((el.x ?? 0) - (el.base ?? 0));
            const labelCount = (ctx.chart?.data?.labels ?? []).length;
            const isDisc = ctx.chart?.canvas?.id === 'chart-disc';
            const inTop8 = isDisc ? i < Math.min(8, labelCount) : true;
            if (!inTop8 || w < 26) return null;
            return value;
          }
        }
      },
      animation: { duration: 200 }
    }
  });
}

function groupCounts(rows, field) {
  const map = new Map();
  for (const r of rows) {
    const key = (r[field] ?? '').toString();
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

function hasActual(r) {
  return !!normalizeToISODateOnly(r?.['Actual (UTC +8)']);
}

function groupCountsStacked(rows, field) {
  const actualMap = new Map();
  const noActualMap = new Map();
  for (const r of rows ?? []) {
    const key = (r?.[field] ?? '').toString();
    if (!key) continue;
    if (hasActual(r)) {
      actualMap.set(key, (actualMap.get(key) ?? 0) + 1);
    } else {
      noActualMap.set(key, (noActualMap.get(key) ?? 0) + 1);
    }
  }
  const allKeys = new Set([...actualMap.keys(), ...noActualMap.keys()]);
  const totals = [];
  for (const k of allKeys) totals.push([k, (actualMap.get(k) ?? 0) + (noActualMap.get(k) ?? 0)]);
  totals.sort((a, b) => b[1] - a[1]);

  const labels = totals.map(([k]) => k || '<empty>');
  const actualData = labels.map(k => actualMap.get(k) ?? 0);
  const noActualData = labels.map(k => noActualMap.get(k) ?? 0);
  return { labels, actualData, noActualData };
}

function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt;
}

// Public API
export function updateCategoricalCharts(filteredRows) {
  ensureStatusChart();
  ensureBarChart('disc');
  ensureBarChart('resp');

  // Status
  const distStatus = groupCounts(filteredRows, 'Status');
  const s = prep(distStatus);
  const colS = ['#72bf44', '#1A383B', '#4F748B', '#006C5C'].slice(0, s.labels.length);
  if (charts.status) {
    charts.status.data.labels = s.labels;
    charts.status.data.datasets[0].data = s.data;
    charts.status.data.datasets[0].backgroundColor = colS;
    charts.status.update();
  }

  // Stacked distributions for Discipline & RespID
  const discStack = groupCountsStacked(filteredRows, 'Cert Disc');
  const respStack = groupCountsStacked(filteredRows, 'RespID');

  // Cap RespID to top 5 by total
  const totalByIdx = respStack.labels.map((_, i) => (respStack.actualData[i] + respStack.noActualData[i]));
  const order = totalByIdx.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t).slice(0, 5).map(o => o.i);
  const respTop5 = {
    labels: order.map(i => respStack.labels[i]),
    actualData: order.map(i => respStack.actualData[i]),
    noActualData: order.map(i => respStack.noActualData[i]),
  };

  if (charts.disc) {
    charts.disc.data.labels = discStack.labels;
    charts.disc.data.datasets[0].data = discStack.actualData;
    charts.disc.data.datasets[1].data = discStack.noActualData;
    charts.disc.update();
  }
  if (charts.resp) {
    charts.resp.data.labels = respTop5.labels;
    charts.resp.data.datasets[0].data = respTop5.actualData;
    charts.resp.data.datasets[1].data = respTop5.noActualData;
    charts.resp.update();
  }

  // Captions under charts
  setText('chart-status-total', filteredRows.length ? `${filteredRows.length} row(s)` : '');
  setText('chart-disc-total', discStack.labels.length ? `${discStack.labels.length} bucket(s) • stacked Complete / Incomplete` : '');
  setText('chart-resp-total', respTop5.labels.length ? `${respTop5.labels.length} bucket(s) • stacked Complete / Incomplete` : '');
}

export function resizeCategoricalCharts() {
  Object.values(charts).forEach(ch => ch && ch.resize && ch.resize());
}
