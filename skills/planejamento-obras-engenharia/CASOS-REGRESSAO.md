# Casos de Regressão Obrigatórios

Estes 10 casos **já ocorreram em auditoria real** de uma planilha de planejamento. Toda entrega de planejamento deve ser testada contra eles. Se qualquer um reaparecer, a tarefa é **BLOQUEADA POR ERRO**.

Formato de cada caso: **Sintoma → Evidência → Por que é erro → Regra permanente → Como testar.**

---

## CASO 01 — CPM CONGELADO

**Sintoma:** existem colunas ES/EF/LS/LF/Folga/Crítica, mas alterar a duração não muda nada.

**Evidência (real):**

```excel
E4 = =IF($D4="","",WORKDAY(DATA_INICIAL,0.0,FERIADOS))    ← "0.0" literal
F4 = =IF($D4="","",WORKDAY(DATA_INICIAL,5.0-1,FERIADOS))  ← "5.0" literal
K4 (Folga)   = 0      ← valor fixo
L4 (Crítica) = SIM    ← valor fixo
```

O offset da atividade foi **assado dentro da fórmula** em vez de referenciar o ES calculado.

**Por que é erro:** o cronograma é um retrato importado, não um cálculo. Sem propagação não existe replanejamento.

**Regra permanente:** nunca considerar CPM implementado por existirem as colunas. É **obrigatório** provar que a cadeia
`Duração → CPM → Datas → Folga → Crítica` é **dinâmica**.

**Como testar:** alterar a duração de uma atividade crítica em +50% e verificar se EF, folga das sucessoras, caminho crítico e DATA_FINAL mudam. Se nada mudar → CASO 01.

---

## CASO 02 — COLUNAS HARDCODED

**Sintoma:** a maioria das colunas críticas são valores fixos.

**Evidência (real):** de 17 colunas em ATIVIDADES, **10 eram hardcoded** (D duração, G/H/I/J ES-EF-LS-LF, K folga, L crítica, M %plan, N %real, O status). Só E, F, P, Q tinham fórmula.

**Por que é erro:** dados de entrada, resultados de cálculo e visualização ficam misturados; o usuário não sabe o que pode editar.

**Regra permanente:** para cada coluna crítica, classificar como **Entrada**, **Cálculo** ou **Referência**. Resultado calculado fora do motor deve ser rotulado **IMPORTADO**.

**Como testar:** `python scripts/auditar_xlsx.py <arquivo>` — a seção 4 lista fórmulas vs valores por coluna.

---

## CASO 03 — ATIVIDADES ÓRFÃS

**Sintoma:** atividades sem nenhuma relação, com ES=0 e folga = duração total da obra.

**Evidência (real):** 9 atividades (Placas de obra, Tapumes, Impermeabilização de fundações, Quadros, Pontos de luz, Pintura externa, Vergas, Cabeamento, Esgoto) sem predecessora nem sucessora → folga 172 (= duração da obra).

**Por que é erro:** elas não restringem nada e aparecem no Gantt no dia 0, dando falsa impressão de cronograma.

**Regra permanente:** atividade sem relação **não é automaticamente erro** (pode legitimamente iniciar independente), mas deve ser **IDENTIFICADA → JUSTIFICADA → VALIDADA**. Sem justificativa = risco.

**Como testar:** cruze os IDs de `REDE.predecessora`/`sucessora` com a lista de atividades; liste as que não aparecem em nenhum dos dois.

---

## CASO 04 — BASELINE FALSA

**Sintoma:** o desvio é sempre 0.

**Evidência (real):**

```excel
P4 = =$E4      Q4 = =$F4        (baseline = planejamento atual)
BASELINE!F4 (desvio) = 0        sempre
```

**Por que é erro:** baseline é a **referência histórica**; se ela se move com o plano, não existe comparação e nenhuma decisão de reprogramação é possível.

**Regra permanente:**

- **Baseline = SNAPSHOT CONGELADO** (valores).
- **Planejamento atual = DINÂMICO** (fórmulas).
- **Desvio = Atual − Baseline**, de duas fontes distintas.

**Como testar:** verificar se as células de baseline são `=atual` ou valores; alterar o planejamento atual e confirmar que o desvio muda (≠ 0).

---

## CASO 05 — LOB INCORRETA

**Sintoma:** todas as atividades plotadas em todos os pavimentos, com ritmo fixo.

**Evidência (real):**

```excel
=IF(1<=17,WORKDAY(ATIVIDADES!$E4,(1-1)*1,FERIADOS),"")
```

Condição `1<=17` é sempre verdadeira; ritmo = `ROUND(duração/10)` literal.

**Por que é erro:** a LOB não representa o **escopo** (faixa de pavimentos) nem o **ritmo real** de cada serviço; não serve para achar interferência.

