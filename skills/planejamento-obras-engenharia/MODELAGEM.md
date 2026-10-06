# Modelagem — fórmulas validadas

Referência técnica para implementar o motor de planejamento em Excel (testado em Excel 365 **e** LibreOffice Calc).

## 1. Duração e ritmo

```
Nº Locais   = MATCH(LocFim, LOCAIS) - MATCH(LocIni, LOCAIS) + 1
Duração     = ROUNDUP(Quantidade / Produtividade / NºEquipes, 0)      [dias úteis]
Ritmo       = ROUND(Duração / Nº Locais, 0)                            [dias úteis por local]
```

Se a duração for decisão manual, **rotular como entrada manual** (não fingir que é cálculo).

## 2. CPM — forward pass (datas cedo)

```
ES_i = MAX( DATA_INICIAL , MAX sobre as predecessoras de (driver_ES) )
EF_i = WORKDAY(ES_i, Duração_i - 1, FERIADOS)
```

`driver_ES` por tipo de relação (pred p, sucessora s, lag L em dias úteis):

| Tipo        | Significado     | driver_ES                                  |
| ----------- | --------------- | ------------------------------------------ |
| **FS / TI** | Término-Início  | `WORKDAY(EF_p, 1 + L, FERIADOS)`           |
| **SS / II** | Início-Início   | `WORKDAY(ES_p, L, FERIADOS)`               |
| **FF / TT** | Término-Término | `WORKDAY(EF_p, L - (Dur_s - 1), FERIADOS)` |
| **SF / IT** | Início-Término  | `WORKDAY(ES_p, L - (Dur_s - 1), FERIADOS)` |

## 3. CPM — backward pass (datas tarde)

```
LF_i = MIN( DATA_FINAL , MIN sobre as sucessoras de (driver_LF) )
LS_i = WORKDAY(LF_i, -(Duração_i - 1), FERIADOS)
Folga Total = NETWORKDAYS(ES_i, LS_i, FERIADOS) - 1
Crítica     = Folga <= 0
DATA_FINAL  = MAX(EF de todas as atividades)
```

`driver_LF` (imposto à predecessora p pela sucessora s):

| Tipo        | driver_LF                                                   |
| ----------- | ----------------------------------------------------------- |
| **FS / TI** | `WORKDAY(LS_s, -1 - L, FERIADOS)`                           |
| **SS / II** | `WORKDAY(WORKDAY(LS_s, -L, FERIADOS), Dur_p - 1, FERIADOS)` |
| **FF / TT** | `WORKDAY(LF_s, -L, FERIADOS)`                               |
| **SF / IT** | `WORKDAY(WORKDAY(LF_s, -L, FERIADOS), Dur_p - 1, FERIADOS)` |

## 4. ARMADILHA CRÍTICA — agregação de coluna gera referência circular

Agregar com `MAXIFS/MINIFS/SUMPRODUCT` sobre a **coluna inteira** da rede cria ciclo:
`ES(A1020) → M(relação de A1030) → ES(A1020)`. O Excel avalia todas as células da faixa, inclusive as que dependem do próprio resultado.

**Solução validada (sem cálculo iterativo): motor por SLOTS LIMITADOS.**

- Na aba `REDE`, adicione chaves de rank:
  ```
  Rank_Succ = COUNTIF($B$4:$B4, $B4)      ' 1ª, 2ª... relação de cada sucessora
  Chave_Succ = $B4 & "#" & $G4            ' ex.: "A1040#1"
  Rank_Pred / Chave_Pred  (idem para a predecessora)
  ```
- Em `CPM_CALC`, por atividade, resolva até 3 predecessoras e 3 sucessoras:
  ```
  Rel_k = IFERROR(MATCH($A4 & "#" & k, REDE!$Chave_Succ, 0), 0)
  ```
  e calcule o `driver_ES` de cada slot **referenciando apenas as datas da atividade predecessora** via `INDEX(..., Rel_k)`.
- `ES = MAX(DATA_INICIAL, DES1, DES2, DES3)` · `LF = MIN(DATA_FINAL, DLF1, DLF2, DLF3)` (com sentinela alto quando o slot não existe).

**Por que funciona:** `INDEX(range, n)` depende **apenas da célula n** (verificado). Como o slot referencia só predecessoras/sucessoras (nós distintos), o grafo é acíclico e o Excel calcula direto.

