---
name: dashboard-design
description: "Use this skill to design professional Excel dashboards — KPI definition, visual hierarchy, chart-type selection, filters, data sources, indicators, analyses, drill-down details, and dynamic updates. Trigger on: 'dashboard', 'design de dashboard', 'KPI dashboard', 'executive dashboard', 'painel de indicadores', 'visualização de dados', 'chart selection', 'hierarquia visual', 'build a dashboard from my data', 'criar painel'. Output is a designed dashboard spec/build (single .xlsx) where every KPI is formula-driven and every chart is justified by the data pattern. Scene-layer on officecli-xlsx / officecli-data-dashboard: inherits every xlsx hard rule and the dashboard composition pattern. DO NOT invoke for: raw CSV import (use officecli-xlsx), financial models (use financial-modeling), or data cleaning (use data-analysis)."
---

> **⚠️ Platform note — read before running any command.** The shell snippets in this skill are written for **macOS / Linux** (bash/zsh). Always check which OS you are on first. On **Windows** do **not** run them verbatim — the underlying tool/CLI commands are usually cross-platform, but the surrounding shell syntax is not. Translate it to PowerShell before running:
>
> | bash (macOS / Linux)              | PowerShell (Windows)                                                                |
> | --------------------------------- | ----------------------------------------------------------------------------------- |
> | `a && b`                          | run as two steps, or `a; if ($?) { b }`                                             |
> | `cat <<'EOF' \| tool …` (heredoc) | write the text to a temp file, then pipe/pass that file to the tool                 |
> | `VAR=$(cmd)` … `$VAR`             | `$VAR = cmd` … `$VAR`                                                               |
> | `cmd > /dev/null`                 | `cmd > $null`                                                                       |
> | `… \| grep PAT`                   | `… \| Select-String PAT`                                                            |
> | `… \| jq …`                       | `… \| ConvertFrom-Json`, then read the fields                                       |
> | `python3 x.py`                    | `python x.py` (or `py x.py`)                                                        |
> | `~/dir`, `/tmp`                   | `$env:USERPROFILE\dir`, `$env:TEMP`                                                 |
> | `cp` / `mkdir -p` / `rm -rf`      | `Copy-Item` / `New-Item -ItemType Directory -Force` / `Remove-Item -Recurse -Force` |
>
> If a command has no obvious Windows equivalent, prefer the built-in file/HTTP tools over raw shell.

# Dashboard Design (scene-layer on officecli-data-dashboard)

A dashboard is a **decision surface**, not "a spreadsheet with charts". This skill covers the _design discipline_ on top of the composition mechanics taught in `officecli-data-dashboard` (which itself layers on `officecli-xlsx`). The mechanics — KPI cards, charts, sparklines, CF, activeTab, fullCalcOnLoad, print-ready delivery — are inherited, not re-taught here. This skill adds what a **well-designed** dashboard requires: a design brief, KPI selection rules, visual hierarchy, chart justification, filter architecture, and dynamic-update discipline.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**When a prop name, enum value, or alias is uncertain, consult help before guessing.**

