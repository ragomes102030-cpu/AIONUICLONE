# Auditoria de produção do AionUi empacotado

**Data:** 24/09/2026
**Clone auditado:** `C:\Users\Correta Engenharia\Desktop\AionUi clone`
**Branch:** `feat/agent-intelligence`
**HEAD auditado:** `38984fdd1`
**Versão do AionUi:** `2.2.2`
**AionCore observado:** `v0.2.2` / `aioncore 0.2.2`

> Esta etapa foi exclusivamente de auditoria, empacotamento e teste. Não foram implementadas funcionalidades, não foi copiado código do AionCore, a `main` não foi alterada e não houve push, merge ou rebase.

## 1. Escopo, método e estado do repositório

Foram examinados:

- resolução, spawn e ciclo de vida do backend;
- portas, marcadores de prontidão, health check, shutdown e restart;
- IPC, HTTP, WebSocket e o modo WebUI;
- persistência, diretórios, logs e credenciais;
- MCP, ACP, agentes, browser, filesystem e projetos;
- configuração de build e empacotamento Electron;
- `win-unpacked` e o instalador NSIS gerado;
- execução em `userData` temporário, sem usar dados reais do usuário;
- binário e manifesto do AionCore original e do clone;
- repositório público, release e licença do AionCore.

Os principais arquivos do clone usados como evidência são:

- `packages/desktop/src/index.ts`;
- `packages/desktop/src/process/backend/binaryResolver.ts`;
- `packages/web-host/src/backend-launcher.ts`;
- `packages/desktop/src/common/adapter/httpBridge.ts`;
- `packages/desktop/src/common/adapter/ipcBridge.ts`;
- `packages/desktop/electron-builder.yml`;
- `scripts/build-with-builder.js`;
- `resources/bundled-aioncore/win32-x64/manifest.json`;
- `package.json`.

### Resultado executivo

O clone **não é standalone em relação ao backend**. O AionUi inicia e usa o AionCore como servidor local de negócio. O AionCore já está incluído no esquema atual do instalador por `extraResources`; portanto, a situação comprovada é:

- **C — o clone precisa do AionCore e pode distribuí-lo junto:** comprovado;
- **B — o AionCore pode ser instalado separadamente:** tecnicamente possível por `AIONUI_BACKEND_BIN` ou `PATH`, mas não é a experiência de instalação comum;
- **E — há dependências externas para a lista completa de agentes:** parcialmente verdadeiro, porque os CLIs de agentes não estão no pacote.

## 2. Conclusão sobre os cenários A–E

| Cenário                                                | Resultado        | Evidência                                                                                                                      |
| ------------------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| A — tudo já está no clone, AionCore seria conveniência | **Não**          | O launcher resolve e inicia `aioncore.exe`; as APIs de negócio são servidas pelo AionCore.                                     |
| B — AionCore separado do AionUi                        | **Possível**     | `AIONUI_BACKEND_BIN`, `AIONUI_BACKEND_BUNDLED_DIR` e `PATH` são alternativas de resolução.                                     |
| C — AionCore incluído no instalador                    | **Comprovado**   | `electron-builder.yml` inclui `resources/bundled-aioncore`; `afterPack` confirmou o recurso; `win-unpacked` iniciou o backend. |
| D — incorporar módulos do AionCore ao clone            | **Não decidido** | Exigiria copiar/reimplementar código, resolver licença e manter contratos; não é necessário para o funcionamento atual.        |
| E — dependências impedem um produto local completo     | **Parcialmente** | O app e o backend funcionam juntos, mas agentes, providers, OAuth e MCPs externos dependem do ambiente do usuário.             |

A recomendação baseada em evidência é **manter o AionCore como binário de runtime empacotado**, não incorporar suas crates nem criar um segundo backend.

## 3. Mapa de componentes e propriedade

### 3.1 cadeia de execução

```text
AionUi.exe
  → renderer Electron
  → preload + httpBridge/ipcBridge
  → AionCore em subprocesso HTTP local
  → SQLite, agentes, MCP, ACP, filesystem, projetos, sessões e credenciais
```

### 3.2 responsabilidades

