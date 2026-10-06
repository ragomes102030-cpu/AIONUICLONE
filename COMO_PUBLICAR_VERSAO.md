# Como publicar uma nova versão do AionUi clone

Passo a passo para publicar sem depender de mim. Testado no ciclo real de 06/10/2026 (v2.2.2).

---

## Resumo em 4 linhas

```bash
git push origin main                                    # sobe o código
# espera ~10 min: GitHub compila sozinho
gh run download <run-id> -R ragomes102030-cpu/AIONUICLONE -n AionUi-Windows-Installer
gh release create vX.Y.Z <instalador> <latest.yml> --repo ragomes102030-cpu/AIONUICLONE --target main
```

Se algum passo falhar, leia "Quando algo dá errado" no fim.

---

## O que o GitHub faz e o que ele NÃO faz

| | |
|---|---|
| ✅ Compila sozinho quando você faz `git push` | `Build Windows Installer` dispara automaticamente |
| ✅ Deixa o instalador pronto na aba **Actions** | baixa como artifact, expira em ~90 dias |
| ❌ **Não publica a release sozinho** | publicar é passo manual, seu |

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
gh run list -R ragomes102030-cpu/AIONUICLONE --limit 3
```

### 3. Só siga se a build deu certo

```bash
gh run list -R ragomes102030-cpu/AIONUICLONE --limit 1
```

Precisa aparecer `completed/success`. Se aparecer `failure`, **pare** — não publique. Abra o run e veja o log:

```bash
gh run view <run-id> -R ragomes102030-cpu/AIONUICLONE --log-failed
```

### 4. Baixe o instalador

Primeiro descubra o número do run:

```bash
gh run list -R ragomes102030-cpu/AIONUICLONE --limit 1 --json databaseId -q '.[0].databaseId'
```

Depois baixe (use caminho **nativo** com `cygpath -m`, senão o `gh` não acha o arquivo):

```bash
gh run download <run-id> -R ragomes102030-cpu/AIONUICLONE -n AionUi-Windows-Installer -D "C:/temp/aionui-rel"
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
gh release create vX.Y.Z "C:/temp/aionui-rel/AionUi-X.Y.Z-win-x64.exe" "C:/temp/aionui-rel/latest.yml" \
  --repo ragomes102030-cpu/AIONUICLONE \
  --target main \
  --title "AionUi X.Y.Z (clone de distribuicao)" \
  --notes "BUILD: <sha-curto>. tsc limpo."
```

> **Atenção:** o `gh` **não** entende caminhos no formato `/tmp/...` ou `/c/Users/...`. Sempre paths nativos com `C:/...`. Se aparecer `no matches found for /tmp/...`, é isso.

### 7. Confirme que está no ar

```bash
gh api repos/ragomes102030-cpu/AIONUICLONE/releases --jq '.[0] | "tag=\(.tag_name) assets=\([.assets[]|"\(.name) \(.size)B"]|join(" | "))"'
```

Os dois assets devem aparecer com `state=uploaded`: o `.exe` e o `latest.yml`.

Teste o download **sem** token, que é como o cliente faz:

```bash
curl -sL -o /dev/null -w "exe: HTTP %{http_code}\n" https://github.com/ragomes102030-cpu/AIONUICLONE/releases/download/vX.Y.Z/AionUi-X.Y.Z-win-x64.exe
```

`HTTP 200` ou `HTTP 206` = funcionando.

### 8. O que acontece a seguir

- O `release-distribute.yml` dispara sozinho quando a release é publicada.
- Clientes que já têm o app instalado com a versão anterior **passam a ver a atualização sozinhos**.
- Teste com uma conta limpa antes de avisar o cliente.

---

## O que o cliente vê na hora de atualizar

Ele abre *Configurações → Atualizações*, o app procura a versão no **seu** repositório e baixa. Não há como ele receber a versão do AionUi oficial — confirmei que os quatro pontos de atualização (dois em `updateBridge.ts`, um em `updateFeed.ts`, um em `electron-builder.yml`) apontam todos para `ragomes102030-cpu/AIONUICLONE`.

**Aviso do Windows:** o instalador não é assinado. O cliente vai ver a janela azul *"O Windows protegeu seu PC"* e precisa clicar em **"Executar mesmo assim"**. Isso está escrito nas notas da release. Se quiser avisar antes, diga isso ao cliente na mensagem de entrega.

---

## Quando algo dá errado

| Sintoma | Causa | Correção |
|---|---|---|
| `no matches found for /tmp/...` | `gh` não entende path MSYS | Use path nativo `C:/...` |
| `ELECTRON_BUILDER_COMPRESSION_LEVEL must be a single digit` | Você exportou essa variável | **Não exporte.** O `build-with-builder.js` já define |
| Instalador sem as skills | `from` no `electron-builder.yml` relativo ao arquivo, não à raiz | `from` é relativo à pasta com `package.json`. Confira no disco depois do build |
| Build falha com `TS2304` (import não encontrado) | `tsc` não roda antes | `bun run tsc --noEmit` antes de empacotar |
| Build morre sem erro claro | Estouro de memória | O script já usa `--max-old-space-size=8192`; em máquina fraca use `dist:win` com `ELECTRON_BUILDER_COMPRESSION_LEVEL=1` |
| Cliente não recebe a atualização | Nenhuma release publicada | `gh api repos/.../releases` — precisa listar ao menos 1 |
| Cliente vê versão antiga | Versão do `latest.yml` menor que a dele | Confira o campo `version:` no `latest.yml` |

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
bun run dist:win                                  # gera out/AionUi-X.Y.Z-win-x64.exe
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
- [ ] download público responde 200/206
- [ ] **instalado numa conta limpa, conferiu que as 71 skills aparecem**
- [ ] cliente avisado do aviso do Windows

O item do meio é o que já salvou uma entrega: as 17 skills de engenharia estavam sendo empacotadas e descartadas, e só apareceu testando a instalação de verdade.
