---
name: 'sinapi-SEINFRA'
description: 'Base de custos SINAPI e SEINFRA para engenharia civil.'
homepage: 'https://buscadorsinapi.com.br'
metadata:
  {
    'openclaw':
      {
        'emoji': '🏗️',
        'os': ['win32', 'linux', 'darwin'],
        'homepage': 'https://buscadorsinapi.com.br',
        'requires': { 'bins': ['python3'] },
      },
  }
---

# SINAPI + SEINFRA — Base de Custos da Construção Civil

Skill para acesso às bases oficiais de custos da construção civil brasileira:

- **SINAPI** (nacional): 15.423+ composições com preços por 27 estados (Caixa/IBGE)
- **SEINFRA** (Ceará): 3.755+ insumos por conta/subconta (SEPLAG-CE)

## Localização

O scraper fica fora do app — versione-o no seu workspace e aponte para ele com a
variável de ambiente `SINAPI_SCRAPER_DIR`. Sem essa variável a skill assume
`./sinapi_scraper` (relativo à pasta de trabalho do agente).

```
$SINAPI_SCRAPER_DIR/
├── scraper.py              # Motor principal
├── construction_costs.db   # SQLite
├── monthly_update.py       # Atualização mensal
└── cost.py                 # Atalho

# exemplo nesta máquina (não fixe caminho de máquina em produção):
#   C:\Users\<perfil>\Desktop\Planejamento de obras\sinapi_scraper
```

## Comandos

```bash
python3 "$SINAPI_SCRAPER_DIR/scraper.py" search <query> [uf]   # Busca preços
python3 "$SINAPI_SCRAPER_DIR/scraper.py" stats                 # Estatísticas
python3 "$SINAPI_SCRAPER_DIR/scraper.py" SEINFRA-scrape        # Popular SEINFRA
python3 "$SINAPI_SCRAPER_DIR/scraper.py" sinapi-scrape         # Popular SINAPI
python3 "$SINAPI_SCRAPER_DIR/scraper.py" update                # Atualiza tudo
```

## Uso Python

```python
import os
import sys

# Resolve sem amarrar a uma pasta específica de uma máquina.
scraper_dir = os.environ.get("SINAPI_SCRAPER_DIR", os.path.join(os.getcwd(), "sinapi_scraper"))
sys.path.insert(0, scraper_dir)

from scraper import ConstructionScraper

sc = ConstructionScraper()

# Buscar composição SINAPI
results = sc.search_sinapi(query="servente", uf="CE")

# Buscar insumo SEINFRA
results = sc.search_SEINFRA(query="argamassa", conta="5")

# Preço por estado
preco = sc.get_preco_estado(codigo="88316", uf="CE")

stats = sc.get_stats()
sc.close()
```

## Estrutura do Banco

### composicoes_sinapi

- `codigo` (PK), `descricao`, `preco_desonerado`, `preco_medio`, `referencia`, `uf`

### precos_uf_sinapi

- `codigo_composicao` (FK), `uf`, `preco_desonerado`, `data_scraping`

### insumos_SEINFRA

- `codigo` (PK), `descricao`, `conta`, `subconta`, `unidade`, `preco`, `referencia`

### categorias_SEINFRA

- `codigo` (PK), `descricao`, `tipo`

## Fontes

### SINAPI: https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/

- Mirror: https://buscadorsinapi.com.br
- Mensal (1ª quinzena)
- 27 estados, 15.423+ itens

### SEINFRA: https://sin.seinfra.ce.gov.br

- Versão 028, Encargos 114,15%
- Contas: 1-29 (Serviços Preliminares, Argamassas, Instalações, Pintura, etc.)
- 3.755 insumos

## Integração com Outras Skills

- **cost-estimation-resource**: Alimentar Resource.unit_price com preços dinâmicos
- **budget-variance-analyzer**: Comparar custos vs. SINAPI referencial
- **cash-flow-forecaster**: Projetar desembolsos com preços reais

## Atualização Mensal

1. 1ª quinzena: Caixa publica SINAPI
2. Executar `python3 scraper.py update`
3. Verificar `python3 scraper.py stats`
4. INSERT OR REPLACE (sem duplicatas)

## Exemplos de Dados

SEINFRA: C0115 AREIA SECA M3 R$351,77 | C4429 ARGAMASSA 1:5 M3 R$966,39
SINAPI: 88316 SERVENTE H R$24,62 | 103689 PLACA OBRAS m2 R$488,66

## Troubleshooting

- `No module named requests` → `pip install requests`
- Base vazia → `python3 scraper.py SEINFRA-scrape`
- Erro de conexão → verificar acesso aos sites oficiais

## Prefeitura (opcional)

Ver `prefeitura.py` para Fortaleza/SEME. Fontes: IBGE CIDADES, FGV IBRE.