| Componente                                  | Responsabilidade                                                | Dono                     |
| ------------------------------------------- | --------------------------------------------------------------- | ------------------------ |
| `packages/desktop/src/index.ts`             | ciclo de vida Electron, janelas, backend e CDP                  | AionUi                   |
| `packages/web-host/src/backend-launcher.ts` | porta, argumentos, prontidão, health, stop e restart            | AionUi                   |
| `packages/desktop/src/renderer`             | interface, roteamento, telas e integrações                      | AionUi                   |
| `httpBridge.ts` / `ipcBridge.ts`            | contratos que o renderer usa para falar com o backend           | AionUi                   |
| `packages/web-host/src/static-server.ts`    | reverse proxy do modo WebUI                                     | AionUi                   |
| `aioncore.exe`                              | API, WebSocket, banco e serviços de domínio                     | AionCore                 |
| crates `aionui-*`                           | agentes, ACP, MCP, auth, runtime, arquivos, projetos e realtime | AionCore                 |
| Electron/Chromium                           | runtime visual e webview                                        | AionUi/Embutido          |
| CLIs de agentes                             | executáveis de Claude, Hermes, OpenCode, etc.                   | Usuário/ambiente externo |

O renderer não possui o runtime dos agentes. Ele faz chamadas ao backend e recebe eventos do WebSocket. Algumas operações de interface ainda usam IPC Electron, mas isso não substitui o backend de domínio.

## 4. AionCore original: localização, versão e distribuição

### 4.1 Binários comparados

O AionCore foi localizado como binário instalado, sem checkout local do código-fonte:

- **Original instalado:** `C:\Users\Correta Engenharia\Desktop\AionUi\resources\bundled-aioncore\win32-x64\aioncore.exe`
- **Clone auditado:** `C:\Users\Correta Engenharia\Desktop\AionUi clone\resources\bundled-aioncore\win32-x64\aioncore.exe`

Os dois binários têm o mesmo SHA-256:

```text
67EB02774BAB3855B759EC9756C2E540CD17B64B850407FA4B8BAD07FD8A0892
```

O executável original e o do clone, bem como `AionUi.exe` e o instalador, retornaram `NotSigned` no `Get-AuthenticodeSignature`.

### 4.2 manifesto e origem

`resources/bundled-aioncore/win32-x64/manifest.json` registra:

```json
{
  "platform": "win32",
  "arch": "x64",
  "version": "v0.2.2",
  "sourceType": "download",
  "source": {
    "url": "https://github.com/iOfficeAI/AionCore/releases/download/v0.2.2/aioncore-v0.2.2-x86_64-pc-windows-msvc.zip"
  },
  "files": ["aioncore.exe", "managed-resources/"]
}
```

O conjunto de recursos gerenciados referenciado pelo manifesto registra o runtime Node `24.11.0` e `clis: []`. Ou seja, o pacote não inclui os CLIs de agentes.

O código-fonte foi consultado no repositório público:

- repositório: <https://github.com/iOfficeAI/AionCore>
- release analisada: `v0.2.2`
- release datada de 09/09/2026 na auditoria
- entrada principal: crate `aionui-app`, subcomando de servidor em `cmd_server.rs`

Não havia checkout local do AionCore. As afirmações sobre a implementação Rust são baseadas no repositório público e na versão/binário correspondente.

## 5. Capacidades e módulos do AionCore

A árvore da release contém, entre outros, os seguintes módulos:

- `aionui-app`: entrada do executável e servidor;
- `aionui-api`: tipos e contratos HTTP;
- `aionui-ai-agent`: factories, lifecycle, filas, probes e tradução de eventos;
- `aionui-auth`: autenticação, OAuth e criptografia de credenciais;
- `aionui-conversation`: conversas, mensagens, streaming e estado;
- `aionui-db`: SQLite, migrations e repositórios;
- `aionui-file`: filesystem e contenção de paths;
- `aionui-mcp`: MCP, transports, OAuth e conexão;
- `aionui-process`: registro e supervisão de subprocessos;
- `aionui-project`: projetos, bindings e workspace;
- `aionui-realtime`: eventos e WebSocket;
- `aionui-runtime`: runtime Node, resolução de comandos e spawn;
- `aionui-session`: sessões CLI diretas e ACP;
- `aionui-system`: informações do sistema e diretórios;
- `aionui-team`, `aionui-cron` e `aionui-assistant`: funcionalidades de domínio.