**Regra permanente:** a LOB deve depender de atividade, **local inicial/final**, pavimento, frente, produtividade, ritmo, **nº de equipes**, calendário, predecessoras e restrições. Alterar qualquer parâmetro deve alterar a LOB.

**Como testar:** mudar o local inicial/final de uma atividade e o nº de equipes; a LOB deve mudar a inclinação e o trecho coberto.

---

## CASO 06 — AUSÊNCIA DE PRODUÇÃO

**Sintoma:** não existe onde lançar o realizado; `%Real = 0` em 37/37.

**Por que é erro:** sem planejado × realizado não há controle de avanço, desvio nem reprogramação.

**Regra permanente:** separar **Planejado · Realizado · Saldo · Desvio**. Ausência de produção **nunca** é "produção zero" — rotular **SEM DADO**.

**Como testar:** procurar aba/colunas de produção/medição; verificar se `%Real` tem fonte de entrada e se o dashboard reage.

---

## CASO 07 — AUSÊNCIA DE RECURSOS

**Sintoma:** não há módulo de recursos.

**Por que é erro:** sem mão de obra/equipamento/material não há nivelamento, detecção de sobrecarga nem produtividade real.

**Regra permanente:** verificar estrutura para:

- **Mão de obra:** equipe, quantidade, produtividade, capacidade.
- **Equipamentos:** disponibilidade, utilização, conflito.
- **Materiais:** necessidade, disponibilidade, impacto no prazo.

**Como testar:** procurar aba de recursos; verificar se há capacidade e detecção de **overbooking** (soma de alocações sobrepostas > capacidade).

---

## CASO 08 — DURAÇÃO NÃO DERIVA DE QUANTIDADE × PRODUTIVIDADE

**Sintoma:** duração digitada, sem relação com quantidade/produtividade.

**Por que é erro:** o planejamento deixa de reagir a mudanças de quantidade ou produtividade — a essência do planejamento físico.

**Regra permanente:**

```
Duração = Quantidade ÷ Produção por período ÷ Nº de equipes
```

considerando unidade, equipe, calendário e capacidade. Se a duração for **manual por decisão**, rotular explicitamente como **entrada manual**.

**Como testar:** alterar a produtividade e a quantidade; a duração deve mudar. Se não mudar, é entrada manual — confirmar se está rotulada.

---

## CASO 09 — VALIDAÇÃO INSUFICIENTE

**Sintoma:** praticamente sem validação de dados.

**Evidência (real):** 1 única validação (`O4:O40` → Status).

**Por que é erro:** digitação livre quebra a rede (tipo de relação inválido, ID inexistente, unidade incompatível).

**Regra permanente:** auditar domínio/validação/consistência de campos críticos: tipo de relação (FS/SS/FF/SF), unidade (vocabulário fechado), local, status, IDs, percentuais (0–100).

**Como testar:** listar todas as validações (`scripts/auditar_xlsx.py` seção 10) e comparar com os campos críticos.

---

## CASO 10 — ESCALABILIDADE

**Sintoma:** intervalos fixos que estouram.

**Evidência (real):** Gantt com 40 colunas semanais fixas; LOB com 17 locais fixos; 37 séries num único gráfico.

**Por que é erro:** a obra cresce e o modelo silenciosamente para de cobrir os dados.

**Regra permanente:** nunca assumir intervalo fixo suficiente. Testar 100 / 500 / 2.000 / 10.000 atividades, múltiplas frentes, múltiplos pavimentos, múltiplas obras.

**Como testar:** inserir 50 atividades novas e verificar se Gantt/LOB/CPM/dashboard ainda cobrem todas; verificar se os intervalos das fórmulas incluem as novas linhas.

---

## Checklist rápido de regressão

```
[ ] 01 Cadeia Duração→CPM→Datas→Folga→Crítica é dinâmica (teste +50% numa crítica)
[ ] 02 Nenhuma coluna crítica hardcoded sem rótulo (Entrada/Cálculo/Importado)
[ ] 03 Toda atividade órfã identificada e justificada
[ ] 04 Baseline é snapshot congelado; desvio muda quando o plano muda
[ ] 05 LOB reage a local inicial/final, ritmo e nº de equipes
[ ] 06 Existe PLANEJADO × REALIZADO × SALDO × DESVIO (ou "SEM DADO" explícito)
[ ] 07 Existe estrutura de recursos (mão de obra/equipamento/material) com capacidade
[ ] 08 Duração deriva de Quantidade ÷ Produtividade (ou rotulada manual)
[ ] 09 Campos críticos têm validação de domínio
[ ] 10 Intervalos cobrem o crescimento (teste +50 atividades)
```
