---
name: 'lob-line-of-balance'
description: 'Line of Balance for repetitive construction (pavimentos, units, stretches): pace, crews, rhythm, interference detection, rebalancing. Use for linha de balanco, LOB, ritmo, pavimento tipo, repetitivo, balanceamento de equipes.'
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

## Business Case

### Problem Statement

Repetitive work (typical floors, housing units) scheduled as
independent bars hides rhythm conflicts: crews arrive before the
front is free, or idle waiting. Classic Gantt misses interference.

### Solution

Pace-based planning: each activity has rhythm (units/day) and crew
count; plot location x time; detect crossings; rebalance by crews.

## Technical Implementation

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

## Quick Start

```python
est = LobActivity("EST", "Estrutura", 1, 12, 5.0, crews=2)
alv = LobActivity("ALV", "Alvenaria", 1, 12, 4.0, crews=1, start_day=6)
print(f"Ritmo EST: {est.rhythm:.2f} pav/dia, termina dia {est.finish_day()}")
hits = detect_interference(est, alv)
print(f"Interferencias: {hits[:3]}")
print("Equipes ALV p/ acompanhar:", crews_to_match_rhythm(est.rhythm, 4.0))
```

## Rules

1. LOB is parameterized: activity, first/last location, pace, crews, calendar.
2. Never hardcode `IF(1<=N)`-style always-true guards or literal rhythms.
3. Rebalance by crews first; changing pace without crews hides the real cost.

## Resources

- plataforma-obras `GanttView.tsx` (LOB view) + lean-planning-mcp
- Mattos - repetitive scheduling chapter
