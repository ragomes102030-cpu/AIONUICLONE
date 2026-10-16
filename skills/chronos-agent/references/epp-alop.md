# EPP e ALOP — obra repetitiva

## Contents
- O que é EPP
- O que é ALOP
- Como calcular
- Interpretação

## O que é EPP

**EPP** = Eficiência da Programação de Produção.
Mede se a **sequência** das atividades respeita a **continuidade** das equipes.

```
EPP = (soma das durações com continuidade) / (soma das durações reais)
```

- EPP = 1,0 → sequência perfeita, equipe nunca para
- EPP < 1,0 → há ociosidade ou interferência

## O que é ALOP

**ALOP** = Análise da Linha de Operação (Line of Balance aplicada).
Trabalha com **ritmo** (unidades/dia) por atividade, em obra repetitiva.

```
Ritmo = Quantidade por unidade / Duração por unidade
```

Para uma obra com `N` unidades repetidas:

```
Duração total = Duração da 1ª unidade + (N − 1) × Ritmo
```

## Como calcular

**Exemplo:** edifício de 12 pavimentos tipo.

| Atividade | Dur/pav (dias) | Ritmo |
|---|---|---|
| Alvenaria | 2,0 | 0,50 pav/dia |
| Reboco | 2,5 | 0,40 pav/dia |
| Pintura | 3,0 | 0,33 pav/dia |

**Ritmo do projeto** = a atividade **mais lenta** = pintura (0,33 pav/dia).

```
Duração total = 3,0 + (12 − 1) × 3,0 = 36 dias
```

Se alvenaria e reboco começam no mesmo pavimento, a pintura termina 36 dias depois
do início da alvenaria — mas reboco e pintura ficam **esperando** (ociosidade).

## Interpretação

| Situação | EPP | Significado | Ação |
|---|---|---|---|
| Ritmos iguais | 1,0 | sequência perfeita | manter |
| Ritmo varia | < 1,0 | ociosidade entre atividades | balancear equipes |
| Ritmo crescente | > 1,0 | impossível — erro de dado | revisar |

**Como balancear:** ajuste o **nº de equipes**, não o ritmo.
Ritmo é consequência de produtividade × equipes.

```
Equipes necessárias = Quantidade / (Produtividade × Duração desejada)
```

## Quando usar

| Situação | Ferramenta |
|---|---|
| Obra repetitiva (pavimento tipo, unidade) | **LOB / ALOP** |
| Obra linear não repetitiva | CPM puro |
| Misto | CPM + LOB nas partes repetitivas |

## Erro comum

**Mudar o ritmo sem mudar as equipes** esconde o custo real.
"Vou rebocar mais rápido" sem adicionar equipe significa horas extras ou
produtividade irreal. Sempre explicite o que muda: equipes ou horas.

## Checklist

- [ ] Obra é realmente repetitiva (senão, use CPM)
- [ ] Ritmo derivado de produtividade × equipes (não digitado)
- [ ] Atividade mais lenta identificada (define o ritmo do projeto)
- [ ] Interferências listadas (cruzamento de linhas)
- [ ] Balanceamento propõe mudança de **equipes**
- [ ] EPP calculado e interpretado
