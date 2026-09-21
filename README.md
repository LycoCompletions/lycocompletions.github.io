# Reporting Analytics Dashboard

A browser-based reporting dashboard for analysing systems, checklists, punch items, and contractor data from Excel workbooks.

The application runs entirely in the browser. Uploaded workbook data is parsed locally, retained in browser storage, and used to generate interactive charts, summary metrics, filters, progress tables, PDF reports, PNG images, and self-contained Interactive HTML reports.

## Features

- Upload and parse `.xlsx` and `.xls` workbooks in the browser
- Assign uploaded files as:
  - Systems
  - Checklists
  - Punch Items
  - Contractors
- Validate required columns before enabling reporting features
- Persist uploaded and parsed files in IndexedDB
- Persist the job name in localStorage
- Filter checklist, punch, system, and contractor data
- Dynamically join Contractor IDs and checklist RespIDs
- Automatically detect UTC offsets from exported date-column headers
- Display KPI cards, progress charts, cumulative charts, and systems progress
- Export the dashboard as:
  - PDF
  - PNG
  - Interactive HTML
- Generate a self-contained Interactive HTML report that:
  - embeds the parsed report data
  - works without the original Excel files
  - works without an internet connection
  - retains filters and aggregation controls
  - can be distributed as an email attachment

## Dashboard Content

The dashboard currently includes:

- Total Scope
- Complete This Week
- Outstanding
- Completion Percentage
- Total Completed
- Actual Count
- Actual Cumulative Total
- Checklist Status
- Completion by Discipline
- Completion by Contractor / RespID
- Completion by Phase
- Weekly Throughput
- Punch Items by Category
- Punch Items Cumulative
- Systems Progress table

The Actual and Punch cumulative charts support:

- Daily aggregation
- Weekly aggregation
- Monthly aggregation

Weekly reporting periods end on Saturday.

## Required Source Files

The application expects one validated file for each required type:

1. Systems
2. Checklists
3. Punch Items
4. Contractors

The available filters and report calculations are enabled after all required files have been assigned and validated.

## Checklist Date Columns

Checklist exports must include timezone-labelled Actual and Created columns.

Supported examples include:

```text
Actual (UTC +8)
Created (UTC +8)

Actual (UTC +9:30)
Created (UTC +9:30)

Actual (UTC +10)
Created (UTC +10)

Actual (UTC -3)
Created (UTC -3)
```

The application automatically:

1. Detects the UTC offset in the column header
2. Normalises the column name
3. Interprets the spreadsheet wall-clock value using the detected offset
4. Converts the value to an internal UTC timestamp
5. Calculates day, week, and month boundaries using the source offset

No timezone selector is required.

Both fields are required:

```text
Actual (UTC +/- offset)
Created (UTC +/- offset)
```

`Created` is required because Weekly Throughput uses the Created date to determine cumulative scope and newly created checklist items.

## Punch Date Columns

Punch exports support timezone-labelled date columns such as:

```text
Raised (UTC +8)
Cleared (UTC +8)
Verified (UTC +8)
Checked Out (UTC +8)
```

The same dynamic offset handling applies to other offsets, including fractional and negative offsets.

The following field is required:

```text
Verified (UTC +/- offset)
```

The Verified date is required for the Punch Items Cumulative chart.

Raised, Cleared, and Checked Out dates may remain optional unless future reporting logic requires them.

## File Validation

Workbook headers are normalised before validation.

The schema supports:

- exact required columns
- dynamic required-column patterns
- optional columns
- alternative column groups

When a required column is missing, the affected file is marked invalid and the interface displays missing-field pills.

Files restored from browser storage should be validated against the current schema before being used.

## Filters

The filter panel is generated from the currently loaded report data.

Available filters include relevant combinations of:

- Status
- RespID / Contractor
- Certificate ID
- Event Description
- Tag Number
- System
- Subsystem
- Discipline
- Area
- Punch Category
- Punch Discipline
- Punch action fields

Filters update the KPI cards, charts, and Systems Progress table.

The Reset action returns the report to the complete unfiltered dataset.

## Browser Persistence

The application uses browser storage for convenience:

- IndexedDB stores parsed workbook data
- localStorage stores the job name

Browser storage is scoped to the site origin. Data stored under a local Live Server address will not automatically appear under a GitHub Pages address or another domain.

Removing and re-uploading a file forces it to pass through the current parser and schema logic again. This is useful after parser or normalisation changes.

## Export Formats

### PDF

The dashboard is rendered with html2canvas and written to an A4 PDF with jsPDF.

PDF page breaks prefer the bottom edge of dashboard cards to reduce split cards and avoid blank trailing pages.

### PNG

The dashboard is rendered to a high-resolution PNG image.

### Interactive HTML

Interactive HTML is a self-contained, offline report.

The exported file includes:

- dashboard markup
- embedded report data
- generated Tailwind CSS
- Chart.js
- chartjs-plugin-datalabels
- the bundled reporting runtime

The exported report does not require:

- the original Excel files
- Live Server
- GitHub Pages
- internet access
- IndexedDB
- the upload interface

The standalone report keeps:

- filters
- filter reset and apply actions
- KPI calculations
- charts
- Daily, Weekly, and Monthly aggregation controls
- Systems Progress

The standalone report removes:

- file uploader
- Items in Queue
- file-type assignment controls
- Export button
- export-format selector

The job name is embedded and displayed as read-only.

## Offline HTML Build Process

The normal application uses `esbuild-wasm` in the browser to bundle the module-based application into one non-module runtime.

The exporter then embeds:

1. The cloned dashboard markup
2. Parsed and encoded report data
3. Active Tailwind-generated CSS
4. Local Chart.js source
5. Local chartjs-plugin-datalabels source
6. The bundled application runtime

Spreadsheet `Date` values are encoded by component and revived when the report opens. This preserves source wall-clock values so the dynamic UTC-offset logic continues to work in the exported report.

## Data Handling

Workbook data is processed in the browser.

The application does not require a server-side database or upload API for its core reporting workflow.

Interactive HTML reports contain the parsed report data inside the exported file. Treat each exported report as a data-bearing document and distribute it only to intended recipients.

## Third-Party Software

This project uses third-party open-source software, including:

- Chart.js
- chartjs-plugin-datalabels
- esbuild-wasm
- SheetJS Community Edition
- html2canvas
- jsPDF
- Tailwind CSS
- Heroicons

See:

```text
THIRD_PARTY_NOTICES.md
```

Complete licence texts should be retained in the relevant `dist/vendor` directories.

The Interactive HTML report directly embeds:

- Chart.js
- chartjs-plugin-datalabels
- generated Tailwind CSS
- Heroicons SVG markup

Applicable notices should therefore be retained in distributed report files as well as in the main repository.

## Browser Compatibility

Use a current version of a modern browser, such as:

- Microsoft Edge
- Google Chrome
- Mozilla Firefox
- Safari

For large datasets, a desktop browser with sufficient memory is recommended.
