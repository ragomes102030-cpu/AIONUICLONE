# CPM — rede de precedência

## Contents
- Tipos de vínculo
- Forward e backward pass
- Folgas
- Caminho crítico
- Ciclos

## Tipos de vínculo

| Tipo | Significado | Exemplo |
|---|---|---|
| **FS** (Finish-to-Start) | B começa quando A termina | fundação → estrutura |
| **SS** (Start-to-Start) | B começa quando A começa | alvenaria → reboco (com lag) |
| **FF** (Finish-to-Finish) | B termina quando A termina | pintura → acabamento |
| **SF** (Start-to-Finish) | B termina quando A começa | raro, usar com cuidado |

**FS é o padrão.** Os outros exigem **lag explícito** — vínculo sem lag é ambíguo.

**Lag** é o atraso (positivo) ou antecipação (negativo) entre as atividades:
`B.início = A.fim + lag` para FS.

## Forward pass (datas cedo)

```
ES(início) = 0  para atividades sem predecessor
ES = max(EF de todos os predecessores + lag)
EF = ES + duração
```

## Backward pass (datas tarde)

```
LF(fim) = EF do projeto  para atividades sem sucessor
LF = min(LS de todos os sucessores − lag)
LS = LF − duração
```

## Folgas

| Folga | Fórmula | Significado |
|---|---|---|
| **Total** | `LS − ES = LF − EF` | atraso máximo sem afetar o prazo final |
| **Livre** | `min(ES dos sucessores) − EF` | atraso sem afetar o início de qualquer sucessor |

**Folga livre ≤ folga total**, sempre.
Folga total = 0 → atividade **crítica**.

## Caminho crítico

A sequência contígua de atividades com **folga total = 0**, do início ao fim do
projeto. Define a **duração mínima** do projeto.

Pode haver **mais de um** caminho crítico. Se houver, diga quantos.

## Ciclos

Um **ciclo** (A→B→A) torna o CPM matematicamente impossível — não existe ordenação
topológica.

**Detecção:** ordenação topológica (Kahn ou DFS). Se sobrar nó não processado, há ciclo.

**Conduta:** **PARE**. Reporte o ciclo (quais atividades, qual caminho) e não entregue
resultado de CPM. Não existe "CPM aproximado" com ciclo.

## Fórmulas de conferência

Antes de entregar, confira em toda linha:

```
EF = ES + duração
LF = LS + duração
Folga Total = LS − ES
Folga Total = LF − EF
Folga Livre ≤ Folga Total
```

Se qualquer uma falhar, o cálculo está errado.

## Duração do projeto

```
Duração = max(EF de todas as atividades)
```

Igual ao `LF` das atividades finais (sem sucessor).
