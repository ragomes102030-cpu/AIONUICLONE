# Auditoria pós-implementação — Ferramentas/MCP

**Data:** 24/09/2026
**Branch:** `feat/agent-intelligence`
**HEAD dos cinco commits auditado:** `c5ec51bd5a09894e545abcfe285eee66756ffba9`
**Escopo:** commits `2f7752ab9`, `e6f967068`, `6a8c75f41`, `b9dc7c1a2`, `c5ec51bd5`
**Escopo proibido:** nenhuma funcionalidade nova foi implementada nesta auditoria.

## 1. Resumo executivo

A evolução de **Plugins** para **Ferramentas** é estruturalmente compatível com a arquitetura existente. A nova camada é uma normalização/visualização in-memory sobre o catálogo MCP existente; ela não substitui o AionCore, não cria outro runtime de agentes e não cria outro cliente MCP.

O catálogo de ferramentas, a adição de MCP local/remoto, a descoberta real de tools e a seleção visual foram implementados. A seleção por tool permanece explicitamente como intenção de catálogo: a autorização efetiva do agente continua ocorrendo por servidor MCP, usando `selected_mcp_server_ids` e `selected_session_mcp_servers`.

Não foi encontrada regressão funcional comprovada nos MCPs existentes. Há, porém, limites importantes: o AionCore não está disponível como código neste clone; a persistência de tools descobertas no backend não foi demonstrada; a importação JSON legada ainda aceita headers/env; e o runner E2E local depende de um renderer válido em `out/` ou de um dev server realmente iniciado.

**Classificação geral:** nenhuma falha crítica comprovada; há riscos altos/medianos de segurança, persistência e cobertura E2E que devem ser tratados antes de ACL por tool ou providers externos.

## 2. Escopo auditado

Foram auditados:

- os cinco commits da fase de Ferramentas/MCP;
- `ToolsSettings`, `ToolsModalContent`, catálogo MCP, hooks, bridges, tipos e rotas envolvidos;
- o fluxo de criação, teste, discovery, carregamento e seleção;
- os registros observados no backend para os MCPs existentes;
- a suíte direcionada, typecheck, lint, build e E2E;
- a estrutura do E2E fixture e a origem do artefato `out/renderer/index.html`.

Não foram alterados:

- `main`;
- o runtime AionCore;
- endpoints de backend;
- o executor de agentes;
- Nango/Composio;
- `out/` como artefato removido;
- arquivos experimentais;
- `McpManagement.tsx`.

## 3. Arquitetura encontrada

### 3.1 Catálogo e normalização

- `packages/desktop/src/common/types/integrations/toolIntegration.ts` define `ToolIntegration`, `ToolConnection`, `ToolDescriptor`, `ToolSelectionState` e estados semânticos.
- `packages/desktop/src/renderer/services/tools/toolIntegrationRegistry.ts` é um `Map` in-memory com `register`, `registerSnapshot`, `get`, `list`, `getTools`, `getConnectionStatus` e `unregister`.
- `packages/desktop/src/renderer/services/tools/toolCatalog.ts` normaliza `IMcpServer` para o modelo de domínio e preserva `name`, `description`, `input_schema` e IDs de origem.
- `ToolCatalog.tsx` combina backend/built-in e extensão, prioriza backend/built-in em colisão de ID e mantém a seleção visual em estado React.

### 3.2 Persistência e fonte de verdade

A persistência continua no backend MCP:

- `mcpService.listServers`, `createServer`, `updateServer`, `deleteServer` e `importServers` em `common/adapter/ipcBridge.ts`;
- `useMcpServerCRUD.ts` para CRUD;
- `useMcpConnection.ts` para teste e discovery;
- `useMcpServers.ts` para carregamento de backend e extensões.

`ensureBackendMcpCatalog()` ainda combina o backend com a projeção legada `mcp.config` para built-ins. Portanto, o novo modelo não cria uma segunda persistência, mas a projeção legada continua sendo uma responsabilidade preexistente.

### 3.3 Entradas e rotas

