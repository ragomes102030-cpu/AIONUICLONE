---
name: data-analysis
description: "Use this skill to analyze and prepare tabular data in Excel — type checking, required fields, duplicates, missing values, outliers, aggregations, KPIs, trends, variations — with full traceability between source and result. Trigger on: 'analyze', 'analisar', 'data analysis', 'preparar dados', 'limpeza de dados', 'data cleaning', 'duplicados', 'valores ausentes', 'outliers', 'KPIs', 'tendência', 'variação', 'rastreabilidade', 'turn CSV into analyzed data', 'quero entender esses dados'. Output is a cleaned, analyzed workbook with an evidence-backed methodology, never silent transformations. Scene-layer on officecli-xlsx: inherits every xlsx hard rule. DO NOT invoke for: auditing an existing workbook (use spreadsheet-audit), building a dashboard (use dashboard-design), or pure CSV-to-sheet import (use officecli-xlsx)."
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

# Data Analysis (scene-layer on officecli-xlsx)

Data analysis is not "import and format". It is a **documented transformation chain**: source → quality pass → clean dataset → computed metrics, where every step is traceable and every claim about the data has evidence. The deliverable is a workbook that a reader can follow end-to-end: where the data came from, what was changed, why, and what the numbers mean.

Everything about the xlsx engine — cells, formulas, query, batch JSON, validate — comes from `officecli-xlsx` and is not re-taught here.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**When a prop name, enum value, or alias is uncertain, consult help before guessing.**

