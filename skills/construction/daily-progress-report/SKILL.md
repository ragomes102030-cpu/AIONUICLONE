---
name: daily-progress-report
description: >-
  Generates daily construction progress reports (RDO) from structured site data:
  work completed, labor hours, equipment usage, weather and delays. Use when the user
  mentions RDO, diário de obra, relatório diário, parte diária, or asks to write up
  what happened on site today — even without naming RDO. Do NOT use for contractual
  measurement (use `production-measurement-control`) or cost tracking (use
  `construction-cost-control`).
homepage: 'https://datadrivenconstruction.io'
metadata:
  {
    'openclaw':
      {
        'emoji': '📊',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://datadrivenconstruction.io',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# Daily Progress Report Generator

## When to Use

Use when the user:
- Names RDO, diário de obra, relatório diário, parte diária, boletim de campo
- Says "escreve o que aconteceu hoje na obra" (sem citar RDO)
- Wants labor hours, equipment and weather recorded
- Needs delay justification for the day

Do NOT use for: medição contratual (`production-measurement-control`); custo
(`construction-cost-control`).

## Workflow

1. **Colete os fatos do dia:** serviços executados, mão de obra presente, equipamento,
   clima, ocorrências.
2. **Registre quantidade executada** por serviço e frente.
3. **Registre horas de mão de obra** por função (não só o total).
4. **Registre equipamento** por horas de operação e de ociosidade.
5. **Registre o clima** com impacto: choveu? quanto? atrasou o quê?
6. **Registre ocorrências** com responsável e ação.
7. **Assine e date.** RDO sem data e responsável não tem valor contratual.

## Implementation

### Technical Implementation

```python
import pandas as pd
from datetime import datetime, date
from typing import Dict, Any, List
from dataclasses import dataclass
from enum import Enum


class WeatherCondition(Enum):
    CLEAR = "clear"
    CLOUDY = "cloudy"
    RAIN = "rain"
    SNOW = "snow"
    WIND = "wind"
    EXTREME = "extreme"


class WorkStatus(Enum):
    COMPLETED = "completed"
    IN_PROGRESS = "in_progress"
    DELAYED = "delayed"
    NOT_STARTED = "not_started"


@dataclass
class WorkActivity:
    activity_id: str
    description: str
    location: str
    planned_qty: float
    actual_qty: float
    unit: str
    status: WorkStatus
    crew_size: int
    hours_worked: float
    notes: str = ""


@dataclass
class LaborEntry:
    trade: str
    company: str
    workers: int
    hours: float
    overtime_hours: float = 0


@dataclass
class EquipmentEntry:
    equipment_type: str
    equipment_id: str
    hours_used: float
    status: str  # active, idle, maintenance
    operator: str = ""


@dataclass
class DailyReport:
    report_date: date
    project_name: str
    project_number: str
    weather: WeatherCondition
    temperature_high: float
    temperature_low: float
    work_activities: List[WorkActivity]
    labor: List[LaborEntry]
    equipment: List[EquipmentEntry]
    delays: List[str]
    safety_incidents: int
    visitors: List[str]
    deliveries: List[str]
    prepared_by: str


class DailyProgressReporter:
    """Generate daily progress reports."""

    def __init__(self, project_name: str, project_number: str):
        self.project_name = project_name
        self.project_number = project_number

    def create_report(self,
                      report_date: date,
                      weather: WeatherCondition,
                      temp_high: float,
                      temp_low: float,
                      prepared_by: str) -> DailyReport:
        """Create new daily report."""

        return DailyReport(
            report_date=report_date,
            project_name=self.project_name,
            project_number=self.project_number,
            weather=weather,
            temperature_high=temp_high,
            temperature_low=temp_low,
            work_activities=[],
            labor=[],
            equipment=[],
            delays=[],
            safety_incidents=0,
            visitors=[],
            deliveries=[],
            prepared_by=prepared_by
        )

    def add_work_activity(self,
                          report: DailyReport,
                          activity_id: str,
                          description: str,
                          location: str,
                          planned_qty: float,
                          actual_qty: float,
                          unit: str,
                          crew_size: int,
                          hours_worked: float,
                          notes: str = ""):
        """Add work activity to report."""

        # Determine status
        if actual_qty >= planned_qty:
            status = WorkStatus.COMPLETED
        elif actual_qty > 0:
            status = WorkStatus.IN_PROGRESS
        elif actual_qty == 0 and planned_qty > 0:
            status = WorkStatus.DELAYED
        else:
            status = WorkStatus.NOT_STARTED

        activity = WorkActivity(
            activity_id=activity_id,
            description=description,
            location=location,
            planned_qty=planned_qty,
            actual_qty=actual_qty,
            unit=unit,
            status=status,
            crew_size=crew_size,
            hours_worked=hours_worked,
            notes=notes
        )

        report.work_activities.append(activity)

    def add_labor(self,
                  report: DailyReport,
                  trade: str,
                  company: str,
                  workers: int,
                  hours: float,
                  overtime_hours: float = 0):
        """Add labor entry."""

        report.labor.append(LaborEntry(
            trade=trade,
            company=company,
            workers=workers,
            hours=hours,
            overtime_hours=overtime_hours
        ))

    def add_equipment(self,
                      report: DailyReport,
                      equipment_type: str,
                      equipment_id: str,
                      hours_used: float,
                      status: str,
                      operator: str = ""):
        """Add equipment entry."""

        report.equipment.append(EquipmentEntry(
            equipment_type=equipment_type,
            equipment_id=equipment_id,
            hours_used=hours_used,
            status=status,
            operator=operator
        ))

    def calculate_summary(self, report: DailyReport) -> Dict[str, Any]:
        """Calculate report summary metrics."""

        total_workers = sum(l.workers for l in report.labor)
        total_manhours = sum(l.workers * l.hours for l in report.labor)
        total_overtime = sum(l.workers * l.overtime_hours for l in report.labor)
        equipment_hours = sum(e.hours_used for e in report.equipment)

        completed = sum(1 for a in report.work_activities if a.status == WorkStatus.COMPLETED)
        in_progress = sum(1 for a in report.work_activities if a.status == WorkStatus.IN_PROGRESS)
        delayed = sum(1 for a in report.work_activities if a.status == WorkStatus.DELAYED)

        return {
            'total_workers': total_workers,
            'total_manhours': round(total_manhours, 1),
            'total_overtime': round(total_overtime, 1),
            'equipment_hours': round(equipment_hours, 1),
            'activities_completed': completed,
            'activities_in_progress': in_progress,
            'activities_delayed': delayed,
            'safety_incidents': report.safety_incidents,
            'deliveries_count': len(report.deliveries)
        }

    def export_to_excel(self, report: DailyReport, output_path: str) -> str:
        """Export report to Excel."""

        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            # Header
            header_df = pd.DataFrame([{
                'Project': report.project_name,
                'Project #': report.project_number,
                'Date': report.report_date,
                'Weather': report.weather.value,
                'High Temp': report.temperature_high,
                'Low Temp': report.temperature_low,
                'Prepared By': report.prepared_by
            }])
            header_df.to_excel(writer, sheet_name='Summary', index=False)

            # Work Activities
            if report.work_activities:
                activities_df = pd.DataFrame([
                    {
                        'Activity ID': a.activity_id,
                        'Description': a.description,
                        'Location': a.location,
                        'Planned': a.planned_qty,
                        'Actual': a.actual_qty,
                        'Unit': a.unit,
                        'Status': a.status.value,
                        'Crew': a.crew_size,
                        'Hours': a.hours_worked,
                        'Notes': a.notes
                    }
                    for a in report.work_activities
                ])
                activities_df.to_excel(writer, sheet_name='Work Activities', index=False)

            # Labor
            if report.labor:
                labor_df = pd.DataFrame([
                    {
                        'Trade': l.trade,
                        'Company': l.company,
                        'Workers': l.workers,
                        'Hours': l.hours,
                        'Overtime': l.overtime_hours,
                        'Total Hours': l.workers * (l.hours + l.overtime_hours)
                    }
                    for l in report.labor
                ])
                labor_df.to_excel(writer, sheet_name='Labor', index=False)

            # Equipment
            if report.equipment:
                equip_df = pd.DataFrame([
                    {
                        'Type': e.equipment_type,
                        'ID': e.equipment_id,
                        'Hours': e.hours_used,
                        'Status': e.status,
                        'Operator': e.operator
                    }
                    for e in report.equipment
                ])
                equip_df.to_excel(writer, sheet_name='Equipment', index=False)

        return output_path

    def generate_text_report(self, report: DailyReport) -> str:
        """Generate text version of report."""

        summary = self.calculate_summary(report)

        lines = [
            f"DAILY PROGRESS REPORT",
            f"=" * 50,
            f"Project: {report.project_name}",
            f"Project #: {report.project_number}",
            f"Date: {report.report_date}",
            f"Prepared by: {report.prepared_by}",
            f"",
            f"WEATHER CONDITIONS",
            f"-" * 30,
            f"Conditions: {report.weather.value}",
            f"Temperature: {report.temperature_low}°C - {report.temperature_high}°C",
            f"",
            f"SUMMARY",
            f"-" * 30,
            f"Total Workers: {summary['total_workers']}",
            f"Total Man-hours: {summary['total_manhours']}",
            f"Equipment Hours: {summary['equipment_hours']}",
            f"Activities Completed: {summary['activities_completed']}",
            f"Activities In Progress: {summary['activities_in_progress']}",
            f"Activities Delayed: {summary['activities_delayed']}",
            f"Safety Incidents: {summary['safety_incidents']}",
        ]

        if report.delays:
            lines.extend([f"", f"DELAYS", f"-" * 30])
            for delay in report.delays:
                lines.append(f"• {delay}")

        return "\n".join(lines)
```

```python
from datetime import date

# Initialize reporter
reporter = DailyProgressReporter("Office Tower A", "PRJ-2024-001")

# Create report
report = reporter.create_report(
    report_date=date.today(),
    weather=WeatherCondition.CLEAR,
    temp_high=28,
    temp_low=18,
    prepared_by="John Smith"
)

# Add activities
reporter.add_work_activity(
    report,
    activity_id="A-101",
    description="Pour concrete slab Level 3",
    location="Level 3, Zone A",
    planned_qty=150,
    actual_qty=150,
    unit="m3",
    crew_size=8,
    hours_worked=10
)

# Add labor
reporter.add_labor(report, "Concrete", "ABC Concrete Co", 8, 10, 2)

# Export
reporter.export_to_excel(report, "daily_report.xlsx")
```

### 1. Generate Text Summary

```python
text = reporter.generate_text_report(report)
print(text)
```

### 2. Track Delays

```python
report.delays.append("Weather delay - rain from 14:00-16:00")
report.delays.append("Material delivery late by 2 hours")
```

### 3. Calculate Metrics

```python
summary = reporter.calculate_summary(report)
print(f"Productivity: {summary['total_manhours']} man-hours")
```

## Pitfalls

- **RDO sem clima não serve para pleito.** Chuva é a justificativa mais comum de
  prorrogação. Registre hora de início e fim, não só "choveu".
- **Horas de mão de obra agrupadas escondem a produtividade.** Registre por função
  (pedreiro, servente, armador) para poder calcular produtividade depois.
- **Equipamento ocioso é custo real.** Registre as horas paradas e o motivo. Só a
  hora operada esconde o prejuízo.
- **Ocorrência sem responsável não se resolve.** Toda ocorrência precisa de
  responsável e prazo de ação.
- **RDO reescrito depois perde valor probatório.** Corrija com aditamento datado,
  não sobrescrevendo.
- **Dia sem produção não é dia vazio.** Registre o motivo (chuva, falta de material,
  greve). "Nada feito" sem justificativa prejudica o pleito.
- **Quantidade sem frente é inauditável.** Sempre serviço + frente + quantidade.

## Examples

**Input:** "Hoje: 180 m² de alvenaria pav 4, 6 pedreiros, 6 serventes, 8h.
Betoneira 6h operando, 2h parada (falta de material). Chuva 14h-16h."

**Output:**

```
RELATÓRIO DIÁRIO DE OBRA — 15/10/2026
Obra: Edifício Residencial | Responsável: [nome] | Assinatura: ____

SERVIÇOS EXECUTADOS
  Alvenaria de vedação — Pav 4 — 180 m²

MÃO DE OBRA                    EQUIPAMENTO
  Pedreiro ........ 6 × 8h = 48h    Betoneira: 6h oper. / 2h parada
  Servente ........ 6 × 8h = 48h    Motivo da parada: falta de argamassa

CONDIÇÕES CLIMÁTICAS
  Manhã: bom. 14h-16h: chuva forte (2h). Impacto: alvenaria externa parada 2h.

OCORRÊNCIAS
  1. Falta de argamassa (14h) — Resp.: Almoxarife — Ação: reforçar pedido
  2. Chuva 14h-16h — Impacto: 2h perdidas na frente externa

Produtividade: 180 / (6 × 8) = 3,75 m²/pedreiro·h (ref.: 4,00 → 94%)
```

Dia com 2h perdidas (chuva) + 2h de equipamento ocioso — registrado para pleito.

## Verification

- [ ] Data e responsável presentes
- [ ] Quantidade por serviço **e** frente
- [ ] Horas de mão de obra **por função**
- [ ] Equipamento com hora operada **e** parada + motivo
- [ ] Clima com hora de início/fim e impacto no serviço
- [ ] Toda ocorrência com responsável e ação
- [ ] Produtividade calculada a partir das horas
- [ ] Sem reescrita retroativa (correção via aditamento)
