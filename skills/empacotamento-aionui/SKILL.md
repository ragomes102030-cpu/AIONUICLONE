---
name: empacotamento-aionui
description: "Regras verificadas para empacotar, instalar e diagnosticar o AionUi clone sem repetir erros conhecidos. Use ao rodar npm run dist:win / build-with-builder / prepare-aioncore, ao instalar ou atualizar o app no Windows, ao ler logs do processo principal, ao descobrir a porta da API, ou ao preparar o ambiente de testes (ABI nativa). Cobre: variável de compressão do electron-builder, resolução de caminhos extraResources, cache do Electron, instalação NSIS sobreposta, dual ABI do better-sqlite3, tsc verde que quebra o bundle, limite de 30s que mata build em background, AionCore local vs release do upstream, diagnóstico BOOTSTRAP_DATA_INIT_FAILED/database.newer_than_app, leitura de logs e armadilhas de teste. NÃO substitui a validação: sempre confira o artefato gerado por hash."
---

# Empacotamento e diagnóstico — AionUi clone

Tudo aqui foi **medido**, não deduzido. Cada item tem o sintoma real e a correção real.

---

## 0. Regras que quebram o build silenciosamente

### `ELECTRON_BUILDER_COMPRESSION_LEVEL` só aceita dígito 0–9

O empacotador lê o valor como número. Passar a palavra que está no YAML (`normal`) aborta o build:

```
⨯ ELECTRON_BUILDER_COMPRESSION_LEVEL must be a single digit 0-9, got: "normal"
```

**Não exporte essa variável.** O `build-with-builder.js` já define o valor correto. Exportar "por precaução" é o que causa a falha.

### `extraResources.from` resolve a partir da RAIZ DO PROJETO

Não a partir do arquivo de configuração. `packages/desktop/electron-builder.yml` é o config, mas a base é a pasta com `package.json`.

Como provar, sem chute: todas as entradas `from: resources/...` funcionam, e `packages/desktop/resources/` **não existe**. Já `from: ../../skills` aponta para `<pai-do-repo>/skills`, que não existe, e o electron-builder **pula em silêncio** — sem erro, e o diretório simplesmente não aparece no pacote.

**Regra: escreva `from` como relativo à raiz do projeto.** Depois do build, confira no disco:

```powershell
Test-Path out\win-unpacked\resources\<o-dir-que-deveria-ter>
```

Ausência silenciosa é o modo de falha padrão do empacotador.

### `electronDownload.cache` com variável não exportada cria pasta espúria

`cache: ${env.ELECTRON_CACHE}` sem a variável exportada vira um caminho **literal** chamado `${env.ELECTRON_CACHE}` na raiz do repo, e o Electron (~127 MB) é baixado toda build. Remova o campo; o empacotador usa o cache padrão e ainda respeita a variável quando ela existe (é assim que o CI usa).

### `tsc --noEmit` VERDE NÃO É BUILD VERDE

O typecheck passa e o bundle quebra. A superfície de tipos de um pacote pode ser um **superset** do que o entry point ESM realmente exporta — e o `tsc` não tem como detectar isso, porque ele só lê `.d.ts`.

Caso medido: `import { Option } from '@arco-design/web-react'`.

```
packages/.../kanban/index.tsx (24:2): "Option" is not exported by "@arco-design/web-react"
```

Mas `tsc --noEmit` retornou **exit 0** antes disso. Por quê, lendo o pacote:

```
declare const Option: <T extends OptionProps>(props) => JSX.Element   # existe como estático
Option: typeof Option;                                                # Select.Option
```

`Option` é membro **estático de `Select`**. O *namespace merging* faz `import { Option }` compilar, porque o `.d.ts` declara o nome no escopo do módulo. O JS de runtime só o expõe como `Select.Option`.

**Regra:** import nomeado só é seguro se o pacote de fato exporta o nome. Antes de confiar no typecheck, **confirme o padrão no repositório** — é mais rápido e mais confiável que confiar em `.d.ts`:

