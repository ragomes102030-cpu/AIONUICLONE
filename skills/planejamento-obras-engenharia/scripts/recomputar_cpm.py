#!/usr/bin/env python3
"""Validacao matematica independente do CPM (forward + backward pass).

Uso:
    python recomputar_cpm.py <dados.json>

Formato aceito (JSON):
{
  "atividades":   [{"id": "A1", "nome": "...", "duracao_dias": 10}, ...],
  "dependencias": [{"predecessora_id": "A1", "sucessora_id": "A2", "tipo": "TI", "lag_dias": 0}, ...],
  "cpm": {"duracao_total_dias": 172, "caminho_critico": [{"id":"A1","es":0,"ef":5,...}]}   # opcional
}

Tipos: TI=Término-Início (FS) · II=Início-Início (SS) · TT=Término-Término (FF) · IT=Início-Término (SF)
Dias uteis; a comparacao e em dias (offset a partir do inicio da obra).
Tambem aceita o JSON do MCP (chaves atividades/dependencias/cpm com essas estruturas).
"""
import json
import sys


def carregar(caminho):
    d = json.load(open(caminho, encoding="utf-8"))
    ativs = d.get("atividades") or []
    if isinstance(ativs, dict):
        ativs = ativs.get("atividades") or []
    deps = d.get("dependencias") or []
    if isinstance(deps, dict):
        deps = deps.get("dependencias") or []
    cpm = d.get("cpm") or {}
    return ativs, deps, cpm


def norm_tipo(t):
    return {"TI": "FS", "II": "SS", "TT": "FF", "IT": "SF",
            "FS": "FS", "SS": "SS", "FF": "FF", "SF": "SF"}.get(str(t).upper(), "FS")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    ativs, deps, cpm = carregar(sys.argv[1])

    dur = {}
    nome = {}
    for a in ativs:
        k = a.get("id") or a.get("atividade_id") or a.get("nome")
        dur[k] = float(a.get("duracao_dias") or a.get("duracao") or 0)
        nome[k] = a.get("nome", k)
    preds, succ = {}, {}
    for dp in deps:
        p = dp.get("predecessora_id") or dp.get("predecessora")
        s = dp.get("sucessora_id") or dp.get("sucessora")
        t = norm_tipo(dp.get("tipo"))
        lag = float(dp.get("lag_dias") or dp.get("lag") or 0)
        preds.setdefault(s, []).append((p, t, lag))
        succ.setdefault(p, []).append((s, t, lag))

    ES = {k: 0.0 for k in dur}
    EF = {k: dur[k] for k in dur}
    for _ in range(len(dur) + 2):
        for s, plist in preds.items():
            for p, t, lag in plist:
                if t == "FS":
                    cand = EF[p] + lag
                elif t == "SS":
                    cand = ES[p] + lag
                elif t == "FF":
                    cand = EF[p] + lag - dur[s]
                else:
                    cand = ES[p] + lag - dur[s]
                if cand > ES[s]:
                    ES[s] = cand
                    EF[s] = ES[s] + dur[s]
    T = max(EF.values()) if EF else 0.0

    LF = {k: T for k in dur}
    LS = {k: T - dur[k] for k in dur}
    for _ in range(len(dur) + 2):
        for p, slist in succ.items():
            for s, t, lag in slist:
                if t == "FS":
                    cand = LS[s] - lag
                elif t == "SS":
                    cand = LS[s] - lag + dur[p]
                elif t == "FF":
                    cand = LF[s] - lag
                else:
                    cand = LF[s] - lag + dur[p]
                if cand < LF[p]:
                    LF[p] = cand
                    LS[p] = LF[p] - dur[p]
    folga = {k: LS[k] - ES[k] for k in dur}

    print("=" * 78)
    print("CPM RECOMPUTADO INDEPENDENTEMENTE")
    print("=" * 78)
    print("atividades=%d  relacoes=%d" % (len(dur), len(deps)))
    mcp_T = cpm.get("duracao_total_dias")
    print("duracao total recomputada = %.0f  |  informada = %s  %s" % (
        T, mcp_T, "OK" if mcp_T is None or abs(T - float(mcp_T)) < 0.01 else "<<< DIVERGE"))

    ref = {}
    for x in (cpm.get("caminho_critico") or []) + (cpm.get("atividades") or []):
        k = x.get("id") or x.get("atividade_id")
        if k:
            ref[k] = x

    print("\n%-34s %7s %7s %7s %7s %7s %5s | %7s %7s %s" % (
        "ATIVIDADE", "ES", "EF", "LS", "LF", "FOLGA", "CRIT", "ESref", "EFref", "DIF"))
    div = 0
    for k in dur:
        r = ref.get(k, {})
        d = ""
        for campo, val in (("es", ES[k]), ("ef", EF[k]), ("ls", LS[k]), ("lf", LF[k])):
            rv = r.get(campo)
            if rv is not None and abs(val - float(rv)) > 0.01:
                d += " %s DIFERE" % campo.upper()
                div += 1
        print("%-34s %7.0f %7.0f %7.0f %7.0f %7.0f %5s | %7s %7s %s" % (
            str(nome[k])[:34], ES[k], EF[k], LS[k], LF[k], folga[k],
            "SIM" if folga[k] <= 0 else "NAO", r.get("es"), r.get("ef"), d))
    print("\nDIVERGENCIAS: %d  %s" % (div, "<<< BLOQUEANTE" if div else "(OK)"))
    print("caminho critico recomputado: %s" % ", ".join(
        str(nome[k])[:24] for k in dur if folga[k] <= 0))
    return 0 if div == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