> Não use `MAXIFS/MINIFS` se precisar rodar em LibreOffice antigo ou Excel < 2019 — não existem lá. Use `SUMPRODUCT`.

## 5. ARMADILHA — `MIN/MAX` dentro de `SUMPRODUCT` não é element-wise

```excel
' ERRADO (colapsa para escalar → resultado 0):
SUMPRODUCT(peso, MIN(1, MAX(0, x)))

' CERTO (clamp algébrico element-wise):
SUMPRODUCT(peso, (x>=1)*1 + (x<1)*(x>0)*x)
```

## 6. LOB — Linha de Balanço

```
data(pavimento k) = WORKDAY(ES_atividade, (k - PosIni) * Ritmo, FERIADOS)
```

- Eixo Y = pavimento/local (ordenado por cota, **do topo para a base**).
- Eixo X = tempo (escala semanal é a mais legível).
- **1 série por atividade** (gráfico de dispersão); inclinação = ritmo.
- Só plotar a **faixa** de pavimentos da atividade (`PosIni..PosFim`), nunca todos.
- Cruzamento de linhas / espera / conflito: comparar `ritmo` da sucessora com o da predecessora. **Sucessora mais rápida que a predecessora ⇒ risco de interferência** (equipe parada). Balancear mudando o nº de equipes.

## 7. Roll-up de progresso (padrão OpenProject)

```
% do pai = SUMPRODUCT(quantidade dos filhos, % dos filhos) / SUM(quantidade dos filhos)   ' work_weighted_average
```

Alternativa: média simples (`simple_average`). O pai **não** tem data própria: `início = MIN(ES dos filhos)`, `fim = MAX(EF dos filhos)` (clamp).

## 8. Curva S

```
planejado(d) = SUMPRODUCT(peso, clamp((d - ES + 1)/(EF - ES + 1))) / SUM(peso)     ' clamp algébrico da seção 5
realizado(d) = obtido da produção (nunca 0 por omissão → "SEM DADO")
```

## 9. Calendário

- `WORKDAY` / `NETWORKDAYS` com faixa de feriados nomeada (`FERIADOS`).
- Para 6 dias/semana ou turnos: `WORKDAY.INTL` / `NETWORKDAYS.INTL`.
- Calendário **por recurso** (não só da obra) quando houver turnos distintos.

## 10. Lições dos sistemas de referência

**OpenProject** (`opf/openproject`, GPL-3.0) — o que copiar:

- Hierarquia como **closure table** (`WorkPackageHierarchy`: descendant, ancestor, generations) — não recursão.
- **`SetScheduleService` + `ScheduleDependency`**: recalcula em cascata na ordem `predecessoras→sucessoras` e `filhos→pais`; **mover para frente empurra seguidoras, mover para trás não puxa**.
- **Baseline = time-travel nos Journals** (`at_timestamp`), não tabela duplicada.
- Relações canônicas (`precedes`/`follows`) com **lag em dias úteis** (±2000).
- Progresso: `field|status` + agregação `work_weighted_average|simple_average`.
- Recursos: `ResourceAllocation` com **detecção de overbooking**.

**Primavera P6:** Progress Line (zig-zag vs baseline), barras de baseline fixas, Data Date deslizante, calendário por recurso.

**Mattos, _Planejamento e Controle de Obras_:** Linha de Balanço (cap. 20) — ritmo, balanceamento das operações, dimensionamento de equipes (`equipes = tempo_unitário ÷ ritmo_desejado`).

## 11. MCPs de obra disponíveis

| MCP        | Endpoint                                 | Uso                                                                                                                                          |
| ---------- | ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| EAP        | `mcp-eap-server.onrender.com/mcp`        | criar/validar EAP (18 tools) · vocabulário fechado: `unidade` = `m² m³ ml un pt vb conj kg` (**`ml`**, não `m`) · `tipo_frente` (14 valores) |
| Cronograma | `mcp-cronograma-server.onrender.com/mcp` | atividades, dependências (TI/II/TT/IT), `calcular_caminho_critico`, `salvar_baseline`, `comparar_baseline`, `curva_s`                        |
| Gantt/LOB  | `mcp-gantt-lob-server.onrender.com/mcp`  | `gerar_gantt`, `calcular_linha_balanco`, `balancear_ritmos_lob`, `dimensionar_equipes_lob`                                                   |

**Lição de integração:** resultado de MCP é **IMPORTADO**. Se a planilha precisa ser motor, replique o cálculo em fórmula (ou sincronize explicitamente).
