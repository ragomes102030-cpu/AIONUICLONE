# Como publicar uma nova versão do Arquimedes

Passo a passo para publicar sem depender de mim. Testado no ciclo real de 06/10/2026 (v2.2.2).

> **Regra de ouro (v2.3.2+):** a release precisa ser publicada com a flag `--latest`.
> É isso que faz o botão **"Verificar atualizações"** dentro do app encontrar a versão nova.

---

## Jeito mais rápido: um comando só (v2.3.2+)

O repositório tem um script que faz o trabalho inteiro por você: sobe a versão, compila,
confere os arquivos, publica a release marcada como "Latest" e valida o feed de atualização.

```bash
npm run release                 # 2.3.2 -> 2.3.3 (bump de patch), compila e publica
npm run release -- --version 2.4.0   # escolhe a próxima versão
npm run release:dry             # só mostra o plano, não compila nem publica
npm run release:verify          # só confere se o feed está no ar e correto
```

O que ele faz, na ordem:

1. **Confere os pré-requisitos** — branch `main`, árvore de trabalho limpa, `gh` autenticada,
   e se a release/tag ainda não existe.
2. **Sobe a versão** no `package.json` da raiz (é de lá que sai o nome do instalador).
3. **Compila** o instalador do Windows (`npm run dist:win`, ~13 min).
4. **Verifica os artefatos** — o `.exe` existe, o `latest.yml` aponta para a versão certa,
   o `sha512` do `.yml` bate com o hash do `.exe`, e o pacote **não** contém mais o
   endereço de atualização antigo (guarda contra regressão).
5. **Commita e sobe** a alteração da versão.
6. **Publica a release** com `--latest` e notas montadas automaticamente.
7. **Confere o feed** — baixa o `latest.yml` do endereço que está gravado no app e testa
   o download do instalador.

Opções extras: `--skip-build` (usa o build que já está em `out/`), `--notes <arquivo>`
(usa as suas próprias notas), `--repo <owner/nome>`.

> **Sobre o nome do repositório:** ele foi renomeado para `ArquimedesPlanejamento`.
> O endereço antigo ainda redireciona no GitHub, mas o app, o script e os guias
> usam já o nome novo — assim o atualizador não depende de redirecionamento.

---

## Resumo em 4 linhas

```bash
npm run release                                      # bump de patch + build + publica + confere
# ou, na mão:
gh release create vX.Y.Z <instalador> <latest.yml> --repo ragomes102030-cpu/ArquimedesPlanejamento --target main --latest
```

Se algum passo falhar, leia "Quando algo dá errado" no fim.

---

## Atualizar pelo próprio app (in-app)

A partir da **v2.3.2** o app se atualiza sozinho, sem o usuário baixar nada:

1. Ao abrir, o app procura versão nova (checagem silenciosa).
2. Ou o usuário vai em **Configurações → Sobre → "Verificar atualizações"**.
3. Aparece o cartão de atualização: o app **baixa** o instalador (~190 MB) e mostra o progresso.
4. O usuário clica em **"Instalar e reiniciar"** (ou simply fecha o app: `autoInstallOnAppQuit` = ligado, a instalação acontece ao sair).

**Como isso funciona por baixo:** o app lê o arquivo de metadados `latest.yml` e o instalador direto da **release marcada como "Latest"** do GitHub:

```
https://github.com/ragomes102030-cpu/ArquimedesPlanejamento/releases/latest/download/latest.yml
https://github.com/ragomes102030-cpu/ArquimedesPlanejamento/releases/latest/download/Arquimedes-X.Y.Z-win-x64.exe
```

Consequências práticas:

- A release nova **precisa** ser publicada com `--latest` — sem isso o app continua enxergando a versão antiga.
- O `latest.yml` e o `.exe` precisam ser os **dois** assets da mesma release, com o nome do instalador exatamente igual ao do `latest.yml` (`url:` do `latest.yml` = nome do asset).
- O `sha512` do `latest.yml` tem que bater com o do `.exe` — se não bater, a instalação é recusada por segurança.
- Não é preciso hospedar nada: o feed aponta para o GitHub Releases, sem binário dentro do repositório.

Teste do feed a qualquer momento (sem instalar):

```bash
curl -sL https://github.com/ragomes102030-cpu/ArquimedesPlanejamento/releases/latest/download/latest.yml
```

Se aparecer `version: 2.3.2` (ou superior), o botão do app vai encontrar.

> **Windows:** o instalador não é assinado. Vai aparecer a janela azul *"O Windows protegeu seu PC"* → clique em **"Executar mesmo assim"**. Isso vale tanto para o download manual quanto para a atualização in-app.