```bash
officecli help xlsx                          # element list
officecli help xlsx chart                    # chart schema + chart types
officecli help xlsx sparkline                # sparklines
officecli help xlsx conditionalformatting    # CF rule types
officecli help xlsx validation               # dropdown/data validation
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

This skill **inherits every xlsx hard rule** from `officecli-xlsx` AND the full composition pattern from `officecli-data-dashboard` (Dashboard-first, formula-driven KPIs, cell-range chart sources, visible-cells-only for chart feeds, data-size-aware complexity, Gates 1–8, Known Issues D-1..D-17). Read both first. Do not re-teach them here.

**General rules that apply to every dashboard** (verbatim, non-negotiable):

- **Não inventar dados.** Every KPI and chart traces to real source data. No fabricated "example" numbers in a deliverable.
- **Não inventar regras de negócio.** KPI definitions come from the user or a stated, documented convention — never an invented business rule.
- **Não hardcodar valores calculados.** All KPIs are formulas (inherited rule).
- **Não afirmar que algo foi validado sem realmente validar.** Gates run = gates reported. VERIFIED vs NOT VERIFIED is explicit.
- **Separar dados de entrada, cálculos e apresentação.** Data / Summary upstream; Dashboard presentation-only downstream.
- **Trabalhar de forma configurável.** Filters and dropdowns are the configuration surface — build for the reader who changes a period and sees the whole board update.

## Core Principles

1. **Design brief comes first.** Before any cell or chart, write (in the workbook, on a `Brief`/`Design` sheet or an adjacent note) — and confirm with the user when ambiguous:
   - Who reads this dashboard, and what decision does it inform? (executive, ops, financial controller, site manager…)
   - What is the ONE question the top of the dashboard must answer?
   - Data horizon (daily/weekly/monthly) and update cadence.
   - Primary vs secondary audience (drives detail and density).
   - A dashboard without a stated purpose is scope creep; build the KPI set from the purpose, not from "what charts could we make".

2. **KPI selection rule: 3–6 KPIs at the top, each answering a question.** More than 6 reads as noise; fewer than 3 reads as under-built (for small datasets, fewer is fine — scale by data, not by habit). Each KPI must have: label, definition, formula, source range, and a stated question it answers. If a KPI has no question, it does not belong at the top.

3. **Visual hierarchy: value → context → action.** Top row = headline values (big, bold, colored by direction). Second band = context (trends, composition, comparisons). Lower band = detail/drill-down (tables, sparklines, breakdowns). The eye must land on the decision value first — never make the reader hunt for the number that answers the brief's ONE question.

4. **Chart justification.** Every chart must be the _right_ chart for its data pattern (see Chart selection below). A chart chosen "because it looks nice" is a defect. When in doubt, line for time, column for category comparison, stacked column for composition-over-time, doughnut for part-of-whole, scatter for correlation, bar for ranking (many categories).

5. **Filter architecture: filters that actually filter.** Slicers/dropdowns drive formulas (`SUMIFS` with criteria cells) or hidden filter rows — never fake filters over hardcoded selections. A dropdown that does not change downstream values is decoration. Filters belong above or beside the KPI band so the reader adjusts context before reading values.

6. **Dynamic updates are the default, not the feature.** New month's data lands in the Data sheet → KPIs, charts, CF, sparklines recompute on open (inherited fullCalcOnLoad + cache-refresh discipline). If a chart series must be extended manually, that is a defect to document — and fix if the data shape allows.

## Design Workflow

### Phase 1 — Brief & data inventory

1. Read the source data (sheet map, dimensions, granularity, date range, columns).
2. Draft the design brief: audience, ONE question, horizon, cadence, scope.
3. List candidate KPIs with their question/formula/source. Trim to 3–6.
4. Confirm with the user anything that changes meaning: KPI definitions, period conventions, targets/benchmarks. **Never invent targets** — a target you invent is a fabricated rule. If no target exists, show the value without a target color, or mark "no target defined" and leave the benchmark cell PENDING.

### Phase 2 — Information architecture (sheet plan)

Standard shape (adjust to ask):

```
Data (raw, immutable)        ← input, imported once, never edited in place
Summary (aggregations)       ← SUMIFS/AVERAGEIFS rollups; the ONLY source for charts → see data-dashboard D-8 (visible cells)
Dashboard                    ← activeTab; KPI band + charts + sparklines + detail zone; pure presentation
Config / Filters             ← periods, dropdown options, thresholds (if not on Dashboard)
Brief (optional)             ← purpose, KPI dictionary, assumptions, PENDING items
```

Rules: charts read from Summary/visible cells ONLY; Dashboard reads from Summary via formulas — direct Data references are allowed for leaf values but cross the layering rule for anything aggregated (rollup first, then present).

### Phase 3 — KPI band

For each KPI: label cell (small, gray, bold) + value cell (large, bold, coloured by direction where semantic colors apply — good/bad/neutral palette from data-dashboard). Add one-line definition in a comment/notes column (`officecli add --type comment`). Column width sized to the widest expected cachedValue (see data-dashboard Requirements — ### ships otherwise).

KPI formula pattern (period-aware):

```bash
# Period-over-period KPI (current vs previous period, from Summary cells):
officecli set "$FILE" /Dashboard/B2 --prop 'formula==IFERROR((Summary!B10-Summary!C10)/Summary!C10, 0)' --prop numFmt='+0.0%;-0.0%;0.0%' --prop font.size=24 --prop bold=true
```

Guard every division (IFERROR / IF(den=0,…)). Colour: positive green, negative red, neutral gray — only when the _direction_ is semantically meaningful (e.g. costs: up = bad; utilization: up = good; verify per KPI, never a single global convention).

### Phase 4 — Charts

Apply the justification table (below). One chart, one pattern. Multiple series only when they share one message (e.g., plan vs actual). Add title + named series + trendline where direction matters (inherited rule). Build Order: charts AFTER Summary exists (chart data feeds = cell ranges).

```bash
officecli add "$FILE" /Dashboard --type chart \
  --prop chartType=column \
  --prop title="Executed vs Planned (h)" \
  --prop series1.name="Planned" --prop series1.values='Summary!C5:C16' \
  --prop series2.name="Executed" --prop series2.values='Summary!D5:D16' \
  --prop series1.categories='Summary!B5:B16' \
  --prop preset=dashboard --prop x=0 --prop y=8 --prop width=12 --prop height=14
