#!/usr/bin/env node
/**
 * Publica uma nova versão do Arquimedes em um único comando.
 *
 * O que o script faz, na ordem:
 *   1. confere o estado do repositório (branch, working tree, gh autenticado);
 *   2. sobe a versão no package.json;
 *   3. compila o instalador do Windows;
 *   4. confere os artefatos (versão, sha512, endereço de atualização);
 *   5. commita e envia o bump de versão;
 *   6. publica a release no GitHub marcada como "Latest";
 *   7. verifica o feed de atualização como o app vai enxergar.
 *
 * Uso:
 *   npm run release                      -> sobe o patch (2.3.2 -> 2.3.3) e publica
 *   npm run release -- --version 2.4.0   -> publica uma versao especifica
 *   npm run release -- --dry-run         -> so mostra o plano, nao altera nada
 *   npm run release -- --skip-build      -> reaproveita o build que ja esta em out/
 *   npm run release -- --notes ARQ.md    -> usa um arquivo de notas proprio
 *   npm run release -- --verify-only     -> so revalida o feed ja publicado
 */

'use strict';

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_REPO = 'ragomes102030-cpu/ArquimedesPlanejamento';
const EXPECTED_FEED_MARKER = 'releases/latest/download';
const FORBIDDEN_FEED_MARKER = 'raw.githubusercontent.com/ragomes102030-cpu';

/**
 * Le do proprio codigo do app o endereco do feed de atualizacao.
 * Assim o script confere exatamente a URL que o app vai usar,
 * sem depender de uma copia desatualizada aqui.
 */
const readAppFeedBase = () => {
  const src = path.join(ROOT, 'packages', 'desktop', 'src', 'process', 'services', 'updateFeed.ts');
  const code = fs.readFileSync(src, 'utf8');
  const m = /https:\/\/github\.com\/([^'"\s]+)\/releases\/latest\/download/.exec(code);
  if (!m) fail(`nao encontrei a URL do feed em ${src}`);
  return { base: `https://github.com/${m[1]}/releases/latest/download`, repo: m[1] };
};

/* ------------------------------------------------------------------ utils */

const log = (msg = '') => console.log(msg);
const step = (n, total, msg) => console.log(`\n[${n}/${total}] ${msg}`);
const ok = (msg) => console.log(`      OK  ${msg}`);
const warn = (msg) => console.log(`      !!  ${msg}`);
const fail = (msg) => {
  console.error(`\nERRO: ${msg}\n`);
  process.exit(1);
};

const isWindows = process.platform === 'win32';
const BIN = (name) => (isWindows ? `${name}.cmd` : name);

/** Executa um comando e devolve { status, stdout, stderr }. Nunca lanca. */
const exec = (cmd, args, opts = {}) => {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: isWindows && !opts.noShell,
    windowsHide: true,
    ...opts,
  });
  return {
    status: res.status === null ? 1 : res.status,
    stdout: (res.stdout || '').toString(),
    stderr: (res.stderr || '').toString(),
  };
};

/** Executa um comando e aborta se ele falhar. */
const must = (cmd, args, opts = {}) => {
  const res = exec(cmd, args, opts);
  if (res.status !== 0) {
    fail(`comando falhou: ${cmd} ${args.join(' ')}\n${res.stderr || res.stdout}`);
  }
  return res.stdout;
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const opts = {
    version: null,
    dryRun: false,
    skipBuild: false,
    verifyOnly: false,
    notes: null,
    repo: DEFAULT_REPO,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--version' || arg === '-v') opts.version = argv[++i];
    else if (arg === '--notes' || arg === '-n') opts.notes = argv[++i];
    else if (arg === '--repo' || arg === '-r') opts.repo = argv[++i];
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--skip-build') opts.skipBuild = true;
    else if (arg === '--verify-only') opts.verifyOnly = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\*?/, '').replace(/^ \* ?/gm, ''));
      process.exit(0);
    } else fail(`opcao desconhecida: ${arg}`);
  }
  return opts;
};

