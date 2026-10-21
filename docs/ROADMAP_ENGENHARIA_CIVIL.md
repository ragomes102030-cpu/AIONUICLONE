# Arquimedes — Roadmap de Evolução para Engenharia Civil

> Documento de produto e engenharia. Define o que o **Arquimedes** já faz hoje na gestão de obras,
> o que o mercado (2026) faz melhor, e a ordem priorizada de evolução para virar o
> "sistema de gestão de obras com IA" do escritório.
>
> Versão: 1.0 · Base: auditoria do repositório `AIONUICLONE` (branch `main`) + pesquisa de mercado (out./2026).

---

## 1. Resumo executivo

O Arquimedes já é um **motor de planejamento e controle de obras** (EAP/WBS, CPM, LOB, curva S, EVM,
medição, orçamento, RDO) operado por agentes de IA, com camada MCP própria para EAP e LOB.
O que falta para virar um produto de engenharia civil completo não é "mais IA": são **entradas
estruturadas do mundo real** — arquivos de cronograma de terceiros, plantas/DWG, modelos BIM/IFC,
evidência fotográfica de canteiro e o fluxo comercial completo.

Três frentes, em ordem:

| Horizonte | Foco | Resultado esperado |
|---|---|---|
| **H1 (0–3 meses)** | Fechar o ciclo de obra com dados que o cliente **já tem** | Cronograma, orçamento e medição importados de P6/MSP/CSV/planilha; RDO e medição assináveis |
| **H2 (3–9 meses)** | **BIM/IFC nativo** (4D/5D) | Modelo IFC lido no app, vinculado à EAP (4D) e aos quantitativos (5D) |
| **H3 (9–18 meses)** | **Campo e escala** | Progresso por visão computacional, app de canteiro offline, painel de portfólio e fluxo comercial |

**Posto de mercado:** o diferencial do Arquimedes é ter o *cálculo* (CPM, LOB, EVM, TVI) e a *linguagem
natural* no mesmo lugar. OpenSpace/Buildots vendem *ver o que foi construído*; Togal/Trunk vendem
*quantificar*. O Arquimedes deve ser a camada de **planejamento + quantification + auditoria** que
se conecta a esses dois mundos via MCP aberto — não precisa construir visão computacional própria
antes de H3.

---

## 2. Onde estamos hoje (inventário auditado do repositório)

### 2.1 Núcleo de planejamento (skills `skills/construction/`)
`baseline-scurve-evm`, `budget-composition-service`, `budget-variance-analyzer`, `cash-flow-forecaster`,
`constraint-risk-action`, `cost-estimation-resource`, `cpm-network-validator`, `daily-progress-report`,
`eap-work-breakdown`, `gantt-chart`, `kpi-dashboard`, `lob-line-of-balance`, `oce-scheduling-4d5d`,
`production-measurement-control`, `project-kpi-dashboard`.

Skills correlatas: `planejamento-obras-engenharia` (camada de **auditoria obrigatória** — implementação só
vale após teste funcional → auditoria estrutural → auditoria matemática → teste de parâmetro → regressão),
`construction-planning`, `construction-cost-control`, `cpm-scheduling`, `gantt`, `lob`,
`lob-design-patterns`, `production-control`, `formato-br`, `tabela-dinamica`, `spreadsheet-audit`,
`spreadsheet-qa`, `delivery-gate`, `dashboard-design`, `data-analysis`, `financial-modeling`.

### 2.2 Custos e climatologia
- `skills/sinapi-SEINFRA` — base de custos SINAPI/SEINFRA para precificação (fonte: buscadorsinapi.com.br).
- `skills/weather-construction` — previsão de chuva via Open-Meteo (sem API key) — insumo direto de
  produtividade e de "dia perdido".

### 2.3 Agentes de domínio
`chronos-agent`, `civil-tutor`, `structuro-agent`, `topobot-agent`, `pathoscan-agent` — papéis
especialistas (cronograma, ensino de engenharia civil, estrutural, topografia, padrões de paths).

### 2.4 Camada MCP de obra (já operacional no ambiente)
- **MCP EAP ("Especialista")** — 18 tools para criar/consultar/editar a EAP, quantitativos, linha de
  balanço, Gantt e relatórios de produção (skill `eap-orchestration`).
- **MCP `gantt-lob`** — cronograma CPM e linha de balanço.
- `obra-dados` — cruza EAP + cronograma CPM + medições reais → curva S, EVM, desvio de prazo/custo,
  EAC/VAC, saída XLSX com gráfico + relatório markdown.

