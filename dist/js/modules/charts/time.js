import { normalizeToISODateOnly, startOfISOWeekYMD } from '../date.js';
import { toCumulative } from '../utils.js';

let chartsActual = null;
let chartsActualCum = null;

let r = true;
let aspect = false;

function buildDailySeries(rows, column = 'Actual (UTC +8)') {
  const map = new Map();
  for (const r of rows) {
    const key = normalizeToISODateOnly(r?.[column]);
    if (!key) continue;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  const entries = Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return { labels: entries.map(([k]) => k), data: entries.map(([, v]) => v) };
}

function buildTimeSeries(rows, column = 'Actual (UTC +8)', grain = 'daily') {
  const map = new Map(); const labelMap = new Map();
  for (const r of rows) {
    const iso = normalizeToISODateOnly(r?.[column]);
    if (!iso) continue;
    let key, label;
    if (grain === 'daily') { key = iso; label = iso; }
    else if (grain === 'weekly') { const wk = startOfISOWeekYMD(iso); key = wk; label = `${wk}`; }
    else if (grain === 'monthly') { key = iso.slice(0, 7); label = key; }
    else if (grain === 'yearly') { key = iso.slice(0, 4); label = key; }
    else { key = iso; label = iso; }
    map.set(key, (map.get(key) ?? 0) + 1);
    if (!labelMap.has(key)) labelMap.set(key, label);
  }
  const keys = Array.from(map.keys()).sort();
  return { labels: keys.map(k => labelMap.get(k)), data: keys.map(k => map.get(k)) };
}

function ensureActualLineChart() {
  if (chartsActual || !window.Chart) return;
  const el = document.getElementById('chart-actual-line');
  if (!el) return;
  chartsActual = new Chart(el, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Count', data: [], tension: 0.25, borderColor: '#72bf44', backgroundColor: 'rgba(114,191,68,0.15)', fill: true, pointRadius: 2, pointHoverRadius: 4, borderWidth: 2 }] },
    options: {
      responsive: r, maintainAspectRatio: aspect,
      scales: {
        x: { grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { precision: 0 } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `Count: ${ctx.parsed.y}` } },
        datalabels: {
          align: 'top', anchor: 'end', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 3,
          padding: { top: 2, bottom: 2, left: 4, right: 4 }, color: '#111827', font: { size: 10, weight: 600 },
          clamp: true, clip: true,
          formatter: (v, ctx) => {
            const arr = ctx.dataset.data || []; const i = ctx.dataIndex;
            if (!Number.isFinite(v)) return null;
            if (i === arr.length - 1) return v;
            const prev = i > 0 ? arr[i - 1] : null;
            const next = i < arr.length - 1 ? arr[i + 1] : null;
            if (prev == null || next == null) return null;
            const isPeak = v > prev && v > next;
            const isValley = v < prev && v < next;
            return (isPeak || isValley) ? v : null;
          }
        }
      },
      animation: { duration: 200 }
    }
  });
}

function ensureActualCumulativeChart() {
  if (chartsActualCum || !window.Chart) return;
  const el = document.getElementById('chart-actual-cum');
  if (!el) return;
  chartsActualCum = new Chart(el, {
    type: 'line',
    data: { labels: [], datasets: [{ label: 'Cumulative', data: [], tension: 0.25, borderColor: '#72bf44', backgroundColor: 'rgba(114,191,68,0.15)', fill: true, pointRadius: 2, pointHoverRadius: 4, borderWidth: 2 }] },
    options: {
      responsive: r, maintainAspectRatio: aspect,
      scales: {
        x: { grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.2)' }, ticks: { precision: 0 } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index', intersect: false, callbacks: { title: (items) => items?.[0]?.label ?? '', label: (ctx) => `Total: ${ctx.parsed.y}` } },
        datalabels: {
          align: 'top', anchor: 'end', backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 3,
          padding: { top: 2, bottom: 2, left: 4, right: 4 }, color: '#111827', font: { size: 10, weight: 600 },
          clamp: true, clip: true,
          formatter: (v, ctx) => {
            const arr = ctx.dataset.data || []; const i = ctx.dataIndex;
            if (!Number.isFinite(v)) return null;
            if (i === arr.length - 1) return v;
            const prev = i > 0 ? arr[i - 1] : null;
            const next = i < arr.length - 1 ? arr[i + 1] : null;
            if (prev == null || next == null) return null;
            const isPeak = v > prev && v > next;
            const isValley = v < prev && v < next;
            return (isPeak || isValley) ? v : null;
          }
        }
      },
      animation: { duration: 200 }
    }
  });
}

// Public API
export function updateTimeLineChart(filteredRows, agg) {
  ensureActualLineChart(); if (!chartsActual) return;
  const { labels, data } = buildTimeSeries(filteredRows, 'Actual (UTC +8)', agg);
  chartsActual.data.labels = labels;
  chartsActual.data.datasets[0].data = data;
  chartsActual.data.datasets[0].label = `Count (${agg[0].toUpperCase()}${agg.slice(1)})`;
  chartsActual.update();
  const sub = document.getElementById('chart-actual-range');
  if (sub) {
    if (labels.length) {
      const first = labels[0], last = labels[labels.length - 1];
      const total = data.reduce((a, b) => a + b, 0);
      sub.textContent = `${first} → ${last} • ${total} total`;
    } else sub.textContent = '';
  }
}

export function updateTimeCumulativeChart(filteredRows) {
  ensureActualCumulativeChart(); if (!chartsActualCum) return;
  const { labels, data } = buildDailySeries(filteredRows, 'Actual (UTC +8)');
  const cum = toCumulative(data);
  chartsActualCum.data.labels = labels;
  chartsActualCum.data.datasets[0].data = cum;
  chartsActualCum.update();
  const sub = document.getElementById('chart-actual-cum-range');
  if (sub) {
    if (labels.length) {
      const first = labels[0], last = labels[labels.length - 1];
      const total = cum[cum.length - 1] ?? 0;
      sub.textContent = `${first} - ${last} ${total} total`;
    } else sub.textContent = '';
  }
}

export function resizeTimeCharts() {
  if (chartsActual) chartsActual.resize();
  if (chartsActualCum) chartsActualCum.resize();
}