- Sidebar principal: `Sider/index.tsx`, agora usando `settings.tools`.
- Página: `pages/settings/ToolsSettings/index.tsx`.
- Rota: `#/settings/tools`, preservada.
- Redirect legado: `Router.tsx` continua mapeando `/settings/capabilities?tab=tools` para `/settings/tools`.
- O texto visual de Plugins foi alterado somente onde representa ferramentas; Channel Plugins e contratos internos não foram renomeados.

## 4. Fluxo real da implementação

```text
/settings/tools
  → useMcpServers()
      → ensureBackendMcpCatalog()
          → mcpService.listServers()
          → projeção legada de built-ins
      → ipcBridge.extensions.getMcpServers()
  → createToolCatalog()
  → ToolCatalog
  → MCP existente
      → AddToolModal / AddMcpServerModal
      → useMcpServerCRUD
      → mcpService.createServer/updateServer
      → useMcpConnection
      → mcpService.testMcpConnection
      → mcpService.update/delete conforme operação
      → tools reais no estado MCP
  → seleção visual por tool
  → seleção por servidor no Guid/Assistant
  → useGuidSend
  → selected_mcp_server_ids / selected_session_mcp_servers
  → backend/AionCore existente
```

### 4.1 Preflight remoto

O endpoint existente `/api/mcp/test-connection` foi reutilizado. Como o backend atual exige registro persistido para testar, o preflight:

1. cria um registro temporário pelo mesmo CRUD existente;
2. testa esse registro pelo endpoint real;
3. exibe somente `result.tools` retornados;
4. remove o registro temporário no `finally`.

Após salvar a configuração real, o fluxo testa novamente o servidor persistido. Isso evita que o resultado transitório do preflight seja tratado como persistência definitiva.

### 4.2 Seleção

`ToolSelectionState` é local e efêmera. As caixas são apresentação de intenção de catálogo. Elas não são enviadas como ACL para o agente. O caminho existente por servidor permanece em `useGuidSend.ts` e `useAssistantEditor.ts`.

### 4.3 Carregamento posterior

Depois de salvar, o teste real atualiza `tools`, `last_test_status` e `last_connected` no estado React. O payload de CRUD não inclui tools/estado de teste; portanto, após reload, as tools podem não aparecer até novo teste. Isso não é uma segunda persistência, mas é um limite de durabilidade.

## 5. Componentes reutilizados

- `mcpService` e `ipcBridge` existentes;
- `useMcpServers`;
- `useMcpServerCRUD`;
- `useMcpConnection`;
- `useMcpOAuth`;
- `ensureBackendMcpCatalog`/`toBackendMcpPayload`;
- `McpServerHeader`, `McpServerItem` e `McpServerToolsList`;
- `useGuidSend` e o mecanismo de seleção por servidor;
- AionCore e o executor existente.

## 6. Componentes novos

- `common/types/integrations/toolIntegration.ts`;
- `renderer/services/tools/toolIntegrationRegistry.ts`;
- `renderer/services/tools/toolCatalog.ts`;
- `renderer/pages/settings/ToolsSettings/ToolCatalog.tsx`;
- `renderer/pages/settings/ToolsSettings/AddToolModal.tsx`;
- testes unitários/DOM de catálogo, sidebar e formulário;
- documentação `docs/architecture/tools-integrations.md`.

Não foram adicionados stores globais, clients MCP, endpoints, handlers IPC ou executores.

## 7. Compatibilidade

### Implementado e validado

- `IMcpServer` continua sendo o contrato persistido.
- `streamable_http` é normalizado para `http` no payload backend, como já fazia o catálogo existente.
- Registros antigos sem `tools` carregam com lista vazia.
- Registros com discovery parcial preservam as tools retornadas.
- IDs backend são preservados; o ID visual normalizado é derivado do ID do servidor.
- `chrome-devtools`, `aionui-browser`, `aionui-image-generation` e `MACP-EAP` foram observados no catálogo real.
- A rota e o redirect legado foram preservados.

### Riscos de compatibilidade

