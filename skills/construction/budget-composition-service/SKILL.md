---
name: budget-composition-service
description: >-
  Builds construction budgets from service compositions: inputs (labor, material,
  equipment), coefficients, productivity, unit cost, BDI, and price versions with
  approval. Use when the user mentions orçamento, composição, insumos, coeficiente,
  SINAPI, SEINFRA, BDI, preço unitário, custo direto, or asks "quanto custa esse
  serviço?". Do NOT use for looking up a single price (use `sinapi-SEINFRA`) or for
  tracking actual cost (use `construction-cost-control`).
homepage: 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento'
metadata:
  {
    'openclaw':
      {
        'emoji': '💰',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Budget & Service Compositions

## When to Use

Use when the user:
- Names orçamento, composição, insumos, coeficiente, produtividade, BDI, custo direto
- Asks "quanto custa esse serviço?" / "monta a composição da alvenaria"
- Wants SINAPI/SEINFRA prices applied with BDI
- Needs a versioned budget with approval trail

Do NOT use for: consultar um preço isolado (`sinapi-SEINFRA`); custo realizado
(`construction-cost-control`).

## Workflow

1. **Separe norma física de preço.** O coeficiente (h/m², kg/m³) muda raramente;
   o preço muda todo mês. Guarde os dois em tabelas distintas.
2. **Monte a composição:** insumo × coeficiente = consumo; consumo × preço = custo
   do insumo; soma = custo unitário direto.
3. **Aplique BDI por componente** (administração, risco, lucro, tributo) — não como
   percentual único somado.
4. **Regionalize** por UF + mês de referência.
5. **Versione.** Atualizar preço **nunca** reescreve orçamento aprovado: cria versão
   nova + diff.
6. **Use tabela de equivalência** quando o mesmo serviço tem código diferente por
   fonte (SINAPI vs SEINFRA).

## Implementation

### Technical Implementation

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

## Pitfalls

- **BDI não é percentual único.** Somar componentes (adm + risco + lucro + tributo)
  é errado — BDI tem fórmula com incidência em cascata. Use a composição correta.
- **Preço sem data-base não é preço.** SINAPI/SEINFRA são tabelas mensais por UF.
  Sempre cite a referência.
- **Atualizar preço não pode reescrever orçamento aprovado.** Gere versão nova e
  mostre o diff. Reescrever apaga a rastreabilidade da proposta.
- **Norma física e preço no mesmo campo.** Se estão juntos, a mudança de preço
  corrompe o coeficiente. Separe.
- **Misturar moeda.** Um projeto, uma moeda. Conversão escondida gera erro de 5 dígitos.
- **Mesmo serviço, códigos diferentes.** SINAPI e SEINFRA têm códigos distintos para
  o mesmo serviço. Sem tabela de equivalência, você conta duas vezes.
- **Composição sem produtividade declarada.** Coeficiente sem origem é chute
  disfarçado de engenharia.

## Examples

**Input:** "Composição de alvenaria de vedação, SINAPI, BDI 28%, desonerado, SP, mês 09."

**Output:**

| Insumo | Un | Coef. | Preço unit. | Custo |
|---|---|---|---|---|
| Bloco cerâmico | un | 13,50 | R$ 1,42 | R$ 19,17 |
| Argamassa | m³ | 0,0085 | R$ 412,00 | R$ 3,50 |
| Pedreiro | h | 0,4200 | R$ 24,80 | R$ 10,42 |
| Servente | h | 0,2100 | R$ 18,20 | R$ 3,82 |
| **Custo direto** | m² | | | **R$ 36,91** |
| BDI 28% | | | | R$ 10,33 |
| **Preço unitário** | m² | | | **R$ 47,24** |

Referência: SINAPI SP, 09/2026, desonerado. Norma física e preço em tabelas separadas.

## Verification

Antes de entregar:
- [ ] Norma física e preço em tabelas separadas
- [ ] Data-base e UF declarados
- [ ] BDI aplicado por fórmula, não por soma de percentuais
- [ ] Orçamento aprovado preservado (nova versão + diff, não sobrescrita)
- [ ] Equivalência de códigos verificada entre fontes
- [ ] Custo direto conferido à mão em 1 composição
