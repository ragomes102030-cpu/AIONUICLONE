/**
 * Cliente CDP (Chrome DevTools Protocol) para leitura do WhatsApp Web.
 *
 * Arquivo AUTOSSUFICIENTE: nao depende de nenhuma biblioteca externa.
 * - WebSocket: usa o global nativo do Node 22+ / Electron; se nao existir,
 *   tenta o pacote "ws" (so funciona no ambiente de desenvolvimento do repo).
 * - O app instalado traz o proprio Node 24 em
 *   resources/bundled-arquimedes-core/.../node/node-v24.11.0-win-x64/node.exe
 *
 * Requisitos:
 *   - Chrome aberto com: --remote-debugging-port=9222
 *   - WhatsApp Web logado na aba
 *   - Chat/grupo aberto na tela
 *
 * Uso como modulo:
 *   const { lerMensagens } = require('./cdp-client');
 *   const mensagens = await lerMensagens({ chat: 'PIAZZA' });
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const CDP_HOST = process.env.WHATSAPP_CDP_HOST || '127.0.0.1';
const CDP_PORT = Number(process.env.WHATSAPP_CDP_PORT || 9222);

/* --------------------------------------------------------------- WebSocket */

function criarWebSocket(url) {
  // Node 22+ / Electron: WebSocket global (nativo, sem dependencia).
  if (typeof globalThis.WebSocket === 'function') {
    return new globalThis.WebSocket(url);
  }
  // Fallback: pacote "ws" (apenas no ambiente de desenvolvimento do repo).
  try {
    // eslint-disable-next-line global-require
    const WS = require('ws');
    return new WS(url);
  } catch {
    throw new Error(
      'WebSocket indisponivel. Use Node 22+ (o app ja traz o Node 24) ou instale o pacote "ws".'
    );
  }
}

function abrirWebSocket(url) {
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = criarWebSocket(url);
    } catch (err) {
      reject(err);
      return;
    }

    const onOpen = () => resolve(ws);
    const onError = (err) => reject(err instanceof Error ? err : new Error(String(err && err.message || err)));

    if (typeof ws.addEventListener === 'function') {
      ws.addEventListener('open', onOpen);
      ws.addEventListener('error', onError);
    } else {
      ws.on('open', onOpen);
      ws.on('error', onError);
    }
  });
}

function aoReceberMensagem(ws, handler) {
  if (typeof ws.addEventListener === 'function') {
    ws.addEventListener('message', (ev) => {
      let texto = ev.data;
      if (texto && typeof texto !== 'string' && typeof texto.toString === 'function') {
        texto = texto.toString('utf8');
      }
      handler(texto);
    });
  } else {
    ws.on('message', (raw) => handler(raw.toString('utf8')));
  }
}

function fecharWebSocket(ws) {
  try {
    ws.close();
  } catch {
    /* ignora */
  }
}

/* --------------------------------------------------------------------- CDP */

function jsonGet(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${CDP_HOST}:${CDP_PORT}${endpoint}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error(`timeout ao falar com o Chrome em ${CDP_HOST}:${CDP_PORT}`));
    });
  });
}

/**
 * Abre uma conexao CDP com a aba do WhatsApp Web e devolve um cliente
 * com o metodo `avaliar(expressao)`.
 */
async function conectar() {
  const targets = await jsonGet('/json/list');
  const waTarget = targets.find((t) => t.type === 'page' && /whatsapp\.com/i.test(t.url || ''));
  if (!waTarget) {
    throw new Error(
      'Nenhuma aba do WhatsApp Web encontrada. Abra o WhatsApp Web no Chrome com ' +
        '--remote-debugging-port=9222.'
    );
  }

  const ws = await abrirWebSocket(waTarget.webSocketDebuggerUrl);
  let resolvers = {};
  let seq = 0;

  aoReceberMensagem(ws, (texto) => {
    let msg;
    try {
      msg = JSON.parse(texto);
    } catch {
      return;
    }
    const pending = resolvers[msg.id];
    if (!pending) return;
    delete resolvers[msg.id];
    if (msg.error) {
      pending.reject(new Error(`CDP ${msg.method || 'comando'}: ${msg.error.message || JSON.stringify(msg.error)}`));
    } else {
      pending.resolve(msg);
    }
  });

  const enviar = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      resolvers[id] = { resolve, reject };
      try {
        ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        delete resolvers[id];
        reject(e);
        return;
      }
      setTimeout(() => {
        if (resolvers[id]) {
          delete resolvers[id];
          reject(new Error(`timeout CDP: ${method}`));
        }
      }, 15000);
    });

  await enviar('Runtime.enable');

  return {
    alvo: waTarget,
    async avaliar(expressao) {
      const resposta = await enviar('Runtime.evaluate', {
        expression: expressao,
        returnByValue: true,
        awaitPromise: true,
      });
      const remoteObject = resposta.result && resposta.result.result;
      if (!remoteObject) {
        throw new Error(`Resposta inesperada do CDP: ${JSON.stringify(resposta).slice(0, 300)}`);
      }
      if (resposta.result && resposta.result.exceptionDetails) {
        throw new Error(
          `Erro na expressao: ${JSON.stringify(resposta.result.exceptionDetails).slice(0, 300)}`
        );
      }
      return remoteObject.value;
    },
    fechar() {
      fecharWebSocket(ws);
    },
  };
}

