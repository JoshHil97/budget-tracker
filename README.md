# Budget & Savings Goals

Version 1.0.0, released 21 July 2026.

A local-first personal budgeting app for planning monthly income, tracking spending, reviewing progress and protecting separate private budget rooms for Bayo and Adedola. The app is a static site with no backend and stores data in the browser.

## Overview

Budget & Savings Goals is designed for everyday personal finance tracking in GBP. It separates planning from tracking, keeps monthly records, supports recurring items and gives clear summaries for safe-to-spend decisions.

## Features

- Dashboard summary cards for monthly income, planned commitments, actual spending and safe to spend.
- Planning tools for income, budget categories, savings allocation and sinking funds.
- Tracking tools for spending logs, actual spending and monthly summaries.
- Progress tools for savings goals, debt payoff and monthly history.
- Monthly insights and analytics using native HTML/CSS charts.
- Multiple private local profiles with passcodes.
- Active month navigation, monthly rollover and recurring items.
- JSON backup and restore with recovery points.
- CSV import and export for spreadsheet reporting.
- Friendly validation, delete confirmations and toast notifications.

## Screenshots

Screenshots are not committed to the repository. The app can be reviewed locally by running the static server below and opening it in a browser.

## Technology Stack

- HTML
- CSS
- Vanilla JavaScript
- Browser `localStorage`
- No build step
- No external runtime dependencies

## Architecture Overview

The application is intentionally simple:

- `index.html` defines the static document, sections, modals and release footer.
- `styles.css` contains the responsive design system, layout, cards, tables, charts, buttons and modal styling.
- `app.js` contains state management, calculations, rendering, validation, backup/restore and CSV handling.

All financial calculations are client-side. There is no server API and no data leaves the browser unless the user exports a file.

## Local Storage Model

Data is stored under:

```text
budget-savings-app.profiles.v2
```

Each profile contains:

- `passHash`
- `state`
- `months`
- `activeMonth`
- `history`
- `recurringItems`
- `dataVersion`
- optional backup metadata such as `lastBackupAt`

Recovery points are stored separately under:

```text
budget-savings-app.recovery.latest
```

## Backup Format

JSON backups use:

- `format`: `budget-tracker-backup`
- `formatVersion`: `1`
- `appVersion`: current app version
- `exportedAt`: ISO timestamp
- `scope`: current profile or all profiles
- `metadata`: active profile, active month and data version
- `profiles`: full profile records

JSON backups are full-fidelity and are the preferred way to preserve or restore app data.

Important: backup files contain sensitive financial data and are not encrypted by the app.

## CSV Support

CSV export supports:

- Transactions
- Monthly summary
- Budget versus actual
- Recurring items
- Savings goals
- Sinking funds
- Debts

CSV import supports:

- Transactions
- Expense budgets
- Recurring items

CSV exports include spreadsheet injection protection for values beginning with formula-like characters. CSV import previews rows before applying changes and creates a recovery point first.

## Accessibility

The app uses semantic sections, labelled inputs, keyboard-friendly controls, native progress elements, ARIA status regions, tabbed analytics semantics and accessible modal dialogs. Destructive actions use confirmation dialogs and focus is restored when modals close.

## How To Run Locally

Open `index.html` directly, or serve the folder:

```bash
python3 -m http.server 8080
```

Then visit:

```text
http://localhost:8080
```

## Deployment

The app can be deployed as a static site on services such as Vercel, Netlify or GitHub Pages. No environment variables or build command are required.

## Version History

- `1.0.0` - Production readiness release with dashboard polish, profile privacy, monthly records, recurring items, analytics, backup/restore, CSV portability, recovery points, accessibility improvements and documentation.

## Release Notes

Version 1.0.0 prepares the app for portfolio-ready use. It focuses on reliability, privacy, data portability, responsive layout, accessibility and documentation rather than adding new budgeting workflows.

## Future Roadmap

- Optional encrypted backups.
- Optional cloud sync.
- Automated unit tests for financial calculations.
- More guided onboarding for first-time users.
- Printable monthly reports.

## Known Limitations

- Data is local to the current browser and device unless exported.
- Passcodes protect casual access in the browser but are not a substitute for device-level security.
- JSON backups are not encrypted.
- CSV import supports selected record types only.
- Cross-browser testing should still be repeated before relying on a specific production host.
