---
name: lob
description: "Use this skill to build Line of Balance (Linha de Balanço) workbooks in Excel — time, location, work fronts (frentes), services, pace/rhythm (ritmo), production rate, continuity, conflicts, calendar, and visualization. Trigger on: 'linha de balanço', 'line of balance', 'lob', 'ritmo de produção', 'continuidade de frente', 'conflito de frente', 'balanço de produção', 'production rate chart', 'time-location chart', 'frentes de trabalho simultâneas', 'service rhythm'. Output is a generic, formula-driven .xlsx Line-of-Balance model that works for ANY repetitive project — NEVER assuming obra-specific data. Scene-layer on officecli-xlsx: inherits every xlsx hard rule; coordinates with cpm-scheduling (network) and production-control (rates). DO NOT invoke for: non-repetitive critical-path scheduling (use cpm-scheduling), Gantt visualization of a plain schedule (use gantt), or construction-planning structure/EAP (use construction-planning)."
---

> **⚠️ Platform note — read before running any command.** The shell snippets in this skill are written for **macOS / Linux** (bash/zsh). Always check which OS you are on first. On **Windows** do **not** run them verbatim — the underlying tool/CLI commands are usually cross-platform, but the surrounding shell syntax is not. Translate it to PowerShell before running:
>
> | bash (macOS / Linux) | PowerShell (Windows) |
> | --- | --- |
> | `a && b` | run as two steps, or `a; if ($?) { b }` |
> | `cat <<'EOF' \| tool …` (heredoc) | write the text to a temp file, then pipe/pass that file to the tool |
> | `VAR=$(cmd)` … `$VAR` | `$VAR = cmd` … `$VAR` |
> | `cmd > /dev/null` | `cmd > $null` |
> | `… \| grep PAT` | `… \| Select-String PAT` |
> | `… \| jq …` | `… \| ConvertFrom-Json`, then read the fields |
> | `python3 x.py` | `python x.py` (or `py x.py`) |
> | `~/dir`, `/tmp` | `$env:USERPROFILE\dir`, `$env:TEMP` |
> | `cp` / `mkdir -p` / `rm -rf` | `Copy-Item` / `New-Item -ItemType Directory -Force` / `Remove-Item -Recurse -Force` |
>
> If a command has no obvious Windows equivalent, prefer the built-in file/HTTP tools over raw shell.

# Line of Balance — Linha de Balanço (scene-layer on officecli-xlsx)

Line of Balance (LoB) is the scheduling technique for **repetitive work** — the same service repeated across locations/fronts (pavement segments, apartments in a tower, pipeline stretches, room finishes). The plan is a set of **diagonal lines**: each line = one service, x = location/front, y = time (or the inverse), slope = production rhythm (ritmo). Where lines cross, fronts conflict — two services need the same location at the same time. The special dangers: inventing rhythm values, inventing obra-specific structure, and drawing a Line-of-Balance as if it were a static Gantt.

This skill is **generic by construction**: locations, fronts, services, and rates are DATA (Config + registers), never embedded in formulas or structure. If you start hardcoding a specific project's front names, stop — that violates the core rule.

Engine mechanics come from `officecli-xlsx`; network validation from `cpm-scheduling`; production rates from `production-control`.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**When a prop name, enum value, or alias is uncertain, consult help before guessing.**

