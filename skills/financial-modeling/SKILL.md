---
name: financial-modeling
description: "Use this skill to build financial models in Excel for budgeting, revenue/expense tracking, cash flow, DRE (income statement), Real x Orcado (actual vs budget) variance analysis, forecast, projections, scenarios, and assumptions management. Trigger on: 'modelo financeiro', 'financial model', 'orcamento', 'budget', 'DRE', 'fluxo de caixa', 'cash flow', 'Real x Orcado', 'actual vs budget', 'forecast', 'projecao', 'cenarios', 'premissas', 'assumptions', 'variacoes', 'variance analysis', 'pro forma'. Output is a single formula-driven .xlsx with strict separation between input data, calculations, and presentation. Scene-layer on officecli-xlsx / officecli-financial-model: inherits every xlsx hard rule and the financial-model 4-color code, three-zone architecture, and Delivery Gates. DO NOT invoke for: a simple one-sheet expense tracker (use officecli-xlsx), a dashboard (use dashboard-design), construction cost control of a specific obra (use construction-cost-control)."
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

# Financial Modeling (scene-layer on officecli-financial-model)

A financial model is a **decision-grade, formula-driven layer**: every output traces an unbroken chain to blue-font assumptions, every statement balances, every forecast is re-auditable. This skill covers the modeling patterns most relevant to business/construction financials: budgeting, DRE, cash flow, actual-vs-budget, forecast, scenarios, and assumptions — on top of the mechanics already taught in `officecli-financial-model` (three-zone architecture, 4-color code, recipes for 3-statement / DCF / LBO, sensitivity grids, cache-drift discipline, circular-reference discipline).

**Everything about the engine — cells, formulas, batch JSON, shell quoting, validate, HTML preview, number formats, named ranges — comes from officecli-xlsx and officecli-financial-model and is not re-taught here.** This skill adds the _business-modeling discipline_: what to model, how to structure Real × Orçado, and the specific delivery gates those patterns require.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**When a prop name, enum value, or alias is uncertain, consult help before guessing.**