### 2.5 Plataforma
Electron (renderer React + Arco Design, main/preload em TS, backend Rust *aioncore*), **WebUI** com PWA
(`web-host`), app mobile Expo (`mobile/`), 13 idiomas, kanban de tarefas, execução local ou remota
de agentes, modelo de skills importável (`.zip`/pasta).

### 2.6 O que já é diferencial e **não** deve ser regredido
- Auditoria matemática do cronograma como *gate* (não só geração) — raro fora de consultorias.
- LOB com detecção de interferência de frentes e rebalanceamento de ritmo.
- EVM/curva S/EAC-VAC em pipeline reproduzível e auditável.
- Skill de climatologia e de base de custos SINAPI — escassez no mercado brasileiro.

---

## 3. Benchmark de mercado (pesquisa 2026)

| Categoria | Referência | O que fazem de forte | Lacuna para o escritório brasileiro |
|---|---|---|---|
| **Progresso visual** | **OpenSpace** (Visual Intelligence Platform, Waypoint 2026) | AI Autolocation 2.0 (geo-localizar foto sem hardware), Site Mode (desenho/BIM pelo local), Walk and Talk (fala → relatório), OpenSpace Track (verifica trabalho executado com evidência visual), **Track API** para puxar progresso verificado a ERP/BI, drone → ortomosaico/nuvem de pontos/mesh, integração Procore | Caríssimo (enterprise), sem fluxo de orçamento/EVM brasileiro |
| **Progresso por CV** | **Buildots** | Vídeo 360 vs BIM+cronograma → % concluído por ambiente/sistema; previsão de atraso; **-50% de atraso** (2–3 meses); aquisição da Genda (produtividade+mão de obra); laser scan com NavVis | Depende de BIM maduro e de captura sistemática — caro de implant |
| **Takeoff/quantitativo** | **Togal.AI** (até 98% de precisão, por trade), **Trunk Tools**, **BricsCAD** | Detecção e medição automática em desenhos; IA generativa de estimativa | Pipelines PDF/DWG/BIM complexos; nenhum com CPM/EVM integrado |
| **BIM/4D no navegador** | **4DIFC** (web-ifc, sem upload), **xBIM/XbimWebUI** (WebGL), **IfcOpenShell 0.9** | Leitura/escrita de IFC em WASM no browser e em Node; **IfcOpenShell já publica `ifcmcp` — servidor MCP oficial para consultar e editar modelos IFC**; `ifcclash` (interferências), `ifccsv`, `ifcdiff`, `ifctester` | comunitario/open — **caminho de baixo custo para o Arquimedes** |
| **Gestão de obras BR** | **Mais Controle ERP**, **BuildMind**, **Obrasgov.br** | Orçamento com SINAPI atualizada + BDI automático, propostas e contratos, app de obra, análise de dados |é forte o *financeiro/contratual*; o *planejamento técnico* fica no Burou/Sislon/P6 — a **lacuna é exatamente a nossa** |

**Leitura estratégica:** o mercado está divided em (a) quem *vê* a obra, (b) quem *quantifica*,
(c) quem *controla* o financeiro. Ninguém entrega as três com auditoria matemática do cronograma.
O Arquimedes deve ocupar (c) com a vantagem de (b) e, via MCP aberto, conectar-se a (a).

---

## 4. Diagnóstico de gaps (impacto × esforço)

| # | Gap | Impacto | Esforço | Observação |
|---|---|---|---|---|
| G1 | **Sem importadores de cronograma de terceiros** (MSP, XER/XML P6, CSV, Primavera) | 🔴 alto | M | Hoje o cronograma nasce de texto/planilha gerada pelo próprio agente |
| G2 | **Sem quantitativos automáticos** (planta baixa, PDF, DWG, Autodesk/ArchiCAD) | 🔴 alto | L | É o item que Togal/Trunk vendem; barreira técnica real |
| G3 | **Sem motor BIM/IFC** (leitura, visualização, 4D/5D) | 🔴 alto | M/L | `ifcmcp` + IfcOpenShell reduzem muito o custo |
| G4 | **Medição sem certificado nem vínculo com EVM** | 🟠 médio-alto | M | `production-measurement-control` cobre rascunho→aprovado, falta fechamento mensal |
| G5 | **Campo sem evidência**: foto geolocalizada, clima no RDO, app offline | 🟠 médio-alto | M | `daily-progress-report` + `weather-construction` são o esqueleto |
| G6 | **Painéis não são nativos**: skill gera artefato, não há painel multi-obra | 🟠 médio-alto | M | Differential comercial enorme (dono de obra quer 1 tela) |
| G7 | **Sem fluxo comercial** (proposta → orçamento → contrato → medição → faturamento) | 🟠 médio | L | Aqui é onde está o faturamento do escritório |
| G8 | **Norma/jurídico**: NBR 12712, memória de cálculo, assinatura digital | 🟡 médio | M | Vira barreira de entrada e argumento de venda |
| G9 | **Multi-obra / portfólio e indicadores consolidados** | 🟡 médio | M | Fecha o ciclo de quem administra várias obras |
| G10 | **README/mobile ainda 100% AionUi** (pendência de produto visível) | 🟡 baixo | S | Ver §7 |

