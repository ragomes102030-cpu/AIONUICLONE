#!/usr/bin/env node
/**
 * Alterna o binÃ¡rio nativo do better-sqlite3 entre os ABIs usados no projeto.
 *
 * Por que existe: o mesmo mÃ³dulo nativo Ã© carregado por DOIS runtimes com
 * ABIs diferentes â€”
 *   â€¢ Electron 37 (Node 22.21.1 interno) â†’ NODE_MODULE_VERSION 136
 *   â€¢ Node 24 (vitest, scripts)           â†’ NODE_MODULE_VERSION 137
 * O repositÃ³rio guarda os dois binÃ¡rios compilados no cofre .native-abi/ e este
 * script apenas copia o da variante pedida para dentro do pacote instalado.
 *
 * Uso:
 *   node scripts/switch-native-abi.mjs status     (padrÃ£o)
 *   node scripts/switch-native-abi.mjs node       â†’ prepara para TESTES (ABI 137)
 *   node scripts/switch-native-abi.mjs electron   â†’ prepara para o APP/dev (ABI 136)
 *
 * Este script NÃƒO compila. Compilar exige toolchain MSVC e leva minutos; o
 * comando Ã© impresso quando o binÃ¡rio da variante solicitada nÃ£o existe.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VAULT = path.join(ROOT, '.native-abi');
const TARGET_REL = path.join(
  'node_modules',
  '.bun',
  'better-sqlite3@12.8.0',
  'node_modules',
  'better-sqlite3',
  'build',
  'Release',
  'better_sqlite3.node'
);
const TARGET = path.join(ROOT, TARGET_REL);

const NODE_ABI = 137; // Node 24 â€” vitest e scripts
const ELECTRON_ABI = 136; // Electron 37 â€” app empacotado e npm run dev

const VARIANTS = {
  node: { abi: NODE_ABI, file: 'better_sqlite3.node.node', label: 'Node (testes)' },
  electron: { abi: ELECTRON_ABI, file: 'better_sqlite3.node.electron', label: 'Electron (app/dev)' },
};

/** Detecta o ABI do binÃ¡rio instalado tentando carregÃ¡-lo no Node atual. */
function detectInstalled() {
  if (!fs.existsSync(TARGET)) return { state: 'ausente', abi: null };
  try {
    // carregar um .node isolado apenas inicializa o addon; Ã© o suficiente
    require_(TARGET);
    return { state: 'ok', abi: process.versions.modules };
  } catch (error) {
    const m = /NODE_MODULE_VERSION (\d+)/.exec(String(error.message));
    if (m) return { state: 'incompativel', abi: Number(m[1]) };
    return { state: 'desconhecido', abi: null, erro: String(error.message).split('\n')[0] };
  }
}

const VAULT_SOURCES = {
  node: [
    path.join(
      ROOT,
      'node_modules/.bun/better-sqlite3@12.8.0/node_modules/better-sqlite3/build/Release/better_sqlite3.node.abi137-node'
    ),
  ],
  electron: [
    path.join(
      ROOT,
      'out/win-unpacked/resources/app.asar.unpacked/node_modules/better-sqlite3/build/Release/better_sqlite3.node'
    ),
  ],
};

function seedVault(variant) {
  const dest = path.join(VAULT, VARIANTS[variant].file);
  if (fs.existsSync(dest)) return dest;
  for (const src of VAULT_SOURCES[variant]) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(VAULT, { recursive: true });
      fs.copyFileSync(src, dest);
      return dest;
    }
  }
  return null;
}

function tell(variant) {
  const v = VARIANTS[variant];
  console.log(`\n  BinÃ¡rio para "${variant}" (ABI ${v.abi}) nÃ£o encontrado no cofre .native-abi/.`);
  console.log('  Gere-o uma vez com o MSVC carregado:\n');
  console.log('    :: executa o prompt "x64 Native Tools Command Prompt for VS 2022" e rode:');
  console.log(`    cd /d "${path.join(ROOT, 'node_modules/.bun/better-sqlite3@12.8.0/node_modules/better-sqlite3')}"`);
  console.log('    node "..\\..\\..\\..\\..\\..\\node-gyp\\bin\\node-gyp.js" rebuild --release'.replace(/\\/g, '\\\\'));
  console.log(`    copy build\\Release\\better_sqlite3.node "${path.join(VAULT, v.file)}"\n`);
}

function status() {
  const d = detectInstalled();
  console.log('\n  better-sqlite3 â€” ABI nativo');
  console.log(`    destino : ${TARGET_REL}`);
  console.log(`    estado  : ${d.state}${d.abi !== null ? ` (ABI ${d.abi})` : ''}`);
  if (d.erro) console.log(`    erro    : ${d.erro}`);
  console.log('    cofre   :');
  for (const [k, v] of Object.entries(VARIANTS)) {
    const p = path.join(VAULT, v.file);
    console.log(`      ${k.padEnd(8)} ${fs.existsSync(p) ? 'disponivel (' + fs.statSync(p).size + ' B)' : 'AUSENTE'}`);
  }
  console.log('');
}

function switchTo(variant) {
  const v = VARIANTS[variant];
  let src = seedVault(variant);
  if (!src) return tell(variant);
  fs.mkdirSync(path.dirname(TARGET), { recursive: true });
  fs.copyFileSync(src, TARGET);

  // verificaÃ§Ã£o real: carregar o binÃ¡rio no runtime que vai usÃ¡-lo
  if (variant === 'node') {
    try {
      require_(TARGET);
      console.log(`\n  OK: better-sqlite3 pronto para TESTES (ABI ${NODE_ABI}).`);
      console.log('     pode rodar: npm test\n');
      return;
    } catch (e) {
      console.log(`\n  FALHOU ao validar para Node: ${String(e.message).split('\n')[0]}\n`);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`\n  OK: better-sqlite3 pronto para o APP (ABI ${ELECTRON_ABI}).`);
  console.log('     Electron 37 nÃ£o pode ser validado aqui; se o Kanban falhar,');
  console.log('     confira os logs do processo main.\n');
}

const arg = (process.argv[2] || 'status').toLowerCase();
if (arg === 'status') status();
else if (VARIANTS[arg]) switchTo(arg);
else {
  console.log(`\n  alvo invÃ¡lido: "${arg}". Use: node | electron | status\n`);
  process.exitCode = 2;
}