A stack observada é Rust com Axum, Tokio, SQLite, OAuth2, Reqwest e WebSocket. A dependência Rust `aionrs` aparece na tag `v0.2.11` do repositório separado `iOfficeAI/aionrs`.

## 6. Inicialização, lifecycle, portas e paths

### 6.1 resolução do binário

`packages/desktop/src/process/backend/binaryResolver.ts` documenta e implementa esta ordem:

1. `AIONUI_BACKEND_BIN`;
2. `process.resourcesPath/bundled-aioncore/{platform}-{arch}` no produto empacotado;
3. `AIONUI_BACKEND_BUNDLED_DIR` e checkout de desenvolvimento;
4. `PATH` (`where aioncore` no Windows).

No Windows empacotado, o caminho efetivo é:

```text
<resources>/bundled-aioncore/win32-x64/aioncore.exe
```

O guia `docs/contributing/development.md` também confirma que o desenvolvimento normal usa um AionCore separado no `PATH`, enquanto o produto final usa o recurso empacotado.

### 6.2 argumentos e ambiente

`buildSpawnArgs()` e `buildSpawnEnv()` montam o processo com, conforme o caso:

```text
--port <porta>
--data-dir <diretório de dados>
--parent-pid <pid do Electron>
--log-level <nível>
--app-version 2.2.2
--managed-resources-mode bundled   # quando empacotado
--log-dir <diretório de logs>
--work-dir <diretório de trabalho>
--local
```

O processo filho também recebe:

- `AIONUI_CACHE_DIR`;
- `AIONUI_WORK_DIR`;
- `AIONUI_LOG_DIR`.

O modo `--local` é o modo desktop: injeta `system_default_user` e dispensa o fluxo normal de autenticação para uso local.

### 6.3 porta e prontidão

O launcher escolhe uma porta local compatível, inicia o filho e observa:

1. `AIONCORE_LISTENING {host, port}`;
2. `AIONCORE_READY`, marcador emitido quando o servidor começa a atender;
3. `GET /health` como confirmação de health check.

No teste empacotado, a porta foi dinâmica e o backend ficou acessível somente no loopback local. O renderer recebeu a porta por preload/bridge.

### 6.4 shutdown e restart

O código do launcher e o código do AionCore mostram:

- shutdown por `SIGINT`/`SIGTERM` e saída do processo pai;
- período de graça antes de `SIGKILL`;
- encerramento do banco e limpeza de subprocessos;
- monitoramento de saída inesperada;
- até três restarts em janela de 60 segundos, com backoff;
- proteção contra outro processo já possuir o mesmo `data-dir`.

A reabertura com o mesmo `userData` foi observada. Um crash foi induzido artificialmente; por segurança operacional, o mecanismo de restart foi validado por inspeção do código, não por `taskkill` durante esta auditoria.

## 7. HTTP, WebSocket, IPC e WebUI

### 7.1 contratos

AionCore é o servidor HTTP de domínio. O clone usa os contratos de:

- `GET /health`;
- APIs `/api/*`;
- WebSocket `/ws`.

O `httpBridge.ts` usa REST em `http://127.0.0.1:<porta>` e WebSocket em `ws://127.0.0.1:<porta>/ws`. A resposta usual é:

```json
{ "success": true, "data": {} }
```

ou uma resposta de erro com `success`, `error` e `code`.

O `ipcBridge.ts` preserva os contratos de MCP, ACP, filesystem, projetos e sessões para o renderer. Parte das chamadas é convertida de IPC Electron para HTTP; o renderer não fala diretamente com as crates Rust.

### 7.2 WebUI

No modo WebUI, `packages/web-host/src/static-server.ts` faz reverse proxy de `/api/*` e `/ws` para o mesmo AionCore. Muda o endereço/origem, não o dono dos dados.

## 8. Packaging real do AionUi

### 8.1 pipeline oficial e limite desta auditoria

`package.json` define:

- `npm run package` → `electron-vite build`;
- `npm run make` → mesmo bundler;
- `npm run dist:win` → `scripts/build-with-builder.js auto --win`;
- `npm run build-win:x64:fast` → wrapper de electron-builder com compressão reduzida.

`packages/desktop/electron-builder.yml` define:

- `appId: com.aionui.app`;
- alvo Windows NSIS;
- output em `out`;
- `extraResources` de `resources/bundled-aioncore` para `bundled-aioncore`;
- `public`, ícone e `resources/hub`;
- `asarUnpack` dos scripts built-in MCP e módulos nativos;
- `afterPack` e `afterSign`.

