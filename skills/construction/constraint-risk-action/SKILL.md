---
name: constraint-risk-action
description: >-
  Runs the closed-loop constraint, risk and decision register for construction
  sites: owner, deadline, action, evidence, resolution, reopening and schedule impact.
  Use when the user mentions restrições, riscos, decisões, plano de ação, impedimentos,
  interferências, pendências de obra, or asks "o que está travando a obra?". Do NOT use
  for cost deviation (use `budget-variance-analyzer`) or schedule CPM (use
  `cpm-network-validator`).
homepage: 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento'
metadata:
  {
    'openclaw':
      {
        'emoji': '⛔',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Constraint, Risk & Action Loop

## When to Use

Use when the user:
- Names restrições, riscos, decisões, impedimentos, interferências, pendências
- Asks "o que está travando a obra?", "quais pendências estão abertas?"
- Wants a closed loop: responsável → prazo → ação → evidência → resolução
- Needs schedule impact of an open constraint

Do NOT use for: desvio de custo (`budget-variance-analyzer`); folga/CPM
(`cpm-network-validator`).

## Workflow

1. **Registre a restrição** com descrição, data de abertura e quem abriu.
2. **Atribua responsável + prazo + ação.** Sem os três, não é restrição — é reclamação.
3. **Vincule às atividades bloqueadas** da EAP/cronograma.
4. **Acompanhe até a resolução.** Resolução exige **evidência** (foto, documento,
   medição).
5. **Se reabrir, mantenha o histórico completo.** Nunca delete.
6. **Sinalize o impacto no cronograma:** quantos dias, quais atividades.
7. **Feche o ciclo** com data de resolução e quem validou.

## Implementation

### Technical Implementation

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

```python
board = ConstraintBoard()
board.add(Constraint("R-01", "Projeto eletrico pendente", "Eng. Ana",
                     due_day=10, action="Cobrar projetista",
                     affects_activities=["AT-010"]))
board.items["R-01"].add_evidence("Email 24/09 anexado")
print([r.id for r in board.overdue(today=12)])
print([b.id for b in board.blocking("AT-010")])
```

## Pitfalls

- **Restrição sem responsável + prazo + ação não é restrição.** É reclamação. Não
  aceite registro incompleto.
- **Resolução sem evidência não é resolução.** Sem foto/documento/medição, a
  restrição volta. Exija prova.
- **Reabrir não é deletar.** Reabertura preserva o histórico inteiro. Deletar apaga
  a memória de que o problema já ocorreu antes.
- **Impacto no cronograma tem que ser explícito.** Restrição aberta sem dizer quais
  atividades bloqueia não permite decisão.
- **Risco ≠ restrição.** Restrição já está travando (fato); risco pode travar
  (probabilidade). Registre separado — misturar distorce a leitura.
- **Restrição sem dono morre.** Toda restrição aberta sem responsável é restrição
  que ninguém resolve.
- **Acúmulo de restrições abertas é o sinal mais forte de obra travando.** Monitore
  a contagem aberta por semana.

## Examples

**Input:** "Pav 5 travado: projeto de elétrica não liberado. Abriu 01/10."

**Output:**

| # | Restrição | Aberta | Resp. | Prazo | Ação | Evidência | Status | Impacto |
|---|---|---|---|---|---|---|---|---|
| R-014 | Projeto elétrico pav 5 não liberado | 01/10 | Eng. Projetos | 08/10 | Revisar e emitir rev. B | — | **ABERTA** | 5 dias em 3 atividades |

**Atividades bloqueadas:** 1.5.3 (eletroduto), 1.5.4 (fiação), 1.6.2 (gesso).
**Folga consumida:** 5 de 8 dias → **3 dias restantes**.
**Risco associado:** se não liberar até 08/10, o caminho crítico se desloca.
**Ação imediata:** escalar para o coordenador — a folga não cobre nova prorrogação.

## Verification

- [ ] Toda restrição tem responsável + prazo + ação
- [ ] Toda resolução tem evidência anexada
- [ ] Reabertura preserva histórico (nada deletado)
- [ ] Impacto no cronograma explícito (dias + atividades)
- [ ] Risco e restrição registrados em campos separados
- [ ] Contagem de abertas por semana sendo monitorada
- [ ] Nenhuma restrição aberta sem dono