```powershell
Select-String -Path 'packages\desktop\src\**\*.tsx' -Pattern 'Select\.Option'
```

Este repo usa `<Select.Option>`. O build de 13 min é o custo de descobrir isso sozinho — e ele falha em ~25 s, na fase de bundle, muito antes de empacotar.

### O shell mata o que você dorme

Cada comando tem limite de ~30 s. Um `Start-Sleep 300` no mesmo comando que lançou o build estoura o limite, e o timeout derruba a **árvore de processos inteira** — incluindo o build que você jurou ter deixado rodando.

Foi assim que um build morreu às 15:53 sem `dist` e quase foi reportado como "ainda rodando" por mais dez minutos.

**Regra:** nunca durma no mesmo comando que lança trabalho longo. Lance desacoplado e volte depois:

```powershell
$b = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c','npm run dist:win > build.log 2>&1' `
  -WorkingDirectory (Get-Location).Path -WindowStyle Hidden -PassThru
```

`-Wait` também estoura o limite e mata o instalador; use o mesmo padrão.

**E prove que está vivo, não que não reclamou.** Um log que parou de crescer é ambiguo — empacotador bem-sucedido também para de escrever:

```powershell
Get-Process -Id $b.Id -ErrorAction SilentlyContinue   # VIVO  |  MORREU (ou TERMINOU)
```

Para build, o sinal de sucesso é a linha `✅ Build completed!` no log, não a ausência de erro. Para o instalador, é o `.exe` em `out\`.

> O instalador vai para `out\`, **não** `dist\`. Vigiar `dist` dá "sem exe" para sempre.

---

## 0.1 Onde o build falha mais cedo (economiza 13 min)

A ordem real é: **bundle do renderer → typecheck → empacotamento → NSIS**. Erro de bundle aparece em ~25 s; empacotamento leva 10+ min.

Se o build morrer cedo, leia o log **antes** de relançar:

```powershell
$c = Get-Content build.log -Encoding UTF8
$i = ($c | Select-String 'error during build' | Select-Object -First 1).LineNumber
$c[($i-1)..($i+8)]
```

Relançar sem ler transforma um erro de 5 segundos em 13 minutos.

---

## 1. Instalação no Windows

### Instalação silenciosa por cima de uma instalação existente NÃO substitui os arquivos

```
AionUi-2.2.2-win-x64.exe /S
```
O instalador valida a instalação existente (`registry-heal phase=valid-install-location`) e **sai sem copiar nada**. Não há erro visível. Diagnóstico em:

```
%TEMP%\aionui-installer-<versao>-<data>-log.jsonl   →  "installer-outdir-release" e nada depois
```

**Sempre desinstale antes** (preservando dados) e então instale:

```powershell
& "$env:LOCALAPPDATA\Programs\AionUi\Uninstall AionUi.exe" /S /KEEP_APP_DATA
Start-Process -FilePath ".\out\AionUi-<versao>-win-x64.exe" -ArgumentList '/S'
```

Os dados ficam em `%APPDATA%\AionUi`, fora da pasta de instalação — desinstalar não toca neles. Confirme mesmo assim:

```powershell
Test-Path "$env:APPDATA\AionUi\aionui\aionui-backend.db"
```

**Prova de que instalou de verdade:** compare o tamanho do `app.asar` instalado com o do build. Iguais ao build anterior significa que não substituiu:

```powershell
(Get-Item "$env:LOCALAPPDATA\Programs\AionUi\resources\app.asar").Length
(Get-Item ".\out\win-unpacked\resources\app.asar").Length
```

---

## 2. O AionCore do pacote tem que ser o binário local

O `prepare-aioncore.js` baixa por padrão a release do **upstream**. Se esse binário for anterior ao schema do banco, o app instalado se recusa a abrir os dados:

```
BOOTSTRAP_DATA_INIT_FAILED stage=database.newer_than_app
```

Por isso o `prepare-aioncore` prefere, nesta ordem: `AIONCORE_BIN_PATH` → checkout irmão `AionCore/target/release` → download. A preferência está **no prepare-aioncore**, não no build-with-builder, para valer para todos os chamadores.

**Sempre prove, comparando hash:**

```powershell
(Get-FileHash ".\resources\bundled-aioncore\win32-x64\aioncore.exe").Hash -eq
(Get-FileHash "C:\AIONUI0102\AionCore\target\release\aioncore.exe").Hash
```

O binário precisa estar no pacote: `resources/bundled-aioncore/<plataforma>-<arch>/aioncore.exe` **e** a pasta `managed-resources/`. Sem `managed-resources/`, o prepare cai no download de novo.


---

## 3. ABI do better-sqlite3: dois runtimes, um binário

O binário nativo é compilado para o runtime que vai carregá-lo. Testes rodam no Node, o app roda no Electron, e um não aceita o binário do outro.

```powershell
npm run native:node      # para rodar testes (vitest)
npm run native:electron  # para rodar o app
npm run native:status    # ver o estado
```

Erro típico: `ERR_DLOPEN_FAILED`. Não é bug de código — é o binário do runtime errado.

⚠️ **A build recompila os nativos para o Electron.** Depois de `dist:win`, `npm test` falha até rodar `native:node` de novo.

---

## 4. Diagnóstico do app rodando

### O log não vai para o stdout no app empacotado

Com o app instalado, `RedirectStandardOutput` pega quase nada — e grepar esse arquivo dá **verde falso**. O log de verdade:

```
%APPDATA%\AionUi\logs\<ano>\<mês>\<dia>.log
```

### Erros antigos convivem com os atuais no mesmo arquivo

O log é diário; um erro que aparece no arquivo pode ser de uma execução de horas atrás.

**Confira o timestamp da linha** antes de tratar como falha atual. Procurar `newer_than_app` no arquivo inteiro leva a conclusões erradas sobre o build recém-instalado.

### Descubra a porta da API; não assuma

```powershell
Get-NetTCPConnection -State Listen |
  Where-Object { $_.OwningProcess -in (Get-Process -Name 'aioncore','AionUi').Id } |
  Select-Object LocalPort