```bash
officecli help xlsx                          # element list
officecli help xlsx chart                    # line/xy chart schema (the LoB chart)
officecli help xlsx conditionalformatting    # conflict highlighting
officecli help xlsx cell                     # cell props
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx.** Read `officecli-xlsx` first (engine rules, shell, batch JSON, validate). Guidance on relationships between services comes from `cpm-scheduling` (link types/lags as line offsets); production rates from `production-control` (never invented). This skill adds: the Linear-Schedule model (Configuration → Location × Service table → rhythm computation → conflicts → LoB chart).

**Core rules (verbatim, non-negotiable):**

- **Não inventar dados / Não inventar regras de negócio / Não inventar estruturas.** Fronts, locations, services, durations per location, and rates are inputs — or derived by formula from inputs. Nothing guessed.
- **Não acoplar nenhuma Skill ao ARES ou a uma obra específica.** This skill is obra-agnostic to the structural level: fixed sheet names, generic columns, zero project-specific names in formulas or CF rules.
- **Não hardcodar valores calculados.** Rhythm, lines, and conflicts are formula-driven.
- **Separar dados de entrada, cálculos e apresentação.** Config/registers → computed layer → chart.

## Core Principles

1. **Line of Balance ≠ Gantt.** A Gantt shows activities on a time axis; LoB shows services as **lines over location × time**. Same engine, different geometry — do not force a Gantt chart shape on an LoB model.
2. **Rhythm is computed.** For a service, rhythm (unidades/tempo) = Σ units across locations / Σ durations (or per-location slope = duration per unit, configurable). The computed line coordinates (location, time) are formulas — the line never touches a hand-typed number.
3. **Conflicts are detected, not narrated.** A conflict = two services overlapping the same location at the same time. Compute the overlap flag per location via formulas (each service's time-at-location window vs the other's) and highlight with CF — never eyeball-declared.
4. **Configuration-driven.** Units per location, service order, and the location axis are Config/register data. Swap in another project's data and the same workbook reconfigures.
5. **Rate validation hooks into production-control.** Planned rhythm is an input (or derived from schedule); **realized rhythm comes from production-control quantities/effort — it is never invented here**. When realized data is absent, the realized layer shows `"n/a"` / NOT VERIFIED.

## Workflow

### Phase 1 — Intake

Get from the user/leader:
- Repetitive services list (order of execution, if any) — each with: unit (e.g. m², m, apartment), duration per location (or total duration + locations count), prerequisite service + lag (from cpm-scheduling Links when available).
- Location axis: front/location list (ordered along the works), units per location per service (or uniform).
- Start date for the first service; calendar (→ construction-planning §Calendar).
- Whether to include a realized layer (from production-control) or plan only.

Missing → PENDING; never invent rates or locations.

### Phase 2 — Workbook skeleton

```bash
FILE=lob.xlsx
officecli create "$FILE"
officecli open "$FILE"
for S in Config Locacoes Servicos 'Linhas LOB' Conflitos Summary; do
  officecli add "$FILE" / --type sheet --prop name="$S"
done
officecli close "$FILE"
```

Sheet roles:
- **Config** — unit convention, start date, calendar reference, service order/sequence, axis orientation.
- **Locacoes** — the location axis: `Local/Frente` | `Ordem` | `Distancia/Indice` (input).
- **Servicos** — service register: `Servico` | `Unidade` | `Duracao por local` | `Predecessor` | `Lag` (inputs).
- **Linhas LOB** — computed: per service × location, the start/end time of that service at that location (formulas).
- **Conflitos** — overlap detection per location/time window (formulas + CF summary).
- **Summary** — project duration, max fronts, conflict count, verdict.

### Phase 3 — Config + registers

```bash
# Config: start date + convention (blue inputs):
officecli set "$FILE" /Config/B2 --prop value="2026-01-05" --prop numFmt='yyyy-mm-dd' --prop font.color=0000FF
# Locacoes (ascending order = works direction):
officecli set "$FILE" /Locacoes/A2 --prop value="Frente 01" ; officecli set "$FILE" /Locacoes/B2 --prop value=1
# Servicos: service, unit, duration-per-location, predecessor (optional), lag:
officecli set "$FILE" /Servicos/A2 --prop value="Servico A"
officecli set "$FILE" /Servicos/B2 --prop value="m2"
officecli set "$FILE" /Servicos/C2 --prop value=5       # days per location
officecli set "$FILE" /Servicos/D2 --prop value=""      # predecessor
officecli set "$FILE" /Servicos/E2 --prop value=0       # lag days
```

### Phase 4 — Computed layer (Linhas LOB)

Per service s at location n: **start time** and **end time** are formulas from the previous location's end + duration (continuous rhythm):

```bash
# r = row of location n, s = service column. First location starts at config start + service offset (lag chain).
officecli set "$FILE" '/Linhas LOB/D3' --prop 'formula==IF($B3=1,Config!$B$2+Servicos!$E$2,INDEX($D$2:D2,MATCH($B3-1,$B$2:B2,0))+Servicos!$C$2)'
# End = start + duration - 1 (or + duration in calendar days per Config):
officecli set "$FILE" '/Linhas LOB/E3' --prop 'formula==IF($D3="","",$D3+Servicos!$C$2-1)'
```

For multiple services: one block of columns per service (e.g. columns D/E = Servico A, F/G = Servico B…). Successor start must ALSO honor the predecessor + lag constraint: `start = MAX(own rhythm continuity, predecessor end at same location + lag)` — the compound formula:

```bash
officecli set "$FILE" '/Linhas LOB/F3' --prop 'formula==MAX(IF($B3=1,Config!$B$2,INDEX($F$2:F2,MATCH($B3-1,$B$2:B2,0))+Servicos!$C$3),IF(Servicos!$D$3="",0,INDEX($D$2:D2,MATCH($B3,$B$2:B2,0))+Servicos!$E$3))'
```

(Column letters are placeholders — map to the actual service-block columns; guard blank predecessors with `IF(Servicos!$D$3="",...)`.)

### Phase 5 — Conflicts (detection)

Per pair of services on the same location: overlap when `S1.start ≤ S2.end AND S2.start ≤ S1.end` (windows intersect in time at that location):

```bash
officecli set "$FILE" /Conflitos/C3 --prop 'formula==IF(AND(D3<=G3,G3<=E3),"CONFLITO","")'
```

(Generic form: for service pair (s1,s2) at location n: `IF(AND(s1_end>=s2_start,s1_start<=s2_end),"CONFLITO","")`.) CF: red fill on CONFLITO rows + a count in Summary (`COUNTIF`). Each conflicting pair MUST be reported in the QA note with location + window — the workbook highlights, the QA note explains.

### Phase 6 — LoB chart

XY/line chart with location on x and time on y (or inverted per Config): one series per service (y = start times per location, x = location order/index). Where chart feeding is not reliable, the `Linhas LOB` table IS the deliverable and the chart is complementary — state which representation was delivered:

```bash
officecli add "$FILE" /Summary --type chart \
  --prop chartType=scatterLines \
  --prop title="Linha de Balanco (planejado)" \
  --prop series1.name="Servico A" --prop series1.x='Linhas LOB!B2:B10' --prop series1.y='Linhas LOB!D2:D10' \
  --prop x=0 --prop y=12 --prop width=18 --prop height=16
