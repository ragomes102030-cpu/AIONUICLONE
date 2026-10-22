---
name: whatsapp-automation
description: >-
  Lê o WhatsApp Web através de um Chrome aberto em modo de depuração (CDP, porta
  9222) e gera resumos globais diários (7:00) e semanais (sexta 7:00) do que foi
  solicitado, por quem e o que ficou pendente — usando os agentes do Arquimedes
  (Hermes, Open Code). O escopo é GLOBAL: vale para a conta que estiver conectada
  no Chrome da estação, não para um grupo nem para um número fixo.
  Use quando o usuário pedir para "ver o que pediram no WhatsApp", "o que ficou
  pendente ontem", "resumo da semana", ou para configurar o monitoramento do
  WhatsApp. NÃO use para responder conversas automaticamente nem com o número
  pessoal do usuário.
homepage: 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento'
metadata:
  {
    'openclaw':
      {
        'emoji': '📲',
        'os': ['darwin', 'linux', 'win32'],
        'homepage': 'https://github.com/ragomes102030-cpu/ArquimedesPlanejamento',
        'requires': { 'bins': ['node'] },
      },
  }
---

# WhatsApp — Automação e Resumo (via CDP)

## ⚠️ Avisos obrigatórios

Estes avisos devem ser lidos em voz alta / exibidos sempre que esta skill for ativada:

1. **Não use o número pessoal.** Use um chip ou número dedicado da empresa.
   O WhatsApp pode banir o número — temporária ou permanentemente — se detectar automação.
2. **Esta skill apenas lê e resume.** Ela não responde conversas por conta própria.
   O envio de mensagens existe em `enviar.js` e é **opt-in**, exige a flag
   `--confirmar` e só deve ser usado com número dedicado e ciência da empresa.
3. **Não é API oficial do WhatsApp.** É leitura do DOM do navegador via Chrome
   DevTools Protocol. Se o WhatsApp mudar o layout, a extração quebra e precisa ser
   ajustada.
4. **O Chrome precisa ficar aberto** e logado no WhatsApp Web durante a coleta.
   Se o navegador fechar ou o PC reiniciar, a coleta para.
5. **Somente mensagens visíveis.** O WhatsApp Web virtualiza o histórico: só o que
   está na tela é extraído. Para pegar mensagens antigas, o usuário rola o chat
   manualmente e a coleta é refeita.

## Onde esta skill está

Todos os scripts vivem **na mesma pasta deste SKILL.md** — não há dependência da pasta
`scripts/` do repositório, então a skill funciona dentro do app instalado:

