#!/usr/bin/env node
/**
 * station.js - instalador de 1 comando da estacao WhatsApp do Arquimedes.
 *
 *   node station.js
 *   node station.js --numero "+55 85 99999-9999" --rotulo "Cliente Exemplo"
 *
 * O escopo e GLOBAL: vale para a conta que estiver conectada no Chrome da
 * estacao, nao para um grupo nem para um numero fixo.
 *
 * A estacao e CONFIGURAVEL: quem instala (o proprio usuario ou um cliente)
 * informa o numero/identificador que vai usar. Cada numero ganha a sua propria
 * pasta de perfil do Chrome, a sua configuracao e as suas tarefas agendadas.
 * Nada fica preso ao numero de quem configurou.
 *
 * O que ele faz, em ordem:
 *   1. Descobre o data-dir e a API do backend (o app pode estar aberto ou nao)
 *   2. Instala a skill whatsapp-automation no data-dir (onde o agente le)
 *   3. Repara as skills do catalogo que apontam para pastas apagadas
 *      (caminho apontava para a antiga instalacao do AionUi)
 *   4. Registra a skill whatsapp-automation no catalogo (via API de import)
 *   5. Grava a configuracao da estacao (numero, perfil do Chrome, conta)
 *   6. Cria as 2 tarefas agendadas: resumo diario (7:00) e semanal (sexta 7:00)
 *   7. Sobe o Chrome em modo de depuracao, se nao estiver de pe
 *   8. Roda o doctor e mostra o resultado
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

const PERFIL_CHROME_BASE = process.env.ARQUIMEDES_CHROME_PROFILE || 'C:\\Arquimedes\\chrome-arquimedes';
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

  /* 1b) configuracao da estacao (de quem e o numero que vai usar) -------- */
  const anterior = core.lerConfig(dataDir);
  const numero = valor('--numero', anterior.numero || null);
  const rotulo = valor('--rotulo', anterior.rotulo || (numero ? numero : null));
  const contaEsperada = valor('--conta', anterior.contaEsperada || null);
  const cdpPorta = Number(valor('--cdp', String(anterior.cdpPorta || core.DEFAULT_CDP_PORT)));
  const obraPadrao = valor('--obra', anterior.obraPadrao || 'whatsapp');
  const chatPadrao = valor('--chat', anterior.chatPadrao || null);
  const slugNumero = numero ? core.slug(numero) : null;
  const perfilChrome = valor(
    '--perfil',
    anterior.perfilChrome || (slugNumero ? path.join(PERFIL_CHROME_BASE, slugNumero) : PERFIL_CHROME_BASE)
  );
  const obrasDir = process.env.ARQUIMEDES_OBRAS || 'C:\\Arquimedes\\obras';
  const contexto = {
    SKILL_DIR: null, // preenchido depois que a skill e instalada
    OBRAS_DIR: obrasDir,
    NUMERO: numero || '',
    ROTULO: rotulo || '',
    PERFIL: perfilChrome,
    CONTA: contaEsperada || '',
  };

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

  /* 5) configuracao da estacao ------------------------------------------- */
  contexto.SKILL_DIR = destino;
  const config = {
    versao: 1,
    numero: numero || null,
    rotulo: rotulo || null,
    contaEsperada: contaEsperada || null,
    perfilChrome,
    cdpPorta,
    obraPadrao,
    chatPadrao,
    atualizadoEm: new Date().toISOString(),
  };
  try {
    const arquivo = core.salvarConfig(dataDir, config);
    passo(true, 'configuracao da estacao', `${numero ? numero + ' | ' : ''}${perfilChrome}`);
    passo(true, 'arquivo de configuracao', arquivo);
  } catch (e) {
    passo(false, 'configuracao da estacao', String(e.message));
  }

  /* 6) tarefas agendadas -------------------------------------------------- */
  if (!tem('--sem-cron')) {
    const existentes = await cliente.get('/api/cron/jobs');
    const lista = existentes.ok && existentes.dados?.data ? existentes.dados.data : [];

    // As tarefas do WhatsApp moram em conversas DEDICADAS (uma por tarefa).
    // Se elas dividissem conversa com outro assunto, um turno em andamento
    // seguraria o resumo e a entrega dos 7:00 se perderia.
    const respConversas = await cliente.get('/api/conversations');
    const itensConversa =
      respConversas.ok && respConversas.dados?.data?.items ? respConversas.dados.data.items : [];
    // Modelo (provider) que funciona nesta maquina: vem de uma conversa que ja usa.
    const referencia = itensConversa.find((c) => c.model?.provider_id && c.model?.model);

    const modelos = ['tarefa-resumo-diario.json', 'tarefa-resumo-semanal.json'];
    const rotuloTarefa = rotulo || 'todas as conversas';
    for (const arquivo of modelos) {
      const arquivoModelo = path.join(destino, arquivo);
      if (!fs.existsSync(arquivoModelo)) {
        passo(false, 'criar tarefa', 'modelo ausente: ' + arquivo);
        continue;
      }
      const modelo = JSON.parse(fs.readFileSync(arquivoModelo, 'utf8'));
      // O nome vem do proprio modelo, com o rotulo da estacao (numero do
      // cliente). O escopo e global: nao um grupo fixo.
      const nome = String(modelo.name || arquivo.replace('.json', '')).replace(/\{ROTULO\}/g, rotuloTarefa);
      // Placeholder sem valor (ex.: numero nao configurado) recebe um texto
      // legivel, para a mensagem da tarefa nao ficar com "{NUMERO}" cru.
      const semValor = {
        NUMERO: 'nao configurado (vale para qualquer conta conectada)',
        ROTULO: 'estacao global',
        CONTA: 'qualquer conta conectada',
      };
      const mensagem = String(modelo.message || '').replace(/\{(\w+)\}/g, (m, chave) => {
        const valor = contexto[chave];
        if (valor !== undefined && valor !== '') return valor;
        return semValor[chave] || m;
      });

      /* 6.1) conversa dedicada ------------------------------------------- */
      let conversa = itensConversa.find((c) => c.name === nome);
      if (conversa) {
        passo(true, 'conversa da tarefa', `${nome}  (reaproveitada)`);
      } else {
        const rc = await cliente.post('/api/conversations', {
          name: nome,
          type: referencia?.type || 'aionrs',
          model: referencia?.model,
          assistant: referencia?.assistant
            ? {
                id: referencia.assistant.id,
                name: referencia.assistant.name,
                backend: referencia.assistant.backend,
                source: referencia.assistant.source,
              }
            : undefined,
          source: 'aionui',
          extra: {},
        });
        conversa = rc.ok ? rc.dados?.data : null;
        if (conversa) passo(true, 'conversa da tarefa', `${nome}  (criada)`);
        else {
          passo(false, 'conversa da tarefa', `${nome}: ${rc.status} ${(rc.texto || '').slice(0, 120)}`);
          continue;
        }
      }

      // O PUT /api/cron/jobs/{id} espera o schedule como objeto
      // {kind:"cron", expr, tz}. O modelo do repo guarda so a expressao
      // cron como texto, entao montamos o objeto aqui.
      const schedule = {
        kind: 'cron',
        expr: modelo.schedule,
        tz: modelo.schedule_tz || 'America/Sao_Paulo',
        description: modelo.schedule_description || '',
      };
      const agentConfig = {
        name: referencia?.assistant?.name || 'Aion CLI',
        assistant_id: referencia?.assistant?.id,
        mode: 'aionrs',
        model: referencia?.model,
      };

      /* 6.2) tarefa agendada --------------------------------------------- */
      const existente = lista.find((t) => t.name === nome || t.name?.startsWith(nome.split('(')[0].trim()));
      const conversaDaTarefa = existente?.metadata?.conversation_id || existente?.conversation_id || null;

      if (existente && conversaDaTarefa === conversa.id) {
        // Ja esta na conversa certa: so atualiza nome, agenda e mensagem.
        const r = await cliente.put(`/api/cron/jobs/${existente.id}`, {
          name: nome,
          description: modelo.schedule_description || '',
          enabled: true,
          schedule,
          message: mensagem,
          conversation_title: conversa.name,
          execution_mode: 'existing',
          agent_config: agentConfig,
        });
        if (r.ok) passo(true, 'tarefa atualizada', `${nome}  (${modelo.schedule})`);
        else passo(false, 'atualizar tarefa', `${nome}: ${r.status} ${(r.texto || '').slice(0, 120)}`);
        continue;
      }

      // A tarefa existe mas esta presa em outra conversa: o PUT nao troca a
      // conversa, entao recriamos apontando para a conversa dedicada.
      if (existente) {
        const apagada = await cliente.delete(`/api/cron/jobs/${existente.id}`);
        passo(
          apagada.ok,
          'tarefa realocada',
          apagada.ok
            ? `${nome}  (saiu da conversa ${conversaDaTarefa || 'desconhecida'})`
            : `${nome}: ${apagada.status} ${(apagada.texto || '').slice(0, 120)}`
        );
        if (!apagada.ok) continue;
      }

      const r = await cliente.post('/api/cron/jobs', {
        name: nome,
        description: modelo.schedule_description || '',
        schedule,
        message: mensagem,
        conversation_id: conversa.id,
        conversation_title: conversa.name,
        created_by: 'agent',
        execution_mode: 'existing',
        queue_enabled: false,
        agent_config: agentConfig,
      });
      if (r.ok) passo(true, 'tarefa criada', `${nome}  (${modelo.schedule})`);
      else passo(false, 'criar tarefa', `${nome}: ${r.status} ${(r.texto || '').slice(0, 120)}`);
    }
  }

  /* 7) Chrome em modo de depuracao ---------------------------------------- */
  if (!tem('--sem-chrome')) {
    const estado = await core.inspecionarChrome(cdpPorta);
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
              `--remote-debugging-port=${cdpPorta}`,
              `--user-data-dir=${perfilChrome}`,
              '--no-first-run',
              '--no-default-browser-check',
              'https://web.whatsapp.com/',
            ],
            { detached: true, stdio: 'ignore' }
          );
          filho.unref();
          await new Promise((r) => setTimeout(r, 5000));
          const depois = await core.inspecionarChrome(cdpPorta);
          passo(depois.conectado, 'Chrome em modo de depuracao', depois.conectado ? depois.navegador : 'nao respondeu na porta');
        } catch (e) {
          passo(false, 'Chrome em modo de depuracao', String(e.message));
        }
      }
    }
  }

  /* 7b) confere se a conta conectada e a que a estacao espera ------------- */
  if (!tem('--sem-chrome')) {
    const estado = await core.inspecionarChrome(cdpPorta);
    const nomeConectado = estado.conta?.nome || null;
    if (!nomeConectado) {
      passo(false, 'conta conectada', 'nao foi possivel identificar - abra o WhatsApp Web no Chrome de depuracao');
    } else if (contaEsperada && nomeConectado.toLowerCase() !== String(contaEsperada).toLowerCase()) {
      passo(false, 'conta conectada', `"${nomeConectado}" - a estacao foi configurada para "${contaEsperada}"`);
    } else {
      passo(true, 'conta conectada', contaEsperada ? `${nomeConectado} (esperada: ${contaEsperada})` : nomeConectado);
    }
  }

  /* 7c) inicializacao automatica ------------------------------------------- */
  {
    const acao = tem('--sem-inicio') ? 'remover' : 'criar';
    const exeChrome = acharChrome();
    const exeApp = core.acharArquimedes();
    const r = core.gerenciarInicializacao({
      acao,
      exeChrome,
      perfilChrome,
      portaCdp: cdpPorta,
      exeApp,
      iniciarApp: !tem('--sem-iniciar-app'),
    });
    if (acao === 'remover') {
      passo(r.ok, 'inicializacao automatica', r.mensagem);
    } else if (!r.ok) {
      passo(false, 'inicializacao automatica', r.mensagem);
    } else {
      passo(true, 'inicializacao automatica', r.arquivo);
    }
  }

  if (db) db.close();

  /* 8) doctor -------------------------------------------------------------- */
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