---

## O que o GitHub faz e o que ele NÃO faz

|                                                 |                                                   |
| ----------------------------------------------- | ------------------------------------------------- |
| ✅ Compila sozinho quando você faz `git push`   | `Build Windows Installer` dispara automaticamente |
| ✅ Deixa o instalador pronto na aba **Actions** | baixa como artifact, expira em ~90 dias           |
| ❌ **Não publica a release sozinho**            | publicar é passo manual, seu                      |

Isso é proposital: uma build quebrada nunca chega ao cliente sem você ver.

---

## Passo a passo

### 1. Confirme que está tudo no GitHub

```bash
cd "C:\AIONUI0102\AionUi clone"
git status                                    # precisa estar limpa
git log --oneline -3
```

Se `git status` mostrar arquivos modificados que você não reconhece, **não continue** — commite ou descarte primeiro.

### 2. Suba o código

```bash
git push origin main
```

O GitHub passa a compilar sozinho (~10 min). Acompanhe:

```bash
gh run list -R ragomes102030-cpu/ArquimedesPlanejamento --limit 3
```

### 3. Só siga se a build deu certo

```bash
gh run list -R ragomes102030-cpu/ArquimedesPlanejamento --limit 1
```

Precisa aparecer `completed/success`. Se aparecer `failure`, **pare** — não publique. Abra o run e veja o log:

```bash
gh run view <run-id> -R ragomes102030-cpu/ArquimedesPlanejamento --log-failed
```

### 4. Baixe o instalador

Primeiro descubra o número do run:

```bash
gh run list -R ragomes102030-cpu/ArquimedesPlanejamento --limit 1 --json databaseId -q '.[0].databaseId'
```

Depois baixe (use caminho **nativo** com `cygpath -m`, senão o `gh` não acha o arquivo):

```bash
gh run download <run-id> -R ragomes102030-cpu/ArquimedesPlanejamento -n AionUi-Windows-Installer -D "C:/temp/aionui-rel"
```

### 5. Verifique o instalador antes de publicar

```bash
cd "C:/temp/aionui-rel"
cat latest.yml
```

Confira se o `sha512` do `latest.yml` bate com o arquivo:

```powershell
(Get-FileHash AionUi-X.Y.Z-win-x64.exe -Algorithm SHA512).Hash
```

> Ignore a diferença de formato: o `latest.yml` usa base64, o PowerShell mostra hexadecimal. O que importa é que **não estejam vazios** e que a versão no `latest.yml` seja a que você quer publicar.

### 6. Publique a release

```bash
gh release create vX.Y.Z "C:/temp/aionui-rel/Arquimedes-X.Y.Z-win-x64.exe" "C:/temp/aionui-rel/latest.yml" \
  --repo ragomes102030-cpu/ArquimedesPlanejamento \
  --target main \
  --latest \
  --title "Arquimedes X.Y.Z" \
  --notes "BUILD: <sha-curto>. tsc limpo."
```

> **`--latest` é obrigatório.** Sem essa flag a release não vira a "Latest" e o app não enxerga a versão nova.
> O `gh` **não** entende caminhos no formato `/tmp/...` ou `/c/Users/...`. Sempre paths nativos com `C:/...`. Se aparecer `no matches found for /tmp/...`, é isso.

### 7. Confirme que está no ar

```bash
gh api repos/ragomes102030-cpu/ArquimedesPlanejamento/releases --jq '.[0] | "tag=\(.tag_name) assets=\([.assets[]|"\(.name) \(.size)B"]|join(" | "))"'
```

Os dois assets devem aparecer com `state=uploaded`: o `.exe` e o `latest.yml`.

Teste o download **sem** token, que é como o cliente faz:

```bash
curl -sL -o /dev/null -w "exe: HTTP %{http_code}\n" https://github.com/ragomes102030-cpu/ArquimedesPlanejamento/releases/download/vX.Y.Z/Arquimedes-X.Y.Z-win-x64.exe
curl -sL https://github.com/ragomes102030-cpu/ArquimedesPlanejamento/releases/latest/download/latest.yml
```

`HTTP 200` ou `HTTP 206` = funcionando. E o `latest.yml` tem que mostrar a versão que você acabou de publicar.

### 8. O que acontece a seguir

- O `release-distribute.yml` dispara sozinho quando a release é publicada (ele espelha para o S3 do AionUi oficial; sem as credenciais AWS ele falha, e isso **não** afeta o app — o app usa o GitHub Releases).
- Clientes que já têm o app instalado com a versão anterior **passam a ver a atualização sozinhos**.
- Teste com uma conta limpa antes de avisar o cliente.

---

