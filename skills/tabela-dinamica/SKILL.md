---
name: tabela-dinamica
description: "Constroi tabelas dinamicas (pivot tables), slicers e agregacoes em workbooks Excel via officecli a partir de dados tabulares existentes — agrupamento por linha/coluna/filtro, valores com agregacao (soma, media, contagem, min, max), percentuais do total, top-N, campos calculados e filtros visuais. Trigger on: 'tabela dinamica', 'pivot table', 'pivot', 'agrupar por', 'somar por categoria', 'slicer', 'segmentacao de dados', 'relatorio dinamico', 'resumo por regiao', 'mediana/contagem agregada', 'dashboard dinamico com filtro visual'. Scene-layer on officecli-xlsx: herda todas as hard rules (zero erros, formulas vivas, larguras, visual floor, cache discipline). DO NOT invoke para: criar os dados de origem do zero (use officecli-xlsx/data-analysis), apenas formatar planilha (use formato-br), ou QA (use spreadsheet-qa)."
---

# Tabela Dinâmica (Pivot) via officecli

Cria pivot tables e slicers com `officecli add --type pivottable` / `--type slicer`. Schema verificado no help da CLI 1.0.x — quando este documento e o help divergirem, **o help é autoritativo** (`officecli help xlsx pivottable`, `officecli help xlsx slicer`).

## Pré-requisitos dos dados de origem (não negociáveis)

- Fonte em **lista tabular**: linha 1 = cabeçalhos únicos, sem linhas em branco, sem células mescladas.
- Intervalo com prefixo de aba: `source=Sheet1!A1:D100`. Referências externas a outro workbook são rejeitadas.
- Dados numéricos como números de verdade já na origem (valores de texto não somam).
- Checar antes: `officecli view "$FILE" outline` e `officecli query "$FILE" 'cell[type=String]'` na coluna de valores se algo não agregar.

## Fluxo de trabalho

1. **Construa/importe a origem primeiro** (sheet de dados). Não crie pivot sobre célula vazia.
2. **Crie a pivot** em aba própria de resultado — `position` ancorada em célula (ex.: `A3`) ou auto-posicionada após a origem se omitida:

```bash
officecli add "$FILE" /Resultado --type pivottable \
  --prop source=Sheet1!A1:D100 \
  --prop rows=Regiao,Categoria \
  --prop cols=Ano \
  --prop values=Vendas:sum,Quantidade:countNums \
  --prop filters=Segmento \
  --prop position=A3
```

3. **Confira a forma** imediatamente: `officecli get "$FILE" /Resultado/pivottable[1]` — leia `location`, `dataField1` (ex.: `Sum of Vendas:sum:3`) e `fieldCount`.
4. **Formate** (larguras das colunas do resultado, numFmt nos totais) e ajuste o layout.
5. **QA** — veja a seção inferior, obrigatória antes de declarar pronto.

## Propriedades principais (schema real)

| Prop | O que faz | Exemplo |
|---|---|---|
| `rows` | Campos do eixo linha, separados por vírgula | `rows=Regiao,Categoria` |
| `cols` | Campos do eixo coluna | `cols=Ano` |
| `filters` | Campos do eixo filtro (filtro de página) | `filters=Segmento` |
| `values` | Campos de valor como tuplas `Campo:agg` | `values=Vendas:sum,Qty:avg` |
| `aggregate` | Agregação padrão quando omitida em `values` | `aggregate=avg` |
| `showDataAs` | Exibição: `normal`, `percentOfTotal`, `percentOfRow`, `percentOfCol`, `runningTotal` | `showDataAs=percentOfTotal` |
| `topN` | Mantém só os top-N (add-time; filtra origem) | `topN=10` |
| `labelFilter` | Filtro de rótulo `campo:tipo:valor` (add-time) | `labelFilter=Regiao:beginsWith:N` |
| `calculatedField` | Campo calculado `Nome:=Formula` (add-time) | `calculatedField=Margem:=Vendas-Custo` |
| `sort` | Ordenação de rótulo: `asc`, `desc`, `locale`, `none` | `sort=desc` |
| `layout` | `compact` (padrão), `outline`, `tabular` | `layout=tabular` |
| `grandTotals` | `both` / `rows` / `cols` / `none` | `grandTotals=both` |
| `subtotals` | `on` / `off` — subtotais do nível externo | `subtotals=off` |
| `repeatLabels` | Repete rótulos do eixo externo (fillDown) | `repeatLabels=true` |
| `blankRows` | Linha em branco após cada grupo | `blankRows=true` |
| `style` | Estilo embutido, ex. `PivotStyleMedium9` | `style=PivotStyleMedium9` |
| `showRowStripes` / `showColStripes` | Listras zebradas no estilo | `showRowStripes=true` |
| `mergeLabels` | Mescla células do eixo externo (add-time) | `mergeLabels=true` |
| `showDrill` | Botões +/− de expandir/colapsar (add-time) | `showDrill=false` |

