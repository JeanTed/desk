#!/usr/bin/env python3
"""Dates des prochains résultats trimestriels des poids lourds du Nasdaq 100 et du S&P 500 (Yahoo Finance, yfinance).

Tourne sur GitHub après futpx.py. Écrit site/data/resultats.json : [{s, n, date (AAAA-MM-JJ), eps}].
Les dates changent rarement : recalcul au plus toutes les 6 h, sinon la version publiée est gardée.
Une panne de ce script ne bloque jamais la publication du Desk.
"""
import json
import os
import time
import urllib.request
from datetime import date, datetime

OUT = "site"
SITE = os.environ.get("SITE_URL", "").rstrip("/")
# symbole du Desk -> (nom, symbole Yahoo)
VALEURS = {"NVDA": ("Nvidia", "NVDA"), "MSFT": ("Microsoft", "MSFT"), "AAPL": ("Apple", "AAPL"), "AMZN": ("Amazon", "AMZN"),
           "META": ("Meta", "META"), "GOOGL": ("Alphabet", "GOOGL"), "AVGO": ("Broadcom", "AVGO"), "TSLA": ("Tesla", "TSLA"),
           "COST": ("Costco", "COST"), "NFLX": ("Netflix", "NFLX"), "BRK.B": ("Berkshire", "BRK-B"),
           "JPM": ("JPMorgan", "JPM"), "LLY": ("Eli Lilly", "LLY")}


def get_json(url, timeout=10):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (DeskRobot)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def prochaine_date(yf, sym):
    """Prochaine date de résultats (>= aujourd'hui) et BPA attendu si Yahoo le donne."""
    t = yf.Ticker(sym)
    today = date.today()
    try:
        cal = t.calendar
        ds = cal.get("Earnings Date") if isinstance(cal, dict) else None
        ds = [d for d in (ds or []) if hasattr(d, "year")]
        ds = [d.date() if isinstance(d, datetime) else d for d in ds]
        ds = sorted(d for d in ds if d >= today)
        if ds:
            eps = cal.get("Earnings Average")
            return ds[0], (round(float(eps), 2) if eps == eps and eps is not None else None)
    except Exception:
        pass
    ed = t.get_earnings_dates(limit=8)  # secours
    futur = sorted(i.date() for i in ed.index if i.date() >= today)
    if not futur:
        raise RuntimeError("aucune date à venir")
    return futur[0], None


def main():
    os.makedirs(OUT + "/data", exist_ok=True)
    prev = None
    if SITE:
        try:
            prev = get_json(f"{SITE}/data/resultats.json")
        except Exception:
            prev = None
    now = int(time.time() * 1000)
    if prev and prev.get("rows") and now - prev.get("ts", 0) < 6 * 3600000:
        json.dump(prev, open(OUT + "/data/resultats.json", "w", encoding="utf-8"), separators=(",", ":"))
        print("Résultats récents : republiés tels quels.")
        return
    import yfinance as yf
    rows, erreurs = [], 0
    for cle, (nom, sym) in VALEURS.items():
        try:
            d, eps = prochaine_date(yf, sym)
            rows.append({"s": cle, "n": nom, "date": d.isoformat(), "eps": eps})
        except Exception as e:
            erreurs += 1
            print(cle, "ERREUR", type(e).__name__, str(e)[:100])
        time.sleep(0.7)
    if rows:
        json.dump({"ts": now, "rows": rows}, open(OUT + "/data/resultats.json", "w", encoding="utf-8"), separators=(",", ":"))
    elif prev:
        json.dump(prev, open(OUT + "/data/resultats.json", "w", encoding="utf-8"), separators=(",", ":"))
    try:
        meta = json.load(open(OUT + "/data/meta.json", encoding="utf-8"))
    except Exception:
        meta = {"ts": now, "sources": {}}
    meta.setdefault("sources", {})["resultats"] = {"ok": bool(rows), "n": len(rows), "err": "" if rows else "aucune date lue", "ts": now}
    json.dump(meta, open(OUT + "/data/meta.json", "w", encoding="utf-8"), separators=(",", ":"))
    print(len(rows), "dates lues,", erreurs, "erreurs")


if __name__ == "__main__":
    main()
