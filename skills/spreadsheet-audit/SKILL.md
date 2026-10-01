---
name: spreadsheet-audit
description: "Use this skill to audit the structural and logical integrity of an existing Excel workbook before trusting, editing, or delivering it. Trigger on: 'audit', 'auditar', 'revisar workbook', 'verify workbook integrity', 'find formula errors', 'checar referências', 'fontes de verdade', 'células hardcoded', 'riscos estruturais', 'inspect workbook', 'workbook health check'. Verifies sheets, tables, ranges, formulas, references, dependencies, inconsistent formulas, hardcoded calculated cells, formula errors (#REF!, #VALUE!, #DIV/0!, #NAME?, #N/A), duplicate sources of truth, and structural risks. Output is an evidence-backed audit report, not a modified file. Scene-layer on officecli-xlsx: inherits every xlsx hard rule. DO NOT invoke for: creating a new workbook (use officecli-xlsx), financial modeling (use financial-modeling), dashboard creation (use dashboard-design), or data cleaning (use data-analysis)."
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

# Spreadsheet Audit (scene-layer on officecli-xlsx)

An audit answers one question: **can this workbook be trusted as-is?** It is a read-only inspection that produces an evidence-backed report. You do NOT fix what you find in this pass — you document it with severity, location, and proof. Fixing is a follow-up task that happens after the report is reviewed (usually via a dedicated edit request, not inside the audit).

Everything about the xlsx engine — cells, formulas, query syntax, batch JSON, validate, HTML preview — comes from `officecli-xlsx` and is not re-taught here.

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
officecli help xlsx sheet                    # sheet-level queries
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

This skill **inherits every xlsx hard rule** from `officecli-xlsx` — shell quoting, zero formula errors, batch JSON shape (`{"command":"set"|"add","path":...,"props":{...}}` — key is `command`, NOT `action`), `validate` discipline, `view`/`get`/`query` read patterns. Read officecli-xlsx first; honour those rules, do not re-teach them here.

**Audit ≠ repair.** The audit deliverable is a report. If the user asks to fix the findings in the same request, still run the full audit first, present the findings, and only then apply minimal fixes with express approval — never "fix while auditing".

**General rules that apply to every audit** (verbatim, non-negotiable):

- **Não inventar dados.** Never fabricate a finding; every finding needs a real cell, range, sheet, or formula as evidence.
- **Não inventar regras de negócio.** Do not label something "wrong" based on a business assumption you invented. If you believe a formula is inconsistent with an intent, state the *observed inconsistency* and mark the *inferred intent* as an assumption to confirm.
- **Não afirmar que algo foi validado sem realmente validar.** A check you did not run is a check you did NOT run. Split VERIFIED from NOT VERIFIED explicitly in the report.
- **Priorizar rastreabilidade.** Every finding cites sheet + cell/range + the exact command that produced the evidence.
- **Registrar limitações.** If a check could not be executed (permissions, resident lock, renderer), record it as NOT VERIFIED, never skip it silently.

## Core Principles

1. **Evidence-first.** Every finding must be reproducible: cite the file, the sheet, the cell/range, and the query command + output excerpt that revealed it. A finding without evidence is not a finding — it is a guess.
2. **Read-only by default.** The audit opens the file (`officecli open`), inspects, and closes. It does NOT write cells/formulas/charts. If you need a working copy to test something, copy the file to a temp path and work there (`$env:TEMP` on Windows).
3. **Verify before you trust.** Errors are checked by direct query, not by visual memory. `validate` catches schema problems; it does NOT catch `#REF!` in a cell, a hardcoded subtotal, or two sheets that disagree.
4. **Severity is explicit.** Classify each finding: **BLOCKER** (will produce wrong numbers to a reader), **MAJOR** (high risk of wrong numbers or broken structure), **MINOR** (quality / consistency), **INFO** (observation, no action required). Never blur the categories.
5. **Do not expand scope.** The audit covers what the user asked to audit. If you discover a second area with problems, mention it in the report as a recommendation — do not audit it unprompted.

## Audit Workflow

Run the phases in order. Each phase produces a section of the report.

### Phase 1 — Inventory (structure map)

Open the file and map the structure before looking at any content.

