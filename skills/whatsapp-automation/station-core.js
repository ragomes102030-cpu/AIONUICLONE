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

/* ------------------------------------------------------------- configuracao */

/**
 * A estacao e configuravel: cada cliente/número tem a sua propria configuracao.
 * O arquivo fica no data-dir do Arquimedes, para acompanhar a maquina estacao.
 */
function caminhoConfig(dataDir) {
  return path.join(dataDir, 'whatsapp-station.json');
}

/** Le a configuracao da estacao (vazio se ainda nao existir). */
function lerConfig(dataDir) {
  try {
    const bruto = fs.readFileSync(caminhoConfig(dataDir), 'utf8');
    const cfg = JSON.parse(bruto);
    return cfg && typeof cfg === 'object' ? cfg : {};
  } catch {
    return {};
  }
}

/** Grava a configuracao da estacao e devolve o caminho do arquivo. */
function salvarConfig(dataDir, cfg) {
  const arquivo = caminhoConfig(dataDir);
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(cfg, null, 2), 'utf8');
  return arquivo;
}

/**
 * Transforma um texto em um "slug" seguro para nome de pasta.
 *   "+55 85 99999-9999" -> "55-85-99999-9999"
 */
function slug(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
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

  async put(rota, corpo) {
    return this.req('PUT', rota, corpo);
  }

  async delete(rota) {
    return this.req('DELETE', rota);
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

/* --------------------------------------------------- conta e lista global */

/**
 * Expressao que devolve a conta conectada.
 * A conta nao vem de um numero fixo: e lida do WhatsApp Web que esta aberto.
 * O nome aparece no drawer de perfil ([data-testid="drawer-title-body"]).
 * O avatar do botao "Voce" (nav lateral) serve de identificador estavel.
 */
const EXPRESSAO_CONTA = `(() => {
  const rotulo = (b) => (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
  const btn = Array.from(document.querySelectorAll('[role="button"],button')).find((b) => /^voc(e|\\u00ea)$/i.test(rotulo(b)));
  const img = btn ? btn.querySelector('img') : null;
  const drawer = document.querySelector('[data-testid="drawer-title-body"]');
  return {
    nome: drawer ? (drawer.innerText || '').trim() : null,
    avatar: img ? (img.getAttribute('src') || '').split('?')[0] : null,
    drawerAberto: !!drawer,
  };
})()`;

/** Clica num item da navegacao lateral (ex.: "Voce", "Conversas"). */
function expressaoCliqueNav(padrao) {
  return `(() => {
    const rotulo = (b) => (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
    const btn = Array.from(document.querySelectorAll('[role="button"],button')).find((b) => new RegExp(${JSON.stringify(
      padrao
    )}, 'i').test(rotulo(b)));
    if (!btn) return 'sem-botao';
    const r = btn.getBoundingClientRect();
    const ev = (t) => new MouseEvent(t, { bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, view: window });
    btn.dispatchEvent(ev('pointerdown'));
    btn.dispatchEvent(ev('mousedown'));
    btn.dispatchEvent(ev('pointerup'));
    btn.dispatchEvent(ev('mouseup'));
    btn.dispatchEvent(ev('click'));
    return 'clicado';
  })()`;
}

/**
 * Detecta qual conta esta conectada no WhatsApp Web aberto.
 * Se o drawer de perfil estiver fechado, abre, le o nome e volta para "Conversas".
 * Nao fixa nem exige nenhum numero: quem estiver logado e a conta.
 */
async function detectarConta(wsUrl) {
  if (!wsUrl) return { nome: null, avatar: null, erro: 'sem aba do WhatsApp' };
  let valor = await avaliarNaAba(wsUrl, EXPRESSAO_CONTA);
  let abriuDrawer = false;
  // O clique em "Voce" pode demorar a abrir o drawer (a interface anima).
  // Repetimos algumas vezes antes de desistir, senao a leitura fica flaky.
  let tentativas = 0;
  while ((!valor || !valor.nome) && tentativas < 3) {
    tentativas++;
    abriuDrawer = true;
    const clique = await avaliarNaAba(wsUrl, expressaoCliqueNav('^voc(e|\\u00ea)$'));
    if (clique !== 'clicado') break;
    await new Promise((r) => setTimeout(r, 1500));
    valor = await avaliarNaAba(wsUrl, EXPRESSAO_CONTA);
  }
  // devolve a tela para a lista de conversas: o drawer aberto esconde o chat
  if (valor && valor.drawerAberto) {
    await avaliarNaAba(wsUrl, expressaoCliqueNav('^conversas$'));
    await new Promise((r) => setTimeout(r, 700));
  }
  const nome = (valor && valor.nome) || null;
  const avatar = (valor && valor.avatar) || null;
  return {
    nome,
    avatar,
    identificador: avatar ? avatar.split('/').pop() : null,
    drawerAberto: !!(valor && valor.drawerAberto),
    abriuDrawer,
  };
}

/**
 * Estado da sessao do WhatsApp Web na aba:
 *   temLista = a barra de conversas existe (sessao logada);
 *   temQR    = a tela e o QR code (sessao expirada / deslogada).
 * O titulo sozinho nao serve: "WhatsApp" aparece tanto no QR quanto logado,
 * e "(7) WhatsApp" so aparece quando ha nao lidas.
 */
const EXPRESSAO_SESSAO = `(() => {
  const pane = document.querySelector('#pane-side');
  const lista = document.querySelector('[data-testid="conversation-list"], [aria-label="Chat list"], [data-testid="cell-frame-title"]');
  const canvas = document.querySelector('canvas');
  return {
    temLista: !!(pane || lista),
    temQR: !!canvas,
    titulo: document.title,
  };
})()`;

/** Le o estado da sessao na aba do WhatsApp. */
async function lerSessao(wsUrl) {
  if (!wsUrl) return { temLista: false, temQR: false, titulo: null };
  const valor = await avaliarNaAba(wsUrl, EXPRESSAO_SESSAO);
  if (!valor) return { temLista: false, temQR: false, titulo: null };
  return {
    temLista: !!valor.temLista,
    temQR: !!valor.temQR,
    titulo: valor.titulo || null,
  };
}

/**
 * Le a lista de conversas da barra lateral SEM abrir nenhum chat.
 * Nada e marcado como lida: e so leitura do DOM ja renderizado.
 */
const EXPRESSAO_LISTA_CHATS = `(() => {
  const linhas = Array.from(document.querySelectorAll('[role="row"][data-testid^="list-item-"]'));
  const celulas = linhas.length ? linhas : Array.from(document.querySelectorAll('[role="gridcell"]'));
  const chats = [];
  for (const c of celulas) {
    const caixaTitulo = c.querySelector('[data-testid="cell-frame-title"]');
    if (!caixaTitulo) continue;
    const nomeEl = caixaTitulo.querySelector('span[title]');
    const titulo = ((nomeEl && nomeEl.getAttribute('title')) || '').trim() ||
      (caixaTitulo.innerText || '').trim().split('\\n').pop().trim();
    const ts = c.querySelector('[data-testid="chat-list-timestamp"]');
    const hora = ts ? (ts.innerText || '').trim() : '';
    const sec = c.querySelector('[data-testid="cell-frame-secondary"]');
    const preview = sec ? (sec.innerText || '').trim().split('\\n')[0].trim() : '';
    let naoLidas = 0;
    const badge = c.querySelector('[data-testid="icon-unread-count"]');
    if (badge) naoLidas = parseInt((badge.innerText || '').replace(/\\D+/g, ''), 10) || 0;
    if (!naoLidas) {
      const m = (caixaTitulo.innerText || '').match(/(\\d+)\\s+mensagens?\\s+n[aã]o\\s+lida/i);
      if (m) naoLidas = parseInt(m[1], 10) || 0;
    }
    chats.push({ titulo, hora, preview, naoLidas });
  }
  return { total: chats.length, chats };
})()`;

async function lerListaChats(wsUrl) {
  if (!wsUrl) return { total: 0, chats: [] };
  const valor = await avaliarNaAba(wsUrl, EXPRESSAO_LISTA_CHATS);
  if (!valor || !Array.isArray(valor.chats)) return { total: 0, chats: [] };
  return valor;
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
  // O /json/list tambem traz service workers e workers. A aba do WhatsApp
  // e a unica do tipo "page" - pegar o service worker quebra a leitura
  // (titulo vazio, zero conversas, conta nao identificada).
  const whatsapp =
    abas.find((a) => a.type === 'page' && /^https:\/\/web\.whatsapp\.com\/?$/.test(a.url || '')) ||
    abas.find((a) => a.type === 'page' && /web\.whatsapp\.com/.test(a.url || ''));
  const sessao = whatsapp ? await lerSessao(whatsapp.webSocketDebuggerUrl) : null;
  const conta = whatsapp ? await detectarConta(whatsapp.webSocketDebuggerUrl) : null;
  const estado = {
    conectado: true,
    porta,
    navegador: info.Browser || 'desconhecido',
    abas: abas.length,
    abaWhatsapp: whatsapp
      ? { titulo: whatsapp.title, url: whatsapp.url, id: whatsapp.id, webSocketDebuggerUrl: whatsapp.webSocketDebuggerUrl }
      : null,
    sessaoAtiva: !!(sessao && sessao.temLista),
    pedidoQr: !!(sessao && sessao.temQR && !sessao.temLista),
    sessao,
    chatAberto: whatsapp ? await lerChatAberto(whatsapp.webSocketDebuggerUrl) : null,
    conta,
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

/* ------------------------------------------------- inicializacao automatica */

/** Pasta de inicializacao do usuario logado (Startup do Windows). */
function pastaInicializacao() {
  const appdata = process.env.APPDATA || '';
  return path.join(appdata, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
}

const NOME_INICIO = 'Arquimedes - Estacao WhatsApp.cmd';

/** Procura o executavel do Arquimedes (per-machine ou per-user). */
function acharArquimedes() {
  const candidatos = [
    'C:\\Program Files\\Arquimedes\\Arquimedes.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Arquimedes', 'Arquimedes.exe'),
  ];
  for (const c of candidatos) if (c && fs.existsSync(c)) return c;
  const base = 'C:\\Program Files';
  try {
    for (const entrada of fs.readdirSync(base)) {
      if (!/^arquimedes/i.test(entrada)) continue;
      const exe = path.join(base, entrada, 'Arquimedes.exe');
      if (fs.existsSync(exe)) return exe;
    }
  } catch {
    /* ignora */
  }
  return null;
}

/**
 * Cria (ou remove) o script de inicializacao automatica da estacao.
 * Ele abre o Chrome em modo de depuracao (com o perfil do numero) e sobe
 * o Arquimedes, que e quem executa as tarefas agendadas.
 */
function gerenciarInicializacao({ acao = 'status', exeChrome, perfilChrome, portaCdp, exeApp, iniciarApp = true }) {
  const pasta = pastaInicializacao();
  const arquivo = path.join(pasta, NOME_INICIO);
  const existe = fs.existsSync(arquivo);

  if (acao === 'remover') {
    if (!existe) return { ok: true, arquivo, removido: false, mensagem: 'nao havia inicializacao automatica' };
    try {
      fs.unlinkSync(arquivo);
      return { ok: true, arquivo, removido: true, mensagem: 'inicializacao automatica removida' };
    } catch (e) {
      return { ok: false, arquivo, removido: false, mensagem: String(e.message) };
    }
  }

  if (acao === 'criar') {
    if (!exeChrome || !fs.existsSync(exeChrome)) {
      return { ok: false, arquivo, mensagem: 'chrome.exe nao encontrado' };
    }
    const linhas = [
      '@echo off',
      'REM Gerado pela estacao WhatsApp do Arquimedes. Pode apagar a vontade.',
      `title Estacao WhatsApp - Arquimedes`,
      `start "" "${exeChrome}" --remote-debugging-port=${portaCdp} --user-data-dir="${perfilChrome}" --no-first-run --no-default-browser-check https://web.whatsapp.com/`,
    ];
    if (iniciarApp && exeApp) {
      linhas.push('timeout /t 15 /nobreak >nul', `start "" "${exeApp}"`);
    }
    try {
      fs.mkdirSync(pasta, { recursive: true });
      fs.writeFileSync(arquivo, linhas.join('\r\n') + '\r\n', 'utf8');
      return { ok: true, arquivo, removido: false, mensagem: 'inicializacao automatica criada' };
    } catch (e) {
      return { ok: false, arquivo, mensagem: String(e.message) };
    }
  }

  return { ok: true, arquivo, existe, mensagem: existe ? 'inicializacao automatica ativa' : 'sem inicializacao automatica' };
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
  caminhoConfig,
  lerConfig,
  salvarConfig,
  slug,
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
  lerSessao,
  EXPRESSAO_SESSAO,
  detectarConta,
  lerListaChats,
  expressaoCliqueNav,
  EXPRESSAO_CONTA,
  pastaInicializacao,
  NOME_INICIO,
  acharArquimedes,
  gerenciarInicializacao,
  EXPRESSAO_LISTA_CHATS,
};