O wrapper oficial executa `prepareAioncore`, que baixa ou copia o AionCore. Ele **não foi executado nesta fase**, porque isso violaria a restrição de não copiar o AionCore. Em vez disso, o bundle já presente foi usado diretamente.

### 8.2 comandos executados

Bundler:

```text
NODE_OPTIONS=--max-old-space-size=4096 npm run package
```

Resultado: **passou**.

Electron-builder sem o wrapper de preparação:

```text
bunx electron-builder --config packages/desktop/electron-builder.yml --win --x64 --publish=never
```

Resultado: **passou**.

Artefatos observados:

```text
out/win-unpacked/AionUi.exe                         204.521.984 bytes
out/AionUi-2.2.2-win-x64.exe                       182.180.552 bytes
```

O `afterPack` confirmou o diretório `bundled-aioncore` e o módulo nativo `better-sqlite3`. O hash do AionCore no recurso empacotado permaneceu igual ao hash do binário original; o wrapper não fez download nem cópia do AionCore durante esta fase.

O builder emitiu aviso para `resources/hub` ausente. A chamada direta não executou `prepareHubResources.js`, que existe no wrapper oficial. Portanto, esse aviso demonstra uma diferença do teste direto, não uma falha comprovada do pipeline oficial completo.

### 8.3 instalador

O instalador NSIS foi gerado, mas não foi instalado em uma máquina Windows real. Não foi feita uma extração adicional porque `7z` não estava disponível. O smoke test do instalador, upgrade e uninstall permanecem bloqueadores.

O instalador, `win-unpacked/AionUi.exe` e `aioncore.exe` estão `NotSigned`.

## 9. Teste do executável em ambiente limpo

O teste usou `AIONUI_E2E_TEST=1` e um `AIONUI_E2E_USER_DATA_DIR` temporário. Não foi usado o banco do usuário real.

### 9.1 inicialização observada

O `win-unpacked`:

- abriu a janela Electron;
- montou o renderer;
- iniciou `aioncore.exe` como processo filho;
- recebeu uma porta dinâmica;
- respondeu a `/health`;
- conectou o WebSocket `/ws`;
- respondeu às APIs de sistema, conversas, assistants, agentes, MCP, skills, providers, teams e sidebar.

### 9.2 operações de negócio

| Operação                                    | Resultado                                                  |
| ------------------------------------------- | ---------------------------------------------------------- |
| Criar conversa                              | HTTP 201                                                   |
| Abrir workspace e criar/backfill de projeto | `project_id` retornado; `/api/projects/{id}` respondeu 200 |
| Escrever arquivo pelo filesystem            | HTTP 200                                                   |
| Ler arquivo                                 | Conteúdo idêntico                                          |
| Obter metadata                              | Resposta válida                                            |
| Listar diretório                            | HTTP 200                                                   |
| Fechar e reabrir com o mesmo userData       | Conversa e arquivo preservados                             |

### 9.3 testes automatizados

- `bun run tsc --noEmit`: passou.
- Testes direcionados: 10 arquivos, 60 testes, passou.
- E2E empacotado:

```text
E2E_PACKAGED=1 bunx playwright test --config playwright.config.ts tests/e2e/specs/ext-mcp.e2e.ts --reporter=list --timeout=180000
```

Resultado: **3 passaram, 1 ignorado**. A execução com timeout padrão de 60 segundos falhou apenas por inicialização lenta; com 180 segundos passou.

## 10. MCP

### 10.1 implementação

AionCore possui o domínio MCP em `aionui-mcp`, incluindo:

- CRUD e persistência;
- stdio, HTTP e SSE;
- `initialize`, `initialized` e `tools/list`;
- schemas de tools;
- status `connected`, `error` e `disconnected`;
- OAuth;
- detecção e sincronização de configurações de agentes;
- injeção de sessão;
- limpeza de subprocessos de teste.

A implementação de `connection_test` usa `Accept: application/json, text/event-stream`, captura `mcp-session-id` e interpreta respostas JSON ou SSE.

### 10.2 resultados reais

No executável empacotado:

