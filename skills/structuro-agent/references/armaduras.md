# Armaduras — tabelas e regras

## Contents
- Área de aço por bitola
- Armadura mínima
- Espaçamento e cobrimento
- Ancoragem

## Área de aço (cm² por barra)

| Bitola (mm) | Área 1 barra (cm²) | 2 barras | 3 barras | 4 barras | 5 barras |
|---|---|---|---|---|---|
| 5,0 | 0,196 | 0,39 | 0,59 | 0,79 | 0,98 |
| 6,3 | 0,312 | 0,62 | 0,94 | 1,25 | 1,56 |
| 8,0 | 0,503 | 1,01 | 1,51 | 2,01 | 2,51 |
| 10,0 | 0,785 | 1,57 | 2,36 | 3,14 | 3,93 |
| 12,5 | 1,227 | 2,45 | 3,68 | 4,91 | 6,14 |
| 16,0 | 2,011 | 4,02 | 6,03 | 8,04 | 10,05 |
| 20,0 | 3,142 | 6,28 | 9,42 | 12,57 | 15,71 |
| 25,0 | 4,909 | 9,82 | 14,73 | 19,64 | 24,55 |

Fórmula: `As = π × φ² / 4` (com φ em cm).

## Armadura mínima (NBR 6118, tabela 17.3)

Taxa mínima de armadura longitudinal em vigas: `ρmin = As,min / (b × h)`

| fck (MPa) | ρmin (%) | Observação |
|---|---|---|
| 20 | 0,150 | |
| 25 | 0,150 | |
| 30 | 0,150 | |
| 35 | 0,164 | |
| 40 | 0,179 | |
| 45 | 0,194 | |
| 50 | 0,208 | |

`As,min = ρmin × b × h` (b e h em cm → As em cm²).

**Lajes:** `As,min = 0,67 × ρmin × b × h` (na direção principal).

## Espaçamento

| Elemento | Espaçamento máximo | Mínimo |
|---|---|---|
| Viga (longitudinal) | 2h ou 20 cm | 2 cm ou φ |
| Viga (estribo) | 0,6d ou 30 cm | 5 cm |
| Laje | 2h ou 20 cm | 8 cm |
| Pilar | 2h ou 40 cm | 2 cm ou φ |

## Cobrimento (NBR 6118, tabela 7.2)

| CAA | Laje (mm) | Viga/Pilar (mm) | Fundação (mm) |
|---|---|---|---|
| I | 20 | 25 | 40 |
| II | 25 | 30 | 40 |
| III | 35 | 40 | 50 |
| IV | 45 | 50 | 60 |

**CAA** depende do ambiente: I = rural/urbano seco · II = urbano · III = marinho/
industrial · IV = respingos de maré/industrial agressivo.

## Ancoragem

Comprimento básico de ancoragem `lb` depende de:
- `fbd` (resistência de aderência) → depende de `fck` e do tipo de barra (lisa/nervurada)
- `φ` (bitola)
- `As,calc / As,ef` (relação entre aço calculado e efetivo)

**Regra prática:** `lb ≈ 40φ` para barra nervurada, bom concreto, CAA II.
Use o valor exato de `lb` da NBR 6118 (item 9.4.2.4) no detalhamento final.

## Regra de ouro

Nunca reporte apenas `As` calculado. Reporte:
1. `As` calculado
2. `As,min` normativo
3. **O maior dos dois** (é o que você adota)
4. Bitola e quantidade (ex.: 5 φ16 = 10,05 cm²)
5. Cobrimento conforme CAA
