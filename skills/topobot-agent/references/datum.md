# Sistemas de referência — datum e projeção

## Contents
- SIRGAS2000 e histórico
- Como validar
- UTM: fuso e hemisfério
- Cota: geométrica vs ortométrica

## SIRGAS2000 e histórico

| Sistema | Vigência no Brasil | Diferença para SIRGAS2000 |
|---|---|---|
| Córrego Alegre | até 1979 | ~ 60–70 m |
| SAD69 | 1979 – 2015 | ~ 55–65 m |
| **SIRGAS2000** | **2015 – hoje** | **0 (oficial)** |

**Decreto 5.334/2005** tornou SIRGAS2000 o sistema oficial. Desde 2015 é obrigatório
para novos levantamentos.

**Regra:** sempre declare o datum. Coordenada sem datum é número solto — dois pontos
"iguais" em datums diferentes podem estar a 60 m de distância.

## Como validar

1. **Pergunte o datum** ao fornecedor do levantamento. Não assuma.
2. **Confira a ordem de grandeza** das coordenadas UTM:
   - `E` (este): 6 dígitos (100.000 a 900.000)
   - `N` (norte): 7 dígitos (0 a 10.000.000)
3. **Ponto de controle:** meça um ponto conhecido (marco do IBGE) e compare.
   Divergência > 1 m indica datum errado.
4. **Registre no arquivo:** `$INSUNITS`, datum e fuso no cabeçalho do DXF/CSV.

## UTM: fuso e hemisfério

O Brasil ocupa os fusos **18 a 25** (sul) e **21 a 24** (norte, pequena parte).

```
fuso = floor((longitude + 180) / 6) + 1
```

| Fuso | Meridiano central | Cobre |
|---|---|---|
| 22S | −51° | MG, GO, DF, TO |
| 23S | −45° | SP, RJ, ES, MG (parte), PR |
| 24S | −39° | BA, PE, CE (parte) |

**Fuso errado** desloca a coordenada em centenas de quilômetros. Sempre confira.

**Hemisfério sul** → `N` recebe 10.000.000 na origem (falso norte). Coordenada `N`
entre 7.000.000 e 8.000.000 no hemisfério sul é plausível para latitudes brasileiras.

## Cota: geométrica vs ortométrica

| Tipo | Referência | Fonte |
|---|---|---|
| Geométrica (`h`) | Elipsoide | GNSS bruto |
| **Ortométrica (`H`)** | **Nível médio do mar** | `H = h − N` |

`N` é a **ondulação geoidal**. No Brasil varia de aproximadamente **−10 m a +5 m**
(modelo MAPGEO/EGM2008).

**Erro comum:** usar a cota do GPS direto como cota de projeto. O erro é de metros —
inaceitável em terraplenagem.

**Correção:** use o modelo geoidal do IBGE (MAPGEO2015) ou um serviço de conversão.
Sempre declare qual cota está no relatório.

## Checklist

- [ ] Datum declarado (SIRGAS2000 preferencial)
- [ ] Fuso e hemisfério conferidos
- [ ] Ordem de grandeza de E e N conferida
- [ ] Ponto de controle comparado
- [ ] Cota: geométrica ou ortométrica declarada
- [ ] Ondulação geoidal aplicada se cota ortométrica