const bumpPatch = (version) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!m) fail(`versao atual em formato inesperado: ${version}`);
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`;
};

const isSemver = (v) => /^\d+\.\d+\.\d+$/.test(v);

/* --------------------------------------------------------------- versao */

/** Troca a versao do package.json da raiz sem reescrever o arquivo inteiro. */
const writeVersion = (newVersion) => {
  const pkgPath = path.join(ROOT, 'package.json');
  const original = fs.readFileSync(pkgPath, 'utf8');
  const current = JSON.parse(original).version;
  if (current === newVersion) return { changed: false, previous: current };

  const marker = `"version": "${current}"`;
  if (!original.includes(marker)) {
    fail(`nao encontrei o campo de versao em package.json (esperado ${marker})`);
  }
  const updated = original.replace(marker, `"version": "${newVersion}"`);
  fs.writeFileSync(pkgPath, updated, 'utf8');
  return { changed: true, previous: current, path: pkgPath };
};

/* ------------------------------------------------------------ artefatos */

const sha512Base64 = (file) => {
  const hash = crypto.createHash('sha512');
  hash.update(fs.readFileSync(file));
  return hash.digest('base64');
};

const verifyArtifacts = (version) => {
  const outDir = path.join(ROOT, 'out');
  const exePath = path.join(outDir, `Arquimedes-${version}-win-x64.exe`);
  const ymlPath = path.join(outDir, 'latest.yml');

  if (!fs.existsSync(exePath)) {
    fail(`instalador ausente: ${exePath}\n   Rode sem --skip-build para compilar.`);
  }
  if (!fs.existsSync(ymlPath)) {
    fail(`metadados ausentes: ${ymlPath}\n   Rode sem --skip-build para compilar.`);
  }

  const exeSize = fs.statSync(exePath).size;
  if (exeSize < 50 * 1024 * 1024) {
    fail(`instalador suspeito (${exeSize} bytes). Esperado algo perto de 190 MB.`);
  }
  ok(`instalador: Arquimedes-${version}-win-x64.exe (${(exeSize / 1024 / 1024).toFixed(1)} MB)`);

  const yml = fs.readFileSync(ymlPath, 'utf8');
  const ymlVersion = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim();
  if (ymlVersion !== version) {
    fail(`latest.yml aponta para a versao "${ymlVersion}", mas estamos publicando "${version}".`);
  }
  ok(`latest.yml: version ${ymlVersion}`);

  const ymlSha = /sha512:\s*(\S+)/.exec(yml)?.[1];
  const realSha = sha512Base64(exePath);
  if (!ymlSha || ymlSha !== realSha) {
    fail(`sha512 do latest.yml nao confere com o instalador.\n   yml: ${ymlSha}\n   exe: ${realSha}`);
  }
  ok('sha512 do instalador confere com o latest.yml');

  const bundle = path.join(outDir, 'main', 'index.js');
  if (fs.existsSync(bundle)) {
    const code = fs.readFileSync(bundle, 'utf8');
    if (code.includes(FORBIDDEN_FEED_MARKER)) {
      fail(`o bundle ainda aponta para o endereco antigo (${FORBIDDEN_FEED_MARKER}). Refaca o build.`);
    }
    if (!code.includes(EXPECTED_FEED_MARKER)) {
      fail(`o bundle nao contem o endereco de atualizacao novo (${EXPECTED_FEED_MARKER}). Refaca o build.`);
    }
    ok('endereco de atualizacao do app conferido dentro do bundle');
  }

  return { exePath, ymlPath, exeSize };
};

/* -------------------------------------------------------------- notas */

const lastTag = () => {
  const res = exec('git', ['describe', '--tags', '--abbrev=0'], { noShell: true });
  return res.status === 0 ? res.stdout.trim() : null;
};

const buildNotes = (version, previousVersion) => {
  const tag = lastTag();
  const commits = tag
    ? exec('git', ['log', `--pretty=format:- %s`, `${tag}..HEAD`], { noShell: true }).stdout.trim()
    : '';

  const lines = [
    `## Arquimedes ${version}`,
    '',
    previousVersion
      ? `Atualizacao da **${previousVersion}** para a **${version}**.`
      : `Publicacao da **${version}**.`,
    '',
    '### O que mudou',
    '',
  ];

  if (commits) {
    lines.push(...commits.split('\n').map((c) => c.trim()).filter(Boolean));
  } else {
    lines.push('- Manutencao interna e correcoes.');
  }

  lines.push(
    '',
    '### Como atualizar pelo app',
    '',
    '1. Abra o Arquimedes - a checagem automatica roda ao abrir - ou va em',
    '   **Configuracoes -> Sobre -> "Verificar atualizacoes"**.',
    '2. Clique em **"Atualizar"**: o app baixa o instalador (~190 MB) e mostra o progresso.',
    '3. Clique em **"Instalar e reiniciar"**. Se preferir, basta **fechar o app**:',
    '   a instalacao e concluida ao sair.',
    '',
    '### Nota',
    '',
    'O instalador continua **sem assinatura digital**: o Windows mostra',
    '*"O Windows protegeu seu PC"* -> clique em **"Executar mesmo assim"**.',
    'Isso vale tanto para o download manual quanto para a atualizacao in-app.',
    ''
  );

  return lines.join('\n');
};

