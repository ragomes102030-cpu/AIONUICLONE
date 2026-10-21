/**
 * Wrapper do cliente CDP para uso pelas skills/tarefas do Arquimedes.
 * Isola o WebSocket em processo separado (o cliente CDP abre conexao e fica
 * conectado; reaproveitar o mesmo processo em varias chamadas da problemas).
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLIENTE_CDP = path.join(__dirname, 'whatsapp-cdp-client.js');

/**
 * Le as mensagens visiveis do WhatsApp Web.
 * @param {object} opts
 * @param {string} [opts.chat]      nome do chat/grupo (apenas para o log)
 * @param {string} [opts.saida]      caminho do JSON de saida
 * @param {string} [opts.pasta]      pasta onde gravar o JSON
 * @returns {Promise<Array<{dataHora:string,autor:string,texto:string}>>}
 */
async function lerMensagens(opts = {}) {
  const chat = opts.chat || 'PIAZZA';
  const saida = opts.saida || path.join(opts.pasta || path.join(__dirname, '..'), 'whatsapp-ultima-extracao.json');

  const stdout = execFileSync(process.execPath, [CLIENTE_CDP, saida], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (!fs.existsSync(saida)) {
    throw new Error(`Extracao falhou: arquivo ${saida} nao foi gerado. Saida do cliente:\n${stdout}`);
  }

  const dados = JSON.parse(fs.readFileSync(saida, 'utf8'));
  const mensagens = dados.mensagens || [];
  console.log(`[whatsapp] ${mensagens.length} mensagem(ens) lida(s) do chat ${chat}`);
  return mensagens;
}

/**
 * Monta o texto bruto para o agente resumir.
 * @param {Array} mensagens
 * @returns {string}
 */
function montarTextoParaAgente(mensagens) {
  return (mensagens || [])
    .map((m) => `[${m.dataHora || '?'}] ${m.autor || '?'}: ${m.texto || ''}`)
    .join('\n');
}

module.exports = { lerMensagens, montarTextoParaAgente };
