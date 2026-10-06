---
name: delivery-gate
description: "Use this skill as the MANDATORY final gate before delivering ANY workbook to the user — it assigns the status word (CREATED/MODIFIED/VERIFIED/NOT VERIFIED/PENDING/ISSUES), enforces the rule that 'no workbook is ready just because it was saved', and produces the delivery summary with honest limitations. Trigger on: 'entrega', 'delivery', 'entregar', 'está pronto', 'is it ready', 'portão de entrega', 'gate de qualidade final', 'status do arquivo', 'what is the status', 'reviu o workbook', 'pode entregar'. Output is a status + delivery note, in the conversation (and optionally a Delivery sheet). Scene-layer on officecli-xlsx / spreadsheet-qa: requires verification evidence before any VERIFIED claim. DO NOT invoke for: running the mechanical QA checks themselves (use spreadsheet-qa / spreadsheet-audit), or building the workbook (use the domain skills). This skill decides the status; it never silently upgrades one."
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

# Delivery Gate (scene-layer on officecli-xlsx / spreadsheet-qa)

**"Nenhum workbook está pronto só porque foi salvo."** A file existing on disk is a file existing on disk — it is not a delivered, verified artifact. The Delivery Gate is the final, mandatory checkpoint before any workbook leaves this agent's hands: it assigns an explicit status, requires verification evidence for every claim it makes, and refuses to deliver "pretty but unverified" work.

The mechanics of verification live in `spreadsheet-qa` (and `spreadsheet-audit` for deep audits). This skill adds the **status vocabulary**, the **gate protocol**, and the **delivery note** — the thing the user actually reads.

## Setup

If `officecli` is missing:

- **macOS / Linux**: `curl -fsSL https://d.officecli.ai/install.sh | bash`
- **Windows (PowerShell)**: `irm https://d.officecli.ai/install.ps1 | iex`

