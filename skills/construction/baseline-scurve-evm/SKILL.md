---
name: 'baseline-scurve-evm'
description: 'Snapshot baselines, compute S-curves and Earned Value (PV/EV/AC, SPI/CPI, EAC/ETC/VAC): freeze approved plans, compare planned vs actual, forecast cost and schedule at completion. Use for baseline, curva S, valor agregado, EVM, SPI, CPI, desvio de prazo/custo, previsao de termino.'
homepage: 'https://github.com/ragomes102030-cpu/AIONUICLONE'
metadata:
  {
    'openclaw':
      {
        'emoji': '📈',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/AIONUICLONE',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Baseline, S-Curve and EVM

## Business Case

### Problem Statement

- Baseline stored as live formulas (`Atual = Baseline`) so deviation is always 0
- No frozen snapshot: history rewrites itself on every edit
- S-curve drawn from current plan only, hiding slippage
- EVM indicators (SPI/CPI) hand-computed or missing

### Solution

Frozen value snapshots + cumulative curves + standard EVM math.
Baseline = values, current plan = dynamic, deviation = current minus baseline.

## Technical Implementation

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

## Quick Start

```python
bm = BaselineManager()
bm.set_current([PeriodValue("S1", 100, 50000, 80, 48000),
                PeriodValue("S2", 200, 100000, 150, 95000)])
bm.snapshot("BL-01")
print(bm.deviation("BL-01"))
r = earned_value(bac=500000, pct_planned=0.6, pct_actual=0.5, actual_cost=270000)
print(f"SPI={r.spi:.2f} CPI={r.cpi:.2f} EAC={r.eac:.0f}")
```

## Rules

1. Baseline = snapshot of VALUES (deepcopy), never formulas.
2. `Desvio = Atual - Baseline`. Missing actuals = SEM DADO, not zero.
3. Never adjust history: forecast changes ETC/EAC, not recorded AC/EV.

## Resources

- plataforma-obras `GraficosView.tsx` (Curva S) + `MedicaoView.tsx`
- PMI EVM standard formulas
