# Domínios de deformação (NBR 6118)

## Contents
- O que é domínio
- Os 6 domínios
- Como identificar
- Por que domínio 4 é proibido

## O que é domínio

O domínio descreve como a seção transversal se deforma no estado limite último.
Depende da posição relativa da linha neutra (`x/d`) e define se a ruptura é dúctil
(com aviso) ou frágil (sem aviso).

## Os 6 domínios

| Domínio | `x/d` | Ruptura | Concreto | Aço | Aceitável |
|---|---|---|---|---|---|
| 1 | ≤ 0,0 | tração | não esmagado | escoa | sim (raro) |
| 2 | 0 – 0,259 | dúctil | εc < 3,5‰ | εs ≥ 10‰ | **sim** |
| 3 | 0,259 – 0,628 | dúctil | εc = 3,5‰ | εs entre 2,07‰ e 10‰ | **sim** |
| 4 | 0,628 – 1,0 | **frágil** | εc = 3,5‰ | εs < 2,07‰ | **NÃO** |
| 4a | 1,0 – h/d | **frágil** | εc = 2‰ no topo | εs < 2,07‰ | **NÃO** |
| 5 | > h/d | **frágil** | ruptura sem armadura | — | **NÃO** |

## Como identificar

```
x = posição da linha neutra (resolvida pela equação de equilíbrio)
d = altura útil = h − cobrimento − φ_estribo − φ_barra/2
x/d = 0,628  → fronteira domínio 3 / 4  (limite normativo)
```

O limite normativo de `x/d` para concreto C50 ou menos é **0,45** para garantir
ductilidade (NBR 6118, item 14.6.4.3) — mais restritivo que a fronteira física 0,628.

## Por que domínio 4 é proibido

Em domínio 4, o concreto rompe por esmagamento **antes** de o aço escoar. Não há
aviso: a peça colapsa sem deformação visível. Isso é inaceitável em estrutura.

**Regra prática:** se o cálculo cair em domínio 4, aumente a seção ou a armadura de
compressão (armadura dupla). Nunca aceite o resultado.

## Como reportar

Sempre declare no resultado:
- `x` e `d` (com as unidades)
- `x/d` calculado
- Domínio identificado
- Se está dentro do limite normativo (0,45 para C≤50)