```bash
officecli help xlsx                          # element list
officecli help xlsx cell                     # cell props + query selectors
officecli help xlsx import                   # CSV/TSV import flags
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

This skill **inherits every xlsx hard rule** from `officecli-xlsx` — shell quoting, zero formula errors, batch JSON shape (`{"command":"set"|"add","path":...,"props":{...}}` — key is `command`, NOT `action`), `validate` discipline, `view` visual floor. Read officecli-xlsx first; honour those rules, do not re-teach them here.

**General rules that apply to every analysis** (verbatim, non-negotiable):

- **Não inventar dados.** Never fill a missing value with a number you made up. Missing values are either left as a documented gap, or filled with an explicitly disclosed method (e.g., "filled with 0", "filled with column mean, N=12") — never silently.
- **Não inventar regras de negócio.** KPI definitions come from the user or from stated, reproducible conventions. If you define a KPI (e.g. "churn = X/Y"), write the definition in the workbook next to the KPI. Never use an unstated business rule as a filter.
- **Não afirmar que algo foi validado sem realmente validar.** Every claim — "no duplicates", "no outliers", "column is numeric" — must come from a real query you ran. Split VERIFIED from NOT VERIFIED.
- **Priorizar rastreabilidade.** Every output cell traces to a source (sheet/column/row or an upstream formula). Every transformation is documented.
- **Separar dados de entrada, cálculos e apresentação.** Input data, computed metrics, and presentation live on separate sheets (or clearly separated zones) — never mixed.
- **Trabalhar de forma configurável.** Thresholds (outlier cutoff, duplicate key columns) are parameters stated in a config/assumptions sheet — not numbers buried in formulas.

## Core Principles

1. **Data is immutable input.** The source data sheet is never edited in place. Cleaned data lives on a new sheet ("Clean" / "Tratado"); the original stays byte-identical. If the source must be touched, do it on a copy and say so.
2. **Methodology is part of the deliverable.** A "Clean" sheet without a "Methodology" / "Log" sheet is unfinished work. The log records: every transformation, the rule used, the count affected, and the date.
3. **Verify with queries, not eyeballs.** Duplicates, missing counts, type checks, outlier counts — each is a query result recorded in the report/log.
4. **Analysis answers questions.** Before computing KPIs, state (in the workbook) the questions the analysis answers. A KPI with no question attached is decoration.
5. **Traceable to the cell.** For each KPI/metric cell, a comment or adjacent label states: definition + source (sheet!range or upstream formula). Bonus: point any chart at cells that carry that trace.

## Analysis Workflow

Run the phases in order.

### Phase 1 — Intake & objectives

Get from the user (or the leader agent):

- The source file(s) / sheets.
- The questions to answer (what decisions does this analysis inform?).
- Any business definitions (what counts as "active", "duplicate", "outlier").
- Output expectations (separate workbook? new sheets? a dashboard downstream?).

If answers are missing: proceed with explicitly stated defaults in the Methodology sheet, and flag each assumption as PENDING-CONFIRM. Never invent definitions silently.

### Phase 2 — Inventory & type check

```bash
FILE=data.xlsx          # or open the existing workbook
officecli open "$FILE"
officecli query "$FILE" sheet --json            # confirm sheet layout
officecli query "$FILE" table --json            # tables / named ranges
# Read the header row and first rows to map columns:
officecli get "$FILE" '/Sheet1/A1:J6' --json    # sample window
```

Record a **column map**: per column — name, apparent type (number / text / date / bool / mixed), sample values, and any type inconsistencies (e.g. a numeric column with 3 text cells). This map lives in the report and drives everything downstream.

### Phase 3 — Quality pass (persisted as query results + a Clean sheet)

Run each check with a real query; record counts in the log.

**3a. Required fields.** Identify which columns are required (business decision — from the user or stated default). Count rows where they are empty:

```bash
# Empty cells in a column range (adjust per layout):
officecli query "$FILE" 'cell:isblank()' --json | jq '[.data.results[] | select(.path | test("/Sheet1/D"))] | length'
```

**3b. Duplicates.** Duplicate key = the columns that define "the same record" (stated in config). Detect by row-key comparison. With a formula-based probe:

```bash
# Add a helper column counting occurrences of the composite key (adjust range):
officecli set "$FILE" '/Sheet1/K2' --prop 'formula==COUNTIFS($A$2:$A$1000,$A2,$B$2:$B$1000,$B2)'
# Duplicate count = records with K>1:
officecli query "$FILE" 'cell[formula~=COUNTIFS]' --json | jq '[.data.results[] | select(.format.cachedValue > 1)] | length'
```

Remove duplicates only into the **Clean** sheet (never in place), and log: key definition, count found, count removed, policy (keep-first / keep-last / keep-max — stated, not invented).

**3c. Missing values.** For each column, count blanks, then decide per column: leave-as-gap, fill with a disclosed constant (0, "N/A"), or fill with a disclosed statistic (mean/median, N stated). Record the decision + count in the log. Any fill rule is a config parameter, never a buried constant.

**3d. Outliers.** Define the outlier rule in config — e.g. `outside mean ± 3σ`, or `outside Q1−1.5·IQR .. Q3+1.5·IQR`, or an explicit business bound (e.g. "0..100"). Count and _list_ offenders (never auto-delete). Log: rule, count, list (or "see sheet"). Outliers are flagged in the Clean sheet (e.g. CF highlight), not removed — removal is a business decision.

```bash
# IQR probe per numeric column — pure formula approach (quartiles):
# Q1: =QUARTILE.INC(C2:C1000,1)  Q3: =QUARTILE.INC(C2:C1000,3)
# Flag: =IF(OR(C2<Q1-1.5*(Q3-Q1),C2>Q3+1.5*(Q3-Q1)),"OUTLIER","")
```

**3e. Build the Clean sheet.** Create sheet `Clean` (or `Tratado`) and copy source data into it (via `import` re-import or `add`/`set` — the method that preserves byte fidelity). Apply the validated transformations with formulas where possible so the Clean sheet recomputes when source changes. Freeze header, format header row (→ officecli-xlsx visual floor), keep the source sheet untouched.

**3f. Cross-check.** After the Clean pass, verify with queries: row count matches expectation (source rows − removed dupes = clean rows), no `#VALUE!` / `#REF!` (run the error sweep from spreadsheet-audit), no blank required fields remain where policy says fill.

