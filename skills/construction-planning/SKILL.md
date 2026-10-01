---
name: construction-planning
description: "Use this skill to build construction planning workbooks in Excel — generic EAP (work breakdown structure), disciplines, packages, jobs, services, activities, predecessors, calendars, durations, dates, baseline, rescheduling, and physical progress tracking. Trigger on: 'EAP', 'planejamento de obra', 'construction planning', 'work breakdown structure', 'pacotes de trabalho', 'disciplinas', 'atividades', 'predecessoras', 'calendário de obra', 'baseline', 'replanejamento', 'avanço físico', 'cronograma de obra', 'build the EAP', 'montar o cronograma'. Output is a configurable, formula-driven .xlsx planning model that works for DIFFERENT obras (never hardcoded to one project). Scene-layer on officecli-xlsx / cpm-scheduling: inherits every xlsx hard rule and the CPM network discipline. DO NOT invoke for: financial/cost control (use construction-cost-control), production quantities/progress-only tracking (use production-control), or a visual Gantt chart (use gantt)."
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

# Construction Planning (scene-layer on officecli-xlsx / cpm-scheduling)

A construction planning workbook turns the engineering scope into a **disciplined, configurable time model**: EAP (work breakdown), activities with predecessors and calendars, baseline vs rescheduling, and physical progress — where every layer is generic and driven by a configuration area, so the SAME workbook shape serves different obras.

This skill adds the construction-planning domain structure on top of the mechanics from `officecli-xlsx` (engine), `cpm-scheduling` (network discipline: precedence, cycles, early/late dates, floats, critical path), and `gantt` (visualization). Read those first — everything about cells, formulas, CPM math, and chart mechanics is theirs, not re-taught here.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**When a prop name, enum value, or alias is uncertain, consult help before guessing.**

```bash
officecli help xlsx                          # element list
officecli help xlsx cell                     # cell props + formula patterns
officecli help xlsx validation               # dropdowns for config
officecli help xlsx conditionalformatting    # CF for progress/status
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx + cpm-scheduling.** Read `officecli-xlsx` first (engine rules, shell, batch JSON, validate), then `cpm-scheduling` (network validation BEFORE visuals, cycle detection, forward/backward pass, floats, critical path, calendar). This skill assumes you know how to build a validated CPM network in Excel and adds the **construction domain layers**: EAP hierarchy, packages/disciplines, configurable calendars, baseline/reschedule semantics, and physical progress.

**General rules that apply to every planning workbook** (verbatim, non-negotiable):

- **Não inventar dados.** Durations, quantities, dates, resources, progress % come from the user/leader or from sourced documents (contract schedules, engineering specs). Never fabricate durations or constraints to "make the schedule work".
- **Não inventar regras de negócio.** Sequencing logic (which activity precedes which), calendar rules, and progress-weighting come from the user or stated conventions.
- **Não inventar estruturas.** The EAP levels follow the user's classification (disciplina → pacote → serviço → atividade), not a structure you invented.
- **Não hardcodar valores calculados.** Dates, floats, progress, and rollups are formulas (or CPM-computed cells), never typed results.
- **Não acoplar nenhuma Skill ao ARES ou a uma obra específica.** This skill is obra-agnostic: configuration lives in a `Config` sheet, activity data in an `Atividades` sheet, and nothing references a specific project's codes, names, or dates. The SAME workbook template serves any obra by changing Config + data.
- **Trabalhar de forma configurável.** Number of EAP levels, separator in codes, calendar (working days/week), progress-weighting method — all parameters in Config, never literals spread across formulas.
- **Priorizar rastreabilidade.** Every activity traces to its EAP node; every progress rollup traces to its weight source.

## Core Principles

1. **Config sheet first.** A `Config` sheet holds every parameter the workbook uses: project name, calendar definition (working days, weekly rest days, holidays list reference), EAP level names + code separator, date format convention, progress weighting mode (by cost / by quantity / uniform). Formulas reference Config cells — no literals.
2. **EAP is the backbone.** Every activity hangs off an EAP node (disciplina → pacote → serviço). EAP codes are built with a configurable separator and consistent width, so sorting/rollups work. Activity rollups (dates, progress) aggregate UP the EAP tree.
3. **Baseline vs atual (rescheduling) are distinct columns, never overwritten.** Baseline start/finish stay frozen once approved; the execution schedule (atual/replanejado) is a separate set of columns. Variance = atual − baseline, a formula. Replanning writes to the atual columns; it NEVER mutates baseline.
4. **Progress is weighted, never eyeballed.** Physical progress rolls up by weight (cost share or quantity share from Config). Each activity's % físico is an input (from site/production data); rollups are formula-driven. Total obra % = Σ(activity % × weight)/Σ(weight).
5. **Everything is obra-configurable.** No obra name, code, date, or quantity appears inside formulas — only in Config/data cells. Duplicate the workbook for the next obra and change the data.

## Workflow

### Phase 1 — Configuration intake

Get from the user/leader (missing items = PENDING on the Config sheet):

- EAP levels: e.g. Disciplina → Pacote → Serviço → Atividade (or the obra's actual classification).
- Code convention: e.g. `D.P.S.A` 4-level codes, separator `.`, fixed-width segments.
- Calendar: working days (e.g. Mon–Sat), weekly rest, public holidays (country/state-specific list or reference sheet), weekly working hours if durations are in hours.
- Duration unit (days/weeks/hours) and whether durations are working or calendar days.
- Progress weighting mode: by cost, by quantity, or uniform per activity.
- Whether the user wants baseline + reschedule columns or baseline only.

### Phase 2 — Workbook skeleton

```bash
FILE=planejamento.xlsx
officecli create "$FILE"
officecli open "$FILE"
for S in Config EAP Calendario Atividades 'Linha de Balanco' Gantt Summary; do
  officecli add "$FILE" / --type sheet --prop name="$S"
