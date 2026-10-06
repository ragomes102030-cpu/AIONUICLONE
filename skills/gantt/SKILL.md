---
name: gantt
description: "Use this skill to build Gantt chart workbooks in Excel — time scale (escala temporal), start, end, duration, status, baseline, actual (realizado), dependencies, and dynamic updates. Trigger on: 'gantt', 'gráfico de gantt', 'cronograma visual', 'timeline chart', 'project timeline', 'baseline vs atual', 'dependências visuais', 'gantt dinamico', 'progress bars schedule'. Output is a chart/cell-based Gantt in a single .xlsx, formula-driven so dates and bars update when data changes. Scene-layer on officecli-xlsx / cpm-scheduling: inherits every xlsx hard rule AND assumes a VALIDATED CPM network (see cpm-scheduling — never visualize an unvalidated network). DO NOT invoke for: building the network/logic itself (use cpm-scheduling), construction planning structure/EAP (use construction-planning), or Line of Balance (use lob)."
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

# Gantt (scene-layer on officecli-xlsx / cpm-scheduling)

A Gantt is the **visual layer of a validated schedule**. It shows activities across a time scale — baseline vs atual (actual/replanned), status, and dependencies — and it updates dynamically when the underlying dates change. The cardinal rule comes from cpm-scheduling: **a Gantt is only built from a VALIDATED network.** Visualizing first, validating later, is how wrong schedules get shipped.

This skill covers two rendering approaches (cell-based and chart-based), the baseline-vs-atual encoding, dependency rendering, and dynamic-update mechanics. Engine mechanics come from `officecli-xlsx`; network validation from `cpm-scheduling`; calendar math from `construction-planning`.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**When a prop name, enum value, or alias is uncertain, consult help before guessing.**

```bash
officecli help xlsx                          # element list
officecli help xlsx chart                    # chart schema (bar/line)
officecli help xlsx conditionalformatting    # CF for bar rendering
officecli help xlsx cell                     # cell props
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx + cpm-scheduling.** Read `officecli-xlsx` first (engine rules, shell, batch JSON, validate). Read `cpm-scheduling` before using this skill — the network must be validated (Validacao verdict = NETWORK VALID) before any bar is drawn. This skill adds: time-scale construction, bar rendering (cell-based or chart), baseline/atual/status encoding, dependency arrows, dynamic update.

**Core rules (verbatim, non-negotiable):**

- **Não inventar dados.** Bar positions come from schedule dates (formula references to the CPM sheets) — never drawn by hand or typed.
- **Não hardcodar valores calculados.** Cell-based bars use formulas; chart-based Gantts feed chart series from date cells.
- **Não afirmar que algo foi validado sem realmente validar.** The validation verdict is checked by query before the Gantt is built — and the check is reported.
- **Não acoplar nenhuma Skill ao ARES ou a uma obra específica.** Obra-agnostic: all names/dates are data, referenced, not embedded.

## Core Principles

1. **Validation gate is structural.** Build order: CPM validation → dates → Gantt. If `Validacao!E2` (from cpm-scheduling) is not "NETWORK VALID", STOP. No Gantt.
2. **Time scale is a formula grid.** A row of date headers (one per period) derived from MIN(ES) to MAX(EF) — headers are formulas referencing the project start/finish, so the scale auto-extends.
3. **Baseline vs atual is encoded, not narrated.** Baseline bars (e.g. gray/outline) vs atual bars (filled) vs realizado (filled progress overlay) — three distinct visual encodings on the same rows. Each encoding is formula-driven from its date columns.
4. **Status is a derived column.** Status (Concluída = fim ≤ hoje; Em andamento = today between ES/EF; Atrasada = hoje > EF e % físico < 100; Não iniciada) is a formula over dates and executed progress — never typed.
5. **Dependencies are rendered, not implied.** A second, minimal chart layer (line/arrow connectors between activity rows) or a noted `Dependências` reference column. When connector rendering is not reliable in the engine, show dependencies as a typed-but-validated reference column linked to the Links table — and disclose which approach was used.
6. **Dynamic updates are the default.** Change a date in the CPM sheets → bars, scale, status, and dependencies recompute. No manual redraw.

## Workflow

### Phase 1 — Precondition check (mandatory)

```bash
FILE=schedule.xlsx          # workbook with the validated CPM network (cpm-scheduling)
officecli open "$FILE"
officecli get "$FILE" /Validacao/E2 --json | jq -r '.data.results[0].format.cachedValue // .data.results[0].text'
# Must print "NETWORK VALID". Otherwise: STOP, fix the network first (cpm-scheduling Phase 4).
```

### Phase 2 — Gantt sheet + time scale

```bash
officecli add "$FILE" / --type sheet --prop name=Gantt
# Time scale: row 1 = header, row 2 = period headers. First header cell anchors project start:
officecli set "$FILE" /Gantt/B2 --prop 'formula==Datas CPM!E2'      # first ES (start of scale)
officecli set "$FILE" /Gantt/C2 --prop 'formula==IF(B2="","",EDATE(B2,1))'   # monthly step (or +1 day for daily scale)
# Copy the step formula across the header range; weekly/daily scales use +7/+1 working steps per Config.
```

Header cells formatted with a date `numFmt` (e.g. `'mmm/yy'` for monthly, `'d'` for daily). The scale length = span of the network (project duration from Summary). Row 3 (or a legend row) documents the encoding: **baseline = outline, atual = fill, realizado = progress overlay, status colors**.

### Phase 3 — Activity rows + bar encoding (cell-based approach — recommended)

One row per activity (linked to `Datas CPM` by ID). Per activity, two visual rows (baseline + atual) or two bars per cell via CF:

**Cell-based bar** via conditional formatting (formulacf): for each activity row and each scale column, the cell is filled when the period falls inside the activity's date span:

```bash
# Column B..last scale column, row 5 = first activity. CF rule per row-range:
# Fill cells where the period >= activity start AND period <= activity end:
officecli add "$FILE" /Gantt --type conditionalformatting \
  --prop type=formulaCF --prop 'sqref=B5:AZ5' \
  --prop 'formula=AND(B$2>=$E5,B$2<=$F5)' --prop fill=4472C4
