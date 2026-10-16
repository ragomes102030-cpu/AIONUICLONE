# Produtividade de referência — construção

## Contents
- Como usar
- Tabela por serviço
- Fatores de ajuste
- Como derivar duração

## Como usar

Estes valores são **referência de planejamento**, não verdade absoluta. Sempre
ajuste pelo contexto (equipe, ferramenta, acesso, clima) e **declare o ajuste**.

## Tabela por serviço

| Serviço | Unidade | Produtividade típica | Observação |
|---|---|---|---|
| Escavação manual | m³/h | 0,5 – 1,0 | depende do solo |
| Escavação mecânica | m³/h | 15 – 40 | escavadeira |
| Concreto estrutural | m³/dia | 8 – 20 | com bomba |
| Armadura (corte/dobra) | kg/dia | 150 – 300 | por armador |
| Alvenaria de vedação | m²/dia | 12 – 20 | por pedreiro |
| Alvenaria estrutural | m²/dia | 8 – 14 | mais lenta |
| Reboco interno | m²/dia | 20 – 35 | por pedreiro |
| Reboco externo | m²/dia | 15 – 25 | acesso difícil |
| Contrapiso | m²/dia | 30 – 50 | |
| Azulejo | m²/dia | 8 – 15 | por azulejista |
| Pintura látex | m²/dia | 60 – 100 | 2 demãos |
| Instalação elétrica | ponto/dia | 8 – 15 | por eletricista |
| Instalação hidráulica | ponto/dia | 6 – 12 | por encanador |
| Telhado (estrutura) | m²/dia | 15 – 25 | |
| Telhado (cobertura) | m²/dia | 25 – 40 | |

## Fatores de ajuste

| Fator | Efeito | Aplicação |
|---|---|---|
| Altura (andaime) | −15% a −30% | acima de 6 m |
| Acesso ruim | −20% a −40% | obra urbana densa |
| Chuva | perda de 10–20% dos dias | verificar histórico |
| Equipe nova | −20% a −30% | curva de aprendizado |
| Trabalho noturno | −10% a −25% | fadiga, iluminação |
| Repetição (curva) | **+10% a +25%** | a partir do 3º pavimento |

**Curva de aprendizado** em obra repetitiva: a produtividade **aumenta** com a
repetição. Aplicar a produtividade do 1º pavimento a todos os 12 superestima o prazo.

## Como derivar duração

```
Duração = Quantidade / (Produtividade × Nº de equipes)
```

**Exemplo:**
```
260 m² de alvenaria
Produtividade: 18 m²/dia por pedreiro
Equipes: 2 pedreiros
Duração = 260 / (18 × 2) = 7,2 → 8 dias
```

**Nunca digite a duração.** Derive. Duração digitada não reage a mudança de equipe.

## Verificação de realismo

Depois de calcular, confira se a duração é plausível:

| Serviço | Duração suspeita se... |
|---|---|
| Alvenaria de casa | < 5 dias ou > 20 dias |
| Reboco de casa | < 4 dias ou > 15 dias |
| Pintura de casa | < 5 dias ou > 25 dias |
| Estrutura de edifício | < 8 dias por pavimento |

Se a duração derivada está fora da faixa, **reveja a produtividade assumida** antes
de entregar. Valor fora da faixa quase sempre significa premissa errada.

## Checklist

- [ ] Produtividade de uma fonte declarada (tabela, histórico, SINAPI)
- [ ] Ajustes de contexto aplicados e justificados
- [ ] Duração derivada por fórmula, não digitada
- [ ] Curva de aprendizado considerada em obra repetitiva
- [ ] Duração conferida contra a faixa de realismo
- [ ] Dias de chuva descontados do calendário