done
officecli close "$FILE"
```

Sheet roles:
- **Config** — parameters (blue inputs).
- **EAP** — the work-breakdown tree (codes + names + weights per node).
- **Calendario** — working-day calendar: one row per date, flag working/rest/holiday (drives date math).
- **Atividades** — the CPM network: activity rows with predecessors, durations, dates, baseline columns (see cpm-scheduling for the network columns).
- **Gantt** — visual (see gantt skill).
- **Linha de Balanco** — optional LOB (see lob skill).
- **Summary** — rollups: by disciplina, physical progress, key dates, and variance vs baseline.

### Phase 3 — Config sheet

Rows (each a blue input on Config): project name (label), EAP level names (L1..L4), code separator, duration unit, working days per week, holidays sheet name, progress weighting mode, today/status date (optional, for progress vs plan).

```bash
officecli set "$FILE" /Config/B2 --prop value="Obra genérica (configurável)" --prop font.color=0000FF
officecli set "$FILE" /Config/B3 --prop value="Disciplina" --prop font.color=0000FF
officecli set "$FILE" /Config/B4 --prop value="Pacote"     --prop font.color=0000FF
officecli set "$FILE" /Config/B5 --prop value="Servico"    --prop font.color=0000FF
officecli set "$FILE" /Config/B6 --prop value="Atividade"  --prop font.color=0000FF
officecli set "$FILE" /Config/B7 --prop value="."          --prop font.color=0000FF
```

### Phase 4 — EAP sheet

Columns: `Nível` (L1..L4), `Código` (composed, e.g. `=B2&Config!$B$7&C2&…` or typed), `Nome`, `Disciplina`, `Peso` (weight for progress rollup; unit from Config) and `Peso %` (formula). EAP codes are unique keys — every Atividades row references its EAP code (data validation dropdown against the EAP code column, → validation list).

Weight rules:
- Leaf nodes (serviços) carry weights (cost or quantity, from the user — never invented).
- Parent weights = Σ children (formula).
- Peso % = peso / Σ siblings (formula) — rollups use these.

```bash
# Parent weight = sum of children (adjust range; EAP rows 2:200)
officecli set "$FILE" /EAP/F2 --prop 'formula==SUMIF(EAP!$B$2:$B$200,$B2&"*",EAP!$G$2:$G$200)'
```

### Phase 5 — Calendar sheet

One row per date of the planning horizon: `Data` | `Tipo` (Trabalho/Descanso/Feriado) | `Trabalha?` (=1/0). Holidays are INPUT from the user (country/state law or contract) — never invented. The `Atividades` date math (working-day counts) reads this sheet via helper columns (e.g. `COUNTIFS` of working days between two dates), or the workbook uses NETWORKDAYS-style formulas if the engine supports them — verify with `validate` before trusting; otherwise use the explicit calendar-sheet approach (deterministic, engine-safe):

```bash
# Working days elapsed between Start (Atividades!D2) and Finish (Atividades!E2):
officecli set "$FILE" /Atividades/H2 --prop 'formula==COUNTIFS(Calendario!$A$2:$A$400,">="&$D2,Calendario!$A$2:$A$400,"<="&$E2,Calendario!$C$2:$C$400,1)'
```

### Phase 6 — Activities sheet (CPM network)

Build per `cpm-scheduling` discipline: validate the network BEFORE computing dates (see cpm-scheduling §Network validation). Columns (minimal set):

- `Código EAP` (dropdown from EAP codes), `Atividade`, `Tipo` (Marco/Atividade).
- `Predecessoras` (list, e.g. "A-100;A-102"), `Tipo de vínculo` (FS/SS/FF/SF + lag, e.g. "FS+2d").
- `Duração` (unit from Config), `Calendário` (reference to Calendario).
- Baseline: `Início base`, `Fim base` (frozen once approved).
- Atual: `Início atual`, `Fim atual` (replanned), plus `Desvio início`/`Desvio fim` (= atual − base, formula).
- Progress: `% físico` (input, from site), `Peso` (from EAP via lookup), `% físico ponderado` (= % × peso, formula).
- CPM computed (per cpm-scheduling): `Data cedo`, `Data tarde`, `Folga`, `Crítico?`.

```bash
# Deviation columns (formula), per activity row:
officecli set "$FILE" /Atividades/M2 --prop 'formula==IF(OR($I2="",$D2=""),"",$I2-$D2)'
officecli set "$FILE" /Atividades/N2 --prop 'formula==IF(OR($J2="",$E2=""),"",$J2-$E2)'
# Weighted physical progress (per activity):
officecli set "$FILE" /Atividades/P2 --prop 'formula==$O2*$G2'   # O=% físico input, G=peso
```

### Phase 7 — Summary / rollups

By-disciplina rollups (formula-driven):

```bash
# Weighted progress per disciplina (D=disciplina code in EAP, Atividades carries it via lookup):
# Total realized weight = SUMPRODUCT-free: helper column Q2 = =O2*P2 on Atividades, then:
officecli set "$FILE" /Summary/B5 --prop 'formula==SUMIF(Atividades!$D$2:$D$500,$A5,Atividades!$Q$2:$Q$500)/SUMIF(Atividades!$D$2:$D$500,$A5,Atividades!$G$2:$G$500)'
```

Key summary cells: project start/finish (MIN/MAX of Atividades atual dates), global physical progress (Σ weighted progress / Σ weights), critical-path duration, and variance vs baseline (finish atual − finish base). All formulas.

### Phase 8 — Visualization (refer gantt / lob)

Add the Gantt per the `gantt` skill (scale, baseline vs atual bars, dependencies, status). Optionally the `lob` skill for repetitive services. **Never add the Gantt before the network is validated** (cpm-scheduling rule).

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Run the full inherited cycle AND the construction-specific gates:

**Gate CP-1 — Network validated (mandatory pre-visual).** Zero cycles, every predecessor exists, dates consistent (start ≤ finish), calendar respected (cpm-scheduling gates). REJECT before any chart is added.

**Gate CP-2 — No obra-specific literals in formulas.** Scan formula cells for obra codes/names/dates that should be data:

```bash
LEAK=$(officecli query "$FILE" 'cell:has(formula)' --json \
  | jq '[.data.results[] | select(.format.formula | test("RU-|TORRE|LOTE [0-9]";"i"))] | length')