**Agregações disponíveis** (`agg`): `sum`, `avg`, `count`, `max`, `min`, `product`, `stdev`, `stdevp`, `var`, `varp`, `countNums`.

**Não suportado (verificado)**: `showDataAs` em `percentOfParent` / `rankAscending` / `rankDescending` / `index` / `difference` / `percentDifference`. `topN`, `labelFilter`, `calculatedField`, `showDrill`, `mergeLabels` e `showDataAs` **só funcionam no add** — `set` os ignora. Eixos `pivotfield/pivotrow/pivotcolumn/pivotdata` no `get` são somente leitura.

## Slicer (filtro visual)

Requer pivot existente; `field` deve casar com um cacheField (case-insensitive).

```bash
officecli add "$FILE" /Resultado --type slicer \
  --prop pivotTable=/Resultado/pivottable[1] \
  --prop field=Regiao \
  --prop caption='Filtrar por Região' \
  --prop columnCount=3 \
  --prop rowHeight=250000
```

`caption` é o texto visível no cabeçalho do slicer (padronização pt-BR). `columnCount` = colunas de botões na grade. Slicer é ancorado ao campo no momento do add — depois não se troca o campo.

## Cheat-sheet de padrões comuns

```bash
# Total por categoria, só soma
officecli add "$FILE" /R --type pivottable --prop source=Dados!A1:D200 \
  --prop rows=Categoria --prop values=Valor:sum --prop position=A3 --prop grandTotals=both

# Participação % do total
officecli add "$FILE" /R --type pivottable --prop source=Dados!A1:D200 \
  --prop rows=Categoria --prop values=Valor:sum --prop showDataAs=percentOfTotal --prop style=PivotStyleMedium9

# Top 10 clientes por receita
officecli add "$FILE" /R --type pivottable --prop source=Dados!A1:D200 \
  --prop rows=Cliente --prop values=Receita:sum --prop topN=10 --prop sort=desc

# Campo calculado de margem + retenção de eixos
officecli add "$FILE" /R --type pivottable --prop source=Dados!A1:D200 \
  --prop rows=Produto --prop values=Vendas:sum --prop calculatedField=Margem:=Vendas-Custo --prop layout=tabular
```

Múltiplos campos calculados: `calculatedField1=... --prop calculatedField2=...`.

## QA obrigatório antes de entregar

- [ ] `officecli get "$FILE" /R/pivottable[1]` — `location` plausível, `dataField1` com os nomes esperados (`Sum of ...`); `set` em `sort`/`layout`/`grandTotals` reflete no readback.
- [ ] `officecli view "$FILE" html` (leia o HTML retornado): pivot renderizada, slicer visível, sem `###`.
- [ ] Larguras das colunas do resultado ajustadas (o pivot não auto-ajusta).
- [ ] Células de valor com numFmt coerente (`R$ #,##0.00` etc. — ver skill `formato-br`).
- [ ] Fonte de dados NÃO tem linha/cabeçalho em branco — erro clássico de pivot somando errado.
- [ ] Após re-touch de fórmulas da origem, confira o pivot (os valores lidos vêm do cache da origem).

Limitação honesta: `validate` não valida a lógica do pivot; números corretos dependem de origem bem formada. Não declare pronto sem o ciclo acima.