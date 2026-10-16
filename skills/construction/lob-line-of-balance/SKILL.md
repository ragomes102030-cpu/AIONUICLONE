---
name: lob-line-of-balance
description: >-
  Plans and validates Line of Balance (LOB / linha de balanço) for repetitive
  construction: pace (ritmo), crews, work fronts, continuity, interference detection
  and rebalancing. Use when the user mentions linha de balanço, LOB, ritmo de produção,
  pavimento tipo, obra repetitiva, frentes de trabalho simultâneas, or asks how to keep
  crews busy across floors/units. Do NOT use for one-off linear schedules (use
  `gantt-chart`) or CPM float analysis (use `cpm-network-validator`).
homepage: 'https://github.com/ragomes102030-cpu/AIONUICLONE'
metadata:
  {
    'openclaw':
      {
        'emoji': '🔁',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/AIONUICLONE',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Line of Balance (LOB)

## When to Use

Use when the user:
- Names linha de balanço, LOB, ritmo, pace, pavimento tipo, unidade repetitiva
- Asks "como manter as equipes ocupadas?", "tem conflito de frente?"
- Works on a building with typical floors, a housing complex, or repeated stretches
- Needs to balance crews across locations

Do NOT use for: obra linear não repetitiva (`gantt-chart`); folga/CPM (`cpm-network-validator`).

## Workflow

1. **Confirme a repetição.** LOB exige locais repetidos (pavimentos, unidades,
   trechos). Sem repetição, use Gantt.
2. **Parametrize cada atividade:** local inicial, local final, ritmo (unidades/dia),
   nº de equipes, calendário.
3. **Desenhe local × tempo.** Cada atividade é uma linha; a inclinação é o ritmo.
4. **Detecte cruzamento.** Linhas que se cruzam = interferência: a equipe chega
   antes da frente estar livre.
5. **Verifique continuidade.** Linha horizontal = equipe ociosa; linha vertical =
   ritmo impossível.
6. **Rebalanceie por equipes primeiro.** Só depois mexa no ritmo.
7. **Reporte o caminho crítico da LOB** (a sequência que determina o prazo total).

## Implementation

### Technical Implementation

```python
from typing import Dict, List, Optional
from dataclasses import dataclass


@dataclass
class LobActivity:
    id: str
    name: str
    first_location: int      # e.g. floor 1
    last_location: int       # e.g. floor 12
    duration_per_unit: float  # days per location with 1 crew
    crews: int = 1
    start_day: float = 0.0

    @property
    def locations(self) -> int:
        return self.last_location - self.first_location + 1

    @property
    def rhythm(self) -> float:
        eff = self.duration_per_unit / max(self.crews, 1)
        return 1.0 / eff if eff else 0.0  # units per day

    def finish_day(self) -> float:
        eff = self.duration_per_unit / max(self.crews, 1)
        return self.start_day + eff * self.locations

    def day_at(self, location: int) -> float:
        eff = self.duration_per_unit / max(self.crews, 1)
        return self.start_day + eff * (location - self.first_location)


def detect_interference(upstream: LobActivity,
                        downstream: LobActivity,
                        buffer: float = 1.0) -> List[Dict]:
    """Locations where downstream would start before upstream frees the front."""
    hits = []
    for loc in range(max(upstream.first_location, downstream.first_location),
                     min(upstream.last_location, downstream.last_location) + 1):
        free = upstream.day_at(loc) + upstream.duration_per_unit / max(upstream.crews, 1)
        arrive = downstream.day_at(loc)
        if arrive < free + buffer:
            hits.append({"location": loc, "free_day": round(free, 2),
                         "arrive_day": round(arrive, 2)})
    return hits


def crews_to_match_rhythm(reference_rhythm: float,
                          duration_per_unit: float) -> int:
    import math
    return max(1, math.ceil(reference_rhythm * duration_per_unit))
```

```python
est = LobActivity("EST", "Estrutura", 1, 12, 5.0, crews=2)
alv = LobActivity("ALV", "Alvenaria", 1, 12, 4.0, crews=1, start_day=6)
print(f"Ritmo EST: {est.rhythm:.2f} pav/dia, termina dia {est.finish_day()}")
hits = detect_interference(est, alv)
print(f"Interferencias: {hits[:3]}")
print("Equipes ALV p/ acompanhar:", crews_to_match_rhythm(est.rhythm, 4.0))
```

## Pitfalls

- **LOB não é Gantt.** Gantt mostra barras por data; LOB mostra ritmo por local.
  Se não há repetição, LOB não se aplica.
- **Nunca hardcode `IF(1<=N)`-style always-true guards.** É planilha morta que
  aparenta funcionar. Parametrize tudo.
- **Ritmo literal é ritmo errado.** Ritmo vem de produtividade × equipes, não de
  número digitado. Se está digitado, não reage a mudança de equipe.
- **Rebalanceie por equipes primeiro.** Mudar o ritmo sem mexer nas equipes esconde
  o custo real da solução.
- **Cruzamento não é erro, é conflito.** Aponte onde e entre quais atividades, e
  proponha o rebalanceamento — não "conserte" sozinho.
- **Continuidade ≠ ocupação total.** Equipe 100% ocupada com ritmo errado gera
  estoque. Meça a frente, não só a ocupação.

## Examples

**Input:** "Linha de balanço, edifício de 12 pavimentos tipo, 2 frentes.
Alvenaria ritmo 0,5 pav/dia, 2 equipes. Reboco ritmo 0,4 pav/dia, 2 equipes."

**Output:**

| Atividade | Ritmo (pav/dia) | Equipes | Duração (12 pav) | Início | Fim |
|---|---|---|---|---|---|
| Alvenaria | 0,50 | 2 | 12 dias | Pav 1 | Pav 12 |
| Reboco | 0,40 | 2 | 15 dias | Pav 1 (+3) | Pav 12 (+3) |

**Interferência detectada:** reboco inicia no pav 1 quando alvenaria ainda está no
pav 3 → **cruzamento na frente 2-3**. A equipe de reboco chega antes da frente livre.

**Rebalanceamento proposto:** manter 2 equipes de alvenaria e reduzir reboco para
1 equipe no início (ritmo efetivo 0,20 → aguarda), ou adicionar 1 equipe de reboco
(ritmo 0,60 > alvenaria → elimina o cruzamento).

Caminho crítico LOB: alvenaria (12 dias) determina o prazo.

## Verification

Antes de entregar:
- [ ] Toda atividade tem ritmo derivado (produtividade × equipes), não digitado
- [ ] Nenhuma linha vertical (ritmo impossível) sem justificativa
- [ ] Cruzamentos listados com par de atividades e local exato
- [ ] Rebalanceamento propõe mudança de equipe, não só de ritmo
- [ ] Caminho crítico da LOB identificado
- [ ] Calendário aplicado (dias úteis, feriados)
