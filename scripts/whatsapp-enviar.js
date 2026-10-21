/**
 * Envia uma mensagem pelo WhatsApp Web via CDP (Chrome em depuracao).
 *
 * ⚠️ AVISO: isto envia de verdade. Use apenas com numero dedicado e
 *    com ciencia da empresa. Nada e enviado sem a flag --confirmar.
 *
 * Uso:
 *   node scripts/whatsapp-enviar.js "Texto da mensagem" --confirmar
 *   node scripts/whatsapp-enviar.js "Texto" --chat PIAZZA --confirmar
 *
 * Requisitos:
 *   - Chrome aberto com --remote-debugging-port=9222
 *   - WhatsApp Web logado, com o chat de destino ja aberto na tela
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
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('timeout CDP')); });
  });
}

function conectarWebSocket(debuggerUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(debuggerUrl);
    const resolvers = {};
    let seq = 0;

    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      const pending = resolvers[msg.id];
      if (pending) { delete resolvers[msg.id]; pending(msg); }
    });

    const originalSend = ws.send.bind(ws);
    ws.cdpSend = (method, params = {}) =>
      new Promise((res, rej) => {
        const id = ++seq;
        resolvers[id] = (response) => {
          if (response.error) rej(new Error(`CDP ${method}: ${response.error.message || JSON.stringify(response.error)}`));
          else res(response);
        };
        try { originalSend(JSON.stringify({ id, method, params })); }
        catch (e) { delete resolvers[id]; rej(e); return; }
        setTimeout(() => {
          if (resolvers[id]) { delete resolvers[id]; rej(new Error(`timeout CDP: ${method}`)); }
        }, 15000);
      });
  });
}

async function avaliar(ws, expression) {
  const r = await ws.cdpSend('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  const ro = r.result && r.result.result;
  if (!ro) throw new Error(`Resposta inesperada: ${JSON.stringify(r).slice(0, 250)}`);
  if (r.result && r.result.exceptionDetails) {
    throw new Error(`Erro JS: ${JSON.stringify(r.result.exceptionDetails).slice(0, 250)}`);
  }
  return ro.value;
}

/** Localiza o campo de digitacao e o botao de enviar do WhatsApp Web. */
const EXPR_ENVIAR = (texto) => {
  const textoSeguro = JSON.stringify(texto);
  return `(() => {
    // 1) campo de entrada
    const candidatos = [
      'div[contenteditable="true"][data-tab="10"]',
      'div[contenteditable="true"][role="textbox"]',
      'div[contenteditable="true"]',
    ];
    let campo = null;
    for (const sel of candidatos) {
      const el = document.querySelector(sel);
      if (el) { campo = el; break; }
    }
    if (!campo) return { ok: false, erro: 'campo de digitacao nao encontrado' };

    // 2) limpar e escrever
    campo.focus();
    campo.innerHTML = '<p><br></p>';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${textoSeguro} }));
    // fallback: execCommand em alguns casos e mais fiel ao WhatsApp
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(campo);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, ${textoSeguro});
    } catch (e) { /* segue com o innerHTML */ }

    // 3) botao de enviar
    const botao = document.querySelector('button[data-testid="send"], span[data-testid="send"], button[aria-label="Enviar"], span[aria-label="Enviar"]');
    if (!botao) return { ok: false, erro: 'botao de enviar nao encontrado' };

    botao.click();
    return { ok: true, campo: campo.getAttribute('data-tab') || 'ok' };
  })()`;
};

async function main() {
  const args = process.argv.slice(2);
  const confirmar = args.includes('--confirmar');
  const idxChat = args.indexOf('--chat');
  const chat = idxChat >= 0 ? args[idxChat + 1] : 'PIAZZA';
  const texto = args.filter((a, i) => a !== '--confirmar' && a !== '--chat' && a !== chat && i !== idxChat + 1).join(' ');

  if (!texto) {
    console.log('Uso: node scripts/whatsapp-enviar.js "mensagem" [--chat NOME] --confirmar');
    process.exit(1);
  }
  if (!confirmar) {
    console.log('--- SERIA ENVIADO AGORA ---');
    console.log(`chat   : ${chat}`);
    console.log(`mensagem: ${texto}`);
    console.log('');
    console.log('Nada foi enviado. Releia com --confirmar para enviar de verdade.');
    console.log('Lembre: use numero dedicado e com ciencia da empresa.');
    process.exit(0);
  }

  const targets = await jsonGet('/json/list');
  const wa = targets.find((t) => t.type === 'page' && /whatsapp\.com/i.test(t.url || ''));
  if (!wa) throw new Error('Aba do WhatsApp Web nao encontrada.');

  const ws = await conectarWebSocket(wa.webSocketDebuggerUrl);
  await ws.cdpSend('Runtime.enable');

  const header = await avaliar(ws, `(() => {
    const h = document.querySelector('header span[dir="auto"], header h1, [data-testid="conversation-header"] span');
    return h ? h.innerText : null;
  })()`);

  if (header && chat && !header.toLowerCase().includes(chat.toLowerCase())) {
    console.error(`AVISO: o chat aberto e "${header}", mas voce pediu "${chat}".`);
    console.error('Abra o chat correto no Chrome antes de enviar. Nada foi enviado.');
    process.exit(2);
  }

  const res = await avaliar(ws, EXPR_ENVIAR(texto));
  if (!res || !res.ok) {
    throw new Error(`Falha ao enviar: ${res && res.erro ? res.erro : 'erro desconhecido'}`);
  }
  console.log(`Mensagem enviada no chat "${header || chat}".`);
  ws.close();
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
