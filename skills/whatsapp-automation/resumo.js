/**
 * Salva o resumo gerado pelo agente no historico da obra.
 *
 * Uso:
 *   node resumo.js --obra minha-obra --tipo diario --arquivo C:\temp\resumo.md
 *   node resumo.js --obra minha-obra --tipo semanal --texto "texto do resumo"
 *
 * O arquivo final fica em:
 *   C:\Arquimedes\obras\<obra>\whatsapp\resumo-<tipo>-AAAA-MM-DD.md
 */

const fs = require('fs');
const path = require('path');

const OBRAS_ROOT = process.env.ARQUIMEDES_OBRAS || 'C:\\Arquimedes\\obras';

function lerArgs(argv) {
  const opts = { obra: 'whatsapp', tipo: 'diario', arquivo: null, texto: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--obra') opts.obra = argv[++i];
    else if (a === '--tipo') opts.tipo = argv[++i];
    else if (a === '--arquivo') opts.arquivo = argv[++i];
    else if (a === '--texto') opts.texto = argv[++i];
  }
  return opts;
}

function dataDeHoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function main() {
  const opts = lerArgs(process.argv.slice(2));

  let texto = opts.texto;
  if (!texto && opts.arquivo) {
    texto = fs.readFileSync(opts.arquivo, 'utf8');
  }
  if (!texto) {
    console.log('Uso: node resumo.js --obra <obra> --tipo diario|semanal [--arquivo <file.md> | --texto "<resumo>"]');
    process.exit(1);
  }

  const dir = path.join(OBRAS_ROOT, opts.obra, 'whatsapp');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, `resumo-${opts.tipo}-${dataDeHoje()}.md`);
  fs.writeFileSync(arquivo, texto, 'utf8');

  console.log(`Resumo (${opts.tipo}) salvo em: ${arquivo}`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
