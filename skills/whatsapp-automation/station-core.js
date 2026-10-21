/**
 * station-core.js - nucleo compartilhado da estacao WhatsApp do Arquimedes.
 *
 * Reunem tudo o que o "doctor" e o "instalador da estacao" precisam saber:
 *   - onde esta o data-dir do Arquimedes (e o banco SQLite)
 *   - como falar com a API do backend Rust (mesmo em modo --local, sem senha)
 *   - como descobrir a porta do backend (efemera no desktop, 25808 no WebUI)
 *   - como inspecionar o Chrome em modo de depuracao (CDP na porta 9222)
 *   - o catalogo de skills (registradas x quebradas) e as tarefas de cron
 *
 * Roda em Node 22+ (WebSocket nativo) e no Node embarcado do Arquimedes (24.x).
 * Nao depende de nenhuma pacote externo.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const USER_ID = 'system_default_user';
const DEFAULT_CDP_PORT = 9222;
const WEBUI_PORT = 25808;

/* ------------------------------------------------------------------ dados */

/** Caminho do data-dir do Arquimedes (onde ficam o banco, as skills e as conversas). */
function descobrirDataDir(explicito) {
  if (explicito) return path.resolve(explicito);
  if (process.env.ARQUIMEDES_DATA_DIR) return path.resolve(process.env.ARQUIMEDES_DATA_DIR);

  const home = os.homedir();
  if (process.platform === 'win32') {
    const base = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
    return path.join(base, 'Arquimedes', 'arquimedes');
  }
  return path.join(home, '.arquimedes');
}

function caminhoBanco(dataDir) {
  return path.join(dataDir, 'aionui-backend.db');
}

function caminhoPastaSkills(dataDir) {
  return path.join(dataDir, 'skills', 'users', USER_ID);
}

/** Pasta onde a skill whatsapp-automation deve ficar para o agente encontrar. */
function caminhoSkillInstalada(dataDir, nome = 'whatsapp-automation') {
  return path.join(caminhoPastaSkills(dataDir), nome);
}

/* ------------------------------------------------------------------ sqlite */

/**
 * Abre o banco em modo somente-leitura (ou leitura+escrita) com node:sqlite.
 * Retorna null se o modulo nao existir ou o banco nao estiver acessivel.
 */
function abrirBanco(dataDir, { leitura = true } = {}) {
  const arquivo = caminhoBanco(dataDir);
  if (!fs.existsSync(arquivo)) return null;
  let sqlite;
  try {
    sqlite = require('node:sqlite');
  } catch {
    return null;
  }
  try {
    const db = new sqlite.DatabaseSync(arquivo, { readOnly: leitura });
    db.exec('PRAGMA busy_timeout = 5000');
    return db;
  } catch {
    return null;
  }
}

/** Le as skills do catalogo e classifica entre "ok" e "quebrada" (path inexistente). */
function inspecionarSkills(db) {
  const vazio = { total: 0, ok: 0, quebradas: [], whatsapp: null, porFonte: {} };
  if (!db) return vazio;
  let linhas;
  try {
    linhas = db.prepare('SELECT id, name, path, source, enabled FROM skills WHERE deleted_at IS NULL').all();
  } catch {
    return vazio;
  }
  const out = { total: linhas.length, ok: 0, quebradas: [], whatsapp: null, porFonte: {} };
  for (const l of linhas) {
    const fonte = l.source || 'desconhecida';
    out.porFonte[fonte] = (out.porFonte[fonte] || 0) + 1;
    const existe = l.path ? fs.existsSync(l.path) : false;
    if (existe) out.ok++;
    else out.quebradas.push({ id: l.id, name: l.name, path: l.path, source: l.source });
    if (l.name === 'whatsapp-automation') {
      out.whatsapp = { id: l.id, path: l.path, source: l.source, enabled: !!l.enabled, existe };
    }
  }
  return out;
}

/** Lista as tarefas de cron cadastradas. */
function inspecionarCron(db) {
  const vazio = { total: 0, tarefas: [] };
  if (!db) return vazio;
  try {
    const linhas = db
      .prepare(
        'SELECT id, name, enabled, schedule_kind, schedule_value, schedule_description, last_run_at, last_status FROM cron_jobs ORDER BY created_at'
      )
      .all();
    return {
      total: linhas.length,
      tarefas: linhas.map((t) => ({
        id: t.id,
        nome: t.name,
        ativa: !!t.enabled,
        tipo: t.schedule_kind,
        expressao: t.schedule_value,
        descricao: t.schedule_description,
        ultimaExecucao: t.last_run_at,
        ultimoStatus: t.last_status,
      })),
    };
  } catch {
    return vazio;
  }
}