---

## 5. Backlog priorizado

### H1 — Fechar o ciclo de obra (0–3 meses)

| ID | Item | Entregável / aceite | Esforço | Depende |
|---|---|---|---|---|
| **H1-1** | **Importador de cronograma** | Ler `.mpp` (MS Project via `mppx`/XML), `.xer`/`.xml` (P6), `.csv` e planilha → EAP normalizada (id, nome, duração, predecessoras FS/SS/FF/SF, restrições, recursos, PS, baseline) com **relatório de conflitos** (ciclo, data adiantada, predecessora inexistente) | M | G1 |
| **H1-2** | **CPM auditado na importação** | Rodar ES/EF/LS/LF, folga total/free, caminho crítico (múltiplo) e **validar** contra o arquivo original — divergência > 1h vira erro bloqueante | S | H1-1 |
| **H1-3** | **Importador de orçamento** | Planilha (OrçaFas, SicOn, Excel genérico, CSV) → itens, insumos, composições, BDI, preço total → compare com o custo previsto da EAP | M | — |
| **H1-4** | **Medição mensal fechada** | Consolida `production-measurement-control` + avanço físico por atividade + EVM → **certificado de medição** (PDF) com quantitativos, percentuais, valores e memória de cálculo auditável | M | G4 |
| **H1-5** | **TVI (Total de Valor a Receber)** | Indicador contratual de progresso físico ponderado por valor, comparado ao avanço financeiro do caixa | S | H1-4 |
| **H1-6** | **RDO operativo** | `daily-progress-report` + foto geolocalizada (EXIF + pin no mapa) + chuva da `weather-construction` + equipe/equipamento → PDF assinado | M | G5 |
| **H1-7** | **Painel de obra no app** | Uma tela por obra: curva S (previsto × realizado × baseline), status do caminho crítico, medição do mês, EAC/VAC, riscos — em HTML/React nativo, não XLSX | M | G6 |
| **H1-8** | **Comparador de cenários (replanejamento)** | "Se anteciparmos 5 dias na fundação, qual o efeito no término e no custo?" → rodar CPM/EVM nos dois cenários e mostrar o delta | S | H1-2 |

### H2 — BIM/IFC nativo: 4D e 5D (3–9 meses)

| ID | Item | Entregável / aceite | Esforço | Depende |
|---|---|---|---|---|
| **H2-1** | **Leitor IFC (IfcOpenShell)** | Abrir `.ifc`/`.ifczip`, extrair hierarquia, propriedades, quantidades (`Qto_*`) e conjuntos → JSON normalizado | M | G3 |
| **H2-2** | **MCP IFC** | Empacotar o `ifcmcp` oficial como tool do Arquimedes: consultar/editar modelo, buscar elementos por atributo/propriedade, criar property sets | M | H2-1 |
| **H2-3** | **Visualizador 4D no app** | Web-ifc/IfcOpenShell Web (WASM) no renderer, filtrando por atividade da EAP e colorindo por status (não iniciado/em andamento/concluído/atrasado) | L | H2-1, H1-1 |
| **H2-4** | **Vínculo IFC ↔ EAP** | Match por GUID ou property set (`Pset_4D`), com revisão humana das correspondências e persistência do mapeamento | M | H2-3 |
| **H2-5** | **Quantitativo 5D** | Quantidades do IFC por pacote/actividad + preço unitário da EAP → custo direto por elemento, disparando a curva S por pacote | L | H2-4, H1-3 |
| **H2-6** | **Interferências** | `ifcclash` (ou filtro de bounding box) → relatório de clashes priorizado por criticidade de caminho | M | H2-1 |
| **H2-7** | **Exportação para cliente** | Emitir modelo + 4D/5D "light" (HTML standalone ou PDF) para portais de acompanhamento do cliente | S | H2-4 |

### H3 — Campo, canteiro e escala (9–18 meses)

