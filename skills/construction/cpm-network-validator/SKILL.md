---
name: 'cpm-network-validator'
description: 'Validate construction schedule networks: detect cycles, compute CPM forward/backward pass with FS/SS/FF/SF relations and lags, calculate total/free float, identify critical path and orphan activities. Use when validating cronogramas, dependency networks, caminho critico, folgas, or checking schedule integrity before baseline approval.'
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

## Business Case

### Problem Statement

Schedule network defects that silently corrupt planning decisions:

- Cycles in dependencies (A→B→A) freeze or corrupt CPM calculation
- Orphan activities (no predecessors AND no successors) get ES=0 and inflate float
- Wrong relation types or lags shift the whole critical path
- Same-or-older plan versions reported as "updates"

### Solution

Deterministic network validation + CPM recomputation. Same canonical
activity/dependency list always produces the same output. Pure calculation,
mirroring `shared/cpm.ts` of plataforma-obras.

## Technical Implementation

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
    def _pred_constraint(self, dep, pred_ef, pred_es, succ_duration) -> float:
        lag = dep.lag or 0.0
        if dep.rel_type == RelationType.FS:
            return pred_ef + lag
        if dep.rel_type == RelationType.SS:
            return pred_es + lag
        if dep.rel_type == RelationType.FF:
            return pred_ef + lag - succ_duration
        return pred_es + lag - succ_duration  # SF

    def _succ_constraint(self, dep, succ_ls, succ_lf, pred_duration) -> float:
        lag = dep.lag or 0.0
        if dep.rel_type == RelationType.FS:
            return succ_ls - lag
        if dep.rel_type == RelationType.SS:
            return succ_ls - lag + pred_duration
        if dep.rel_type == RelationType.FF:
            return succ_lf - lag
        return succ_lf - lag + pred_duration  # SF

    def compute(self) -> Dict:
        order = self.topological_order()
        preds: Dict[str, List[Dependency]] = {a: [] for a in self.activities}
        succs: Dict[str, List[Dependency]] = {a: [] for a in self.activities}
        for d in self.dependencies:
            preds[d.successor_id].append(d)
            succs[d.predecessor_id].append(d)
        es: Dict[str, float] = {}
        ef: Dict[str, float] = {}
        for aid in order:
            dur = self.activities[aid].duration
            start = 0.0
            for d in preds[aid]:
                cand = self._pred_constraint(d, ef[d.predecessor_id],
                                             es[d.predecessor_id], dur)
                start = max(start, cand)
            es[aid] = start
            ef[aid] = start + dur
        project_duration = max(ef.values()) if ef else 0.0
        ls: Dict[str, float] = {}
        lf: Dict[str, float] = {}
        for aid in reversed(order):
            dur = self.activities[aid].duration
            finish = project_duration
            for d in succs[aid]:
                cand = self._succ_constraint(d, ls[d.successor_id],
                                             lf[d.successor_id], dur)
                finish = min(finish, cand)
            lf[aid] = finish
            ls[aid] = finish - dur
        results: List[CpmResult] = []
        for aid in order:
            tf = ls[aid] - es[aid]
            succ_starts = [es[d.successor_id] for d in succs[aid]]
            ff = (min(succ_starts) - ef[aid]) if succ_starts else tf
            results.append(CpmResult(
                id=aid, early_start=es[aid], early_finish=ef[aid],
                late_start=ls[aid], late_finish=lf[aid],
                total_float=tf, free_float=ff, critical=(tf <= 0)))
        critical_path = [r.id for r in sorted(
            [r for r in results if r.critical],
            key=lambda r: (r.early_start, r.id))]
        return {"project_duration": project_duration,
                "activities": [r.__dict__ for r in results],
                "critical_path": critical_path,
                "orphans": self.find_orphans()}

    def audit_report(self) -> str:
        lines = [f"Activities: {len(self.activities)}, "
                 f"Dependencies: {len(self.dependencies)}"]
        orphans = self.find_orphans()
        if orphans:
            lines.append(f"WARNING orphans (no relations): {orphans}")
        try:
            res = self.compute()
        except ValueError as err:
            return "\\n".join(lines + [f"BLOCKED: {err}"])
        lines.append(f"Project duration: {res['project_duration']} days")
        lines.append(f"Critical path: {' -> '.join(res['critical_path'])}")
        for a in res["activities"]:
            flag = "CRITICAL" if a["critical"] else f"float={a['total_float']}"
            lines.append(f"  {a['id']}: ES={a['early_start']} "
                         f"EF={a['early_finish']} LS={a['late_start']} "
                         f"LF={a['late_finish']} [{flag}]")
        return "\\n".join(lines)
```

## Quick Start

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

## Common Use Cases

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

## Resources

- plataforma-obras `shared/cpm.ts` - canonical TS implementation (same math)
- Mattos, Planejamento e Controle de Obras - CPM theory
