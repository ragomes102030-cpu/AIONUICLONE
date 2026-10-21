/**
 * Cliente CDP (Chrome DevTools Protocol) para leitura do WhatsApp Web.
 *
 * Conecta no Chrome aberto em --remote-debugging-port=9222, encontra a aba
 * do WhatsApp Web e extrai as mensagens visiveis no chat aberto.
 *
 * Uso:
 *   node scripts/whatsapp-cdp-client.js [arquivo-saida.json]
 *
 * Requisitos:
 *   - Chrome aberto com: --remote-debugging-port=9222
 *   - WhatsApp Web logado na aba
 *   - Chat/grupo aberto na tela
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const CDP_HOST = '127.0.0.1';
const CDP_PORT = 9222;

function jsonGet(endpoint) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${CDP_HOST}:${CDP_PORT}${endpoint}`, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout CDP')); });
  });
}

function listTargets() {
  return jsonGet('/json/list');
}

function conectarWebSocket(debuggerUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(debuggerUrl);
    let resolvers = {};
    let seq = 0;

    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      const pending = resolvers[msg.id];
      if (pending) {
        delete resolvers[msg.id];
        pending(msg);
      }
    });

    // Envolve o send para retornar Promise
    const originalSend = ws.send.bind(ws);
    ws.cdpSend = (method, params = {}) => {
      return new Promise((resolve, reject) => {
        const id = ++seq;
        resolvers[id] = (response) => {
          if (response.error) {
            reject(new Error(`CDP ${method}: ${response.error.message || JSON.stringify(response.error)}`));
          } else {
            resolve(response);
          }
        };
        try {
          originalSend(JSON.stringify({ id, method, params }));
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
    };
  });
}

/**
 * Extrai mensagens visiveis da pagina do WhatsApp Web.
 * Estrutura esperada:
 *   [data-testid^="conv-msg-"] -> .copyable-text
 *   atributo data-pre-plain-text = "[HH:MM, DD/MM/YYYY] Autor: "
 */
const EXPR_EXTRAIR = () => {
  const out = [];
  // Busca global: o WhatsApp virtualiza e o wrapper [data-testid^="conv-msg-"]
  // nao esta presente em todas as mensagens renderizadas.
  document.querySelectorAll('.copyable-text').forEach((el) => {
    const pre = el.getAttribute('data-pre-plain-text') || '';
    // Formato: "[HH:MM, DD/MM/YYYY] Autor: "
    const m = pre.match(/^\[([^\]]+)\]\s*([^:]+):\s*/);
    if (!m) return;
    // data-plain-text vem limpo (sem quebras de citacao); innerText e o fallback
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
};

async function main() {
  const arquivoSaida = process.argv[2] || path.join(__dirname, '..', 'whatsapp-mensagens.json');

  console.log('Conectando no CDP...');
  const version = await jsonGet('/json/version');
  console.log('Chrome:', version.Browser || version['Browser-Version'] || 'desconhecido');

  console.log('Listando abas...');
  const targets = await listTargets();
  const waTarget = targets.find((t) => t.type === 'page' && (/whatsapp\.com/i.test(t.url || '')));
  if (!waTarget) {
    throw new Error('Nenhuma aba do WhatsApp Web encontrada. Abra o WhatsApp Web no Chrome.');
  }
  console.log('Aba WhatsApp encontrada:', waTarget.title, '|', waTarget.url);

  console.log('Conectando WebSocket na aba...');
  const ws = await conectarWebSocket(waTarget.webSocketDebuggerUrl);

  // Habilita Runtime
  await ws.cdpSend('Runtime.enable');

  console.log('Extraindo mensagens visiveis...');
  const resposta = await ws.cdpSend('Runtime.evaluate', {
    expression: `(${EXPR_EXTRAIR.toString()})()`,
    returnByValue: true,
    awaitPromise: true,
  });

  // A resposta do CDP vem como { id, result: { result: { type, value } } }
  const remoteObject = resposta.result && resposta.result.result;
  if (!remoteObject) {
    throw new Error(`Resposta inesperada do CDP: ${JSON.stringify(resposta).slice(0, 300)}`);
  }
  if (remoteObject.subtype === 'error' || (resposta.result && resposta.result.exceptionDetails)) {
    throw new Error(`Erro na expressao: ${JSON.stringify(resposta.result.exceptionDetails || remoteObject).slice(0, 300)}`);
  }

  const mensagens = Array.isArray(remoteObject.value) ? remoteObject.value : [];

  // Filtra mensagens sem texto valido
  const validas = mensagens.filter((m) => m.texto);

  const saida = {
    extraidoEm: new Date().toISOString(),
    fonte: waTarget.url,
    total: validas.length,
    mensagens: validas,
  };

  fs.writeFileSync(arquivoSaida, JSON.stringify(saida, null, 2), 'utf8');
  console.log(`Salvo ${validas.length} mensagem(ens) em: ${arquivoSaida}`);

  ws.close();
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