```

Com o app fechado a conexão é recusada — o que parece "API quebrada" e na verdade é "app parado".

### Linhas de verde que valem conferir no boot

```
[Migration] backend backup written: ...\backups\aionui-backend-<timestamp>.db
factory skills seeded: N new entries from ...\resources\factory-skills
Provider check: N provider(s) configured: ...
database initialized elapsed_ms=NN
```

---

## 5. Ambiente de teste

### Teste que deriva data de `Date.now()` quebra sozinho

Status derivado depende do calendário: janela de aviso (`dueSoonHours`) e recuo para dias úteis. O mesmo código passa hoje e falha amanhã, e o erro aponta para o teste, não para o produto.

**Fix: relógio fixo** (`const now = Date.UTC(2026, 8, 28, 12)`) e passe a janela explicitamente nas asserções.

### `process.pid` colide entre workers do vitest

Workers do pool compartilham o PID. Arquivo temporário com o PID no nome é aberto por dois processos ao mesmo tempo, e o Node derruba o worker com crash nativo (`RemoveEnvironmentCleanupHook`) — um crash que **não** parece falha de teste.

**Fix: `mkdtempSync` + UUID por execução**, limpando o diretório inteiro no `afterAll`.

### Antes de culpar seu código, faça A/B

```powershell
git checkout <commit-anterior> -- <arquivo>
node node_modules/vitest/vitest.mjs run <caminho-do-teste>
git checkout HEAD -- <arquivo>
```

Falha idêntica nos dois lados = pré-existente, não regressão sua.

### `node --check` não entende TypeScript

`node --check arquivo.ts` falha em `import`. Isso **não** é erro de sintaxe — não use como critério de aprovação de TS. Use o runner.


---

## 6. Limpeza de disco: nunca apague pasta do repo em bloco

```powershell
Remove-Item -Recurse -Force out,dist,release,patches   # ⚠️ patches é RASTREADO
```

Isso apagou `patches/7zip-bin@5.2.0.patch` (arquivo versionado) numa limpeza de artefatos. Recuperado com `git restore patches`.

**Antes de qualquer remoção recursiva:**

```powershell
git clean -ndx -- <caminho>    # dry-run: o que SERIA removido
git status --porcelain         # o que já mudou
```

Apague apenas o que o dry-run listar **e** o `git status` não reclamar.

---

## 7. Git e publicação

- **Push só com autorização explícita**, mesmo que o remote aponte para um repositorio do próprio usuário.
- Confira a URL antes: `origin` apontando para o upstream errado manda trabalho para o lugar errado.
- `origin` = escrita; `upstream` = somente leitura.
- Branch sem `upstream` configurado não tem como dar push acidental — é uma trava útil.
- Sem `gh` instalado e com `credential.helper = manager`, **push não é possível em sessão não interativa** (`fatal: Cannot prompt because user interactivity has been disabled`). Alternativa: chave SSH registrada no GitHub.
- Com `GIT_SSH_COMMAND`, use **barras normais** no caminho — barras invertidas são comidas pelo shell (`C:WindowsSystem32OpenS`).

---

## 8. Antes de dizer "pronto": os erros que eu já cometi

Esta seção é diferente das outras: as outras descrevem **o sistema**. Esta descreve **o meu comportamento**, que foi a fonte de quase todo defeito real encontrado.

### Teste sentado na borda de uma constante global

Mudei `KANBAN_DUE_SOON_HOURS` de 24 para 72, commitei e pushei **sem rodar a suíte**. Seis asserções quebraram em dois arquivos, todas com a mesma cara:

```
expected 'due_soon' to be 'scheduled'
```

Cinco delas fixavam "ainda está bem" a 25h, 30h, 40h ou **exatamente 72h**. Com a janela maior, todas passaram a `due_soon`.

O código estava certo. **Os testes é que estavam errados** — e estavam errados antes da minha mudança, só que a janela de 24h os escondia.

**Regra:** quando um teste valida "ainda bem" / "não atrasado" / "sem risco", ele **não pode depender de uma constante global**. Passe a constante explicitamente, ou posicione o caso com folga **fora** da janela.

```bash
# sempre que mexer numa constante usada por deriveScheduleStatus / isCardAtRisk:
Select-String -Path 'tests\**\*.ts' -Pattern "toBe\('scheduled'\)|toBe\('due_soon'\)|toBe\('in_progress'\)"
```

E a checagem que faltou: **rodar a suíte antes do commit**, não depois de achar o problema.

**Não corrija mudando o `Expected`.** Mudar a expectativa para `due_soon` faz o teste passar e deixa de testar a coisa que ele existe para testar.

### Afirmar antes de medir

Três vezes na mesma sessão falei como se tivesse medido, sem ter medido:

| eu disse | o que era |
| --- | --- |
| "está tudo bem com o clone" | o `tsc` **da raiz** acusava 3 erros num arquivo que eu tinha criado |
| "14 cartões duplicados" | 23 abertos viraram **15** — meu filtro incluía concluídos |
| "os 8 atrasados" | contagem com filtro diferente, sem avisar que mudou |

**Regra:** número que vai para a conversa sai de uma medição visível, com o filtro escrito. Se a contagem muda de uma frase para a outra, **diga isso**.

### Lixo de teste no dado do usuário

Três cartões que eu criei em verificação (`id` com prefixo `TESTE`, descrição "criado pelo teste ao vivo") ficaram **no quadro real**, contando como atraso, e eu só vi quando ele pediu melhorias.

**Regra:** dado de teste entra com identificador óbvio e **sai no mesmo dia**. Antes de dizer "está limpo", procure:

```bash
# dado de teste esquecido na base do usuario
Invoke-RestMethod -Uri 'http://127.0.0.1:<porta>/api/kanban/board' |
  Select-Object -ExpandProperty data | Select-Object -ExpandProperty cards |
  Where-Object { $_.id -like 'TESTE*' -or $_.description -match 'teste' } |
  Select-Object id, title