/* ------------------------------------------------------------ publicacao */

const publish = ({ version, exePath, ymlPath, repo, notesFile }) => {
  must('gh', [
    'release',
    'create',
    `v${version}`,
    exePath,
    ymlPath,
    '--repo',
    repo,
    '--target',
    'main',
    '--latest',
    '--title',
    `Arquimedes ${version}`,
    '--notes-file',
    notesFile,
  ]);
};

/* ------------------------------------------------------------ verificacao */

const verifyFeed = async (repo, version, feedBase) => {
  const base = feedBase || `https://github.com/${repo}/releases/latest/download`;

  const ymlRes = await fetch(`${base}/latest.yml`, { redirect: 'follow' });
  if (!ymlRes.ok) fail(`feed respondeu ${ymlRes.status} em ${base}/latest.yml`);
  const yml = await ymlRes.text();
  const feedVersion = /^version:\s*(.+)$/m.exec(yml)?.[1]?.trim();
  if (feedVersion !== version) {
    fail(`o feed aponta para a versao "${feedVersion}", esperava "${version}".`);
  }
  ok(`feed publica a versao ${feedVersion}`);

  const asset = /url:\s*(\S+)/.exec(yml)?.[1]?.trim();
  if (!asset) fail('latest.yml nao informa o arquivo do instalador.');

  const headRes = await fetch(`${base}/${asset}`, { method: 'HEAD', redirect: 'follow' });
  if (!headRes.ok) fail(`instalador respondeu ${headRes.status} no feed.`);
  const size = Number(headRes.headers.get('content-length') || 0);
  if (size < 50 * 1024 * 1024) fail(`instalador no feed veio com tamanho estranho: ${size} bytes.`);
  ok(`instalador no feed: ${asset} (${(size / 1024 / 1024).toFixed(1)} MB)`);

  const release = JSON.parse(
    must('gh', ['release', 'view', `v${version}`, '--repo', repo, '--json', 'tagName,url,isDraft,assets'], {
      noShell: true,
    })
  );
  if (release.isDraft) fail('a release foi criada como rascunho (draft) e o app nao a enxerga.');
  if (!release.assets?.length) fail('a release nao tem arquivos anexados.');
  ok(`release publicada: ${release.url}`);

  return release;
};

/* ------------------------------------------------------------------ main */