- `chrome-devtools`: `POST /api/mcp/test-connection` retornou HTTP 200, sucesso e **30 tools**;
- após reabrir o aplicativo, `chrome-devtools` continuou `connected` com 30 tools, confirmando persistência do resultado no AionCore;
- `aionui-browser` retornou HTTP 502 `Server closed stdout before responding`, pois nenhum webview estava anexado;
- o log `check_fn _browser_cdp_check returned False` explica a condição;
- `aionui-image-generation` permaneceu desconectado porque nenhum provider foi configurado.

Um teste anterior de discovery com servidor Streamable HTTP temporário retornou as tools `consultar_eap` e `calcular_cpm`. O servidor e o registro temporário foram removidos.

### 10.3 limites

- A execução completa de tools em uma sessão Streamable HTTP real não foi validada no `win-unpacked`.
- A fonte confirma JSON/SSE e `mcp-session-id`, mas isso não prova cobertura integral de todas as versões da especificação MCP.
- Não foi encontrado, na fonte auditada, um allowlist SSRF completo para URLs MCP/OAuth; classificar como **não resolvido**, sem contornar essa lacuna.

## 11. ACP e agentes

### 11.1 ACP

AionCore possui factories, handshake, sessões, configuração, permissões, tradução de eventos, persistência e health check ACP. Evidências incluem:

- `crates/aionui-ai-agent/src/factory/acp.rs`;
- `factory/acp_launch_policy.rs`;
- `manager/acp/*`;
- `protocol/acp.rs`;
- `crates/aionui-session/src/backend/acp_conn.rs`.

O clone exibe e consome esses resultados; não implementa o handshake ACP.

### 11.2 agentes e CLIs

O comando real `aioncore doctor` reportou no ambiente auditado:

- 43 agentes catalogados;
- 8 disponíveis;
- 35 indisponíveis por CLI ausente;
- Node gerenciado disponível;
- CLIs como Claude, Gemini, Hermes, OpenCode e OpenClaw encontrados fora do bundle;
- a maioria dos agentes sem executável no `PATH`.

O manifesto gerenciado contém `clis: []`. Portanto, o instalador atual não inclui Claude, Hermes, OpenCode, Codex ou outros agent CLIs.

No ambiente que possuía os executáveis, os health checks de Claude, Hermes e OpenCode retornaram `online`. O endpoint `/api/extensions/acp-adapters` respondeu, mas não havia adapters ACP externos instalados no ambiente limpo. Para Hermes, os logs também mostraram conexão ACP, `Initialize from AionUi (protocol v1)` e `session/new` bem-sucedidos.

Isso prova a integração com CLIs instalados, não a disponibilidade universal em uma máquina limpa.

## 12. Browser e CDP

### 12.1 o que pertence ao clone

O AionUi possui:

- webview Electron;
- sessão/cache de browser;
- bridge CDP single-target em `127.0.0.1`;
- token local;
- filtro que só permite anexar o `webContents` do webview;
- script `builtin-mcp-browser.js` empacotado e desbloqueado do asar.

### 12.2 o que pertence ao AionCore

O AionCore hospeda e executa o processo MCP filho, mas não é o dono do Chromium. A cadeia é:

```text
AionUi main
  → bridge CDP + token
  → AionCore
  → builtin-mcp-browser.js
  → chrome-devtools-mcp
  → webview do AionUi
```

O launcher recusa fallback para Chrome oculto. O teste em ambiente limpo sem webview aberto reproduziu a falha esperada do MCP browser; a interação com uma página real não foi validada. O comportamento deve ser tratado como requisito de uso até que a UI anexe um webview ao servidor CDP.

## 13. Filesystem e projetos

AionCore contém `aionui-file` e `aionui-project`. O source inclui:

- validação de path com canonicalização;
- contenção por roots permitidos;
- escrita, leitura e listagem;
- watching;
- projetos e bindings;
- exploração de workspace;
- operações via `/api/fs/*`.

O clone fornece a ponte e a UI. A política de paths e os limites do workspace são do backend.

No ambiente empacotado isolado foram observados:

- `POST /api/fs/write` → 200;
- `POST /api/fs/read` → conteúdo idêntico;
- `POST /api/fs/metadata` → metadata do arquivo;
- listagem de diretório → 200;
- workspace/projeto com root e `pe_id` retornado pelo AionCore.

