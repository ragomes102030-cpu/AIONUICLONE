# Exportação DXF — boas práticas

## Contents
- Unidade
- Camadas
- Estrutura mínima
- Validação

## Unidade

DXF sem definição de unidade é interpretado como **polegada** por alguns softwares
(AutoCAD antigo, alguns visualizadores). Isso gera erro de 25,4×.

**Sempre defina `$INSUNITS`:**

| Código | Unidade |
|---|---|
| 1 | polegada |
| 2 | pé |
| 4 | milímetro |
| 5 | centímetro |
| **6** | **metro** ← use este |

No cabeçalho do DXF:
```
$INSUNITS
70
6
```

**Verificação:** abra o arquivo exportado e confira a escala de um elemento conhecido
(ex.: uma distância que você sabe ser 30 m deve medir 30 unidades).

## Camadas

Nomeie as camadas por conteúdo, não por número:

| Camada | Conteúdo | Cor sugerida |
|---|---|---|
| `TERRENO-NATURAL` | TIN do levantamento | 3 (verde) |
| `TERRENO-PROJETO` | plataforma, greide | 5 (azul) |
| `CURVAS-1M` | curvas de nível 1 m | 8 (cinza) |
| `CURVAS-5M` | curvas mestras 5 m | 1 (vermelho) |
| `LIMITE` | perímetro da área | 7 (branco) |
| `PONTOS` | pontos cotados | 2 (amarelo) |
| `TEXTO-COTAS` | rótulos de cota | 7 (branco) |

**Regra:** quem recebe o DXF precisa saber o que é cada coisa sem perguntar.

## Estrutura mínima

```
1. Cabeçalho: $INSUNITS = 6 (metros)
2. Camada LIMITE: perímetro fechado
3. Camada TERRENO-NATURAL: TIN (faces 3D ou malha)
4. Camada TERRENO-PROJETO: superfície de projeto
5. Camada CURVAS: curvas de nível (polilinhas)
6. Camada PONTOS: pontos cotados (blocos com atributo de cota)
7. Bloco de título: obra, data, datum, fuso, escala
```

## Validação

Antes de entregar:

- [ ] `$INSUNITS` definido como 6 (metros)
- [ ] Camadas nomeadas semanticamente (não `Layer1`, `Layer2`)
- [ ] Cores distintas por tipo de elemento
- [ ] Perímetro fechado (sem gaps)
- [ ] Bloco de título com datum, fuso, data, escala
- [ ] Abrir e conferir uma distância conhecida
- [ ] Arquivo salvo em versão compatível (R2013 ou superior; R12 para legado)

## Erros comuns

| Erro | Consequência |
|---|---|
| Sem `$INSUNITS` | interpretado como polegada → 25,4× |
| Camadas genéricas | receptor não sabe o que é o quê |
| Perímetro aberto | cálculo de área falha |
| Só o TIN, sem projeto | impossível comparar |
| Sem bloco de título | perde rastreabilidade do datum |
