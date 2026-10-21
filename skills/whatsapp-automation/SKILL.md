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
   O envio de mensagens existe em `scripts/whatsapp-enviar.js` e é **opt-in**, exige
   a flag `--confirmar` e só deve ser usado com número dedicado e ciência da empresa.
3. **Não é API oficial do WhatsApp.** É leitura do DOM do navegador via Chrome
   DevTools Protocol. Se o WhatsApp mudar o layout, a extração quebra e precisa ser
   ajustada.
4. **O Chrome precisa ficar aberto** e logado no WhatsApp Web durante a coleta.
   Se o navegador fechar ou o PC reiniciar, a coleta para.
5. **Somente mensagens visíveis.** O WhatsApp Web virtualiza o histórico: só o que
   está na tela é extraído. Para pegar mensagens antigas, o usuário rola o chat
   manualmente e a coleta é refeita.

## Pré-requisitos

Chrome aberto em modo de depuração:

```bash
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\Arquimedes\chrome-arquimedes --no-first-run https://web.whatsapp.com/
```

A porta 9222 é local (só `127.0.0.1`). O pacote `ws` é usado pelo cliente CDP
(já presente em `node_modules` do projeto).

## Scripts

| Script | Função |
|--------|--------|
| `scripts/whatsapp-cdp-client.js` | Cliente CDP: conecta na aba do WhatsApp, extrai as mensagens visíveis, grava JSON |
| `scripts/whatsapp-cdp-client-wrapper.js` | Wrapper `lerMensagens()` para uso em skills e tarefas agendadas |
| `scripts/whatsapp-resumo.js` | Exemplo: lê + monta o texto para o agente resumir + salva JSON |
| `scripts/whatsapp-enviar.js` | Envio de mensagem (opt-in, exige `--confirmar`) |

## Uso

### Ler as mensagens do chat aberto

```bash
cd C:\Arquimedes\app
node scripts/whatsapp-cdp-client.js "C:\Arquimedes\obras\mensagens.json"
```

Saída: `{ extraidoEm, fonte, total, mensagens: [{ id, dataHora, autor, texto }] }`

### Gerar resumo com um agente do Arquimedes

O texto bruto das mensagens (formato `[data] autor: texto`) deve ser entregue a um
agente (Hermes, Open Code, ou o agente da própria conversa) com o prompt:

> Resuma as mensagens abaixo de um grupo de obra. Liste: (1) o que foi solicitado,
> (2) quem pediu, (3) o que está pendente, (4) o que foi concluído. Ignore
> mensagens de saudação, figurinha e confirmação de leitura.

O wrapper já monta esse texto:

```js
const { lerMensagens, montarTextoParaAgente } = require('./scripts/whatsapp-cdp-client-wrapper');
const msgs = await lerMensagens({ chat: 'PIAZZA' });
const texto = montarTextoParaAgente(msgs);
```

## Tarefas agendadas

Modelos prontos em `skills/whatsapp-automation/`:

| Arquivo | Cron | O que faz |
|---------|------|-----------|
| `tarefa-resumo-diario.json` | `0 7 * * *` | Resumo do dia anterior (feito / pendente) |
| `tarefa-resumo-semanal.json` | `0 7 * * 5` | Resumo acumulado da semana |

Ambos vêm com `"habilitado": false` — ative de propósito, depois de ler os avisos.

## Armazenamento

Sugestão: `C:\Arquimedes\obras\<obra>\whatsapp\`
- `mensagens-AAAA-MM-DD.json` — o que foi coletado por dia
- `resumo-diario-AAAA-MM-DD.md` — o resumo gerado
- `resumo-semanal-AAAA-MM-DD.md` — o resumo da semana

## Limites conhecidos

- Só extrai o que está visível na viewport (virtualização do WhatsApp Web).
- Rolar o histórico programaticamente via `Input.dispatchMouseEvent` trava a conexão
  com o CDP; rolagem manual pelo usuário é a via confiável.
- O botão de enviar depende de seletores (`data-testid="send"`) que podem mudar.