```bash
officecli help xlsx                          # element list
officecli help xlsx cell                     # cell props
officecli help xlsx chart                    # charts for outputs
officecli help xlsx validation               # dropdowns for scenario switch
officecli help xlsx namedrange               # named ranges
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx v2 + financial-model.** Read `officecli-xlsx` FIRST (engine rules), then `officecli-financial-model` (three-zone architecture, 4-color code, recipes, sensitivity/scenario protocols, Gates 1–6.1, circular-ref discipline, cache-drift, Known Issues). This skill assumes you know: `create`/`open`/`close`, `set` values/formulas, `batch` heredocs, `/SheetName/A1` paths, named ranges, cross-sheet `!` trap, `IFERROR` guards, and that **cross-sheet formulas go non-resident (single batch OR individual `set`), never batch-while-resident**.

**General rules that apply to every model** (verbatim, non-negotiable):

- **Não inventar dados.** Every number in the model is an input from the user/data or a formula over those inputs. No fabricated Revenues, no invented Costs, no invented growth rates.
- **Não inventar regras de negócio.** Tax rates, margins, payment terms, depreciation policies come from the user or stated, sourced assumptions — never invented silently.
- **Não hardcodar valores calculados.** All computed values are formulas (enforced by Gate 6). Hardcoded numbers only in the blue Assumptions zone.
- **Não criar fontes de verdade duplicadas.** One cell per assumption. Formulas reference that cell (or a named range pointing to it) everywhere. Never two competing "Tax Rate" cells.
- **Não ampliar o escopo.** If the user asks for a budget, do not silently add a full LBO. Propose additions, wait for approval.
- **Não afirmar que algo foi validado sem realmente validar.** Run the gates. State VERIFIED/NOT VERIFIED per check.
- **Separar dados de entrada, cálculos e apresentação.** Three zones. Non-negotiable.
- **Trabalhar de forma configurável.** Periods, currency, fiscal year start are configuration, not buried constants.

## Core Principles

1. **Three-zone architecture mandatory** (inherited from officecli-financial-model): **Inputs** (blue, `Assumptions`/`Inputs`/`Drivers` sheets) → **Calc** (black/green, `P&L`, `Cash Flow`, `DRE`, `Forecast`…) → **Outputs** (green, `Summary`, `Sensitivity`…). Name them, tab-color them (yellow `FFC000` / blue `4472C4` / green `70AD47`), enforce with the executable zone audit (→ financial-model §Three-zone architecture).
2. **Assumptions live in cells, never inside formulas.** `=B5*(1+Assumptions!GrowthRate)`, never `=B5*1.05`. ≥3-use assumptions get named ranges (`GrowthRate`, `TaxRate`, `NetMargin`).
3. **Statements balance.** DRE: NetIncome = Revenue − costs − taxes, eventually reconciling to retained earnings / cash. Cash flow: EndingCash = Opening + In − Out. Gate 4 fails on imbalance.
4. **Real × Orçado is a first-class pattern.** Each P&L-ish line carries Budget (Orçado), Actual (Realizado), and Variance (Real − Orçado) columns — variance is a formula, never an input (detailed below).
5. **Forecast is Actual YTD + Projected remaining.** Never a single invented number. Forecast = f(actuals to date, remaining-period projection from assumptions). Every forecast line is traceable to which part is realized vs projected.
6. **Scenarios are data, not separate files.** Base/Upside/Downside as columns or a dropdown + `INDEX/MATCH` switch (→ financial-model §Sensitivity & scenarios). One workbook, one switch.
7. **Cached values on valuation/output cells are load-bearing.** After the model chain, run a cache-refresh pass; verify every KPI/balance cell has a plausible cachedValue (→ financial-model Gate 5).
8. **Circularity only when justified.** Interest↔cash rings use `calc.iterate=true`; accidental circularity is broken algebra (→ financial-model §Circular references).

## Workflow

### Phase 1 — Intake & scope

Get from the user (or the leader agent):

- Model purpose (budget, DRE tracking, cash-flow projection, what-if scenarios, forecast…).
- Period structure (monthly? quarterly? which years; fiscal-year start).
- Currency, tax rate, and any regulatory/business conventions.
- Source of actuals (which workbook/sheet/file has the Realizado data).
- Horizon of the forecast and the projection assumptions.

Anything missing → state it as **PENDING** in the assumptions sheet and ask. Never proceed with invented tax rates or growth figures.

### Phase 2 — Workbook skeleton

```bash
FILE=model.xlsx
officecli create "$FILE"
officecli open "$FILE"
officecli add "$FILE" / --type sheet --prop name=Assumptions --prop tabColor=FFC000
officecli add "$FILE" / --type sheet --prop name=DRE        --prop tabColor=4472C4
officecli add "$FILE" / --type sheet --prop name='Cash Flow' --prop tabColor=4472C4
officecli add "$FILE" / --type sheet --prop name=Forecast   --prop tabColor=4472C4
officecli add "$FILE" / --type sheet --prop name=Summary    --prop tabColor=70AD47
officecli close "$FILE"
```

(Add a `P&L` sheet when the user's business needs a full income statement beyond DRE. Follow the naming conventions from financial-model.)

### Phase 3 — Assumptions sheet (blue zone)

Rows = every driver: revenue growth, unit prices, quantities, cost ratios, tax rate, payment terms (days receivable/payable), working-capital days, depreciation years, discount rates. Years across columns (B:E). Blue font on every assumption cell. Yellow-fill (`FFFF00`) the 3–5 scenario-switched drivers. Declare ≥3-use drivers as named ranges:

```bash
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"GrowthRate","ref":"Assumptions!$B$5"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"TaxRate","ref":"Assumptions!$B$8"}},
  {"command":"add","parent":"/","type":"namedrange","props":{"name":"NetMargin","ref":"Assumptions!$B$11"}}
]
EOF
```

**Scenario columns.** When the user wants scenarios: C:E hold Base/Upside/Downside (all blue), and a `Summary` dropdown drives the active scenario (→ financial-model §Dropdown scenario switch `INDEX/MATCH`).

### Phase 4 — Real × Orçado engine (budget-tracking models)

A Real × Orçado structure has, per income/expense line per period:

- **Orçado (Budget)**: input (blue) — the approved plan, or a formula seeding from a Budget sheet.
- **Realizado (Actual)**: input (blue) — imported from actuals data (simplest: an `Actuals` sheet with the raw data + `SUMIFS` rollups, then line cells reference the rollup).
- **Variação (Variance)** = `Real − Orçado` (formula, black) and/or `%= IF(Orçado=0, "n/a", (Real−Orçado)/Orçado)`.
- **% Cumprimento** = `IF(Orçado=0, "n/a", Real/Orçado)` with `numFmt='0.0%'`.
- **Semáforo** (optional CF): `iconset` 3TrafficLights or `formulacf` — green when |variance%| within tolerance, red beyond. Tolerance is an Assumptions cell, never a literal.

```bash
# Variance formula pattern (C=Orçado, D=Realizado, E=Variação $, F=Variação %)
cat <<'EOF' | officecli batch "$FILE"
[
  {"command":"set","path":"/DRE/E10","props":{"formula":"D10-C10","numberformat":"$#,##0;($#,##0);\"-\""}},
  {"command":"set","path":"/DRE/F10","props":{"formula":"IF(C10=0,\"n/a\",(D10-C10)/C10)","numberformat":"0.0%;[Red]-0.0%\"\""}},
  {"command":"set","path":"/DRE/G10","props":{"formula":"IF(C10=0,\"n/a\",D10/C10)","numberformat":"0.0%"}}
]
EOF
```

**Never hardcode a Realizado cell.** If the actuals arrive as numbers, put them on an `Actuals` sheet (source of truth) and reference via `SUMIFS`/direct refs — the DRE line must be a formula. Verifiable: `query 'DRE!:has(formula)'` covers every Real/Variance/Total cell.

### Phase 5 — Cash flow (if in scope)

Structure: `Opening` → `Inflows` (receivables collection from Revenue by payment term) → `Outflows` (payments by term, CapEx, taxes) → `Ending`. Collection patterns are assumptions (days), applied via time-shift formulas. Ending cash roll-forward is a self-chain (→ financial-model Recipe A Step 5: `C17=B19`, `D17=C19`…). Reconcile to DRE: EndingCash from DRE NetIncome + non-cash + working-capital movements, checked by a reconciliation row (Gate 4).

### Phase 6 — Forecast (if in scope)

Forecast rows = **Realizado YTD (formula from Actuals) + Projeção restante (assumption-driven)**, per line:

- Realizado YTD = `SUMIFS(Actuals!amt, Actuals!period, "<= "&EOMONTH(TODAY(),0))` (or reference a rollup cell).
- Projected remaining = assumption (e.g., monthly run-rate × months left, or seasonality curve from an assumption row) — the run-rate / curve is an input, never invented.
- Apply the same Real × Orçado variance pattern against the annual Orçado for the Forecast variance (Forecast vs Orçado).

Tag each line with what is REALIZED vs PROJECTED (a `Type` column or comment) so the reader never mistakes a projection for an actual — rastreabilidade rule.

### Phase 7 — Sensitivity / scenarios (if asked)

- **Dropdown + `INDEX/MATCH`** for Base/Upside/Downside (preferred, single switch).
- **2-axis grid** (e.g., growth × margin) — one self-contained formula per cell, no Excel Data Tables (→ financial-model Recipe B Step 5).

### Phase 8 — Outputs & summary

`Summary` sheet with ≥4 formula-driven KPIs (Total Revenue, Net Margin, Ending Cash, Variance Δ) + 1–3 charts (Revenue & EBITDA column, margin trend line). Charts read from visible Summary cells (→ data-dashboard D-8). All KPIs formulas; green font convention.

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Inherit and run ALL gates from officecli-financial-model — Gates 1–3 (xlsx baseline), Gate 4 (statement integrity / balance checks), Gate 5 (cached-value sanity), Gate 6 (hardcode/zone audit + named-range dead-decoration audit), Gate 5b (HTML preview), Gate 6.1 (token sweep). Do NOT re-run them only in your head — run the commands.

Then run the financial-modeling-specific gates:

**Gate FM-1 — Real × Orçado coverage.** Every line that has an Orçado also has a Realizado, Variação $, Variação % cell — and every one is a formula:

```bash
ACTUAL_HARDCODE=$(officecli query "$FILE" 'cell[type=Number]' --json \
  | jq '[.data.results[] | select(.format.formula == null) | select(.path | test("/(DRE|P&L)/")) | select(.path | test(":[C-F]"))] | length')
