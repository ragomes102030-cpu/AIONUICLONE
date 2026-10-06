---
name: spreadsheet-qa
description: "Use this skill to QA-verify Excel workbooks before delivery — workbook integrity, expected sheets (abas esperadas), formulas, references, errors, formats, validations (validações), conditional formatting, charts, total consistency, and edge cases (casos-limite). Trigger on: 'qualidade do workbook', 'QA da planilha', 'verificação final', 'checar formulas', 'validar workbook', 'consistência de totais', 'validações de dados', 'revisão de planilha', 'is the workbook correct', 'final QA', 'spreadsheet verification', 'check totals', 'formula audit', 'workbook integrity check'. Output is a structured QA verdict (PASS / PASS-WITH-ISSUES / FAIL) with evidence — every claim backed by a query result. Scene-layer on officecli-xlsx: inherits every xlsx hard rule. Coordinates with spreadsheet-audit (deep structural audit on request) and delivery-gate (final CREATED/MODIFIED/VERIFIED status). DO NOT invoke for: deep exploratory audits before building (use spreadsheet-audit), or the final delivery go/no-go statusing (use delivery-gate)."
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

# Spreadsheet QA (scene-layer on officecli-xlsx)

This skill is the **verification layer** of every workbook this agent produces — or QA's the user's workbook on request. Its stance is adversarial: **assume there are problems, find them, and prove the verdict.** The special danger of QA work is _claiming_ health without _showing_ evidence — a QA that says "looks good" without a single query result is theater, and it violates the core rule of not asserting validation that never happened.

The engine mechanics come from `officecli-xlsx`. For a deeper structural audit (source-of-truth, dependencies, risk inventory) escalate to `spreadsheet-audit`; for the final go/no-go status word, hand off to `delivery-gate`. This skill does the mechanical verification: structure, formulas, references, errors, formats, validations, conditional formatting, charts, totals, edge cases.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**When a prop name, enum value, or alias is uncertain, consult help before guessing.**

```bash
officecli help xlsx                          # element list
officecli help xlsx cell                     # cell props — how to read validation/CF metadata
officecli help xlsx conditionalformatting    # how to enumerate and inspect rules
officecli help xlsx validation               # how to enumerate data validations
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx.** Read `officecli-xlsx` first (engine rules, shell, query semantics, HTML preview, validate). This skill adds the QA protocol: the check inventory, evidence capture, verdict taxonomy, and edge-case sweep. It applies to **any** workbook — built by you via other skills (financial-modeling, construction-planning, dashboard-design, …) or provided by the user.

**Core rules (verbatim, non-negotiable):**

- **Não afirmar que algo foi validado sem realmente validar.** Every check has a query; every claim cites a result. No check = no claim.
- **Não apagar dados sem autorização.** QA reports; it does not silently delete or "fix" beyond the agreed scope.
- **Não criar fontes de verdade duplicadas.** If QA finds a duplicated source of truth, it flags it — it does not quietly re-derive one.
- **Registrar limitações.** Whatever could not be verified (unsupported metadata, unreadable element) is listed as NOT VERIFIED, not skipped silently.

## Core Principles

1. **Check inventory is explicit.** The QA sheet lists every check with a status: PASS / FAIL / NOT VERIFIED / N/A — and a `Method` column citing the query that produced it. An empty method cell invalidates that row.
2. **Evidence over assertion.** Every FAIL/NOT VERIFIED is accompanied by a count or snippet from the query output. "Spot-check" is acceptable only when explicitly labeled as such (sampling is disclosed, not hidden).
3. **Errors are absolute blockers.** `#REF!`, `#VALUE!`, `#DIV/0!`, `#NAME?`, `#N/A` (when unintended) anywhere → FAIL, regardless of how "minor" the cell looks.
4. **Totals reconcile or the workbook doesn't ship.** Every stated total is re-derived independently (sum of detail = total) during QA; reconciliation is evidence, not assertion.
5. **Edge cases are checked, not hoped.** Empty ranges, zero divisors, blank inputs, first/last rows, duplicated keys, single-row sheets, negative quantities (where illegal) — a fixed mini-suite, run every time.
6. **QA is read-only.** Verification runs in read mode. Nothing is written to the workbook during QA (fixes happen afterward, in a separate, disclosed pass).

## Workflow

### Phase 1 — Establish scope

- Workbook under QA (path) and the expected contract: expected sheet names (abas esperadas), expected totals, expected validations/CF, expected charts — from the request or from the building skill's plan.
- Scope: full vs targeted (targeted only when the user explicitly scopes QA to a subset — otherwise full).

### Phase 2 — Run the mechanical sweep (evidence capture)

Run `officecli validate` (errors) and the query suite. Capture every result with the command that produced it:

```bash
FILE=target.xlsx
officecli open "$FILE"

# 1. Errors sweep — absolute blocker:
officecli query "$FILE" 'cell:contains("#REF!") || cell:contains("#VALUE!") || cell:contains("#DIV/0!") || cell:contains("#NAME?")' --json
# 2. Structure: sheet list and row/col spans:
officecli info "$FILE" --json
# 3. Cells with formulas, cells that are hardcoded numbers (potential hardcodados):
officecli query "$FILE" 'cell[type=Number]' --json
# 4. Totals: re-derive the stated totals (example — the workbook's Summary!B2 must equal SUM of the detail column):
officecli get "$FILE" /Summary/B2 --json
officecli query "$FILE" 'cell[type=Number]' --json   # then SUM the detail column independently
```