/* ------------------------------------------------------- extracao do DOM */

/**
 * Extrai as mensagens visiveis da pagina do WhatsApp Web.
 * O WhatsApp virtualiza o historico: so as mensagens dentro da tela tem
 * o atributo `data-pre-plain-text` com "[HH:MM, DD/MM/YYYY] Autor: ".
 */
function exprExtrair() {
  const out = [];
  document.querySelectorAll('.copyable-text').forEach((el) => {
    const pre = el.getAttribute('data-pre-plain-text') || '';
    const m = pre.match(/^\[([^\]]+)\]\s*([^:]+):\s*/);
    if (!m) return;
    const corpo = (el.getAttribute('data-plain-text') || el.innerText || '').trim();
    const node = el.closest('[data-id]');
    out.push({
      id: node ? node.getAttribute('data-id') || '' : '',
      dataHora: m[1].trim(),
      autor: m[2].trim(),
      texto: corpo,
    });
  });
  return out;
}

/**
 * Le o nome do chat/grupo aberto na tela.
 * O WhatsApp Web usa [data-testid="conversation-info-header-chat-title"].
 * Se o elemento nao existir, devolve '' (nao da para conferir o chat).
 * NUNCA usar "header span[title]" aqui: esse seletor cai na lista de
 * participantes do grupo e devolve o texto gigante "+55 85 8430-8057, ...".
 */
function exprHeader() {
  const el = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
  if (!el) return '';
  return (el.getAttribute('title') || el.textContent || '').trim();
}

/* --------------------------------------------------------------- fachada */

/**
 * Le as mensagens visiveis do chat aberto.
 * @param {object} opts
 * @param {string} [opts.chat]  chat/grupo esperado (apenas confere o header)
 * @returns {Promise<{chat:string, total:number, mensagens:Array}>}
 */
async function lerMensagens(opts = {}) {
  const client = await conectar();
  try {
    const chatAberto = (await client.avaliar(`(${exprHeader.toString()})()`)) || '';
    const bruto = await client.avaliar(`(${exprExtrair.toString()})()`);
    const mensagens = (Array.isArray(bruto) ? bruto : []).filter((m) => m && m.texto);

    if (opts.chat && chatAberto && chatAberto.toLowerCase() !== String(opts.chat).toLowerCase()) {
      throw new Error(
        `O chat aberto no WhatsApp e "${chatAberto}" e nao "${opts.chat}". ` +
          'Abra o chat certo no Chrome e rode de novo.'
      );
    }

    return {
      chat: chatAberto || opts.chat || '',
      verificado: Boolean(chatAberto),
      total: mensagens.length,
      mensagens,
    };
  } finally {
    client.fechar();
  }
}

/** Monta o texto que sera entregue ao agente para resumo. */
function montarTextoParaAgente(mensagens = []) {
  return mensagens
    .map((m) => `[${m.dataHora}] ${m.autor}: ${m.texto}`)
    .join('\n');
}

/** Escreve um arquivo JSON ensuring que o diretorio exista. */
function salvarJson(arquivo, dados) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2), 'utf8');
  return arquivo;
}

module.exports = {
  lerMensagens,
  montarTextoParaAgente,
  salvarJson,
  conectar,
  exprExtrair,
  exprHeader,
  CDP_HOST,
  CDP_PORT,
};