const main = async () => {
  const opts = parseArgs();
  const appFeed = readAppFeedBase();
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const currentVersion = pkg.version;

  log('');
  log('  Arquimedes - publicacao de nova versao');
  log('  ========================================');

  if (opts.verifyOnly) {
    const target = opts.version || currentVersion;
    await verifyFeed(opts.repo, target, appFeed.base);
    log('\n  Feed conferido. Tudo certo.\n');
    return;
  }

  const version = opts.version || bumpPatch(currentVersion);
  const repo = opts.repo;
  if (!isSemver(version)) fail(`versao invalida: ${version}`);
  if (version <= currentVersion && !opts.skipBuild) {
    fail(`a versao alvo (${version}) nao e maior que a atual (${currentVersion}).`);
  }

  const total = 7;
  step(1, total, 'Verificando o repositorio');

  const branch = must('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { noShell: true }).trim();
  if (branch !== 'main') fail(`a branch atual e "${branch}". Publique a partir de "main".`);
  ok('branch main');

  const dirty = must('git', ['status', '--porcelain'], { noShell: true }).trim();
  if (dirty) {
    fail(`ha alteracoes nao commitadas:\n${dirty}\n   Commit ou descarte antes de publicar.`);
  }
  ok('working tree limpa');

  const auth = exec('gh', ['auth', 'status'], { noShell: true });
  if (auth.status !== 0) fail('a gh CLI nao esta autenticada. Rode "gh auth login".');
  ok('gh CLI autenticada');

  if (appFeed.repo !== repo) {
    warn(`o app aponta para o repositorio "${appFeed.repo}" e o GitHub responde "${repo}".`);
    warn('(o repositorio foi renomeado; o endereco antigo continua funcionando por redirecionamento)');
  }

  const existing = exec('gh', ['release', 'view', `v${version}`, '--repo', repo], { noShell: true });
  if (existing.status === 0) fail(`a release v${version} ja existe. Escolha outra versao.`);
  ok(`v${version} ainda nao existe`);

  step(2, total, 'Preparando a versao');
  log(`      ${currentVersion}  ->  ${version}`);
  if (opts.dryRun) {
    ok('modo dry-run: nada sera alterado');
  }

  const previousVersion = currentVersion;
  let bump = { changed: false, previous: currentVersion };
  if (!opts.dryRun) {
    bump = writeVersion(version);
    ok(bump.changed ? `package.json atualizado para ${version}` : `package.json ja estava em ${version}`);
  }

  step(3, total, 'Compilando o instalador');
  if (opts.skipBuild) {
    warn('pulando o build (--skip-build): usando o que ja esta em out/');
  } else if (opts.dryRun) {
    warn('modo dry-run: build nao executado');
  } else {
    log('      (isso leva em torno de 13 minutos)\n');
    const build = exec(BIN('npm'), ['run', 'dist:win'], { stdio: 'inherit' });
    if (build.status !== 0) {
      if (bump.changed) writeVersion(bump.previous);
      fail('a compilacao falhou. O package.json foi restaurado.');
    }
    ok('build concluido');
  }

  step(4, total, 'Conferindo os artefatos');
  if (opts.dryRun) {
    warn('modo dry-run: verificacao de artefatos pulada');
  } else {
    const artifacts = verifyArtifacts(version);
    ok('artefatos conferidos');

    step(5, total, 'Enviando o bump de versao');
    must('git', ['add', 'package.json'], { noShell: true });
    must('git', ['commit', '-m', `chore: bump version to ${version}`], { noShell: true });
    must('git', ['push', 'origin', 'main'], { noShell: true });
    ok(`package.json em ${version} enviado para origin/main`);

    step(6, total, 'Publicando a release');
    const notesFile = path.join(os.tmpdir(), `arquimedes-release-notes-${version}.md`);
    const notes = opts.notes ? fs.readFileSync(path.resolve(ROOT, opts.notes), 'utf8') : buildNotes(version, previousVersion);
    fs.writeFileSync(notesFile, notes, 'utf8');
    publish({ version, exePath: artifacts.exePath, ymlPath: artifacts.ymlPath, repo, notesFile });
    ok(`release v${version} publicada e marcada como Latest`);

    step(7, total, 'Conferindo o feed de atualizacao');
    const release = await verifyFeed(repo, version, appFeed.base);

    log('');
    log('  --------------------------------------------------');
    log(`   Arquimedes ${version} publicado com sucesso`);
    log('  --------------------------------------------------');
    log(`   Release : ${release.url}`);
    log(`   Download: https://github.com/${repo}/releases/tag/v${version}`);
    log('');
    log('   Os usuarios ja instalados recebem a oferta de atualizacao');
    log('   ao abrir o app ou em Configuracoes -> Sobre -> "Verificar atualizacoes".');
    log('');
  }
};

main().catch((err) => {
  fail(err?.stack || String(err));
});
