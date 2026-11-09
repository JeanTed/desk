#!/usr/bin/env python3
"""Robot des options du Desk : Nasdaq 100 (via l'ETF QQQ) et S&P 500 (^SPX).

Tourne sur GitHub juste après robot.mjs. Il lit les chaînes d'options sur Yahoo Finance
(bibliothèque yfinance, usage personnel / recherche), calcule pour chaque échéance
l'open interest des calls et des puts, le put/call et le max pain, puis les « murs »
(strikes où l'open interest est le plus gros), et publie :
    site/data/options.json
et ajoute son état dans site/data/meta.json (affiché dans l'espace Connexions).

Règles :
- Si Yahoo ne répond pas pour un indice, la dernière version publiée est conservée.
- Pour ne pas se faire refuser par Yahoo, le script ne réinterroge Yahoo que si le
  fichier publié a plus de 25 minutes (le robot tourne toutes les 10 minutes).
- Une panne de ce script ne bloque jamais la publication du Desk (voir desk.yml).
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

OUT = "site"
SITE = os.environ.get("SITE_URL", "").rstrip("/")
# clé du Desk -> (symbole dont on lit les options, symbole de l'indice affiché)
# Nasdaq 100 : la chaîne de ^NDX est trop maigre sur Yahoo, on lit celle de l'ETF QQQ (très liquide)
# et on convertit les strikes en points de l'indice avec le rapport indice / QQQ.
INDICES = {"NDX": ("QQQ", "^NDX"), "SPX": ("^SPX", "^SPX")}
MULT = 100                                   # une option sur indice = 100 x l'indice
NB_ECHEANCES = 8                             # nombre d'échéances lues par indice
MAX_AGE_MIN = 25                             # on ne réinterroge Yahoo qu'au-delà
PAUSE = 1.0                                  # secondes entre deux requêtes Yahoo


def get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (DeskRobot)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def previous(name):
    """Dernière version publiée (ou None)."""
    if not SITE:
        return None
    try:
        return get_json(f"{SITE}/data/{name}")
    except Exception:
        return None


def max_pain(strikes):
    """Prix d'exercice où les vendeurs d'options paient le moins : strikes = {k: (calls, puts)}."""
    ks = sorted(strikes)
    best, best_v = None, float("inf")
    for p in ks:
        v = 0.0
        for k in ks:
            c, put = strikes[k]
            if p > k:
                v += c * (p - k)
            if p < k:
                v += put * (k - p)
        if v < best_v:
            best, best_v = p, v
    return best


def chain_stats(calls, puts, spot):
    """calls / puts : listes de (strike, open_interest). Renvoie les chiffres d'une échéance."""
    strikes = {}
    for k, oi in calls:
        strikes.setdefault(k, [0, 0])[0] += oi
    for k, oi in puts:
        strikes.setdefault(k, [0, 0])[1] += oi
    c = sum(oi for _, oi in calls)
    p = sum(oi for _, oi in puts)
    return {
        "c": c,
        "p": p,
        "usd": round((c + p) * MULT * spot),
        "pcr": round(p / c, 3) if c else None,
        "mp": max_pain({k: tuple(v) for k, v in strikes.items()}) if strikes else None,
        "by": strikes,
    }


def clean(rows):
    """DataFrame yfinance -> [(strike, open_interest)] sans valeurs vides."""
    out = []
    for _, r in rows.iterrows():
        try:
            k = float(r["strike"])
            oi = r.get("openInterest")
            oi = 0 if oi is None or oi != oi else int(oi)   # NaN -> 0
        except Exception:
            continue
        if k > 0 and oi > 0:
            out.append((k, oi))
    return out


def prix(yf, symbole):
    t = yf.Ticker(symbole)
    spot = None
    try:
        spot = float(t.fast_info["last_price"])
    except Exception:
        try:
            spot = float(t.history(period="5d")["Close"].dropna().iloc[-1])
        except Exception:
            spot = None
    if not spot or spot <= 0:
        raise RuntimeError(f"prix de {symbole} introuvable")
    return t, spot


