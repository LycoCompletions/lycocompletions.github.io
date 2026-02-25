
# Completions Dashboard

A lightweight, client‑side web app for turning two Excel exports into an interactive dashboard with filters, charts, and a systems completion matrix—no backend required. Drop your files, explore, then export the dashboard to PNG for reporting.

---

## ✨ Features

- **Zero‑install, client‑side** — works as a static site. No data leaves the browser.
- **Excel ingestion** — parse two spreadsheets with SheetJS/XLSX via the browser:
  - **Data file (primary)** with required columns (see below).
  - **Systems file** providing *System → Description* mapping.
- **Automatic schema detection & validation** — friendly errors for missing columns.
- **Smart merge** — enriches the primary data with **System Description** from the systems list.
- **Instant filters** — dynamic facets for Status, RespID, Cert Disc, etc.
- **Charts** — Status doughnut, stacked Discipline/RespID bars, daily/weekly/monthly/yearly time series, plus cumulative.
- **Systems Matrix** — per‑system counts across EventDescription stages, actual count, total sheets, and **% Complete**.
- **Responsive UI** — filters panel toggles; dashboard works on desktop and large tablets.
- **Export to PNG** — one‑click, consistent capture of the entire dashboard section.

---

## 🧱 Tech Stack

- **Vanilla JS (ES modules)**, **Tailwind CSS** for layout/utility classes
- **SheetJS (XLSX)** for Excel parsing (browser build)
- **Chart.js** + **chartjs‑plugin‑datalabels** for charts
- **html2canvas** for PNG export (client‑side DOM → canvas)

> All logic runs in the browser—no server, database, or bundler required.

---

## 📁 Project Structure

```
.
├─ index.html
├─ main.js                       # App orchestrator (views, events, success/reset flows)
├─ /js
│  ├─ utils.js                   # Helpers: show/hide, bytes formatting, escapeHtml, etc.
│  ├─ date.js                    # Date normalisation & bucketing (daily/weekly/monthly/yearly)
│  ├─ parse.js                   # Excel parsing, header mapping, validation, enrichment (merge)
│  ├─ filters.js                 # Filters UI + state (createFilters)
│  ├─ /charts
│  │  ├─ categorical.js          # Status doughnut, Disc/Resp stacked bars
│  │  └─ time.js                 # Actual line & cumulative charts
│  ├─ /systems
│  │  └─ matrix.js               # Systems completion matrix
│  ├─ dashboard.js               # View/agg toggles, orchestrates chart/matrix updates
│  └─ files.js                   # Dropzone & file chips (render/remove)
└─ /assets (optional)
```

---

## 🧪 Required Columns

### Primary **Data file** (must include)
| Column                 |
|------------------------|
| Status                 |
| RespID                 |
| CertID                 |
| EventDescription       |
| TagNo                  |
| System                 |
| SubSystem              |
| Cert Disc              |
| Area                   |
| Actual (UTC +8)        |

> **Note:** `Actual (UTC +8)` is parsed as a date (Y‑M‑D). Empty cells are treated as “no actual” and used to split “Actual / No Actual” stacks and cumulative logic.

### **Systems file** (must include)
| Column                      |
|----------------------------|
| System                     |
| Description **or** System Description |

> The app builds a **System → Description** index and enriches the primary rows with a **System Description** column.

---

## 🧭 How to Use

1. **Add files**  
   - Click the dropzone (or drag & drop) and select up to **2** Excel files: your **Data** file and your **Systems** file (order doesn’t matter).
   - The app will detect roles, validate required columns, and show friendly errors if something’s missing.

2. **Review & Explore**  
   - Preview table shows merged rows (primary + *System Description*).
   - Click **Dashboard** to view charts and the Systems Matrix.

3. **Filter**  
   - Click **Filters**.  
   - Check any values (multi‑select). Counts, charts, and the matrix update instantly.

4. **Change time grain**  
   - Use **Daily / Weekly / Monthly / Yearly** to change the line chart aggregation.

5. **Export**  
   - Click **Export PNG** to capture the **dashboard** section into a PNG.

6. **Remove / Replace files**  
   - Use the chip’s trash icon to remove a file; the app resets when either file is missing.

---

## 🧩 Module Behavior Highlights

- **parse.js**  
  - Normalises headers, validates required fields, infers roles (primary vs systems), and merges on **System** with **System Description** enrichment.  
  - Gracefully reports missing columns.

- **filters.js**  
  - Builds facets from `FIELDS`, renders the panel, tracks active selections, and emits **onFiltered** → `main.js` → updates table & dashboard.  
  - **Automatically enables** the Filters toggle when `updateData(allRows)` is called, and disables on reset.

- **charts/**  
  - **categorical.js** renders the Status doughnut and stacked bars (Disc/Resp).  
  - **time.js** renders Actual line with grain selection and the cumulative (daily) series.  
  - Uses chartjs‑plugin‑datalabels for in‑chart labels on larger segments/bars.

- **systems/matrix.js**  
  - Calculates per‑system counts across **EventDescription** stages, Actual Count, Total Sheets (best‑effort inference), and **% Complete**.

- **dashboard.js**  
  - Ties it together: view toggles (Preview/Dashboard), grain toggles, resizing charts on layout changes, and batched updates.

- **files.js**  
  - Dropzone & file chips: shows selected files, size, and role; emits `onFiles`/`onRemove` callbacks.

---

## 📤 PNG Export Notes

The export runs entirely in the browser with **html2canvas**:

- We capture the `#view-dashboard` section.
- During capture, we apply **export‑only** tweaks in the **cloned DOM** (via `onclone`) to keep visuals consistent:
  - Transparent charts (or canvas→image fallbacks) so white rectangles don’t appear inside cards.
  - Remove `box-shadow` (html2canvas doesn’t paint shadows), clip wrappers, and normalise table vertical alignment.
  - Keep global layout untouched (all changes are clone‑only).

If your environment uses remote images, ensure they are **CORS‑enabled** so html2canvas can read them for PNG capture.

---

## 🔐 Privacy

All parsing, filtering, and exporting runs in the browser. The app does **not** upload your data anywhere.

---

## ⚠️ Known Limitations

- **html2canvas** doesn’t render CSS `box-shadow` and some advanced effects exactly as the browser paints them. The export mode removes shadows to avoid artifacts and keeps the charts clean.
- Charts are exported as **raster** (canvas), which is expected for PNG outputs.
- Very large spreadsheets can impact performance; filtering is still snappy, but initial parse & merge depends on spreadsheet size and the device.

---

## 🛠️ Troubleshooting

- **“Both files are required” error**  
  Make sure you’ve provided **one** Data file (with required columns) and **one** Systems file (with `System` + `Description` or `System Description`).

- **Filters/Export button disabled**  
  The buttons enable when `filtersController.updateData(allRows)` runs after a successful merge. Check that `allRows.length > 0` and you’re not immediately hitting a reset path.

- **PNG shows unexpected white rectangles inside cards**  
  This is usually canvas backgrounds; the export mode forces chart canvases transparent (or replaces them with images). If you still see artifacts, try reloading and exporting again after animations finish (we already wait ~300ms).

- **CORS / images not captured**  
  For any remote images, ensure `Access-Control-Allow-Origin` includes your origin (or `*`) so html2canvas can read pixels.
---
