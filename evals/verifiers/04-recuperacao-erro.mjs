import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(process.argv[2] ?? '');
const resultFile = path.join(workspace, 'recuperado.txt');
const diagnosticFile = path.join(workspace, 'diagnostico.txt');
if (!fs.existsSync(resultFile) || !fs.existsSync(diagnosticFile)) {
  throw new Error('recovery artifacts are missing');
}
const result = fs.readFileSync(resultFile, 'utf8');
const diagnostic = fs.readFileSync(diagnosticFile, 'utf8');
if (!result.includes('valor:42')) throw new Error('fallback result valor:42 is missing');
if (!diagnostic.includes('ERRO:arquivo-que-nao-existe.txt')) throw new Error('missing diagnostic for missing file');
if (!diagnostic.includes('CONTORNO:usar dados.txt')) throw new Error('missing fallback in diagnostic');
console.log(
  JSON.stringify({
    passed: true,
    resultBytes: Buffer.byteLength(result),
    diagnosticBytes: Buffer.byteLength(diagnostic),
  })
);
