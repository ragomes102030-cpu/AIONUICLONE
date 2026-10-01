---
name: construction-cost-control
description: "Use this skill to build construction cost-control workbooks in Excel — budget (orcamento), planned costs, actual costs, committed costs, balance (saldo), deviations (desvios), variations (variacoes), and integration with EAP/services when provided. Trigger on: 'controle de custos', 'cost control', 'orcamento de obra', 'custos previstos', 'custos realizados', 'custos comprometidos', 'saldo de custo', 'desvios', 'variacoes de custo', 'budget vs actual costs', 'committed costs', 'cost variance analysis', 'integracao EAP custos', 'medicao de obra custos'. Output is a formula-driven .xlsx where every cost figure traces to an input or an upstream cost sheet — never invented. Scene-layer on officecli-xlsx / construction-planning / financial-modeling: inherits every xlsx hard rule; reuses the EAP structure from construction-planning when provided and the Real x Orcado variance engine from financial-modeling. DO NOT invoke for: full financial modeling / DRE / cash flow (use financial-modeling), quantity/progress tracking (use production-control), or planning/scheduling (use construction-planning)."
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

# Construction Cost Control (scene-layer on officecli-xlsx)

Cost control answers one question per cost line: **how much did we plan, how much have we committed, how much have we actually spent, and what is left?** The deliverable is a workbook where every cost figure is either a user input (budget, invoices, commitments) or a formula over those inputs — and where deviations are computed, never typed.

This skill adds the construction cost-control domain structure on top of `officecli-xlsx` (engine mechanics) reusing the EAP structure from `construction-planning` (when the user provides it or asks to create it) and the Real × Orçado variance engine from `financial-modeling`. Everything about cells, formulas, batch JSON, validate, and number formats comes from those — not re-taught here.

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
officecli help xlsx validation               # dropdowns for cost category
officecli help xlsx conditionalformatting    # CF for deviation signals
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx.** Read `officecli-xlsx` first (engine rules, shell, batch JSON, validate, cache-drift). Reuse the EAP tree and EAP code conventions from `construction-planning` when the user provides an EAP (or asks to build one first) — cost lines attach to EAP/serviço codes. Reuse the Real × Orçado engine from `financial-modeling` (Orçado / Realizado / Variação / % formulas).

**Cost-control-specific core rule (verbatim):**

- **Não inventar dados.** Budget figures, invoice amounts, commitment values, currency, and dates are inputs from the user/data — never fabricated to "balance" a sheet.
- **Não inventar regras de negócio.** What counts as committed (contract signed? PO issued? medição aprovada?) is the user's convention, defined once in a Config/legend area, then applied consistently. Never choose a convention silently.
- **Não hardcodar valores calculados.** Saldo = Previsto − Realizado (or Previsto − Comprometido − Realizado) is a formula, always.
- **Não criar fontes de verdade duplicadas.** One budget sheet, one actuals sheet, one commitments sheet. Rollups reference them. Never two competing "Total Orçamento" cells.
- **Não acoplar nenhuma Skill ao ARES ou a uma obra específica.** The workbook is generic: obra name, currency, cost categories, EAP codes all live in Config/data cells. The same template serves any obra.

## Core Principles

