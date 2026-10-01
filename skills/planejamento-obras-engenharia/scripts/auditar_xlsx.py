#!/usr/bin/env python3
"""Auditoria estrutural de planilha de planejamento de obras (SOMENTE LEITURA).

Uso:
    python auditar_xlsx.py <planilha.xlsx> [--recalc]

Detecta heuristicamente os casos de regressao da skill planejamento-obras-engenharia:
  CASO 01 CPM congelado (offset literal em WORKDAY / folga-critica fixas)
  CASO 02 colunas hardcoded
  CASO 04 baseline falsa (=atual)
  CASO 05 LOB com ritmo literal
  CASO 09 validacao insuficiente
  CASO 10 intervalos fixos (heuristica)

Requer: openpyxl.  --recalc usa LibreOffice headless para calcular e contar erros.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

import openpyxl

ERRS = ("#VALUE!", "#NAME?", "#REF!", "#N/A", "#DIV/0!", "#NUM!", "#NULL!", "#CIRC!")
L = []


def w(s=""):
    L.append(str(s))


def is_formula(v):
    return isinstance(v, str) and v.startswith("=")


def audit(path, recalc=False):
    wf = openpyxl.load_workbook(path)
    w("=" * 72)
    w("AUDITORIA ESTRUTURAL — %s" % os.path.basename(path))
    w("=" * 72)

    w("\n## 1. ABAS")
    for ws in wf.worksheets:
        w("  %-22s %4dx%-4d tabelas=%d graficos=%d dv=%d cf=%d" % (
            ws.title, ws.max_row, ws.max_column, len(ws.tables), len(ws._charts),
            len(ws.data_validations.dataValidation), len(ws.conditional_formatting._cf_rules)))

    w("\n## 2. NOMES DEFINIDOS")
    for k, v in wf.defined_names.items():
        w("  %-16s -> %s" % (k, v.attr_text))

    w("\n## 3. REFERENCIAS ENTRE ABAS")
    refs = {}
    for ws in wf.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if is_formula(c.value):
                    for m in re.findall(r"([A-Za-z_][A-Za-z0-9_\- ]*)!\$?[A-Z]", c.value):
                        if m != ws.title:
                            refs[(ws.title, m)] = refs.get((ws.title, m), 0) + 1
    for (s, d), n in sorted(refs.items()):
        w("  %-22s -> %-22s (%d)" % (s, d, n))

    w("\n## 4. FORMULAS x VALORES POR COLUNA (CASO 02)")
    CALC = re.compile(r"es|ef|ls|lf|folga|cr[ií]tic|dura[çc]|desvio|avan[çc]|ritmo|n[ºo°]\s|total|%|saldo|progress|in[íi]cio|t[ée]rmino|fim", re.I)
    hard = []
    for ws in wf.worksheets:
        if ws.max_row < 2:
            continue
        hdr_row = 1
        best = -1
        for rr in range(1, min(6, ws.max_row) + 1):
            k = sum(1 for c in range(1, ws.max_column + 1)
                    if isinstance(ws.cell(rr, c).value, str) and ws.cell(rr, c).value.strip())
            if k > best:
                best = k
                hdr_row = rr
        for col in range(1, ws.max_column + 1):
            h = ws.cell(hdr_row, col).value
            if not isinstance(h, str) or not CALC.search(h):
                continue
            f = v = 0
            for r in range(hdr_row + 1, ws.max_row + 1):
                x = ws.cell(r, col).value
                if is_formula(x):
                    f += 1
                elif x is not None and not isinstance(x, str):
                    v += 1
            if f + v >= 3 and v and not f:
                hard.append((ws.title, openpyxl.utils.get_column_letter(col), str(h).strip()[:22], v))
    for s, c, h, n in hard:
        w("  HARDCODED  %-16s col %-3s [%-22s] %d valores, 0 formulas" % (s, c, h, n))
    w("  colunas de CALCULO 100%% hardcoded: %d  %s" % (len(hard), "<-- BLOQUEANTE" if hard else "(OK)"))

    w("\n## 5. DETECTORES DE REGRESSAO")
    c01 = c04 = c05 = 0
    for ws in wf.worksheets:
        for row in ws.iter_rows():
            for c in row:
                if not is_formula(c.value):
                    continue
                f = c.value
                # CASO 01: WORKDAY(..., <numero literal>, ...) => offset congelado
                if re.search(r"WORKDAY\([^,()]+,\s*-?\d+(\.\d+)?\s*[,)]", f):
                    c01 += 1
                    if c01 <= 5:
                        w("  [CASO 01] %s!%s = %s" % (ws.title, c.coordinate, f[:110]))
                # CASO 04: baseline espelhando o atual  ==  =$E4  /  =$F4
                if re.fullmatch(r"=\$?[A-Z]{1,2}\d+", f.replace(" ", "")):
                    c04 += 1
                    if c04 <= 5:
                        w("  [CASO 04?] %s!%s = %s (espelho de celula unica)" % (ws.title, c.coordinate, f))
                # CASO 05: LOB com ritmo literal
                if re.search(r"WORKDAY\([^,]+,\s*\(\s*\d+\s*-\s*\d+\s*\)\s*\*\s*\d+", f):
                    c05 += 1
                    if c05 <= 5:
                        w("  [CASO 05] %s!%s = %s" % (ws.title, c.coordinate, f[:110]))
    w("  CASO 01 (offset literal em WORKDAY): %d ocorrencias" % c01)
    w("  CASO 04 (celulas espelhando outra):  %d ocorrencias" % c04)
    w("  CASO 05 (ritmo literal na LOB):      %d ocorrencias" % c05)

    w("\n## 6. VALIDACOES DE DADOS (CASO 09)")
    tot = 0
    for ws in wf.worksheets:
        for dv in ws.data_validations.dataValidation:
            tot += 1
            w("  %-22s %-16s %s" % (ws.title, str(dv.sqref), dv.formula1))
    w("  total de validacoes: %d  %s" % (tot, "<-- INSUFICIENTE" if tot < 3 else ""))

    w("\n## 7. GRAFICOS")
    for ws in wf.worksheets:
        for ch in ws._charts:
            nser = len(ch.series) if hasattr(ch, "series") else 0
            w("  %-22s %s  series=%d  %s" % (ws.title, type(ch).__name__, nser,
                                             "<-- pesado" if nser > 15 else ""))

    w("\n## 8. TABELAS (ListObjects)")
    for ws in wf.worksheets:
        for t in ws.tables.values():
            w("  %-22s %-14s %s" % (ws.title, t.displayName, t.ref))

    if recalc:
        w("\n## 9. RECALCULO REAL (LibreOffice)")
        soffice = None
        for c in (["soffice"], ["soffice.exe"],
                  [r"C:\Program Files\LibreOffice\program\soffice.exe"],
                  [r"C:\Program Files (x86)\LibreOffice\program\soffice.exe"],
                  ["/usr/bin/soffice"], ["/Applications/LibreOffice.app/Contents/MacOS/soffice"]):
            try:
                subprocess.run(c + ["--version"], capture_output=True, timeout=30)
                soffice = c
                break
            except Exception:
                continue
        if soffice is None:
            w("  (LibreOffice nao encontrado; pule o recalculo ou instale o LibreOffice)")
        else:
            try:
                out = tempfile.mkdtemp(prefix="audit_recalc_")
                subprocess.run(soffice + ["--headless", "--convert-to", "xlsx", "--outdir", out, path],
                               check=False, capture_output=True, timeout=300)
                rp = os.path.join(out, os.path.basename(path))
                if os.path.exists(rp):
                    wv = openpyxl.load_workbook(rp, data_only=True)
                    tot_e = 0
                    for ws in wv.worksheets:
                        n = sum(1 for row in ws.iter_rows() for c in row
                                if isinstance(c.value, str) and c.value in ERRS)
                        tot_e += n
                        w("  %-22s erros=%d" % (ws.title, n))
                    w("  TOTAL DE ERROS: %d %s" % (tot_e, "<-- BLOQUEANTE" if tot_e else "(OK)"))
                else:
                    w("  (conversao falhou)")
            except Exception as e:
                w("  (erro no recalculo: %s)" % e)

    txt = "\n".join(L)
    print(txt)
    return txt


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("planilha")
    ap.add_argument("--recalc", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(a.planilha):
        print("arquivo nao encontrado: %s" % a.planilha)
        sys.exit(1)
    audit(a.planilha, recalc=a.recalc)


if __name__ == "__main__":
    main()
