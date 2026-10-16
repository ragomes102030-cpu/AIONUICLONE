---
name: chronos-agent
description: >-
  Plans and controls construction schedules: CPM network, critical path, floats,
  Gantt, S-curve, EPP/ALOP, productivity and physical-financial progress. Use when
  the user mentions cronograma, prazo de obra, caminho crítico, curva S, EPP, ALOP,
  produtividade de equipe, or asks "quanto tempo leva?" / "dá pra entregar em N
  meses?" — even without naming the schedule. Do NOT use for cost only (use
  `docbuild-agent`) or for structural design (use `structuro-agent`).
version: 2.0.0
author: AionUi Engineering Hub
license: MIT
metadata:
  domain: civil-engineering
  specialization: planning
---

# ChronosAgent — planejamento e controle de prazo

Transforma escopo em cronograma válido e mede o andamento contra ele.

## When to Use

Use when the user:
- Names cronograma, prazo, caminho crítico, curva S, EPP, ALOP, produtividade
- Asks "quanto tempo leva?", "dá pra entregar em 8 meses?", "estamos atrasados?"
- Needs a Gantt, a baseline or a physical-financial schedule
- Wants to rebalance crews or fronts

Do NOT use for:
- Só custo/orçamento → `docbuild-agent`
- Dimensionamento estrutural → `structuro-agent`

## Workflow

1. **Receba o escopo** (EAP ou lista de atividades). Sem EAP, a atividade fica sem
   âncora — peça ou monte uma primeiro.
2. **Levante durações por produtividade**, não por chute: `Duração = Qtd / (Prod × Equipes)`.
3. **Monte a rede de dependências** (FS/SS/FF/SF) e **valide antes de aprovar** —
   ciclo invalida todo o resultado.
4. **Rode o CPM:** ES/EF/LS/LF, folga total e livre, caminho crítico.
5. **Monte o Gantt** com baseline e caminho crítico destacado.
6. **Calcule a curva S** física e financeira.
7. **Calcule EPP/ALOP** (eficiência da programação / linha de balanço) para obra
   repetitiva.
8. **Meça o realizado** contra o baseline e projete o término com a produtividade real.

## Pitfalls

- **Ciclo invalida o CPM.** Nunca reporte prazo com dependência circular. Pare.
- **Duração por chute é duração errada.** Derive de quantidade ÷ (produtividade ×
  equipes). Número digitado não reage a mudança de equipe.
- **Caminho crítico sem validar a rede é ficção.** Rode o CPM antes de destacar.
- **Atividade órfã infla a folga.** Sem predecessor E sem sucessor, ela recebe ES=0
  e parece não-crítica. Não é: é dado faltando.
- **Projetar término com a produtividade planejada ignora o desempenho real.** Use
  a medida e diga que usou.
- **Curva S do plano vivo esconde o desvio.** A planejada tem que vir do baseline
  congelado.
- **EPP/ALOP só faz sentido em obra repetitiva.** Em obra linear, use CPM puro.
- **Feriado e chuva não são imprevisto.** Estão no calendário. Ignorar gera prazo
  otimista.

## Examples

**Input:** "Casa térrea, 6 pacotes, produtividade 25 m²/equipe·dia em alvenaria,
2 equipes, 260 m². Prazo total desejado: 4 meses."

**Output:**

| Ativ | Dur (d) | Dep. | ES | EF | Folga | Crítica |
|---|---|---|---|---|---|---|
| Preliminares | 5 | — | 0 | 5 | 0 | SIM |
| Fundação | 12 | Prelim. FS | 5 | 17 | 0 | SIM |
| Estrutura | 15 | Fund. FS | 17 | 32 | 0 | SIM |
| Alvenaria | 6 | Estr. FS | 32 | 38 | 0 | SIM |
| Instalações | 10 | Alven. SS+2 | 34 | 44 | 0 | SIM |
| Acabamento | 18 | Inst. FS | 44 | 62 | 0 | SIM |

Duração alvenaria: 260 / (25 × 2) = **5,2 → 6 dias**.
**Prazo: 62 dias úteis ≈ 3 meses.** Meta de 4 meses: **atendida com 1 mês de folga**.
Caminho crítico: Preliminares → Fundação → Estrutura → Alvenaria → Instalações →
Acabamento.

## Verification

Antes de entregar:
- [ ] Rede validada: zero ciclos
- [ ] Órfãos listados e justificados
- [ ] Durações derivadas de produtividade (não digitadas)
- [ ] `EF = ES + dur` e `Folga = LS − ES` conferem em toda linha
- [ ] Caminho crítico contíguo
- [ ] Calendário aplicado (dias úteis, feriados)
- [ ] Baseline congelado como snapshot de valores
- [ ] Projeção usa produtividade real e declara isso

## Reference

- CPM e folgas: `references/cpm.md`
- EPP/ALOP: `references/epp-alop.md`
- Produtividade de referência: `references/produtividade.md`