```bash
FILE=target.xlsx
officecli open "$FILE"
officecli query "$FILE" sheet --json                # sheet list + order
officecli query "$FILE" namedrange --json           # named ranges
officecli query "$FILE" table --json                # Excel tables
officecli query "$FILE" chart --json                # charts per sheet
officecli query "$FILE" conditionalformatting --json # CF rules per sheet
officecli query "$FILE" validation --json           # data validations
officecli query "$FILE" comment --json              # comments
```

Record: sheet count and names, table count + ranges, chart count, CF count, validation count, named range count. This map drives every later query and is itself a finding source (e.g., 17 unnamed charts = MINOR structural risk).

### Phase 2 — Error sweep (formula errors)

Query the whole workbook for error values. This is the fastest way to find broken cells.

```bash
# Every error value the xlsx engine can render:
officecli query "$FILE" 'cell:contains("#REF!")'  --json | jq '.data.results | length'
officecli query "$FILE" 'cell:contains("#VALUE!")' --json | jq '.data.results | length'
officecli query "$FILE" 'cell:contains("#DIV/0!")' --json | jq '.data.results | length'
officecli query "$FILE" 'cell:contains("#NAME?")'  --json | jq '.data.results | length'
officecli query "$FILE" 'cell:contains("#N/A")'    --json | jq '.data.results | length'
officecli query "$FILE" 'cell:contains("#NULL!")'  --json | jq '.data.results | length'
```

For each non-zero result, pull the details (path, formula, cachedValue):

```bash
officecli query "$FILE" 'cell:contains("#REF!")' --json   # returns full cell objects
```

**Rule:** zero is the only passing number. Any error cell is at least MAJOR; `#REF!` (broken reference) and `#VALUE!` (type mismatch) are usually BLOCKER when they feed totals or downstream calcs.

### Phase 3 — Hardcoded calculated cells

Find cells that *look like* computed values but are stored as literals. Two standard probes:

```bash
# Probe 1 — numeric literal directly under / beside a SUM-like section header:
officecli query "$FILE" 'cell[type=Number]' --json | jq '[.data.results[] | select(.format.formula == null)] | length'

# Probe 2 — do a SUM consistency check on any table with a total row:
# Compare the total cell against SUM of the range it should cover, manually:
officecli get "$FILE" '/SheetName/A10' --json          # total cell
officecli get "$FILE" '/SheetName/A2:A9' --json        # range it should sum
```

A hardcoded total whose value disagrees with its own range = BLOCKER (classic "célula calculada hardcoded"). A hardcoded total that *happens* to match today = MINOR/MAJOR risk finding (it will silently break tomorrow) — flag as **structural risk**, do not assume it's fine.

### Phase 4 — Formula & reference consistency

Focus areas:

1. **Inconsistent formulas down a column.** In a column of formulas where every row should be the same pattern, spot-check for layout drift. Query a range and compare formula strings:
   ```bash
   officecli get "$FILE" '/SheetName/C2:C30' --json | jq '.data.results[0].children[] | .format.formula // .text'
   ```
   Look for: a row using `A2*B2` while the others use `A2*B3` (wrong-row references), a hardcoded outlier in a formula column, a formula that skips a row.
2. **Foreign / broken references.** Validate every cross-sheet reference exists. The `#REF!` sweep (Phase 2) catches broken ones at runtime. For *defensive* detection, query for cells whose formula references sheets not in the Phase 1 inventory — for example a formula containing `'Sheet99'!` where `Sheet99` does not exist.
3. **Dependency chains that reach missing inputs.** A formula chain that bottoms out in an empty cell or a text cell where it needs a number.
4. **_xlnm / structural names.** Confirm `Print_Area` settings don't conflict across sheets (→ see officecli-data-dashboard §Print-ready delivery for the failure mode).

### Phase 5 — Duplicate sources of truth

The classic data-integrity risk in workbooks: the same figure exists in two places and can drift.

Detection heuristics (each is a probe, not proof — mark the finding VERIFIED only when you have direct evidence of disagreement):

1. **Same label, two values.** Two cells labelled e.g. "Total Revenue" on different sheets with different values → BLOCKER if both are claimed sources.
2. **Two grand-total rows in one sheet.** A summary sheet that has both a formula total and a hardcoded total for the same figure → BLOCKER divergence.
3. **Imported snapshot vs live formula.** A pasted value block (no formulas) alongside a formula block covering the same data → MAJOR drift risk, VERIFIED only if values actually differ.
4. **Multiple input cells for the same parameter.** Two "Tax Rate" cells on different sheets storing different numbers → MAJOR.

