---
name: lob-design-patterns
description: >-
  Reference design rules for building a professional Line-of-Balance (LOB) /
  Gantt spreadsheet: the 4-tab layout, colour palette, fonts, Gantt header and
  bar conventions, and the physical vs budget EAP sheets. Use when the user asks
  to "montar a planilha no estilo LOB", recreate an attached LOB workbook, or
  standardise the look of a schedule/budget spreadsheet. Do NOT use to compute
  the CPM or the balance itself — use the scheduling and LOB skills for that;
  this skill only defines the layout.
homepage: 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento'
metadata:
  {
    'openclaw':
      {
        'emoji': '📊',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento',
        'requires': {},
      },
  }
---

# LOB Design Patterns

Layout conventions for a professional Line-of-Balance workbook. This is a
*design* reference — pair it with the scheduling/LOB skills that compute the data.

## Workbook structure (4 sheets)

| Sheet | Content |
|-------|---------|
| Cronograma em Gantt | 407 date columns, coloured bars, project header |
| EAP Física - Serviços | Hierarchy: ref, descrição, nível, situação |
| EAP Orçamento - Serviços | Cost codes: ref, descrição, nível, valor |
| Sobre | Project info: obra, tipo, área, cliente, responsável |

## Colour palette

- AZUL_ESCURO: `1F4E78` (titles, critical bars)
- AZUL_CLARO: `D6E4F0` (date headers)
- VERMELHO: `FFC7CE` (delays)
- VERDE: `C6EFCE` (completed)
- AMARELO: `FFEB9C` (attention)

## Fonts

- Title: Avenir Next LT Pro, bold, size 14
- Tasks: Bahnschrift, size 10–11
- Dates: Calibri, size 8–9

## Gantt header

- Row 1: Title, merge A1:H1
- Row 2: Company (A2:C2) + Owner (D2:H2)
- Row 3: Start, merge A3:B3
- Row 4: Blue separator
- Row 5: Dates (DD/MM)
- Row 8: Weekday (SEG, TER…)
- Row 9: Week abbreviation (SE, TE…)

## Gantt bars

- Fill columns 9–408 with the task colour
- Critical: red border on columns A–H
- Today: red conditional formatting

## EAP Física

- Hierarchical refs (1, 1.1, 1.2…)
- SITUAÇÃO dropdown: Em andamento, Concluído, Atrasado, Pendente

## EAP Orçamento

- Cost code (1001, 2001…)
- Values formatted `R$ #,##0.00`
- Category totals in bold

## Sobre

- Campo/Valor in two columns
- 12–14 project fields

## Pitfalls

- Mixing "Gantt physical" and "budget" references in the same column breaks the roll-up.
- Hard-coding 407 columns on a short schedule leaves giant empty gaps — size the columns to the real horizon.
- Skipping the `Sobre` sheet makes the workbook unauditable (no obra, area, owner).

## Verification

- Four sheets present with the exact names above.
- Critical bars carry the red border; completed tasks the green fill.
- Totals per category recompute from the component lines (no hard-coded totals).

## Author

Arquimedes / planejamento de obras
