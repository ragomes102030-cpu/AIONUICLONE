/**
 * Skill WhatsApp Automação (Arquimedes).
 *
 * Fachada para as tarefas agendadas e para o agente: lê as mensagens do WhatsApp
 * Web via Chrome/CDP, monta o texto para o agente resumir e organiza o
 * armazenamento por obra.
 *
 * ⚠️ AVISO: leia os avisos em SKILL.md antes de usar.
 *    - não use número pessoal (use chip dedicado da empresa)
 *    - apenas leitura e resumo; envio é opt-in em scripts/whatsapp-enviar.js
 *    - não é API oficial do WhatsApp; usa CDP
 *    - o Chrome precisa ficar aberto e logado
 */

const fs = require('fs');
const path = require('path');

const { lerMensagens, montarTextoParaAgente } = require('../../scripts/whatsapp-cdp-client-wrapper');

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

function pastaDaObra(obra) {
  const dir = path.join(OBRAS_ROOT, obra, 'whatsapp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dataDeHoje() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Coleta as mensagens visíveis do chat aberto e salva no histórico da obra.
 * @param {object} opts
 * @param {string} opts.obra      pasta da obra (ex.: 'minha-obra')
 * @param {string} [opts.chat]     nome do chat/grupo
 * @param {string} [opts.agente]   nome do agente que fará o resumo
 * @returns {Promise<{ok:boolean, total:number, arquivo:string, prompt:string}>}
 */
async function coletarEPreparar(opts = {}) {
  const obra = opts.obra || 'whatsapp';
  const chat = opts.chat || 'PIAZZA';
  const agente = opts.agente || 'Hermes';

  const mensagens = await lerMensagens({ chat });
  const dir = pastaDaObra(obra);
  const arquivo = path.join(dir, `mensagens-${dataDeHoje()}.json`);

  fs.writeFileSync(
    arquivo,
    JSON.stringify({ extraidoEm: new Date().toISOString(), chat, total: mensagens.length, mensagens }, null, 2),
    'utf8'
  );

  const prompt = `${PROMPT_RESUMO}\n\n--- MENSAGENS (${chat}) ---\n${montarTextoParaAgente(mensagens)}`;

  return { ok: true, total: mensagens.length, arquivo, prompt, agente, chat, obra };
}

/**
 * Salva o resumo gerado pelo agente.
 * @param {object} opts
 * @param {string} opts.obra
 * @param {string} opts.resumo
 * @param {string} [opts.tipo]  'diario' | 'semanal'
 */
function salvarResumo(opts = {}) {
  const obra = opts.obra || 'whatsapp';
  const tipo = opts.tipo || 'diario';
  const dir = pastaDaObra(obra);
  const arquivo = path.join(dir, `resumo-${tipo}-${dataDeHoje()}.md`);
  fs.writeFileSync(arquivo, opts.resumo || '', 'utf8');
  return { ok: true, arquivo };
}

module.exports = {
  coletarEPreparar,
  salvarResumo,
  lerMensagens,
  montarTextoParaAgente,
  PROMPT_RESUMO,
};
