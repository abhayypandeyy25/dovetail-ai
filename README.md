# Dovetail AI — interactive prototype

Working implementation of the Claude Design project (`Dovetail AI.dc.html`).

## Run

```bash
cd app
python3 -m http.server 8471
# open http://localhost:8471
```

Any static file server works (`npx serve`, `caddy file-server`, …). A server is
required because `index.html` loads `data.js` as an ES module — opening the file
directly via `file://` will not work.

## Files

| File | Role |
|---|---|
| `index.html` | Full app: template (all 12 screens) + `DCLogic` component class |
| `data.js` | Deterministic demo data — 3 entities, 3 periods, generated ledger, AP queue, controls, agents |
| `support.js` | dc-runtime: parses the `<x-dc>` template and renders it with React 18 |
| `vendor/` | React + ReactDOM 18.3.1 UMD builds (vendored — app runs fully offline) |

## What's inside

12 screens: Home (6 personas), Transactions/GL, Trial Balance, Financial
Statements (P&L / BS / Cash Flow), Bills (AP), Invoices (AR), Banking &
Reconciliation, Reports & Excel (XLGL grid, change analysis, report builder,
budget, board pack), Controls & Audit, Agents, Entities & Consolidation,
Agent Persona settings. Plus the Ask Dovetail panel, drill-down overlay with
four books per transaction, and immutable-audit-trail simulation.

Google Fonts (Inter, Fraunces) load from the network; everything else is local.
