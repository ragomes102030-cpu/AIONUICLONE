---
name: kpi-dashboard
description: >-
  Builds construction KPI dashboards tracking CPI, SPI, physical progress, quality
  and safety indicators, with automated data collection and alerting. Use when the user
  mentions painel de obra, KPI, indicador, dashboard de obra, CPI, SPI, avanço,
  or asks for a management view of the project. Do NOT use for designing the dashboard
  visual hierarchy (use `dashboard-design`) or for a generic multi-element Excel
  dashboard (use `officecli-data-dashboard`).
homepage: 'https://datadrivenconstruction.io'
metadata:
  {
    'openclaw':
      {
        'emoji': '📈',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://datadrivenconstruction.io',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# KPI Dashboard Builder

## When to Use

Use when the user:
- Names KPI, indicador, painel de obra, dashboard de obra, semáforo de obra
- Wants CPI, SPI, avanço físico, qualidade e segurança num painel
- Needs alerting on threshold breach
- Asks for a management view for stakeholders

Do NOT use for: desenho/hierarquia visual (`dashboard-design`); dashboard Excel
genérico (`officecli-data-dashboard`).

## Workflow

1. **Defina cada KPI com fórmula explícita.** Indicador sem fórmula é opinião.
2. **Defina a meta e o limiar de alerta** por indicador.
3. **Escolha a fonte** de cada dado e a frequência de atualização.
4. **Organize em hierarquia:** resultado (CPI/SPI) → causa (produtividade, consumo)
   → ação (restrições abertas).
5. **Escolha o gráfico pelo dado:** tendência → linha; comparação → barra;
   composição → barra empilhada; dispersão → scatter.
6. **Configure o alerta** para limiar violado.
7. **Teste com dado real** — dashboard com dado falso esconde o bug.

## Implementation

### Technical Implementation

```python
import pandas as pd
from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum


class KPICategory(Enum):
    COST = "cost"
    SCHEDULE = "schedule"
    QUALITY = "quality"
    SAFETY = "safety"
    PRODUCTIVITY = "productivity"
    SUSTAINABILITY = "sustainability"


class KPIStatus(Enum):
    ON_TARGET = "on_target"
    AT_RISK = "at_risk"
    CRITICAL = "critical"


class TrendDirection(Enum):
    IMPROVING = "improving"
    STABLE = "stable"
    DECLINING = "declining"


@dataclass
class KPIDefinition:
    kpi_id: str
    name: str
    category: KPICategory
    unit: str
    target: float
    warning_threshold: float
    critical_threshold: float
    higher_is_better: bool = True
    formula: str = ""


@dataclass
class KPIValue:
    kpi_id: str
    value: float
    date: date
    status: KPIStatus
    trend: TrendDirection


class KPIDashboard:
    """Build and manage KPI dashboards for construction projects."""

    def __init__(self, project_name: str):
        self.project_name = project_name
        self.kpis: Dict[str, KPIDefinition] = {}
        self.history: Dict[str, List[KPIValue]] = {}
        self._define_standard_kpis()

    def _define_standard_kpis(self):
        """Define standard construction KPIs."""

        standard_kpis = [
            # Cost KPIs
            KPIDefinition("CPI", "Cost Performance Index", KPICategory.COST,
                         "ratio", 1.0, 0.95, 0.90, True, "BCWP / ACWP"),
            KPIDefinition("CV", "Cost Variance", KPICategory.COST,
                         "$", 0, -50000, -100000, True, "BCWP - ACWP"),
            KPIDefinition("BUDGET_USED", "Budget Utilization", KPICategory.COST,
                         "%", 100, 105, 110, False),

            # Schedule KPIs
            KPIDefinition("SPI", "Schedule Performance Index", KPICategory.SCHEDULE,
                         "ratio", 1.0, 0.95, 0.90, True, "BCWP / BCWS"),
            KPIDefinition("SV", "Schedule Variance", KPICategory.SCHEDULE,
                         "days", 0, -7, -14, True),
            KPIDefinition("COMPLETION", "Project Completion", KPICategory.SCHEDULE,
                         "%", 100, 95, 90, True),

            # Quality KPIs
            KPIDefinition("DEFECT_RATE", "Defect Rate", KPICategory.QUALITY,
                         "per 1000 units", 0, 5, 10, False),
            KPIDefinition("FIRST_PASS", "First Pass Yield", KPICategory.QUALITY,
                         "%", 95, 90, 85, True),
            KPIDefinition("REWORK", "Rework Percentage", KPICategory.QUALITY,
                         "%", 0, 3, 5, False),

            # Safety KPIs
            KPIDefinition("TRIR", "Total Recordable Incident Rate", KPICategory.SAFETY,
                         "per 200k hours", 0, 2, 4, False),
            KPIDefinition("LOST_DAYS", "Lost Time Injuries", KPICategory.SAFETY,
                         "incidents", 0, 1, 3, False),
            KPIDefinition("SAFETY_OBSERVATIONS", "Safety Observations", KPICategory.SAFETY,
                         "count", 50, 30, 20, True),

            # Productivity KPIs
            KPIDefinition("LABOR_PROD", "Labor Productivity", KPICategory.PRODUCTIVITY,
                         "%", 100, 90, 80, True),
            KPIDefinition("EQUIP_UTIL", "Equipment Utilization", KPICategory.PRODUCTIVITY,
                         "%", 85, 70, 60, True),
        ]

        for kpi in standard_kpis:
            self.kpis[kpi.kpi_id] = kpi
            self.history[kpi.kpi_id] = []

    def add_custom_kpi(self, kpi: KPIDefinition):
        """Add custom KPI definition."""
        self.kpis[kpi.kpi_id] = kpi
        self.history[kpi.kpi_id] = []

    def record_value(self, kpi_id: str, value: float, record_date: date = None):
        """Record KPI value."""

        if kpi_id not in self.kpis:
            return

        kpi = self.kpis[kpi_id]
        record_date = record_date or date.today()

        # Calculate status
        status = self._calculate_status(kpi, value)

        # Calculate trend
        trend = self._calculate_trend(kpi_id, value)

        kpi_value = KPIValue(
            kpi_id=kpi_id,
            value=value,
            date=record_date,
            status=status,
            trend=trend
        )

        self.history[kpi_id].append(kpi_value)

    def _calculate_status(self, kpi: KPIDefinition, value: float) -> KPIStatus:
        """Calculate KPI status based on thresholds."""

        if kpi.higher_is_better:
            if value >= kpi.target:
                return KPIStatus.ON_TARGET
            elif value >= kpi.warning_threshold:
                return KPIStatus.AT_RISK
            else:
                return KPIStatus.CRITICAL
        else:
            if value <= kpi.target:
                return KPIStatus.ON_TARGET
            elif value <= kpi.warning_threshold:
                return KPIStatus.AT_RISK
            else:
                return KPIStatus.CRITICAL

    def _calculate_trend(self, kpi_id: str, current_value: float) -> TrendDirection:
        """Calculate trend direction."""

        history = self.history.get(kpi_id, [])
        if len(history) < 2:
            return TrendDirection.STABLE

        # Compare with average of last 3 values
        recent_values = [h.value for h in history[-3:]]
        avg = sum(recent_values) / len(recent_values)

        kpi = self.kpis[kpi_id]
        diff = current_value - avg

        if abs(diff) < avg * 0.05:  # Within 5%
            return TrendDirection.STABLE
        elif (diff > 0 and kpi.higher_is_better) or (diff < 0 and not kpi.higher_is_better):
            return TrendDirection.IMPROVING
        else:
            return TrendDirection.DECLINING

    def get_current_values(self) -> Dict[str, KPIValue]:
        """Get most recent value for each KPI."""

        current = {}
        for kpi_id, history in self.history.items():
            if history:
                current[kpi_id] = history[-1]
        return current

    def get_dashboard_summary(self) -> Dict[str, Any]:
        """Get dashboard summary."""

        current = self.get_current_values()

        summary = {
            'project': self.project_name,
            'date': date.today().isoformat(),
            'total_kpis': len(self.kpis),
            'by_status': {s.value: 0 for s in KPIStatus},
            'by_category': {},
            'alerts': []
        }

        for kpi_id, value in current.items():
            summary['by_status'][value.status.value] += 1

            category = self.kpis[kpi_id].category.value
            if category not in summary['by_category']:
                summary['by_category'][category] = {'on_target': 0, 'at_risk': 0, 'critical': 0}
            summary['by_category'][category][value.status.value] += 1

            if value.status == KPIStatus.CRITICAL:
                summary['alerts'].append({
                    'kpi': self.kpis[kpi_id].name,
                    'value': value.value,
                    'target': self.kpis[kpi_id].target,
                    'status': 'critical'
                })

        return summary

    def get_kpi_details(self, kpi_id: str) -> Dict[str, Any]:
        """Get detailed KPI information."""

        if kpi_id not in self.kpis:
            return {}

        kpi = self.kpis[kpi_id]
        history = self.history.get(kpi_id, [])

        return {
            'definition': {
                'id': kpi.kpi_id,
                'name': kpi.name,
                'category': kpi.category.value,
                'unit': kpi.unit,
                'target': kpi.target,
                'formula': kpi.formula
            },
            'current': {
                'value': history[-1].value if history else None,
                'status': history[-1].status.value if history else None,
                'trend': history[-1].trend.value if history else None
            },
            'history': [
                {'date': h.date.isoformat(), 'value': h.value, 'status': h.status.value}
                for h in history
            ]
        }

    def generate_html_dashboard(self) -> str:
        """Generate HTML dashboard."""

        summary = self.get_dashboard_summary()
        current = self.get_current_values()

        html = f"""
<!DOCTYPE html>
<html>
<head>
    <title>KPI Dashboard - {self.project_name}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        .header {{ background: #2196F3; color: white; padding: 20px; margin-bottom: 20px; }}
        .kpi-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }}
        .kpi-card {{ border: 1px solid #ddd; padding: 15px; border-radius: 5px; }}
        .on_target {{ border-left: 4px solid #4CAF50; }}
        .at_risk {{ border-left: 4px solid #FF9800; }}
        .critical {{ border-left: 4px solid #F44336; }}
        .kpi-value {{ font-size: 24px; font-weight: bold; }}
        .kpi-name {{ color: #666; font-size: 14px; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>{self.project_name} - KPI Dashboard</h1>
        <p>Last updated: {summary['date']}</p>
    </div>
    <div class="kpi-grid">
"""

        for kpi_id, value in current.items():
            kpi = self.kpis[kpi_id]
            html += f"""
        <div class="kpi-card {value.status.value}">
            <div class="kpi-name">{kpi.name}</div>
            <div class="kpi-value">{value.value:.2f} {kpi.unit}</div>
            <div>Target: {kpi.target} | Trend: {value.trend.value}</div>
        </div>
"""

        html += "</div></body></html>"
        return html

    def export_to_excel(self, output_path: str) -> str:
        """Export dashboard to Excel."""

        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            # Summary
            summary = self.get_dashboard_summary()
            summary_df = pd.DataFrame([{
                'Project': summary['project'],
                'Date': summary['date'],
                'On Target': summary['by_status']['on_target'],
                'At Risk': summary['by_status']['at_risk'],
                'Critical': summary['by_status']['critical']
            }])
            summary_df.to_excel(writer, sheet_name='Summary', index=False)

            # Current values
            current = self.get_current_values()
            current_data = []
            for kpi_id, value in current.items():
                kpi = self.kpis[kpi_id]
                current_data.append({
                    'KPI': kpi.name,
                    'Category': kpi.category.value,
                    'Value': value.value,
                    'Unit': kpi.unit,
                    'Target': kpi.target,
                    'Status': value.status.value,
                    'Trend': value.trend.value
                })
            current_df = pd.DataFrame(current_data)
            current_df.to_excel(writer, sheet_name='Current KPIs', index=False)

        return output_path
```

```python
# Create dashboard
dashboard = KPIDashboard("Office Building A")

# Record KPI values
dashboard.record_value("CPI", 0.95)
dashboard.record_value("SPI", 1.02)
dashboard.record_value("DEFECT_RATE", 3.5)
dashboard.record_value("TRIR", 1.8)
dashboard.record_value("LABOR_PROD", 92)

# Get summary
summary = dashboard.get_dashboard_summary()
print(f"On Target: {summary['by_status']['on_target']}")
print(f"Critical: {summary['by_status']['critical']}")
```

### 1. HTML Dashboard

```python
html = dashboard.generate_html_dashboard()
with open("dashboard.html", "w") as f:
    f.write(html)
```

### 2. KPI Details

```python
details = dashboard.get_kpi_details("CPI")
print(f"Current CPI: {details['current']['value']}")
```

### 3. Custom KPI

```python
dashboard.add_custom_kpi(KPIDefinition(
    "WASTE_DIVERSION", "Waste Diversion Rate",
    KPICategory.SUSTAINABILITY, "%", 75, 60, 50, True
))
```

## Pitfalls

- **KPI sem fórmula é opinião.** Declare o cálculo. "Índice de qualidade 7/10" sem
  fórmula não é auditável.
- **Misturar físico e financeiro no mesmo indicador.** São curvas distintas. Juntar
  produz número sem significado.
- **Dashboard sem meta não orienta ação.** Um CPI de 0,85 só significa algo com a
  meta declarada (≥ 1,0).
- **Dado desatualizado é pior que ausente.** Mostre o carimbo de atualização. Painel
  verde com dado de 2 meses atrás engana.
- **Muitos KPIs = nenhum KPI.** Acima de ~8 indicadores no nível executivo, ninguém
  olha. Hierarquize.
- **Gráfico errado para o dado.** Pizza para tendência temporal é ilegível. Escolha
  pelo tipo de dado.
- **Alerta que sempre dispara é ignorado.** Calibre o limiar ou remova.

## Examples

**Input:** "Painel de obra: CPI, SPI, avanço físico, produtividade, restrições abertas."

**Output:**

| KPI | Fórmula | Valor | Meta | Status |
|---|---|---|---|---|
| CPI | EV/AC | 0,857 | ≥ 1,00 | 🔴 |
| SPI | EV/PV | 0,800 | ≥ 1,00 | 🔴 |
| Avanço físico | Executado/Planejado | 90% | ≥ 95% | 🟡 |
| Produtividade | qty/(equipes×h) | 25 m²/eq·h | ≥ 22 | 🟢 |
| Restrições abertas | contagem | 14 | ≤ 5 | 🔴 |

**Leitura:** custo e prazo acima do previsto; produtividade boa → o problema é
volume de trabalho, não desempenho de equipe. **14 restrições abertas** é a causa
provável. Ação: atacar as restrições, não a produtividade.
Dados de 15/10/2026 18:00.

## Verification

- [ ] Todo KPI tem fórmula escrita
- [ ] Todo KPI tem meta e limiar declarados
- [ ] Físico e financeiro em indicadores separados
- [ ] Carimbo de atualização visível
- [ ] Máx. ~8 KPIs no nível executivo
- [ ] Tipo de gráfico adequado ao dado
- [ ] Alertas calibrados (não disparam sempre)
- [ ] Testado com dado real
