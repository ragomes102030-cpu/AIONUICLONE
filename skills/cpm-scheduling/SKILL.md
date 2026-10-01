---
name: cpm-scheduling
description: "Use this skill to build CPM/network scheduling workbooks in Excel — activities, predecessors, link types, durations, precedence network, cycle detection, early dates, late dates, floats, critical path, and calendar-aware date math. Trigger on: 'CPM', 'caminho crítico', 'critical path', 'rede de precedência', 'predecessoras', 'tipos de vínculo', 'datas cedo', 'datas tarde', 'folga', 'teia', 'network diagram schedule', 'forward pass', 'backward pass', 'schedule logic validation'. Output is a validated, formula-driven .xlsx network — validation runs BEFORE any visualization. Scene-layer on officecli-xlsx: inherits every xlsx hard rule. DO NOT invoke for: building a visual Gantt directly (use gantt — it expects a validated network), construction planning structure/EAP (use construction-planning), or production quantities (use production-control)."
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

# CPM Scheduling (scene-layer on officecli-xlsx)

A CPM schedule is a **validated precedence network, then a computed time model**: activities linked by predecessor/successor logic, dates derived by forward pass (early dates) and backward pass (late dates), floats computed, and the critical path identified. The cardinal rule of this skill: **validate the network BEFORE generating any visualization.** A Gantt built from an invalid network (a cycle, a missing predecessor, a predecessor that does not exist) is a beautiful picture of a wrong schedule.