- A projeção legada `mcp.config` continua sendo uma segunda representação de built-ins.
- A entrada de fallback de IDs sem `id` usa nome normalizado; isso é determinístico, mas não é uma garantia global de unicidade.
- A seleção por tool não é serializada nem consumida pelo agente.
- Extensões aparecem no catálogo de Ferramentas, mas `GuidPage` e `useAssistantEditor` continuam carregando `ensureBackendMcpCatalog().allServers`; seleção de extensão para o agente não foi comprovada.

## 8. Segurança

### Implementado e validado

- O novo formulário não solicita nem grava token Bearer.
- A opção Bearer fica desabilitada até existir referência de credencial no backend.
- A URL nova é validada sintaticamente no renderer para HTTP/HTTPS, credenciais embutidas e fragmento.
- O preflight usa o backend existente; não cria um proxy HTTP no renderer.
- A resposta de discovery é usada diretamente; não há tools fictícias no catálogo.
- Testes cobrem Bearer rejeitado, URL inválida e metadata real.

### Implementado mas não validado

- OAuth reutiliza `checkOAuthStatus`/`loginMcpOAuth`, mas state, PKCE, redirect, armazenamento e rotação de tokens estão no backend/binário, fora deste clone.
- A proteção SSRF real, validação de redirects, DNS rebinding e limites de rede estão no AionCore e não foram inspecionados.

### Não implementado

- credential reference para Bearer;
- ACL por tool no backend;
- provider Nango/Composio.

### Problemas de segurança

1. **ALTO — importação JSON legada aceita headers e env potencialmente sensíveis.**
   `mcpJsonImport.ts` preserva `headers` e `env`, e `original_json` é uma string. `httpBridge` redige chaves estruturadas, mas não faz parsing/redação de segredos embutidos nessa string. Isso é comportamento preexistente, mas contradiz a política de não expor credenciais no renderer. Não foi corrigido nesta auditoria.

2. **MÉDIO — snapshots de transporte podem carregar headers/env.**
   `toSessionMcpServer` copia o transport para a conversa. A proteção contra esse vazamento depende do backend/AionCore.

3. **MÉDIO — limpeza do preflight é best-effort.**
   O `finally` tenta deletar o registro temporário, mas uma falha de cleanup é silenciosamente ignorada. No teste real o DELETE retornou 200 e não restou registro; a política de recuperação para falha de cleanup não está definida.

4. **BAIXO — renderer apenas valida sintaxe de URL.**
   Isso é intencional para não duplicar SSRF; a validação de rede deve permanecer no backend. O limite precisa ser conhecido, não contornado.

## 9. MCPs existentes

Observação via backend em `http://127.0.0.1:<porta>/api/mcp/servers` e via UI/CDP:

| MCP                       | Transporte | Estado observado | Tools | Conclusão                                                         |
| ------------------------- | ---------- | ---------------: | ----: | ----------------------------------------------------------------- |
| `chrome-devtools`         | stdio      |        connected |    30 | Compatível; não houve mudança de contrato                         |
| `aionui-browser`          | stdio      |        connected |    26 | Compatível; não houve mudança de contrato                         |
| `aionui-image-generation` | stdio      |     disconnected |     0 | Built-in preservado; permanece configurado pelo painel específico |
| `MACP-EAP`                | HTTP       |        connected |    18 | Registro remoto preexistente; descoberta real funcionando         |

A nova camada não altera `IMcpServer`, `toSessionMcpServer`, `selected_mcp_server_ids` ou `selected_session_mcp_servers`. O teste de `useGuidSend` continua cobrindo IDs built-in/user e overrides de conversa.

## 10. MCP remoto

### Validado em runtime

Foi usado um servidor Streamable HTTP real temporário, fora do repositório:

- POST no endpoint MCP;
- initialize/discovery pelo backend AionCore;
- retorno real de `consultar_eap` e `calcular_cpm`;
- input/description preservados;
- criação e remoção do registro temporário;
- nenhum servidor/registro de teste permaneceu no catálogo.

### Implementado

