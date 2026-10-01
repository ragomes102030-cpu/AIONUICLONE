---
name: planejamento-obras-engenharia
description: "Use this skill as the MANDATORY verification/audit layer for ANY construction planning workbook or planning system — EAP/WBS, activities, predecessors, CPM, critical path, Gantt, Line of Balance (LOB), productivity, pace, crews, resources, production, measurement, physical/financial progress, S-curve, baseline, rescheduling, constraints, costs, EVM, multi-front and per-floor repetitive planning. It enforces 'IMPLEMENTAR NÃO SIGNIFICA CONCLUIR': implementation is only done after functional test → structural audit → mathematical audit → parameter-change test → regression → validation. Trigger on: 'planejamento de obras', 'cronograma', 'EAP', 'WBS', 'atividades', 'predecessoras', 'CPM', 'caminho crítico', 'Gantt', 'linha de balanço', 'LOB', 'produtividade', 'equipes', 'recursos', 'produção', 'medição', 'avanço físico', 'avanço financeiro', 'curva S', 'baseline', 'replanejamento', 'restrições', 'custos', 'EVM', 'múltiplas frentes', 'pavimento', 'planejamento repetitivo', 'sistema de planejamento', 'auditar planilha de obra', 'CPM congelado', 'baseline falsa'. Use it ALWAYS before declaring a planning workbook ready, and whenever auditing, reviewing, testing or diagnosing one. Scene-layer on officecli-xlsx / construction-planning / cpm-scheduling / gantt / lob / production-control / spreadsheet-audit / delivery-gate. DO NOT invoke for: creating a workbook from scratch without any planning content (use officecli-xlsx), pure financial modeling (use financial-modeling), or generic workbook QA unrelated to planning (use spreadsheet-qa)."
---

> **⚠️ Platform note — read before running any command.** The shell snippets in this skill are written for **macOS / Linux** (bash/zsh). Always check which OS you are on first. On **Windows** do **not** run them verbatim — translate the surrounding shell syntax to PowerShell:
>
> | bash (macOS / Linux) | PowerShell (Windows) |
> | --- | --- |
> | `a && b` | run as two steps, or `a; if ($?) { b }` |
> | `VAR=$(cmd)` → `$VAR` | `$VAR = cmd` |
> | `cmd > /dev/null` | `cmd > $null` |
> | `… \| grep PAT` | `… \| Select-String PAT` |
> | `… \| jq …` | `… \| ConvertFrom-Json` |
> | `python3 x.py` | `python x.py` (or `py x.py`) |
> | `~/dir`, `/tmp` | `$env:USERPROFILE\dir`, `$env:TEMP` |
> | `cp` / `mkdir -p` / `rm -rf` | `Copy-Item` / `New-Item -ItemType Directory -Force` / `Remove-Item -Recurse -Force` |

# Planejamento de Obras — Protocolo de Verificação e Auditoria

Esta é a **camada de verificação** do planejamento de obras. Ela não ensina a construir a EAP (isso é `construction-planning`), nem a rede CPM (`cpm-scheduling`), nem o Gantt (`gantt`), nem a LOB (`lob`), nem a produção (`production-control`). Ela garante que **o que foi construído é confiável** — e impede que um cronograma bonito esconda um motor quebrado.

## Regra central

> **IMPLEMENTAR NÃO SIGNIFICA CONCLUIR.**

Uma entrega só termina após as 8 etapas:

```
Implementação → Teste funcional → Auditoria estrutural → Auditoria matemática
→ Teste de alteração de parâmetros → Teste de regressão → Validação dos resultados → Conclusão
```

Status válidos: **APROVADO · APROVADO COM RESSALVAS · BLOQUEADO POR ERRO**.
Nunca "CONCLUÍDO" com erro crítico aberto.

## Pergunta final (sempre)

> **"Se eu fosse usar isso amanhã para planejar uma obra real, qual erro poderia passar despercebido e gerar uma decisão errada?"**

Depois **tente encontrar esse erro**. Se encontrar: **CORRIGIR → TESTAR → AUDITAR NOVAMENTE**.

## Loop de revisão obrigatório — certificar 10/10

> **Revise o trabalho concluído — e continue revisando, quantas vezes forem necessárias, até certificá-lo 10/10.** "Zero erros de fórmula" NÃO é prova de que funciona.

A revisão é **empírica**, nunca declarativa:

