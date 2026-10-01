#Requires -Version 5.1
<#
.SYNOPSIS
  Recebe atualizacoes do upstream iOfficeAI sem perder as melhorias do clone.
.DESCRIPTION
  Fluxo seguro. Aborta (SEM forcar, SEM reset, SEM clean) no primeiro problema:
   1. exige arvore limpa
   2. cria branch backup-<data> + tag baseline-<data>
   3. backup do banco do usuario (%APPDATA%\AionUi)
   4. git fetch (so baixa, nao mexe no seu trabalho)
   5. mostra quantos commits novos vem E onde colidem com seus arquivos
   6. pede confirmacao
   7. git merge (conflito -> aborta, seu trabalho fica intacto)
   8. lint + testes focados (bootstrap + kanban/task)
   9. lembra do rebuild (dist:win) antes de instalar
.EXAMPLE
  .\scripts\upgrade-seguro.ps1
#>
[CmdletBinding()]
param(
  [string]$Remote = 'origin',
  [string]$Branch = 'main'
)

$ErrorActionPreference = 'Stop'
function Fail($msg) { Write-Host ''; Write-Host "ABORTADO: $msg" -ForegroundColor Red; exit 1 }
function Ok($msg) { Write-Host "  [ok] $msg" -ForegroundColor Green }

Set-Location (Split-Path -Parent $PSScriptRoot)

# 1. arvore limpa: merge com trabalho nao commitado e o jeito mais facil de perder coisa
$dirty = git --no-pager status --porcelain
if ($dirty) { Fail ("arvore suja. Commite ou stash antes:`n" + ($dirty -join "`n")) }
Ok 'arvore limpa'

# 2. marcos: com eles, qualquer coisa e reversivel e comparavel
$d = Get-Date -Format 'yyyyMMdd-HHmm'
git branch "backup-$d" | Out-Null
git tag -a "baseline-$d" -m "Antes do upgrade: $Remote/$Branch em $d"
Ok "branch backup-$d + tag baseline-$d"

# 3. backup do banco do usuario (dados, nao codigo)
$appDb = Join-Path $env:APPDATA 'AionUi\aionui\aionui-backend.db'
$logDir = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'auditoria\_logs'
if (Test-Path $appDb) {
  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory $logDir | Out-Null }
  Copy-Item $appDb (Join-Path $logDir "backup-pre-upgrade-$d.db") -Force
  Copy-Item "$appDb-wal" (Join-Path $logDir "backup-pre-upgrade-$d.db-wal") -Force -ErrorAction SilentlyContinue
  Ok "backup do banco: auditoria/_logs/backup-pre-upgrade-$d.db"
} else { Write-Host '  [pulou] banco do usuario nao encontrado' }

# 4. fetch: so baixa, nao toca no seu trabalho
git fetch $Remote $Branch
if ($LASTEXITCODE -ne 0) { Fail "fetch $Remote/$Branch falhou (rede? remote?). Nada foi alterado." }
$fetchHead = (git rev-parse FETCH_HEAD).Trim()
Ok "fetch $Remote/$Branch -> $($fetchHead.Substring(0, 12))"

# 5. impacto: o que vem, e onde colide com seus arquivos
$new = [int](git rev-list --count 'HEAD..FETCH_HEAD')
Write-Host "  commits novos no upstream: $new"
$mine = @(
  'packages/shared-scripts/src/prepare-aioncore.js',
  'scripts/build-with-builder.js',
  'packages/desktop/electron-builder.yml',
  'package.json',
  'packages/desktop/src/process/utils/runBackendMigrations.ts',
  'tests/unit/process/task/kanban-e2e-atividades.test.ts',
  'packages/desktop/src/renderer/pages/kanban/kanbanHttp.ts',
  'mcp.config.json'
)
$hits = git --no-pager log --format='%h %s' 'HEAD..FETCH_HEAD' -- $mine
if ($hits) {
  Write-Host '  ATENCAO: o upstream tocou nos mesmos arquivos das suas melhorias:' -ForegroundColor Yellow
  $hits | ForEach-Object { Write-Host "    $_" }
} else { Ok 'nenhuma colisao com os arquivos das suas melhorias' }

# 6. confirmacao: sem "sim", nada acontece
if ($new -eq 0) { Write-Host 'Nada novo no upstream. Fim.'; exit 0 }
$r = Read-Host "`nMesclar $new commits do upstream na sua branch? (S/N)"
if ($r -notin @('S', 's', 'sim', 'SIM', 'y', 'Y')) { Write-Host 'Cancelado. Seu trabalho esta intacto.'; exit 0 }

# 7. merge: conflito -> aborta, voce resolve a mao com calma
git merge --no-edit FETCH_HEAD
if ($LASTEXITCODE -ne 0) {
  git merge --abort
  Fail "conflito no merge. Merge ABORTADO, seu trabalho esta intacto. Resolva a mao com: git merge FETCH_HEAD"
}
Ok 'merge aplicado'

# 8. prova: se o merge quebrou algo, voce descobre agora, nao no instalador
npx oxlint packages/desktop/src/process/utils/runBackendMigrations.ts packages/shared-scripts/src/prepare-aioncore.js
if ($LASTEXITCODE -ne 0) { Fail 'lint falhou apos o merge. Reverta com o backup se precisar.' }
Ok 'lint'
node node_modules/vitest/vitest.mjs run tests/unit/bootstrap/runBackendMigrations.test.ts tests/unit/process/task/ --reporter=dot
if ($LASTEXITCODE -ne 0) { Fail ('testes falharam apos o merge. Compare: git diff baseline-' + $d + ' --stat') }
Ok 'testes focados (bootstrap + kanban/task)'

# 9. resumo: o upgrade so vira app depois do rebuild
Write-Host ''
Write-Host 'UPGRADE CONCLUIDO. Nao instale ainda:' -ForegroundColor Green
Write-Host ('  1. revise o que entrou: git diff baseline-' + $d + ' --stat')
Write-Host '  2. reconstrua: npm run dist:win'
Write-Host '  3. desinstale o antigo primeiro (Uninstall /S /KEEP_APP_DATA), depois instale'
Write-Host '  4. fumaca: abra o app, confira "database initialized" no log e os 3 MCPs'
