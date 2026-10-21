#!/usr/bin/env node
/**
 * doctor.js - diagnostico da estacao WhatsApp do Arquimedes.
 *
 *   node doctor.js            -> relatorio para humanos (tabela)
 *   node doctor.js --json     -> relatorio para maquinas (JSON)
 *
 * Verifica, em ordem:
 *   1. Chrome em modo de depuracao (porta 9222) e aba do WhatsApp
 *   2. Sessao do WhatsApp Web ativa (ou expirada / pedindo QR)
 *   3. Chat aberto no WhatsApp
 *   4. Data-dir do Arquimedes e o banco de dados
 *   5. Skill whatsapp-automation: no disco, registrada no catalogo, path valido
 *   6. Skills quebradas no catalogo (path apontando para pastas apagadas)
 *   7. Tarefas de cron (resumo diario e semanal)
 *   8. Pasta de obras onde os resumos sao gravados
 */

const path = require('path');
const core = require('./station-core');

const args = process.argv.slice(2);
const tem = (n) => args.includes(n);
const valor = (n, padrao) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : padrao;
};

const OBRA_PADRAO = process.env.ARQUIMEDES_OBRAS || 'C:\\Arquimedes\\obras';

async function coletar() {
  const dataDir = core.descobrirDataDir(valor('--data-dir', null));
  const portaCdp = Number(valor('--cdp', String(core.DEFAULT_CDP_PORT)));

  const chrome = await core.inspecionarChrome(portaCdp);
  const db = core.abrirBanco(dataDir);
  const skills = core.inspecionarSkills(db);
  const cron = core.inspecionarCron(db);
  const conversas = core.listarConversas(db);
  if (db) db.close();

  const api = await core.descobrirApi({ url: valor('--url', null), porta: valor('--port', null) });
  let cronApi = null;
  if (api.base) {
    const cliente = new core.Api(api.base, { conversationId: conversas[0]?.id });
    const r = await cliente.get('/api/cron/jobs');
    if (r.ok && r.dados?.data) {
      cronApi = {
        total: r.dados.data.length,
        tarefas: r.dados.data.map((t) => ({
          id: t.id,
          nome: t.name,
          ativa: !!t.enabled,
          expressao: t.schedule?.expr || null,
          fuso: t.schedule?.tz || null,
          ultimaExecucao: t.last_run_at || null,
          ultimoStatus: t.last_status || null,
        })),
      };
    }
  }

  const skillInstalada = core.caminhoSkillInstalada(dataDir);
  const skillNoDisco = require('fs').existsSync(path.join(skillInstalada, 'SKILL.md'));

  return {
    geradoEm: new Date().toISOString(),
    dataDir,
    banco: { caminho: core.caminhoBanco(dataDir), existe: require('fs').existsSync(core.caminhoBanco(dataDir)) },
    chrome,
    skill: {
      pasta: skillInstalada,
      noDisco: skillNoDisco,
      registrada: !!skills.whatsapp,
      registro: skills.whatsapp,
    },
    skills: {
      total: skills.total,
      ok: skills.ok,
      quebradas: skills.quebradas.length,
      exemplosQuebrados: skills.quebradas.slice(0, 5),
      porFonte: skills.porFonte,
    },
    cron: { banco: cron.total, api: cronApi },
    api: { base: api.base, origem: api.origem },
    conversas: conversas.length,
    obras: OBRA_PADRAO,
  };
}

/* ------------------------------------------------------------- apresentacao */

function linha(rotulo, v, ok) {
  const marca = ok === true ? '[ ok ]' : ok === false ? '[!! ]' : '[ -- ]';
  console.log(`  ${marca} ${rotulo.padEnd(30)} ${v}`);
}

