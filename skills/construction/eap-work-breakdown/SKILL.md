---
name: 'eap-work-breakdown'
description: 'Build and validate construction Work Breakdown Structures (EAP/WBS): hierarchical packages, WBS coding, scope-activity linkage, structural validation (orphans, duplicates, depth), quantity roll-up. Use when creating, editing, auditing or validating EAP, WBS, pacotes de trabalho, estrutura analitica.'
homepage: 'https://github.com/ragomes102030-cpu/AIONUICLONE'
metadata:
  {
    'openclaw':
      {
        'emoji': '🧱',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/AIONUICLONE',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# EAP Work Breakdown Structure

## Business Case

### Problem Statement

- EAP nodes created without hierarchy rules: duplicate codes, gaps, orphans
- Activities not linked to any package (scope leak)
- Quantity/cost roll-up done by hand, diverging from leaves
- Structural errors only found at measurement time

### Solution

Code-driven EAP builder: dotted WBS codes, parent/child integrity,
activity linkage check, bottom-up roll-up, structural audit report.

## Technical Implementation

```python
from typing import Dict, List, Optional
from dataclasses import dataclass, field


@dataclass
class EapNode:
    code: str            # dotted WBS code, e.g. "1.2.3"
    title: str
    parent_code: Optional[str] = None
    quantity: float = 0.0
    unit: str = ""
    children: List[str] = field(default_factory=list)


class EapBuilder:
    def __init__(self):
        self.nodes: Dict[str, EapNode] = {}
        self.activity_links: Dict[str, str] = {}  # activity_id -> eap code

    def add_node(self, code, title, quantity=0.0, unit=""):
        if code in self.nodes:
            raise ValueError(f"Duplicate EAP code: {code}")
        parent = ".".join(code.split(".")[:-1]) or None
        if parent and parent not in self.nodes:
            raise ValueError(f"Parent {parent} of {code} does not exist")
        node = EapNode(code=code, title=title,
                       parent_code=parent, quantity=quantity, unit=unit)
        self.nodes[code] = node
        if parent:
            self.nodes[parent].children.append(code)
        return node

    def link_activity(self, activity_id: str, eap_code: str):
        if eap_code not in self.nodes:
            raise ValueError(f"EAP package not found: {eap_code}")
        self.activity_links[activity_id] = eap_code

    def unlinked_packages(self) -> List[str]:
        linked = set(self.activity_links.values())
        leaves = [c for c, n in self.nodes.items() if not n.children]
        return [c for c in leaves if c not in linked]

    def rollup_quantity(self, code: str) -> float:
        node = self.nodes[code]
        if not node.children:
            return node.quantity
        return sum(self.rollup_quantity(c) for c in node.children)

    def validate(self) -> List[str]:
        issues = []
        for code, node in self.nodes.items():
            if node.parent_code and node.parent_code not in self.nodes:
                issues.append(f"CRITICAL {code}: missing parent {node.parent_code}")
            parts = code.split(".")
            if any(not p.isdigit() for p in parts):
                issues.append(f"FORMAT {code}: non-numeric WBS segment")
        depth = lambda c: len(c.split("."))  # noqa
        max_depth = max((depth(c) for c in self.nodes), default=0)
        if max_depth > 6:
            issues.append(f"WARNING: depth {max_depth} exceeds 6 levels")
        for leaf in self.unlinked_packages():
            issues.append(f"WARNING leaf {leaf} has no linked activities")
        return issues
```

## Quick Start

```python
eap = EapBuilder()
eap.add_node("1", "Edificio A")
eap.add_node("1.1", "Fundacoes", quantity=120.0, unit="m3")
eap.add_node("1.2", "Estrutura", quantity=450.0, unit="m2")
eap.link_activity("AT-001", "1.1")
print(eap.validate())
print("Total 1:", eap.rollup_quantity("1"))
```

## Resources

- plataforma-obras `EapView.tsx` + `server/routers.ts` (EAP CRUD)
- Mattos, Planejamento e Controle de Obras - WBS chapter
