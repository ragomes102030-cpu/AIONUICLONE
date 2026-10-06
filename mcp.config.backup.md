# Backup do estado instalado dos servidores MCP

Backup do que estava **instalado e ativo** no AionUi desta máquina, tirado da
API em 2026-10-01, imediatamente antes da remoção.

Isto **não** é o mesmo que [`mcp.config.json`](./mcp.config.json), que é o
catálogo de servidores disponíveis. Os dois se sobrepõem só em parte:

|                                                   | servidores                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [`mcp.config.json`](./mcp.config.json) — catálogo | `excel-mcp-server`, `whatsapp-mcp`, `lean-planning-mcp`, `saga-mcp`, `osmmcp`, `pdf-tools` |
| este arquivo — estado instalado                   | os 10 que estavam rodando/listados                                                         |

Só no catálogo e nunca instalados: `whatsapp-mcp`, `pdf-tools`.
Só aqui e **não** no catálogo: `aiven`, `render`, `postgres`, `aionui-image-generation`, `chrome-devtools`, `aionui-browser`.

Ou seja: **`aiven`, `render` e `postgres` só estavam preservados aqui.** Sem
este arquivo, as configurações deles seriam irrecuperáveis.

## Redação de caminho

Os dois servidores embutidos apontam para o binário instalado, e o caminho
absoluto carregava o nome do usuário. Na restauração, troque `<usuario>` pelo
seu nome de conta:

```
C:\Users\<usuario>\AppData\Local\Programs\AionUi\
```

A redação teve que ser feita em duas passadas. O mesmo caminho aparece com
barras escapadas em dois níveis diferentes — no campo `transport.args` e dentro
do `original_json`, que é um JSON dentro do JSON. Trocar só a ocorrência de
barra simples deixa as do nível duplo vazando, e o arquivo continua válido,
o que faz o erro passar despercebido. Como o nome de usuário não tem barra,
trocar só ele cobre os dois níveis de uma vez.

Vale a regra: **quando redigir, confira todos os níveis de escape antes de
commitar**, e valide que o JSON ainda abre.

## Nenhum segredo no arquivo

Verificado item a item antes de versionar:

- `render` tem a chave `RENDER_API_KEY` no `env`, mas o **valor é vazio** — e
  é justamente por isso que o servidor não conectava.
- `postgres` aponta para `postgresql://localhost:5432/postgres`, sem usuário
  nem senha.
- `aiven` é uma URL pública (`https://mcp.aiven.live/mcp`), sem token.
- os outros não têm `env` nenhum.

## Como restaurar

1. Abra Configurações → MCP → Adicionar, um por vez.
2. Use `command` e `args` do bloco `transport` de cada servidor.
3. Para `chrome-devtools` e `aionui-browser`, **não recrie**: são embutidos do
   AionUi e a migração `ensureBootstrapMcpServersInDb` os semeia sozinha a cada
   boot.
4. `excel-mcp-server` e `lean-planning-mcp` não entram por importação em lote:
   o AionCore loga `skipping batch import for builtin MCP name` para esses
   dois. Pela tela, um a um, funciona.
