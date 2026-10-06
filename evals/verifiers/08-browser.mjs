import fs from 'node:fs';
import path from 'node:path';

const workspace = path.resolve(process.argv[2] ?? '');
const marker = path.join(workspace, 'NOT_TESTABLE');
if (!fs.existsSync(marker)) {
  console.error(
    JSON.stringify({ passed: false, status: 'NOT_TESTABLE', reason: 'No functional browser MCP was confirmed' })
  );
  process.exit(2);
}
console.log(
  JSON.stringify({ passed: false, status: 'NOT_TESTABLE', reason: 'No functional browser MCP was confirmed' })
);
process.exit(2);