- URL HTTP/HTTPS;
- nome e conexão local/remota;
- teste de conexão;
- tratamento de sucesso, tools, erro e `needsAuth`;
- normalização de `streamable_http` para o contrato backend existente;
- cleanup do preflight.

### Não validado

- semântica completa de sessão/stream/resume do Streamable HTTP no código do AionCore;
- OAuth real;
- SSRF real;
- redirect e DNS rebinding;
- comportamento com resposta MCP malformada;
- duplicatas de nomes de tools; não há deduplicação explícita no registry.

### Persistência

O backend persiste a configuração do servidor, mas o payload de CRUD não persiste `tools`/status de teste. O reload pode portanto mostrar o servidor sem tools até um novo teste. Isso deve ser tratado no contrato de discovery futuro; não foi alterado nesta auditoria.

## 11. E2E

### Diagnóstico

A primeira execução abriu `out/renderer/index.html` com título `Task Manager — AionUi`, sem `#root`, e registrou `task:list` sem handler. Esse HTML era um artefato experimental antigo, não o renderer atual.

O fixture declara modo dev, mas `electron .` usa `package.json.main` (`out/main/index.js`) e não inicia `electron-vite dev`; sem `out/renderer` válido, o renderer atual não é carregado. Isso explica o comportamento.

Após executar o build production com heap ampliado, `out/renderer` passou a conter o renderer atual. A execução:

```text
E2E_DEV=1 bunx playwright test --config playwright.config.ts tests/e2e/specs/ext-mcp.e2e.ts --reporter=list
```

resultou em:

- 3 testes passando;
- 1 screenshot ignorado por `E2E_SCREENSHOTS` não configurado;
- 0 falhas.

O spec `acp-agent.e2e.ts` teve:

- 3 testes ativos passando;
- 2 screenshots ignorados;
- 1 falha em uma asserção antiga que procura `Test Connection` na página de Agent, não em Ferramentas;
- essa falha é classificação **MÉDIA** de fixture/teste preexistente, não regressão do catálogo MCP.

### Correção mínima realizada

`tests/e2e/helpers/navigation.ts` agora usa o seletor legado quando existir e, quando `[data-settings-path]` não existir, navega pelo hash já usado pelo helper. O Sider atual não expõe esse atributo. Nenhum componente de produto foi alterado por essa correção.

### Limitação restante

O runner dev ainda não inicia o Vite automaticamente. Em uma máquina sem `out/renderer` válido, ele pode continuar caindo no fallback. A correção definitiva do runner seria iniciar `electron-vite dev` ou exigir `ELECTRON_RENDERER_URL`; não foi feita porque alteraria a estratégia de inicialização do E2E além da validação mínima desta fase.

## 12. Build

Comando de build production disponível:

```text
npm run package
```

### Primeira execução

- Main e preload bundleram.
- Renderer transformou 8411 módulos.
- Falhou com `FATAL ERROR: Ineffective mark-compacts near heap limit`.
- Causa provável: heap Node padrão próxima de 2 GB durante bundle renderer.
- Não foi erro de tipo da fase nem erro de módulo MCP.

### Repetição

```text
NODE_OPTIONS=--max-old-space-size=4096 npm run package
```

Resultado: **PASSOU**.

Warnings não fatais:

- imports dinâmicos também estáticos;
- diretivas `"use client"` ignoradas pelo bundler;
- chunks renderer grandes.

Não foi executado `dist`, installer, pack ou empacotamento final.

## 13. Testes

### Typecheck

```text
bun run tsc --noEmit
```

Resultado: passou no clone principal e no worktree.

### Testes direcionados

```text
10 arquivos / 60 testes
```

Incluiu:

- normalização/registry/URLs/drafts;
- `AddToolModal` e preflight visual;
- ToolCatalog e seleção visual;
- sidebar Ferramentas;
- catálogo MCP;
- hooks MCP;
- `useGuidSend` e seleção server-level;
- editor de assistants.

Resultado: 10/10 arquivos e 60/60 testes passaram no clone principal.

### Lint

Passou com um warning preexistente de `map` spread em `ToolsModalContent.tsx`. Não há erro de lint.

