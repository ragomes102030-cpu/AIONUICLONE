---
name: production-measurement-control
description: >-
  Tracks daily construction production and contractual measurement: field entries,
  crew productivity, approval workflow (rascunho → conferência → aprovado), bulletins
  with calculation memory, and physical progress roll-up. Use when the user mentions
  produção diária, diário de obra, produtividade, medição, boletim, memória de cálculo,
  avanço físico, or asks to close a measurement period. Do NOT use for RDO narrative
  (use `daily-progress-report`) or cost variance (use `budget-variance-analyzer`).
homepage: 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento'
metadata:
  {
    'openclaw':
      {
        'emoji': '🏗️',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Production & Measurement Control

## When to Use

Use when the user:
- Names produção diária, medição, boletim, produtividade, avanço físico
- Wants to close a measurement period with calculation memory
- Needs the approval trail (rascunho → conferência → aprovado)
- Asks "quanto já foi executado desse serviço?"

Do NOT use for: narrativa do dia (`daily-progress-report`); desvio de custo
(`budget-variance-analyzer`).

## Workflow

1. **Separe as duas camadas:** produção de campo (lançamento rápido diário) e
   medição (contratual, versionada, aprovada).
2. **Calcule produtividade** como derivada: `qty / (equipes × horas)`. Nunca digitada.
3. **Rode o fluxo de aprovação:** rascunho → conferência → aprovado.
4. **Gere o boletim** com memória de cálculo ligando cada linha a serviço/frente/atividade.
5. **Versione** boletins aprovados — nunca delete; reverta com motivo.
6. **Faça roll-up** do avanço físico para a EAP.
7. **Mantenha separados:** Planejado · Realizado · Saldo · Desvio.

## Implementation

### Technical Implementation

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

```python
e = ProductionEntry("P-001", "2026-09-25", "Frente A", "Eq-01",
                    "AT-001", "1.1", 100.0, "m2")
print(f"Produtividade: {e.productivity(crew_size=6):.2f} m2/hh")
b = Bulletin("BM-03", "2026-09-01", "2026-09-30",
             [BulletinLine("1.1", "Laje pav 4", "m2", 100.0, 85.0,
                           "Eixo 3 pav 4: 12.5 x 8.0 = 100 m2")])
print(f"Total BM: R$ {b.total:,.2f}")
```

## Pitfalls

- **Produção ausente não é zero.** `SEM DADO` ≠ 0. Zero derruba a produtividade
  média e cria alarme falso.
- **Produtividade digitada é chute.** Derive de `qty / (equipes × horas)`. Digitada
  não reage a mudança de equipe.
- **Boletim aprovado não se deleta.** Reverta com motivo e mantenha o histórico.
  Deletar apaga a rastreabilidade contratual.
- **Produção e medição no mesmo lugar.** Campo é diário e bruto; medição é contratual
  e versionada. Misturar impede auditar o que foi aprovado.
- **Duração por divisão simples ignora a frente.** `Duração = Qtd / Produtividade / Equipes`
  só vale se a frente comporta todas as equipes. Comente a limitação.
- **Sem memória de cálculo, o boletim não se defende.** Cada linha precisa rastrear
  até serviço, frente e atividade. Sem isso, contestação ganha.
- **Avanço físico ≠ avanço financeiro.** São curvas diferentes. Não misture no mesmo
  indicador.

## Examples

**Input:** "Alvenaria pav 3: 1.200 m² lançados, 2 equipes, 8h/dia, 3 dias.
Boletim do mês: planejado 4.000 m², executado 3.600 m²."

**Output:**

| Serviço | Planejado | Executado | Saldo | Avanço |
|---|---|---|---|---|
| Alvenaria | 4.000 m² | 3.600 m² | 400 m² | 90% |

**Produtividade derivada:** 1.200 / (2 × 8 × 3) = **25 m²/equipe·h**
(planejado: 22 m²/equipe·h → desempenho **+13,6%**)

**Boletim:** rascunho → conferência → **aprovado** (v1).
Memória de cálculo: cada linha rastreia serviço → frente → atividade da EAP.

## Verification

- [ ] Produção ausente tratada como `SEM DADO`, não zero
- [ ] Produtividade derivada, não digitada
- [ ] Fluxo de aprovação registrado (rascunho/conferência/aprovado)
- [ ] Boletim aprovado versionado, não deletado
- [ ] Memória de cálculo liga linha → serviço → frente → atividade
- [ ] `Saldo = Planejado − Executado` confere
- [ ] Avanço físico separado do financeiro
