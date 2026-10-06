---
name: production-control
description: "Use this skill to build production-control workbooks in Excel — planned quantity (quantidade planejada), executed quantity (quantidade executada), balance (saldo), physical progress (avanço físico), productivity, performance, service, work front (frente), location, period, and planned-vs-actual (planejado x realizado) analysis. Trigger on: 'controle de produção', 'production control', 'quantidade planejada', 'quantidade executada', 'avanço físico', 'produtividade', 'desempenho', 'frente de serviço', 'serviço executado', 'planejado x realizado', 'produção de obra', 'measured quantities', 'physical progress', 'productivity analysis', 'production report', 'medição'. Output is a formula-driven .xlsx that computes progress and performance from user-provided quantities — NEVER invented productivity indices. Scene-layer on officecli-xlsx / construction-planning / construction-cost-control: inherits every xlsx hard rule; links to EAP/services and cost structures when provided. DO NOT invoke for: full scheduling/CPM (use cpm-scheduling / construction-planning), cost control (use construction-cost-control), or a visual Gantt (use gantt)."
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

# Production Control (scene-layer on officecli-xlsx)

Production control tracks **what was planned to be done, what was actually done, and the resulting progress and productivity** — per service, per work front, per location, per period. The special danger of this domain is **invented productivity indices**: a productivity figure is either computed from real, user-provided quantities and effort, or it is NOT VERIFIED. This skill makes that rule structural.

Everything about the engine comes from `officecli-xlsx`; EAP linkage and progress-weighting patterns come from `construction-planning`; deviations/rollup patterns from `construction-cost-control`. Not re-taught here.

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
officecli help xlsx conditionalformatting    # CF for progress/saldo signals
officecli help xlsx validation               # dropdowns for frente/localizacao
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx.** Read `officecli-xlsx` first (engine rules, shell, batch JSON, validate, cache-drift). Reuse the EAP structure from `construction-planning` when provided (services hang off EAP nodes) and the deviation/rollup formulas from `construction-cost-control`.

**Core rules (verbatim, non-negotiable):**

- **Nunca inventar índices de produtividade.** Productivity = executed quantity / effort (or the inverse, per convention). The inputs (quantity, effort/hours/crew-days) must come from the user or from a sourced register. If no effort data exists, the productivity cell is `"n/a"` (or blank) with a NOT VERIFIED note — NEVER a guessed index.
- **Não inventar dados.** Planned quantities, executed quantities, and effort are inputs. Nothing fabricated.
- **Não hardcodar valores calculados.** Saldo (= planejada − executada), avanço % (= executada/planejada), productivity, and performance are formulas, always.
- **Não acoplar nenhuma Skill ao ARES ou a uma obra específica.** Obra-agnostic: service, front, and location values live in data/Config cells, never in formulas.
- **Separar dados de entrada, cálculos e apresentação.** Registers (inputs) separate from the comparison/rollup sheets.

## Core Principles

1. **The three input registers.** Production data arrives as three input sheets (or one register with an `Origem` column):
   - **Planejado** — planned quantities per service/front/location/period (input from the schedule or production plan).
   - **Executado** — measured executed quantities per service/front/location/period (input from site measurement / medição).
   - **Esforço** (optional) — effort spent (hours / crew-days / equipment hours) per service/front/period (input). WITHOUT this, productivity cannot be computed — and must not be.
