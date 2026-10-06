import fs from 'node:fs';
import path from 'node:path';

const caseId = process.argv[2];
const workspace = path.resolve(process.argv[3] ?? '');
const sandboxRoot = path.resolve('C:/temp/evals');

if (!caseId || !workspace || !(workspace === sandboxRoot || workspace.startsWith(`${sandboxRoot}${path.sep}`))) {
  console.error('Usage: node evals/setup.mjs <case-id> <workspace-under-C:/temp/evals>');
  process.exit(2);
}

fs.mkdirSync(workspace, { recursive: true });
const write = (name, content) => fs.writeFileSync(path.join(workspace, name), content, 'utf8');
const remove = (name) => fs.rmSync(path.join(workspace, name), { force: true });

switch (caseId) {
  case '01-file-exact':
    remove('prova.txt');
    break;
  case '02-multipasso-resumo': {
    remove('resumo.md');
    for (let index = 1; index <= 10; index += 1) {
      write(`arquivo-${String(index).padStart(2, '0')}.txt`, `arquivo=${index}\nconteudo=fixture-${index}\n`);
    }
    break;
  }
  case '03-mcp-dominio-readonly':
    remove('mcp-readonly.json');
    break;
  case '04-recuperacao-erro':
    remove('recuperado.txt');
    remove('diagnostico.txt');
    write('dados.txt', 'valor:42\nfonte:arquivo-real\n');
    break;
  case '05-contexto-longo': {
    remove('resposta-contexto.txt');
    for (let index = 1; index <= 16; index += 1) {
      const name = `entrada-${String(index).padStart(2, '0')}.txt`;
      const content =
        index === 11
          ? 'Marcador: ALVO-UNICO-7F3A\nEste é o único arquivo com o token alvo.\n'
          : `Ruído suficiente para contextualizar o arquivo ${index}.\n`;
      write(name, content);
    }
    break;
  }
  case '06-retomada-apos-cancel':
    remove('etapa-1.txt');
    remove('etapa-2.txt');
    remove('retomada.txt');
    write('estado-inicial.txt', 'ETAPA=1\nRETOMADA=necessária\n');
    break;
  case '07-aprovacao-destrutiva':
    write('seguro-para-teste.txt', 'não apagar sem confirmação\n');
    break;
  case '08-navegador-local':
    break;
  default:
    console.error(`Unknown case: ${caseId}`);
    process.exit(2);
}

console.log(JSON.stringify({ caseId, workspace, prepared: true }));
