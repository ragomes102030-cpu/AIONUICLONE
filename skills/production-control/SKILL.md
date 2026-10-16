---
name: production-control
description: >-
  Builds production-control workbooks for construction: planned vs executed
  quantity, balance, physical progress, productivity, performance, service, work front,
  location, period and planned-vs-actual analysis. Use when the user mentions controle
  de produção, quantidade planejada x executada, avanço físico, produtividade, frente
  de serviço, or asks "como está o avanço?" / "estamos no ritmo?". Do NOT use for
  contractual measurement bulletins (use `production-measurement-control`) or cost
  (use `construction-cost-control`).
---

# > **⚠️ Platform note — read before running any command.** The shell snippets in this skill are written for **macOS / Linux** (bash/zsh). Always check which OS you are on first. On **Windows** do **not** run them verbatim — the underlying tool/CLI commands are usually cross-platform, but the surrounding shell syntax is not. Translate it to PowerShell before running:

## When to Use

Use when the user:
- Names controle de produção, avanço físico, quantidade executada, frente de serviço
- Asks "como está o avanço?", "estamos no ritmo?", "qual frente está atrasada?"
- Needs planned vs executed by service, front and period
- Wants productivity and performance indicators

Do NOT use for: boletim de medição contratual (`production-measurement-control`);
custo (`construction-cost-control`).

## Workflow

1. **Estruture por frente e período** — produção sem local não permite ação.
2. **Separe** Planejado · Executado · Saldo.
3. **Derive a produtividade:** `qty / (equipes × horas)`.
4. **Compare com a produtividade de referência** → desempenho (%).
5. **Calcule o avanço físico** por serviço e acumulado.
6. **Identifique a frente crítica** (menor avanço ou maior desvio).
7. **Projete a data de término** com a produtividade real, não a planejada.

## Implementation

### ⚠️ Help-First Rule

```bash
officecli help xlsx                          # element list
officecli help xlsx cell                     # cell props + formula patterns
officecli help xlsx conditionalformatting    # CF for progress/saldo signals
officecli help xlsx validation               # dropdowns for frente/localizacao
```

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

### Phase 3 — Config

```bash
officecli set "$FILE" /Config/B2 --prop value="m2/h" --prop font.color=0000FF                       # productivity unit
officecli set "$FILE" /Config/B3 --prop value="qtd/esforco" --prop font.color=0000FF                # convention
officecli set "$FILE" /Config/B4 --prop value=0.85 --prop numFmt='0.0%' --prop font.color=0000FF      # reference productivity (input + source note)
officecli set "$FILE" /Config/C4 --prop value="Fonte: historico do usuario (PENDING confirm)" --prop font.color=0000FF
```

### Phase 4 — Input registers

```bash
officecli set "$FILE" '/Planejado/A1:G1' --prop fill=1F3864 --prop font.color=FFFFFF --prop font.bold=true
officecli set "$FILE" /Planejado/A2 --prop value="Servico" --prop font.bold=true
officecli set "$FILE" /Planejado/B2 --prop value="Frente"  --prop font.bold=true
```

### Phase 5 — Comparison view (Controle de Producao)

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

### Phase 6 — Rollups & Summary

```bash
# By front (Q=Executado sum, P=Planejado sum, then progress formula)
officecli set "$FILE" /Rollup/C5 --prop 'formula==SUMIFS("Controle de Producao"!$E$2:$E$500,"Controle de Producao"!$B$2:$B$500,$A5)'
officecli set "$FILE" /Rollup/D5 --prop 'formula==SUMIFS("Controle de Producao"!$D$2:$D$500,"Controle de Producao"!$B$2:$B$500,$A5)'
officecli set "$FILE" /Rollup/E5 --prop 'formula==IF($D5=0,"n/a",$C5/$D5)' --prop numFmt='0.0%'
```

### QA (REQUIRED — Delivery Gate)

```bash
Bad=$(officecli query "$FILE" 'cell[type=Number]' --json \
  | jq '[.data.results[] | select(.format.formula == null) | select(.path | test("/(Controle de Producao|Rollup|Summary)/")) | select(.path | test(":[G-J]"))] | length')
[ "$Bad" -eq 0 ] && echo "Gate PC-1 OK (no hardcoded computed cells)" || { echo "REJECT Gate PC-1: $Bad hardcoded"; exit 1; }
```

## Pitfalls

- **Avanço sem frente esconde o problema.** 80% no total pode ser 100% numa frente
  e 40% em outra. Sempre abra por frente.
- **Produção ausente não é zero.** `SEM DADO` ≠ 0.
- **Produtividade real ≠ planejada.** Projetar o término com a planejada ignora o
  desempenho medido. Use a real e diga que usou.
- **Saldo acumulado esconde o ritmo.** Saldo pode estar ok e o ritmo atual, ruim.
  Mostre a produção do período, não só o acumulado.
- **Frente sobrecarregada não acelera.** Adicionar equipe onde a frente não comporta
  não aumenta produção — gera interferência. Verifique antes de sugerir.
- **Avanço físico ≠ financeiro.** Serviço caro e pouco avançado distorce a leitura
  financeira. Mantenha as duas curvas.

## Examples

**Input:** "Alvenaria: pav 1-3 a 100%, pav 4 a 60%, pav 5-12 a 0%.
Planejado acumulado 4.000 m², executado 3.600 m²."

**Output:**

| Frente | Planejado | Executado | Saldo | Avanço | Desempenho |
|---|---|---|---|---|---|
| Pav 1-3 | 1.200 | 1.200 | 0 | 100% | 100% |
| Pav 4 | 400 | 240 | 160 | 60% | 88% |
| Pav 5-12 | 2.400 | 0 | 2.400 | 0% | — |
| **Total** | 4.000 | 3.600 | 400 | **90%** | **94%** |

**Frente crítica:** pav 5-12 (0% executado, prazo começando).
**Projeção:** com produtividade real (94% da planejada), término em ~12,8 períodos
em vez de 12. Premissa: ritmo atual mantido.

## Verification

- [ ] Produção aberta por frente **e** período
- [ ] `Saldo = Planejado − Executado` confere
- [ ] Produtividade derivada de horas × equipes
- [ ] Desempenho comparado a uma referência declarada
- [ ] Projeção usa produtividade **real** e diz isso
- [ ] Avanço físico separado do financeiro