```

### Phase 5 — Filters / interactivity

Build filter cells as **named criteria cells** (e.g. `FilterPeriod` on Config) and drive aggregations:

```bash
officecli add "$FILE" /Config --type validation --prop sqref=B1 --prop type=list --prop formula1='Jan,Fev,Mar,Abr,Mai,Jun,Jul,Ago,Set,Out,Nov,Dez'
officecli set "$FILE" /Summary/B5 --prop 'formula==SUMIFS(Data!$D$2:$D$500,Data!$C$2:$C$500,Config!$B$1)'
```

- The dropdown value changes Summary → Dashboard recomputes. Verify the chain: change the dropdown, re-read the KPI cachedValue, confirm it moved.
- Misspellings/empty criteria produce 0 or blanks — surface "No data for selection" instead of a silent 0 when feasible.

### Phase 6 — Detail / drill-down zone

Lower band: a compact detail table (last N periods) + sparkline per key KPI. Only if the brief asks for drill-down — a detail zone nobody asked for is clutter: scale to the brief, not to the space.

### Phase 7 — Dynamic update protocol (delivery)

- Data sheet is the only sheet a future operator touches.
- All downstream formulas resolve from Data/Config — no manual chart edits, no manual KPI edits.
- Set `calc.fullCalcOnLoad=true` (high-level set, NEVER raw — inherited).
- `activeTab` set LAST (after all sheets/charts exist — inherited D-6).
- Print-ready artifacts only when asked ("print" / "board pack" / "one-pager") — see data-dashboard §Print-ready delivery.

## Chart selection (justification table)

| Data pattern                                  | Chart                                         | Why / notes                                            |
| --------------------------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| Single series over time                       | `line`                                        | Chronology must read left-to-right; trendline optional |
| Multiple components over time, sum meaningful | `columnStacked`                               | Read total + parts                                     |
| Category comparison (≤8 cats)                 | `column`                                      | Not `bar` — bar breaks time/order reading              |
| Category ranking (many cats)                  | `bar` fits grid, else column with sorted data | Ranking reads naturally                                |
| Part-of-whole                                 | `doughnut`                                    | `pie` has blank-render regression (inherited D-9)      |
| Plan vs actual                                | `combo` (bars + line)                         | `combosplit=1`; set at add time (D-1)                  |
| Correlation                                   | `scatter`                                     | x via `categories` (D-3)                               |
| Distribution                                  | `column` histogram (bucketed data)            | Bucket via formula helper column                       |

Rule: if two chart types are equally defensible, pick the one the audience reads faster; document the choice in the Brief sheet.

## Visual hierarchy (layout patterns)

Inherit the 3 patterns from data-dashboard (executive summary / ops console / scorecard) and apply the hierarchy rule: headline band rows 1–4, context band rows 6–18, detail below. KPI cards share one light-fill "card" row (e.g. `F0F4FF`), consistent semantic colors, one preset across ALL charts on the sheet (inherited rule — mixed presets read as accidental).

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Inherit every gate from `officecli-data-dashboard` (KPI formula coverage, chart count/series names, CF, activeTab+fullCalcOnLoad, placeholder sweep, visual floor, cached-value sanity). Run them all. Then run the design gates:

**Gate D1 — Purpose stated.** The Brief sheet names the audience, the ONE question, and the horizon. Missing = reject: a dashboard without a stated purpose cannot be judged useful.

**Gate D2 — KPI discipline.** 3–6 headline KPIs; each has a formula, a definition (comment/label), and a listed question. Extra "decoration" KPIs beyond the band → reject or demote to detail zone.

**Gate D3 — Chart justification.** Every chart's pattern ⟶ chart type pairing is defensible per the table; charts with titles like "Series1" fail (inherited Gate 3). Spot-justify each chart in the QA notes.

**Gate D4 — Filter actually filters.** Change a dropdown criterion (set cell → read KPI cachedValue) and confirm downstream values move. A filter that does not change anything = reject.

**Gate D5 — Dynamic-update proof.** Simulate a new data point (set a Data cell → re-read a KPI + chart source cell) and confirm formulas recompute (or fullCalcOnLoad present + cache-refresh pass run). No manual-edit path documented = reject.

**Gate D6 — Semantic color correctness.** Verify direction-to-color mapping per KPI (costs vs utilization have opposite conventions). Mixed/nonsense semantics = reject.

**Gate D7 — Visual floor (inherited, mandatory).** HTML preview: no `###`, no clipped titles, no placeholder tokens, Dashboard opens first. Never skipped.

If anything fails, fix at source and re-run the full cycle.

## Honest limits

- Viewer-specific rendering artifacts (pie collapse, color drift, checkbox double-box) are viewer bugs, not design defects — spot-check in the user's target viewer (Office / WPS / Numbers).
- A table-heavy dashboard (many raw numbers) is often a sign the brief is a report, not a dashboard — say so and realign scope instead of over-charting.
- No target = no target color: do not invent benchmarks. Mark PENDING when the user's target is missing.

## Reference

- Mechanics: see `officecli-data-dashboard` (composition, charts, CF, sparklines, print, Gates 1–8, Known Issues).
- Base rules: see `officecli-xlsx` (engine, shell, validate, visual floor).
- Related skills: `data-analysis` (upstream cleaning/aggregation), `financial-modeling` (financial boards), `delivery-gate` (CREATED/MODIFIED/VERIFIED/NOT VERIFIED/PENDING/ISSUES).
