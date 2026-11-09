#!/usr/bin/env python3
"""Robot des futures du Desk : MNQ et MES (contrats micro du CME), lus sur Yahoo Finance.

Tourne sur GitHub après robot.mjs. Pour chaque contrat (MNQ=F, MES=F), il lit les bougies
de 15 minutes du dernier mois (bibliothèque yfinance, usage personnel) et calcule les mêmes
niveaux que le Desk : ouverture du jour/semaine/mois (00 h UTC), plus haut/bas d'hier et de
la semaine dernière, plus haut/bas des sessions Tokyo, Londres et New York.
Il publie site/data/futpx.json et ajoute son état dans site/data/meta.json.

Il lit aussi le perpétuel OKX de l'indice au même moment : l'écart entre le contrat et ce
perpétuel permet au Desk de garder un prix en direct cohérent avec les niveaux du contrat.

Règles :
- Si Yahoo ne répond pas, la dernière version publiée est conservée (le Desk la juge périmée
  au bout de 45 minutes et revient à son estimation).
- Une panne de ce script ne bloque jamais la publication du Desk (voir desk.yml).
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

OUT = "site"
SITE = os.environ.get("SITE_URL", "").rstrip("/")
# clé du Desk -> (contrat Yahoo, perpétuel OKX de l'indice)
CONTRATS = {"MNQ": ("MNQ=F", "US100-USDT-SWAP"), "MES": ("MES=F", "SPX-USDT-SWAP"),
             "YM": ("YM=F", None), "RTY": ("RTY=F", None)}  # YM (Dow) et RTY (Russell) : niveaux seuls, sans perpétuel OKX
SESSIONS = [("TK", "Asia/Tokyo", (9, 0), (15, 0)), ("LD", "Europe/London", (8, 0), (16, 30)),
            ("NY", "America/New_York", (9, 30), (16, 0))]


def get_json(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (DeskRobot)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def previous(name):
    if not SITE:
        return None
    try:
        return get_json(f"{SITE}/data/{name}", 10)
    except Exception:
        return None


def session_window(tz, o, c, now):
    """Fenêtre [ouverture, fermeture] (UTC) de la session la plus récente ouverte, jours de semaine."""
    z = ZoneInfo(tz)
    d = now.astimezone(z).date()
    for _ in range(6):
        if d.weekday() < 5:
            op = datetime(d.year, d.month, d.day, o[0], o[1], tzinfo=z).astimezone(timezone.utc)
            if op <= now:
                cl = datetime(d.year, d.month, d.day, c[0], c[1], tzinfo=z).astimezone(timezone.utc)
                return op, cl
        d -= timedelta(days=1)
    return None


def niveaux(bars, now):
    """bars : liste de (datetime UTC, ouverture, haut, bas, clôture), triée. Retourne la liste des niveaux."""
    L = []

    def add(k, px, t=""):
        if px and px > 0:
            L.append({"k": k, "px": round(float(px), 2), "t": t})

    today = now.date()
    days = sorted({b[0].date() for b in bars})
    bydate = {}
    for b in bars:
        bydate.setdefault(b[0].date(), []).append(b)
    if today in bydate:
        add("DO", bydate[today][0][1])
    prev_days = [d for d in days if d < today]
    if prev_days:
        pd = bydate[prev_days[-1]]
        add("PDH", max(x[2] for x in pd))
        add("PDL", min(x[3] for x in pd))
        add("PDC", pd[-1][4])
    monday = today - timedelta(days=today.weekday())
    wk = [b for b in bars if b[0].date() >= monday]
    if wk:
        add("WO", wk[0][1])
    pw = [b for b in bars if monday - timedelta(days=7) <= b[0].date() < monday]
    if pw:
        add("PWH", max(x[2] for x in pw))
        add("PWL", min(x[3] for x in pw))
    mo = [b for b in bars if b[0].year == today.year and b[0].month == today.month]
    if mo:
        add("MO", mo[0][1])
    for code, tz, o, c in SESSIONS:
        w = session_window(tz, o, c, now)
        if not w:
            continue
        sel = [b for b in bars if w[0] <= b[0] < w[1]]
        if sel:
            live = now < w[1]
            add(code + "H", max(x[2] for x in sel), "en cours" if live else "")
            add(code + "L", min(x[3] for x in sel), "en cours" if live else "")
    return L


def lire(yf, cle, sym, okx):
    h = yf.Ticker(sym).history(period="1mo", interval="15m")
    if h is None or len(h) < 50:
        raise RuntimeError("peu de bougies reçues (%d)" % (0 if h is None else len(h)))
    bars = []
    for ts, r in h.iterrows():
        t = ts.to_pydatetime()
        t = t.astimezone(timezone.utc) if t.tzinfo else t.replace(tzinfo=timezone.utc)
        if r["High"] > 0 and r["Low"] > 0:
            bars.append((t, float(r["Open"]), float(r["High"]), float(r["Low"]), float(r["Close"])))
    bars.sort(key=lambda b: b[0])
    now = datetime.now(timezone.utc)
    if (now - bars[-1][0]).total_seconds() > 5 * 86400:
        raise RuntimeError("dernières bougies trop anciennes")
    last = bars[-1][4]
    out = {"sym": sym, "last": round(last, 2), "bar": int(bars[-1][0].timestamp() * 1000), "L": niveaux(bars, now)}
    # écart avec le perpétuel OKX au même moment (seulement si la bougie est récente)
    try:
        if okx and (now - bars[-1][0]).total_seconds() < 3600:
            j = get_json("https://www.okx.com/api/v5/market/ticker?instId=" + okx, 8)
            p = float(j["data"][0]["last"])
            if p > 0 and abs(last / p - 1) < 0.03:
                out["okx"] = round(p, 2)
                out["basis"] = round(last - p, 2)
    except Exception as e:
        print(cle, "OKX indisponible :", type(e).__name__)
    return out


# Corrélations : séries quotidiennes (Yahoo). Clé -> (symbole, "ret" rendement en % ou "diff" variation en points)
SERIES = {"NQ": ("NQ=F", "ret"), "ES": ("ES=F", "ret"), "BRENT": ("BZ=F", "ret"), "OR": ("GC=F", "ret"),
          "USD": ("DX-Y.NYB", "ret"), "T10": ("^TNX", "diff"), "VIX": ("^VIX", "ret")}
PAIRES = [("BRENT", "NQ", "Pétrole / Nasdaq", "négative"), ("BRENT", "OR", "Pétrole / Or", "faible"),
          ("NQ", "OR", "Nasdaq / Or", "variable"), ("NQ", "USD", "Nasdaq / Dollar", "négative"),
          ("NQ", "T10", "Nasdaq / Taux 10 ans", "négative"), ("NQ", "VIX", "Nasdaq / VIX", "négative")]


def correlations(yf):
    import pandas as pd
    cols = {}
    for cle, (sym, mode) in SERIES.items():
        h = yf.Ticker(sym).history(period="8mo", interval="1d")
        if h is None or len(h) < 60:
            continue
        c = h["Close"].copy()
        c.index = [i.date() for i in c.index]
        c = c[~c.index.duplicated(keep="last")]
        cols[cle] = c.pct_change() * 100 if mode == "ret" else c.diff()
        time.sleep(0.8)
    df = pd.DataFrame(cols).dropna(how="all")
    out = []
    for a, b, nom, attendu in PAIRES:
        if a not in df or b not in df:
            continue
        d = df[[a, b]].dropna()
        if len(d) < 30:
            continue
        c30 = d.tail(30).corr().iloc[0, 1]
        c90 = d.tail(90).corr().iloc[0, 1] if len(d) >= 60 else None
        out.append({"nom": nom, "attendu": attendu, "c30": round(float(c30), 2),
                    "c90": None if c90 is None or c90 != c90 else round(float(c90), 2), "n": int(min(len(d), 90))})
    if not out:
        raise RuntimeError("aucune paire calculable")
    return out


def main():
    os.makedirs(f"{OUT}/data", exist_ok=True)
    prev = previous("futpx.json") or {}
    now = int(time.time() * 1000)
    try:
        import yfinance as yf
    except Exception as e:
        print("yfinance indisponible :", e)
        write(prev if prev else {"ts": now, "fut": {}}, {k: (False, 0, e) for k in CONTRATS})
        return 0
    result = {"ts": now, "fut": dict(prev.get("fut", {}))}
    etat = {}
    for cle, (sym, okx) in CONTRATS.items():
        try:
            d = lire(yf, cle, sym, okx)
            d["ts"] = now
            result["fut"][cle] = d
            etat[cle] = (True, len(d["L"]), None)
            print(f"{cle} ({sym}) : dernier {d['last']}, {len(d['L'])} niveaux, écart OKX {d.get('basis')}")
        except Exception as e:
            etat[cle] = (False, 0, e)
            print(f"{cle} ({sym}) : ERREUR {type(e).__name__}: {str(e)[:160]}")
        time.sleep(1.0)
    # corrélations : recalculées au plus toutes les 6 h (séries quotidiennes), sinon on garde les précédentes
    old = prev.get("corr") or {}
    if old.get("rows") and now - old.get("ts", 0) < 6 * 3600000:
        result["corr"] = old
        etat["CORR"] = (True, len(old["rows"]), None)
    else:
        try:
            result["corr"] = {"ts": now, "rows": correlations(yf)}
            etat["CORR"] = (True, len(result["corr"]["rows"]), None)
            print("corrélations :", len(result["corr"]["rows"]), "paires")
        except Exception as e:
            etat["CORR"] = (False, 0, e)
            print("corrélations : ERREUR", type(e).__name__, str(e)[:160])
            if old:
                result["corr"] = old
    if any(ok for ok, _, _ in etat.values()):
        result["ts"] = now
    else:
        result["ts"] = prev.get("ts", now)
    write(result, etat)
    return 0


def write(result, etat):
    with open(f"{OUT}/data/futpx.json", "w", encoding="utf-8") as f:
        json.dump(result, f, separators=(",", ":"))
    if etat is None:
        return
    try:
        with open(f"{OUT}/data/meta.json", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception:
        meta = {"ts": int(time.time() * 1000), "sources": {}}
    for cle, (ok, n, err) in etat.items():
        meta.setdefault("sources", {})["fut_" + cle.lower()] = {
            "ok": bool(ok), "n": n, "err": "" if ok else f"{type(err).__name__}: {str(err)[:140]}",
            "ts": int(time.time() * 1000),
        }
    with open(f"{OUT}/data/meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))


if __name__ == "__main__":
    sys.exit(main())