### Phase 4 — Computations (aggregations, KPIs, trends, variations)

All computations are formulas on the Clean sheet or a dedicated `Metrics` sheet — never hardcoded results.

- **Aggregations.** `SUMIFS` / `COUNTIFS` / `AVERAGEIFS` for dimensional rollups (by group, period, category). Criteria built with cell references, not literals.
- **KPIs.** Every KPI is a formula cell with a definition label + comment: what it measures, the formula, the source range, and the period it covers.
- **Trends.** Time-indexed series where the x-axis is real dates or periods; avoid text-sorted axes that scramble chronology.
- **Variations.** Absolute and relative change between periods or groups — `(New−Old)` and `IF(Old=0, "n/a", (New−Old)/Old)`. Guard every division (→ `IFERROR` pattern from officecli-financial-model).
- **Percentages** carry `numFmt="0.0%"` at set time — raw decimals are unfinished work.

### Phase 5 — Documentation & report sheet

Add a `Methodology` (or `Relatório`) sheet containing:

- Source files/sheets + retrieval date (who exported what when).
- Column map (name/type/notes).
- Transformation log (each rule, count affected, date).
- KPI dictionary (name, formula, definition, source).
- Assumptions & PENDING items (everything not confirmed by the user, explicitly marked).
- VERIFIED / NOT VERIFIED list (which checks ran and passed, which could not run).

## QA (REQUIRED — Delivery Gate)

**Assume there are problems.** Run before declaring done:

1. **Error sweep.** `query 'cell:contains("#REF!")'` etc. (full sweep from spreadsheet-audit Phase 2) → zero is the only pass.
2. **Formula coverage.** Every KPI/Metric cell carries a formula. Query `'Metrics!:has(formula)'` count == planned KPI count.
3. **Traceability gate.** Every computed output cell either references source cells directly or is documented in the log. Random spot-check 3 outputs: walk the chain cell → formula → upstream → source (via `officecli get --json | jq '.format.formula'`).
4. **No-placeholder sweep.** No `TBD`, `xxxx`, `{var}` tokens in rendered output (reuse the officecli-data-dashboard Gate 6 pattern).
5. **Clean-sheet fidelity.** Source sheet hash/row-count unchanged from intake (source untouched). Clean row count = source − removed (matches the log).
6. **Visual floor.** `officecli view "$FILE" html` — no `###`, no truncated labels, headers formatted on every data sheet, percentages as `%`, dates as dates.
7. **Deliverable statement.** Final message states: what was analyzed, what was VERIFIED, what is NOT VERIFIED, every assumption, and where each artifact lives (sheets). Never claim "analysis complete" with open NAs.

If anything fails, fix at source and re-run the full cycle.

## Honest limits

- The xlsx engine's cached values may lag live formulas in non-recalculating viewers (→ officecli-xlsx cache-drift). Re-issue downstream formulas after upstream edits.
- `SUMPRODUCT` array-predicate forms may cache `0` in some build paths — prefer helper-column + `SUMIF` (→ officecli-data-dashboard D-17).
- Statistical interpretation (what an outlier _means_) is analysis, not arithmetic — present evidence, propose, let the user decide. Never auto-delete data.

## Reference

- Read/import commands: `officecli help xlsx` → `import`, `query`, `get`, `set`, `validate`, `view`.
- Query selectors: `cell[type=Number]`, `cell:isblank()`, `cell:contains("…")`, `cell:has(formula)`, `cell[formula~=…]`.
- Related skills: `spreadsheet-audit` (integrity checks, error sweep), `dashboard-design` (visualize results), `delivery-gate` (CREATED/MODIFIED/VERIFIED/NOT VERIFIED/PENDING/ISSUES taxonomy).