function apresentar(r) {
  console.log('');
  console.log('  Diagnostico da estacao WhatsApp - Arquimedes');
  console.log('  ============================================');
  console.log('');

  console.log('  CHROME');
  if (r.chrome.conectado) {
    linha('navegador', r.chrome.navegador, true);
    linha('porta de depuracao', String(r.chrome.porta), true);
    linha('abas abertas', String(r.chrome.abas), true);
    if (r.chrome.abaWhatsapp) {
      linha('aba do WhatsApp', r.chrome.abaWhatsapp.titulo, true);
      linha('sessao do WhatsApp', r.chrome.sessaoAtiva ? 'ativa' : 'EXPIRADA - precisa escanear o QR de novo', r.chrome.sessaoAtiva);
      linha('chat aberto', r.chrome.chatAberto || 'nenhum - abra o chat antes de coletar', !!r.chrome.chatAberto);
    } else {
      linha('aba do WhatsApp', r.chrome.motivo || 'nao encontrada', false);
    }
  } else {
    linha('Chrome em depuracao', r.chrome.motivo, false);
    console.log('         Starting: "chrome.exe" --remote-debugging-port=9222 --user-data-dir=C:\\Arquimedes\\chrome-arquimedes');
  }
  console.log('');

  console.log('  ARQUIMEDES');
  linha('data-dir', r.dataDir, true);
  linha('banco de dados', r.banco.existe ? 'presente' : 'AUSENTE', r.banco.existe);
  linha('API do backend', r.api.base || 'nao encontrada (o app esta aberto?)', !!r.api.base);
  linha('conversas', String(r.conversas), true);
  console.log('');

  console.log('  SKILL whatsapp-automation');
  linha('pasta no data-dir', r.skill.pasta, r.skill.noDisco);
  linha('pasta existe', r.skill.noDisco ? 'sim' : 'NAO - rode o instalador da estacao', r.skill.noDisco);
  linha('registrada no catalogo', r.skill.registrada ? 'sim' : 'NAO - a IA nao consegue usa-la', r.skill.registrada);
  if (r.skill.registrada && !r.skill.registro?.existe) {
    linha('caminho do catalogo', r.skill.registro?.path || '(vazio)', false);
  }
  console.log('');

  console.log('  CATALOGO DE SKILLS');
  linha('total de skills', String(r.skills.total), true);
  linha('com caminho valido', String(r.skills.ok), r.skills.quebradas === 0);
  linha('com caminho quebrado', String(r.skills.quebradas), r.skills.quebradas === 0);
  if (r.skills.quebradas > 0) {
    console.log('         exemplos:');
    for (const q of r.skills.exemplosQuebrados) console.log(`           - ${q.name}  ->  ${q.path}`);
    console.log('         rode o instalador da estacao para corrigir os caminhos');
  }
  console.log('');

  console.log('  TAREFAS AGENDADAS');
  const lista = r.cron.api?.tarefas || r.cron.banco?.tarefas || [];
  if (lista.length === 0) {
    linha('tarefas', 'nenhuma - o resumo nao vai rodar sozinho', false);
  } else {
    for (const t of lista) {
      const quando = t.expressao ? `${t.expressao}${t.fuso ? ' (' + t.fuso + ')' : ''}` : t.expressao || '';
      linha(t.nome, `${quando} ${t.ativa ? '(ativa)' : '(inativa)'}`, t.ativa);
    }
  }
  console.log('');

  console.log('  RESUMOS');
  linha('pasta de obras', r.obras, true);
  console.log('');
  console.log('  ' + '-'.repeat(58));
  const problemas = [];
  if (!r.chrome.conectado) problemas.push('Chrome nao esta em modo de depuracao');
  if (r.chrome.conectado && !r.chrome.abaWhatsapp) problemas.push('aba do WhatsApp nao esta aberta');
  if (r.chrome.conectado && r.chrome.abaWhatsapp && !r.chrome.sessaoAtiva) problemas.push('sessao do WhatsApp expirada');
  if (!r.skill.noDisco) problemas.push('skill nao instalada no data-dir');
  if (!r.skill.registrada) problemas.push('skill nao registrada no catalogo');
  if (r.skills.quebradas > 0) problemas.push(`${r.skills.quebradas} skills com caminho quebrado`);
  if (lista.length === 0) problemas.push('nenhuma tarefa agendada');
  if (problemas.length === 0) {
    console.log('   ESTACAO PRONTA - o resumo diario vai rodar as 7:00');
  } else {
    console.log('   PENDENCIAS:');
    for (const p of problemas) console.log('     - ' + p);
  }
  console.log('');
}

(async () => {
  const r = await coletar();
  if (tem('--json')) {
    process.stdout.write(JSON.stringify(r, null, 2));
  } else {
    apresentar(r);
  }
  process.exit(0);
})().catch((e) => {
  console.error('ERRO no diagnostico: ' + (e && e.message ? e.message : e));
  process.exit(1);
});