### Worktree

Typecheck passou no worktree `C:\temp\validate-03a1e62` alinhado ao HEAD auditado. Testes DOM no worktree apresentaram resolução duplicada do React (`Invalid hook call`) mesmo em teste mínimo; os mesmos testes passam no clone principal. Isso foi classificado como problema de ambiente do worktree, não como regressão do produto.

## 14. Problemas encontrados

| ID   | Classificação   | Problema                                                                                 | Impacto                                                        |
| ---- | --------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| P-01 | **ALTO**        | Importação JSON legada aceita `headers`/`env` e `original_json` pode transportar secrets | Exposição potencial no renderer/logs; preexistente             |
| P-02 | **MÉDIO**       | Tools/status discoveries são atualizados no estado, não persistidos pelo backend         | Após reload, tools podem exigir novo teste                     |
| P-03 | **MÉDIO**       | Seleção visual por tool não é ACL de agente                                              | A execução permanece server-level; limitado por contrato atual |
| P-04 | **MÉDIO**       | Extensões entram no catálogo, mas não foram provadas na seleção do Guid/Assistant        | Agent access de extension MCP não está fechado                 |
| P-05 | **MÉDIO**       | Fixture E2E dev não inicia Vite e pode usar `out` stale                                  | E2E local depende de artifact/dev server válido                |
| P-06 | **MÉDIO**       | Spec ACP espera botão `Test Connection` em página Agent                                  | Uma asserção E2E falha fora do escopo Ferramentas              |
| P-07 | **BAIXO**       | `McpManagement.tsx` permanece órfão e paralelo                                           | Duplicação potencial; não removido por segurança               |
| P-08 | **BAIXO**       | Projeção legada `mcp.config` continua existindo                                          | Duas representações de built-ins, não do catálogo novo         |
| P-09 | **BAIXO**       | Build precisa de heap ampliado neste ambiente                                            | Build não é reprodutível com heap padrão                       |
| P-10 | **BAIXO**       | Worktree DOM tests duplicam React                                                        | Validação local inconsistente; typecheck permanece válido      |
| P-11 | **INFORMATIVO** | Apenas en-US/pt-BR receberam novos textos de Tools                                       | Outros locales usam fallback                                   |

Nenhum problema classificado como **CRÍTICO** foi comprovado.

## 15. Riscos remanescentes

- Não há ACL backend por tool; a fase atual deliberadamente preserva a autorização por servidor.
- Não há credential reference para Bearer; o formulário novo bloqueia o caminho, mas a importação legada ainda aceita headers.
- A segurança de rede, OAuth e protocolo completo depende do AionCore/binário não presente no clone.
- O runner E2E packaged depende de `electron-builder` output; `npm run package` gera bundles, não o executável `win-unpacked`.
- A segurança de subprocessos stdio e o isolamento WebUI dependem do backend/electron security existente.
- Não há teste de carga/concurrency específico para o preflight; a limpeza é best-effort.
- Não há contrato explícito para duplicatas de tool names.

## 16. Correções realizadas durante a auditoria

1. `tests/e2e/helpers/navigation.ts`: fallback de navegação quando o atributo legado `[data-settings-path]` não existe.
2. Nenhuma funcionalidade de produto foi adicionada.
3. Nenhuma remoção de `out/`, arquivos experimentais ou `McpManagement.tsx` foi executada.
4. O build foi repetido com `NODE_OPTIONS` para registrar a causa do OOM; nenhuma configuração de build foi modificada.

## 17. Itens deliberadamente NÃO alterados

- `main` e branches;
- AionCore/binário;
- `out/` não foi removido; apenas foi regenerado pelo build solicitado;
- `McpManagement.tsx`;
- projeção legada `mcp.config`;
- JSON importer legado;
- OAuth/SSRF/ACL backend;
- channel plugins;
- Nango/Composio;
- runtime de agentes.

## 18. Evidências de validação

### Commits

