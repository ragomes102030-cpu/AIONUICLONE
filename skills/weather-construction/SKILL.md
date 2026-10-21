---
name: weather-construction
description: >-
  Fetches rain, temperature and wind forecasts (Open-Meteo, free, no API key) for
  a construction site and cross-checks them against outdoor activities in the
  schedule to flag weather risk and suggest replanning. Use when the user asks
  about chuva, previsão do tempo na obra, risco climático, dias perdidos por
  chuva, "vai chover?", "dá para concretar/escavar/pintar no sábado?", or wants
  to justify a delay with historical weather. Do NOT use to claim schedule
  impact without cross-checking the Gantt, nor for fully indoor activities.
homepage: 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento'
metadata:
  {
    'openclaw':
      {
        'emoji': '🌧️',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento',
        'requires': { 'bins': ['curl'] },
      },
  }
---

# Weather — Construction

## When to Use

Use when the user:
- Wants the rain/weather forecast for a site ("vai chover essa semana?", "dá para concretar sábado?")
- Needs to check outdoor activities against upcoming weather before committing a week of work
- Wants to justify a past delay with historical weather (% of lost days)
- Manages multiple obras and wants to compare climate exposure

Do NOT use for: indoor-only scopes with mechanized finishes; or to declare a
schedule impact — always cross-check the activity dates in the Gantt first.

## Workflow

1. **Get the site coordinates** (lat/lon). If only a city is known, geocode it via
   Open-Meteo Geocoding API.
2. **Fetch the forecast** with `curl` against `api.open-meteo.com` (never Python
   `urllib` — it fails on stale TLS roots on some Windows machines):
   ```bash
   curl -s "https://api.open-meteo.com/v1/forecast?latitude=-3.7174&longitude=-38.5468&daily=precipitation_probability_max,precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max&forecast_days=16&timezone=auto"
   ```
   Request the **full horizon** — do not truncate to 3–5 days; the API returns 15–16.
3. **Cross with the schedule**: for each outdoor task (`escavação, concreto, pintura
   externa, pavimentação, telhado, andaime`), compare its start–end window with the
   daily rain/accumulated/wind.
4. **Classify the risk** (probability alone is not enough — cross with mm and wind):
   - `CRÍTICO`: prob ≥ 90% **or** accumulated ≥ 20 mm → replan urgently
   - `MÉDIO`: prob ≥ 60% **or** accumulated ≥ 10 mm → monitor, have plan B
   - `LEVE`: prob ≥ 30% → attention
   - `vento > 40 km/h` → risk for andaimes/telhados (regardless of rain)
5. **Recommend concrete moves**: anticipate the critical task before the rain window,
   protect freshly-poured concrete, resequence, or shift to indoor fronts.
6. **Historical justification**: fetch the archive endpoint for the delay window and
   report days with rain > 5 mm and % of days lost.

## Pitfalls

- Using only `precipitation_probability_max` — 5 mm of rain breaks a concrete pour
  even at 40% probability. Always read `precipitation_sum` too.
- Ignoring wind: > 40 km/h stops crane/andaime work as hard as rain.
- Projecting "dias perdidos" linearly: rain at 03:00 vs 14:00 matters — check the
  hourly breakdown when the call is close.
- Assuming the site timezone: pass `timezone=auto` or the explicit site timezone.

## Verification

- Every flagged day has a matching date in the schedule window (no orphan days).
- The critical activities you flag are actually `externo` in the EAP/Gantt.
- The forecast horizon requested equals the horizon returned (no silent truncation).

## Output (example)

```text
Obra: Residencial Beach Hotel, Fortaleza-CE
Previsão: 23/09 a 02/10/2026

DIAS DE RISCO CRÍTICO (chuva >= 90% ou acumulado >= 20mm):
  25/09 — 97% / 7.3mm — Risco: escavação, touca de concreto
  26/09 — 69% / 2.6mm — Risco leve: pintura externa

RECOMENDAÇÃO:
  - Antecipar escavação S1 para 23/09 (29% / 0.9mm — ok)
  - Proteção do radier caso a concretagem avance para 26/09
  - 5/10 dias com possibilidade >= 60% de chuva — monitorar a cada 2 dias

HISTÓRICO 01–22/09: 4 dias com chuva > 5mm, 18% de dias perdidos
```

## Author

Arquimedes / planejamento de obras
