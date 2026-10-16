# BDI — composição e fórmula

## Contents
- O que é BDI
- Fórmula correta
- Componentes típicos
- Erro comum

## O que é BDI

**BDI** = Benefícios e Despesas Indiretas.
É o fator que transforma **custo direto** em **preço de venda**.

Cobre: administração central, administração local, riscos, garantias, lucro e
tributos.

## Fórmula correta (TCU Acórdão 2.622/2013)

```
BDI = [ (1+AC+S+R+G)(1+DF)(1+L) / (1−T) ] − 1
```

Onde:
| Sigla | Componente |
|---|---|
| **AC** | Administração Central |
| **S** | Seguros |
| **R** | Riscos |
| **G** | Garantias |
| **DF** | Despesas Financeiras |
| **L** | Lucro |
| **T** | Tributos (PIS, COFINS, ISS, CPRB) |

**A multiplicação/divisão é o ponto crítico** — os componentes não se somam
linearmente. Tributo incide sobre o preço (por isso divide), o resto é custo
(por isso multiplica).

## Componentes típicos (valores de referência)

| Componente | Obra simples | Obra média | Obra complexa |
|---|---|---|---|
| AC | 3 – 5% | 4 – 8% | 6 – 12% |
| S | 0,3 – 1% | 0,5 – 1,5% | 1 – 2% |
| R | 0,5 – 2% | 1 – 3% | 2 – 5% |
| G | 0 – 1% | 0,5 – 2% | 1 – 3% |
| DF | 0,5 – 1,5% | 1 – 2% | 1 – 3% |
| L | 5 – 10% | 7 – 12% | 8 – 15% |
| T | 6 – 10% | 8 – 13% | 10 – 16% |

**BDI total resultante:** tipicamente **20% a 45%** dependendo da complexidade.

## Erro comum

**Somar os percentuais é errado.**

```
ERRADO:  BDI = 5 + 1 + 2 + 1 + 1,5 + 10 + 8 = 28,5%
```

Isso superestima. A fórmula correta:

```
CORRETO:
numerador   = (1 + 0,05 + 0,01 + 0,02 + 0,01) × (1 + 0,015) × (1 + 0,10)
            = 1,09 × 1,015 × 1,10 = 1,217
denominador = (1 − 0,08) = 0,92
BDI = (1,217 / 0,92) − 1 = 0,3228 → 32,28%
```

A diferença (28,5% vs 32,28%) é de quase 4 pontos — significativa em obra grande.

## Desoneração

A desoneração da folha muda o componente **T** (sai a CPRB de 20% sobre a folha e
entra contribuição sobre a receita). Efeito típico: BDI **aumenta** em serviço
intensivo em mão de obra.

**Sempre declare:** "BDI 28%, desonerado" ou "não desonerado".

## Checklist

- [ ] BDI por **fórmula**, não por soma
- [ ] Todos os 7 componentes declarados com valor
- [ ] Desoneração declarada
- [ ] Fonte dos percentuais citada (TCU, contrato, histórico)
- [ ] Preço final conferido: `Preço = Custo direto × (1 + BDI)`