| Onde | Caminho |
|------|---------|
| App instalado (uso normal) | `%APPDATA%\Arquimedes\arquimedes\skills\users\system_default_user\whatsapp-automation\` |
| Repositório (desenvolvimento) | `C:\Arquimedes\app\skills\whatsapp-automation\` |

Rode sempre com o caminho completo, a partir da raiz da skill:

```bash
node "<pasta-da-skill>\coletar.js" --obra "<obra>" --global
```

## Escopo: global, não vinculado a um número

Esta skill **não fica presa a um número nem a um grupo**. A estação detecta **qual
conta está conectada** no Chrome e lê **todas as conversas da lista**.

- A conta é identificada no momento da coleta (nome do perfil e identificador da
  sessão) e vem registrada no relatório — para você auditar de onde veio.
- A leitura da **lista de conversas** (título, horário, prévia da última mensagem,
  contador de não lidas) **não abre nenhuma conversa**, portanto **não marca nada
  como lida**.
- Nada precisa ser configurado com número fixo: se a conta conectada mudar, a
  estação continua funcionando e o relatório passa a refletir a conta nova.
- Para o conteúdo detalhado de uma conversa específica (as mensagens), use o modo
  `--chat`: ele exige que aquela conversa esteja aberta na aba do Chrome.

## Pré-requisitos

Chrome aberto em modo de depuração (porta **local**, só `127.0.0.1`):

```bash
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\Arquimedes\chrome-arquimedes --no-first-run https://web.whatsapp.com/
```

O cliente CDP usa o `WebSocket` nativo do Node (22+), sem pacote externo.

No **modo global** (`--global`) nenhuma conversa precisa estar aberta: o script lê a
lista inteira. No **modo por conversa** (`--chat`) a conversa precisa estar **aberta**
na aba do Chrome — o script confere o nome e avisa se for outra.

## Scripts

| Script | Função |
|--------|--------|
| `cdp-client.js` | Cliente CDP: conecta na aba do WhatsApp, extrai as mensagens visíveis, monta o texto para o agente. Também exporta `lerMensagens()`, `montarTextoParaAgente()`, `salvarJson()`. |
| `coletar.js` | CLI de coleta: no modo `--global` lê a **lista de todas as conversas** (sem abrir nenhuma) + a conta conectada; no modo `--chat` lê as mensagens da conversa aberta. Salva o JSON do dia e imprime o prompt para o agente resumir. |
| `resumo.js` | CLI: salva o resumo gerado pelo agente em markdown. |
| `enviar.js` | CLI de envio (opt-in, exige `--confirmar`). |
| `index.js` | Fachada em Node: `coletarEPreparar()` e `salvarResumo()`, para uso por código. |
| `station-core.js` | Núcleo compartilhado (sem dependências): descobre o data-dir, abre o banco (`node:sqlite`), inspeciona skills/cron, fala com a API do app e inspeciona o Chrome. |
| `doctor.js` | Diagnóstico da estação: Chrome, sessão do WhatsApp, data-dir, API, skill instalada e registrada, skills com caminho quebrado, tarefas agendadas e resumos. |
| `station.js` | **Instalador de 1 comando**: prepara tudo o que a estação precisa (abaixo). |

## Configuracao por numero (qualquer cliente)

A estacao nao fica presa a um numero. Cada cliente configura **o numero dele** e a estacao
passa a funcionar para ele:

```bash
node "<pasta-da-skill>\station.js" --numero "+55 85 99999-9999" --rotulo "Cliente Exemplo" --conta "Nome da Conta"
```

O que acontece na configuracao:

| Item | Comportamento |
|---|---|
| **Perfil do Chrome** | cada numero recebe a sua propria pasta: `<base>\<slug-do-numero>`. As sessoes nao se misturam entre clientes. |
| **Arquivo de configuracao** | `{data-dir}\whatsapp-station.json` guarda numero, rotulo, conta esperada, perfil, porta CDP, obra e chat padrao. |
| **Tarefas agendadas** | recebem o rotulo do cliente no nome ("Resumo diario do WhatsApp (Cliente Exemplo)") e os caminhos sao substituidos na instalacao, para funcionar na maquina dele. |
| **Validacao** | se a conta conectada no Chrome for diferente da conta esperada, o instalador e o doctor avisam. |

Opcoes:

| Flag | O que faz |
|---|---|
| `--numero "<numero>"` | numero do cliente (define o perfil do Chrome e o rotulo padrao) |
| `--rotulo "<nome>"` | nome curto que aparece no nome das tarefas agendadas |
| `--conta "<nome>"` | conta esperada no WhatsApp Web (o doctor compara e avisa se divergir) |
| `--perfil "<caminho>"` | usar um perfil do Chrome especifico em vez do padrao |
| `--cdp <porta>` | porta de depuracao do Chrome (padrao 9222) |
| `--obra "<obra>"` | pasta de obras onde os resumos sao gravados |
| `--chat "<conversa>"` | conversa especifica (opcional; sem isso o escopo e global) |

Sem `--numero`, a estacao usa o perfil e a configuracao ja salvos (ou os valores padrao).


## Instalação da estação (1 comando)

A estação é a máquina que fica ligada: Chrome em depuração + WhatsApp Web logado +
o Arquimedes em modo servidor. O **app nunca instala nada sozinho** — ele só mostra o
estado e liga/desliga. A preparação é feita na estação:

```bash
node "<pasta-da-skill>\station.js"
```

No repositório, o atalho é `npm run station:whatsapp`.

O que o instalador faz, em ordem:

1. Localiza o `data-dir` do Arquimedes (`%APPDATA%\Arquimedes\arquimedes`).
2. Descobre a API do backend (WebUI `http://127.0.0.1:25808` ou a porta do core).
3. Copia esta skill para `{data-dir}\skills\users\<usuario>\whatsapp-automation\`.
4. **Repara skills com caminho quebrado** — após uma migração de pasta, o catálogo
   pode apontar para o diretório antigo; o `path` é repontado para o novo.
5. **Registra a skill no catálogo** (`POST /api/skills/import`) — só copiar a pasta
   em disco não basta, o app precisa catalogá-la.
6. **Cria as tarefas agendadas** (diário 7:00 e semanal sexta 7:00), pulando as que
   já existirem pelo nome.
7. Sobe o Chrome em modo de depuração, se não estiver de pé.
8. Roda o `doctor.js` no final e imprime o resultado.

Opções: `--sem-cron`, `--sem-chrome`, `--data-dir`, `--cdp <porta>`.

## Diagnóstico

```bash
node "<pasta-da-skill>\doctor.js"           # relatório legível
node "<pasta-da-skill>\doctor.js" --json    # saída para máquina
```

No repositório: `npm run doctor:whatsapp`.

O relatório vem em blocos (CHROME, ARQUIMEDES, SKILL, CATÁLOGO DE SKILLS, TAREFAS
AGENDADAS, RESUMOS) e termina com a lista de **pendências**. Ele explica a causa da
falha em vez de só dizer que falhou: Chrome fechado, sessão do WhatsApp expirada,
skill não registrada, tarefa ausente, caminho de skill quebrado.


## Uso

### 1. Coletar (modo global — padrão)

```bash
node "<pasta-da-skill>\coletar.js" --obra "whatsapp" --global --prompt "C:\Arquimedes\obras\whatsapp\whatsapp\prompt.txt"
```

- Grava `C:\Arquimedes\obras\<obra>\whatsapp\chats-AAAA-MM-DD.json`
  (`{ extraidoEm, escopo: "global", conta: { nome, identificador, avatar }, total,
  chats: [{ titulo, hora, preview, naoLidas }] }`).
- **Nenhuma conversa é aberta** → nada é marcado como lido.
- Com `--prompt`, grava também o prompt pronto para o agente — **prefira o arquivo**
  ao console do Windows, que troca acentos e emojis por mojibake.

### 1b. Coletar as mensagens de uma conversa específica

```bash
node "<pasta-da-skill>\coletar.js" --obra "piazza" --chat "PIAZZA" --prompt "C:\Arquimedes\obras\piazza\whatsapp\prompt.txt"
```

- Grava `C:\Arquimedes\obras\<obra>\whatsapp\mensagens-AAAA-MM-DD.json`
  (`{ extraidoEm, escopo: "conversa", chat, total, mensagens: [{ id, dataHora, autor, texto }] }`).
- Exige a conversa **aberta** na aba do Chrome.

### 2. Resumir (feito pelo agente)

O agente (Hermes, Open Code, ou o agente da própria conversa) lê o prompt gerado e
produz o resumo em markdown com quatro seções:

> **O QUE FOI SOLICITADO** — cada pedido, com autor e data/hora.
> **QUEM PEDIU** — agrupado por pessoa.
> **PENDÊNCIAS** — o que ficou aberto, com quem está.
> **CONCLUÍDO** — o que já foi resolvido ou confirmado.

Mensagens de saudação, figurinha e confirmação de leitura são ignoradas. Se não houver
pedido concreto, o resumo é apenas "Sem solicitações no período".

### 3. Salvar o resumo

```bash
node "<pasta-da-skill>\resumo.js" --obra "piazza" --tipo diario --arquivo "C:\temp\resumo.md"
```

Grava `C:\Arquimedes\obras\<obra>\whatsapp\resumo-<tipo>-AAAA-MM-DD.md`.

### 4. Enviar (opcional, exige número dedicado)

```bash
node "<pasta-da-skill>\enviar.js" "texto" --chat "PIAZZA"              # só mostra (dry-run)
node "<pasta-da-skill>\enviar.js" "texto" --chat "PIAZZA" --confirmar  # envia de verdade
```

Troque `"PIAZZA"` pela conversa de destino — o nome é conferido antes de escrever.

Sem `--confirmar` nada é enviado. Com `--confirmar`, o script confere o nome do chat
antes de escrever (sai com código 2 se não bater).

## Tarefas agendadas (cron)

A skill **não** cria tarefas sozinha — elas são criadas pelo agente via o CLI de
configuração do app (ou pelo `station.js`, que já deixa as duas criadas).
Contrato:

```bash
"$AIONUI_HELPER_BIN" config cron current list      # consulta antes de criar
"$AIONUI_HELPER_BIN" config cron current create <<'JSON'
{
  "name": "...",
  "schedule": "0 7 * * *",
  "schedule_description": "...",
  "message": "instrução completa e autossuficiente para a IA"
}
JSON
```

Regras do app:

- **Cada conversa aceita no máximo 1 tarefa.** Resumo diário e semanal exigem
  **duas conversas diferentes**.
- O payload vai por **stdin (heredoc)** — nunca grave o JSON em disco.
- Nunca defina variáveis de ambiente `AIONUI_*` na mão.
- Modelos prontos nesta pasta: `tarefa-resumo-diario.json` (`0 7 * * *`) e
  `tarefa-resumo-semanal.json` (`0 7 * * 5`) — o `message` de cada um já é a
  instrução completa; copie o objeto para o heredoc.

## Armazenamento

Padrão: `C:\Arquimedes\obras\<obra>\whatsapp\`

- `chats-AAAA-MM-DD.json` — a lista global de conversas do dia (com a conta conectada)
- `mensagens-AAAA-MM-DD.json` — as mensagens de uma conversa específica (modo `--chat`)
- `prompt.txt` — prompt de resumo (quando usar `--prompt`)
- `resumo-diario-AAAA-MM-DD.md` — o resumo gerado
- `resumo-semanal-AAAA-MM-DD.md` — o resumo da semana

A pasta da obra pode ser trocada pela variável `ARQUIMEDES_OBRAS`.

## Limites conhecidos

- **Modo global** mostra a prévia de cada conversa, não as mensagens. Para o conteúdo
  de uma conversa, use `--chat` — ou peça para o usuário abrir a conversa.
- Só extrai o que está visível na viewport (virtualização do WhatsApp Web).
- Rolar o histórico programaticamente via `Input.dispatchMouseEvent` trava a conexão
  com o CDP; rolagem manual pelo usuário é a via confiável.
- O botão de enviar depende de seletores (`data-testid="send"`) que podem mudar.
- Se o Chrome for aberto **sem** a flag `--remote-debugging-port=9222`, a estação
  perde a conexão (o `doctor.js` avisa e o `station.js` reinicia o Chrome).
