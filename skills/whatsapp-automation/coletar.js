/**
 * Coleta as mensagens visiveis do WhatsApp Web e prepara o material para o
 * agente resumir. Roda dentro da propria skill (sem depender do repo).
 *
 * Uso:
 *   node coletar.js --obra minha-obra --chat PIAZZA
 *   node coletar.js --obra minha-obra --chat PIAZZA --saida C:\temp\msgs.json
 *   node coletar.js --obra minha-obra --chat PIAZZA --prompt C:\temp\prompt.txt
 *
 * Saida:
 *   - grava C:\Arquimedes\obras\<obra>\whatsapp\mensagens-AAAA-MM-DD.json
 *   - com --prompt, grava tambem o prompt pronto para o agente resumir
 *   - imprime no stdout o prompt pronto para o agente resumir
 */

const path = require('path');
const fs = require('fs');

const { lerMensagens, montarTextoParaAgente, salvarJson } = require('./cdp-client');

const OBRAS_ROOT = process.env.ARQUIMEDES_OBRAS || 'C:\\Arquimedes\\obras';

const PROMPT_RESUMO = [
  'Resuma as mensagens abaixo de um grupo de obra.',
  'Liste em secoes:',
  '(1) O QUE FOI SOLICITADO - cada pedido, com o autor e a data/hora;',
  '(2) QUEM PEDIU - agrupado por pessoa;',
  '(3) PENDENCIAS - o que ficou aberto, com quem esta;',
  '(4) CONCLUIDO - o que ja foi resolvido ou confirmado.',
  'Ignore mensagens de saudacao, figurinha e confirmacao de leitura.',
  'Se nao houver pedido concreto, diga apenas "Sem solicitacoes no periodo".',
].join(' ');

function lerArgs(argv) {
  const opts = { obra: 'whatsapp', chat: 'PIAZZA', saida: null, prompt: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--obra') opts.obra = argv[++i];
    else if (a === '--chat') opts.chat = argv[++i];
    else if (a === '--saida') opts.saida = argv[++i];
    else if (a === '--prompt') opts.prompt = argv[++i];
  }
  return opts;
}

function dataDeHoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function main() {
  const opts = lerArgs(process.argv.slice(2));

  console.log(`Conectando no Chrome (CDP 127.0.0.1:9222) e lendo o chat "${opts.chat}"...`);
  const { chat, mensagens } = await lerMensagens({ chat: opts.chat });

  const dir = path.join(OBRAS_ROOT, opts.obra, 'whatsapp');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = opts.saida || path.join(dir, `mensagens-${dataDeHoje()}.json`);

  salvarJson(arquivo, {
    extraidoEm: new Date().toISOString(),
    chat: chat || opts.chat,
    total: mensagens.length,
    mensagens,
  });

  const prompt = `${PROMPT_RESUMO}\n\n--- MENSAGENS (${chat || opts.chat}) ---\n${montarTextoParaAgente(mensagens)}`;

  // Grava o prompt em arquivo: o console do Windows pode trocar acentos e
  // emojis por mojibake. Quem lê o prompt de forma confiavel usa o arquivo.
  let promptFile = null;
  if (opts.prompt) {
    promptFile = path.resolve(opts.prompt);
    fs.mkdirSync(path.dirname(promptFile), { recursive: true });
    fs.writeFileSync(promptFile, prompt, 'utf8');
  }

  console.log('');
  console.log(`Mensagens lidas: ${mensagens.length}`);
  console.log(`Arquivo: ${arquivo}`);
  if (promptFile) console.log(`Prompt: ${promptFile}`);
  console.log('');
  console.log('--- PROMPT PARA O AGENTE ---');
  console.log(prompt);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { main, PROMPT_RESUMO };
