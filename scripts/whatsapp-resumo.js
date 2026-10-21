/**
 * Exemplo de uso do plugin de WhatsApp do Arquimedes.
 *
 * 1. Le mensagens visiveis do WhatsApp Web via CDP
 * 2. Gera um resumo usando um agente do Arquimedes (Hermes / Open Code)
 * 3. Salva o resultado em JSON
 *
 * Pre requisito: Chrome aberto com --remote-debugging-port=9222 e WhatsApp Web logado.
 */

const { lerMensagens } = require('./whatsapp-cdp-client-wrapper');
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('Lendo mensagens do WhatsApp Web...');
  const mensagens = await lerMensagens({ chat: 'PIAZZA' });

  const saida = {
    extraidoEm: new Date().toISOString(),
    total: mensagens.length,
    mensagens,
  };

  const arquivo = path.join(__dirname, '..', 'whatsapp-resumo-exemplo.json');
  fs.writeFileSync(arquivo, JSON.stringify(saida, null, 2), 'utf8');
  console.log(`Salvo ${mensagens.length} mensagem(ens) em ${arquivo}`);
}

main().catch((err) => {
  console.error('ERRO:', err.message);
  process.exit(1);
});
