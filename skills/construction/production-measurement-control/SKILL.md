---
name: 'production-measurement-control'
description: 'Daily production tracking and contractual measurement: field entries, crew productivity, approval workflow (rascunho-conferencia-aprovado), bulletins with calculation memory, physical progress roll-up. Use for producao diaria, diario de obra, produtividade, medicao, boletim, memoria de calculo, avanço fisico.'
homepage: 'https://github.com/ragomes102030-cpu/AIONUICLONE'
metadata:
  {
    'openclaw':
      {
        'emoji': '🏗️',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/AIONUICLONE',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Production & Measurement Control

## Business Case

### Problem Statement

- Production entries end as drafts: no confirm/edit/close-day flow
- Productivity (qty / crew / hour) not computed, only raw quantities
- Measurement mixed with field entries: no rascunho-conferencia-aprovado trail
- No calc memory tying bulletin lines back to service/front/activity

### Solution

Two-layer model: field production (fast daily entry) + measurement
(contractual, versioned, approved). Productivity derived, never typed.

## Technical Implementation

```python
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum
from datetime import date


class EntryStatus(str, Enum):
    DRAFT = "rascunho"
    CONFIRMED = "confirmado"
    CLOSED = "fechado"


class BulletinStatus(str, Enum):
    DRAFT = "rascunho"
    REVIEW = "conferencia"
    APPROVED = "aprovado"
    REVERSED = "estornado"


@dataclass
class ProductionEntry:
    id: str
    day: str
    front: str
    crew: str
    activity_id: str
    service_code: str
    quantity: float
    unit: str
    hours: float = 8.0
    status: EntryStatus = EntryStatus.DRAFT

    def productivity(self, crew_size: int) -> float:
        denom = crew_size * self.hours
        return (self.quantity / denom) if denom else 0.0


@dataclass
class BulletinLine:
    service_code: str
    description: str
    unit: str
    quantity: float
    unit_price: float
    calc_memory: str = ""  # e.g. "Eixo 3 pav 4: 12.5 x 8.0 = 100 m2"

    @property
    def amount(self) -> float:
        return self.quantity * self.unit_price


@dataclass
class Bulletin:
    number: str
    period_start: str
    period_end: str
    lines: List[BulletinLine] = field(default_factory=list)
    status: BulletinStatus = BulletinStatus.DRAFT
    approvals: List[str] = field(default_factory=list)

    @property
    def total(self) -> float:
        return sum(line.amount for line in self.lines)

    def approve(self, approver: str):
        if self.status != BulletinStatus.REVIEW:
            raise ValueError("Bulletin must be in conferencia to approve")
        self.status = BulletinStatus.APPROVED
        self.approvals.append(approver)

    def reverse(self, reason: str):
        if self.status != BulletinStatus.APPROVED:
            raise ValueError("Only approved bulletins can be reversed")
        self.status = BulletinStatus.REVERSED
        self.approvals.append(f"ESTORNO: {reason}")
```

## Quick Start

```python
e = ProductionEntry("P-001", "2026-09-25", "Frente A", "Eq-01",
                    "AT-001", "1.1", 100.0, "m2")
print(f"Produtividade: {e.productivity(crew_size=6):.2f} m2/hh")
b = Bulletin("BM-03", "2026-09-01", "2026-09-30",
             [BulletinLine("1.1", "Laje pav 4", "m2", 100.0, 85.0,
                           "Eixo 3 pav 4: 12.5 x 8.0 = 100 m2")])
print(f"Total BM: R$ {b.total:,.2f}")
```

## Rules

1. Planned vs Actual vs Balance vs Deviation kept separate.
2. Absent production = SEM DADO, never zero.
3. Approved bulletins are versioned, never deleted (reverse with reason).
4. Duration = Quantity / Productivity / Crews (or label manual input).

## Resources

- plataforma-obras `ProductionView.tsx` + `MedicaoView.tsx`
- Mattos - productivity and measurement chapters
