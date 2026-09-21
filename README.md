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
    
- Validate required columns against each aforementioned filetype before enabling reporting features
- Persisting uploaded and parsed files in IndexedDB
- Data filtering
- Display KPI cards, progress charts, cumulative charts, and systems progress
  
- Export the dashboard as:
  - PDF
  - PNG
  - Interactive HTML
    
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
The application automatically:

1. Detects the UTC offset in the column header
2. Normalises the column name
3. Interprets the spreadsheet wall-clock value using the detected offset
4. Converts the value to an internal UTC timestamp
5. Calculates day, week, and month boundaries using the source offset

## File Validation

Workbook headers are normalised before validation.

The schema supports:

- Exact required columns
- Dynamic required-column patterns
- Optional columns
- Alternative column groups

When a required column is missing, the affected file is marked invalid and the interface displays missing-field pills.
Files restored from browser storage are validated against the current schema before being used.

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

The application uses browser storage for convenience; no data leaves the browser:

- IndexedDB stores parsed workbook data
- localStorage stores the job name

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

- The original Excel files
- Live Server
- Internet access
- IndexedDB

The standalone report keeps:

- Filters
- Filter reset and apply actions
- KPI calculations
- Charts
- Daily, Weekly, and Monthly aggregation controls
- Systems Progress

The standalone report removes:

- File uploader
- Items in Queue
- File-type assignment controls
- Export Format Controls / Button

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

## Third-Party Software

This project uses third-party open-source software, including:

- Chart.js
- Chartjs-plugin-datalabels
- Esbuild-wasm
- SheetJS Community Edition
- html2canvas
- jsPDF
- Tailwind CSS
- Heroicons

See:

```text
THIRD_PARTY_NOTICES.md
```

## Browser Compatibility

Use a current version of a modern browser, such as:

- Microsoft Edge
- Google Chrome
- Mozilla Firefox
- Safari

For large datasets, a desktop browser with sufficient memory is recommended.