Store the raw outputs (or their key numbers) into the QA sheet's evidence column. **The QA sheet is the artifact — it IS the proof.**

### Phase 3 — Check inventory (the QA sheet)

Build the `QA` sheet with one row per check:

```bash
officecli add "$FILE" / --type sheet --prop name=QA
# Columns: # | Check | Method (query cmd) | Result (PASS/FAIL/NOT VERIFIED/N-A) | Evidence (count/snippet) | Notes
```

Mandatory inventory (adapt names per workbook type):

| #   | Check                                                       | Method basis                                           |
| --- | ----------------------------------------------------------- | ------------------------------------------------------ |
| Q1  | Expected sheets exist (abas esperadas)                      | `info --json` sheet list vs contract                   |
| Q2  | No formula errors                                           | errors sweep = 0                                       |
| Q3  | Every total re-derives from detail                          | independent SUM vs stated value == 0                   |
| Q4  | No unintended hardcoded computed cells                      | hardcoded-number query on computed regions == expected |
| Q5  | Validations present on input columns where promised         | validation enumeration                                 |
| Q6  | Conditional formatting present on signal cells              | CF enumeration (count + rule scan)                     |
| Q7  | Charts exist and reference data ranges (not fixed literals) | chart enumeration                                      |
| Q8  | Formats: dates/percent/currency per convention              | format scan on key columns                             |
| Q9  | Edge cases pass                                             | edge-case mini-suite (below)                           |
| Q10 | No duplicated source-of-truth structure                     | structural scan (suspicious duplicated blocks)         |

### Phase 4 — Edge-case mini-suite (Q9 mechanics)

- **Zero/empty guards**: every dividing formula is guarded (`IF(den=0,…)`). Target: sweep all formulas containing `/` — count unguarded divisions; document each.
- **Blank-input behavior**: blank a key input in a COPY of the file; confirm formulas degrade to `""`/0, not errors.
- **First/last rows**: first and last data rows render/compute (their cachedValues exist, no spill cut).
- **Duplicate keys**: if ANY key column must be unique (IDs), `COUNTIF` duplicate probe == 0.
- **Single-row**: a 1-row selection aggregates to the row itself; type-hint edge (empty column) tolerated.

Run on a scratch **copy** (`Copy-Item` to `$env:TEMP`), never on the original.

### Phase 5 — Verdict + report

```bash
Verdict = PASS                     # all checks PASS, zero failures, all evidence captured
        | PASS-WITH-ISSUES         # minor issues found, documented, none blocking (e.g. cosmetic format drift)
        | FAIL                     # any Q2/Q3/Q6-or-blocking check failed, or errors present
```

Deliver: the `QA` sheet (checks + method + result + evidence) and a 5-line summary (verdict, blockers, issues, NOT-VERIFIED items, limitations). Every FAIL/NOT VERIFIED **must** be cross-referenced in the delivery-gate status.

## QA (REQUIRED — meta-gate on the QA itself)

**Assume the QA is wrong. Prove it right.**

**Gate QA-1 — Evidence completeness.** Every non-N/A check row has a non-empty Evidence cell. Missing evidence = the QA sheet is itself FAIL (re-run the check).

**Gate QA-2 — Sweep executed, not asserted.** The errors-sweep and totals checks exist as executed outputs (the query results are captured in the sheet), not as prose like "no errors found". Prose-without-queries = FAIL.

**Gate QA-3 — Edge-case suite ran on a copy.** Q9 ran against the scratch copy and the fact is disclosed (the copy path is recorded in Notes). QA against the original by accident = FAIL (data-integrity breach of QA discipline).

**Gate QA-4 — Adversarial totals.** At least one total was re-derived independently (SUM of detail computed, not read from the total cell). If the workbook's only totals ARE the details (no aggregation), mark N-A with justification.

**Gate QA-5 — Fixes are separate and disclosed.** If this QA found issues and they were fixed before delivery, the re-run is documented (before/after evidence rows). Silent "fix during QA" = FAIL.

## Honest limits

- QA is mechanical + structural: it proves formulas compute, totals reconcile, and structure matches contract. It cannot certify that the numbers are _business-correct_ — that is domain validation (production-control, construction-cost-control, etc.) — say so out loud.
- Metadata that the CLI cannot read (some chart internals, some CF rules) is enumerated where possible; what can't be read is NOT VERIFIED, not assumed clean.
- Sampled spot-checks are explicitly labeled; a targeted QA never presents itself as full QA.
- The verdict covers this file state at this time — `TODAY()`-driven workbooks re-evaluate at open (note this for date-sensitive workbooks).

## Reference

- Engine: `officecli-xlsx`; deep structural audit: `spreadsheet-audit`; final status: `delivery-gate` .
- Domain validations: `financial-modeling`, `construction-planning`, `construction-cost-control`, `production-control`, `cpm-scheduling`, `gantt`, `lob`.