def lire_indice(yf, cle, sym_opt, sym_idx):
    t, spot_opt = prix(yf, sym_opt)
    if sym_idx == sym_opt:
        spot_idx = spot_opt
    else:
        _, spot_idx = prix(yf, sym_idx)
    ratio = spot_idx / spot_opt          # 1 pour ^SPX, environ 40 pour QQQ -> ^NDX
    dates = list(t.options or [])
    if not dates:
        raise RuntimeError(f"aucune échéance reçue pour {sym_opt}")
    echeances, murs = [], {}
    for d in dates[:NB_ECHEANCES]:
        time.sleep(PAUSE)
        ch = t.option_chain(d)
        calls, puts = clean(ch.calls), clean(ch.puts)
        if not calls and not puts:
            continue
        s = chain_stats(calls, puts, spot_opt)       # notionnel en dollars réels
        for k, (c, p) in s.pop("by").items():
            m = murs.setdefault(k, [0, 0])
            m[0] += c
            m[1] += p
        if s.get("mp") is not None:
            s["mp"] = round(s["mp"] * ratio, 2)      # max pain en points de l'indice
        s["date"] = d
        # expiration à 21 h 15 UTC (clôture américaine) : suffisant pour « dans X jours »
        s["ts"] = int(datetime.strptime(d, "%Y-%m-%d").replace(hour=21, minute=15, tzinfo=timezone.utc).timestamp() * 1000)
        echeances.append(s)
    if not echeances:
        raise RuntimeError(f"chaînes d'options vides pour {sym_opt}")
    strikes = [{"k": round(k * ratio, 2), "c": v[0], "p": v[1]} for k, v in murs.items()]
    return {
        "spot": spot_idx,
        "mult": MULT * spot_opt / spot_idx,   # contrats x mult x indice = dollars réels
        "src": sym_opt,
        "ratio": round(ratio, 4),
        "exp": echeances,
        "calls": sorted(strikes, key=lambda x: -x["c"])[:8],
        "puts": sorted(strikes, key=lambda x: -x["p"])[:8],
    }


def main():
    os.makedirs(f"{OUT}/data", exist_ok=True)
    prev = previous("options.json") or {}
    now = int(time.time() * 1000)
    # le fichier précédent n'est réutilisé que s'il est récent, complet et au format actuel
    # (une même source d'options par indice) : sinon on relit Yahoo tout de suite
    format_ok = all(prev.get("idx", {}).get(k, {}).get("src") == sym for k, (sym, _) in INDICES.items())
    if prev.get("ts") and (now - prev["ts"]) < MAX_AGE_MIN * 60000 and format_ok:
        print("options.json récent : on le republie tel quel.")
        write(prev, None)
        return 0

    try:
        import yfinance as yf
    except Exception as e:
        print("yfinance indisponible :", e)
        write(prev if prev else {"ts": now, "idx": {}}, {k: (False, 0, e) for k in INDICES})
        return 0

    result = {"ts": now, "idx": dict(prev.get("idx", {}))}
    etat = {}
    for cle, (sym, sym_idx) in INDICES.items():
        try:
            data = lire_indice(yf, cle, sym, sym_idx)
            data["ts"] = now
            result["idx"][cle] = data
            etat[cle] = (True, len(data["exp"]), None)
            print(f"{cle} (options {sym}) : {len(data['exp'])} échéances, indice {data['spot']:.2f}")
        except Exception as e:           # on garde l'ancienne version de cet indice
            etat[cle] = (False, 0, e)
            print(f"{cle} ({sym}) : ERREUR {type(e).__name__}: {str(e)[:160]}")
    if any(ok for ok, _, _ in etat.values()):
        result["ts"] = now
    else:
        result["ts"] = prev.get("ts", now)   # rien de neuf : l'âge reste celui de l'ancienne version
    write(result, etat)
    return 0


def write(result, etat):
    with open(f"{OUT}/data/options.json", "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"))
    # ajoute l'état dans meta.json (créé par robot.mjs juste avant)
    if etat is None:
        return
    try:
        with open(f"{OUT}/data/meta.json", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception:
        meta = {"ts": int(time.time() * 1000), "sources": {}}
    for cle, (ok, n, err) in etat.items():
        meta.setdefault("sources", {})["opt_" + cle.lower()] = {
            "ok": bool(ok), "n": n, "err": "" if ok else f"{type(err).__name__}: {str(err)[:140]}",
            "ts": int(time.time() * 1000),
        }
    with open(f"{OUT}/data/meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))


if __name__ == "__main__":
    sys.exit(main())
