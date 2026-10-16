---
name: oce-scheduling-4d5d
description: >-
  Builds 4D schedules and 5D cost models in OpenConstructionERP: task graphs,
  BIM element linkage, BOQ line linkage, cost roll-up over time, and Gantt/sequence
  export. Use when the user mentions 4D, 5D, BIM scheduling, modelo de custo por
  tarefa, cronograma com BIM, sequência construtiva visual, or integrating schedule
  with BIM/cost in OpenConstructionERP. Do NOT use for a plain Excel schedule (use
  `construction-planning`) or standalone CPM validation (use `cpm-network-validator`).
---

# 4D Scheduling & 5D Cost Model in OpenConstructionERP

## When to Use

Use when the user:
- Names 4D, 5D, BIM, cronograma com BIM, sequência construtiva visual
- Works inside OpenConstructionERP
- Needs to link tasks to BIM elements or BOQ lines
- Wants cost rolled up over time per task/phase

Do NOT use for: cronograma em Excel puro (`construction-planning`); validar rede
isolada (`cpm-network-validator`).

## Workflow

1. **Construa o grafo de tarefas** — tarefas, durações, dependências (FS/SS/FF),
   marcos, caminho crítico. É a base: sem ele, 4D e 5D não existem.
2. **Vincule elementos BIM** às tarefas (de `oce-bim-takeoff`) → sequência visual
   e coloração por progresso.
3. **Vincule linhas do BOQ** às tarefas (de `oce-estimate-boq`) → cada tarefa carrega
   seu custo direto.
4. **Faça o roll-up** — totais por fase/projeto, curvas de caixa (custo no tempo),
   visões SPI/CPI.
5. **Acompanhe** — diário de obra e punch list atualizam o realizado; relatório de
   variância compara plano × realizado.

## Pitfalls

- **Sem grafo de tarefas não há 4D/5D.** Vínculo BIM ou BOQ sem dependência
  produz animação bonita e cronograma inválido.
- **Tarefa sem elemento BIM quebra a visualização.** A sequência fica com buracos.
  Vincule 100% ou declare a cobertura (ex.: 85% dos elementos).
- **BOQ sem correspondência de unidade gera custo errado.** m² de parede ≠ m² de
  piso. Valide a unidade antes de vincular.
- **5D não é orçamento.** É o orçamento distribuído no tempo. Sem cronograma correto,
  a curva de custo é ficção.
- **Custo direto não é custo total.** O roll-up de tarefa traz custo direto; BDI e
  indiretos ficam no nível do orçamento. Não misture.
- **Progresso visual ≠ progresso físico.** Coloração do modelo mostra o declarado.
  Valide contra a medição antes de apresentar.
- **Reprocessar apaga o histórico.** Mudar o vínculo BIM reescreve o passado. Versione.

## Examples

**Input:** "Vincular o cronograma da Torre A ao modelo BIM e ao orçamento."

**Output:**

| Tarefa | Dur | Depend. | Elem. BIM | Linha BOQ | Custo direto |
|---|---|---|---|---|---|
| T-01 Fundação | 20d | — | 12 (sapatas) | 1.2.1 | R$ 84.000 |
| T-02 Estrutura | 45d | T-01 FS | 48 (pilares/vigas) | 1.3.1 | R$ 312.000 |
| T-03 Alvenaria | 30d | T-02 FS | 96 (paredes) | 1.4.1 | R$ 96.000 |

**Cobertura BIM:** 156/156 elementos (100%).
**Curva 5D (custo no tempo):** R$ 492.000 distribuído em 95 dias.
**SPI/CPI:** disponíveis por fase após lançamento do realizado.
Premissa: unidade do BOQ confere com a do elemento (m² com m²).

## Verification

- [ ] Grafo de tarefas válido (sem ciclo) antes de vincular
- [ ] Cobertura BIM declarada (%; ideal 100%)
- [ ] Unidade BOQ × unidade do elemento conferida
- [ ] Roll-up traz custo **direto**; BDI declarado como fora do escopo
- [ ] Progresso visual validado contra a medição
- [ ] Versão do vínculo registrada (reprocessar não apaga histórico)
- [ ] SPI/CPI só exibidos após existir realizado
