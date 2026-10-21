/**
 * Envia uma mensagem pelo WhatsApp Web via CDP (Chrome em depuracao).
 *
 * ⚠️ AVISO: isto envia de verdade. Use apenas com numero dedicado e com
 *    ciencia da empresa. Nada e enviado sem a flag --confirmar.
 *
 * Uso:
 *   node enviar.js "Texto da mensagem" --chat PIAZZA --confirmar
 *   node enviar.js "Texto da mensagem" --chat PIAZZA          (so mostra)
 *
 * Requisitos:
 *   - Chrome aberto com --remote-debugging-port=9222
 *   - WhatsApp Web logado, com o chat de destino ja aberto na tela
 */

const { conectar } = require('./cdp-client');

/** Localiza o campo de digitacao e o botao de enviar do WhatsApp Web. */
function exprEnviar(texto) {
  const textoSeguro = JSON.stringify(texto);
  return `(() => {
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

    campo.focus();
    campo.innerHTML = '<p><br></p>';
    campo.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${textoSeguro} }));
    try {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(campo);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('insertText', false, ${textoSeguro});
    } catch (e) { /* segue com o innerHTML */ }

    const botao = document.querySelector('button[data-testid="send"], span[data-testid="send"], button[aria-label="Enviar"], span[aria-label="Enviar"]');
    if (!botao) return { ok: false, erro: 'botao de enviar nao encontrado' };

    botao.click();
    return { ok: true, campo: campo.getAttribute('data-tab') || 'ok' };
  })()`;
}

function exprHeader() {
  return `(() => {
    const el = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
    return el ? ((el.getAttribute('title') || el.textContent || '').trim()) : '';
  })()`;
}

function lerArgs(argv) {
  const opts = { texto: '', chat: 'PIAZZA', confirmar: false };
  const resto = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--chat') opts.chat = argv[++i];
    else if (a === '--confirmar') opts.confirmar = true;
    else resto.push(a);
  }
  opts.texto = resto.join(' ').trim();
  return opts;
}

async function main() {
  const opts = lerArgs(process.argv.slice(2));

  if (!opts.texto) {
    console.log('Uso: node enviar.js "mensagem" [--chat NOME] --confirmar');
    process.exit(1);
  }

  if (!opts.confirmar) {
    console.log('--- SERIA ENVIADO AGORA ---');
    console.log(`chat    : ${opts.chat}`);
    console.log(`mensagem: ${opts.texto}`);
    console.log('');
    console.log('Nada foi enviado. Releia com --confirmar para enviar de verdade.');
    console.log('Lembre: use numero dedicado e com ciencia da empresa.');
    return;
  }

  const client = await conectar();
  try {
    const header = await client.avaliar(exprHeader());

    if (!header) {
      console.error('AVISO: nao foi possivel ler o nome do chat aberto (header nao encontrado).');
      console.error('Confirme na tela qual chat esta aberto antes de continuar.');
    } else if (opts.chat && !String(header).toLowerCase().includes(String(opts.chat).toLowerCase())) {
      console.error(`AVISO: o chat aberto e "${header}", mas voce pediu "${opts.chat}".`);
      console.error('Abra o chat correto no Chrome antes de enviar. Nada foi enviado.');
      process.exit(2);
    }

    const res = await client.avaliar(exprEnviar(opts.texto));
    if (!res || !res.ok) {
      throw new Error(`Falha ao enviar: ${res && res.erro ? res.erro : 'erro desconhecido'}`);
    }
    console.log(`Mensagem enviada no chat "${header || opts.chat}".`);
  } finally {
    client.fechar();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('ERRO:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