2. **Computed layer (formulas only):**
   - **Saldo** = Planejado − Executado.
   - **Avanço físico** = Executado / Planejado (guarded) — per line, rolled up by weight (cost or quantity weight from construction-planning conventions when an EAP exists).
   - **Produtividade** = Executado / Esforço (or Esforço / Executado, per the user's stated convention — usually m²/h, m³/h, h/m²).
   - **Desempenho** = Productividade realizada / Produtividade de referência (the reference is an explicit Config input with source — benchmark from the user's historical data or contract; never invented).
3. **Dimensions are data-driven.** `Serviço`, `Frente`, `Localização`, `Período` are columns (with dropdowns where stable lists exist), and rollups are `SUMIFS` over those dimensions. No hardcoded dimension names in formulas.
4. **Progress without productivity data is still valid** — as quantity-based progress; the productivity columns show `"n/a"` and are reported NOT VERIFIED. Never leave a fake index.

## Workflow

### Phase 1 — Intake

Get from the user/leader:

- List of services (or EAP reference from construction-planning).
- Work fronts and locations (dimensions).
- Period structure (daily/weekly/monthly; period labels).
- Which registers exist: planned, executed, effort (and their sources).
- Productivity convention: quantity-per-effort (e.g. m²/h) or effort-per-quantity (h/m²)? What unit?
- Reference productivity source (historical/contract) — if none, mark as PENDING; do not invent.

### Phase 2 — Workbook skeleton

```bash
FILE=producao.xlsx
officecli create "$FILE"
officecli open "$FILE"
for S in Config Planejado Executado Esforco 'Controle de Producao' Rollup Summary; do
  officecli add "$FILE" / --type sheet --prop name="$S"
done
officecli close "$FILE"
```

Sheet roles:

- **Config** — productivity convention, units, reference values, status date.
- **Planejado / Executado / Esforco** — input registers (blue).
- **Controle de Producao** — the comparison view: one row per service×front×location (or per line item), saldo/avanço/produtividade formulas.
- **Rollup** — by service, by front, by period.
- **Summary** — headline KPIs: overall progress, saldo total, worst/best fronts, productivity trend.

### Phase 3 — Config

```bash
officecli set "$FILE" /Config/B2 --prop value="m2/h" --prop font.color=0000FF                       # productivity unit
officecli set "$FILE" /Config/B3 --prop value="qtd/esforco" --prop font.color=0000FF                # convention
officecli set "$FILE" /Config/B4 --prop value=0.85 --prop numFmt='0.0%' --prop font.color=0000FF      # reference productivity (input + source note)
officecli set "$FILE" /Config/C4 --prop value="Fonte: historico do usuario (PENDING confirm)" --prop font.color=0000FF
```

### Phase 4 — Input registers

Each register: `Serviço` | `Frente` | `Localização` | `Período` | `Quantidade` | (`Esforço` where applicable) | `Documento/Medição` (traceability). Header formatted, blue values, no formulas.

```bash
officecli set "$FILE" '/Planejado/A1:G1' --prop fill=1F3864 --prop font.color=FFFFFF --prop font.bold=true
officecli set "$FILE" /Planejado/A2 --prop value="Servico" --prop font.bold=true
officecli set "$FILE" /Planejado/B2 --prop value="Frente"  --prop font.bold=true
```

### Phase 5 — Comparison view (Controle de Producao)

One row per service×front×location (composite key built from the registers). Formula columns:

```bash
# P = Planejado qty (SUMIFS by service+frente+localizacao), E = Executado qty, F = Esforco
officecli set "$FILE" '/Controle de Producao/D2' --prop 'formula==IF($A2="","",SUMIFS(Planejado!$E$2:$E$500,Planejado!$A$2:$A$500,$A2,Planejado!$B$2:$B$500,$B2,Planejado!$C$2:$C$500,$C2))'
officecli set "$FILE" '/Controle de Producao/E2' --prop 'formula==IF($A2="","",SUMIFS(Executado!$E$2:$E$500,Executado!$A$2:$A$500,$A2,Executado!$B$2:$B$500,$B2,Executado!$C$2:$C$500,$C2))'
officecli set "$FILE" '/Controle de Producao/F2' --prop 'formula==IF($A2="","",SUMIFS(Esforco!$E$2:$E$500,Esforco!$A$2:$A$500,$A2,Esforco!$B$2:$B$500,$B2,Esforco!$C$2:$C$500,$C2))'
# Saldo, Avanco, Produtividade, Desempenho (all guarded):
officecli set "$FILE" '/Controle de Producao/G2' --prop 'formula==IF(OR($D2="",$E2=""),"",$D2-$E2)'
officecli set "$FILE" '/Controle de Producao/H2' --prop 'formula==IF($D2=0,"n/a",$E2/$D2)' --prop numFmt='0.0%'
officecli set "$FILE" '/Controle de Producao/I2' --prop 'formula==IF(OR($F2=0,$F2=""),"n/a",$E2/$F2)' --prop numFmt='0.00" "0"0.00"'   # per convention; adjust unit
officecli set "$FILE" '/Controle de Producao/J2' --prop 'formula==IF(OR($I2="n/a",Config!$B$4=0),"n/a",$I2/Config!$B$4)' --prop numFmt='0.0%'
```

**Productivity guard is double:** the formula returns `"n/a"` when effort is missing AND the cell should be reported NOT VERIFIED in the QA note. If a user later supplies effort, the cells compute — nothing guessed.

### Phase 6 — Rollups & Summary

```bash
# By front (Q=Executado sum, P=Planejado sum, then progress formula)
officecli set "$FILE" /Rollup/C5 --prop 'formula==SUMIFS("Controle de Producao"!$E$2:$E$500,"Controle de Producao"!$B$2:$B$500,$A5)'
officecli set "$FILE" /Rollup/D5 --prop 'formula==SUMIFS("Controle de Producao"!$D$2:$D$500,"Controle de Producao"!$B$2:$B$500,$A5)'
officecli set "$FILE" /Rollup/E5 --prop 'formula==IF($D5=0,"n/a",$C5/$D5)' --prop numFmt='0.0%'
```

Summary: overall progress (Σ executada / Σ planejada, guarded), saldo total, worst-performing front (formula with `MIN`/`INDEX(MATCH)` — or a simple sorted rollup), productivity trend over periods (line chart from Rollup when ≥ 6 periods). All formulas.

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Run the inherited cycle (error sweep, validate, HTML preview) AND the production-specific gates:

**Gate PC-1 — Zero invented productivity.** Every productivity/desempenho cell is either a formula over inputs or `"n/a"`. No cell contains a typed number that looks like a productivity index:

```bash
Bad=$(officecli query "$FILE" 'cell[type=Number]' --json \
  | jq '[.data.results[] | select(.format.formula == null) | select(.path | test("/(Controle de Producao|Rollup|Summary)/")) | select(.path | test(":[G-J]"))] | length')
[ "$Bad" -eq 0 ] && echo "Gate PC-1 OK (no hardcoded computed cells)" || { echo "REJECT Gate PC-1: $Bad hardcoded"; exit 1; }
```

**Gate PC-2 — No reference index without a source.** If Config holds a reference productivity, it carries a source note (history/contract). No source → mark PENDING and DO NOT use it in desempenho formulas (reference cell is blank until sourced). Verify the note cell is non-empty.

**Gate PC-3 — Progress guard.** No `#DIV/0!` anywhere (every division guarded). `query 'cell:contains("#DIV/0!")'` == 0. If any `#DIV/0!` exists, the unguarded formula must be fixed.

**Gate PC-4 — Traceability.** Every line in the comparison view traces to a register row (spot-check 3 via `get --json` formula inspection — each formula references Planejado/Executado/Esforco). Registers contain zero formulas (they are inputs).

**Gate PC-5 — Totals reconcile.** Σ register quantities = Σ comparison-view quantities per dimension (three-way spot-check of cachedValues). Drift = reject.

**Gate PC-6 — Visual floor (mandatory).** `officecli view "$FILE" html` — no `###`, no truncated service/front labels, progress/colors render, headers formatted, summary readable. REJECT on any defect.

If anything fails, fix at source and re-run the full cycle.

## Honest limits

- Productivity without effort data is structurally impossible to compute — the workbook says `"n/a"` and the QA note says NOT VERIFIED. That is a capability limit, not a shortcut to fill.
- Quantity rollups trust the measurement registers; measurement quality is a site-data problem, not a workbook problem (spreadsheet-audit can verify register integrity).
- Reference productivity benchmarks are business data — the skill cannot know them; it only ever asks for them explicitly.
- Cache-drift: after feeding new measurement data, re-issue downstream formulas or close+reopen so rollups carry fresh cachedValues (→ officecli-xlsx cache-drift).

## Reference

- Engine: `officecli-xlsx`; EAP/progress weighting: `construction-planning`; deviations/rollups: `construction-cost-control`.
- Schedule link: `cpm-scheduling` / `gantt`; output boards: `dashboard-design`; final status: `delivery-gate`.
