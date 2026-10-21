#!/usr/bin/env node
/**
 * station.js - instalador de 1 comando da estacao WhatsApp do Arquimedes.
 *
 *   node station.js --chat PIAZZA --obra piazza
 *
 * O que ele faz, em ordem:
 *   1. Descobre o data-dir e a API do backend (o app pode estar aberto ou nao)
 *   2. Instala a skill whatsapp-automation no data-dir (onde o agente le)
 *   3. Repara as skills do catalogo que apontam para pastas apagadas
 *      (caminho apontava para a antiga instalacao do AionUi)
 *   4. Registra a skill whatsapp-automation no catalogo (via API de import)
 *   5. Cria as 2 tarefas agendadas: resumo diario (7:00) e semanal (sexta 7:00)
 *   6. Sobe o Chrome em modo de depuracao, se nao estiver de pe
 *   7. Roda o doctor e mostra o resultado
 *
 * O app NUNCA instala sozinho: a instalacao e na estacao, este comando.
 * O app apenas le o estado e liga/desliga as tarefas.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');
const core = require('./station-core');

const args = process.argv.slice(2);
const tem = (n) => args.includes(n);
const valor = (n, padrao) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const CHAT = valor('--chat', 'PIAZZA');
const PERFIL_CHROME = process.env.ARQUIMEDES_CHROME_PROFILE || 'C:\\Arquimedes\\chrome-arquimedes';
const NOME_SKILL = 'whatsapp-automation';

const passos = [];
function passo(ok, titulo, detalhe) {
  passos.push({ ok, titulo, detalhe });
  console.log(`  ${ok ? '[ ok ]' : ok === false ? '[!! ]' : '[ -- ]'} ${titulo}${detalhe ? '  ' + detalhe : ''}`);
}

/** Onde esta esta skill agora (a pasta que contem este arquivo). */
const Origem = __dirname;

