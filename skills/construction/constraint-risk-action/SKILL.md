---
name: 'constraint-risk-action'
description: 'Constraint, risk and decision loop for construction sites: owner, deadline, action, evidence, resolution, reopen, schedule impact. Use for restricoes, riscos, decisoes, plano de acao, impedimentos, interferencias.'
homepage: 'https://github.com/ragomes102030-cpu/AIONUICLONE'
metadata:
  {
    'openclaw':
      {
        'emoji': '⛔',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/AIONUICLONE',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Constraint, Risk & Action Loop

## Business Case

### Problem Statement

Per the ROADMAP: Restricoes "registra o achado e o mostra ao agente.
Ainda nao ha um ciclo completo de responsavel, prazo, acao, evidencia,
resolucao, reabertura e impacto no cronograma."

### Solution

Closed-loop register: every constraint has owner + due date + action +
evidence; resolution and reopening are recorded; schedule impact flagged.

## Technical Implementation

```python
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum


class ConstraintStatus(str, Enum):
    OPEN = "aberta"
    IN_ACTION = "em_acao"
    RESOLVED = "resolvida"
    REOPENED = "reaberta"
    OVERDUE = "vencida"


@dataclass
class Constraint:
    id: str
    title: str
    owner: str
    due_day: float
    action: str
    status: ConstraintStatus = ConstraintStatus.OPEN
    evidence: List[str] = field(default_factory=list)
    affects_activities: List[str] = field(default_factory=list)
    history: List[str] = field(default_factory=list)

    def add_evidence(self, note: str):
        self.evidence.append(note)
        self.history.append(f"evidence: {note}")

    def resolve(self, note: str):
        if not self.evidence:
            raise ValueError(f"{self.id}: cannot resolve without evidence")
        self.status = ConstraintStatus.RESOLVED
        self.history.append(f"resolved: {note}")

    def reopen(self, reason: str):
        if self.status != ConstraintStatus.RESOLVED:
            raise ValueError(f"{self.id}: only resolved items reopen")
        self.status = ConstraintStatus.REOPENED
        self.history.append(f"reopened: {reason}")

    def check_overdue(self, today: float):
        if today > self.due_day and self.status in (
                ConstraintStatus.OPEN, ConstraintStatus.IN_ACTION,
                ConstraintStatus.REOPENED):
            self.status = ConstraintStatus.OVERDUE
            self.history.append(f"overdue at day {today}")


class ConstraintBoard:
    def __init__(self):
        self.items: Dict[str, Constraint] = {}

    def add(self, item: Constraint):
        self.items[item.id] = item

    def overdue(self, today: float) -> List[Constraint]:
        for item in self.items.values():
            item.check_overdue(today)
        return [i for i in self.items.values()
                if i.status == ConstraintStatus.OVERDUE]

    def blocking(self, activity_id: str) -> List[Constraint]:
        return [i for i in self.items.values()
                if activity_id in i.affects_activities
                and i.status not in (ConstraintStatus.RESOLVED,)]
```

## Quick Start

```python
board = ConstraintBoard()
board.add(Constraint("R-01", "Projeto eletrico pendente", "Eng. Ana",
                     due_day=10, action="Cobrar projetista",
                     affects_activities=["AT-010"]))
board.items["R-01"].add_evidence("Email 24/09 anexado")
print([r.id for r in board.overdue(today=12)])
print([b.id for b in board.blocking("AT-010")])
```

## Rules

1. No constraint without owner + due date + action.
2. No resolution without evidence.
3. Reopening keeps full history (never delete).
4. Always surface schedule impact: which activities are blocked.

## Resources

- plataforma-obras `OperationalViews.tsx` (restricoes) + agent memory
