import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = path.resolve(process.argv[2] ?? '');
const file = path.join(workspace, 'mcp-readonly.json');
if (!fs.existsSync(file)) throw new Error('mcp-readonly.json does not exist');
const actual = JSON.parse(fs.readFileSync(file, 'utf8'));
const referencePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../fixtures/mcp-readonly-reference.json'
);
const expected = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
const keys = [
  'eap_total_nos',
  'eap_total_problemas',
  'eap_arvore_valida',
  'cron_total_dependencias',
  'cron_total_problemas',
  'cron_rede_valida',
];
for (const key of keys) {
  if (actual[key] !== expected[key]) {
    throw new Error(
      `${key} mismatch: actual=${JSON.stringify(actual[key])}, expected=${JSON.stringify(expected[key])}`
    );
  }
}
console.log(JSON.stringify({ passed: true, verifiedKeys: keys }));
