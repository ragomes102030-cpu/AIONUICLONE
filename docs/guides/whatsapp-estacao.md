# Estação WhatsApp do Arquimedes

> Como o Arquimedes lê o WhatsApp Web, monta o resumo do dia e o da semana,
> e como você acessa isso de outro dispositivo.

---

## 1. O que é isto (em 30 segundos)

O Arquimedes **não** tem integração oficial com o WhatsApp. O que existe aqui é uma
**estação**: um conjunto de peças que rodam numa máquina que fica ligada e transformam
as mensagens do WhatsApp Web em **resumos de trabalho**.

```
┌──────────────────── ESTAÇÃO (a máquina que fica ligada) ─────────────────────┐
│                                                                             │
│   Chrome (perfil dedicado) ── porta 9222 (depuração local) ──┐               │
│        └─ WhatsApp Web logado no número DEDICADO            │               │
│                                                              ▼               │
│   Skill "whatsapp-automation" (Node) ── lê o texto renderizado no DOM         │
│                                                              │               │
│                                                              ▼               │
│   Arquimedes (--webui --remote, porta 25808) ── tarefas cron (7:00 / sexta)  │
│                                                              │               │
└──────────────────────────────────────────────────────────────┼───────────────┘
                                                               │  HTTP
                                                               ▼
                                              Celular / outro PC: abre o resumo
```

**Pontos que valem fixar:**

- A **sessão do WhatsApp é a do Chrome**, não uma sessão do Arquimedes. O app só
  **lê** o que já está na tela.
- O **escopo é global**: a estação não fica presa a um grupo nem a um número. Ela
  detecta **qual conta está conectada** e lê **todas as conversas da lista** — sem
  abrir nenhuma, portanto sem marcar nada como lido.
- O app **nunca instala nada sozinho**. A instalação da estação é **um comando**, na
  máquina que vai ficar ligada.
- O resumo **aparece na conversa do Arquimedes**. Devolvê-lo pelo WhatsApp é
  **opcional** e exige número dedicado.

---

## 2. Os 5 avisos (leia antes de qualquer coisa)

1. **Use um número dedicado.** Nada de ler o WhatsApp pessoal. Se o número for
   bloqueado, a culpa é do WhatsApp — não existe como reverter isso.
2. **Isto só lê e resume.** O envio de mensagem é opt-in (`--confirmar`) e existe
   porque o resumo também pode ser entregue pelo próprio WhatsApp.
3. **Não é API oficial.** A leitura usa o protocolo de depuração do Chrome
   (CDP, porta local). Se o WhatsApp mudar o layout do DOM, a coleta para de
   achar as mensagens — e o diagnóstico avisa isso.
4. **O Chrome precisa ficar aberto** na estação, com a aba do WhatsApp carregada.
5. **Só as mensagens visíveis são lidas.** O WhatsApp Web virtualiza o histórico:
   mensagens fora da tela não existem no DOM. Para pegar mais, role o histórico
   na tela antes de rodar a coleta.

---

## 3. Instalação (1 comando)

Na máquina que vai ficar ligada, com o repositório do Arquimedes:

```bash
npm run station:whatsapp
```

Esse comando faz, sozinho:

1. resolve o *data-dir* do Arquimedes;
2. descobre a API do backend (WebUI `25808` ou a porta do core);
3. copia a skill `whatsapp-automation` para o *data-dir* do usuário;
4. **repara as skills do catálogo** cujo caminho aponta para uma instalação
   antiga (ex.: a pasta do AionUi que foi removida) e atualiza para a atual;
5. registra a skill no catálogo (import via API);
6. cria as **duas tarefas agendadas** (diária e semanal), se ainda não existirem;
7. sobe o Chrome em modo depuração, se não estiver de pé;
8. roda o diagnóstico final.

Opções úteis:

```bash
node skills/whatsapp-automation/station.js
node skills/whatsapp-automation/station.js --sem-cron      # não cria tarefas
node skills/whatsapp-automation/station.js --sem-chrome    # não sobe o Chrome
node skills/whatsapp-automation/station.js --data-dir "C:\...\Arquimedes\arquimedes"
```

---

## 4. Diagnóstico

Sempre que algo parecer errado, rode:

```bash
npm run doctor:whatsapp
```

Saída em blocos — **CHROME**, **ARQUIMEDES**, **SKILL**, **CATÁLOGO DE SKILLS**,
**TAREFAS AGENDADAS**, **RESUMOS** — e uma lista final de **PENDÊNCIAS** com a
causa de cada uma (Chrome fechado, sessão expirada, skill não registrada, etc.).

Para consumo de máquina:

```bash
node skills/whatsapp-automation/doctor.js --json
```

---

## 5. Coleta manual

Modo **global** (padrão) — lê a lista de todas as conversas, sem abrir nenhuma:

```bash
node skills/whatsapp-automation/coletar.js --obra whatsapp --global \
  --prompt "C:\Arquimedes\obras\whatsapp\whatsapp\prompt.txt"
```

Grava a lista do dia em `C:\Arquimedes\obras\<obra>\whatsapp\chats-AAAA-MM-DD.json`
(com a **conta conectada**, o total de conversas e, por conversa, título, horário,
prévia e contador de não lidas) e escreve o **prompt de resumo** em arquivo (o
console do Windows embaralha acentos e emoji — por isso o prompt vai para arquivo,
não para a tela).