```text
2f7752ab9 feat(tools): add normalized MCP integration catalog
e6f967068 feat(tools): add remote MCP catalog and tool selection
6a8c75f41 fix(tools): include built-in MCP sources in catalog
b9dc7c1a2 feat(tools): add real MCP preflight discovery
c5ec51bd5 fix(tools): preserve source identity and final discovery
```

### Comandos/resultados

- `bun run tsc --noEmit`: passou.
- `bunx vitest run ...` direcionado: 10 arquivos / 60 testes, passou.
- `npm run package`: falhou com heap padrão; retry com 4096 MB passou.
- `E2E_DEV=1 bunx playwright test ... ext-mcp.e2e.ts`: 3 passaram, 1 ignorado.
- `E2E_DEV=1 bunx playwright test ... acp-agent.e2e.ts`: 3 passaram, 2 ignorados, 1 falha de asserção legada.
- Runtime MCP real: discovery retornou tools reais e cleanup do servidor/registro temporário foi observado.
- API real: `chrome-devtools`, `aionui-browser`, `aionui-image-generation` e `MACP-EAP` foram inspecionados.

## 19. Conclusão técnica

### O que está comprovadamente funcionando?

- UI e rota Ferramentas;
- catálogo unificado de backend/built-in/extensão;
- preservação dos MCPs existentes;
- cadastro de MCP local/remoto pelo contrato existente;
- preflight real com discovery de tools;
- cleanup normal do preflight;
- carregamento e visualização de metadata real;
- seleção visual por tool como camada de catálogo;
- seleção server-level existente até o agente;
- typecheck, testes direcionados, build com heap ampliado e E2E de Ferramentas.

### O que ainda não foi comprovado?

- ACL real por tool;
- persistência backend de tools descobertas;
- OAuth completo;
- SSRF completo;
- Streamable HTTP completo no código do AionCore;
- seleção de extension MCP pelo agente;
- E2E packaged em executável final;
- execução de uma tool remota dentro de uma conversa real do agente.

### O que depende do AionCore?

- segurança de rede/SSRF;
- OAuth state/PKCE/redirect/token storage;
- parsing e sessão real do Streamable HTTP;
- isolamento de stdio;
- execução/autorização final das tools.

### Existe regressão comprovada?

**Não.** Não houve regressão funcional observada nos MCPs existentes, no typecheck ou nos 60 testes direcionados. Há uma falha E2E legada fora da página Ferramentas e problemas de runner/artefato documentados.

### Existe risco de regressão?

**Baixo a moderado.** O risco principal está na infraestrutura E2E e em contratos ainda não cobertos pelo clone. A implementação não introduziu segundo executor nem alterou o caminho do agente.

### O build passa?

**Sim**, com `NODE_OPTIONS=--max-old-space-size=4096`. Sem essa variável, a execução neste ambiente falhou por OOM.

### Os E2E passam?

- E2E específico de Ferramentas/ext-mcp: **sim**, 3 passaram e 1 ignorado.
- Spec ACP: **não completamente**; 3 passaram, 2 ignorados e 1 falhou em asserção antiga fora do escopo.

### É seguro seguir para a próxima fase?

**Sim para planejamento/investigação da próxima fase, com bloqueadores explícitos.** Não é seguro declarar encerramentos de ACL, credenciais, SSRF ou providers externos até que os contratos do AionCore sejam confirmados.

## 20. Próximos passos

1. Confirmar no AionCore o contrato de persistência/serialização de discovery e o suporte completo a Streamable HTTP.
2. Definir com o backend um contrato de ACL por `tool_id` e `credential_ref`, sem presumir campos no clone.
3. Auditar/redigir o caminho legado de importação JSON e snapshots de transporte.
4. Confirmar como extension MCPs devem entrar em `GuidPage`/assistant selection.
5. Tornar o E2E dev auto-contido ou exigir explicitamente um renderer URL válido; remover a dependência silenciosa de `out/`.
6. Atualizar a asserção E2E obsoleta da página Agent antes de usar esse spec como gate.
7. Só então avaliar Nango/Composio como adapters, sem criar endpoints ou tools fictícias.

**Encerramento:** esta auditoria não inicia uma nova fase de implementação.
