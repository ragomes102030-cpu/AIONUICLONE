/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Trava de alcance para o motor de precedencia do Kanban.
 *
 * rankByImpact e isCardAtRisk nao tem chamador em producao, e isso e decisao,
 * nao esquecimento: as telas que as usavam foram removidas de proposito em
 * 775108090 porque o pedido do quadro era data de inicio, data de fim e aviso
 * — nao um modelo de rede de precedencias. O codigo ficou, os testes ficaram,
 * e o dado do cliente ficou no banco.
 *
 * O problema que este arquivo existe para impedir ja aconteceu uma vez. Nenhuma
 * linha do repositorio dizia que a ausencia de chamadas era intencional, entao
 * uma auditoria leu "funcoes sem caller + testes passando" e concluiu que era
 * funcionalidade pronta e nao entregue. Quase religou uma tela que o dono tinha
 * recusado de proposito.
 *
 * Este teste falha quando o motor ganha um chamador em producao. Nesse ponto a
 * decisao precisa ser revisitada de proposito, e nao por acaso. Para religar de
 * verdade, remova este arquivo junto com a nota PRECEDENCE ENGINE em
 * kanbanTypes.ts — os dois andam juntos.
 */

import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const PACKAGES = path.join(REPO_ROOT, 'packages');
const KANBAN_TYPES = path.join(PACKAGES, 'desktop/src/common/kanban/kanbanTypes.ts');

/** The two functions that make up the unwired precedence engine. */
const ENGINE_FUNCTIONS = ['rankByImpact', 'isCardAtRisk'] as const;

/** Directories whose contents are not product code. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'build', 'coverage']);

const walk = (dir: string, out: string[] = []): string[] => {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if ((entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) && !entry.name.endsWith('.d.ts')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
};

/** Repo-relative path with forward slashes, so failures name a file clearly. */
const relativePath = (p: string): string => path.relative(REPO_ROOT, p).split(path.sep).join('/');

describe('kanban precedence engine — deliberate disconnection', () => {
  const sources = walk(PACKAGES);

  it.each(ENGINE_FUNCTIONS)('%s has no production caller anywhere under packages/', (fn) => {
    const callers = sources
      .filter((file) => path.resolve(file) !== KANBAN_TYPES)
      // The type export line and the doc comment both mention the name; only a
      // real call site has the identifier followed by an argument list.
      .filter((file) => {
        const src = fs.readFileSync(file, 'utf-8');
        // Strip comments so prose in a JSDoc block cannot count as a call.
        const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
        return new RegExp(`\\b${fn}\\s*\\(`).test(code);
      });

    expect(
      callers.map(relativePath),
      `${fn} gained a production caller. The precedence engine was disconnected on purpose in ` +
        `775108090 — the board answers "is this service late", not "why". If precedence now ` +
        `belongs here, re-enable it deliberately and delete this file plus the PRECEDENCE ENGINE ` +
        `note in packages/desktop/src/common/kanban/kanbanTypes.ts.`
    ).toEqual([]);
  });

  it('the engine still exists in kanbanTypes, ready to be wired', () => {
    const src = fs.readFileSync(KANBAN_TYPES, 'utf-8');
    for (const fn of ENGINE_FUNCTIONS) {
      expect(src, `${fn} was deleted from kanbanTypes`).toContain(`export function ${fn}`);
    }
  });

  it('kanbanTypes documents the disconnection so an audit does not read it as a bug', () => {
    const src = fs.readFileSync(KANBAN_TYPES, 'utf-8');
    expect(src).toContain('PRECEDENCE ENGINE');
    // The note must say it is deliberate, or this file only half does its job.
    expect(src).toMatch(/deliberately not wired|not wired to any screen/i);
  });

  it('the removed screens are not drawn, with the reason at the call site', () => {
    const board = fs.readFileSync(path.join(PACKAGES, 'desktop/src/renderer/pages/kanban/index.tsx'), 'utf-8');
    // The column stays in the database for existing customers but is not drawn.
    expect(board).toContain('DECISIONS_COLUMN_KEY) return null');
    expect(board).toMatch(/PRECEDENCE ENGINE/);
  });
});
