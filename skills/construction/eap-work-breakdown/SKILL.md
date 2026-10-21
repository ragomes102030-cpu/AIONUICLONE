---
name: eap-work-breakdown
description: >-
  Builds, edits and audits a construction Work Breakdown Structure (EAP/WBS):
  hierarchical packages, dotted WBS coding, scope-to-activity linkage, quantity and
  cost roll-up, structural validation (orphans, duplicates, depth, numbering gaps).
  Use when the user mentions EAP, WBS, estrutura analítica, pacotes de trabalho,
  árvore de escopo, or asks to "organize", "dividir" or "estruturar" the obra —
  even without naming EAP. Do NOT use for schedule dates (use `cpm-scheduling`)
  or pricing (use `budget-composition-service`).
homepage: 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento'
metadata:
  {
    'openclaw':
      {
        'emoji': '🧱',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# EAP Work Breakdown Structure

## When to Use

Use when the user:
- Names EAP, WBS, estrutura analítica, pacotes de trabalho, árvore de escopo
- Says "organiza essa obra", "divide em partes", "estrutura o escopo" (sem citar EAP)
- Wants to audit a breakdown for órfãos, duplicados, profundidade, lacuna de numeração
- Needs quantity or cost roll-up from the leaves

Do NOT use for: datas/duração/caminho crítico (`cpm-scheduling`); preço/BDI
(`budget-composition-service`).

## Workflow

1. **Colete o escopo.** Tipo de obra, pavimentos, disciplinas, nível de detalhe.
   Sem isso a EAP sai genérica e inútil.
2. **Escolha UM critério de decomposição** e declare: por disciplina · por etapa ·
   por local (torre/pavimento) · por sistema. **Misturar critérios no mesmo nível
   é o erro mais comum.**
3. **Codifique** com código pontilhado: `1` → `1.2` → `1.2.3`. Um dígito por nível.
4. **Limite a profundidade a 6 níveis.** Acima disso é cronograma, não EAP.
5. **Vincule atividades.** Toda folha precisa de ≥ 1 atividade.
6. **Faça roll-up.** Quantidade do pai = soma dos filhos (ou declare nó de agregação).
7. **Valide** com o `EapBuilder.validate()` abaixo.
8. **Entregue** em Excel com formatação brasileira (skill `formato-br`).

## Implementation

### Technical Implementation

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

```python
eap = EapBuilder()
eap.add_node("1", "Edificio A")
eap.add_node("1.1", "Fundacoes", quantity=120.0, unit="m3")
eap.add_node("1.2", "Estrutura", quantity=450.0, unit="m2")
eap.link_activity("AT-001", "1.1")
print(eap.validate())
print("Total 1:", eap.rollup_quantity("1"))
```

## Pitfalls

- **Misturar critérios de decomposição.** "Fundação" (etapa) ao lado de "Hidráulica"
  (disciplina) no mesmo nível quebra o roll-up. Um critério por nível.
- **Folha órfã.** Pacote sem atividade vinculada é escopo que ninguém executa nem
  mede. Bloqueie a aprovação até vincular.
- **Profundidade excessiva.** 8 níveis para uma casa = cronograma disfarçado de EAP.
- **Código não sequencial.** Buracos (`1.1`, `1.3`, sem `1.2`) indicam remoção sem
  renumeração. Rejeite na validação.
- **Duplicidade semântica.** "Estrutura de concreto" e "Concreto estrutural" são a
  mesma coisa. Audite contra sinônimos.
- **Roll-up divergente é DADO, não fórmula.** Se pai ≠ soma dos filhos, reporte a
  divergência. Nunca "conserte" o pai em silêncio.
- **EAP copiada de outro projeto.** Escopo é específico; EAP genérica gera medição
  errada depois.

## Examples

**Input:** "Monta a EAP de uma casa térrea de 120 m²"

**Output:**

| Código | Pacote | Qtde | Un | Atividades |
|---|---|---|---|---|
| 1 | Casa térrea 120 m² | 120 | m² | — (nó de agregação) |
| 1.1 | Serviços preliminares | 1 | vb | 3 |
| 1.2 | Fundação | 24 | m³ | 4 |
| 1.3 | Estrutura | 120 | m² | 5 |
| 1.4 | Alvenaria e vedação | 260 | m² | 4 |
| 1.5 | Instalações | 1 | vb | 8 |
| 1.6 | Acabamento | 340 | m² | 7 |

Critério: **por etapa**. Profundidade: 2. Folhas: 6. Órfãs: 0.
O nó 1 é agregação (área construída), não soma dos filhos — declare isso.

## Verification

Rode `EapBuilder.validate()` e interprete:

```
CRITICAL  código X: pai Y inexistente     -> corrija a hierarquia
CRITICAL  código X: duplicado             -> renumerar
WARNING   folha X sem atividade vinculada -> justificar ou vincular
WARNING   profundidade N excede 6         -> mover detalhe para atividades
WARNING   lacuna de numeração em X        -> renumerar
```

**Só entregue com zero CRITICAL.** WARNING deve ser justificado no relatório, não
ignorado. Se o roll-up divergir da soma dos filhos, reporte e pare.
