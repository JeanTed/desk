/**
 * Desk — Relais et AGENT IA (Cloudflare Worker, offre gratuite)
 *
 * Un seul relais, un seul agent, pour tous les utilisateurs du Desk.
 *  1. News : lit les chaînes Telegram publiques ci-dessous (route /tg).
 *  2. Agent IA (v10 : l'analyste) : toutes les minutes (déclencheur Cron), il lit le marché (OKX, TradingView, news, agenda)
 *     et détecte ce qui compte (cassures, purges, levier, dollar, annonces, news). Ces signaux ne s'affichent pas : ils nourrissent l'IA.
 *     Toutes les 30 min, tout de suite sur un événement important, ou à la demande, l'IA écrit une LECTURE du marché :
 *     ce qui se passe, pourquoi, un scénario haussier et un baissier par actif (niveau et cible), ce qui invaliderait tout.
 *     Le relais suit ensuite chaque scénario (déclenché ? cible atteinte ?) et en fait le bilan 4 h après.
 *     IA : Gemini → Groq → OpenRouter → Workers AI (secours intégré à Cloudflare, sans clé).
 *
 * Réglages Cloudflare (une seule fois, dans le tableau de bord du worker) :
 *  - Bindings : KV namespace nommé DESK ; Workers AI nommé AI.
 *  - Variables and Secrets : GEMINI_KEY (secret), GROQ_KEY et OPENROUTER_KEY (secrets, facultatifs).
 *  - Triggers : Cron  * * * * *  (toutes les minutes).
 * Aucune clé n'est jamais envoyée au Desk.
 */

/* ====================== RÉGLAGES ====================== */
const CHAINES = { walterbloomberg: "Walter Bloomberg", WatcherGuru: "Watcher Guru", PhoenixNewsImportant: "PhoenixNews", BWEnews: "BWEnews", unfolded: "unfolded", whale_alert_io: "Whale Alert",
  thekobeissiletter: "The Kobeissi Letter", marketfeed: "Market News Feed", lookonchainchannel: "Lookonchain", spotonchain: "Spot On Chain", onchainlens: "Onchain Lens", ai_9684xtpa: "Ai 姨 (onchain)",
  arkhamintelligence: "Arkham", cryptoquant_official: "CryptoQuant", wublockchainenglish: "Wu Blockchain", binance_announcements: "Binance", bybit_announcements: "Bybit", okxannouncements: "OKX" };
const BALEINE_MIN_USD = 50e6;
const ACTIFS = {                     // ct = taille d'un contrat OKX ; move = % sur 5 min ; liq = liquidations OKX sur 5 min ($)
  BTC: { ct: 0.01, move: 0.4, liq: 1.5e6, news: 0.2, glisse: 0.4 },   // glisse = % cumulé sur 15 min
  ETH: { ct: 0.1, move: 0.5, liq: 0.7e6, news: 0.25, glisse: 0.55 },
  SOL: { ct: 1, move: 0.7, liq: 0.4e6, news: 0.35, glisse: 0.8 },
};
const REGLES = { oi: 3, volume: 3, dxyBougie: 3, dxyMin: 0.05, eurVolume: 2.5, petrole: 1, taux: 0.04, pause: 10 * 6e4, suivi: 90 * 6e4 };
const BUDGET_JOUR = 130;             // appels IA maximum par jour, toutes IA confondues (une lecture = un appel)
/* Tri des news par le code avant l'IA : mots qui font bouger les marchés (poids), et mots qui rendent une news crypto */
const NEWS_MOTS = [
  [6, /\b(FOMC|RATE (DECISION|CUT|HIKE)|CUTS? RATES|HIKES? RATES|POWELL|FED CHAIR|EMERGENCY (RATE|MEETING|CUT|HIKE|FED|LIQUIDITY|LENDING)|CPI|NONFARM|NFP|PCE|TARIFFS?|SANCTIONS?|WAR\b|MISSILES?|AIRSTRIKES?|INVADES?|INVASION|HORMUZ|NUCLEAR|HACK(ED)?|EXPLOIT(ED)?|DRAINED|BANKRUPT|INSOLVEN|HALTS? WITHDRAWALS?|DEPEG|BITCOIN RESERVE|ETF APPROV|APPROVES? .{0,20}ETF)/i],
  [4, /\b(FED|FEDERAL RESERVE|TREASURY|YIELDS?|INFLATION|JOBLESS|PAYROLLS?|GDP|RECESSION|ECB|BOJ|PBOC|TRUMP|WHITE HOUSE|SEC\b|CFTC|ETF|BLACKROCK|STRATEGY (BOUGHT|ACQUIRE)|SAYLOR|LIQUIDAT|BINANCE|COINBASE|UPBIT|BITHUMB|WILL LIST|DELIST|STABLECOIN|TETHER|CIRCLE|SHUTDOWN|DEFAULT|IRAN|ISRAEL|CHINA|RUSSIA|UKRAINE|OPEC|CRUDE|OIL)\b/i],
];
const NEWS_CRYPTO = /\b(BTC|BITCOIN|ETH|ETHER(EUM)?|SOL(ANA)?|CRYPTO|STABLECOIN|ETF|BINANCE|COINBASE|TETHER|USDT|USDC|DEFI)\b/i;
/* Bilan : 1 h après chaque message qui annonce un sens, l'agent vérifie s'il a vu juste (seuil de variation par actif, en %) */
const IA_ORDRE_LECTURE = ["gemini", "groq", "gemlite", "openrouter", "workersai"];   // pour une lecture : Flash, puis Groq, puis Flash-Lite
const IA_ORDRE = ["gemini", "groq", "openrouter", "workersai"];   // Groq et OpenRouter sont facultatifs (sans clé, ils sont sautés)
const WAI_MODELE = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const GROQ_MODELE = "openai/gpt-oss-120b";
const VERSION = "v2";