1. **Inspecione os valores reais**, não a existência de fórmulas/colunas/gráficos.
2. **Altere uma entrada e verifique a propagação** (matriz causa→efeito). Se deveria mover e não move → **DEFEITO**: corrija e revise do zero.
3. **Releia os seus próprios scripts de teste** — um teste que passa pode estar errado (célula/linha/coluna errada, encoding corrompido).
4. **Questione todo resultado verde**: o número é plausível? (contagem negativa, data imóvel, curva plana).
5. Só após **zero defeitos** numa passada completa: **APROVADO 10/10**. Senão: corrigir → retestar → reauditar → repetir.

Casos reais que esse loop pegou (não podem voltar): feriado sem efeito porque `FERIADOS` estava congelado em 12 linhas · CPM com **offset literal** na fórmula · motor com 3 slots para atividade de **4** relações · teste lendo a **coluna errada** da LOB.

**Nunca declarar "concluído" na primeira execução verde.**

## Princípio de auditoria adversarial

Não confirme que funciona — **tente quebrá-lo**. Pergunta padrão:

> "Como uma alteração feita pelo usuário poderia produzir um resultado incorreto sem que ele percebesse?"

## Proibições de avaliação (violação = bloqueio)

- ❌ Avaliar qualidade pela **quantidade de abas, gráficos ou títulos**.
- ❌ Considerar funcionalidade existente **porque existe uma coluna com aquele nome**.
- ❌ Presumir que uma fórmula existe, que calcula certo, ou que um dado está atualizado.
- ❌ Tratar **resultado importado** (MCP/Python/API/outro sistema) como **calculado pelo motor**.
- ❌ Aceitar **baseline = planejamento atual** (gera desvio sempre 0).

Avalie pela capacidade de: **RECEBER DADOS → CALCULAR → PROPAGAR ALTERAÇÕES → PRODUZIR RESULTADOS → VALIDAR RESULTADOS**.

---

## Fluxo de verificação

### 1. Estrutural (o que existe de fato)
Abas, tabelas, intervalos, fórmulas, referências entre abas, validações, formatação condicional, gráficos. Para cada **coluna crítica**, classifique: **Entrada** · **Cálculo** · **Referência** · **Importado**.

### 2. Matemático (o cálculo está certo?)
Recompute o CPM **independentemente** (forward + backward pass) e compare com o que está na planilha. Divergência de ES/EF/LS/LF/folga = bloqueio.

### 3. Dinâmico (propaga?)
Preencha a matriz causa→efeito. Se uma entrada deveria mudar algo e **não muda**, é **FALHA**:

| Entrada alterada | Deveria mudar | Mudou? | Correto? |
|---|---|---|---|
| Duração | CPM → datas → folga → crítica | | |
| Predecessora / tipo / lag | CPM | | |
| Data inicial | cronograma inteiro | | |
| Produtividade | duração | | |
| Quantidade | duração | | |
| Equipe / nº equipes | duração / produção | | |
| Realizado | avanço / desvio / curva S | | |
| Baseline (snapshot) | desvio | | |
| Local inicial/final | LOB | | |
| Calendário / feriados | todas as datas | | |

### 4. Regressão
Rode os **10 casos obrigatórios** de [CASOS-REGRESSAO.md](CASOS-REGRESSAO.md). Eles já ocorreram em auditoria real e não podem voltar.

### 5. Integridade
Fórmulas quebradas (`#REF! #VALUE! #DIV/0! #NAME? #N/A #NUM!`), referências circulares, referências externas, células hardcoded onde deveria haver fórmula, fórmulas diferentes na mesma coluna, intervalos incompletos, gráficos apontando para intervalos errados, datas incompatíveis (EF<ES), unidades incompatíveis, atividades órfãs, predecessoras inexistentes, IDs duplicados/quebrados, folga negativa.

Classifique cada achado: **CRÍTICO · ALTO · MÉDIO · BAIXO**.

### 6. Escalabilidade
Teste 100 / 500 / 2.000 / 10.000 atividades, múltiplas frentes, múltiplos pavimentos, múltiplas obras. Nunca assumir intervalo fixo suficiente (colunas de Gantt/LOB, séries de gráfico, faixas de fórmula).

### 7. Fonte única da verdade
Liste dados que aparecem em mais de um lugar (data de início em Cadastro/CPM/Gantt/LOB/Dashboard) e aponte **qual é a oficial**. Várias fontes independentes = risco arquitetural.