Para o conteúdo de **uma** conversa, use o modo por conversa (a conversa precisa
estar aberta na aba do Chrome):

```bash
node skills/whatsapp-automation/coletar.js --obra piazza --chat PIAZZA \
  --prompt "C:\Arquimedes\obras\piazza\whatsapp\prompt.txt"
```

O prompt pede 5 seções: **o que foi solicitado**, **quem pediu**, **pendências**,
**o que foi concluído** e **conversas sem pedido**.

Para gravar o resumo final:

```bash
node skills/whatsapp-automation/resumo.js --obra piazza --tipo diario \
  --arquivo "C:\Arquimedes\obras\piazza\whatsapp\resumo-diario-2026-10-21.md"
```

---

## 6. Tarefas agendadas

| Tarefa | Cron | O que faz |
|---|---|---|
| Resumo diário | `0 7 * * *` | Coleta o dia anterior e escreve o resumo na conversa |
| Resumo semanal | `0 7 * * 5` | Junta a semana e escreve o resumo semanal |

Fuso: `America/Sao_Paulo`.

As tarefas são criadas pelo `station:whatsapp`. Para listar:

```bash
"$AIONUI_HELPER_BIN" config cron current list
```

> **Regra do app:** cada conversa aceita **no máximo 1 tarefa**. Por isso a diária e
> a semanal moram em conversas diferentes.

> ⚠️ O agendamento vive **dentro do backend**. Se o processo do Arquimedes morrer,
> a tarefa não dispara — o cron não é um serviço separado do Windows.

---

## 7. Acesso remoto (ler o resumo de outro dispositivo)

O modo servidor expõe o app inteiro por HTTP:

```bash
"C:\Program Files\Arquimedes\Arquimedes.exe" --webui --remote
```

- Endereço local: `http://127.0.0.1:25808`
- Na rede: `http://<ip-da-estação>:25808`

> ⚠️ **O backend sobe em modo `--local`**, ou seja, **a autenticação da API fica
> desligada** (o usuário `system_default_user` é injetado sem senha). **Nunca
> exponha a porta 25808 na internet.** Para acesso externo, coloque um proxy
> reverso com TLS e senha (Caddy, Nginx, Cloudflare Tunnel) na frente.

O `--remote` também faz o bind em `0.0.0.0`. Para o servidor e o desktop
compartilharem o mesmo banco, skills e tarefas, aponte o *data-dir* para o mesmo
lugar do desktop.

---

## 8. Enviar o resumo de volta pelo WhatsApp (opcional)

```bash
node skills/whatsapp-automation/enviar.js "texto do resumo" --chat PIAZZA
```

Sem `--confirmar`, o script **apenas mostra** o que seria enviado (modo seguro).
Com `--confirmar`, ele confere se o chat aberto é o indicado e só então envia.

**Só faz sentido com número dedicado.** Nunca use o seu número pessoal.

---

## 9. Onde os arquivos ficam

| Caminho | O que é |
|---|---|
| `C:\Arquimedes\app\skills\whatsapp-automation\` | a skill no repositório |
| `%APPDATA%\Arquimedes\arquimedes\skills\users\system_default_user\whatsapp-automation\` | a skill instalada (a que o app usa) |
| `C:\Arquimedes\obras\<obra>\whatsapp\` | mensagens, prompts e resumos da obra |
| `C:\Arquimedes\chrome-arquimedes\` | perfil do Chrome da estação |

---

## 10. Limites conhecidos

- **Virtualização:** só as mensagens visíveis na tela são lidas. Para histórico
  antigo, role a tela antes da coleta.
- **Sessão:** se o WhatsApp pedir QR de novo, a coleta para. O diagnóstico
  mostra "sessão expirada".
- **Layout:** seletores do DOM do WhatsApp Web. Uma mudança do WhatsApp pode
  quebrar a coleta — o diagnóstico detecta (chat aberto vazio / 0 mensagens).
- **Chrome precisa estar aberto** na estação, logado, com a aba do WhatsApp.
- **Sem garantia de estabilidade:** leitura por CDP não é contrato oficial.
  Trate como ferramenta interna de trabalho e conferência, não como canal oficial.

---

## 11. Scripts da skill

| Script | Para quê |
|---|---|
| `station.js` | instala a estação (1 comando) |
| `doctor.js` | diagnóstico (`--json` para máquina) |
| `coletar.js` | coleta global (lista de conversas) ou por conversa, e monta o prompt de resumo |
| `resumo.js` | grava o resumo (diário/semanal) em arquivo |
| `enviar.js` | envio opcional pelo WhatsApp (`--confirmar`) |
| `cdp-client.js` | cliente CDP (base de `coletar.js`) |
| `station-core.js` | núcleo compartilhado (data-dir, API, Chrome, banco) |
| `index.js` | API para o agente (`coletarEPreparar`, `salvarResumo`) |

---

## Ver também

- [`webui.md`](./webui.md) — usando a interface web
- [`deploy-server.md`](./deploy-server.md) — publicando o servidor do WebUI
- [`cdp.md`](./cdp.md) — o MCP `chrome-devtools`
- [`../ROADMAP_ENGENHARIA_CIVIL.md`](../ROADMAP_ENGENHARIA_CIVIL.md) — o plano do produto
