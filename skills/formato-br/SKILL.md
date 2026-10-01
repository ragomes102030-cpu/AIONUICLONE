---
name: formato-br
description: "Aplica padroes de formatacao brasileiros (pt-BR) em workbooks Excel criados/editados via officecli — moeda em Reais (R$), datas dd/mm/aaaa, numeros com separador brasileiro, percentuais, mascaras de texto (CPF, CNPJ, CEP, telefone) e convencoes de cabecalho em portugues. Trigger on: 'formato brasileiro', 'formato br', 'pt-BR', 'producao', 'valores em reais', 'R$', 'mascara de CPF/CNPJ', 'data dd/mm/aaaa', 'separador de milhar brasileiro', 'padroes ABNT em planilha', 'portuguese number format', 'BRL currency format'. Scene-layer on officecli-xlsx: herda todas as hard rules do xlsx (zero erros de formula, formulas nao hardcoded, largura de coluna explicita, visual floor). DO NOT invoke para: criar a planilha do zero (use officecli-xlsx), modelos financeiros completos (use financial-modeling), ou QA (use spreadsheet-qa)."
---

# Formato-BR — Padrões pt-BR para planilhas Excel

Aplica formatação brasileira consistente em qualquer workbook .xlsx via officecli. Use após estruturar os dados — formatação nunca é polimento opcional, é parte da entrega.

## Shell & verificação (obrigatório)

- **Sempre aspas simples** em valores com `$`: `--prop numFmt='R$ #,##0.00'`. Em PowerShell, `$` dentro de aspas duplas é interpolado e corrompe o formato.
- **Sempre verifique se o padrão sobreviveu**: `officecli get "$FILE" "/Sheet1/A2"` — `numFmt=` deve mostrar exatamente a string enviada.
- **`###` na célula = largura insuficiente.** Colunas de moeda/datas: `width` 15–18. Não entregar `###`.
- Nunca use separadores literais pt-BR (`.` milhar, `,` decimal) dentro de `numFmt` para formatos genéricos — o Excel localizado interpreta `.` e `,` conforme o locale do sistema. Use os padrões de código abaixo.

## Tabela de numFmt canônicos (pt-BR)

| Propósito | numFmt | Exibição (locale pt-BR) |
|---|---|---|
| Moeda | `'R$ #,##0.00'` | `R$ 1.234,56` |
| Moeda, zeros como traço | `'R$ #,##0.00;(R$ #,##0.00);"-"'` | `R$ 1.234,56` / `-` |
| Moeda negativa entre parênteses | `'R$ #,##0.00;(R$ #,##0.00)'` | `(R$ 1.234,56)` |
| Inteiro com milhar | `'#,##0'` | `1.234` |
| Decimal com milhar | `'#,##0.00'` | `1.234,56` |
| Percentual (1 casa) | `'0.0%'` | `15,0%` |
| Percentual inteiro | `'0%'` | `15%` |
| Data curta | `'dd/mm/yyyy'` | `18/09/2026` |
| Data/hora | `'dd/mm/yyyy hh:mm'` | `18/09/2026 14:30` |
| Número como texto (ano, códigos) | `'@'` ou `--prop type=string` | `2026` (não `2.026`) |

Exemplos de uso:

```bash
officecli set "$FILE" /Sheet1/B5 --prop formula="SUM(B2:B4)" --prop numFmt='R$ #,##0.00;(R$ #,##0.00);"-"'
officecli set "$FILE" /Sheet1/B5 --prop numFmt='R$ #,##0.00;(R$ #,##0.00);"-"'   # re-touch após fórmulas a montante
officecli set "$FILE" /Sheet1/B2 --prop value=42000 --prop numFmt='R$ #,##0.00'
officecli set "$FILE" /Sheet1/C2 --prop value=0.15 --prop numFmt='0.0%'
officecli set "$FILE" /Sheet1/A2 --prop value=2026-09-18 --prop numFmt='dd/mm/yyyy'   # valor ISO; display dd/mm/aaaa
officecli set "$FILE" /Sheet1/D1 --prop value=2026 --prop type=string                  # ano como texto
```

## Mascaras de texto (CPF, CNPJ, CEP, telefone)

Use `'0'` para dígitos obrigatórios e `'-'`/`'.'`/`'/'` literais entre aspas no padrão. Em OOXML, literais em `numFmt` são escapados com `\` ou entre aspas duplas. Sample-safe (sempre conferir no `get`):

| Máscara | numFmt | Exemplo |
|---|---|---|
| CPF | `000"."000"."000"-"00` | `123.456.789-00` |
| CNPJ | `00"."000"."000"/"0000"-"00` | `12.345.678/0001-90` |
| CEP | `00000"-"000` | `01310-100` |
| Telefone fixo | `(00") "0000"-"0000` | `(11) 3456-7890` |
| Celular | `(00") "00000"-"0000` | `(11) 98765-4321` |

> **Atenção shell**: `aspas` e parênteses são metacaracteres. Escreva esses numFmt via **batch JSON** (sem processamento de shell) ou com aspas simples bem formadas, e SEMPRE confirme com `officecli get`. Se o `get` mostrar o padrão corrompido, reescreva via batch heredoc (ver seção `!` trap do officecli-xlsx).

## Bloqueio de locale (avançado)

Para garantir separadores pt-BR **independente do locale do app que abrir o arquivo**, use o prefixo de locale do Excel: `[$R$-416]` (416 = pt-BR; o sufixo R$ torna o cifrão literal).

```bash
officecli set "$FILE" /Sheet1/B5 --prop numFmt='[$R$-416] #,##0.00'
```

Use quando o workbook será aberto em máquinas com locale diferente (ex.: Excel em inglês mostrando `R$ 1234.56`). O padrão genérico `'R$ #,##0.00'` continua o recomendado para uso 100% nacional.

## Convenções de cabeçalho e idioma

- **Unidade vai no cabeçalho, não na célula**: `Valor (R$)` em vez de repetir `R$` linha a linha.
- Terminologia pt-BR de colunas: `Data`, `Descrição`, `Valor`, `Quantidade`, `Unidade`, `Total`, `Desconto`, `Impostos`, `Saldo`, `Observação`.
- Totais: `Total`, `Subtotal`, `Total Geral`.
- Datas em texto corrido (títulos, relatórios): `18/09/2026`, nunca `09/18/2026`.
- Códigos (CFOP, NCM, CNAE, CNPJ, CPF) são **texto**, nunca números — `type=string` para não perder zeros à esquerda e não ganhar separadores.

## Checklist antes de fechar a entrega

- [ ] Todo valor monetário tem `numFmt` de moeda; colunas de moeda com `width` ≥ 15.
- [ ] Ano/códigos como texto (`@` / `type=string`), sem separador de milhar.
- [ ] Zeros monetários exibem `-` em modelos financeiros.
- [ ] Datas com `dd/mm/yyyy`, não `mm/dd/yyyy`.
- [ ] `officecli get` confirma que `$`, parênteses e aspas das máscaras sobreviveram ao shell.
- [ ] `officecli view "$FILE" html`: sem `###`, sem valores cortados.

Não atingir o checklist = entrega não concluída.