For each candidate, the decisive check is: **do both cells agree right now, and can they disagree later?** If they agree now but one is hardcoded, the finding is MAJOR (structural) — even if VERIFIED-agree today. Never report "duplicate sources of truth" without naming both cells.

### Phase 6 — Structural risks

Look for conditions that make the workbook fragile or unmaintainable:

- Formulas stored as text (cell shows `=A1+B1` as a string, no leading `=`) → MAJOR, verify with `get --json | jq '.format.formula'` (absent = literal text).
- Data tables without headers on every sheet.
- Sheets with no content (empty shells).
- Implicit intersections / volatile formulas used in bulk (e.g. `INDIRECT`, `OFFSET` used in hundreds of cells) → MINOR/MAJOR performance risk depending on count.
- Charts feeding from hidden columns/sheets (blank-render risk → see officecli-data-dashboard D-8).
- Merged cells inside data ranges (break filtering/sorting) → MAJOR if any data table uses them.

### Phase 7 — Report

Deliver the report in a fixed structure. Statuses follow the delivery-gate taxonomy (CREATED / MODIFIED / VERIFIED / NOT VERIFIED / PENDING / ISSUES — see delivery-gate skill):

```markdown
# Audit Report — <file>
Date / auditor / file hash (SHA256)

## Summary
- Sheets: N | Tables: N | Charts: N | Named ranges: N
- BLOCKER: N | MAJOR: N | MINOR: N | INFO: N
- Verdict: TRUST / TRUST-WITH-CAVEATS / DO-NOT-TRUST

## Findings
### B-1 (BLOCKER) — <title>
- Where: Sheet!Cell; formula `=...` (or literal)
- Evidence: `officecli query …` → excerpt
- Why it matters: <one sentence>
- Suggested fix (not applied): <one sentence>

### M-1 (MAJOR) — <title>
… same shape …

## NOT VERIFIED
- <check that could not be run, and why>
- <claim you could not confirm>

## Limitations
- <renderer caveats, resident locks, permission issues>
```

**Verdict rules.** TRUST requires: zero BLOCKER, zero error cells, all duplicate-source candidates VERIFIED-consistent, no un-run mandatory check. Any BLOCKER → DO-NOT-TRUST. Un-verifiable checks → TRUST-WITH-CAVEATS at best.

## QA (REQUIRED — Delivery Gate)

**Assume there are problems. Your job is to find them.** Run the audit with the same rigor you would apply to someone else's sloppy workbook — especially your own output.

Minimum cycle before "done":

1. **Error sweep re-run** after any change the audit prompts, to confirm the audit did not introduce errors (audits are read-only; if you held a resident open, confirm `validate` passes after close).
2. **Count precision.** Every count in the report (blocks, cells, findings) comes from a real query output — never from memory.
3. **Gate — evidence completeness.** Every finding cites a path + query. Findings without evidence → remove or re-run.
4. **Gate — severity calibration.** No "MAJOR" that is actually INFO; no BLOCKER that is actually MINOR. Calibrate by the question: *does this send a wrong number to a reader?*
5. **Gate — NOT VERIFIED honesty.** Any check you could not run is listed under NOT VERIFIED, with the reason. Silently skipped checks are a delivery failure.

## Honest limits

- `validate` proves schema validity, not business correctness. A workbook passes `validate` with a hardcoded total that disagrees with its range.
- The engine does not evaluate every function in every renderer — `#N/A` may appear in one viewer and resolve in another. When ambiguous, say so; do not declare BLOCKER on a renderer artifact without checking (→ see officecli-xlsx §Known Issues / Renderer caveats).
- You cannot audit what you cannot read: password-protected sheets / files, external links to files you do not have, and VBA macros are surfaced as NOT VERIFIED, not silently ignored.

## Reference

- Read commands: `officecli help xlsx` → `get` / `query` / `view` / `validate`.
- Query selectors: `cell[type=Number]`, `cell:contains("…")`, `cell:has(formula)`, `cell:not(:has(formula))`, `sheet`, `namedrange`, `table`, `chart`, `conditionalformatting`, `validation`, `comment`.
- Delivery taxonomy: see `delivery-gate` (CREATED / MODIFIED / VERIFIED / NOT VERIFIED / PENDING / ISSUES).