O source `aionui-file/src/path_safety.rs` canonicaliza caminhos e rejeita paths fora dos roots permitidos. Essa proteção não deve ser substituída por validação apenas no renderer.

## 14. Persistência, configuração, logs e credenciais

### 14.1 persistência

O AionCore mantém o banco SQLite e as migrations. No teste isolado, o banco e os logs apareceram sob:

```text
<userData>/aionui/aionui-backend.db
<userData>/logs/...
```

O clone ainda possui arquivos legados de configuração, mas a auditoria não encontrou fundamento para tratá-los como a nova fonte de verdade.

A conversa `b7f658dd`, o arquivo criado e o resultado MCP de `chrome-devtools` sobreviveram ao fechamento e à reabertura com o mesmo `userData`.

### 14.2 configuração e diretórios

O launcher fornece ao AionCore:

- `--data-dir`;
- `--work-dir`;
- `--log-dir`;
- `AIONUI_CACHE_DIR`;
- `AIONUI_WORK_DIR`;
- `AIONUI_LOG_DIR`.

A pasta de dados é criada no perfil do usuário e não deve ser pré-populada no instalador.

### 14.3 credenciais

AionCore usa `aionui-auth` e `aionui-db` para:

- JWT e cookies;
- senhas bcrypt;
- CSRF;
- tokens OAuth;
- credenciais de providers, remote agents e channels;
- secret de armazenamento para criptografia AES-GCM.

O comando `aioncore --data-dir <temp> secret status` respondeu que não havia `AIONUI_ENCRYPTION_SECRET` nem segredo persistido; o próximo início geraria/persistiria um. Nenhuma credencial real foi incluída no pacote.

As variáveis de ambiente e a origem do segredo têm precedência no backend. A auditoria não substituiu nem removeu nenhuma configuração de credenciais.

## 15. Classificação das dependências

| Dependência                                       | Classificação                                                              | Observação                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Electron/Chromium                                 | **EMBUTIDA NO APLICATIVO**                                                 | Runtime do `AionUi.exe` e do webview.                                  |
| Renderer/main/preload do AionUi                   | **EMBUTIDA NO APLICATIVO**                                                 | Incluídos no `app.asar`.                                               |
| `aioncore.exe` v0.2.2                             | **INSTALADA JUNTO** no pipeline atual; **REQUIRED EXTERNAL** se separado   | Incluído por `extraResources`; também pode ser resolvido por env/PATH. |
| Manifesto do AionCore                             | **INSTALADA JUNTO**                                                        | Define versão, origem e arquivos.                                      |
| Node gerenciado 24.11.0                           | **INSTALADA JUNTO**                                                        | Incluído em `managed-resources`.                                       |
| npm/npx gerenciados                               | **INSTALADA JUNTO** quando necessários pelos MCPs                          | Usados pelo runtime de ferramentas.                                    |
| Scripts built-in MCP                              | **INSTALADA JUNTO**                                                        | `asarUnpack` inclui browser, image-gen e team MCP.                     |
| Módulos nativos                                   | **INSTALADA JUNTO**                                                        | `better-sqlite3`, `bcrypt`, `node-pty` e dependências.                 |
| Claude, Hermes, OpenCode, Gemini, Codex, OpenClaw | **REQUIRED EXTERNAL** para essas capacidades; **OPCIONAL** para o baseline | `clis: []` no manifesto.                                               |
| Credenciais de providers                          | **REQUIRED EXTERNAL**                                                      | Configuradas pelo usuário ou empresa.                                  |
| OAuth/remote MCP                                  | **REQUIRED EXTERNAL** quando usado                                         | Servidor, tokens e autorização são externos.                           |
| Python, Bun, uv, Deno, OfficeCLI                  | **OPCIONAL**                                                               | Necessários apenas para ferramentas específicas.                       |
| Nango/Composio                                    | **NÃO RESOLVIDA**                                                          | Não foram encontrados no clone ou no manifesto.                        |
| `resources/hub`                                   | **NÃO RESOLVIDA** para esta execução                                       | O wrapper oficial não foi executado por causa da restrição de cópia.   |
| Código-fonte/crates do AionCore                   | **NÃO RESOLVIDA** para incorporação                                        | Não deve ser copiado nesta etapa.                                      |
| Assinatura digital                                | **NÃO RESOLVIDA**                                                          | Instalador e binários estão `NotSigned`.                               |

