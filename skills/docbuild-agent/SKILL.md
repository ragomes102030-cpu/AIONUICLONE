---
name: docbuild-agent
description: >-
  Produces construction technical documentation: budget with BDI, SINAPI/SEINFRA
  compositions, descriptive memorial, specifications, execution plan and normative
  analysis, per NBR 15575 / 6118 / 9077. Use when the user mentions orçamento, BDI,
  SINAPI, SEINFRA, memorial descritivo, especificação técnica, caderno de encargos,
  laudo, or asks "quanto custa?" / "escreve a especificação" — even without naming
  the document. Do NOT use for structural calculation (use `structuro-agent`) or
  for pathology diagnosis (use `pathoscan-agent`).
version: 2.0.0
author: AionUi Engineering Hub
license: MIT
metadata:
  domain: civil-engineering
  specialization: documentation
---

# DocBuildAgent — documentação técnica e orçamento

Produz o documento que formaliza a obra: orçamento, memorial, especificação, laudo.

## When to Use

Use when the user:
- Names orçamento, BDI, SINAPI, SEINFRA, memorial, especificação, caderno de encargos
- Asks "quanto custa?", "escreve a especificação", "monta o memorial"
- Needs a normative analysis or technical report
- Wants a budget with composition and BDI

Do NOT use for:
- Cálculo estrutural → `structuro-agent`
- Diagnóstico de patologia → `pathoscan-agent`

## Workflow

1. **Defina o documento:** orçamento · memorial descritivo · especificação técnica ·
   caderno de encargos · laudo técnico · plano de execução.
2. **Colete as entradas:** escopo/EAP, quantitativos, base de preços, data-base, UF.
3. **Monte o orçamento** (se for o caso): composição → custo direto → BDI →
   preço unitário → total.
4. **Aplique BDI por fórmula**, com os componentes separados.
5. **Escreva o texto técnico** com: objeto, premissas, normas aplicáveis, descrição,
   critério de medição, critério de recebimento.
6. **Cite a norma** com número e ano, e o artigo quando aplicável.
7. **Formate** com a skill `formato-br` (R$, dd/mm/aaaa, separador brasileiro).

## Pitfalls

- **BDI não é percentual somado.** Componentes (administração, risco, lucro, tributo)
  têm incidência em cascata. Somar os percentuais superestima ou subestima.
- **Preço sem data-base e UF não é preço.** SINAPI e SEINFRA são mensais e regionais.
  Sempre cite: "SINAPI SP, 09/2026, desonerado".
- **Memorial sem critério de medição gera disputa.** Diga como se mede cada serviço
  (por m² executado? por m² de parede acabada?). Sem isso, a medição é contestável.
- **Norma sem número e ano é referência vaga.** "Conforme NBR" não serve. Cite
  "NBR 15575-1:2021".
- **Especificação sem critério de recebimento não é verificável.** Diga o que
  caracteriza aceito (ensaio? tolerância? inspeção visual?).
- **Orçamento aprovado não se reescreve.** Atualizar preço gera versão nova + diff.
- **Desonerado vs não desonerado muda o custo.** Declare sempre. A diferença é grande
  em serviço intensivo em mão de obra.
- **Memorial copiado de outra obra.** Escopo é específico. Texto genérico gera
  aditivo depois.

## Examples

**Input:** "Memorial descritivo da alvenaria de vedação, casa unifamiliar."

**Output:**

```
MEMORIAL DESCRITIVO — ALVENARIA DE VEDAÇÃO

1. OBJETO
   Execução de alvenaria de vedação em blocos cerâmicos, casa unifamiliar.

2. PREMISSAS
   Área: 260 m² | Pé-direito: 2,80 m | Espessura: 14 cm
   Ambiente: urbano, sem agressividade especial

3. NORMAS APLICÁVEIS
   NBR 15270-1:2017 (bloco cerâmico) | NBR 16868-1:2020 (alvenaria estrutural,
   referência) | NBR 15575-4:2021 (vedações)

4. DESCRIÇÃO
   Bloco cerâmico furado 14×19×39 cm, furos horizontais, resistência ≥ 1,5 MPa.
   Argamassa de assentamento: traço 1:2:9 (cimento:cal:areia), resistência
   ≥ 1,0 MPa. Juntas de 10 mm ± 2 mm, contrapassadas. Vergas e contravergas
   em aberturas > 1,0 m. Cinta de amarração no topo.

5. CRITÉRIO DE MEDIÇÃO
   Por m² de parede acabada, descontando vãos > 2,0 m².

6. CRITÉRIO DE RECEBIMENTO
   - Prumo: desvio ≤ 5 mm/m (NBR 15575-4)
   - Planeza: desvio ≤ 5 mm em 2 m
   - Juntas: uniformes, sem falha de argamassa
   - Resistência: laudo do bloco ≥ 1,5 MPa

7. REFERÊNCIA DE PREÇO
   SINAPI SP, 09/2026, desonerado — R$ 47,24/m² (custo direto R$ 36,91 + BDI 28%)
```

## Verification

Antes de entregar:
- [ ] Tipo de documento definido (orçamento/memorial/especificação/laudo)
- [ ] Normas citadas com **número e ano**
- [ ] Data-base e UF do preço declarados
- [ ] Desoneração declarada
- [ ] Critério de **medição** presente
- [ ] Critério de **recebimento** presente e verificável
- [ ] BDI por fórmula, componentes separados
- [ ] Orçamento aprovado preservado (versão nova, não sobrescrita)
- [ ] Formatação brasileira aplicada (`formato-br`)

## Reference

- Composição de BDI: `references/bdi.md`
- Estrutura de memorial: `references/memorial.md`
- Normas por disciplina: `references/normas.md`