1. **The five cost states.** Each cost line can carry up to five values, and the workbook must distinguish them clearly (columns, never merged):
   - **Previsto / Orçado** (budget) — input, the approved plan.
   - **Comprometido** (committed) — input, contracts/POs issued.
   - **Realizado** (actual) — input, invoiced/paid/measured.
   - **Saldo** = Previsto − Realizado (or Previsto − Comprometido − Realizado, per the user's convention) — formula.
   - **Desvio / Variação** = (Realizado + Comprometido) − Previsto, or Realizado − Previsto (per convention) — formula, with % variant guarded against zero.
2. **Rollups follow the EAP.** When an EAP is present, cost rollups aggregate by disciplina → pacote → serviço exactly like progress rollups in construction-planning. No EAP → a flat cost register with categories (Config-driven) and `SUMIFS` rollups by category.
3. **Commitments and actuals are separate sources of truth.** Never fold committed into realized. The user chooses the saldo convention once; the formulas apply it everywhere.
4. **Deviations are colored, not narrated.** CF (iconset or formulas) flags overrun vs underrun vs on-track per the tolerance defined in Config — tolerance is a parameter, never a literal.
5. **Traceability to the cent.** Every rollup cell has a defensible chain: rollup → line items → input sheets. Hardcoded adjustments are FORBIDDEN (Gate CC-2 checks).

## Workflow

### Phase 1 — Intake

Get from the user/leader:
- Which cost structure: with EAP (reference the EAP from construction-planning) or flat register by category?
- The saldo convention: Previsto − Realizado, or Previsto − (Comprometido + Realizado)?
- Currency, and whether values are stored in thousands.
- Source sheets/files for: budget (Orçado), commitments (Comprometido), actuals (Realizado) — who exports what.
- Cost categories or EAP disciplines list.

Missing items → PENDING on the Config sheet; never invent budget or actuals.

### Phase 2 — Workbook skeleton

```bash
FILE=custos.xlsx
officecli create "$FILE"
officecli open "$FILE"
for S in Config Orcado Comprometido Realizado 'Registro de Custos' Rollup Summary; do
  officecli add "$FILE" / --type sheet --prop name="$S"
done
officecli close "$FILE"
```

Sheet roles:
- **Config** — parameters: currency, saldo convention, tolerance, cost categories (blue inputs).
- **Orcado** — budget source of truth (one row per EAP/serviço or per category; values are inputs).
- **Comprometido** — commitments source of truth (contract/PO register: line, valor, data, EAP link).
- **Realizado** — actuals source of truth (invoice/medicação register: line, valor, data, EAP link).
- **Registro de Custos** — the per-line comparison view (one row per EAP/serviço or category, pulling from the three sources via SUMIFS).
- **Rollup** — by-disciplina / by-category totals (formulas).
- **Summary** — headline KPIs: Total Orçado, Total Comprometido, Total Realizado, Saldo, Desvio %, plus optional chart.

### Phase 3 — Config sheet

```bash
officecli set "$FILE" /Config/B2 --prop value="BRL" --prop font.color=0000FF
officecli set "$FILE" /Config/B3 --prop value="Previsto - Realizado" --prop font.color=0000FF      # saldo convention (text, documented)
officecli set "$FILE" /Config/B4 --prop value=0.05 --prop numFmt='0.0%' --prop font.color=0000FF      # deviation tolerance
officecli set "$FILE" /Config/B5 --prop value="Servicos;Materiais;Equipamentos;MO" --prop font.color=0000FF  # categories (if no EAP)
```

### Phase 4 — Source sheets (Orçado / Comprometido / Realizado)

Each source sheet: columns `Código EAP` (or `Categoria`), `Descrição`, `Valor`, `Data` (for commitments/actuals), `Documento` (number — traceability). Header row formatted (→ xlsx visual floor). Values are blue inputs. No formulas required on these sheets (they ARE the inputs).

```bash
officecli set "$FILE" '/Orcado/A1:F1' --prop fill=1F3864 --prop font.color=FFFFFF --prop font.bold=true
officecli set "$FILE" /Orcado/B2 --prop value="Código EAP" --prop font.bold=true
officecli set "$FILE" /Orcado/C2 --prop value="Descricao" --prop font.bold=true
```
(Adjust columns to the register layout.)

### Phase 5 — Registro de Custos (comparison view)

One row per line item. Formula columns pull from sources by EAP code / category:

```bash
# P=Previsto (from Orcado by EAP code), Q=Comprometido, R=Realizado
officecli set "$FILE" '/Registro de Custos/D2' --prop 'formula==IF($A2="","",SUMIFS(Orcado!$C$2:$C$500,Orcado!$A$2:$A$500,$A2))'
officecli set "$FILE" '/Registro de Custos/E2' --prop 'formula==IF($A2="","",SUMIFS(Comprometido!$C$2:$C$500,Comprometido!$A$2:$A$500,$A2))'
officecli set "$FILE" '/Registro de Custos/F2' --prop 'formula==IF($A2="","",SUMIFS(Realizado!$C$2:$C$500,Realizado!$A$2:$A$500,$A2))'
# Saldo (per Config convention — here: Previsto - Realizado)
officecli set "$FILE" '/Registro de Custos/G2' --prop 'formula==IF($D2="","",$D2-$F2)'
# Desvio $ e %
officecli set "$FILE" '/Registro de Custos/H2' --prop 'formula==IF($D2="","",($F2+$E2-$D2))'
officecli set "$FILE" '/Registro de Custos/I2' --prop 'formula==IF($D2=0,"n/a",($F2+$E2-$D2)/$D2)' --prop numFmt='0.0%;[Red]-0.0%'
```

Copy the formulas down the register. CF: deviation highlight with tolerance from Config (`formulacf` with `$I2` against `Config!$B$4`), or `iconset` 3TrafficLights on the deviation column.

### Phase 6 — Rollups (by EAP disciplina or category)

```bash
# By category (when no EAP): totals per category from Registro:
officecli set "$FILE" /Rollup/B5 --prop 'formula==SUMIFS("Registro de Custos"!$H$2:$H$500,"Registro de Custos"!$B$2:$B$500,$A5)'
```
(With an EAP present, aggregate by disciplina code prefix per construction-planning EAP code conventions. All rollups = `SUMIFS` per discipline/category — formulas only.)

### Phase 7 — Summary & KPIs

Headline cells (all formulas): Total Previsto = `SUM(Orcado!valor)`; Total Comprometido; Total Realizado; Saldo total; Desvio % total (guarded). One chart when ≥ 10 lines: planned-vs-actual per category (column pairs) or commitment evolution over time (line). Chart sources = visible rollup cells (→ data-dashboard D-8).

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Run the inherited cycle (error sweep, validate, HTML preview) AND the cost-specific gates:

**Gate CC-1 — Zero hardcoded computed values.** Every Saldo / Desvio / % / rollup / total cell is a formula:

```bash
Hard=$(officecli query "$FILE" 'cell[type=Number]' --json \
  | jq '[.data.results[] | select(.format.formula == null) | select(.path | test("/(Registro de Custos|Rollup|Summary)/"))] | length')
[ "$Hard" -eq 0 ] && echo "Gate CC-1 OK (no hardcoded computed cells)" || { echo "REJECT Gate CC-1: $Hard hardcoded"; exit 1; }
```

**Gate CC-2 — Formula traceability.** Every formula in Registro/Rollup/Summary references an input sheet (Orcado/Comprometido/Realizado/Config) or an upstream row — never a literal currency amount:

```bash
Bad=$(officecli query "$FILE" 'cell:has(formula)' --json \
  | jq '[.data.results[] | select(.format.formula | test("Orcado|Comprometido|Realizado|Config|Registro|Rollup") | not)] | length')
[ "$Bad" -eq 0 ] && echo "Gate CC-2 OK (all computed cells trace to inputs)" || { echo "REJECT Gate CC-2: $Bad untraceable formulas"; exit 1; }
```

**Gate CC-3 — Source sheets are inputs only.** Orcado/Comprometido/Realizado contain NO formulas (they are data; formulas live in Registro/Rollup/Summary). A formula sneaking into a source sheet means a duplicate source of truth.

**Gate CC-4 — Saldo convention applied consistently.** Spot-check 3 lines: manually recompute Saldo per the Config convention from the three sources and confirm the workbook values match (via `get --json` cachedValues). Mismatch = reject.

**Gate CC-5 — Totals reconcile.** Σ Registro lines = Rollup totals = Summary totals for Previsto / Comprometido / Realizado (three-way check on cachedValues). Any drift = reject.

**Gate CC-6 — Visual floor (mandatory).** `officecli view "$FILE" html` — no `###` (currency columns wide enough), no truncated EAP codes, deviation colors render, Summary readable, headers formatted. REJECT on any defect.

If anything fails, fix at source and re-run the full cycle.

## Honest limits

- Cost values are as good as the inputs: garbage invoices → garbage rollups. The audit (spreadsheet-audit) can verify input integrity, not business truth.
- Multi-currency models need an explicit rate table (Config + per-line rate) — currency conversion is formula-driven, never eyeballed, and only when the user requires it.
- Commitment definitions vary by company (PO vs contract vs medição) — the workbook documents the convention used; it cannot know the "right" one without the user's rule.
- Cache-drift: after upstream edits (new invoices), re-issue downstream formulas or close+reopen so rollups carry fresh cachedValues (→ officecli-xlsx cache-drift).

## Reference

- Engine: `officecli-xlsx`; EAP structure: `construction-planning`; variance engine: `financial-modeling`.
- Quantities/progress: `production-control`; integrity of inputs: `spreadsheet-audit`; final status: `delivery-gate`.