[ "$ACTUAL_HARDCODE" -eq 0 ] && echo "Gate FM-1 OK (no hardcoded Real/Variance cells)" || { echo "REJECT Gate FM-1: $ACTUAL_HARDCODE hardcoded"; exit 1; }
```

**Gate FM-2 — No invented forecasts.** Every Forecast cell is either a formula referencing Actuals (realized part) or a formula referencing a stated projection assumption (projected part). Query all Forecast formula cells and confirm each references `Actuals` or `Assumptions`:

```bash
UNTRACED=$(officecli query "$FILE" 'Forecast!:has(formula)' --json \
  | jq '[.data.results[] | select(.format.formula | test("Actuals|Assumptions|Forecast!") | not)] | length')
[ "$UNTRACED" -eq 0 ] && echo "Gate FM-2 OK (every forecast cell traced)" || { echo "REJECT Gate FM-2: $UNTRACED untraced"; exit 1; }
```

**Gate FM-3 — DRE → Cash reconciliation.** DRE NetIncome and CashFlow EndingCash reconcile (within tolerance, using an explicit reconciliation row or two-cell check). `IMBALANCED` anywhere = reject (→ financial-model Gate 4 pattern).

**Gate FM-4 — Assumptions completeness.** Every named range / driver used in Calc zone exists on the Assumptions sheet; zero literal rates/margins in Calc formulas:

```bash
LITERAL_RATES=$(officecli query "$FILE" 'cell:contains("1.05")' --json | jq '.data.results | length')
[ "$LITERAL_RATES" -eq 0 ] && echo "Gate FM-4 OK (no literal growth rates)" || { echo "REJECT Gate FM-4: $LITERAL_RATES literal rate(s)"; exit 1; }
```

(Adjust the literal string per the model's numbers. The principle: no assumption-looking constant inside Calc formulas.)

**Gate FM-5 — Cached-value sanity on all output cells.** Re-run the financial-model Gate 5 list (`/DRE/E10:F10`, `/Forecast/…`, `/Summary/*`) — every output must return non-null, non-`#OCLI_NOTEVAL!` cachedValue. If any fails: close residents, re-set, re-verify.

**Gate FM-6 — Visual floor (mandatory).** `officecli view "$FILE" html` — no `###`, no truncated labels, balance/recon rows read OK, charts render with data, percentages show as `%`. REJECT on any defect.

If anything fails, fix at source and re-run the full cycle.

## Honest limits

- `validate` catches schema, not finance errors (financial-model Honest limit — a model passes validate with a wrong hardcoded BS.Cash plug).
- `SUMPRODUCT` array-predicate may cache `0` in some build paths → `SUMIF`/helper-column pattern (→ data-dashboard D-17).
- Cached values lag live formulas in non-recalculating viewers — run the cache-refresh pass after any upstream edit (→ financial-model §Build-order & cache-drift).
- IRR/XIRR/NPV evaluate and cache correctly; only fall back to blue-font cached values with a comment when `#OCLI_NOTEVAL!` persists after re-set (→ financial-model §Financial function patterns).

## Reference

- Mechanics: `officecli-xlsx` (engine) → `officecli-financial-model` (financial recipes, zones, gates).
- Upstream data: `data-analysis` (clean/fill actuals), `spreadsheet-audit` (integrity of input files).
- Output: `dashboard-design` (present the Summary), `delivery-gate` (final status taxonomy).
- Construction-specific costing: `construction-cost-control`; planning: `construction-planning`.
