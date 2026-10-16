---
name: cpm-network-validator
description: >-
  Validates construction schedule networks and computes CPM: detects dependency
  cycles, runs forward/backward pass with FS/SS/FF/SF relations and lags, calculates
  total and free float, identifies the critical path and orphan activities. Use when
  the user mentions caminho crítico, folga, rede de precedência, datas cedo/tarde,
  "quais atividades não têm folga", or asks whether a schedule can be shortened —
  even without naming CPM. Do NOT use for visual Gantt rendering (use `gantt-chart`)
  or cost impact (use `budget-variance-analyzer`).
homepage: 'https://github.com/ragomes102030-cpu/AIONUICLONE'
metadata:
  {
    'openclaw':
      {
        'emoji': '🕸️',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/AIONUICLONE',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# CPM Network Validator

## When to Use

Use when the user:
- Names CPM, caminho crítico, critical path, rede de precedência, folga, teia
- Asks "quais atividades não têm folga?" / "dá pra encurtar o prazo?"
- Wants to validate a schedule before approving the baseline
- Needs ES/EF/LS/LF or float per activity

Do NOT use for: desenho visual do Gantt (`gantt-chart`); custo (`budget-variance-analyzer`).

## Workflow

1. **Colete** atividades (id, duração) e dependências (predecessor, sucessor,
   tipo FS/SS/FF/SF, lag).
2. **Ordene topologicamente primeiro.** Um **ciclo bloqueia qualquer resultado** —
   não existe CPM com dependência circular.
3. **Liste órfãos** (sem predecessor E sem sucessor). Exigem justificativa antes
   do baseline: órfão recebe ES=0 e infla a folga.
4. **Rode o forward pass** (ES/EF) e o **backward pass** (LS/LF).
5. **Calcule folga total e livre** por atividade.
6. **Identifique o caminho crítico** (folga total = 0).
7. **Após qualquer mudança** de duração ou vínculo, recalcule e mostre o que se moveu.

## Implementation

### Technical Implementation

```python
from typing import Dict, List
from dataclasses import dataclass
from enum import Enum


class RelationType(str, Enum):
    FS = "FS"
    SS = "SS"
    FF = "FF"
    SF = "SF"


@dataclass
class Activity:
    id: str
    duration: float  # days, must be >= 0
    description: str = ""


@dataclass
class Dependency:
    predecessor_id: str
    successor_id: str
    rel_type: RelationType = RelationType.FS
    lag: float = 0.0


@dataclass
class CpmResult:
    id: str
    early_start: float
    early_finish: float
    late_start: float
    late_finish: float
    total_float: float
    free_float: float
    critical: bool


class CpmNetworkValidator:
    """Validate a schedule network and compute CPM dates."""

    def __init__(self):
        self.activities: Dict[str, Activity] = {}
        self.dependencies: List[Dependency] = []

    def add_activity(self, activity: Activity):
        if activity.id in self.activities:
            raise ValueError(f"Duplicate activity id: {activity.id}")
        if activity.duration < 0:
            raise ValueError(f"Negative duration for {activity.id}")
        self.activities[activity.id] = activity

    def add_dependency(self, dep: Dependency):
        if dep.predecessor_id not in self.activities:
            raise ValueError(f"Dependency predecessor not found: {dep.predecessor_id}")
        if dep.successor_id not in self.activities:
            raise ValueError(f"Dependency successor not found: {dep.successor_id}")
        if dep.predecessor_id == dep.successor_id:
            raise ValueError(f"Self-loop on activity {dep.predecessor_id}")
        self.dependencies.append(dep)

    def find_orphans(self) -> List[str]:
        linked = set()
        for d in self.dependencies:
            linked.add(d.predecessor_id)
            linked.add(d.successor_id)
        return [a for a in self.activities if a not in linked]

    def topological_order(self) -> List[str]:
        incoming: Dict[str, int] = {a: 0 for a in self.activities}
        outgoing: Dict[str, List[str]] = {a: [] for a in self.activities}
        for d in self.dependencies:
            outgoing[d.predecessor_id].append(d.successor_id)
            incoming[d.successor_id] += 1
        queue = sorted([a for a, n in incoming.items() if n == 0])
        order: List[str] = []
        while queue:
            current = queue.pop(0)
            order.append(current)
            for nxt in outgoing[current]:
                incoming[nxt] -= 1
                if incoming[nxt] == 0:
                    queue.append(nxt)
            queue.sort()
        if len(order) != len(self.activities):
            cyclic = sorted([a for a, n in incoming.items() if n > 0])
            raise ValueError(f"Network has a cycle involving: {cyclic}")
        return order
```

```python
net = CpmNetworkValidator()
net.add_activity(Activity("A", 5, "Fundacao"))
net.add_activity(Activity("B", 3, "Estrutura"))
net.add_activity(Activity("C", 2, "Alvenaria"))
net.add_dependency(Dependency("A", "B", RelationType.FS))
net.add_dependency(Dependency("B", "C", RelationType.FS))
print(net.audit_report())
print(net.compute()["critical_path"])  # ['A', 'B', 'C']
```

### 1. Cycle detection before approval

```python
try:
    order = net.topological_order()
except ValueError as err:
    print(f"Gate BLOCKED: {err}")
```

### 2. Orphan justification

```python
for orphan in net.find_orphans():
    print(f"Activity {orphan} has no relations - link or justify it")
```

### 3. Recompute after a change

```python
net.activities["B"].duration = 8
new_path = net.compute()["critical_path"]
```

## Pitfalls

- **Ciclo bloqueia tudo.** Nunca reporte resultado de CPM quando a rede tem ciclo —
  o número é matematicamente inválido. Pare e reporte o ciclo.
- **Órfão infla a folga.** Atividade sem predecessor E sem sucessor recebe ES=0 e
  aparece como não-crítica. Não é: é dado faltando. Exija justificativa.
- **Tipo de vínculo errado desloca o caminho crítico inteiro.** FS é o padrão; SS,
  FF e SF precisam de lag explícito. Vínculo sem lag declarado é ambíguo.
- **Duração 0 não é marco.** Duração zero vira marco só se declarada explicitamente;
  senão é erro de cadastro. Pergunte antes de assumir.
- **Versão antiga reportada como atualização.** Compare o carimbo de versão antes de
  aceitar um plano como novo.
- **Mesma entrada, saída diferente.** A computação é pura. Se duas execuções divergem,
  a entrada mudou — ou há estado escondido. Investigue.
- **Folga negativa é sinal de dado, não de atraso.** Folga < 0 quase sempre significa
  vínculo inconsistente, não prazo impossível.

## Examples

**Input:** "Valide a rede: A(5d)→B(3d)→C(2d), A→D(4d)"

**Output:**

| Ativ | Dur | ES | EF | LS | LF | Folga Total | Folga Livre | Crítica |
|------|-----|----|----|----|----|-------------|-------------|---------|
| A    | 5   | 0  | 5  | 0  | 5  | 0           | 0           | SIM     |
| B    | 3   | 5  | 8  | 5  | 8  | 0           | 0           | SIM     |
| C    | 2   | 8  | 10 | 8  | 10 | 0           | 0           | SIM     |
| D    | 4   | 5  | 9  | 6  | 10 | 1           | 1           | não     |

Caminho crítico: **A → B → C (10 dias)**. Ciclos: 0. Órfãos: 0.

## Verification

Antes de entregar, confirme:
- [ ] Nenhum ciclo (se houver, você **não** entrega CPM — reporta o ciclo)
- [ ] Órfãos listados e justificados
- [ ] ES/EF/LS/LF coerentes: `EF = ES + dur` e `LF = LS + dur` em toda linha
- [ ] `Folga Total = LS - ES = LF - EF` em toda linha
- [ ] Caminho crítico é contíguo do início ao fim
- [ ] Nenhuma folga negativa sem explicação de dado

Se duas execuções com a mesma entrada divergirem, há estado escondido — pare.
