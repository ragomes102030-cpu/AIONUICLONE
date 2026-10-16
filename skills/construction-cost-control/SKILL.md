---
name: construction-cost-control
description: >-
  Builds and maintains construction cost-control workbooks: budget (orçado),
  committed (comprometido), actual (realizado), balance (saldo), deviations (desvios),
  variations (variações) and EAP/service integration. Use when the user mentions
  controle de custos, orçamento de obra, custo comprometido, saldo de verba,
  curva de desembolso, or asks to track spend against budget. Do NOT use for
  composing unit prices (use `budget-composition-service`) or EVM indices (use
  `baseline-scurve-evm`).
---

# > **⚠️ Platform note — read before running any command.** The shell snippets in this skill are written for **macOS / Linux** (bash/zsh). Always check which OS you are on first. On **Windows** do **not** run them verbatim — the underlying tool/CLI commands are usually cross-platform, but the surrounding shell syntax is not. Translate it to PowerShell before running:

## When to Use

Use when the user:
- Names controle de custos, custo comprometido, saldo, desvio, variação
- Wants to track budget vs committed vs actual over time
- Needs a cost-control workbook linked to the EAP
- Asks "quanto ainda tenho de verba nesse pacote?"

Do NOT use for: montar preço (`budget-composition-service`); SPI/CPI
(`baseline-scurve-evm`).

## Workflow

1. **Estruture as colunas:** Orçado · Comprometido · Realizado · Saldo · Desvio.
2. **Vincule à EAP** — o custo sem pacote não é controlável.
3. **Lance o comprometido** ao assinar o contrato (não ao pagar).
4. **Lance o realizado** ao pagar.
5. **Calcule:** `Saldo = Orçado − Comprometido − Realizado`.
6. **Separe escopo original de aditivo** em coluna própria.
7. **Feche por período** e mostre a evolução, não só a foto.

## Implementation

### ⚠️ Help-First Rule

```bash
officecli help xlsx                          # element list
officecli help xlsx cell                     # cell props + formula patterns
officecli help xlsx validation               # dropdowns for cost category
officecli help xlsx conditionalformatting    # CF for deviation signals
```

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

### Phase 3 — Config sheet

```bash
officecli set "$FILE" /Config/B2 --prop value="BRL" --prop font.color=0000FF
officecli set "$FILE" /Config/B3 --prop value="Previsto - Realizado" --prop font.color=0000FF      # saldo convention (text, documented)
officecli set "$FILE" /Config/B4 --prop value=0.05 --prop numFmt='0.0%' --prop font.color=0000FF      # deviation tolerance
officecli set "$FILE" /Config/B5 --prop value="Servicos;Materiais;Equipamentos;MO" --prop font.color=0000FF  # categories (if no EAP)
```

### Phase 4 — Source sheets (Orçado / Comprometido / Realizado)

```bash
officecli set "$FILE" '/Orcado/A1:F1' --prop fill=1F3864 --prop font.color=FFFFFF --prop font.bold=true
officecli set "$FILE" /Orcado/B2 --prop value="Código EAP" --prop font.bold=true
officecli set "$FILE" /Orcado/C2 --prop value="Descricao" --prop font.bold=true
```

### Phase 5 — Registro de Custos (comparison view)

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

### Phase 6 — Rollups (by EAP disciplina or category)

```bash
# By category (when no EAP): totals per category from Registro:
officecli set "$FILE" /Rollup/B5 --prop 'formula==SUMIFS("Registro de Custos"!$H$2:$H$500,"Registro de Custos"!$B$2:$B$500,$A5)'
```

### QA (REQUIRED — Delivery Gate)

```bash
Hard=$(officecli query "$FILE" 'cell[type=Number]' --json \
  | jq '[.data.results[] | select(.format.formula == null) | select(.path | test("/(Registro de Custos|Rollup|Summary)/"))] | length')
[ "$Hard" -eq 0 ] && echo "Gate CC-1 OK (no hardcoded computed cells)" || { echo "REJECT Gate CC-1: $Hard hardcoded"; exit 1; }
```

## Pitfalls

- **Comprometido + realizado = dupla contagem.** Comprometido é contratado-e-não-pago.
- **Escopo novo não é estouro.** Aditivo sem coluna própria infla o desvio do pacote
  original e esconde a ineficiência real.
- **Reajuste contratual não é desvio de gestão.** Separe reajuste de ineficiência.
- **Sem vínculo com a EAP, o custo não é controlável.** Custo solto não permite
  ação corretiva.
- **Saldo negativo precisa de ação, não de silêncio.** Sinalize todo pacote com
  saldo < 0.
- **Foto sem evolução engana.** Um desvio pequeno que cresce 3 meses seguidos é
  pior que um desvio grande e estável. Mostre a tendência.

## Examples

**Input:** "Pacote 1.3 Estrutura: orçado 200.000. Contrato de aço 90.000 assinado.
Pago até agora 45.000. Aditivo aprovado 12.000."

**Output:**

| Pacote | Orçado | Aditivo | Comprom. | Realizado | Saldo | Desvio |
|---|---|---|---|---|---|---|
| 1.3 Estrutura | 200.000 | 12.000 | 90.000 | 45.000 | 77.000 | −45.000 |

`Saldo = 200.000 + 12.000 − 90.000 − 45.000 = 77.000`
Desvio real de gestão: **−45.000** (dentro do previsto até agora).
Aditivo separado: +12.000 (não é estouro).

## Verification

- [ ] Colunas Orçado / Aditivo / Comprometido / Realizado / Saldo separadas
- [ ] `Saldo = Orçado + Aditivo − Comprometido − Realizado` confere em toda linha
- [ ] Todo custo vinculado a um pacote da EAP
- [ ] Reajuste separado de ineficiência
- [ ] Pacotes com saldo < 0 sinalizados
- [ ] Evolução por período, não só foto
