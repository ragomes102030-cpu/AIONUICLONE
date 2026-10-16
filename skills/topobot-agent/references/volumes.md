# Métodos de cálculo de volume

## Contents
- Os três métodos
- Quando usar cada um
- Incerteza esperada
- Compensação corte/aterro

## Os três métodos

### 1. Média das áreas (mais comum)
```
V = (A1 + A2) / 2 × d
```
- `A1`, `A2` = áreas das seções consecutivas
- `d` = distância entre seções

**Uso:** terraplenagem de estrada, plataforma. Rápido e suficiente.
**Incerteza:** ±5% a ±10%.

### 2. Prismoidal (mais preciso)
```
V = d/6 × (A1 + 4Am + A2)
```
- `Am` = área da seção média (medida, não interpolada)

**Uso:** quando há variação brusca de seção. Mais preciso, exige seção intermediária.
**Incerteza:** ±3% a ±5%.

### 3. Grade / malha (TIN)
```
V = Σ (cota_terreno − cota_projeto) × área_da_célula
```

**Uso:** plataforma, pátio, obra urbana. Melhor para superfície irregular.
**Incerteza:** ±2% a ±5% (depende do tamanho da malha).

## Quando usar cada um

| Situação | Método |
|---|---|
| Obra linear (estrada, canal) | média das áreas |
| Seção com variação brusca | prismoidal |
| Plataforma / pátio | grade |
| Movimento de terra urbano | grade |
| Estimativa rápida | média das áreas |

## Incerteza esperada

| Método | Incerteza | Motivo |
|---|---|---|
| Média das áreas | ±5–10% | interpolação linear entre seções |
| Prismoidal | ±3–5% | usa seção média medida |
| Grade | ±2–5% | depende da densidade da malha |

**Sempre declare a incerteza.** "780 m³" sem ±5% é precisão falsa.

## Compensação corte/aterro

Corte e aterro **raramente se compensam**. O que importa é o **saldo**:

| Saldo | Significado | Ação |
|---|---|---|
| corte > aterro | sobra terra | bota-fora (custo de transporte) |
| corte < aterro | falta terra | empréstimo (custo de aquisição + transporte) |
| corte ≈ aterro | compensado | ideal, mas raro |

**Regra:** sempre reporte os dois volumes **e** o saldo. Reportar só um engana o
orçamento — o transporte de terra é custo significativo.

**Empolamento:** a terra solta ocupa mais volume que a compactada.
- Corte (natural) → transporte (solto): fator ~1,25
- Aterro (compactado): fator ~0,90 do natural

Sem aplicar empolamento, o volume de transporte é subestimado em ~25%.

## Checklist

- [ ] Método declarado
- [ ] Incerteza declarada (±%)
- [ ] Volume de corte **e** aterro reportados
- [ ] Saldo reportado (bota-fora ou empréstimo)
- [ ] Empolamento considerado no transporte
- [ ] Pontos espúrios filtrados antes do cálculo