```

### Phase 7 — Realized layer (optional).

Only when production-control data exists: plot realized start times per location (from Executado registers) as a second marker style (scatter no-line, different color). **No realized data → realized layer is skipped, NOT invented.** State "realized layer not included (no production-control data provided)" in the QA note.

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Run the inherited cycle (error sweep, validate, HTML preview) AND the LoB gates:

**Gate LOB-1 — Zero invented rhythm.** Every start/end cell in Linhas LOB is a formula over Config+Servicos+Locacoes (`query` number cells without formula in those regions == 0). Any hardcoded date in a computed cell → REJECT.

**Gate LOB-2 — Continuity holds.** For each service, location n+1 start == location n end + (duration − 1) (rhythm continuity). Spot-check 3 via `get --json` cachedValues. Breaks = reject (usually a MATCH/INDEX offset bug).

**Gate LOB-3 — Predecessor honored.** For each service with a predecessor, at every location: start ≥ predecessor end + lag. Formula inspection + spot-check. Violation = reject.

**Gate LOB-4 — Conflicts flagged.** Select 2 locations with known overlapping windows and confirm Conflitos shows CONFLITO (and non-overlapping show blank). Missed conflict = reject.

**Gate LOB-5 — Obra-agnostic structure.** No formula, CF rule, or sheet name contains a project-specific word (front names, obra names). Grep the xlsx XML for any observed names → zero hits in formulas/CF:

```bash
# {obra,front names} must NOT appear inside formulas; they appear ONLY as data values in Locacoes/Servicos.
```

**Gate LOB-6 — Visual floor (mandatory).** `officecli view "$FILE" html`: LoB chart (if delivered) renders with discernible lines/legend; Conflitos highlights visible; no `###`; no truncated labels. REJECT on any defect.

If anything fails, fix at source and re-run the full cycle.

## Honest limits

- LoB assumes repetitive, continuous work. Non-repetitive schedules belong to cpm-scheduling — say so when the user's work isn't repetitive.
- The chart renderer may not support series-in-rows feeding perfectly — when it doesn't, the Linhas LOB table is the authoritative deliverable; disclose what was charted vs tabulated.
- Resource-leveling (contractor has one crew, can't run two lines) is OUT of scope: this skill detects time-location conflicts between services, not crew constraints — flag that limitation if the user asks for leveling.
- Realized rhythm depends on production-control data: absent data = absent realized layer, NOT approximate values.

## Reference

- Engine: `officecli-xlsx`; network links/validation: `cpm-scheduling`; production rates: `production-control`.
- Structure/EAP linkage: `construction-planning`; final status: `delivery-gate`.