Verify with `officecli --version` (open a new terminal if PATH hasn't picked up). If install fails, download a binary from https://github.com/iOfficeAI/OfficeCLI/releases.

## ⚠️ Help-First Rule

**When a prop name, enum value, or alias is uncertain, consult help before guessing.**

```bash
officecli help xlsx
officecli help xlsx cell
```

Help reflects the installed CLI version. When this skill and help disagree, **help wins**.

## Mental Model & Inheritance

**Inherits xlsx + spreadsheet-qa.** Read `officecli-xlsx` first (engine rules). Read `spreadsheet-qa` for the verification protocol this gate leans on. This skill adds the status taxonomy and delivery protocol.

**Core rules (verbatim, non-negotiable):**

- **Não afirmar que algo foi validado sem realmente validar.** A VERIFIED status requires the spreadsheet-qa evidence (error sweep = 0, totals reconciled). No evidence → the honest status is NOT VERIFIED or PENDING.
- **Não esconder falhas.** ISSUES are listed, never buried. A workbook delivered with a known defect and no ISSUES entry is a failed gate.
- **Não ampliar o escopo.** The gate assigns status to the delivered artifact; it does not silently rebuild or redesign. Fixes are a separate, explicit pass.
- **Registrar limitações.** Business-validity limits, sample-based checks, unsupported metadata: all disclosed.

## Core Principles

1. **Six statuses, no synonyms.** Every delivered file gets exactly one of these words — unambiguous, uppercase, used verbatim:
   - **CREATED** — the workbook was created (structure + contents) but NOT yet verified.
   - **MODIFIED** — an existing workbook was edited; the change is not yet verified.
   - **VERIFIED** — the workbook passed the spreadsheet-qa protocol (evidence exists); status is safe to deliver.
   - **NOT VERIFIED** — no verification pass ran (or it could not complete). Honest default for "I built it but haven't proven it".
   - **PENDING** — blocked on user input (missing data, missing source, unconfirmed business rule) before verification can conclude.
   - **ISSUES** — verification found problems (errors, reconciliation drift, structural defects). Delivery is blocked until resolved.
2. **One status per delivery unit.** A multi-file deliverable gets one status per file — never a blended "mostly verified" single word.
3. **VERIFIED is earned, not wished.** VERIFIED requires the spreadsheet-qa evidence summary: error sweep count, totals reconciliation, edge-case suite result. The QA evidence travels with the status, cited by the user at handoff.
4. **PENDING names its blocker.** PENDING is always paired with the specific missing input. "PENDING" alone is a lazy gate.
5. **ISSUES lists and blocks.** ISSUES enumerates the findings (severity + cell/sheet) and the status stays ISSUES until re-runs pass and reclassify.
6. **The gate does not fix.** It classifies and reports. If the user authorizes a fix pass, that's a new trip through build-then-verify-then-gate — with the fixes disclosed (before/after evidence).

## Workflow

### Phase 1 — Intake

- Workbook(s) under gate + what changed (created? modified from version X?).
- Verification artifacts available (spreadsheet-qa sheet, audit report) — or the honest answer "none".

### Phase 2 — Determine the honest status

Walk the decision tree, in order:

1. Did verification run and pass completely? → **VERIFIED** (with evidence).
2. Did verification run and find problems? → **ISSUES** (enumerate; do not deliver as ready).
3. Did verification not run / not complete? → **NOT VERIFIED** (state the missing checks).
4. Does verification depend on missing user data / unconfirmed rule? → **PENDING** (name the blocker).
5. If 1–4 don't apply and the artifact is new / changed: → **CREATED** (new) or **MODIFIED** (edit) — never reaching for VERIFIED.

```bash
# Status is decided from evidence, not by wish. A typical verified pass prints:
officecli query "$FILE" 'cell:contains("#REF!") || cell:contains("#DIV/0!") || cell:contains("#VALUE!") || cell:contains("#NAME?")' --json | jq '.data.results | length'
# 0 => one component of VERIFIED evidence (full protocol per spreadsheet-qa still required).
```

### Phase 3 — The delivery note

For each delivered file, produce (in conversation; optionally as a `Delivery` sheet):

```
FILE: <path>
STATUS: <CREATED|MODIFIED|VERIFIED|NOT VERIFIED|PENDING|ISSUES>
EVIDENCE: <error sweep count=0; totals reconciled; edge-case suite=PASS>   (for VERIFIED)
BLOCKERS / ISSUES: <enumerated, with severity + location>                  (for PENDING / ISSUES / NOT VERIFIED)
LIMITATIONS: <business-validity limits, sample scope, unsupported metadata, TODAY()-dependence>
NEXT ACTION: <what the user must provide / what the next pass will do>
```

The note is **mandatory**; a delivery without it is a skipped gate. The summary in chat must contain at least: status word, one-line why, and (if not VERIFIED) the blocker/issue names.

### Phase 4 — The gate verdict

```bash
GATE = PASS   # one status word assigned per file, evidence-cited, limitations listed
     | FAIL   # rushed delivery: status unassigned / VERIFIED claimed without evidence / issues hidden
```

Only PASS leaves the gate. On FAIL, go back to Phase 2 with the honest status and correct the note — never upgrade a status to make the gate pass.

## QA (REQUIRED — meta-gate on the gate)

**Assume the gate itself is wrong. Prove it right.**

**Gate DG-1 — Status is exact.** The status word is one of the six, uppercase, verbatim. "Quase verificado", "basicamente pronto", "até que está ok" → FAIL, rewrite with an exact word.

**Gate DG-2 — VERIFIED has evidence.** The delivery note cites the spreadsheet-qa metrics: error sweep result, totals reconciliation, edge-case suite. Missing any → downgrade to NOT VERIFIED or PENDING (honest), never keep VERIFIED.

**Gate DG-3 — Issues are visible.** Any known leftover (error, cosmetic defect, unguarded corner) is listed under ISSUES/BLOCKERS with severity + location. Silence about a known defect → FAIL.

**Gate DG-4 — PENDING names blockers.** Every PENDING lists the specific missing input. "PENDING" alone → FAIL.

**Gate DG-5 — No silent fixes.** If a fix pass happened, before/after evidence is disclosed and the file was re-verified after the fix (not before). Hidden fix → FAIL.

**Gate DG-6 — Limitations disclosed.** Business-validity and sampling limitations are present in the note. A note with zero limitations on a date- or domain-sensitive workbook → FAIL (suspiciously clean).

## Honest limits

- The gate certifies what verification proved: structure, formulas, reconciliation. It cannot certify business correctness of the numbers themselves (that belongs to domain skills/validators) — the limitation line says so when relevant.
- Verification depth is bounded by the protocol that ran: a sample-based QA is disclosed as sampled, and the status must not overstate it.
- `TODAY()`-driven workbooks re-evaluate at open — the note records that the delivered snapshot reflects the build date and may shift in live use.

## Reference

- Verification protocol: `spreadsheet-qa`; deep audit: `spreadsheet-audit`.
- Builders feeding the gate: `financial-modeling`, `construction-planning`, `construction-cost-control`, `production-control`, `cpm-scheduling`, `gantt`, `lob`, `dashboard-design`, `data-analysis`.