/* ====================== HTTP ====================== */
const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS", "access-control-allow-headers": "*", "access-control-max-age": "86400" };
export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "GET") return new Response("Méthode non autorisée", { status: 405, headers: CORS });
    const url = new URL(request.url);
    if (url.pathname === "/") return texte("Relais et agent IA du Desk. Route : /tg");
    if (url.pathname === "/diag") { let d = null; try { d = env.DESK ? await env.DESK.get("diag") : null; } catch (e) {} return new Response(JSON.stringify({ maintenant: Date.now(), kv: !!env.DESK, ia: !!env.AI, gemini: !!env.GEMINI_KEY, groq: !!env.GROQ_KEY, openrouter: !!env.OPENROUTER_KEY, derniere_erreur: d ? JSON.parse(d) : "aucune", dernier_tour: await (async () => { try { const p = env.DESK ? JSON.parse(await env.DESK.get("public") || "{}") : {}; return p.maj ? { il_y_a_s: Math.round((Date.now() - p.maj) / 1000), messages: (p.feed || []).length, appels_ia: p.ia ? p.ia.n : 0, diag: p.diag || null } : "aucun"; } catch (e) { return "illisible"; } })() }), { headers: { ...CORS, "content-type": "application/json; charset=utf-8" } }); }
    if (url.pathname === "/point") return new Response(JSON.stringify(await pointMaintenant(env)), { headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    if (url.pathname !== "/tg") return new Response("Introuvable", { status: 404, headers: CORS });
    if (!MEM.corps) await depuisCache();
    const age = Date.now() - MEM.maj;
    if (!MEM.corps) await rafraichir(); else if (age > 20000) ctx.waitUntil(rafraichir());
    const ag = await lireAgent(env);
    return new Response('{"maj":' + MEM.maj + ',"tg":' + (MEM.corps || '{"msgs":[]}') + ',"agent":' + ag + "}", {
      headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=20" } });
  },
  async scheduled(event, env, ctx) {
    /* Diagnostic : un tour qui plante écrit son erreur (une fois par erreur nouvelle) ; les tours réussis sont visibles dans la vue publique */
    ctx.waitUntil(tour(env).catch((e) => {
      DIAG.err = String(e && (e.stack || e.message) || e).slice(0, 600); DIAG.errT = Date.now(); console.log("tour", DIAG.err);
      if (env.DESK && DIAG.err !== DIAG.errEcrite) { DIAG.errEcrite = DIAG.err; return env.DESK.put("diag", JSON.stringify(DIAG)).catch(() => {}); }
    }));
  },
};
function texte(t) { return new Response(t, { headers: { ...CORS, "content-type": "text/plain; charset=utf-8" } }); }

/* Le fil de l'agent, lu dans KV au plus une fois toutes les 15 s par instance */
const AG = { corps: "", t: 0 };
async function lireAgent(env) {
  if (!env.DESK) return '{"feed":[],"off":"stockage DESK non configuré"}';
  if (AG.corps && Date.now() - AG.t < 15000) return AG.corps;
  try { const s = await env.DESK.get("public", { cacheTtl: 60 }); if (s) { const o = JSON.parse(s); delete o._st; AG.corps = JSON.stringify(o); AG.t = Date.now(); } } catch (e) {}
  return AG.corps || '{"feed":[]}';
}

/* ====================== NEWS TELEGRAM ====================== */
const MEM = { corps: "", maj: 0, msgs: [] };
const CLE = "https://desk-news.cache/" + VERSION + "/tg";
async function depuisCache() { try { const r = await caches.default.match(CLE); if (r) { MEM.corps = await r.text(); MEM.maj = Number(r.headers.get("x-maj") || 0); } } catch (e) {} }
let enCours = null;
async function lirePartiel(L) {
  const lots = await Promise.all(L.map(lireChaine));
  MEM.msgs = (MEM.msgs || []).filter((m) => !L.includes(m.c)).concat(lots.flat()).sort((a, b) => b.ts - a.ts).slice(0, 180);
}
async function rafraichir() {
  if (enCours) return enCours;
  enCours = (async () => {
    const lots = await Promise.all(Object.keys(CHAINES).map(lireChaine));
    const msgs = lots.flat().sort((a, b) => b.ts - a.ts);
    if (!msgs.length && MEM.corps) { MEM.maj = Date.now(); return MEM.corps; }
    MEM.msgs = msgs.slice(0, 180); const av = {}; MEM.msgs.forEach((m) => { if (m.av) av[m.c] = m.av; }); MEM.corps = JSON.stringify({ n: MEM.msgs.length, av, msgs: MEM.msgs.map(({ av: _a, img, ...m }, i) => (i < 60 && img ? { ...m, img } : m)) }); MEM.maj = Date.now();
    try { await caches.default.put(CLE, new Response(MEM.corps, { headers: { "cache-control": "public, max-age=600", "x-maj": String(MEM.maj) } })); } catch (e) {}
    return MEM.corps;
  })();
  try { return await enCours; } finally { enCours = null; }
}
async function lireChaine(ch) {
  try { const r = await fetch("https://t.me/s/" + ch, { headers: { "user-agent": "Mozilla/5.0 (compatible; DeskNews/1.0)", "accept-language": "en" } }); return r.ok ? extraire(await r.text(), ch) : []; } catch (e) { return []; }
}
export function extraire(html, ch) {
  const cdn = (u) => (/^https:\/\/cdn\d*\.(telesco\.pe|cdn-telegram\.org)\//.test(u || "") ? u : "");
  const av = cdn((html.match(/tgme_page_photo_image[^>]*>\s*<img src="([^"]+)"/) || [])[1]);
  const out = [], blocs = html.split('<div class="tgme_widget_message_wrap');
  for (let i = blocs.length - 1; i >= 1 && out.length < 10; i--) {
    const b = blocs[i], post = (b.match(/data-post="([^"]+)"/) || [])[1], quand = (b.match(/<time datetime="([^"]+)"/) || [])[1], d = b.indexOf('class="tgme_widget_message_text');
    if (!post || !quand || d < 0) continue;
    const debut = b.indexOf(">", d) + 1;
    let t = b.slice(debut, b.indexOf("</div>", debut)).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "")
      .replace(/&#036;/g, "$").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/\s*\(@\w+\)\s*$/, "").replace(/\s*[—-]?\s*link\s*\|\s*AI comment\s*$/i, "").replace(/\s*[—-]\s*link\s*$/i, "").replace(/\s+/g, " ").trim();
    if (t.length < 12) continue;
    if (ch === "whale_alert_io" && Number(((t.match(/\(([\d,]+) USD\)/) || [])[1] || "0").replace(/,/g, "")) < BALEINE_MIN_USD) continue;
    if (t.length > 280) t = t.slice(0, 277) + "…";
    const img = cdn((b.match(/tgme_widget_message_photo_wrap[^"]*"[^>]*background-image:url\('([^']+)'\)/) || [])[1]);
    out.push({ c: ch, src: CHAINES[ch], ts: Date.parse(quand), t, u: "https://t.me/" + post, av, img });
  }
  return out;
}

/* ====================== OUTILS ====================== */
const H = {};                         // mémoire de l'instance (bougies lentes, historiques)
const r2 = (x, d = 2) => (x == null || !isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const dp = (p) => (p >= 1000 ? 0 : p >= 100 ? 1 : p >= 1 ? 2 : 4);
const fr = (v, d) => (v == null ? "—" : Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d == null ? dp(v) : d, maximumFractionDigits: d == null ? dp(v) : d }).replace(/\u202f|\u00a0/g, " "));
const pct = (v, d = 2) => (v > 0 ? "+" : v < 0 ? "−" : "") + fr(Math.abs(v), d) + " %";
const usd = (v) => (v >= 1e9 ? fr(v / 1e9, 1) + " Md$" : v >= 1e6 ? fr(v / 1e6, 1) + " M$" : v >= 1e3 ? fr(v / 1e3, 0) + " k$" : fr(v, 0) + " $");
const lvl = (p) => "[" + fr(p) + "]";
const med = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const ema = (a, n) => { if (a.length < n) return null; const k = 2 / (n + 1); let e = a.slice(0, n).reduce((s, x) => s + x, 0) / n; for (let i = n; i < a.length; i++) e = a[i] * k + e * (1 - k); return e; };
const paris = (t, o) => new Date(t).toLocaleString("fr-FR", { timeZone: "Europe/Paris", ...o });
const hm = (t) => paris(t, { hour: "2-digit", minute: "2-digit" });
const heureParis = (t) => +new Date(t).toLocaleString("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }) % 24;
const minuteParis = (t) => +new Date(t).toLocaleString("en-GB", { timeZone: "Europe/Paris", minute: "2-digit" });
const hmZone = (t, tz) => { const p = new Date(t).toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).split(":"); return (+p[0] % 24) * 60 + +p[1]; };
/* Wall Street : 9 h 30 – 16 h heure de New York ; bourses européennes : 9 h – 17 h 30 heure de Paris (changements d'heure gérés) */
function seances(now) {
  const ny = hmZone(now, "America/New_York"), pa = hmZone(now, "Europe/Paris"), ouvre = !/Sat|Sun/.test(new Date(now).toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "short" }));
  const us = !ouvre ? "week-end : Wall Street fermée" : ny < 570 ? "Wall Street ouvre dans " + (570 - ny) + " min" : ny < 960 ? "Wall Street ouverte depuis " + (ny - 570) + " min" : "Wall Street fermée";
  return { ny, pa, ouvre, txt: us + " · " + (ouvre && pa >= 540 && pa < 1050 ? "bourses européennes ouvertes" : "bourses européennes fermées") };
}
const jourParis = (t) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
let SR = 0;                           // requêtes sortantes du tour en cours (limite gratuite : 50)
async function json(url, opt, ms = 9000) {
  SR++;
  const c = new AbortController(), tm = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { ...(opt || {}), signal: c.signal }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {} if (!r.ok) { const er = new Error((j && j.error && (j.error.message || j.error)) || j && j.message || "HTTP " + r.status); er.status = r.status; er.details = j && j.error && j.error.details || []; throw er; } return j; }
  finally { clearTimeout(tm); }
}
const OKX = "https://www.okx.com/api/v5";
/* Bougies OKX. Les adresses de Cloudflare sont partagées : OKX limite souvent. En cas d'échec, deux autres points d'entrée OKX
   (quotas séparés) prennent le relais : historique des bougies, puis bougies du prix de marque (sans volume). */
const lireK = (j) => { const k = (j.data || []).map((x) => ({ t: +x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: x.length >= 9 ? +x[7] || +x[5] || 0 : 0, ok: (x.length >= 9 ? x[8] : x[5]) === "1" })).reverse(); if (!k.length) throw new Error("vide"); return k; };
const bougies1 = (b, bar, n) => json(OKX + "/market/candles?instId=" + b + "-USDT-SWAP&bar=" + bar + "&limit=" + n).then(lireK);
const bougies = (b, bar, n) => bougies1(b, bar, n)
  .catch(() => { DIAG.okxKo = (DIAG.okxKo || 0) + 1; return SR > 38 ? null : json(OKX + "/market/history-candles?instId=" + b + "-USDT-SWAP&bar=" + bar + "&limit=" + Math.min(n, 100)).then(lireK); })
  .catch(() => (SR > 40 ? null : json(OKX + "/market/mark-price-candles?instId=" + b + "-USDT-SWAP&bar=" + bar + "&limit=" + Math.min(n, 100)).then(lireK)))
  .catch(() => null);

/* ====================== COLLECTE ====================== */
async function collecte(now) {
  const lent = (k, ms) => !H[k] || now - H[k].t > ms;
  const P = [];
  for (const b of Object.keys(ACTIFS)) {
    P.push(bougies(b, "1m", 40).then((k) => { if (k) H["1m" + b] = { t: now, k }; }));
    P.push(bougies(b, "15m", 100).then((k) => { if (k) H["15m" + b] = { t: now, k }; }));
    if (lent("1H" + b, 15 * 6e4)) P.push(bougies(b, "1H", 100).then((k) => { if (k) H["1H" + b] = { t: now, k }; }));
    if (lent("4H" + b, 30 * 6e4)) P.push(bougies(b, "4H", 100).then((k) => { if (k) H["4H" + b] = { t: now, k }; }));
    if (lent("1D" + b, 60 * 6e4)) P.push(bougies(b, "1Dutc", 30).then((k) => { if (k) H["1D" + b] = { t: now, k }; }));
    P.push(json(OKX + "/rubik/stat/contracts/open-interest-history?instId=" + b + "-USDT-SWAP&period=5m&limit=6").then((j) => { H["oi" + b] = (j.data || []).map((x) => ({ t: +x[0], usd: +x[3] })).filter((x) => x.usd > 0).reverse(); }).catch(() => {}));
    P.push(json(OKX + "/public/liquidation-orders?instType=SWAP&uly=" + b + "-USDT&state=filled&limit=100").then((j) => { H["liq" + b] = (j.data || []).flatMap((x) => x.details || []).map((x) => ({ t: +x.ts, long: x.posSide === "long", usd: +x.sz * ACTIFS[b].ct * +x.bkPx })); }).catch(() => {}));
  }
  P.push(json("https://scanner.tradingview.com/global/scan", { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8" }, body: JSON.stringify({ symbols: { tickers: ["TVC:DXY", "FX:EURUSD", "FX:USOIL", "TVC:US10Y", "NASDAQ:NDX", "TVC:GOLD"] }, columns: ["close", "change", "change|5", "change|15", "open|5", "high|5", "low|5", "close|5", "volume|5", "average_volume_10d_calc"] }) })
    .then((j) => { const m = {}; (j.data || []).forEach((x) => { m[x.s] = x.d; }); H.mac = { t: now, m }; }).catch(() => {}));
  if (lent("dxyHist", 30 * 6e4)) P.push(json("https://query1.finance.yahoo.com/v8/finance/chart/DX-Y.NYB?interval=5m&range=2d", { headers: { "user-agent": "Mozilla/5.0" } }).then((j) => { const r = j.chart.result[0], q = r.indicators.quote[0]; H.dxyHist = { t: now, r: r.timestamp.map((t, i) => (q.high[i] != null ? q.high[i] - q.low[i] : null)).filter((x) => x != null && x > 0) }; }).catch(() => {}));
  if (lent("cal", 30 * 6e4)) P.push(json("https://nfs.faireconomy.media/ff_calendar_thisweek.json").then((a) => { H.cal = { t: now, a: (a || []).filter((e) => e.country === "USD" && /high/i.test(e.impact)).map((e) => ({ ts: Date.parse(e.date), t: e.title, f: e.forecast, p: e.previous, a: e.actual })) }; }).catch(() => {}));
  if (lent("tree", 50000)) P.push(json("https://news.treeofalpha.com/api/news?limit=60").then((a) => { H.tree = { t: now, a: (a || []).filter((x) => x.source === "Twitter" || x.source === "Terminal").map((x) => ({ ts: +x.time, src: x.source === "Terminal" ? "Tree News" : ((x.title.match(/^(.{1,40}?) \(@/) || [])[1] || "X"), t: x.title.replace(/^.{1,60}? \(@\w+\):\s*/, "").slice(0, 200) })) }; }).catch(() => {}));
  const vide = !MEM.maj, mnT = Math.floor(now / 6e4);
  if (lent("fj", 110000) && (!vide || mnT % 2 === 0)) SR++, P.push(fetch("https://www.financialjuice.com/feed.ashx?xy=rss", { headers: { "user-agent": "Mozilla/5.0" } }).then((r) => r.ok ? r.text() : "").then((x) => {
    const a = x.split("<item>").slice(1, 30).map((it) => ({ ts: Date.parse((it.match(/<pubDate>([^<]+)/) || [])[1] || ""), src: "FinancialJuice", t: ((it.match(/<title>([^<]+)/) || [])[1] || "").replace(/^FinancialJuice:\s*/, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'") })).filter((n) => n.ts && n.t);
    if (a.length) H.fj = { t: now, a }; else if (H.fj) H.fj.t = now; else H.fj = { t: now, a: [] };
  }).catch(() => {}));
  { const tiers = Object.keys(CHAINES).filter((c, i) => i % 3 === mnT % 3); SR += tiers.length; P.push(lirePartiel(tiers).catch(() => {})); }
  await Promise.all(P);
}

/* ====================== NIVEAUX ====================== */
function pivots(k) { const Hh = [], L = []; for (let i = 2; i < k.length - 2; i++) { const x = k[i]; if (x.h > k[i - 1].h && x.h > k[i - 2].h && x.h >= k[i + 1].h && x.h >= k[i + 2].h) Hh.push(x.h); if (x.l < k[i - 1].l && x.l < k[i - 2].l && x.l <= k[i + 1].l && x.l <= k[i + 2].l) L.push(x.l); } return { H: Hh, L }; }
function niveaux(b, px, now) {
  const L = [], add = (p, u, n, w) => { if (p && isFinite(p)) L.push({ p, u, n, w }); };
  const d = (H["1D" + b] || {}).k || [], ds = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  const dd = d.filter((x) => x.ok); if (dd.length) { const y = dd[dd.length - 1]; add(y.h, "J", "haut d'hier", 4); add(y.l, "J", "bas d'hier", 4); }
  const td = d.find((x) => x.t >= ds); if (td) add(td.o, "J", "ouverture du jour", 3);
  const wd = new Date(ds).getUTCDay(), ws = ds - ((wd + 6) % 7) * 864e5, pw = d.filter((x) => x.t >= ws - 7 * 864e5 && x.t < ws);
  if (pw.length) { add(Math.max(...pw.map((x) => x.h)), "S", "haut semaine passée", 5); add(Math.min(...pw.map((x) => x.l)), "S", "bas semaine passée", 5); }
  const q = ((H["15m" + b] || {}).k || []).filter((x) => x.t >= ds);
  [["Asie", 0, 7], ["Londres", 7, 13.5], ["New York", 13.5, 20]].forEach(([n, a, z]) => { const w = q.filter((x) => x.t >= ds + a * 36e5 && x.t < ds + z * 36e5); if (w.length >= 4) { add(Math.max(...w.map((x) => x.h)), "SESS", "haut " + n, 2.5); add(Math.min(...w.map((x) => x.l)), "SESS", "bas " + n, 2.5); } });
  /* POC : le prix où il s'est échangé le plus de volume (bougies 15 min du jour, bougies 1 h de la veille) */
  const poc = (k) => { if (k.length < 4) return null; const pas = px * 0.0005, Vb = {}; k.forEach((x) => { const a = Math.floor(x.l / pas), z = Math.floor(x.h / pas), n = z - a + 1; for (let i = a; i <= z; i++) Vb[i] = (Vb[i] || 0) + (x.v || 0) / n; }); let m = null; Object.keys(Vb).forEach((i) => { if (m == null || Vb[i] > Vb[m]) m = i; }); return m == null ? null : (+m + 0.5) * pas; };
  add(poc(q), "J", "POC du jour", 3.5); add(poc(((H["1H" + b] || {}).k || []).filter((x) => x.t >= ds - 864e5 && x.t < ds)), "J", "POC d'hier", 3.5);
  [["4H", "4H", 3], ["1H", "1H", 2]].forEach(([tf, u, w]) => { const k = ((H[tf + b] || {}).k || []).filter((x) => x.ok).slice(-80); if (k.length < 10) return; const pv = pivots(k); pv.H.slice(-2).forEach((p) => add(p, u, "sommet " + u.toLowerCase(), w)); pv.L.slice(-2).forEach((p) => add(p, u, "creux " + u.toLowerCase(), w)); });
  L.sort((a, c) => a.p - c.p); const out = [];
  L.forEach((l) => { const o = out[out.length - 1]; if (o && Math.abs(l.p - o.p) / px < 0.0008) { if (l.w > o.w) { o.p = l.p; o.u = l.u; o.n = l.n; o.w = l.w; } o.c = (o.c || 1) + 1; } else out.push({ ...l }); });
  out.forEach((l) => { l.p = r2(l.p, dp(px)); });
  return { up: out.filter((l) => l.p > px).slice(0, 6), dn: out.filter((l) => l.p <= px).slice(-6).reverse() };
}
function tendance(k) { const c = (k || []).filter((x) => x.ok).map((x) => x.c); if (c.length < 50) return null; const px = c[c.length - 1], a = ema(c, 20), z = ema(c, 50); return px > a && a > z ? "▲" : px < a && a < z ? "▼" : "●"; }

/* ====================== DÉTECTION ====================== */
const NOMU = { S: "semaine", J: "jour", "4H": "4 h", SESS: "session", "1H": "1 h" };
function detecter(st, now) {
  const E = [], mk = (o) => E.push({ ts: now, ...o });
  for (const b of Object.keys(ACTIFS)) {
    const A = ACTIFS[b], k1 = (H["1m" + b] || {}).k || [], k15 = ((H["15m" + b] || {}).k || []);
    if (k1.length < 32) continue;
    const px = k1[k1.length - 1].c, m5 = (px / k1[k1.length - 6].o - 1) * 100, nv = niveaux(b, px, now);
    const lq = (H["liq" + b] || []).filter((x) => now - x.t < 5 * 6e4), lL = lq.filter((x) => x.long).reduce((s, x) => s + x.usd, 0), lS = lq.filter((x) => !x.long).reduce((s, x) => s + x.usd, 0);
    const oi = H["oi" + b] || [], oi15r = oi.length >= 4 ? (oi[oi.length - 1].usd / oi[oi.length - 4].usd - 1) * 100 : null, oi15 = oi15r != null && Math.abs(oi15r) < 30 ? oi15r : null;
    const ctx = { px, m5: r2(m5), lL: Math.round(lL), lS: Math.round(lS), oi15: r2(oi15), nv };
    if (lL >= A.liq || lS >= A.liq) { const L = lL >= lS; mk({ b, type: L ? "purgeL" : "purgeS", poids: 3 + Math.min(2, Math.max(lL, lS) / A.liq / 3), ctx,
      titre: L ? "Purge des longs" : "Rachat forcé des shorts", chiffre: usd(Math.max(lL, lS)) + " en 5 min", detail: "liquidés sur OKX · prix " + pct(m5) + (oi15 != null ? " · levier " + pct(oi15, 1) : ""),
      txt: (L ? "Purge des longs" : "Rachat forcé des shorts") + " : " + usd(Math.max(lL, lS)) + " liquidés sur OKX en 5 min" + (oi15 != null ? ", OI " + pct(oi15, 1) : "") + ". Prix " + lvl(px) + " (" + pct(m5) + ")." }); }
    if (Math.abs(m5) >= A.move) mk({ b, type: "move", poids: 2 + Math.min(2, Math.abs(m5) / A.move - 1), ctx, titre: m5 > 0 ? "Hausse rapide" : "Chute rapide", chiffre: pct(m5) + " en 5 min", detail: "à " + fr(px) + (oi15 != null ? " · levier " + pct(oi15, 1) + " en 15 min" : ""), txt: b + " " + pct(m5) + " en 5 min, à " + lvl(px) + "." + (oi15 != null ? " OI " + pct(oi15, 1) + " sur 15 min." : "") });
    const g15 = k1.length > 16 ? (px / k1[k1.length - 16].o - 1) * 100 : 0, gk = "gl" + b + (g15 > 0 ? "u" : "d") + Math.floor(now / 12e5);
    if (A.glisse && Math.abs(g15) >= A.glisse && !st.vu[gk]) { st.vu[gk] = now; mk({ b, type: "glisse", poids: 3 + Math.min(1.5, Math.abs(g15) / A.glisse - 1), ctx, titre: g15 > 0 ? "Hausse continue" : "Baisse continue", chiffre: pct(g15) + " en 15 min", detail: "à " + fr(px) + (oi15 != null ? " · levier " + pct(oi15, 1) + " en 15 min" : ""), txt: b + " " + pct(g15) + " en 15 min, à " + lvl(px) + "." }); }
    if (oi15 != null && Math.abs(oi15) >= REGLES.oi) mk({ b, type: "oi", poids: 2.5, ctx, titre: oi15 > 0 ? "Le levier gonfle" : "Le levier se vide", chiffre: pct(oi15, 1) + " en 15 min", detail: "open interest · prix " + pct(m5) + " sur 5 min", txt: (oi15 > 0 ? "Le levier gonfle" : "Le levier se vide") + " : open interest " + pct(oi15, 1) + " en 15 min, prix " + pct(m5) + " sur 5 min." });
    const d1 = k1.filter((x) => x.ok), lc = d1[d1.length - 1], vm = med(d1.slice(-31, -1).map((x) => x.v));
    if (lc && vm && lc.v / vm >= REGLES.volume && Math.abs(lc.c / lc.o - 1) * 100 >= A.move / 3 && now - lc.t < 3 * 6e4) mk({ b, type: "vol", poids: 1, ctx, txt: "Volume anormal : bougie 1 min à ×" + fr(lc.v / vm, 1) + " la normale (" + pct((lc.c / lc.o - 1) * 100) + ")." });
    const q = k15.filter((x) => x.ok), c0 = q[q.length - 1], c1 = q[q.length - 2];
    if (c0 && c1 && now - c0.t < 16 * 6e4 && !st.vu["k15" + b + c0.t]) {
      st.vu["k15" + b + c0.t] = now;
      const lv = nv.up.concat(nv.dn).filter((l) => l.u !== "1H" || l.c > 1);
      for (const l of lv) {
        const W = { S: 5, J: 4, "4H": 3, SESS: 2.5, "1H": 2 }[l.u] || 1, nom = l.n + " " + (l.u === "SESS" ? "" : l.u);
        const cc = { chiffre: "[" + fr(l.p) + "]", detail: "clôture 15 min · niveau " + NOMU[l.u] };
        if (c1.c < l.p && c0.c > l.p) { mk({ b, type: "casse", poids: 1.5 + W / 2, ctx, lv: l, titre: "Cassure · " + l.n, ...cc, detail: cc.detail + " · franchi vers le haut", txt: "Clôture 15 min au-dessus du " + nom.trim() + " " + lvl(l.p) + "." }); break; }
        if (c1.c > l.p && c0.c < l.p) { mk({ b, type: "casse", poids: 1.5 + W / 2, ctx, lv: l, titre: "Cassure · " + l.n, ...cc, detail: cc.detail + " · franchi vers le bas", txt: "Clôture 15 min sous le " + nom.trim() + " " + lvl(l.p) + "." }); break; }
        if (c0.h > l.p && c0.c < l.p && c1.c < l.p) { mk({ b, type: "meche", poids: 1 + W / 2, ctx, lv: l, titre: "Piège · " + l.n, chiffre: "[" + fr(l.p) + "]", detail: "mèche 15 min au-dessus puis retour dessous", txt: "Mèche 15 min au-dessus du " + nom.trim() + " " + lvl(l.p) + " puis retour dessous : possible piège." }); break; }
        if (c0.l < l.p && c0.c > l.p && c1.c > l.p) { mk({ b, type: "meche", poids: 1 + W / 2, ctx, lv: l, titre: "Piège · " + l.n, chiffre: "[" + fr(l.p) + "]", detail: "mèche 15 min en dessous puis retour dessus", txt: "Mèche 15 min sous le " + nom.trim() + " " + lvl(l.p) + " puis retour dessus : possible piège." }); break; }
      }
    }
    /* News suivie d'un move en 3 min */
    const news = (MEM.msgs || []).map((x) => ({ ts: x.ts, src: x.src, t: x.t })).concat(((H.tree || {}).a) || []).filter((n) => now - n.ts < 8 * 6e4 && now - n.ts > 2 * 6e4);
    for (const n of news) {
      if (st.vu["n" + b + n.ts + n.t.slice(0, 20)]) continue;
      if (noteNews(n) < 4) { st.vu["n" + b + n.ts + n.t.slice(0, 20)] = now; continue; }
      const i0 = k1.findIndex((x) => x.t === Math.floor(n.ts / 6e4) * 6e4); if (i0 < 0) continue;
      const a = k1[i0].o, j = Math.min(k1.length - 1, i0 + 3), mv = (k1[j].c / a - 1) * 100;
      st.vu["n" + b + n.ts + n.t.slice(0, 20)] = now;
      if (Math.abs(mv) >= A.news) mk({ b, type: "news", poids: 2.5 + Math.min(1.5, Math.abs(mv) / A.news / 2), ctx, news: n, titre: "Une news fait bouger " + b, chiffre: pct(mv) + " en 3 min", detail: n.src + " · « " + n.t.slice(0, 120) + " »", txt: n.src + " : « " + n.t.slice(0, 140) + " » · " + b + " " + pct(mv) + " en 3 min." });
    }
  }
  /* Le dollar */
  const m = (H.mac || {}).m || {}, D = m["TVC:DXY"], EU = m["FX:EURUSD"];
  if (D && D[4] != null) {
    const bar = Math.floor(now / 3e5), rg = D[5] - D[6], hist = ((H.dxyHist || {}).r || []).slice(-60), nr = med(hist), ch5 = D[2];
    H.dxyBars = H.dxyBars || {}; H.dxyBars[bar] = rg;
    const ratio = nr ? rg / nr : null;
    if (ratio && ratio >= REGLES.dxyBougie && Math.abs(ch5) >= REGLES.dxyMin && !st.vu["dxy" + bar]) {
      st.vu["dxy" + bar] = now;
      let ev = (EU && EU[8] && EU[9]) ? EU[8] / (EU[9] / 288) : null;
      mk({ b: "USD", type: "dollar", poids: 2.5 + (ev && ev >= REGLES.eurVolume ? 1 : 0), ctx: { dxy: D[0], ch5, ratio: r2(ratio, 1), ev: r2(ev, 1) },
        titre: ch5 > 0 ? "Le dollar s'emballe" : "Le dollar décroche", chiffre: "DXY " + pct(ch5) + " en 5 min", detail: "bougie ×" + fr(ratio, 1) + " la normale" + (ev ? " · volume EUR/USD ×" + fr(ev, 1) : "") + " · " + (ch5 > 0 ? "pression sur la crypto" : "vent favorable pour la crypto"),
        txt: "Bougie 5 min anormale sur le dollar : DXY " + pct(ch5) + " (×" + fr(ratio, 1) + " la taille normale)" + (ev ? ", volume EUR/USD ×" + fr(ev, 1) : "") + ". " + (ch5 > 0 ? "Pression probable sur les actifs risqués." : "Vent favorable pour les actifs risqués.") });
    }
  }
  const O = m["FX:USOIL"], T = m["TVC:US10Y"];
  if (O && O[3] != null && Math.abs(O[3]) >= REGLES.petrole && !st.vu["oil" + Math.floor(now / 9e5)]) { st.vu["oil" + Math.floor(now / 9e5)] = now; mk({ b: "USD", type: "macro", poids: 2, ctx: {}, titre: O[3] > 0 ? "Le pétrole flambe" : "Le pétrole chute", chiffre: pct(O[3]) + " en 15 min", detail: "à " + fr(O[0], 2) + " $ · " + (O[3] > 0 ? "plus d'inflation attendue" : "moins d'inflation attendue"), txt: "Pétrole " + pct(O[3]) + " en 15 min, à " + fr(O[0], 2) + " $." }); }
  if (T && T[3] != null) { const bp = T[0] * T[3] / 100; if (Math.abs(bp) >= REGLES.taux && !st.vu["us10" + Math.floor(now / 9e5)]) { st.vu["us10" + Math.floor(now / 9e5)] = now; mk({ b: "USD", type: "macro", poids: 2, ctx: {}, titre: bp > 0 ? "Les taux US montent" : "Les taux US baissent", chiffre: (bp > 0 ? "+" : "−") + fr(Math.abs(bp * 100), 0) + " pb en 15 min", detail: "taux 10 ans à " + fr(T[0], 3) + " % · " + (bp > 0 ? "vent contraire pour la crypto" : "vent favorable pour la crypto"), txt: "Taux 10 ans US " + (bp > 0 ? "+" : "−") + fr(Math.abs(bp * 100), 0) + " pb en 15 min, à " + fr(T[0], 3) + " %." }); } }
  for (const e of ((H.cal || {}).a || [])) {
    const dt = (e.ts - now) / 6e4;
    if (dt > 0 && dt <= 10 && !st.vu["av" + e.ts + e.t]) { st.vu["av" + e.ts + e.t] = now; mk({ b: "USD", type: "annonce", poids: 2.5, ctx: {}, titre: e.t + " dans " + Math.ceil(dt) + " min", chiffre: e.f ? "prévu " + e.f : "", detail: (e.p ? "précédent " + e.p + " · " : "") + "risque de mèche dans les deux sens", txt: "Annonce forte dans " + Math.ceil(dt) + " min : " + e.t + (e.f ? " (prévu " + e.f + ", précédent " + e.p + ")" : "") + ". Risque de mèche dans les deux sens." }); }
    if (dt <= -1 && dt > -6 && e.a && !st.vu["ap" + e.ts + e.t]) { st.vu["ap" + e.ts + e.t] = now; mk({ b: "USD", type: "annonce", poids: 3, ctx: {}, titre: e.t + " publié", chiffre: String(e.a), detail: "prévu " + (e.f || "?") + (e.p ? " · précédent " + e.p : ""), txt: e.t + " publié : " + e.a + " (prévu " + (e.f || "?") + ")." }); }
  }
  return E;
}

/* ====================== NEWS : tri par le code ====================== */
function toutesNews() { return (MEM.msgs || []).map((x) => ({ ts: x.ts, src: x.src, t: x.t, u: x.u })).concat(((H.tree || {}).a) || [], ((H.fj || {}).a) || []); }
function noteNews(n) {
  const t = n.t; let sc = 0;
  NEWS_MOTS.forEach(([w, re]) => { if (re.test(t)) sc = Math.max(sc, w); });
  if (NEWS_CRYPTO.test(t)) sc += 2;
  if (/^(\*|BREAKING|JUST IN)/i.test(t)) sc += 1;
  /* Un piratage ne compte comme news majeure que s'il touche une grosse plateforme ou un gros montant */
  if (/\b(HACK(ED)?|EXPLOIT(ED)?|DRAINED)\b/i.test(t) && !/\b(BINANCE|COINBASE|BYBIT|OKX|KRAKEN|HYPERLIQUID|ETHEREUM|BITCOIN|SOLANA|TETHER|USDT|USDC|CIRCLE|LIDO|AAVE|UNISWAP)\b/i.test(t) && !/\$\s?([1-9]\d{2,}|\d+(\.\d+)?\s?(B|BN|BILLION))\s?(M|MN|MILLION)?\b/i.test(t)) sc = Math.min(sc, 3);
  if (n.src === "Whale Alert") { const usd = Number(((t.match(/\(([\d,]+) USD\)/) || [])[1] || "0").replace(/,/g, "")); sc = usd >= 5e8 ? 5 : usd >= 2e8 ? 3 : 0; }
  return sc;
}
/* Clé de doublon : la même news reprise par plusieurs sources */
function cleNews(t) { return t.toUpperCase().replace(/^(\*|BREAKING:?|JUST IN:?)\s*/, "").replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 3).slice(0, 6).sort().join(" "); }
function nouvellesNews(st, now) {
  const out = [];
  for (const n of toutesNews()) {
    if (!n.ts || now - n.ts > 10 * 6e4 || now - n.ts < 0) continue;
    const k = "nw" + cleNews(n.t); if (st.vu[k]) continue; st.vu[k] = now;
    const sc = noteNews(n); if (sc >= 4) out.push({ ...n, sc, k });
  }
  return out;
}

/* ====================== PRIX ====================== */
function prixActuel(b) { const k = (H["1m" + b] || {}).k || []; return k.length ? k[k.length - 1].c : null; }

/* ====================== L'IA ====================== */
let MANUEL_COURANT = "";
let REFLEX = "minimal";               // niveau de réflexion demandé à l'IA (« low » pour les lectures)
const MANUEL = `Tu es l'agent IA du Desk : un trader expérimenté qui surveille BTC, ETH, SOL et la macro pour l'utilisateur.
Le Desk a mesuré lui-même tous les chiffres fournis : ils sont exacts. Ton travail : dire ce qu'ils veulent dire et ce qui compte pour la suite.
Règles absolues :
1. N'invente aucun chiffre. Tout prix cité doit figurer dans les données (niveaux, prix). Écris les prix entre crochets : [82 430].
2. Précise toujours l'unité de temps (5 min, 15 min, 1 h, 4 h, jour).
3. Jamais de consigne d'achat ou de vente. Des scénarios conditionnels seulement (« si… alors… »).
4. Français simple, phrases courtes, pas de remplissage, pas de jargon flou (momentum, sentiment, configuration).
Lecture : prix ↑ OI ↑ = nouveaux acheteurs à levier ; prix ↑ OI ↓ = shorts qui rachètent ; prix ↓ OI ↑ = nouveaux vendeurs ; prix ↓ OI ↓ = longs purgés.
Dollar en hausse ou taux en hausse = vent contraire pour la crypto. Une news suivie d'un move en 3 min explique le move ; un gros move sans news est technique ou lié au levier.
Une cassure n'est valide que sur une clôture de l'unité du niveau. Une mèche au-delà puis un retour = piège probable.
Réponds uniquement avec le JSON demandé.`;
function contexteIA(now) {
  const c = { heure: hm(now), actifs: {}, macro: {}, news: [], agenda: [] };
  for (const b of Object.keys(ACTIFS)) {
    const k1 = (H["1m" + b] || {}).k || []; if (!k1.length) continue; const px = k1[k1.length - 1].c, nv = niveaux(b, px, now);
    c.actifs[b] = { prix: r2(px, dp(px)), tendance: { "15 min": tendance((H["15m" + b] || {}).k), "1 h": tendance((H["1H" + b] || {}).k), "4 h": tendance((H["4H" + b] || {}).k), jour: tendance((H["1D" + b] || {}).k) },
      au_dessus: nv.up.slice(0, 3).map((l) => ({ prix: l.p, nom: l.n, unite: l.u })), en_dessous: nv.dn.slice(0, 3).map((l) => ({ prix: l.p, nom: l.n, unite: l.u })) };
  }
  const m = (H.mac || {}).m || {};
  [["DXY", "TVC:DXY"], ["EURUSD", "FX:EURUSD"], ["PETROLE", "FX:USOIL"], ["TAUX_10A", "TVC:US10Y"], ["NASDAQ", "NASDAQ:NDX"], ["OR", "TVC:GOLD"]].forEach(([k, s]) => { const d = m[s]; if (d) c.macro[k] = { valeur: r2(d[0], 3), jour_pct: r2(d[1]), "15min_pct": r2(d[3], 3) }; });
  c.news = (MEM.msgs || []).slice(0, 5).map((n) => hm(n.ts) + " " + n.src + " : " + n.t.slice(0, 120));
  c.agenda = ((H.cal || {}).a || []).filter((e) => e.ts > now - 36e5 && e.ts < now + 12 * 36e5).slice(0, 4).map((e) => hm(e.ts) + " " + e.t + (e.a ? " = " + e.a : ""));
  return c;
}
function prixConnus(now, seul) { const L = []; for (const b of Object.keys(ACTIFS)) { if (seul && b !== seul) continue; const k1 = (H["1m" + b] || {}).k || []; if (!k1.length) continue; const px = k1[k1.length - 1].c, nv = niveaux(b, px, now); L.push(px, ...nv.up.map((l) => l.p), ...nv.dn.map((l) => l.p)); k1.slice(-30).forEach((x) => L.push(x.h, x.l)); (((H["15m" + b] || {}).k) || []).slice(-8).forEach((x) => L.push(x.o, x.h, x.l, x.c)); } return L; }
/* Vérifie chaque prix entre crochets cité par l'IA ; un prix inventé fait rejeter la phrase */
function propre(t) {
  return String(t || "")
    .replace(/\[\s*([\d.,\s\u202f\u00a0]+?)\s*\]/g, (m, x) => { const v = parseFloat(x.replace(/[\s\u202f\u00a0]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "")); return isFinite(v) && v > 0 ? "[" + fr(v) + "]" : x; })
    .replace(/\[([^\]]*[^\d\s.,\]][^\]]*)\]/g, "$1")
    .replace(/(\d)\.(\d)/g, "$1,$2").replace(/\s+/g, " ").trim();
}
function verifier(t, L) {
  if (!t) return "";
  t = propre(t);
  return String(t).split(/(?<=[.!?])\s+/).filter((ph) => (ph.match(/\[([\d\s.,]+)\]/g) || []).every((x) => { const v = parseFloat(x.replace(/[\[\]\s]/g, "").replace(",", ".")); return L.some((p) => Math.abs(p / v - 1) < 0.0015); })).join(" ").slice(0, 400);
}

function jourIA(st, now) { const j = jourParis(now); if (!st.ia || st.ia.jour !== j) st.ia = { jour: j, n: 0, prov: {}, log: (st.ia && st.ia.log) || [], heures: new Array(24).fill(0) }; return st.ia; }
async function appelIA(env, st, now, tache, donnees) {
  const I = jourIA(st, now);
  if (I.n >= BUDGET_JOUR) return null;
  MANUEL_COURANT = tache.manuel || MANUEL;
  const msg = "TÂCHE : " + tache.consigne + "\nFORMAT : " + tache.format + "\n\nDONNÉES :\n" + JSON.stringify(donnees);
  const ordre = tache.manuel ? IA_ORDRE_LECTURE : IA_ORDRE;
  for (const p of ordre) {
    const P = I.prov[p] = I.prov[p] || { n: 0, ok: 0, er: 0, ti: 0, to: 0, ms: 0 };
    if (p === "gemini" && tache.manuel && P.lite && (P.liteT || 0) > now) { P.etat = "Flash en pause (trop lent)"; continue; }
    if (p === "gemlite" && !env.GEMINI_KEY) { P.etat = "pas de clé"; continue; }
    if (p === "gemini" && !env.GEMINI_KEY) { P.etat = "pas de clé"; continue; }
    if (p === "openrouter" && !env.OPENROUTER_KEY) { P.etat = "pas de clé"; continue; }
    if (p === "groq" && !env.GROQ_KEY) { P.etat = "pas de clé"; continue; }
    if (p === "workersai" && !env.AI) { P.etat = "non branché"; continue; }
    if (P.pause && P.pause > now) continue;
    const t0 = Date.now();
    try {
      const r = await (p === "gemlite" ? gemini(env, msg, "lite") : p === "gemini" ? gemini(env, msg, tache.manuel ? "flash" : "") : p === "groq" ? groq(env, msg) : p === "openrouter" ? openrouter(env, msg) : workersai(env, msg));
      const out = parse(r.txt); P.n++; I.n++; I.heures[heureParis(now)]++;
      P.ti += r.ti || 0; P.to += r.to || 0; P.ms += Date.now() - t0; P.modele = r.m; P.etat = "actif"; P.why = "";
      I.log.push({ ts: now, p, m: r.m, k: tache.nom, ti: r.ti || 0, to: r.to || 0, ms: Date.now() - t0, ok: !!out });
      I.log = I.log.slice(-30);
      if (out) { P.ok++; return { out, p, m: r.m }; }
      P.er++;
    } catch (e) {
      P.n++; P.er++; const st2 = e && e.status, m = String(e && e.message || e).slice(0, 120);
      I.log.push({ ts: now, p, m: P.modele || "", k: tache.nom, ti: 0, to: 0, ms: Date.now() - t0, ok: false, e: m }); I.log = I.log.slice(-30);
      if (st2 === 429) { const jour = /PerDay|per.?day|daily|tokens per day|TPD|RPD/i.test(m + " " + JSON.stringify(e.details || [])); P.pause = jour ? (p === "gemini" ? prochain9h(now) : prochainMinuitUTC(now)) : now + 3 * 6e4; P.etat = jour ? "quota du jour atteint" : "saturé"; P.why = m;
        if (p === "gemini" && jour && !(P.lite && (P.liteT || 0) > now)) { P.lite = 1; P.liteT = prochain9h(now); P.pause = 0; P.etat = "passe sur Flash-Lite"; } }
      else if (st2 === 401 || st2 === 403) { P.pause = now + 36e5; P.etat = "clé refusée"; P.why = m; }
      else { P.pause = now + 2 * 6e4; P.etat = "erreur"; P.why = m; }
    }
  }
  return null;
}
function prochain9h(now) { const p = new Date(new Date(now).toLocaleString("en-US", { timeZone: "Europe/Paris" })), t = new Date(p); t.setHours(9, 0, 0, 0); if (t <= p) t.setDate(t.getDate() + 1); return now + (t - p); }
function prochainMinuitUTC(now) { const d = new Date(now); d.setUTCHours(24, 0, 0, 0); return d.getTime(); }
/* Texte d'une réponse Workers AI, quel que soit son format (« response » ou « choices ») */
function texteWAI(r) { if (!r) return ""; if (typeof r === "string") return r; if (typeof r.response === "string") return r.response; if (r.response && typeof r.response === "object") return JSON.stringify(r.response); const c = r.choices && r.choices[0]; if (c) return (c.message && (c.message.content || c.message.reasoning_content)) || c.text || ""; if (r.result) return texteWAI(r.result); return JSON.stringify(r); }
function parse(t) {
  if (!t) return null;
  t = String(t).replace(/<think>[\s\S]*?<\/think>/g, "").replace(/^[\s\S]*<\/think>/, "").trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const b = t.lastIndexOf("}");
  for (let a = t.lastIndexOf("{", b); a >= 0 && b > a; a = t.lastIndexOf("{", a - 1)) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e2) {} }
  return null;
}
/* Gemini : réflexion minimale pour répondre vite ; trop lent ou indisponible → bascule tout de suite sur Flash-Lite (plus rapide) */
async function gemini(env, msg, mode) {
  const I = jourIA(ST || {}, Date.now()), P = I && I.prov && (I.prov.gemini = I.prov.gemini || { n: 0, ok: 0, er: 0, ti: 0, to: 0, ms: 0 });
  const appel = async (m, ms) => {
    const body = { systemInstruction: { parts: [{ text: MANUEL_COURANT || MANUEL }] }, contents: [{ role: "user", parts: [{ text: msg }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: REFLEX === "minimal" ? 2048 : 6000, thinkingConfig: { thinkingLevel: REFLEX } } };
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + m + ":generateContent", opt = () => ({ method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_KEY }, body: JSON.stringify(body) });
    let j;
    try { j = await json(url, opt(), ms); }
    catch (e) {
      /* Réglage de réflexion refusé par ce modèle : on essaie « low », puis sans réglage */
      if (e.status === 400 && /think/i.test(e.message)) { body.generationConfig.thinkingConfig = { thinkingLevel: "low" }; try { j = await json(url, opt(), ms); } catch (e2) { if (e2.status === 400 && /think/i.test(e2.message)) { delete body.generationConfig.thinkingConfig; j = await json(url, opt(), ms); } else throw e2; } }
      else throw e;
    }
    const c = (j.candidates || [])[0] || {}, u = j.usageMetadata || {};
    return { txt: ((c.content || {}).parts || []).filter((x) => !x.thought).map((x) => x.text || "").join(""), ti: u.promptTokenCount || 0, to: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0), m };
  };
  const lent0 = REFLEX === "minimal" ? 1 : 1.7;
  if (mode === "lite") return appel("gemini-flash-lite-latest", 30000 * lent0);
  if (P && P.lite && (P.liteT || 0) > Date.now()) return appel("gemini-flash-lite-latest", 30000 * lent0);
  try { return await appel("gemini-flash-latest", 35000 * lent0); }
  catch (e) {
    const lent = /abort/i.test(String(e && (e.name + " " + e.message))) || (e && (e.status === 503 || e.status === 500));
    if (!lent) throw e;
    if (P) { P.lite = 1; P.liteT = Date.now() + 30 * 6e4; P.etat = "passe sur Flash-Lite pour 30 min (Flash trop lent)"; }
    if (mode === "flash") throw e;          // pour une lecture, Groq passe avant Flash-Lite
    return appel("gemini-flash-lite-latest", 30000 * lent0);
  }
}
let OR_MODELE = { id: "", t: 0 };
async function openrouter(env, msg) {
  if (!OR_MODELE.id || Date.now() - OR_MODELE.t > 6 * 36e5) {
    const j = await json("https://openrouter.ai/api/v1/models", {}, 15000), fr2 = (j.data || []).filter((m) => /:free$/.test(m.id) && (m.context_length || 0) >= 32000 && !/vision|-vl|image|audio|embed|guard|coder/i.test(m.id));
    let id = ""; [/deepseek.*(v3|chat)/i, /gpt-oss-120b/i, /qwen3.*(235|480|max)/i, /llama-3\.3-70b/i, /deepseek/i, /qwen3/i].some((re) => { const f = fr2.find((m) => re.test(m.id)); if (f) id = f.id; return !!id; });
    OR_MODELE = { id: id || (fr2[0] && fr2[0].id) || "", t: Date.now() };
  }
  const j = await json("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.OPENROUTER_KEY, "x-title": "Captain Trading Desk" },
    body: JSON.stringify({ model: OR_MODELE.id, messages: [{ role: "system", content: MANUEL_COURANT || MANUEL }, { role: "user", content: msg }], temperature: 0.3, max_tokens: 3000 }) }, 70000);
  if (j.error) { const e = new Error(j.error.message || "erreur"); e.status = +j.error.code || 500; throw e; }
  const c = (j.choices || [])[0] || {}, u = j.usage || {};
  return { txt: (c.message || {}).content || "", ti: u.prompt_tokens || 0, to: u.completion_tokens || 0, m: OR_MODELE.id.replace(/:free$/, "") };
}
/* Groq : réflexion courte ; si le modèle rate le format JSON imposé, on relance sans format imposé (le Desk sait lire la réponse) */
async function groq(env, msg) {
  const body = { model: GROQ_MODELE, messages: [{ role: "system", content: MANUEL_COURANT || MANUEL }, { role: "user", content: msg }], temperature: 0.3, max_tokens: REFLEX === "minimal" ? 1500 : 5000, response_format: { type: "json_object" }, reasoning_effort: REFLEX === "minimal" ? "low" : "medium" };
  const go = () => json("https://api.groq.com/openai/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + env.GROQ_KEY }, body: JSON.stringify(body) }, REFLEX === "minimal" ? 45000 : 70000);
  let j;
  try { j = await go(); }
  catch (e) {
    if (e.status !== 400) throw e;
    if (/json|failed_generation/i.test(e.message)) delete body.response_format;
    if (/reasoning/i.test(e.message)) delete body.reasoning_effort;
    if (!/json|failed_generation|reasoning/i.test(e.message)) throw e;
    j = await go();
  }
  const c = (j.choices || [])[0] || {}, u = j.usage || {};
  return { txt: (c.message || {}).content || "", ti: u.prompt_tokens || 0, to: u.completion_tokens || 0, m: GROQ_MODELE.split("/").pop() };
}
async function workersai(env, msg) {
  const r = await env.AI.run(WAI_MODELE, { messages: [{ role: "system", content: MANUEL_COURANT || MANUEL }, { role: "user", content: msg }], max_tokens: 2000, temperature: 0.3 });
  const u = r.usage || {};
  return { txt: texteWAI(r), ti: u.prompt_tokens || 0, to: u.completion_tokens || 0, m: WAI_MODELE.split("/").pop() };
}

/* Photo du marché : prix, variations, levier, liquidations, niveaux, macro, news des 30 dernières minutes */
function photo(now) {
  const c = contexteIA(now);
  for (const b of Object.keys(c.actifs)) {
    const k1 = (H["1m" + b] || {}).k || [], px = c.actifs[b].prix, oi = H["oi" + b] || [], lq = (H["liq" + b] || []).filter((x) => now - x.t < 15 * 6e4);
    const h1 = ((H["1H" + b] || {}).k || []), p60 = h1.length > 1 ? h1[h1.length - 2].c : null;
    Object.assign(c.actifs[b], { "5min_pct": k1.length > 6 ? r2((px / k1[k1.length - 6].o - 1) * 100) : null, "1h_pct": p60 ? r2((px / p60 - 1) * 100) : null,
      oi_15min_pct: oi.length >= 4 && Math.abs(oi[oi.length - 1].usd / oi[oi.length - 4].usd - 1) < 0.3 ? r2((oi[oi.length - 1].usd / oi[oi.length - 4].usd - 1) * 100) : null,
      liquidations_15min: { longs: Math.round(lq.filter((x) => x.long).reduce((s2, x) => s2 + x.usd, 0)), shorts: Math.round(lq.filter((x) => !x.long).reduce((s2, x) => s2 + x.usd, 0)) } });
  }
  const m = (H.mac || {}).m || {}, D = m["TVC:DXY"], EU = m["FX:EURUSD"], nr = med(((H.dxyHist || {}).r || []).slice(-60));
  if (D) c.macro.DXY_bougie_5min_vs_normale = D[5] != null && nr ? r2((D[5] - D[6]) / nr, 1) : null;
  if (EU && EU[8] && EU[9]) c.macro.EURUSD_volume_5min_vs_normale = r2(EU[8] / (EU[9] / 288), 1);
  c.news = toutesNews().filter((n) => now - n.ts < 30 * 6e4).sort((a, b) => b.ts - a.ts).slice(0, 8).map((n) => hm(n.ts) + " " + n.src + " : " + n.t.slice(0, 110));
  return c;
}
/* ====================== L'ANALYSTE (v10) ======================
   L'agent ne publie plus de messages de niveaux. Toutes les 30 min (et tout de suite si un événement compte
   ou si quelqu'un la demande), l'IA relit tout le marché et écrit UNE lecture : ce qui se passe, pourquoi
   (les causes reliées entre elles), un scénario haussier et un baissier par actif avec niveau et cible,
   ce qui invaliderait tout. Le Desk suit ensuite chaque scénario (déclenché ? cible atteinte ?). */
const SCN = { dmin: 0.2, tmin: 0.4 };   // % : distance minimale prix → déclencheur, déclencheur → objectif
const LECTURE = { evtPause: 30 * 6e4, evtFort: 15 * 6e4, evtJour: 14, garde: 48, publiees: 10, suivi: 4 * 36e5 };
const MANUEL_ANALYSTE = `Tu es l'analyste du Desk : un trader crypto expérimenté qui explique le marché à un autre trader (BTC, ETH, SOL, dollar et macro).
Le Desk a mesuré tous les chiffres fournis : ils sont exacts. Ton travail est d'INTERPRÉTER, pas de décrire.
Ce qu'on attend de toi :
- Relier les faits entre eux. Un mouvement a une cause : news, dollar, taux, pétrole, actions, levier qui monte ou qui se purge, liquidations, cassure d'un niveau suivi par tout le monde. Dis laquelle, chiffre à l'appui. Si aucune cause n'est visible, dis-le (mouvement technique, marché sans acheteurs…).
- Dire ce que ça implique : qui a la main, qui est piégé, ce que le marché va chercher (liquidité au-dessus d'un sommet, retour au POC, comblement…).
- Donner pour chaque actif un scénario haussier et un scénario baissier utiles : un déclencheur précis (clôture d'une unité de temps au-dessus ou sous un niveau des données) et une cible (un autre niveau des données).
- Assurer la continuité : tu reçois ta lecture précédente et ce que ses scénarios ont donné. Dis franchement ce qui a marché, ce qui a raté et ce qui a changé.
- Quand le marché est calme, dis-le et explique ce qui pourrait le réveiller (annonce, niveau proche, levier qui s'accumule).
Tiens compte de la séance (champ « seance ») : à l'ouverture de Wall Street, le flux des actions explique souvent le mouvement. Ne relie un mouvement à une news que si le lien est plausible (une news sans rapport avec les marchés n'explique rien).
Pour chaque scénario, choisis un déclencheur à au moins 0,2 % du prix actuel et un objectif à au moins 0,4 % au-delà du déclencheur : un niveau collé au prix n'est que du bruit.
Chaque actif a une liste « faits » calculée par le Desk : elle fait foi. Ne la contredis jamais (si les faits disent « surtout des SHORTS », ne parle pas de purge des longs).
Les montants s'écrivent comme dans les faits (k$, M$). La tendance que tu donnes est le sens le plus probable des 4 prochaines heures, cohérent avec ta lecture.
Lecture du levier (open interest) : prix en hausse et OI en hausse = nouveaux acheteurs à levier (fragile si ça s'emballe) ; prix en hausse et OI en baisse = shorts qui rachètent (peut s'essouffler) ; prix en baisse et OI en hausse = nouveaux vendeurs ; prix en baisse et OI en baisse = longs purgés (souvent proche d'une fin de baisse).
Dollar ou taux en hausse = vent contraire pour la crypto. Pétrole en forte hausse = risque d'inflation, donc de taux en hausse.
Une cassure n'est valide que sur une clôture de l'unité du niveau. Une mèche au-delà puis un retour = piège probable.
Règles absolues :
1. N'invente aucun chiffre. Tout prix cité vient des données. Écris les prix entre crochets : [82 430].
2. Précise l'unité de temps (15 min, 1 h, 4 h, jour).
3. Jamais de consigne d'achat ou de vente, jamais « achetez », « vendez », « entrez », « shortez ». Des scénarios conditionnels seulement.
4. Français simple et direct, phrases courtes. Interdit : remplissage, généralités, « momentum », « sentiment », « configuration », « il convient de ».
5. Ne recopie pas un chiffre sans dire ce qu'il veut dire.
Réponds uniquement avec le JSON demandé.`;
const FORMAT_LECTURE = `{"titre":"ce qui se passe, concret, 10 mots max","climat":"favorable|défavorable|neutre","resume":"2 phrases : la situation et ce qu'elle veut dire pour la suite","pourquoi":["une cause reliée à un chiffre, 22 mots max","une autre cause","une troisième si utile"],"depuis":"ce qui a changé depuis ta lecture précédente et si ses scénarios ont marché, 25 mots max (vide s'il n'y en a pas)","dollar":"dollar, taux, pétrole, actions et leur effet sur la crypto, 25 mots max","BTC":{"tendance":"hausse|baisse|range","lecture":"qui a la main et pourquoi, 30 mots max","hausse":{"si":"déclencheur précis, 12 mots max","niveau":83437,"cible":84348},"baisse":{"si":"déclencheur précis, 12 mots max","niveau":83150,"cible":82726}},"ETH":{"…":"même forme que BTC"},"SOL":{"…":"même forme que BTC"},"invalide":"ce qui changerait toute la lecture, 15 mots max","surveiller":"la chose n°1 à surveiller dans l'heure, 15 mots max"}`;

const var15 = (q, n, px) => (q.length > n ? r2((px / q[q.length - 1 - n].c - 1) * 100) : null);
function etatSc(sc) { if (!sc) return "aucun"; return (sc.si || "") + (sc.niv ? " (niveau " + fr(sc.niv) + (sc.cible ? ", cible " + fr(sc.cible) : "") + ")" : "") + " → " + (sc.ok ? "déclenché à " + hm(sc.dec) + ", cible atteinte à " + hm(sc.ok) : sc.dec ? "déclenché à " + hm(sc.dec) + ", cible pas encore atteinte" : "pas déclenché"); }
function contexteLecture(st, now) {
  const c = photo(now);
  for (const b of Object.keys(c.actifs)) {
    const a = c.actifs[b], px = a.prix, nv = niveaux(b, px, now), q = (H["15m" + b] || {}).k || [], oi = H["oi" + b] || [], lq = (H["liq" + b] || []).filter((x) => now - x.t < 60 * 6e4);
    a.au_dessus = nv.up.map((l) => ({ prix: l.p, nom: l.n, unite: l.u })); a.en_dessous = nv.dn.map((l) => ({ prix: l.p, nom: l.n, unite: l.u }));
    a["4h_pct"] = var15(q, 16, px); a["24h_pct"] = var15(q, 96, px);
    a.oi_25min_pct = oi.length >= 6 && oi[0].usd > 0 && Math.abs(oi[oi.length - 1].usd / oi[0].usd - 1) < 0.3 ? r2((oi[oi.length - 1].usd / oi[0].usd - 1) * 100) : null;
    a.liquidations_1h = { longs: Math.round(lq.filter((x) => x.long).reduce((s, x) => s + x.usd, 0)), shorts: Math.round(lq.filter((x) => !x.long).reduce((s, x) => s + x.usd, 0)) };
    const lq1 = a.liquidations_1h, tot = lq1.longs + lq1.shorts, p30 = var15(q, 2, px), o25 = a.oi_25min_pct, T = a.tendance || {}, tn = (s) => (s === "▲" ? "haussière" : s === "▼" ? "baissière" : s === "●" ? "neutre" : "?");
    a.faits = [
      tot < ACTIFS[b].liq / 2 ? "liquidations 1 h faibles (" + usd(tot) + ")" : lq1.shorts > lq1.longs * 2 ? "liquidations 1 h : surtout des SHORTS (" + usd(lq1.shorts) + " contre " + usd(lq1.longs) + " de longs) = rachats forcés de vendeurs" : lq1.longs > lq1.shorts * 2 ? "liquidations 1 h : surtout des LONGS (" + usd(lq1.longs) + " contre " + usd(lq1.shorts) + " de shorts) = purge des acheteurs à levier" : "liquidations 1 h équilibrées (longs " + usd(lq1.longs) + ", shorts " + usd(lq1.shorts) + ")",
      p30 == null || o25 == null ? "levier : pas assez de données" : p30 > 0.15 && o25 > 0.3 ? "30 min : prix " + pct(p30) + " et levier " + pct(o25) + " = nouveaux acheteurs à levier" : p30 > 0.15 && o25 < -0.3 ? "30 min : prix " + pct(p30) + " et levier " + pct(o25) + " = des shorts rachètent (pas de nouveaux acheteurs)" : p30 < -0.15 && o25 > 0.3 ? "30 min : prix " + pct(p30) + " et levier " + pct(o25) + " = nouveaux vendeurs à découvert" : p30 < -0.15 && o25 < -0.3 ? "30 min : prix " + pct(p30) + " et levier " + pct(o25) + " = des longs sont purgés" : "30 min : prix " + pct(p30) + ", levier " + pct(o25) + " = pas de changement net du levier",
      (() => { const t = [["15 min", T["15 min"]], ["1 h", T["1 h"]], ["4 h", T["4 h"]], ["jour", T.jour]].filter((z) => z[1]).map((z) => z[0] + " " + tn(z[1])).join(", "); return t ? "tendance (moyennes 20 et 50) : " + t : ""; })(),
      a.au_dessus[0] && a.en_dessous[0] ? "prix entre " + lvl(a.en_dessous[0].prix) + " (" + a.en_dessous[0].nom + ") et " + lvl(a.au_dessus[0].prix) + " (" + a.au_dessus[0].nom + ")" : "" ].filter(Boolean);
    a.bougies_15min = q.slice(-8).map((x) => hm(x.t) + " ouv " + fr(x.o) + " haut " + fr(x.h) + " bas " + fr(x.l) + " clôt " + fr(x.c));
  }
  c.seance = seances(now).txt;
  c.evenements_detectes = (st.evt || []).filter((e) => now - e.ts < 2 * 36e5).slice(-14).map((e) => hm(e.ts) + " · " + e.b + " · " + String(e.txt).replace(/[\[\]]/g, ""));
  const vus = {};
  c.news = toutesNews().filter((n) => n.ts && n.ts <= now && now - n.ts < 90 * 6e4).map((n) => ({ n, sc: noteNews(n), k: cleNews(n.t) }))
    .filter((x) => (vus[x.k] ? false : (vus[x.k] = 1))).sort((x, y) => y.sc - x.sc || y.n.ts - x.n.ts).slice(0, 12).sort((x, y) => y.n.ts - x.n.ts)
    .map((x) => hm(x.n.ts) + " " + x.n.src + " : " + x.n.t.replace(/\s+/g, " ").slice(0, 170));
  c.agenda = ((H.cal || {}).a || []).filter((e) => e.ts > now - 3 * 36e5 && e.ts < now + 12 * 36e5).slice(0, 6).map((e) => hm(e.ts) + " " + e.t + (e.a ? " · publié " + e.a : "") + (e.f ? " · prévu " + e.f : "") + (e.p ? " · précédent " + e.p : ""));
  const P = (st.lectures || [])[(st.lectures || []).length - 1];
  if (P) c.ta_lecture_precedente = { heure: hm(P.ts), il_y_a_min: Math.round((now - P.ts) / 6e4), titre: P.titre, resume: P.resume,
    scenarios: Object.fromEntries(Object.keys(P.actifs || {}).map((b) => { const x = P.actifs[b]; return [b, { prix_alors: x.px, prix_maintenant: c.actifs[b] ? c.actifs[b].prix : null, hausse: etatSc(x.hausse), baisse: etatSc(x.baisse) }]; })) };
  return c;
}
async function lire(env, st, now, raison) {
  const c = contexteLecture(st, now);
  if (!c.actifs || Object.keys(c.actifs).length < 2) return null;
  c.raison_de_cette_lecture = raison.txt;
  REFLEX = "low";
  let R = null;
  const envoi = JSON.parse(JSON.stringify(c));
  for (const b of Object.keys(envoi.actifs)) ["oi_15min_pct", "oi_25min_pct", "liquidations_15min", "liquidations_1h", "tendance"].forEach((k) => delete envoi.actifs[b][k]);
  try { R = await appelIA(env, st, now, { nom: "lecture", manuel: MANUEL_ANALYSTE, consigne: "Écris ta lecture du marché maintenant. Raison de cette lecture : " + raison.txt + ".", format: FORMAT_LECTURE }, envoi); }
  finally { REFLEX = "minimal"; }
  if (!R) return null;
  const o = R.out, tout = prixConnus(now), V = (t, K, n) => verifier(String(t || ""), K || tout).slice(0, n || 400);
  const L = { id: "l" + (++st.n), ts: now, raison: { k: raison.k, txt: String(raison.txt).replace(/[\[\]]/g, "").slice(0, 160), b: raison.b || "" },
    titre: V(o.titre, 0, 130) || "Lecture du marché", climat: /d.favorable|defavorable/i.test(o.climat || "") ? "d" : /favorable/i.test(o.climat || "") ? "u" : "n",
    resume: V(o.resume, 0, 460), pourquoi: (Array.isArray(o.pourquoi) ? o.pourquoi : []).map((x) => V(x, 0, 240)).filter(Boolean).slice(0, 4),
    depuis: P0(st) ? V(o.depuis, 0, 280) : "", dollar: V(o.dollar, 0, 280), invalide: V(o.invalide, 0, 200), surveiller: V(o.surveiller, 0, 200),
    agenda: ((H.cal || {}).a || []).filter((e) => e.ts > now - 36e5 && e.ts < now + 12 * 36e5).slice(0, 4).map((e) => ({ ts: e.ts, t: String(e.t).slice(0, 80), f: e.f || "", p: e.p || "", a: e.a || "" })),
    actifs: {}, ia: { p: R.p, m: R.m } };
  for (const b of Object.keys(ACTIFS)) {
    const x = o[b] || {}, a = c.actifs[b]; if (!a) continue;
    const K = prixConnus(now, b), ok = (v) => { v = Number(v); return v > 0 && K.some((p) => Math.abs(p / v - 1) < 0.0015) ? r2(v, dp(v)) : null; };
    const nomDe = (v) => { const l = a.au_dessus.concat(a.en_dessous).find((z) => Math.abs(z.prix / v - 1) < 0.0015); return l ? l.nom : ""; };
    const ecartPct = (u, v) => Math.abs(u / v - 1) * 100;
    /* Scénario du Desk : le premier niveau à au moins 0,2 % du prix, l'objectif au premier niveau à au moins 0,4 % au-delà */
    const auto = (d) => { const A = (d > 0 ? a.au_dessus : a.en_dessous) || [], k = A.findIndex((l) => ecartPct(l.prix, a.prix) >= SCN.dmin); if (k < 0) return null;
      const n = A[k], c = A.slice(k + 1).find((l) => ecartPct(l.prix, n.prix) >= SCN.tmin);
      return { si: "clôture 15 min " + (d > 0 ? "au-dessus" : "sous") + " de " + lvl(n.prix) + " (" + n.nom + ")", niv: n.prix, nivN: n.nom, cible: c ? c.prix : null, cibleN: c ? c.nom : "", auto: 1 }; };
    const sc = (s, d) => {
      const y = x[s]; if (!y || typeof y === "string") return auto(d);
      let niv = ok(y.niveau), cible = ok(y.cible);
      if (niv && (d > 0 ? niv <= a.prix : niv >= a.prix)) niv = null;                 // un déclencheur doit être devant le prix
      const siPrix = (String(y.si || "").match(/\[([\d\s.,]+)\]/g) || []).map((z) => parseFloat(z.replace(/[\[\]\s]/g, "").replace(",", ".")));
      if (!niv || siPrix.some((p) => (d > 0 ? p <= a.prix : p >= a.prix))) return auto(d);
      if (cible && (d > 0 ? cible <= (niv || a.prix) : cible >= (niv || a.prix))) cible = null;
      /* Déclencheur collé au prix, ou objectif trop proche : on prend le scénario du Desk */
      if (ecartPct(niv, a.prix) < SCN.dmin || !cible || ecartPct(cible, niv) < SCN.tmin) return auto(d);
      const si = V(y.si, K, 170); if (!si && !niv) return null;
      return { si, niv, nivN: niv ? nomDe(niv) : "", cible, cibleN: cible ? nomDe(cible) : "" };
    };
    L.actifs[b] = { px: a.prix, m5: a["5min_pct"], h1: a["1h_pct"], h4: a["4h_pct"], j: a["24h_pct"], oi: a.oi_15min_pct, liq: a.liquidations_1h,
      faits: (a.faits || []).map((f) => f.replace(/[\[\]]/g, "")), tendance: /hauss/i.test(x.tendance) ? "u" : /bais/i.test(x.tendance) ? "d" : "n", lecture: V(x.lecture, K, 320), hausse: sc("hausse", 1), baisse: sc("baisse", -1) };
  }
  return L;
}
function P0(st) { return (st.lectures || []).length > 0; }
/* Suivi façon trade (v14). Pour chaque actif d'une lecture, UN seul scénario compte : le premier qui se déclenche,
   sur une CLÔTURE 15 min au-delà de son niveau (une mèche ne suffit pas). Ensuite :
   - le stop est le niveau d'en face (le support pour un scénario haussier, la résistance pour un baissier) :
     un simple retest du niveau cassé n'est plus compté comme un échec ;
   - cible touchée avant le stop → réussi ; clôture 15 min au-delà du stop avant la cible → raté ;
   - ni l'un ni l'autre en 4 h → neutre, avec le résultat en % à la fin ;
   - un scénario sans objectif, ou dont l'objectif est plus proche que le stop (gain/risque < 0,8), n'est pas compté ;
   - aucun niveau cassé en 4 h → la lecture ne compte pas. */
const RR_MIN = 0.8;
function suivreLectures(st, now) {
  let ch = false;
  const B = st.bil3 = st.bil3 || { jours: {}, actifs: {}, recent: [] };
  for (const L of st.lectures || []) {
    if (L.fin) continue;
    const fin = L.ts + LECTURE.suivi;
    for (const b of Object.keys(L.actifs || {})) {
      const x = L.actifs[b], p = prixActuel(b);
      if (!x.hausse && !x.baisse) continue;
      /* Bougies 15 min clôturées après la lecture (et avant la fin du suivi) */
      const q = (((H["15m" + b] || {}).k) || []).filter((z) => z.ok && z.t + 9e5 > L.ts && z.t + 9e5 <= Math.min(now, fin));
      const m1 = (((H["1m" + b] || {}).k) || []).filter((z) => z.t >= L.ts && z.t < fin);
      if (!x.tr) {
        for (const c of q) {
          const fc = c.t + 9e5;
          if (x.hausse && x.hausse.niv && c.c > x.hausse.niv) { x.tr = { s: "hausse", d: 1, t: fc, e: x.hausse.niv, c: x.hausse.cible }; break; }
          if (x.baisse && x.baisse.niv && c.c < x.baisse.niv) { x.tr = { s: "baisse", d: -1, t: fc, e: x.baisse.niv, c: x.baisse.cible }; break; }
        }
        if (x.tr) {
          const T0 = x.tr, sc = x[T0.s], autre = x[T0.s === "hausse" ? "baisse" : "hausse"];
          /* Le stop : le niveau d'en face ; à défaut, la même distance que l'objectif de l'autre côté (gain/risque de 1) */
          let sl = autre && autre.niv && (T0.d > 0 ? autre.niv < T0.e : autre.niv > T0.e) ? autre.niv : null;
          if (!sl && T0.c) sl = r2(T0.e - (T0.c - T0.e), dp(T0.e));
          T0.sl = sl;
          T0.rr = T0.c && sl ? r2(Math.abs(T0.c - T0.e) / Math.max(1e-9, Math.abs(T0.e - sl)), 2) : null;
          if (T0.rr == null || T0.rr < RR_MIN) T0.skip = 1;
          sc.dec = T0.t; sc.mode = "cloture"; sc.stopNiv = sl; sc.rr = T0.rr; ch = true; if (autre) autre.ignore = 1;
        }
      }
      const T = x.tr;
      if (T && !T.res) {
        const sc = x[T.s];
        /* Après l'entrée : la cible (touchée) et le stop (clôture 15 min au-delà du niveau d'en face), dans l'ordre où ils arrivent */
        for (const c of q.filter((z) => z.t + 9e5 > T.t)) {
          if (T.c && (T.d > 0 ? c.h >= T.c : c.l <= T.c)) { T.res = "ok"; T.tf = c.t; break; }
          if (T.sl && (T.d > 0 ? c.c < T.sl : c.c > T.sl)) { T.res = "ko"; T.tf = c.t + 9e5; T.xs = c.c; break; }
        }
        if (!T.res && T.c) { const hi = Math.max(...m1.filter((z) => z.t >= T.t).map((z) => z.h), now < fin && p ? p : -Infinity), lo = Math.min(...m1.filter((z) => z.t >= T.t).map((z) => z.l), now < fin && p ? p : Infinity);
          if (T.d > 0 ? hi >= T.c : lo <= T.c) { T.res = "ok"; T.tf = now; } }
        if (T.res === "ok") { sc.ok = T.tf; ch = true; }
        if (T.res === "ko") { sc.stop = T.tf; ch = true; }
      }
    }
    if (now >= fin) {
      L.fin = 1; ch = true;
      const j = jourParis(L.ts);
      for (const b of Object.keys(L.actifs || {})) {
        const x = L.actifs[b], T = x.tr, p = prixActuel(b);
        if (T && T.skip) continue;                         // gain/risque trop faible : pas compté
        const res = !T ? "nd" : T.res || "ne";
        const mv = T ? r2(((T.res === "ok" && T.c ? T.c : T.res === "ko" ? T.xs || T.sl || T.e : p || T.e) / T.e - 1) * 100 * T.d) : null;
        const inc = (o, k2) => { o[k2] = o[k2] || { ok: 0, ko: 0, ne: 0, nd: 0 }; o[k2][res]++; };
        inc(B.jours, j); inc(B.actifs, b);
        if (T) B.recent.push({ ts: L.ts, b, s: T.s, res, mv, rr: T.rr, pot: T.c ? r2(Math.abs(T.c / T.e - 1) * 100) : null, si: String((x[T.s] || {}).si || "").replace(/[\[\]]/g, "").slice(0, 110), niv: T.e, cible: T.c || null, sl: T.sl || null });
      }
      B.recent = B.recent.slice(-90);
      const ks = Object.keys(B.jours).sort(); while (ks.length > 30) delete B.jours[ks.shift()];
    }
  }
  return ch;
}

/* ====================== FAIRE LE POINT (à la demande) ====================== */
/* Route /point : renvoie la dernière lecture demandée si elle a moins de 5 min ; sinon enregistre une demande, traitée au tour suivant (moins d'une minute) */
async function pointMaintenant(env) {
  if (!env.DESK) return { erreur: "stockage DESK non configuré" };
  const now = Date.now(), dernier = JSON.parse(await env.DESK.get("point") || "null"), dem = +(await env.DESK.get("pointDemande") || 0);
  if (dernier && now - dernier.ts < 5 * 6e4) return { ...dernier, recent: true };
  if (dem && now - dem < 3 * 6e4) return { attente: true, depuis: dem };
  await env.DESK.put("pointDemande", String(now));
  return { attente: true, depuis: now };
}

/* ====================== LE TOUR (toutes les minutes) ====================== */
let ST = null;
const DIAG = { ok: 0, n: 0, err: "", errT: 0 };
function neuf() { return { v: 2, lectures: [], evt: [], vu: {}, cool: {}, n: 0, ia: null, ecrit: 0 }; }
async function tour(env) {
  const now = Date.now(); SR = 0; DIAG.okxKo = 0;
  if (!ST && env.DESK) { try { const p = await env.DESK.get("public", { type: "json" }); ST = p && p._st ? p._st : await env.DESK.get("etat", { type: "json" }); } catch (e) {} }
  const st = ST = ST || neuf(); st.vu = st.vu || {}; st.cool = st.cool || {}; st.lectures = st.lectures || []; st.evt = st.evt || [];
  if (st.feed) delete st.feed; if (st.bil) delete st.bil; if (st.bil2) delete st.bil2;                     // ancien fil de messages (avant la v10)
  /* Données lentes gardées dans le stockage (bougies 1 h, 4 h, jour, agenda, historique du dollar) */
  const CLES_LENTES = ["1HBTC", "4HBTC", "1DBTC", "1HETH", "4HETH", "1DETH", "1HSOL", "4HSOL", "1DSOL", "dxyHist", "cal"];
  if (!H._lent && env.DESK) { H._lent = 1; try { const L = await env.DESK.get("lent", { type: "json" }); if (L) CLES_LENTES.forEach((k) => { if (L[k] && !H[k]) H[k] = L[k]; }); } catch (e) {} }
  const avantLent = CLES_LENTES.map((k) => (H[k] ? H[k].t : 0)).join();
  await collecte(now);
  /* Un actif sans bougies (OKX n'a pas répondu) est réessayé une fois, tant qu'il reste de la marge */
  for (const b of Object.keys(ACTIFS)) if (!((H["1m" + b] || {}).k || []).length && SR < 40) { const k = await bougies(b, "1m", 40); if (k) H["1m" + b] = { t: now, k }; }
  for (const b of Object.keys(ACTIFS)) if (!((H["15m" + b] || {}).k || []).length && SR < 40) { const k = await bougies(b, "15m", 100); if (k) H["15m" + b] = { t: now, k }; }
  if (env.DESK && CLES_LENTES.map((k) => (H[k] ? H[k].t : 0)).join() !== avantLent && now - (st.lentT || 0) > 12 * 6e4) {
    st.lentT = now; st.kv = st.kv && st.kv.d === jourParis(now) ? st.kv : { d: jourParis(now), n: 0 }; st.kv.n++;
    try { await env.DESK.put("lent", JSON.stringify(Object.fromEntries(CLES_LENTES.filter((k) => H[k]).map((k) => [k, H[k]])))); } catch (e) {}
  }
  /* 1. Ce que le Desk détecte (cassures, purges, levier, dollar, annonces, news) : ça ne s'affiche plus, ça nourrit l'analyste
        et, si c'est important, ça déclenche une lecture tout de suite */
  let ev = []; try { ev = detecter(st, now); } catch (e) { DIAG.errDetect = String(e && e.message || e).slice(0, 200); }
  st.evt = st.evt.filter((e) => now - e.ts < 3 * 36e5);
  let declencheur = null;
  const parActif = {};
  ev.forEach((e) => { (parActif[e.b] = parActif[e.b] || []).push(e); });
  for (const b of Object.keys(parActif)) {
    const L = parActif[b].sort((x, y) => y.poids - x.poids), top = L[0], cle = b + top.type;
    if (top.type === "vol") continue;
    const cd = st.cool[cle];
    if (cd && now - cd.t < REGLES.pause && top.poids < cd.p + 1) continue;
    st.cool[cle] = { t: now, p: top.poids };
    const conf = new Set(L.map((x) => x.type)).size, score = top.poids + (conf - 1) * 0.8, imp = score >= 4 ? 3 : score >= 2.5 ? 2 : 1;
    const e = { ts: now, b, type: top.type, imp, txt: (top.titre ? top.titre + (top.chiffre ? " " + top.chiffre : "") + (top.detail ? " (" + top.detail + ")" : "") : top.txt).replace(/[\[\]]/g, "").slice(0, 220) };
    st.evt.push(e);
    const fort = imp >= 3 || (imp >= 2 && /^(purgeL|purgeS|move|glisse|dollar)$/.test(top.type)) || (top.type === "casse" && top.lv && /^(S|J)$/.test(top.lv.u));
    if (fort && (!declencheur || imp > declencheur.imp)) declencheur = e;
  }
  for (const n of nouvellesNews(st, now)) {
    const e = { ts: now, b: NEWS_CRYPTO.test(n.t) ? "CRYPTO" : "MACRO", type: "news", imp: n.sc >= 7 ? 3 : 2, txt: n.src + " : " + n.t.replace(/\s+/g, " ").slice(0, 200) };
    st.evt.push(e);
    if (n.sc >= 7 && (!declencheur || e.imp > declencheur.imp)) declencheur = e;
  }
  st.evt = st.evt.slice(-40);
  /* 2. Suivi des scénarios des lectures */
  let suivi = false; try { suivi = suivreLectures(st, now); } catch (e) { DIAG.errSuivi = String(e && e.message || e).slice(0, 200); }
  /* 3. La lecture : demandée, déclenchée par un événement, ou régulière (toutes les 30 min, à l'heure et à la demie) */
  const I = jourIA(st, now), mn = minuteParis(now), depuisLec = now - (st.lecT || 0);
  let raison = null;
  try { const dem = env.DESK ? +(await env.DESK.get("pointDemande") || 0) : 0; if (dem && dem > (st.pointT || 0)) { st.pointT = now; raison = { k: "demande", txt: "lecture demandée depuis le Desk" }; } } catch (e) {}
  /* Un événement fort arrivé trop tôt après une lecture reste en attente 12 min : il déclenche dès que la pause est passée */
  /* Un événement fort (importance 3 : purge, gros mouvement, news majeure) relance une lecture 15 min après la précédente, les autres 30 min après ;
     il reste en attente 20 min pour ne pas être perdu */
  if (declencheur && (!st.decl || now - st.decl.ts > 20 * 6e4 || declencheur.imp >= st.decl.imp)) st.decl = declencheur;
  if (st.decl && now - st.decl.ts > 20 * 6e4) st.decl = null;
  if (!raison && st.decl && depuisLec > (st.decl.imp >= 3 || /^(purgeL|purgeS|move|glisse)$/.test(st.decl.type || "") ? LECTURE.evtFort : LECTURE.evtPause) && (I.evt || 0) < LECTURE.evtJour) { I.evt = (I.evt || 0) + 1; raison = { k: "event", txt: st.decl.txt, b: st.decl.b }; st.decl = null; }
  const S0 = seances(now), jr = jourParis(now);
  if (!raison && S0.ouvre && S0.ny >= 576 && S0.ny < 595 && st.seUS !== jr && depuisLec > 4 * 6e4) { st.seUS = jr; raison = { k: "seance", txt: "ouverture de Wall Street il y a " + (S0.ny - 570) + " min" }; }
  if (!raison && S0.ouvre && S0.pa >= 546 && S0.pa < 565 && st.seEU !== jr && depuisLec > 4 * 6e4) { st.seEU = jr; raison = { k: "seance", txt: "ouverture des bourses européennes il y a " + (S0.pa - 540) + " min" }; }
  if (!raison && ((mn % 30 < 3 && depuisLec > 12 * 6e4) || depuisLec > 40 * 6e4)) raison = { k: "auto", txt: "lecture régulière (toutes les 30 min)" };
  let nouvelle = null, point = null;
  if (raison) {
    try { nouvelle = await lire(env, st, now, raison); } catch (e) { DIAG.errPoint = String(e && e.message || e).slice(0, 200); }
    if (nouvelle) { st.lecT = now; st.lectures.push(nouvelle); st.lectures = st.lectures.slice(-LECTURE.garde); }
    else st.lecT = Math.max(st.lecT || 0, now - 35 * 6e4);       // échec : nouvel essai dans 5 min
    /* Lecture demandée : en cas d'échec, l'agent réessaie pendant 4 tours avant d'annoncer une erreur */
    if (raison.k === "demande" && env.DESK) {
      if (nouvelle) { st.pointEssais = 0; point = nouvelle; }
      else if ((st.pointEssais = (st.pointEssais || 0) + 1) >= 5) { st.pointEssais = 0; point = { ts: now, erreur: "Aucune IA disponible pour l'instant (quotas ou pannes). Réessaie dans quelques minutes." }; }
      else st.pointT = 0;
      if (point) try { await env.DESK.put("point", JSON.stringify(point)); } catch (e) {}
    }
  }
  /* 4. Ménage et sauvegarde */
  Object.keys(st.vu).forEach((k) => { if (now - st.vu[k] > 6 * 36e5) delete st.vu[k]; });
  Object.keys(st.cool).forEach((k) => { if (!st.cool[k] || now - st.cool[k].t > 36e5) delete st.cool[k]; });
  const evtNeuf = st.evt.some((e) => e.ts === now), change = !!nouvelle || suivi || evtNeuf, cpt = st.ia ? String(st.ia.n) : "";
  const D = ((H.mac || {}).m || {})["TVC:DXY"], EU = ((H.mac || {}).m || {})["FX:EURUSD"], nr = med(((H.dxyHist || {}).r || []).slice(-60));
  const marche = { dxy: D ? { v: D[0], j: r2(D[1]), m5: r2(D[2], 3), m15: r2(D[3], 3), ratio: D[5] != null && nr ? r2((D[5] - D[6]) / nr, 1) : null } : null, eur: EU ? { v: EU[0], vol: EU[8] && EU[9] ? r2(EU[8] / (EU[9] / 288), 1) : null } : null };
  DIAG.ok = now; DIAG.n = (DIAG.n || 0) + 1;
  /* Limite gratuite de Cloudflare : 1 000 écritures par jour. Une nouvelle lecture est publiée tout de suite ; le suivi des scénarios
     au plus toutes les 90 s ; au-delà de 850 écritures dans la journée, une seule toutes les 10 min. */
  const jk = jourParis(now); if (!st.kv || st.kv.d !== jk) st.kv = { d: jk, n: 0 };
  if (change) st.attente = true;
  const depuis = now - (st.ecrit || 0);
  const pubDue = st.kv.n > 850 ? depuis > 10 * 6e4 : (!!nouvelle || !!point || evtNeuf || (st.attente && depuis > 90e3) || (cpt !== st.cptPub && depuis > 4 * 6e4) || depuis > 10 * 6e4);
  if (env.DESK && pubDue) {
    st.ecrit = now; st.cptPub = cpt;
    const pub = { v: 2, maj: now, diag: { okx_echecs_tour: DIAG.okxKo || 0, requetes_tour: SR, errDetect: DIAG.errDetect || "", errSuivi: DIAG.errSuivi || "", errPoint: DIAG.errPoint || "", tours_instance: DIAG.n },
      lectures: st.lectures.slice(-LECTURE.publiees), prochaine: Math.ceil((now + 6e4) / 18e5) * 18e5, signaux: st.evt.slice(-8).map(({ ts, b, type, imp, txt }) => ({ ts, b, type, imp, txt })), marche,
      bilan: st.bil3 ? { v: 3, jours: st.bil3.jours, actifs: st.bil3.actifs, recent: st.bil3.recent.slice(-40) } : null,
      ia: st.ia ? { jour: st.ia.jour, n: st.ia.n, budget: BUDGET_JOUR, prov: st.ia.prov, log: st.ia.log.slice(-20), heures: st.ia.heures, ordre: IA_ORDRE_LECTURE } : null };
    st.attente = false; st.kv.n++; pub._st = st;
    /* Si la sauvegarde échoue, on réessaie dès le tour suivant */
    try { await env.DESK.put("public", JSON.stringify(pub)); } catch (e) { st.ecrit = 0; st.attente = true; throw e; }
  }
}
export const _test = { appelIA, ACTIFS, REGLES, toutesNews, noteNews, collecte, detecter, niveaux, tour, H, MEM, verifier, prixConnus, contexteIA, contexteLecture, lire, suivreLectures, get ST() { return ST; } };