| ID | Item | Entregável / aceite | Esforço | Depende |
|---|---|---|---|---|
| **H3-1** | **Progresso por visão computacional (MVP)** | Foto/drone do canteiro → comparer com o modelo IFC (estado da tarefa vs. planned) → % concluído **sugerido** (sempre revisado por humano) | L | H2-3 |
| **H3-2** | **Takeoff assistido por IA** | Planta baixa (PDF vetorial ou raster) → contagem de elementos (portas, blocos,Brother) com revisão e ajuste manual; base para "quantitativos assistidos" | L | G2 |
| **H3-3** | **App de canteiro offline (Expo)** | RDO, checklist de inspeção, medições, foto geolocalizada e pendências em modo offline com sync; hoje o `mobile/` está 100% com identidade AionUi | L | H1-6 |
| **H3-4** | **Painel de portfólio multi-obra** | Consolidated de todas as obras: prazo, curva S agregada, EAC, margem prevista, caixa, riscos — para dono/gestor | M | H1-7, G9 |
| **H3-5** | **Fluxo comercial** | Catálogo de serviços → proposta → orçamento (com SINAPI/BDI) → contrato → projeto → medição → faturamento | L | H1-3, G7 |
| **H3-6** | **Assinatura digital e trilha de auditoria** | NF-e/assinatura ICP-Brasil das medições e do RDO, hash da evidência fotográfica | M | H1-4, H1-6, G8 |
| **H3-7** | **Integração ERP/contabilidade** | Exportação de medições, invoices e custos para ERP/contabilidade (CSV/API) | M | H1-4 |

---

## 6. Quick wins (2–4 semanas, sem dependência)

1. **Painel de Curva S dentro do app** — hoje o `obra-dados` gera XLSX + markdown; publicar a mesma
   matemática como componente nativo (reaproveita o motor, entrega valor imediato).
2. **Modelo de proposta comercial** — template de orçamento/proposta com campos da vetted
   `sinapi-SEINFRA` e BDI, gerado a partir do escopo da EAP.
3. **RDO com clima e foto** — conectar `weather-construction` ao `daily-progress-report` (2 skills já
   existem; falta a cola e o PDF).
4. **Checklist de medição e conferência** — "pacote de entrega" da medição mensal (checklist +
   memória de cálculo) reaproveitando `delivery-gate` e `spreadsheet-audit`.
5. **Comparador de cronograma** (H1-8) — o motor CPM já existe; é UI + relatório.
6. **Rascunho de readme em português** com o fluxo Arquimedes (EAP → cronograma → orçamento → medição),
   substituindo o texto AionUi remanescente.

---

## 7. Backlog de engenharia (manutenção do produto)

| ID | Item | Esforço |
|---|---|---|
| E1 | **Fechar o rebrand textual**: README raiz e `docs/readme/*` ainda falam "AionUi" e apontam para `iOfficeAI/AionUi` (wiki, badges, links) | M |
| E2 | **Mobile**: `mobile/app.config.ts` (name/slug/scheme), bundle `ai.resopod.aionui` e i18n zh-CN ainda com a marca antiga | S/M |
| E3 | **Repo size**: pack Git de ~601 MB por causa dos GIFs de demo removidos; avaliar **Git LFS** ou `git filter-repo` (o histórico ainda carrega ~118 MB de GIFs) | M |
| E4 | **Nome interno do binário Rust**: `aionui-backend.db`, `aionui-process/`, `aionrs-sessions/`, `*.aioncore.log` — só muda recompilando o aioncore | L |
| E5 | **`out/` com 1,1 GB** — limpar antes de cada build/release | S |
| E6 | **Registro de ícones/marca**: `scripts/generate-brand-icons.mjs` gera todos os ícones a partir de `resources/brand/*.svg` — manter como fonte única | — |

---

## 8. KPIs de sucesso (como medir o produto)

| KPI | Meta 6 meses | Por quê |
|---|---|---|
| Tempo para montar a EAP de uma obra (12–18 frentes) | < 30 min (hoje > 1 dia) | É a promessa do "agente planejador" |
| % de cronogramas importados de P6/MSP validados sem divergência de CPM | > 95% | H1-1/H1-2 |
| Tempo de fechamento de medição mensal | < 4 h (hoje > 2 dias) | H1-4 |
| Curvas S com dado real (não interpolado) | > 80% das obras | qualidade do dado de campo |
| Vazamento de atraso detectado antes do mês do atraso | > 60% dos casos | valor do CPM auditado |
| Obras com medição com evidência fotográfica assinada | > 50% | H1-6/H3-6 |
| Ticket médio de implantação (escritório) | < 3 dias |, onboarding |

---

## 9. Riscos e como mitigamos