/** Chrome do Windows em ordem de probabilidade. */
function acharChrome() {
  const candidatos = [
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  for (const c of candidatos) if (c && fs.existsSync(c)) return c;
  return null;
}

async function principal() {
  console.log('');
  console.log('  Instalador da estacao WhatsApp - Arquimedes');
  console.log('  ============================================');
  console.log('');

  /* 1) data-dir e API ---------------------------------------------------- */
  const dataDir = core.descobrirDataDir(valor('--data-dir', null));
  passo(fs.existsSync(core.caminhoBanco(dataDir)), 'data-dir do Arquimedes', dataDir);

  const api = await core.descobrirApi({ url: valor('--url', null), porta: valor('--port', null) });
  if (!api.base) {
    passo(false, 'API do backend', 'nao encontrada - abra o Arquimedes e rode de novo');
    console.log('');
    console.log('  ERRO: o Arquimedes precisa estar aberto (a API fica em porta efemera).');
    process.exit(2);
  }
  passo(true, 'API do backend', api.base);

  const db = core.abrirBanco(dataDir, { leitura: false });
  const conversas = core.listarConversas(db);
  const cliente = new core.Api(api.base, { conversationId: conversas[0]?.id });
  if (!conversas.length) {
    passo(false, 'conversa de contexto', 'o app nao tem nenhuma conversa - crie uma no app primeiro');
    if (db) db.close();
    process.exit(2);
  }

  /* 2) instala a skill no data-dir --------------------------------------- */
  const destino = core.caminhoSkillInstalada(dataDir, NOME_SKILL);
  if (path.resolve(Origem) === path.resolve(destino)) {
    passo(true, 'skill ja esta no data-dir', destino);
  } else {
    try {
      core.copiarPasta(Origem, destino);
      passo(true, 'skill instalada no data-dir', destino);
    } catch (e) {
      passo(false, 'skill instalada no data-dir', String(e.message));
    }
  }

  /* 3) repara skills quebradas do catalogo -------------------------------- */
  if (db) {
    try {
      const antes = db.prepare('SELECT COUNT(*) n FROM skills WHERE path LIKE ? AND deleted_at IS NULL').get('%\\AionUi\\aionui\\skills\\users\\%').n;
      if (antes > 0) {
        db.prepare(
          "UPDATE skills SET path = REPLACE(path, '\\AionUi\\aionui\\skills\\users\\', '\\Arquimedes\\arquimedes\\skills\\users\\') WHERE path LIKE ? AND deleted_at IS NULL"
        ).run('%\\AionUi\\aionui\\skills\\users\\%');
        const depois = db.prepare('SELECT COUNT(*) n FROM skills WHERE path LIKE ? AND deleted_at IS NULL').get('%\\AionUi\\aionui\\skills\\users\\%').n;
        passo(true, `skills reparadas`, `${antes} apontavam para a pasta apagada do AionUi; restam ${depois}`);
      } else {
        passo(true, 'skills reparadas', 'nenhuma apontava para a pasta apagada');
      }
    } catch (e) {
      passo(false, 'skills reparadas', String(e.message));
    }
  }

  /* 4) registra a skill no catalogo --------------------------------------- */
  try {
    const r = await cliente.post('/api/skills/import', { skill_path: destino });
    if (r.ok) {
      const nome = r.dados?.data?.skill_name || NOME_SKILL;
      passo(true, 'skill registrada no catalogo', nome);
    } else {
      passo(false, 'skill registrada no catalogo', `${r.status} ${(r.texto || '').slice(0, 120)}`);
    }
  } catch (e) {
    passo(false, 'skill registrada no catalogo', String(e.message));
  }

  /* 5) tarefas agendadas -------------------------------------------------- */
  if (!tem('--sem-cron')) {
    const existentes = await cliente.get('/api/cron/jobs');
    const lista = existentes.ok && existentes.dados?.data ? existentes.dados.data : [];
    const modelos = [
      { arquivo: 'tarefa-resumo-diario.json', nome: 'Resumo diário do WhatsApp (grupo ' + CHAT + ')' },
      { arquivo: 'tarefa-resumo-semanal.json', nome: 'Resumo semanal do WhatsApp (grupo ' + CHAT + ')' },
    ];
    for (const m of modelos) {
      if (lista.some((t) => t.name === m.nome)) {
        passo(true, 'tarefa ja existe', m.nome);
        continue;
      }
      const arquivoModelo = path.join(destino, m.arquivo);
      if (!fs.existsSync(arquivoModelo)) {
        passo(false, 'criar tarefa', 'modelo ausente: ' + m.arquivo);
        continue;
      }
      const modelo = JSON.parse(fs.readFileSync(arquivoModelo, 'utf8'));
      const r = await cliente.post('/api/internal/conversation-cron/create', {
        name: m.nome,
        schedule: modelo.schedule,
        schedule_description: modelo.schedule_description || '',
        message: modelo.message,
      });
      if (r.ok) passo(true, 'tarefa criada', `${m.nome}  (${modelo.schedule})`);
      else passo(false, 'criar tarefa', `${m.nome}: ${r.status} ${(r.texto || '').slice(0, 120)}`);
    }
  }

  /* 6) Chrome em modo de depuracao ---------------------------------------- */
  if (!tem('--sem-chrome')) {
    const estado = await core.inspecionarChrome(Number(valor('--cdp', String(core.DEFAULT_CDP_PORT))));
    if (estado.conectado) {
      passo(true, 'Chrome em modo de depuracao', estado.navegador);
    } else {
      const exe = acharChrome();
      if (!exe) {
        passo(false, 'Chrome em modo de depuracao', 'chrome.exe nao encontrado - instale o Chrome ou use --sem-chrome');
      } else {
        try {
          const filho = spawn(
            exe,
            [
              `--remote-debugging-port=${valor('--cdp', String(core.DEFAULT_CDP_PORT))}`,
              `--user-data-dir=${PERFIL_CHROME}`,
              '--no-first-run',
              '--no-default-browser-check',
              'https://web.whatsapp.com/',
            ],
            { detached: true, stdio: 'ignore' }
          );
          filho.unref();
          await new Promise((r) => setTimeout(r, 5000));
          const depois = await core.inspecionarChrome(Number(valor('--cdp', String(core.DEFAULT_CDP_PORT))));
          passo(depois.conectado, 'Chrome em modo de depuracao', depois.conectado ? depois.navegador : 'nao respondeu na porta');
        } catch (e) {
          passo(false, 'Chrome em modo de depuracao', String(e.message));
        }
      }
    }
  }

  if (db) db.close();

  /* 7) doctor -------------------------------------------------------------- */
  console.log('');
  console.log('  --- verificacao final ---');
  console.log('');
  const doctor = path.join(destino, 'doctor.js');
  if (fs.existsSync(doctor)) {
    try {
      execFileSync(process.execPath, [doctor], { stdio: 'inherit' });
    } catch {
      /* o doctor ja imprime o proprio erro */
    }
  }

  const falhas = passos.filter((p) => p.ok === false).length;
  console.log('');
  if (falhas === 0) console.log('  Estacao pronta.');
  else console.log(`  Estacao pronta com ${falhas} pendencia(s) - veja o diagnostico acima.`);
  console.log('');
  process.exit(falhas === 0 ? 0 : 1);
}

principal().catch((e) => {
  console.error('ERRO: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