```

Nada de verificação deve write no banco de produção sem esse prefixo.

### Configuração do usuário que eu mudei sem pedir

Liguei `webui.desktop.enabled = true` para conseguir testar, e nunca mais mencionei. Ficou ligado — e é o que mantém o acesso remoto funcionando. Quem achar depois não sabe se foi escolha dele.

**Regra:** mudança de configuração do usuário vai para o resumo da sessão, **mesmo que pareça óbvia e útil**. "Liguei X para poder testar, continua ligado" é uma frase. Não falar nada é mentir por omissão.

### O padrão por trás de tudo

O defeito que se repetiu não foi técnico. Foi: **afirmar antes de verificar**, e **comprimir a verificação para ir mais rápido**. Nenhum dos quatro acima exige uma ferramenta nova — todos exigiriam um segundo de atenção.

---

## 9. Checklist antes de dizer "pronto"

```
[ ] SUÍTE RODADA depois da última mudança (não só o teste focado)
[ ] se mexi em constante usada por deriveScheduleStatus: procurei os
    testes que dependem dela e não deixei nenhum na borda
[ ] tsc da RAIZ, não só o do pacote que mexi (o desktop não pegou um erro
    que a raiz pegou)
[ ] npm run dist:win terminou com "✅ Build completed!"
[ ] log lido ANTES de qualquer relançamento (falha de bundle aparece em ~25 s)
[ ] instalação baixada de out\, não de dist\
[ ] out\win-unpacked\resources\factory-skills\ existe (e tem conteúdo)
[ ] hash do aioncore empacotado == hash do build local
[ ] nome removido no bundle = 0 ocorrências
[ ] app.asar instalado tem o MESMO tamanho do win-unpacked
[ ] desinstalado antes de instalar
[ ] boot do app instalado: "database initialized" e sem "newer_than_app"
[ ] log lido do arquivo diário, com timestamp da execução atual
[ ] npm run native:node antes de rodar testes
[ ] nenhum cartão/servidor de teste sobrando no dado do usuário
[ ] toda configuração que eu mudei está no resumo, com o estado atual
[ ] todo número que eu afirmei saiu de uma medição com filtro visível
[ ] git status limpo antes de qualquer commit
```

O item que mais falha é **o diretório que deveria estar no pacote**. Verifique no disco, não no YAML — o empacotador pula entrada inválida em silêncio.

O segundo é **`tsc` verde**. Typecheck não é build: ele lê `.d.ts`, e tipos mentem o que o runtime exporta. Import nomeado não usado em lugar nenhum do repo é sempre suspeito.

O terceiro — e o mais barato de todos — é **rodar a suíte antes do commit**. Leva segundos e é o que teria pego os 6 testes quebrados.

---

## 10. O que este clone corrige em relação ao upstream

Contexto para não "consertar" algo que já foi consertado de propósito:

| área | decisão do clone | por quê |
|---|---|---|
| AionCore do pacote | sempre o binário local | release do upstream é anterior ao schema deste fork |
| MCP semeados | só chrome-devtools + browser + image-gen | servidores de exemplo exigem pacote local/token e ficavam eternamente "desconectados"; e o bootstrap **reeseedeia** qualquer padrão ausente, então apagar pela tela não durava |
| Teste E2E do Kanban | relógio fixo + banco isolado | ver seção 5 |
| Backup do banco | antes de qualquer mutação, 1 a cada 6 h, mantém 10 | upgrade ruim era perda definitiva |

Convenção do repositório: **PT-BR no texto, inglês nos identificadores e nomes de função.** Comentário de código explica o *porquê*, não o *o quê*.