| Risco | Mitigação |
|---|---|
| **Qualidade do dado de campo** — foto sem geolocalização/sem data, RDO escrito à mão | Priorizar "pipeline do cliente": P6/MSP/planilha → o sistema brilha mesmo com campo imperfeito (H1 antes de H3) |
| **Precisão de CV** — falso positivo em % concluído | Sem versão automática: sempre *sugestão revisada*; jamais emitir medição automática (H3-1) |
| **Custo de inferência** com modelo grande em dados binários | Processar IFC/quantitativos localmente (WASM/Node), enviar ao LLM apenas resumo tabular |
| **Licença/licenciamento** de bases de custo (SINAPI é usage livre; SEINFRA varies por estado) | `sinapi-SEINFRA` já isola a camada; versionar e datar cada tabela usada |
| **Jurídico** — medição é documento com valor legal | Trilha de auditoria + assinatura digital antes de H3-6 ser vendido como "medição oficial" |
| **Dependência de terceiros** (P6, IFC, ERP) | Tudo via adaptadores (MCP) — nunca acoplar o núcleo a um formato só |
| **Escopo** — 7 horizontes cabem em anos | Regra: H1 fecha com o cliente atual; H2 só começa quando H1 estiver em produção |

---

## 10. Decisões que precisam ser tomadas (kick-off)

1. **Escopo do H1**: começamos pelo importador de cronograma (P6/MSP) ou pelo de orçamento
   (OrçaFas/planilha)? *Recomendação*: cronograma — é onde está o ciclo da obra e o valor da EAP.*
2. **MCP IFC**: adotar o `ifcmcp` oficial do IfcOpenShell (fork próprio ou consumir via pip) ou
   implementar leitura mínima em Node? *Recomendação*: consumir o oficial eSkill-fork só o necessário.
3. **App de canteiro**: evoluir o `mobile/` Expo existente ou PWA do WebUI? *Recomendação*: PWA do
   WebUI primeiro (menos atrito, já tem infra de sync).
4. **Posicionamento comercial**: o Arquimedes é ferramenta interna do escritório (opção A) ou produto
   vendável (opção B)? Isso muda H3-5 (fluxo comercial) de "necessário" para "diferenciador".

---

## 11. Fontes da pesquisa

**BIM/IFC**
- IfcOpenShell — toolkit e geometry engine open source (C++/Python/TS, WASM): https://ifcopenshell.org/ · https://github.com/IfcOpenShell/IfcOpenShell
- `ifcmcp` — servidor MCP oficial para consultar/editar modelos IFC (PyPI): https://github.com/IfcOpenShell/IfcOpenShell
- ThatOpen web-ifc (leitura/escrita de IFC em JS/WASM): https://github.com/ThatOpen/engine_web-ifc · viewer: https://github.com/ThatOpen/web-ifc-viewer
- xBIM / XbimWebUI (WebGL): https://github.com/xBimTeam/XbimWebUI
- 4DIFC — sequenciador 4D no browser (CSV/.mpp/.xer, match por GUID/pset): https://www.4difc.com/

**Progresso visual / CV**
- OpenSpace (Visual Intelligence Platform, Waypoint 2026 — AI Autolocation 2.0, Site Mode, Walk and Talk, Track API): https://www.openspace.ai/ · https://www.openspace.ai/products/air/
- Buildots (vídeo 360 vs BIM+cronograma; Genda; laser scan com NavVis): https://buildots.com/
- Drone mapping e point clouds: https://www.openspace.ai/products/air/

**Quantificação / estimativa**
- Togal.AI — takeoff por desenho com IA (até 98% de precisão, por trade): https://www.togal.ai/
- Trunk Tools / BricsCAD — takeoff e estimativa generativa: https://www.trunktools.com/

**Brasil**
- Mais Controle ERP — SINAPI atualizada, BDI automático, proposta/contrato, app de obra: https://maiscontroleerp.com.br/
- BuildMind — gestão de obras: https://buildmind.com.br/
- Base de custos SINAPI/SEINFRA (skill interna `sinapi-SEINFRA`, fonte buscadorsinapi): https://buscadorsinapi.com.br/
- Obrasgov.br — portal/API de dados de obras públicas: https://obrasgov.br/

**Cadeia de valor citada**
- SIG sig → Buildots (2025–2026) e OpenSpace (US, ~US$ 330 M captados) — categoria de "progress tracking"
  em maturação; o gargalo continua sendo dado estruturado de canteiro.
- AionUi (upstream) — base de agentes/CLI desktop; este roadmap assume a arquitetura atual do repositório.

---

*Documento vivo. Atualizar a cada trimestre com o que foi entregue e o que mudou no mercado.*