```

Pattern per row r:

- baseline bar range: `AND(B$2>=$D5,B$2<=$E5)` (D/E = baseline start/end) → outline/gray fill.
- atual bar: `AND(B$2>=$F5,B$2<=$G5)` (F/G = atual start/end) → filled (blue).
- realizado overlay: `AND(B$2>=$F5,B$2<=$F5+($G5-$F5+1)*$H5-1)` … simpler: realized portion up to `MIN(today, end)` → green fill via `B$2<=MIN($H5,TODAY())` where H = realized end date (formula: dates + % físico from production-control).

**CF ordering matters:** realized (green) applied first/on top, then atual fill, then baseline outline — verify the rendered HTML to confirm the visual layering.

### Phase 4 — Chart-based Gantt (alternative/complement)

Use a bar chart fed by date cells when the audience wants a single chart object:

```bash
# Chart series: Start (invisible baseline) and Duration (visible) per activity — the float-bar recipe:
# Reservoir-style: series1 = start dates (invisible), series2 = durations (visible).
officecli add "$FILE" /Gantt --type chart \
  --prop chartType=bar \
  --prop title="Cronograma (baseline vs atual)" \
  --prop series1.name="Inicio"      --prop series1.values='GanttData!C5:C25'   # start dates
  --prop series2.name="Duracao"     --prop series2.values='GanttData!D5:D25'   # durations
  --prop series1.categories='GanttData!B5:B25'                                 # activity IDs
  --prop x=0 --prop y=40 --prop width=18 --prop height=20
