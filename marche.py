#!/usr/bin/env python3
"""Robot « marché » du Desk : quatre informations que le navigateur ne peut pas lire lui-même.

  cot       Positionnement des fonds sur les futures Nasdaq / S&P / Dow / Russell (CFTC, rapport TFF, chaque vendredi)
  fng       Indice Peur & Cupidité et ratio put/call (données publiques de CNN)
  auctions  Prochaines adjudications du Trésor américain (fiscaldata.treasury.gov)
  breadth   Largeur de marché du Nasdaq 100 et du S&P 500 (Yahoo Finance, yfinance)

Écrit site/data/marche.json et l'état de chaque partie dans site/data/meta.json (marche_cot, marche_fng...).
Chaque partie est indépendante : si l'une échoue, sa dernière version publiée est gardée (jamais de blocage).
Sources gratuites, sans clé, usage personnel. Tourne sur GitHub après resultats.py.
"""
import json
import os
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timezone

OUT = "site"
SITE = os.environ.get("SITE_URL", "").rstrip("/")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"


def get_json(url, timeout=20, headers=None):
    h = {"User-Agent": UA, "Accept": "application/json"}
    h.update(headers or {})
    with urllib.request.urlopen(urllib.request.Request(url, headers=h), timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def num(v, d=0.0):
    try:
        x = float(v)
        return x if x == x else d
    except Exception:
        return d


# ---------------------------------------------------------------- COT (CFTC)
COT_MARCHES = {"209742": "Nasdaq 100 (E-mini)", "13874A": "S&P 500 (E-mini)", "124603": "Dow Jones (E-mini)", "239742": "Russell 2000 (E-mini)"}
COT_GROUPES = {"asset": ("Gérants d'actifs", "asset_mgr_positions"), "lev": ("Fonds spéculatifs", "lev_money_positions"),
               "dealer": ("Banques (dealers)", "dealer_positions"), "other": ("Autres institutions", "other_rept_positions")}


def lire_cot():
    codes = ",".join("'%s'" % c for c in COT_MARCHES)
    q = urllib.parse.urlencode({"$where": "cftc_contract_market_code in(%s)" % codes, "$order": "report_date_as_yyyy_mm_dd DESC", "$limit": "40"})
    rows = get_json("https://publicreporting.cftc.gov/resource/gpe5-46if.json?" + q, 30)
    par = {}
    for r in rows:
        par.setdefault(str(r.get("cftc_contract_market_code")), []).append(r)
    res = []
    for code, nom in COT_MARCHES.items():
        L = par.get(code) or []
        if not L:
            continue
        cur, old = L[0], (L[1] if len(L) > 1 else None)
        g = {}
        for k, (lib, pref) in COT_GROUPES.items():
            lg, sh = num(cur.get(pref + "_long_all") or cur.get(pref + "_long")), num(cur.get(pref + "_short_all") or cur.get(pref + "_short"))
            net = lg - sh
            chg = None
            if old:
                net0 = num(old.get(pref + "_long_all") or old.get(pref + "_long")) - num(old.get(pref + "_short_all") or old.get(pref + "_short"))
                chg = net - net0
            g[k] = {"n": lib, "long": int(lg), "short": int(sh), "net": int(net), "chg": None if chg is None else int(chg)}
        res.append({"code": code, "nom": nom, "date": str(cur.get("report_date_as_yyyy_mm_dd", ""))[:10], "oi": int(num(cur.get("open_interest_all"))), "g": g})
    if not res:
        raise RuntimeError("aucune ligne COT reçue")
    return {"rows": res}


# ---------------------------------------------------------------- Peur & Cupidité (CNN)
FNG_FR = {"extreme fear": "Peur extrême", "fear": "Peur", "neutral": "Neutre", "greed": "Cupidité", "extreme greed": "Cupidité extrême"}
FNG_COMP = [("market_momentum_sp500", "Momentum du S&P 500"), ("stock_price_strength", "Force des prix"), ("stock_price_breadth", "Largeur de marché"),
            ("put_call_options", "Options put/call"), ("market_volatility_vix", "Volatilité (VIX)"), ("junk_bond_demand", "Demande d'obligations à risque"),
            ("safe_haven_demand", "Demande de valeurs refuges")]


def lire_fng():
    j = get_json("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", 20,
                 {"Origin": "https://edition.cnn.com", "Referer": "https://edition.cnn.com/"})
    f = j["fear_and_greed"]
    score = num(f.get("score"), -1)
    if not (0 <= score <= 100):
        raise RuntimeError("score hors limites")
    rate = lambda x: FNG_FR.get(str(x or "").lower(), str(x or ""))
    comp = []
    for k, lib in FNG_COMP:
        c = j.get(k) or {}
        if "score" in c:
            comp.append({"n": lib, "s": round(num(c.get("score")), 1), "r": rate(c.get("rating"))})
    pc = None
    try:
        d = (j.get("put_call_options") or {}).get("data") or []
        pc = round(num(d[-1].get("y")), 2) if d else None
    except Exception:
        pass
    return {"score": round(score, 1), "rating": rate(f.get("rating")), "prev": round(num(f.get("previous_close")), 1), "week": round(num(f.get("previous_1_week")), 1),
            "month": round(num(f.get("previous_1_month")), 1), "year": round(num(f.get("previous_1_year")), 1), "pc": pc, "comp": comp}


# ---------------------------------------------------------------- Adjudications du Trésor
def lire_adjudications():
    today = date.today().isoformat()
    base = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/"
    essais = [("upcoming_auctions", {"sort": "auction_date", "page[size]": "200"}),
              ("upcoming_auctions", {"page[size]": "200"}),
              ("auctions_query", {"sort": "-auction_date", "page[size]": "100"})]
    res, notes = [], []
    for nom, params in essais:
        try:
            rows = get_json(base + nom + "?" + urllib.parse.urlencode(params), 25).get("data") or []
        except Exception as e:
            notes.append("%s: %s" % (nom, type(e).__name__))
            continue
        notes.append("%s: %d lignes" % (nom, len(rows)))
        tmp = []
        for r in rows:
            d = str(r.get("auction_date", ""))[:10]
            if len(d) != 10 or d < today:
                continue
            amt = num(r.get("offering_amt"), 0)
            tmp.append({"d": d, "type": str(r.get("security_type", "")).strip(), "term": str(r.get("security_term", "")).strip(),
                        "amt": round(amt / 1e9, 1) if amt > 1e6 else None, "re": str(r.get("reopening", "")).lower() in ("yes", "y", "true")})
        if tmp:
            res = tmp
            break
    # on garde les titres longs (Note, Bond, TIPS, FRN) : les bons à court terme (Bill) n'ont pas d'effet sur le Nasdaq
    longs = [x for x in res if x["type"].lower() not in ("bill", "cmb") and "bill" not in x["term"].lower() and not x["term"].lower().endswith("week")]
    longs.sort(key=lambda x: x["d"])
    if not longs:
        types = sorted({x["type"] for x in res})[:5]
        ex = ""
        try:
            r0 = rows[0]
            ex = " | clés : " + ",".join(list(r0.keys())[:8]) + " | ex : " + str(r0.get("auction_date")) + "/" + str(r0.get("security_type")) + "/" + str(r0.get("security_term"))
        except Exception:
            pass
        raise RuntimeError("aucun titre long à venir (à venir : %d ; types : %s)%s" % (len(res), "/".join(types), ex))
    return {"rows": longs[:8]}


# ---------------------------------------------------------------- Largeur de marché (Yahoo)
NDX = ("AAPL MSFT NVDA AMZN META GOOGL GOOG AVGO TSLA COST NFLX ASML TMUS CSCO PEP LIN ADBE AMD QCOM TXN INTU AMGN ISRG BKNG HON AMAT CMCSA "
       "VRTX PANW ADP GILD ADI SBUX MU LRCX MELI INTC KLAC REGN CRWD CDNS MDLZ SNPS PYPL ABNB CTAS MAR ORLY MRVL CEG FTNT CSX DASH ADSK PDD "
       "WDAY ROP NXPI TEAM CPRT PCAR MNST AEP KDP CHTR PAYX AZN FAST ODFL ROST KHC EXC EA CCEP BKR GEHC VRSK XEL DDOG IDXX CTSH LULU TTWO "
       "ON CSGP ANSS CDW BIIB FANG GFS MDB TTD DXCM ARM WBD ZS APP PLTR AXON SHOP LIN TRI").split()


def sp500_liste():
    import pandas as pd
    t = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies", storage_options={"User-Agent": UA})[0]
    return [str(s).replace(".", "-") for s in t["Symbol"].tolist()]


def mesurer(yf, tickers, nom):
    import pandas as pd
    tickers = sorted(set(tickers))
    closes = []
    for i in range(0, len(tickers), 100):
        d = yf.download(tickers[i:i + 100], period="1y", interval="1d", auto_adjust=True, progress=False, threads=True, group_by="column")
        c = d["Close"] if "Close" in d else d
        if isinstance(c, pd.Series):
            c = c.to_frame(tickers[i])
        closes.append(c)
        time.sleep(1.0)
    C = pd.concat(closes, axis=1).dropna(axis=1, how="all")
    C = C.loc[:, ~C.columns.duplicated()]
    # on ne garde que la dernière séance où la majorité des valeurs a un cours
    C = C[C.notna().sum(axis=1) > 0.6 * C.shape[1]]
    if len(C) < 205 or C.shape[1] < 30:
        raise RuntimeError("%s : trop peu de données (%d séances, %d valeurs)" % (nom, len(C), C.shape[1]))
    last, prev = C.iloc[-1], C.iloc[-2]
    ok = last.notna() & prev.notna()
    ch = (last[ok] / prev[ok] - 1)
    adv, dec = int((ch > 0.0005).sum()), int((ch < -0.0005).sum())
    s20, s50, s200 = C.rolling(20).mean().iloc[-1], C.rolling(50).mean().iloc[-1], C.rolling(200).mean().iloc[-1]
    pct = lambda s: round(float((last[last.notna() & s.notna()] > s[last.notna() & s.notna()]).mean()) * 100, 1)
    hi = C.iloc[-253:-1].max()
    lo = C.iloc[-253:-1].min()
    nh = int((last >= hi).sum())
    nl = int((last <= lo).sum())
    return {"nom": nom, "n": int(ok.sum()), "adv": adv, "dec": dec, "unch": int(ok.sum()) - adv - dec, "p20": pct(s20), "p50": pct(s50), "p200": pct(s200), "nh": nh, "nl": nl,
            "date": str(C.index[-1])[:10]}


def lire_largeur():
    import yfinance as yf
    res, err = [], []
    try:
        res.append(mesurer(yf, NDX, "Nasdaq 100"))
    except Exception as e:
        err.append("NDX " + str(e)[:80])
    try:
        res.append(mesurer(yf, sp500_liste(), "S&P 500"))
    except Exception as e:
        err.append("SPX " + str(e)[:80])
    if not res:
        raise RuntimeError("; ".join(err) or "aucune mesure")
    return {"rows": res, "err": err}


# ---------------------------------------------------------------- orchestration
PARTIES = [("cot", lire_cot, 6 * 3600), ("fng", lire_fng, 30 * 60), ("auctions", lire_adjudications, 6 * 3600), ("breadth", lire_largeur, 55 * 60)]


def main():
    os.makedirs(OUT + "/data", exist_ok=True)
    try:
        prev = get_json(SITE + "/data/marche.json", 10) if SITE else {}
    except Exception:
        prev = {}
    now = int(time.time())
    res, etat = dict(prev or {}), {}
    for cle, fn, every in PARTIES:
        p = (prev or {}).get(cle)
        if p and p.get("ts") and now - p["ts"] < every:
            etat[cle] = (True, 1, "")
            print(cle, ": récent, republié tel quel.")
            continue
        try:
            d = fn()
            d["ts"] = now
            res[cle] = d
            etat[cle] = (True, len(d.get("rows") or d.get("comp") or [1]), "")
            print(cle, ": OK")
        except Exception as e:
            etat[cle] = (False, 0, "%s: %s" % (type(e).__name__, str(e)[:320]))
            print(cle, ": ERREUR", etat[cle][2])
    with open(OUT + "/data/marche.json", "w", encoding="utf-8") as f:
        json.dump(res, f, separators=(",", ":"), ensure_ascii=False)
    try:
        with open(OUT + "/data/meta.json", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception:
        meta = {"ts": now * 1000, "sources": {}}
    for cle, (ok, n, err) in etat.items():
        meta.setdefault("sources", {})["marche_" + cle] = {"ok": ok, "n": n, "err": err, "ts": now * 1000}
    with open(OUT + "/data/meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