[ "$LEAK" -eq 0 ] && echo "Gate CP-2 OK (no obra-specific literals in formulas)" || { echo "REJECT Gate CP-2: $LEAK literal(s)"; exit 1; }
```

(Adapt the regex to the actual obra codes/names — the check is *formulas must reference cells, not hardcoded obra values*.)

**Gate CP-3 — Baseline immutable.** No Atividades baseline column carries a formula that depends on atual columns (baseline only depends on Config/inputs + its own snapshot). Verify by reading baseline formula cells: they must not reference atual columns.

**Gate CP-4 — Every EAP code exists.** Every Atividades EAP code resolves to an EAP row (VLOOKUP/COUNTIF check → 0 missing). No orphan activities.

**Gate CP-5 — Progress consistency.** Weighted progress rollups total between 0% and 100% for each disciplina; Σ of rollup weights = 100%. No `#DIV/0!` when weights are zero — guard with `IF(Σpeso=0,"n/a",…)`.

```bash
DIV0=$(officecli query "$FILE" 'cell:contains("#DIV/0!")' --json | jq '.data.results | length')
[ "$DIV0" -eq 0 ] && echo "Gate CP-5 OK (no division errors)" || { echo "REJECT Gate CP-5: $DIV0 #DIV/0!"; exit 1; }
```

**Gate CP-6 — Visual floor (mandatory).** `officecli view "$FILE" html` — no `###`, no truncated EAP codes (widen columns for the deepest code), Gantt bars render, Calendar/Config readable, headers formatted, activeTab = the sheet the user should land on (Summary or Gantt). REJECT on any defect.

If anything fails, fix at source and re-run the full cycle.

## Honest limits

- Date math depends on the engine's supported functions — if `NETWORKDAYS`/`WORKDAY` are not evaluated (or cached `0`), use the explicit Calendario-sheet COUNTIFS approach and verify cached values (→ officecli-xlsx cache-drift).
- Durations and logical links are user inputs — the skill validates structure (cycles, orphans), NOT business correctness (whether 10 days is the right duration). That validation is the user's engineering call.
- Progress weighting by cost requires cost data — if only quantities exist, weight by quantity; if neither, use uniform and say so (PENDING).
- Complex multi-calendar logic (weather windows, crew calendars) may exceed worksheet math — model them as input-driven date columns, not formulas.

## Reference

- Engine + mechanics: `officecli-xlsx`; network math: `cpm-scheduling`; visualization: `gantt` / `lob`.
- Production quantities: `production-control`; costs: `construction-cost-control`.
- Final status: `delivery-gate` (CREATED/MODIFIED/VERIFIED/NOT VERIFIED/PENDING/ISSUES).