```

(Date-axis bar Gantts are fragile across renderers — the cell-based CF approach is the reliable default; use the chart only when the user explicitly wants a chart object, and verify it renders in the target viewer before delivery.)

### Phase 5 — Status column (derived)

```bash
# W = % físico (from production-control or input), T = TODAY(), F/G = atual dates
officecli set "$FILE" /Gantt/K5 --prop 'formula==IF(OR($G5="",$F5=""),"",IF($G5<=TODAY(),"Concluida",IF(AND($F5<=TODAY(),$G5>TODAY()),IF($W5>=1,"Concluida","Em andamento"),IF($F5>TODAY(),"Nao iniciada",""))))'
# Atrasada: fim passado e % físico < 100:
officecli set "$FILE" /Gantt/L5 --prop 'formula==IF(AND($G5<TODAY(),$W5<1),"Atrasada","")'
```

CF: status colors (Concluida=green, Em andamento=blue, Atrasada=red) via `formulacf` on the status cell.

### Phase 6 — Dependencies rendering

- **Reliable approach:** a `Dependências` reference column on each activity row listing predecessor IDs from the Links table (formula: `TEXTJOIN` a-linked helper column of predecessor IDs where Atividade ID matches — or a small helper `IF` chain per row when TEXTJOIN is not supported by the engine).
- **Connector arrows** (line chart overlays) only if the target renderer supports them reliably — verify in HTML preview; otherwise use the reference column approach and disclose.

### Phase 7 — Dynamic update proof + finish

After building: change a date in the CPM sheet (e.g. extend activity duration), re-read a bar-covered cell / status cell, confirm recompute (or `fullCalcOnLoad` + cache-refresh per xlsx rules). Set `calc.fullCalcOnLoad=true` (high-level set), `activeTab` LAST to land on Gantt (if that's the primary view). Verify `validate`.

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Run the inherited cycle (error sweep, validate, HTML preview) AND the Gantt-specific gates:

**Gate G-1 — Validation precondition.** `Validacao!E2` = "NETWORK VALID" (read via `get`). Anything else → REJECT. Record the verdict in the QA note.

**Gate G-2 — Everything formula-driven.** Zero hardcoded date/bars:

```bash
Hard=$(officecli query "$FILE" 'cell[type=Number]' --json \
  | jq '[.data.results[] | select(.format.formula == null) | select(.path | test("/Gantt/")) | select(.path | test(":[B-Z]"))] | length')
[ "$Hard" -eq 0 ] && echo "Gate G-2 OK" || { echo "REJECT Gate G-2: $Hard hardcoded Gantt cells"; exit 1; }
```

(Header labels/text columns excepted — the check targets date/status/bar-driving cells.)

**Gate G-3 — Bars match dates.** Spot-check: for 3 activities, manually compare the formula-defined bar spans (ES/EF, atual start/end) against the rendered HTML bar positions. Mismatch = reject (usually a CF sqref/row-offset bug).

**Gate G-4 — Status correctness.** Today-driven statuses: pick 3 rows and verify the status formula's cachedValue matches the calendar reality (a past-due unfinished activity MUST read "Atrasada"). Wrong status = reject.

**Gate G-5 — Baseline unchanged.** Baseline columns on Gantt reference the immutable baseline columns from construction-planning/cpm (never the atual columns). A Gantt whose "baseline" moves when atual changes = reject (spot-check one baseline formula).

**Gate G-6 — Visual floor (mandatory).** `officecli view "$FILE" html`: bars render with distinct baseline/atual/realizado encodings, no `###`, no truncated activity IDs (widen col A), scale headers readable, legend present, no placeholder tokens. REJECT on any defect.

If anything fails, fix at source and re-run the full cycle.

## Honest limits

- Date-axis bar charts render differently across viewers — the cell-based CF Gantt is the reliable default; chart-object Gantts must be verified in the user's target viewer.
- CF layering (realizado over atual over baseline) can be finicky — always confirm with an HTML preview; reorder rules if the overlay is lost.
- TODAY()-driven statuses are snapshot-dependent: they reflect the date the file is opened. Document this. (`fullCalcOnLoad` refreshes at open.)
- Very long scales (years daily) produce thousands of CF cells — check performance; suggest weekly/monthly scales for long horizons.

## Reference

- Network/validation: `cpm-scheduling`; calendar: `construction-planning`; progress data: `production-control`.
- Presentation: `dashboard-design` (Gantt as a sheet inside a broader board); final status: `delivery-gate`.