## O que o cliente vê na hora de atualizar

Ele abre **Configurações → Sobre → "Verificar atualizações"** (ou espera a checagem automática ao abrir o app), e o app baixa e instala sozinho. Não há como ele receber a versão do AionUi oficial — o feed aponta para `ragomes102030-cpu/ArquimedesPlanejamento`.

**Aviso do Windows:** o instalador não é assinado. O cliente vai ver a janela azul _"O Windows protegeu seu PC"_ e precisa clicar em **"Executar mesmo assim"**. Isso está escrito nas notas da release. Se quiser avisar antes, diga isso ao cliente na mensagem de entrega.

---

## Quando algo dá errado

| Sintoma                                                     | Causa                                                            | Correção                                                                                                                |
| ----------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `no matches found for /tmp/...`                             | `gh` não entende path MSYS                                       | Use path nativo `C:/...`                                                                                                |
| `ELECTRON_BUILDER_COMPRESSION_LEVEL must be a single digit` | Você exportou essa variável                                      | **Não exporte.** O `build-with-builder.js` já define                                                                    |
| Instalador sem as skills                                    | `from` no `electron-builder.yml` relativo ao arquivo, não à raiz | `from` é relativo à pasta com `package.json`. Confira no disco depois do build                                          |
| Build falha com `TS2304` (import não encontrado)            | `tsc` não roda antes                                             | `bun run tsc --noEmit` antes de empacotar                                                                               |
| Build morre sem erro claro                                  | Estouro de memória                                               | O script já usa `--max-old-space-size=8192`; em máquina fraca use `dist:win` com `ELECTRON_BUILDER_COMPRESSION_LEVEL=1` |
| Cliente não recebe a atualização                            | Release publicada **sem** `--latest`                             | `gh release edit vX.Y.Z --latest` (ou publique de novo com a flag)                                                    |
| Cliente não recebe a atualização                            | Nenhuma release publicada                                        | `gh api repos/.../releases` — precisa listar ao menos 1                                                                 |
| Cliente vê versão antiga                                    | Versão do `latest.yml` menor que a dele                          | Confira o campo `version:` no `latest.yml`                                                                              |

---

## Regras que quebram o build silenciosamente

**Não exporte `ELECTRON_BUILDER_COMPRESSION_LEVEL`.** O `build-with-builder.js` já define o valor correto. Exportar "por precaução" é o que causa a falha.

**`extraResources.from` resolve a partir da RAIZ DO PROJETO**, não do arquivo de configuração. Se apontar para `<pai-do-repo>/skills`, o empacotador **pula em silêncio** — sem erro, e o diretório simplesmente não aparece no pacote. Depois do build, sempre confira:

```powershell
find out\win-unpacked\resources\factory-skills -name SKILL.md | wc -l
```

Hoje esse número é **71**. Se vier menos, algo quebrou.

**Não use `electronDownload.cache` com variável não exportada.** Vira caminho literal `${env.ELECTRON_CACHE}` na raiz e baixa ~127 MB toda build. O campo foi removido do `electron-builder.yml` de propósito.

---

## Opcional: empacotar no seu computador

O GitHub faz isso por você e é mais confiável. Só se precisar:

```bash
cd "C:\AIONUI0102\AionUi clone"
bun run tsc --noEmit                              # tem que sair limpo
bun run dist:win                                  # gera out/Arquimedes-X.Y.Z-win-x64.exe
```

Detalhe importante: empacotar no seu computador **troca** o binário nativo do `better-sqlite3` para a versão do Electron. Se depois rodar `bun run test`, os testes de banco vão falhar com `NODE_MODULE_VERSION`. Volte com:

```bash
bun run native:node
```

> No seu computador Node está na v26, e o `engines` do repo pede `>=22 <25`. Por isso os testes de banco falham mesmo assim. Não é defeito do código — é ambiente.

---

## Checklist antes de dizer "pronto para o cliente"

- [ ] `git status` limpo
- [ ] `tsc --noEmit` sem erro
- [ ] build no GitHub = `success`
- [ ] `latest.yml` com o `sha512` preenchido e a versão correta
- [ ] release publicada com os dois assets em `state=uploaded`
- [ ] release publicada **com `--latest`** (senão o app não enxerga)
- [ ] download público responde 200/206
- [ ] `curl -sL .../releases/latest/download/latest.yml` mostra a versão nova
- [ ] **instalado numa conta limpa, conferiu que as 71 skills aparecem**
- [ ] cliente avisado do aviso do Windows

O item do meio é o que já salvou uma entrega: as 17 skills de engenharia estavam sendo empacotadas e descartadas, e só apareceu testando a instalação de verdade.