## 16. Licenças e distribuição

### AionUi

O `LICENSE` do clone é Apache License 2.0. O pacote também inclui `LICENSE.electron.txt` e `LICENSES.chromium.html` para Electron/Chromium.

### AionCore

Há uma divergência que precisa ser resolvida antes de qualquer incorporação ou redistribuição:

- a API do repositório `iOfficeAI/AionCore` e o `LICENSE` da tag `v0.2.2` indicam Apache License 2.0;
- o `Cargo.toml` da tag `v0.2.2` declara `license = "MIT"`;
- a release contém o binário e artefatos para várias plataformas;
- `aionrs` é um repositório git separado, tag `v0.2.11`, com indicação pública de Apache-2.0;
- AionCore usa terceiros como Tokio, Axum, Reqwest, OAuth2, SQLite, Rustls e outros.

Não é seguro, nesta etapa, copiar código, crates ou assets do AionCore. A redistribuição do binário e qualquer incorporação futura exigem confirmação do mantenedor, revisão de `NOTICE`, licenças transitivas e política de atribuição.

A auditoria não recomenda resolver essa questão copiando fonte. A recomendação é preservar o binário como componente versionado, após revisão legal e assinatura.

## 17. Segurança

### Observado ou implementado

- backend em loopback;
- porta dinâmica e marcadores de prontidão;
- autenticação local com `system_default_user`;
- headers sensíveis redigidos em logs estruturados do clone;
- secret de armazenamento separado do JWT;
- OAuth PKCE com `state` e callback loopback;
- path containment no backend;
- bridge CDP single-target com token;
- parent PID e encerramento por árvore de processos;
- AionCore e Electron testados sem credenciais reais.

### Não resolvido ou não validado

- allowlist SSRF completa para URLs MCP/OAuth;
- proteção contra redirect para rede privada;
- proteção contra DNS rebinding;
- isolamento completo de subprocessos netos em todas as plataformas;
- política de assinatura e redistribuição do AionCore;
- operação com credenciais reais em um produto distribuído.

A ausência de uma política SSRF completa na fonte auditada não prova uma vulnerabilidade específica; significa que a questão permanece aberta e deve ser verificada antes de expor URLs arbitrárias.

## 18. Riscos e bloqueadores

| ID   | Classificação   | Risco                                                   | Impacto                                                 |
| ---- | --------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| R-01 | **ALTO**        | O clone não é standalone sem o AionCore                 | Remover o binário impede o backend de iniciar.          |
| R-02 | **ALTO**        | Binários e instalador não assinados                     | SmartScreen, confiança e distribuição pública.          |
| R-03 | **ALTO**        | Divergência de licença Apache/MIT                       | Cópia ou incorporação pode ser inválida.                |
| R-04 | **MÉDIO**       | CLIs de agentes fora do bundle                          | App abre, mas agentes ficam indisponíveis.              |
| R-05 | **MÉDIO**       | Política SSRF/OAuth/redirect não totalmente demonstrada | Não expor URLs arbitrárias sem revisão.                 |
| R-06 | **MÉDIO**       | Browser MCP exige webview anexado                       | Teste headless falha mesmo com backend correto.         |
| R-07 | **MÉDIO**       | Pipeline oficial não executado nesta fase               | `hub` e preparação de release não foram validados.      |
| R-08 | **BAIXO**       | Instalador não foi instalado em máquina real            | Smoke de instalação, upgrade e uninstall não observado. |
| R-09 | **BAIXO**       | `resources/hub` ausente no teste direto                 | Fallback offline do hub não foi verificado.             |
| R-10 | **INFORMATIVO** | `aionui-browser` retornou 502 sem webview               | Condição esperada da bridge single-target.              |

Bloqueadores para declarar o produto pronto para um usuário comum:

1. decidir formalmente se o AionCore será distribuído junto;
2. resolver a divergência de licença do AionCore;
3. revisar licenças transitivas de `aionrs` e das demais crates;
4. assinar `AionUi.exe`, `aioncore.exe` e o instalador;
5. executar o wrapper oficial em ambiente de release, incluindo `prepareHubResources`;
6. testar instalação real do NSIS, primeira execução, upgrade e uninstall;
7. definir a política de distribuição dos CLIs de agentes e credenciais;
8. confirmar a política SSRF/OAuth/redirect;
9. testar o browser com webview real;
10. testar crash restart e recuperação do banco;
11. decidir o uso de `resources/hub` no pacote final.

