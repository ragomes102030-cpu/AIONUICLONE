---
name: baseline-scurve-evm
description: >-
  Freezes baselines, computes S-curves and Earned Value (PV/EV/AC, SPI/CPI,
  EAC/ETC/VAC) and forecasts cost and schedule at completion. Use when the user
  mentions baseline, linha de base, curva S, valor agregado, EVM, SPI, CPI, desvio
  de prazo ou custo, previsão de término, "vamos conseguir entregar?". Do NOT use
  for raw production entry (use `production-measurement-control`) or budget
  composition (use `budget-composition-service`).
homepage: 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento'
metadata:
  {
    'openclaw':
      {
        'emoji': '📈',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Baseline, S-Curve and EVM

## When to Use

Use when the user:
- Names baseline, linha de base, curva S, EVM, valor agregado, SPI, CPI, EAC, ETC, VAC
- Asks "estamos atrasados?", "quanto vai custar no final?", "vamos conseguir entregar?"
- Wants planned vs actual comparison frozen at a point in time
- Needs a forecast for completion

Do NOT use for: lançamento de produção (`production-measurement-control`);
composição de preço (`budget-composition-service`).

## Workflow

1. **Congele o baseline** como snapshot de **valores** (deepcopy), nunca de fórmulas.
2. **Colete o realizado** por período: AC (custo real) e EV (valor agregado).
3. **Calcule a curva S acumulada** (PV planejado × EV × AC).
4. **Calcule os índices:** `SPI = EV/PV`, `CPI = EV/AC`.
5. **Projete:** `EAC = BAC/CPI`, `ETC = EAC - AC`, `VAC = BAC - EAC`.
6. **Separe o que é dado do que é previsão.** Histórico não se ajusta.
7. **Reporte o desvio** com a causa, não só o número.

## Implementation

### Technical Implementation

```python
from typing import Dict, List
from dataclasses import dataclass, field
import copy


@dataclass
class PeriodValue:
    period: str          # e.g. "2026-09-W4"
    planned_qty: float = 0.0
    planned_cost: float = 0.0
    actual_qty: float = 0.0
    actual_cost: float = 0.0


class BaselineManager:
    def __init__(self):
        self.current: List[PeriodValue] = []
        self.baselines: Dict[str, List[PeriodValue]] = {}

    def set_current(self, rows: List[PeriodValue]):
        self.current = rows

    def snapshot(self, name: str):
        self.baselines[name] = copy.deepcopy(self.current)
        return name

    def deviation(self, baseline_name: str) -> List[Dict]:
        base = {r.period: r for r in self.baselines[baseline_name]}
        out = []
        for row in self.current:
            b = base.get(row.period)
            out.append({
                "period": row.period,
                "qty_dev": row.actual_qty - (b.planned_qty if b else 0),
                "cost_dev": row.actual_cost - (b.planned_cost if b else 0),
            })
        return out


def cumulative(values: List[float]) -> List[float]:
    total, out = 0.0, []
    for v in values:
        total += v
        out.append(total)
    return out


@dataclass
class EvmResult:
    pv: float; ev: float; ac: float
    spi: float; cpi: float
    sv: float; cv: float
    eac: float; etc: float; vac: float


def earned_value(bac: float, pct_planned: float,
                 pct_actual: float, actual_cost: float) -> EvmResult:
    pv = bac * pct_planned
    ev = bac * pct_actual
    ac = actual_cost
    spi = (ev / pv) if pv else 0.0
    cpi = (ev / ac) if ac else 0.0
    sv, cv = ev - pv, ev - ac
    eac = (bac / cpi) if cpi else bac
    return EvmResult(pv=pv, ev=ev, ac=ac, spi=spi, cpi=cpi,
                     sv=sv, cv=cv, eac=eac, etc=eac - ac, vac=bac - eac)
```

```python
bm = BaselineManager()
bm.set_current([PeriodValue("S1", 100, 50000, 80, 48000),
                PeriodValue("S2", 200, 100000, 150, 95000)])
bm.snapshot("BL-01")
print(bm.deviation("BL-01"))
r = earned_value(bac=500000, pct_planned=0.6, pct_actual=0.5, actual_cost=270000)
print(f"SPI={r.spi:.2f} CPI={r.cpi:.2f} EAC={r.eac:.0f}")
```

## Pitfalls

- **Baseline de fórmulas é baseline falso.** `Atual = Baseline` faz o desvio ser
  sempre 0. Congele **valores**, não referências.
- **Realizado ausente não é zero.** `SEM DADO` ≠ 0. Zero distorce SPI e CPI para
  baixo e gera alarme falso.
- **Nunca ajuste o histórico.** Previsão muda ETC/EAC. AC e EV já registrados não
  se mexem — se mexeram, é erro de lançamento, não de cálculo.
- **SPI/CPI de período curto engana.** Com 5% de avanço, os índices oscilam demais
  para decidir. Reporte também a tendência.
- **CPI < 1 não é atraso de prazo.** Custo e prazo são índices separados. Não misture
  a narrativa.
- **EAC por CPI assume o desempenho se mantendo.** Se a causa do desvio foi pontual,
  diga isso — a projeção linear superestima.
- **Curva S do plano atual esconde o desvio.** A curva planejada tem que vir do
  baseline congelado, não do cronograma vivo.

## Examples

**Input:** "BAC = R$ 1.000.000. Mês 3: PV = 300.000, EV = 240.000, AC = 280.000."

**Output:**

| Indicador | Valor | Leitura |
|---|---|---|
| SPI = EV/PV | 0,80 | **20% atrás do planejado** |
| CPI = EV/AC | 0,857 | **16% acima do custo previsto** |
| EAC = BAC/CPI | R$ 1.166.667 | projeção de custo final |
| ETC = EAC − AC | R$ 886.667 | falta gastar |
| VAC = BAC − EAC | −R$ 166.667 | **estouro projetado** |

Causa a investigar: EV abaixo de PV **e** AC acima de EV → provável retrabalho
ou produtividade menor que a prevista. Projeção linear assume desempenho constante.

## Verification

Antes de entregar:
- [ ] Baseline é snapshot de valores (não fórmula) — teste: edite o plano atual, o
      baseline **não** pode mudar
- [ ] `SEM DADO` tratado como ausente, não como zero
- [ ] Histórico (AC/EV) intacto
- [ ] `SPI = EV/PV` e `CPI = EV/AC` conferidos à mão em 1 período
- [ ] `EAC/ETC/VAC` coerentes: `ETC = EAC - AC`, `VAC = BAC - EAC`
- [ ] Causa do desvio declarada, não só o número
