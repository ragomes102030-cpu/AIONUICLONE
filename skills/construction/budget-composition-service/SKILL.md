---
name: 'budget-composition-service'
description: 'Construction budgeting with service compositions: inputs (labor/material/equipment), coefficients, productivity, unit cost, BDI, price versions with approval. Use for orcamento, composicao, insumos, SINAPI, SEINFRA, BDI, preco unitario, custo direto.'
homepage: 'https://github.com/ragomes102030-cpu/AIONUICLONE'
metadata:
  {
    'openclaw':
      {
        'emoji': '💰',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/AIONUICLONE',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Budget & Service Compositions

## Business Case

### Problem Statement

Per the PLANO-MESTRE: "Nao ha modulo de orcamento persistido."
Costs live in spreadsheets with fixed unit prices that go stale,
no split between physical norms and prices, no BDI, no versions.

### Solution

Resource-based compositions: physical coefficients x current prices =
unit cost; BDI applied at budget level; price updates create new
versions, never rewrite approved budgets.

## Technical Implementation

```python
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum


class InputType(str, Enum):
    LABOR = "mao_obra"
    MATERIAL = "material"
    EQUIPMENT = "equipamento"


@dataclass
class CompositionInput:
    code: str
    description: str
    input_type: InputType
    unit: str
    coefficient: float     # physical norm per composition unit
    unit_price: float      # current price
    source: str = "proprio"  # sinapi | seinfra | proprio | fornecedor

    @property
    def cost(self) -> float:
        return self.coefficient * self.unit_price


@dataclass
class ServiceComposition:
    code: str
    description: str
    unit: str
    inputs: List[CompositionInput] = field(default_factory=list)

    @property
    def unit_cost(self) -> float:
        return sum(i.cost for i in self.inputs)

    def cost_by_type(self) -> Dict[str, float]:
        out: Dict[str, float] = {}
        for i in self.inputs:
            out[i.input_type.value] = out.get(i.input_type.value, 0.0) + i.cost
        return out


@dataclass
class BudgetLine:
    service_code: str
    quantity: float
    unit_cost: float       # frozen at budget approval

    @property
    def total(self) -> float:
        return self.quantity * self.unit_cost


class Budget:
    def __init__(self, name: str, bdi: float = 0.25):
        self.name = name
        self.bdi = bdi
        self.lines: List[BudgetLine] = []
        self.version = 1
        self.approved = False

    @property
    def direct_cost(self) -> float:
        return sum(line.total for line in self.lines)

    @property
    def total_with_bdi(self) -> float:
        return self.direct_cost * (1 + self.bdi)

    def new_price_version(self) -> "Budget":
        child = Budget(f"{self.name} v{self.version + 1}", self.bdi)
        child.version = self.version + 1
        child.lines = list(self.lines)
        return child
```

## Quick Start

```python
comp = ServiceComposition("S-001", "Concreto fck25", "m3", [
    CompositionInput("C-001", "Cimento", InputType.MATERIAL,
                     "kg", 350, 0.85, "sinapi"),
    CompositionInput("P-001", "Pedreiro", InputType.LABOR,
                     "h", 2.5, 28.0, "proprio"),
])
print(f"Custo unitario: R$ {comp.unit_cost:.2f}")
b = Budget("Obra A", bdi=0.25)
b.lines.append(BudgetLine("S-001", 120.0, comp.unit_cost))
print(f"Total com BDI: R$ {b.total_with_bdi:,.2f}")
```

## Rules

1. Physical norms and prices stored separately (norms change rarely).
2. Imported price tables never rewrite an approved budget: new version + diff.
3. One currency per project; regionalize SINAPI/SEINFRA by UF + month.
4. Equivalence table when the same service has different codes per source.

## Resources

- plataforma-obras `BudgetView.tsx` + `CatalogView.tsx` + `shared/price-sources`
- SINAPI / SEINFRA official tables (CSV/XLSX import, keep source + month + UF)