## 19. O que deve acompanhar um instalador Windows

Para um usuário comum, o conjunto de runtime comprovadamente necessário é:

1. `AionUi.exe` e Electron/Chromium;
2. `app.asar` e `app.asar.unpacked`;
3. `resources/bundled-aioncore/win32-x64/aioncore.exe`;
4. `manifest.json` do AionCore;
5. `managed-resources/node/node-v24.11.0-win-x64` e os entrypoints Node/npm/npx necessários;
6. scripts built-in MCP em `app.asar.unpacked/out/main`;
7. módulos nativos desbloqueados (`better-sqlite3`, `bcrypt`, `node-pty` e dependências justificadas);
8. assets e `hub` quando o pipeline oficial preparar o bundle offline;
9. licenças e atribuições de Electron, Chromium, AionUi e componentes distribuídos;
10. assinatura digital do AionUi, do AionCore e do instalador.

O caminho já demonstrado é o `extraResources` de `resources/bundled-aioncore` no `electron-builder.yml`.

## 20. O que pode permanecer externo

Podem permanecer externos, conforme a funcionalidade escolhida pelo usuário:

- CLIs de agentes, como Claude, Hermes, OpenCode, Gemini, Codex e OpenClaw;
- credenciais de providers;
- tokens e servidores OAuth;
- servidores MCP remotos;
- Python, Bun, uv, Deno e OfficeCLI quando não forem necessários;
- workloads e serviços externos de browser que não usam o webview embutido.

Não se deve colocar nesta etapa:

- código-fonte ou crates do AionCore;
- `aionrs`;
- um segundo backend;
- uma reimplementação do runtime;
- credenciais reais;
- Nango/Composio sem decisão e implementação próprias.

## 21. Precisamos incorporar o AionCore?

**Não precisamos incorporar o código-fonte do AionCore.** O clone precisa **distribuir o AionCore como binário junto** para ser um produto local completo.

Incorporar módulos específicos só deve ser considerado futuramente se houver decisão explícita sobre:

- licença e redistribuição;
- compatibilidade de API e persistência;
- segurança e ciclo de atualização;
- manutenção da divergência entre o Electron e o backend;
- testes de regressão e rollback.

A auditoria não recomenda essa alternativa. A solução de menor risco, comprovada pelo empacotamento atual, é:

```text
AionUi Electron
  + AionCore versionado e assinado como recurso extra
  + Node gerenciado
  + scripts built-in MCP
  + CLIs de agentes externos como dependências opcionais
```

## 22. Conclusão e próximos passos

O executável empacotado comprovadamente:

- abre o renderer;
- localiza e inicia o AionCore bundled;
- usa porta local dinâmica;
- responde a `/health` e às APIs de negócio;
- conecta WebSocket;
- cria e mantém conversas;
- cria/usa projetos;
- persiste filesystem e banco;
- testa discovery MCP;
- integra agentes/ACP quando os CLIs externos existem;
- mantém dados entre reaberturas.

A dependência real é, portanto, **AionCore como backend de runtime**, não um detalhe de desenvolvimento. O clone deve continuar consumindo seus contratos HTTP/WS e empacotando o binário correspondente, desde que a licença, a assinatura e a operação dos recursos externos sejam resolvidas.

Próximos passos recomendados, sem alterar o runtime nesta etapa:

1. confirmar licença e redistribuição do AionCore;
2. preparar uma release oficial com o wrapper completo;
3. assinar os três artefatos principais;
4. testar instalação/upgrade/uninstall em Windows limpo;
5. testar browser com webview real;
6. validar crash restart e recuperação de banco;
7. revisar SSRF/OAuth e a distribuição de CLIs/credenciais.

**Resposta final:** o instalador de uso comum deve acompanhar o AionUi, Electron/Chromium, o `aioncore.exe` v0.2.2 ou versão compatível, seu manifesto, Node gerenciado, scripts built-in MCP, módulos nativos, assets/licenças e assinatura. CLIs de agentes, providers, credenciais, OAuth e servidores MCP externos podem permanecer externos. O AionCore não precisa ser incorporado ao código do clone; precisa ser distribuído junto como componente de runtime.
