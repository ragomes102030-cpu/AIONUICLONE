# Protocolo de Auditoria Pós-Tarefa

Aplicar ao fim de **toda** implementação de planejamento. Somente leitura até o diagnóstico ser aprovado — **não corrigir durante a auditoria**.

## As 10 etapas

| # | Etapa | Como executar | Evidência esperada |
|---|---|---|---|
| 1 | **Verificar o que foi alterado** | `git diff` / comparar arquivos / listar abas e células tocadas | lista do que mudou |
| 2 | **Identificar o que depende da alteração** | mapa de referências entre abas (`scripts/auditar_xlsx.py` seção 3) | grafo Entrada→Processamento→Resultado |
| 3 | **Testar a funcionalidade** | recalcular (LibreOffice headless) e conferir 0 erros | contagem de erros por aba |
| 4 | **Alterar os principais parâmetros** | matriz causa→efeito (SKILL.md) | tabela preenchida |
| 5 | **Verificar propagação** | mudar 1 input e rastrear até o indicador final | cadeia input→resultado |
| 6 | **Executar regressão** | os 10 casos de [CASOS-REGRESSAO.md](CASOS-REGRESSAO.md) | checklist 10/10 |
| 7 | **Procurar hardcodes** | fórmulas com números/datas/textos literais em colunas de cálculo | lista por coluna |
| 8 | **Procurar inconsistências** | IDs duplicados/órfãos, unidades incompatíveis, EF<ES, folga negativa | contagem por tipo |
| 9 | **Procurar dados congelados** | valores onde deveria haver fórmula; baseline `=atual`; resultado importado sem rótulo | lista com classificação |
| 10 | **Gerar relatório** | template abaixo | relatório |

## Comandos

```bash
# Auditoria estrutural completa (somente leitura)
python scripts/auditar_xlsx.py "<planilha.xlsx>"

# Validação matemática do CPM
python scripts/recomputar_cpm.py "<dados.json>"

# Recálculo real (LibreOffice) para ver valores calculados
soffice --headless --convert-to xlsx --outdir "<out>" "<planilha.xlsx>"
```

## Template de relatório

```markdown
# AUDITORIA — <arquivo>            Data: <data>   Método: somente leitura

## A. RESUMO EXECUTIVO
<1 parágrafo: o motor existe? o que é cálculo, o que é visualização, o que é importado>

## B. MAPA DA ARQUITETURA ATUAL
Entrada → Processamento → Resultado (por módulo)

## C. MATRIZ DE FUNCIONALIDADES
| Funcionalidade | Existe | Funcionando | Automatizada | Observação |

## D. MATRIZ DE RISCOS
| Problema | Severidade | Evidência | Impacto | Correção |

## E. TESTE CPM            ## F. TESTE GANTT         ## G. TESTE LOB
## H. TESTE PRODUÇÃO       ## I. TESTE REPLANEJAMENTO ## J. TESTE ESCALABILIDADE
## K. TESTE DE INTEGRIDADE

## L. GAPS ARQUITETURAIS
## M. O QUE JÁ ESTÁ BOM
## N. O QUE NÃO DEVE SER ALTERADO
## O. O QUE PRECISA SER CORRIGIDO
## P. O QUE PRECISA SER RECONSTRUÍDO

## Q. ROADMAP
P0 — obrigatório para funcionar
P1 — necessário para planejamento profissional
P2 — evolução
P3 — recursos avançados

## CLASSIFICAÇÃO FINAL (Nível 1–5)
## PERGUNTA PRINCIPAL — resposta fundamentada em evidência
```

## Classificação de nível (por evidência, não por impressão)

| Nível | Nome | Critério |
|---|---|---|
| 1 | Planilha visual | serve para apresentação |
| 2 | Planilha de controle | tem cálculos, mas depende muito de intervenção manual |
| 3 | Planilha paramétrica | dados estruturados + cálculos integrados |
| 4 | **Motor de planejamento** | gera e atualiza CPM, Gantt, LOB, produção e indicadores de forma integrada |
| 5 | Sistema de planejamento | arquitetura de dados, rastreabilidade, replanejamento, histórico, múltiplas obras |

**Regra de ouro:** se o cálculo central (CPM) for **importado** em vez de calculado, o teto é **Nível 2** — não importa quantas abas/gráficos existam.

## Matriz de rastreabilidade (exigida)

Para cada indicador importante, provar a cadeia completa:

```
Indicador → cálculo → atividades → produção → dado de entrada
```

Ex.: `% avanço físico` deve rastrear até a quantidade executada lançada. Se a cadeia para num valor fixo, registrar como problema.

## Dupla fonte de verdade

Listar dados que aparecem em mais de um lugar (ex.: data de início em Cadastro, CPM, Gantt, LOB, Dashboard) e apontar **qual é a oficial**. Várias fontes independentes = **risco arquitetural**.
