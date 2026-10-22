/**
 * Coleta o WhatsApp Web e prepara o material para o agente resumir.
 * Roda dentro da propria skill (sem depender do repo).
 *
 * Dois escopos:
 *   1) --chat <nome>  -> le as mensagens do chat aberto (modo por conversa)
 *   2) --global       -> le a LISTA de todas as conversas, sem abrir nenhuma
 *                        (nao marca nada como lida) - escopo global, vale para
 *                        qualquer conta que estiver conectada no Chrome.
 *
 * Uso:
 *   node coletar.js --obra minha-obra --chat PIAZZA
 *   node coletar.js --obra minha-obra --chat PIAZZA --saida C:\temp\msgs.json
 *   node coletar.js --obra minha-obra --chat PIAZZA --prompt C:\temp\prompt.txt
 *   node coletar.js --obra minha-obra --global --prompt C:\temp\prompt.txt
 *
 * Saida:
 *   - modo chat:   C:\Arquimedes\obras\<obra>\whatsapp\mensagens-AAAA-MM-DD.json
 *   - modo global: C:\Arquimedes\obras\<obra>\whatsapp\chats-AAAA-MM-DD.json
 *   - com --prompt, grava tambem o prompt pronto para o agente resumir
 *   - imprime no stdout o prompt pronto para o agente resumir
 */

const path = require('path');
const fs = require('fs');

const { lerMensagens, montarTextoParaAgente, salvarJson, conectar } = require('./cdp-client');
const { detectarConta, lerListaChats, lerConfig, descobrirDataDir } = require('./station-core');

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

const PROMPT_RESUMO_GLOBAL = [
  'Resuma o panorama de WhatsApp abaixo (todas as conversas da conta conectada).',
  'A lista traz, por conversa: nome, horario da ultima mensagem, previa da ultima mensagem e quantas mensagens nao lidas.',
  'Responda em secoes:',
  '(1) O QUE FOI SOLICITADO - pedidos concretos que aparecem nas previas, com a conversa e o horario;',
  '(2) QUEM PEDIU - agrupado por pessoa;',
  '(3) PENDENCIAS - conversas com mensagens nao lidas que parecem pedir acao, com quantas faltam;',
  '(4) CONCLUIDO - o que aparenta estar resolvido (previa com confirmacao);',
  '(5) SEM PEDIDO - apenas o nome das demais conversas, sem detalhar.',
  'Priorize conversa de obra, suprimentos, material, pedido de insumo, prazo e entrega.',
  'Nao invente: use apenas o que aparece nas previas. Se nao houver pedido concreto, diga apenas "Sem solicitacoes no periodo".',
].join(' ');

function lerArgs(argv) {
  // Os padroes vem da configuracao da estacao (numero do cliente), quando ela
  // existe. Sem configuracao, nada fica preso a um chat nem a um numero.
  let cfg = {};
  try {
    cfg = lerConfig(descobrirDataDir(null)) || {};
  } catch {
    cfg = {};
  }
  const opts = {
    obra: cfg.obraPadrao || 'whatsapp',
    chat: cfg.chatPadrao || null,
    saida: null,
    prompt: null,
    global: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--obra') opts.obra = argv[++i];
    else if (a === '--chat') opts.chat = argv[++i];
    else if (a === '--saida') opts.saida = argv[++i];
    else if (a === '--prompt') opts.prompt = argv[++i];
    else if (a === '--global' || a === '--todos') opts.global = true;
  }
  return opts;
}

function dataDeHoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Monta o texto da lista de conversas para o agente. */
function montarListaParaAgente(conta, lista) {
  const linhas = [];
  const origem = conta && conta.nome ? conta.nome : 'conta conectada';
  linhas.push(`Conta conectada: ${origem}`);
  if (conta && conta.identificador) linhas.push(`Identificador da sessao: ${conta.identificador}`);
  linhas.push(`Conversas visiveis na lista: ${lista.total}`);
  linhas.push('');
  for (const c of lista.chats) {
    const naoLidas = c.naoLidas ? `[${c.naoLidas} nao lidas]` : '';
    linhas.push(`${naoLidas} ${c.titulo} (${c.hora || 'sem hora'}): ${c.preview || '(sem previa)'}`);
  }
  return linhas.join('\n');
}

/**
 * Escopo global: le a lista de todas as conversas sem abrir nenhuma.
 * Nao marca nada como lida e vale para qualquer conta conectada.
 */
async function coletarGlobal(opts) {
  console.log('Conectando no Chrome (CDP 127.0.0.1:9222) e lendo a lista de conversas...');
  const c = await conectar();
  try {
    const wsUrl = c.alvo && c.alvo.webSocketDebuggerUrl;
    const conta = await detectarConta(wsUrl);
    const lista = await lerListaChats(wsUrl);
    if (!lista.chats.length) throw new Error('nenhuma conversa encontrada na lista');

    const dir = path.join(OBRAS_ROOT, opts.obra, 'whatsapp');
    fs.mkdirSync(dir, { recursive: true });
    const arquivo = opts.saida || path.join(dir, `chats-${dataDeHoje()}.json`);

    salvarJson(arquivo, {
      extraidoEm: new Date().toISOString(),
      escopo: 'global',
      conta: { nome: conta.nome, identificador: conta.identificador, avatar: conta.avatar },
      total: lista.total,
      chats: lista.chats,
    });

    const prompt = `${PROMPT_RESUMO_GLOBAL}\n\n--- LISTA DE CONVERSAS (conta conectada) ---\n${montarListaParaAgente(conta, lista)}`;

    let promptFile = null;
    if (opts.prompt) {
      promptFile = path.resolve(opts.prompt);
      fs.mkdirSync(path.dirname(promptFile), { recursive: true });
      fs.writeFileSync(promptFile, prompt, 'utf8');
    }

    console.log('');
    console.log(`Conta conectada: ${conta.nome || '(nao identificada)'}`);
    console.log(`Conversas lidas: ${lista.chats.length}`);
    console.log(`Arquivo: ${arquivo}`);
    if (promptFile) console.log(`Prompt: ${promptFile}`);
    console.log('');
    console.log('--- PROMPT PARA O AGENTE ---');
    console.log(prompt);
    return { conta, lista, arquivo, prompt };
  } finally {
    c.fechar();
  }
}

async function main() {
  const opts = lerArgs(process.argv.slice(2));

  if (opts.global) {
    await coletarGlobal(opts);
    return;
  }

  console.log(`Conectando no Chrome (CDP 127.0.0.1:9222) e lendo o chat "${opts.chat}"...`);
  const { chat, mensagens } = await lerMensagens({ chat: opts.chat });

  const dir = path.join(OBRAS_ROOT, opts.obra, 'whatsapp');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = opts.saida || path.join(dir, `mensagens-${dataDeHoje()}.json`);

  salvarJson(arquivo, {
    extraidoEm: new Date().toISOString(),
    escopo: 'conversa',
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

module.exports = { main, PROMPT_RESUMO, PROMPT_RESUMO_GLOBAL, coletarGlobal, montarListaParaAgente };