### 8. Rastreabilidade
Para cada indicador, prove a cadeia: **indicador → cálculo → atividades → produção → dado de entrada**. Se a cadeia para num valor fixo, é problema.

---

## Regras permanentes

1. **Baseline = SNAPSHOT CONGELADO** (valores). Planejamento atual = dinâmico. `Desvio = Atual − Baseline`.
2. **Resultado importado ≠ calculado.** Se vier de fora, rotule **IMPORTADO**; se a intenção é motor, o cálculo deve existir no motor.
3. **Duração** = `Quantidade ÷ Produtividade ÷ Nº equipes` (respeitando calendário). Se for decisão manual, rotule **entrada manual**.
4. **LOB parametrizada**: depende de atividade, local inicial/final, pavimento, frente, produtividade, ritmo, nº equipes, calendário e predecessoras.
5. **Planejado × Realizado × Saldo × Desvio** sempre separados. Ausência de produção **não** é zero — rotule **SEM DADO**.
6. **Atividade órfã**: identificar → justificar → validar. Sem justificativa = risco.
7. **Validação de domínio** em todo campo crítico (tipo de relação, unidade, IDs, status, local, percentuais 0–100).
8. **Não mexer no que funciona** ao corrigir.

## Armadilhas técnicas validadas (Excel)

- **Agregar coluna inteira da rede** (`MAXIFS`/`SUMPRODUCT`) cria **referência circular**. Use **slots limitados** (3 pred + 3 succ) com `INDEX/MATCH` — `INDEX(range,n)` depende só da célula *n*, então o grafo fica acíclico e **não precisa de cálculo iterativo**.
- **`MAXIFS`/`MINIFS` não existem** em LibreOffice antigo / Excel < 2019 → use `SUMPRODUCT`.
- **`MIN/MAX` dentro de `SUMPRODUCT` colapsam para escalar** → use clamp algébrico `(x>=1)*1+(x<1)*(x>0)*x`.
- Fórmulas de data com **offset literal** (`WORKDAY(DATA_INICIAL,0.0,...)`) = cronograma **congelado** (CASO 01).
- MCP EAP: `unidade` usa **`ml`** para metro linear (não `m`).

## Scripts de apoio

```bash
# auditoria estrutural + detectores de regressão + recálculo real
python scripts/auditar_xlsx.py "<planilha.xlsx>" --recalc

# validação matemática independente do CPM
python scripts/recomputar_cpm.py "<dados.json>"
```

Para recalcular fora do Excel: `soffice --headless --convert-to xlsx --outdir <saida> "<planilha.xlsx>"` e depois ler com `openpyxl(data_only=True)` procurando as strings de erro.

## Relatório obrigatório de conclusão

```markdown
## IMPLEMENTADO
## TESTADO
## AUDITADO
## REGRESSÃO
## PROBLEMAS ENCONTRADOS
## RISCOS
## PENDÊNCIAS
## STATUS: APROVADO | APROVADO COM RESSALVAS | BLOQUEADO POR ERRO
```

Formato de achado: **Onde está → Qual é o problema → Por que é um problema → Qual deveria ser o comportamento → Como corrigir** + severidade.

## Classificação de nível (por evidência, não por impressão)

| Nível | Critério |
|---|---|
| 1 Planilha visual | serve para apresentação |
| 2 Planilha de controle | tem cálculos, mas depende muito de intervenção manual |
| 3 Planilha paramétrica | dados estruturados + cálculos integrados |
| 4 **Motor de planejamento** | gera/atualiza CPM, Gantt, LOB, produção e indicadores de forma integrada |
| 5 Sistema de planejamento | arquitetura de dados, rastreabilidade, replanejamento, histórico, múltiplas obras |

**Regra de ouro:** se o cálculo central (CPM) for **importado** em vez de calculado, o teto é **Nível 2** — não importa quantas abas/gráficos existam.

## Recursos

- [CASOS-REGRESSAO.md](CASOS-REGRESSAO.md) — os 10 casos obrigatórios com evidência real.
- [PROTOCOLO-AUDITORIA.md](PROTOCOLO-AUDITORIA.md) — 10 etapas + template de relatório.
- [MODELAGEM.md](MODELAGEM.md) — fórmulas validadas (CPM FS/SS/FF/SF com lag, LOB, roll-up ponderado, curva S) e lições do OpenProject/Primavera/Mattos.
- `scripts/auditar_xlsx.py`, `scripts/recomputar_cpm.py`.
