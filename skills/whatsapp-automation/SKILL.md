---
name: whatsapp-automation
description: >-
  Lê mensagens do WhatsApp Web (grupos e chats da empresa) através de um Chrome
  aberto em modo de depuração (CDP, porta 9222), salva o histórico e gera resumos
  diários (7:00 da manhã) e semanais (sexta-feira) do que foi solicitado, por quem
  e o que ficou pendente — usando os agentes do Arquimedes (Hermes, Open Code).
  Use quando o usuário pedir para "ver o que pediram no WhatsApp", "resumir o grupo
  PIAZZA", "o que ficou pendente ontem", "resumo da semana do grupo", ou pedir
  para configurar o monitoramento do WhatsApp. NÃO use para responder conversas
  automaticamente nem com o número pessoal do usuário.
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
node "<pasta-da-skill>\coletar.js" --obra "<obra>" --chat "PIAZZA"
```

## Pré-requisitos

Chrome aberto em modo de depuração (porta **local**, só `127.0.0.1`):

```bash
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\Arquimedes\chrome-arquimedes --no-first-run https://web.whatsapp.com/
```

O cliente CDP usa o `WebSocket` nativo do Node (22+), sem pacote externo. O chat
precisa estar **aberto** na aba do Chrome quando a coleta roda — o script confere o
nome do chat e avisa se for outro.

## Scripts

| Script | Função |
|--------|--------|
| `cdp-client.js` | Cliente CDP: conecta na aba do WhatsApp, extrai as mensagens visíveis, monta o texto para o agente. Também exporta `lerMensagens()`, `montarTextoParaAgente()`, `salvarJson()`. |
| `coletar.js` | CLI de coleta: lê as mensagens, salva o JSON do dia e imprime o prompt para o agente resumir. |
| `resumo.js` | CLI: salva o resumo gerado pelo agente em markdown. |
| `enviar.js` | CLI de envio (opt-in, exige `--confirmar`). |
| `index.js` | Fachada em Node: `coletarEPreparar()` e `salvarResumo()`, para uso por código. |

## Uso

### 1. Coletar as mensagens do chat aberto

```bash
node "<pasta-da-skill>\coletar.js" --obra "piazza" --chat "PIAZZA" --prompt "C:\Arquimedes\obras\piazza\whatsapp\prompt.txt"
```

- Grava `C:\Arquimedes\obras\<obra>\whatsapp\mensagens-AAAA-MM-DD.json`
  (`{ extraidoEm, chat, total, mensagens: [{ id, dataHora, autor, texto }] }`).
- Com `--prompt`, grava também o prompt pronto para o agente — **prefira o arquivo**
  ao console do Windows, que troca acentos e emojis por mojibake.

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

Sem `--confirmar` nada é enviado. Com `--confirmar`, o script confere o nome do chat
antes de escrever (sai com código 2 se não bater).

## Tarefas agendadas (cron)

A skill **não** cria tarefas sozinha — elas são criadas pelo agente via o CLI de
configuração do app. Contrato:

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

- `mensagens-AAAA-MM-DD.json` — o que foi coletado por dia
- `prompt.txt` — prompt de resumo (quando usar `--prompt`)
- `resumo-diario-AAAA-MM-DD.md` — o resumo gerado
- `resumo-semanal-AAAA-MM-DD.md` — o resumo da semana

A pasta da obra pode ser trocada pela variável `ARQUIMEDES_OBRAS`.

## Limites conhecidos

- Só extrai o que está visível na viewport (virtualização do WhatsApp Web).
- Rolar o histórico programaticamente via `Input.dispatchMouseEvent` trava a conexão
  com o CDP; rolagem manual pelo usuário é a via confiável.
- O botão de enviar depende de seletores (`data-testid="send"`) que podem mudar.