/** Lista as conversas (id + nome) para usar como contexto das rotas internas. */
function listarConversas(db) {
  if (!db) return [];
  try {
    return db
      .prepare('SELECT id, name FROM conversations ORDER BY created_at DESC LIMIT 20')
      .all()
      .map((c) => ({ id: c.id, nome: c.name }));
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------- http */

/**
 * Cliente da API do backend Rust.
 * Em modo --local o backend aceita o header x-aionui-user-id sem senha.
 */
class Api {
  constructor(base, { conversationId } = {}) {
    this.base = base.replace(/\/+$/, '');
    this.conversationId = conversationId || null;
  }

  headers(extra = {}) {
    const h = { 'x-aionui-user-id': USER_ID, ...extra };
    if (this.conversationId) h['x-aionui-conversation-id'] = this.conversationId;
    return h;
  }

  async req(metodo, rota, corpo) {
    const opcoes = {
      method: metodo,
      headers: this.headers(corpo ? { 'content-type': 'application/json' } : {}),
    };
    // fetch() nao aceita body em GET/HEAD
    if (corpo && metodo !== 'GET' && metodo !== 'HEAD') {
      opcoes.body = JSON.stringify(corpo);
    }
    const resp = await fetch(`${this.base}${rota}`, opcoes);
    const texto = await resp.text();
    let dados = null;
    try {
      dados = JSON.parse(texto);
    } catch {
      /* resposta nao-JSON */
    }
    return { status: resp.status, ok: resp.ok, dados, texto };
  }

  async get(rota) {
    return this.req('GET', rota);
  }

  async post(rota, corpo) {
    return this.req('POST', rota, corpo);
  }
}

/* --------------------------------------------------- descoberta do backend */

/** Extrai a porta em escuta de um PID usando netstat (Windows). */
function portasEmEscuta(pid) {
  const portas = [];
  try {
    const saida = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', timeout: 15000 });
    for (const linha of saida.split(/\r?\n/)) {
      if (!/LISTENING/i.test(linha)) continue;
      const partes = linha.trim().split(/\s+/);
      if (partes.length < 5) continue;
      if (partes[partes.length - 1] !== String(pid)) continue;
      const local = partes[1];
      const sep = local.lastIndexOf(':');
      const porta = parseInt(local.slice(sep + 1), 10);
      if (Number.isFinite(porta)) portas.push(porta);
    }
  } catch {
    /* netstat indisponivel */
  }
  return portas;
}

/** PIDs dos processos do backend Rust (arquimedes-core / aioncore). */
function pidsDoBackend() {
  const pids = [];
  try {
    const saida = execFileSync('tasklist', ['/FI', 'IMAGENAME eq arquimedes-core.exe', '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    for (const linha of saida.split(/\r?\n/)) {
      const m = /"([^"]+)","(\d+)"/.exec(linha);
      if (m) pids.push(Number(m[2]));
    }
  } catch {
    /* tasklist indisponivel */
  }
  try {
    const saida = execFileSync('tasklist', ['/FI', 'IMAGENAME eq aioncore.exe', '/FO', 'CSV', '/NH'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    for (const linha of saida.split(/\r?\n/)) {
      const m = /"([^"]+)","(\d+)"/.exec(linha);
      if (m) pids.push(Number(m[2]));
    }
  } catch {
    /* idem */
  }
  return pids;
}

/**
 * Descobre um endereco de API que responda.
 * Ordem: explicito -> env -> WebUI (25808) -> porta efemera do processo do core.
 */
async function descobrirApi({ url, porta } = {}) {
  const tentativas = [];
  if (url) tentativas.push(url.replace(/\/+$/, ''));
  if (porta) tentativas.push(`http://127.0.0.1:${porta}`);
  if (process.env.ARQUIMEDES_URL) tentativas.push(process.env.ARQUIMEDES_URL.replace(/\/+$/, ''));
  tentativas.push(`http://127.0.0.1:${WEBUI_PORT}`);

  for (const pids of [pidsDoBackend()]) {
    for (const pid of pids) {
      for (const p of portasEmEscuta(pid)) tentativas.push(`http://127.0.0.1:${p}`);
    }
  }

  const testadas = [];
  for (const base of tentativas) {
    if (!base) continue;
    if (testadas.includes(base)) continue;
    testadas.push(base);
    try {
      const resp = await fetch(`${base}/api/cron/jobs`, { headers: { 'x-aionui-user-id': USER_ID } });
      if (resp.ok) return { base, origem: 'descoberto' };
    } catch {
      /* porta fechada */
    }
  }
  return { base: null, origem: 'nenhuma', tentadas: testadas };
}

/* -------------------------------------------------------------- chrome/cdp */

function httpGet(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = require('http');
    const u = new URL(url);
    const r = req.get(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, timeout: timeoutMs },
      (res) => {
        let corpo = '';
        res.on('data', (d) => (corpo += d));
        res.on('end', () => resolve({ status: res.statusCode, corpo }));
      }
    );
    r.on('timeout', () => {
      r.destroy();
      resolve({ status: 0, corpo: '' });
    });
    r.on('error', () => resolve({ status: 0, corpo: '' }));
  });
}

