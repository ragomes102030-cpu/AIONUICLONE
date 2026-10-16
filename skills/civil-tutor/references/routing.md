# Fronteira de cada especialista

## Contents
- Quando usar cada um
- Zonas de sobreposição
- Como resolver ambiguidade

## structuro-agent
**Pega:** dimensionamento e verificação de concreto armado, aço, fundação, madeira.
Cargas, seções, armaduras, ELU/ELS, memorial de cálculo.
**Não pega:** diagnóstico de fissura (é `pathoscan-agent`), custo (é `docbuild-agent`).

## topobot-agent
**Pega:** levantamento planialtimétrico, GNSS/RTK, TIN, curvas de nível, corte/aterro,
coordenadas UTM/SIRGAS, export DXF.
**Não pega:** locação de obra (é execução), custo da terraplenagem (`docbuild-agent`).

## pathoscan-agent
**Pega:** fissura, umidade, infiltração, carbonatação, corrosão, eflorescência.
Causa, classificação de risco, recomendação de reparo.
**Não pega:** verificação estrutural — **encaminha** para `structuro-agent`.

## chronos-agent
**Pega:** cronograma, CPM, caminho crítico, folga, Gantt, curva S, EPP/ALOP,
produtividade, baseline.
**Não pega:** custo isolado (`docbuild-agent`), LOB de obra repetitiva é dele também.

## docbuild-agent
**Pega:** orçamento, composição, BDI, SINAPI/SEINFRA, memorial, especificação,
caderno de encargos, laudo, análise normativa.
**Não pega:** cálculo estrutural, diagnóstico de patologia.

## Zonas de sobreposição

| Pedido | Vai para | Por quê |
|---|---|---|
| "quanto custa essa viga?" | `docbuild-agent` | custo, não dimensionamento |
| "a fissura é estrutural?" | `pathoscan-agent` → `structuro-agent` | diagnóstico primeiro |
| "orça e agenda a obra" | **sequencial**: `docbuild` → `chronos` | cronograma depende do quantitativo |
| "calcula o corte e orça" | **sequencial**: `topobot` → `docbuild` | volume antes do preço |
| "a laje aguenta a nova carga?" | `structuro-agent` | verificação de capacidade |

## Como resolver ambiguidade

Se a pergunta cai em duas disciplinas **com dependência**, sequencie.
Se cai em duas **sem dependência**, paralelize.
Se não cai em nenhuma, diga — não force roteamento.