This skill is the network-logic layer. The visual layer (`gantt`) and the construction-domain layer (`construction-planning`) build on it. Engine mechanics come from `officecli-xlsx`.

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
officecli help xlsx conditionalformatting    # CF to highlight critical path
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx.** Read `officecli-xlsx` first (engine rules, shell, batch JSON, validate, cache-drift). This skill adds the network-logic layer: activity register, link definitions, validation, forward/backward pass, floats, and critical path. Visual output belongs to `gantt` (but ONLY after THIS skill's validation passes).

**Core rules (verbatim, non-negotiable):**

- **Não inventar dados.** Durations, dates, links, calendars are user inputs or formula results — never invented to close a gap.
- **Não inventar regras de negócio.** The choice of link types (FS/SS/FF/SF), lags, and the definition of "working day" come from the user or stated conventions.
- **Não hardcodar valores calculados.** Early/late dates, floats, and critical flags are computed (formulas or solver/engine results), never typed.
- **Não afirmar que algo foi validado sem realmente validar.** The network validation (cycles, missing predecessors, owners) is an EXECUTED check with query evidence — never a claim.
- **Trabalhar de forma configurável.** Calendar (working days, holidays) is configuration; dates resolve against it.

## Core Principles

1. **Network first, numbers second.** Build Activities + Links, run validation, THEN compute dates and floats. A schedule with dates before validation is a guess with numbers.
2. **Validation is executable and mandatory.** Four checks, each a query with a pass/fail result:
   - **Cycle detection:** no activity depends (transitively) on itself. Detectable via a self-referencing chain probe (see Phase 3) — a cycle makes forward/backward pass infinite.
   - **Predecessor existence:** every predecessor ID in the Predecessors column exists in the Activities register.
   - **Self-reference:** no activity lists itself as predecessor.
   - **Link type validity:** link types are from the closed set {FS, SS, FF, SF} (optionally with ±lag); anything else is invalid.
3. **Forward/backward pass discipline.** Early dates come from a forward pass (start = max of predecessors' early finish + link lag, or project start); late dates from a backward pass (finish = min of successors' late start − lag, or project end). Floats = late − early. Critical = float ~ 0 (tolerance from Config).
4. **The critical path is computed, not narrated.** A `Crítico?` column (formula) flags float ≈ 0. The path is never hand-marked.
5. **Calendar-aware math.** Durations and lags resolve in working days when the user's calendar applies (via a calendar reference / `NETWORKDAYS`-style helper — see construction-planning §Calendar for the deterministic engine-safe pattern).
6. **Data in cells, logic in formulas.** Activity IDs, durations, and links are data. Float, early/late dates, and critical flags are formulas. Link type/lag live in a parseable cell, not prose.

## Workflow

### Phase 1 — Intake

Get from the user/leader:
- Activity list (ID, name, duration, calendar) — or the EAP/service structure from construction-planning.
- Predecessor/link list (ID, predecessor, link type, lag) — or the raw data to parse.
- Project start date, project end/constraint (if any).
- Calendar: working days, holidays (→ construction-planning §Calendar).
- Whether durations are working or calendar days.
- Float tolerance for "critical" (default 0, configurable — e.g. ≤ 1 day).

Missing → PENDING; never invent durations or links.

### Phase 2 — Workbook skeleton

```bash
FILE=cpm.xlsx
officecli create "$FILE"
officecli open "$FILE"
for S in Config Calendario Atividades Validacao 'Datas CPM' CriticalPath Summary; do
  officecli add "$FILE" / --type sheet --prop name="$S"
done
officecli close "$FILE"
```

Sheet roles:
- **Config** — project start/end, float tolerance, duration unit, calendar reference (blue inputs).
- **Calendario** — working-day calendar (per construction-planning).
- **Atividades** — activity register: ID, name, duration, calendar (inputs).
- **Validacao** — the four validation checks (formulas + a PASS/FAIL verdict).
- **Datas CPM** — computed layer: early/late dates, floats, critical flags (formula-driven, built from Atividades + links).
- **CriticalPath** — the critical path listing (filtered view) + optional summary.
- **Summary** — project duration, critical count, validation verdict.

### Phase 3 — Activities + Links matrix

**Atividades** columns: `ID` | `Nome` | `Duração` | `Calendário` | `Start constraint` (optional input; usually empty).

Predecessors as a parseable column on Atividades: `Predecessoras` (e.g. `"A-100 FS+2d;A-102 SS"`). Parsing happens via helper columns (FORMULATEXT-free, deterministic):

```bash
# Helper: first predecessor ID (SPLIT not guaranteed — use SEARCH/LEFT/MID parsing per convention).
# Simplest robust convention: one predecessor per ROW in a Links table instead of a delimited cell.
```

**Preferred: a dedicated `Links` table** (one link per row) — columns: `Atividade ID` | `Predecessor ID` | `Tipo` (FS/SS/FF/SF) | `Lag` (days, signed). A row-per-link table is deterministic, queryable, and validation-friendly — use it unless the user's data is already a delimited field (then parse with helper columns and validate aggressively).

```bash
# Links table (rows):
officecli set "$FILE" /Links/A2 --prop value="A-100"
officecli set "$FILE" /Links/B2 --prop value="A-098"
officecli set "$FILE" /Links/C2 --prop value="FS"
officecli set "$FILE" /Links/D2 --prop value=2
```

### Phase 4 — Validation (MANDATORY, before any date math or chart)

On the `Validacao` sheet, four checks + a verdict:

**V1 — Predecessor existence.** Formula-based probe: count Links whose predecessor ID is not in Atividades:

```bash
# COUNTIFS of links whose Predecessor ID has 0 matches in Atividades:
officecli set "$FILE" /Validacao/B2 --prop 'formula==SUMPRODUCT(--(COUNTIF(Atividades!$A$2:$A$500,Links!$B$2:$B$400)=0))'
officecli set "$FILE" /Validacao/C2 --prop 'formula==IF(B2=0,"PASS","FAIL: "&B2&" missing predecessor(s)")'
```

**V2 — Self-reference.** Count links where Atividade ID = Predecessor ID:

```bash
officecli set "$FILE" /Validacao/B3 --prop 'formula==SUMPRODUCT(--(Links!$A$2:$A$400=Links!$B$2:$B$400))'
officecli set "$FILE" /Validacao/C3 --prop 'formula==IF(B3=0,"PASS","FAIL: "&B3&" self-reference(s)")'
```

**V3 — Link type validity.** Count invalid link types (not in {FS,SS,FF,SF}):

```bash
officecli set "$FILE" /Validacao/B4 --prop 'formula==SUMPRODUCT(--(ISNA(MATCH(Links!$C$2:$C$400,{"FS","SS","FF","SF"},0))))'
officecli set "$FILE" /Validacao/C4 --prop 'formula==IF(B4=0,"PASS","FAIL: "&B4&" invalid link type(s)")'
```

**V4 — Cycle detection.** The reliable worksheet probe: every activity's transitive predecessor chain must not include itself. Without iterative helpers, implement the check as: **for each activity, walk predecessors one level and confirm the ID is not in its own (recursive) predecessor set** — practical worksheet approach: a helper column `Predecessor de 2o nivel` (COUNTIF over the Links-predecessors-of-predecessors, resolved via a chain table), plus a manual audit for deep cycles. **When a cycle is suspected or cannot be excluded by workbook math, STOP and flag it** — do not compute dates, do not visualize. Report the candidate cycle activities to the user for resolution.

```bash
# One-level cycle evidence: activities whose predecessor's predecessor includes them — 
# resolve via a chain helper table (Predecessor-of-Predecessor) and COUNTIF. 
# If the chain table cannot be built reliably, mark V4 = NOT VERIFIED (never PASS by assumption).
```

**Verdict cell** (everything must pass):

```bash
officecli set "$FILE" /Validacao/E2 --prop 'formula==IF(AND(C2="PASS",C3="PASS",C4="PASS",C5="PASS"),"NETWORK VALID","NETWORK INVALID")'
```

**Rule: if E2 ≠ "NETWORK VALID", STOP.** No date math, no Gantt, no critical path. Fix the network first (user data corrections), re-run validation.

### Phase 5 — Forward/backward pass (dates + floats + critical)

On `Datas CPM`, one row per activity. Columns: `ID` | `Duração` | `ES (Early Start)` | `EF (Early Finish)` | `LS (Late Start)` | `LF (Late Finish)` | `Folga` | `Crítico?`.

**Forward pass (ES/EF)** — formula per activity referencing the pred-maximum logic via helper columns:

```bash
# ES = max(EF of all predecessors + lag) [or constraint], in working days via calendar;
# simplest deterministic form: ES = MAX of predecessor finishes + lag, resolved via
# MAXIFS over a predecessor-finish table (Links join). Fallback when engine lacks array support:
# a helper table PredecessorEF (per link: predecessor ID -> its EF), then per activity:
officecli set "$FILE" '/Datas CPM/E2' --prop 'formula==IF(COUNTIF(Links!$A$2:$A$400,$A2)=0,Config!$B$2,MAXIFS(predecessorEF!$C:$C,predecessorEF!$A:$A,Links!$B$2:Links!$B$400)+MAXIFS(Links!$D$2:$D$400,Links!$A$2:$A$400,$A2))'
# EF = ES + Duration - 1 (working/calendar per Config)
officecli set "$FILE" '/Datas CPM/F2' --prop 'formula==IF($E2="","",$E2+$B2-1)'
```

**Backward pass (LS/LF)** — start from project end (or the max EF), walk successors:

```bash
# LF = MIN of successor LS - lag, or project end when no successors:
officecli set "$FILE" '/Datas CPM/H2' --prop 'formula==IF(COUNTIF(Links!$A$2:$A$400,$A2)=0,Config!$B$3,MINIFS(successorLS!$C:$C,successorLS!$A:$A,Links!$B$2:Links!$B$400)-MAXIFS(Links!$D$2:$D$400,Links!$A$2:$A$400,$A2))'
# LS = LF - Duration + 1
officecli set "$FILE" '/Datas CPM/G2' --prop 'formula==IF($H2="","",$H2-$B2+1)'
```

**Folga = LS − ES (or LF − EF — same number):**

```bash
officecli set "$FILE" '/Datas CPM/I2' --prop 'formula==IF(OR($G2="",$E2=""),"",$G2-$E2)' --prop numFmt='0 "d"'
```

**Crítico? = |folga| ≤ tolerance (Config):**

```bash
officecli set "$FILE" '/Datas CPM/J2' --prop 'formula==IF($I2="","",IF(ABS($I2)<=Config!$B$5,"CRITICO",""))'
```

CF: red fill on Cri/`CRITICO` rows (`formulacf` on the row range per `$J2="CRITICO"`). Predecessor-finish / successor-start helper tables are built from the Links table with `SUMIFS`-compatible joins — verify cached values after building (cache-drift → re-set downstream).

### Phase 6 — Critical path + summary

- **CriticalPath** sheet: filter rows where `CRITICO` (via helper `=IF(Datas CPM!J2="CRITICO",1,"")` + AutoFilter, or a formula-driven slice). List IDs in path order (sort by ES).
- **Summary**: project duration = MAX(EF) − MIN(ES) + 1; critical activities count; validation verdict cell linked to Validacao!E2. All formulas.

### Phase 7 — Hand off to visualization

ONLY after Validacao!E2 = "NETWORK VALID": pass the network to `gantt` (baseline/atual bars, dependencies, critical highlight). See gantt skill for the mechanics. **Do not skip the gate.**

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Run the inherited cycle (error sweep, validate, HTML preview) AND the CPM gates:

**Gate CPM-1 — Validation verdict = NETWORK VALID.** Read `Validacao!E2` cachedValue (`get --json | jq '.data.results[0].format.cachedValue'`). Anything else → REJECT. This is the cardinal gate.

**Gate CPM-2 — All four checks executed and passed.** V1..V3 must read PASS (evidence = the verdict cell + each check cell). V4 (cycles) is PASS **only if actually executed**; if the cycle probe could not be run, V4 = NOT VERIFIED and the network is TRUST-WITH-CAVEATS — never silently PASS.

**Gate CPM-3 — No invented dates.** Every ES/EF/LS/LF/Folga/Crítico cell in Datas CPM is a formula (`query 'Datas CPM!:has(formula)'` count == planned row count). Zero hardcoded dates.

```bash
Hard=$(officecli query "$FILE" 'cell[type=Number]' --json \
  | jq '[.data.results[] | select(.format.formula == null) | select(.path | test("/Datas CPM/"))] | length')
[ "$Hard" -eq 0 ] && echo "Gate CPM-3 OK" || { echo "REJECT Gate CPM-3: $Hard hardcoded"; exit 1; }
```

**Gate CPM-4 — Float consistency.** Every activity: LS − ES == LF − EF (mathematical identity). Spot-check 3 rows via `get --json` cachedValues; mismatch = reject.

**Gate CPM-5 — Critical path is non-empty and consistent.** At least one `CRITICO` row when the network has ≥ 2 activities; critical duration (Σ durations along path) == project duration. No path = reject.

**Gate CPM-6 — Error sweep + visual floor.** Zero `#REF!`/`#VALUE!`/`#DIV/0!` (full sweep). `officecli view "$FILE" html` — no `###`, no truncated IDs, CF highlights visible. REJECT on any defect.

If anything fails, fix at source and re-run the full cycle (validation → dates → visuals, in that order).

## Honest limits

- Worksheet-based CPM (formulas/helper tables) handles typical project sizes (≤ a few hundred activities). Very large networks with deep dependency chains are better served by dedicated scheduling tools — say so instead of stretching the workbook.
- Cycle detection beyond one level relies on helper-chain tables; a deep cycle may need a scripted check. When not executable in-workbook, mark NOT VERIFIED and flag — never assume.
- Date math depends on the engine's supported functions — verify `MAXIFS`/`MINIFS`/`NETWORKDAYS` cached values after building; fall back to helper-table COUNTIFS patterns from construction-planning §Calendar when needed.
- The schedule is as good as the input logic: durations and links are engineering inputs; this skill validates structure, not business truth.

## Reference

- Engine: `officecli-xlsx`; calendar pattern: `construction-planning`; visuals: `gantt`; production link: `production-control`.
- Final status: `delivery-gate` (CREATED/MODIFIED/VERIFIED/NOT VERIFIED/PENDING/ISSUES).