/**
 * Avalia uma expressao JS numa aba do Chrome via CDP (WebSocket nativo do Node 22+).
 * Devolve o valor de `returnByValue` ou null em caso de falha.
 */
function avaliarNaAba(wsUrl, expressao, timeoutMs = 5000) {
  return new Promise((resolve) => {
    if (!wsUrl || typeof WebSocket === 'undefined') return resolve(null);
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      return resolve(null);
    }
    const id = 1;
    let encerrado = false;
    const finalizar = (v) => {
      if (encerrado) return;
      encerrado = true;
      try {
        ws.close();
      } catch {
        /* ignora */
      }
      resolve(v);
    };
    const timer = setTimeout(() => finalizar(null), timeoutMs);
    try {
      ws.addEventListener('open', () => {
        ws.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression: expressao, returnByValue: true, awaitPromise: true },
          })
        );
      });
      ws.addEventListener('message', (evento) => {
        let msg = null;
        try {
          msg = JSON.parse(typeof evento.data === 'string' ? evento.data : String(evento.data));
        } catch {
          return;
        }
        if (!msg || msg.id !== id) return;
        clearTimeout(timer);
        const envelope = msg.result && msg.result.result;
        finalizar(envelope && 'value' in envelope ? envelope.value : null);
      });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        finalizar(null);
      });
    } catch {
      clearTimeout(timer);
      finalizar(null);
    }
  });
}

/** Le o titulo do chat aberto na aba do WhatsApp (testid do cabecalho da conversa). */
async function lerChatAberto(wsUrl) {
  const expressao = `(() => {
    const el = document.querySelector('[data-testid="conversation-info-header-chat-title"]');
    return el ? (el.getAttribute('title') || el.innerText || '').trim() : '';
  })()`;
  const valor = await avaliarNaAba(wsUrl, expressao);
  return typeof valor === 'string' ? valor : null;
}

/** Estado do Chrome em modo de depuracao: versao, abas e chat aberto do WhatsApp. */
async function inspecionarChrome(porta = DEFAULT_CDP_PORT) {
  const base = `http://127.0.0.1:${porta}`;
  const versao = await httpGet(`${base}/json/version`);
  if (versao.status !== 200) {
    return {
      conectado: false,
      porta,
      motivo: `nenhum Chrome em modo de depuracao na porta ${porta}`,
    };
  }
  let info = {};
  try {
    info = JSON.parse(versao.corpo);
  } catch {
    /* ignora */
  }

  const abasResp = await httpGet(`${base}/json/list`);
  let abas = [];
  try {
    abas = JSON.parse(abasResp.corpo) || [];
  } catch {
    /* ignora */
  }
  const whatsapp = abas.find((a) => /web\.whatsapp\.com/.test(a.url || ''));
  const estado = {
    conectado: true,
    porta,
    navegador: info.Browser || 'desconhecido',
    abas: abas.length,
    abaWhatsapp: whatsapp ? { titulo: whatsapp.title, url: whatsapp.url, id: whatsapp.id } : null,
    sessaoAtiva: whatsapp ? /\(\d+\)\s*WhatsApp/.test(whatsapp.title || '') : false,
    chatAberto: whatsapp ? await lerChatAberto(whatsapp.webSocketDebuggerUrl) : null,
  };
  if (!whatsapp) estado.motivo = 'o Chrome esta em depuracao, mas nao ha aba do WhatsApp aberta';
  return estado;
}

/* ------------------------------------------------------------------ varios */

function lerJson(arquivo) {
  try {
    return JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    return null;
  }
}

/** Copia uma pasta recursivamente (usa o nativo do Node quando disponivel). */
function copiarPasta(origem, destino) {
  fs.mkdirSync(destino, { recursive: true });
  for (const entrada of fs.readdirSync(origem, { withFileTypes: true })) {
    const de = path.join(origem, entrada.name);
    const para = path.join(destino, entrada.name);
    if (entrada.isDirectory()) copiarPasta(de, para);
    else if (entrada.isFile()) fs.copyFileSync(de, para);
  }
}

module.exports = {
  USER_ID,
  DEFAULT_CDP_PORT,
  WEBUI_PORT,
  descobrirDataDir,
  caminhoBanco,
  caminhoPastaSkills,
  caminhoSkillInstalada,
  abrirBanco,
  inspecionarSkills,
  inspecionarCron,
  listarConversas,
  Api,
  descobrirApi,
  pidsDoBackend,
  portasEmEscuta,
  httpGet,
  inspecionarChrome,
  lerJson,
  copiarPasta,
};
