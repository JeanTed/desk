// Robot du Desk : tourne sur GitHub toutes les 10 minutes (aucune installation).
// Il va chercher ce que le navigateur ne peut pas lire lui-même, le traduit en français
// et le publie en fichiers JSON à côté du Desk :
//   data/calendar.json  agenda économique de la semaine (+ la suivante)
//   data/news.json      news crypto (CoinDesk, The Block, Decrypt, Cointelegraph, Cryptoast, Journal du Coin)
//   data/fj.json        news macro FinancialJuice
//   data/meta.json      état de chaque source (affiché dans l'espace Connexions)
// Si une source ne répond pas, la dernière version publiée est conservée.
import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";

const SITE = process.env.SITE_URL || "";          // ex. https://pseudo.github.io/desk
const OUT = "site";
const UA = { "User-Agent": "Mozilla/5.0 (DeskRobot; +https://github.com)" };
const meta = { ts: Date.now(), sources: {} };

async function get(url, type = "text", ms = 20000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return type === "json" ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}
async function previous(name) {
  if (!SITE) return null;
  try { return await get(SITE.replace(/\/$/, "") + "/data/" + name, "json", 15000); } catch { return null; }
}
function note(k, ok, n, err) { meta.sources[k] = { ok, n: n || 0, err: err ? String(err.message || err) : "", ts: Date.now() }; }

/* ---------- Traduction ----------
   1) mémoire : les titres déjà traduits au passage précédent sont réutilisés
   2) Google (gtx), puis Google (dict), puis MyMemory si un service refuse */
const MEMO = {}, TRS = { memo: 0, gtx: 0, dict: 0, mymemory: 0, fail: 0, err: "" };
async function loadMemo() {
  for (const f of ["news.json", "fj.json"]) {
    const prev = await previous(f);
    (Array.isArray(prev) ? prev : []).forEach(x => { if (x && x.title && x.fr) MEMO[x.title] = x.fr; });
  }
}
async function viaGtx(chunk) {
  const q = chunk.map(s => s.replace(/\n/g, " ")).join("\n");
  const j = await get("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=fr&dt=t&q=" + encodeURIComponent(q), "json");
  const txt = (j[0] || []).map(x => x[0]).join("").split("\n");
  if (txt.length < chunk.length) throw new Error("gtx incomplet");
  return txt;
}
async function viaDict(chunk) {
  const j = await get("https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=en&tl=fr&" + chunk.map(s => "q=" + encodeURIComponent(s)).join("&"), "json");
  const arr = Array.isArray(j) ? j.map(x => Array.isArray(x) ? x[0] : x) : [];
  if (arr.length < chunk.length) throw new Error("dict incomplet");
  return arr;
}
async function viaMyMemory(s) {
  const j = await get("https://api.mymemory.translated.net/get?q=" + encodeURIComponent(s.slice(0, 480)) + "&langpair=en|fr&de=desk.robot@example.com", "json");
  const t = j && j.responseData && j.responseData.translatedText;
  if (!t || /MYMEMORY WARNING|QUOTA/i.test(t)) throw new Error("mymemory quota");
  return t;
}
async function translate(list) {
  const out = {}, todo = [];
  list.forEach(s => { if (MEMO[s]) { out[s] = MEMO[s]; TRS.memo++; } else todo.push(s); });
  let mm = 0;
  for (let i = 0; i < todo.length; i += 8) {
    const chunk = todo.slice(i, i + 8);
    let res = null;
    try { res = await viaGtx(chunk); TRS.gtx += chunk.length; }
    catch (e1) {
      TRS.err = String(e1.message || e1);
      try { res = await viaDict(chunk); TRS.dict += chunk.length; }
      catch (e2) {
        TRS.err += " · " + String(e2.message || e2);
        res = [];
        for (const s of chunk) { if (mm >= 30) { res.push(""); continue; } try { res.push(await viaMyMemory(s)); mm++; TRS.mymemory++; } catch { res.push(""); } }
      }
    }
    chunk.forEach((s, k) => { const t = res[k] && String(res[k]).trim(); if (t) { out[s] = t; MEMO[s] = t; } else TRS.fail++; });
  }
  return out;
}

/* ---------- RSS ---------- */
function decode(s) { return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/<[^>]+>/g, "").trim(); }
function rss(xml) {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].map(m => {
    const it = m[0], g = n => { const x = it.match(new RegExp("<" + n + "[^>]*>([\\s\\S]*?)</" + n + ">")); return x ? decode(x[1]) : ""; };
    return { title: g("title"), link: g("link"), ts: Date.parse(g("pubDate")) || 0 };
  }).filter(x => x.title);
}

/* ---------- 1. Agenda économique ---------- */
async function calendar() {
  try {
    const urls = ["https://nfs.faireconomy.media/ff_calendar_thisweek.json", "https://nfs.faireconomy.media/ff_calendar_nextweek.json"];
    const parts = await Promise.allSettled(urls.map(u => get(u, "json")));
    const all = parts.flatMap(p => p.status === "fulfilled" && Array.isArray(p.value) ? p.value : []);
    if (!all.length) throw new Error("agenda vide");
    note("calendar", true, all.length); return all;
  } catch (e) { note("calendar", false, 0, e); return (await previous("calendar.json")) || []; }
}

/* ---------- 2. News crypto ---------- */
const FEEDS = [
  { src: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", lang: "en" },
  { src: "The Block", url: "https://www.theblock.co/rss.xml", lang: "en" },
  { src: "Decrypt", url: "https://decrypt.co/feed", lang: "en" },
  { src: "Cointelegraph", url: "https://cointelegraph.com/rss", lang: "en" },
  { src: "Cryptoast", url: "https://cryptoast.fr/feed/", lang: "fr" },
  { src: "Journal du Coin", url: "https://journalducoin.com/feed/", lang: "fr" }
];
async function cryptoNews() {
  const res = await Promise.allSettled(FEEDS.map(f => get(f.url).then(x => rss(x).slice(0, 15).map(i => ({ ...i, src: f.src, lang: f.lang })))));
  const items = []; res.forEach((r, i) => { if (r.status === "fulfilled") items.push(...r.value); note("news:" + FEEDS[i].src, r.status === "fulfilled", r.status === "fulfilled" ? r.value.length : 0, r.reason); });
  if (!items.length) return (await previous("news.json")) || [];
  const seen = new Set(), list = items.filter(x => { const k = x.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.ts - a.ts).slice(0, 60);
  const tr = await translate(list.filter(x => x.lang === "en").map(x => x.title));
  list.forEach(x => { if (tr[x.title]) x.fr = tr[x.title]; });
  return list;
}

/* ---------- 3. FinancialJuice ---------- */
async function financialJuice() {
  try {
    const items = rss(await get("https://www.financialjuice.com/feed.ashx?xy=rss")).map(x => ({ ...x, title: x.title.replace(/^FinancialJuice:\s*/i, ""), src: "FinancialJuice", lang: "en" })).slice(0, 60);
    if (!items.length) throw new Error("flux vide");
    const tr = await translate(items.map(x => x.title)); items.forEach(x => { if (tr[x.title]) x.fr = tr[x.title]; });
    note("fj", true, items.length); return items;
  } catch (e) { note("fj", false, 0, e); return (await previous("fj.json")) || []; }
}

/* ---------- 4. News futures (Bloomberg, Investing.com, Trading Economics, Maison Blanche, Fed, CNBC, MarketWatch) ----------
   Chaque flux est lu séparément : si un site refuse le robot, les autres continuent. Les titres sont traduits en français.
   « filtre » : flux généralistes dont on ne garde que ce qui touche les marchés. */
const MACRO_RE = /tariff|trade|econom|tax|\bfed\b|federal reserve|inflation|jobs|employment|china|oil|energy|treasur|sanction|market|stock|\brates?\b|dollar|bank|deficit|debt|budget|price|export|import|manufactur|chip|semiconductor|\bai\b|tech|deal|shutdown|stimulus|powell|bessent|lutnick|greer|nasdaq|s&p|futures|yield|gdp|cpi|opec|crude/i;
const FUT = [
  { src: "Bloomberg · Marchés", url: "https://www.bloomberg.com/feeds/markets/news.rss" },
  { src: "Bloomberg · Économie", url: "https://www.bloomberg.com/feeds/economics/news.rss" },
  { src: "Bloomberg · Politique", url: "https://www.bloomberg.com/feeds/politics/news.rss", filtre: true },
  { src: "Investing.com", url: "https://www.investing.com/rss/news_25.rss" },
  { src: "Investing.com · Économie", url: "https://www.investing.com/rss/news_14.rss" },
  { src: "Investing.com · Futures", url: "https://www.investing.com/rss/news_11.rss" },
  { src: "Trading Economics", url: "https://tradingeconomics.com/rss/news.aspx" },
  { src: "Maison Blanche", url: "https://www.whitehouse.gov/presidential-actions/feed/", filtre: true },
  { src: "Maison Blanche", url: "https://www.whitehouse.gov/briefings-statements/feed/", filtre: true },
  { src: "Maison Blanche", url: "https://www.whitehouse.gov/fact-sheets/feed/", filtre: true },
  { src: "Réserve fédérale", url: "https://www.federalreserve.gov/feeds/press_all.xml" },
  { src: "CNBC · Marchés", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html" },
  { src: "MarketWatch", url: "https://feeds.content.dowjones.io/public/rss/mw_marketpulse" }
];
async function futuresNews() {
  const res = await Promise.allSettled(FUT.map(f => get(f.url).then(x => {
    const L = rss(x).slice(0, 25).map((i, n) => ({ title: i.title.replace(/\s+/g, " ").trim(), link: i.link, ts: i.ts || (Date.now() - n * 60000), src: f.src, lang: "en" }));
    return f.filtre ? L.filter(i => MACRO_RE.test(i.title)) : L;
  })));
  const items = [];
  res.forEach((r, i) => {
    const k = "fut:" + FUT[i].src + (FUT.filter(f => f.src === FUT[i].src).length > 1 ? ":" + FUT[i].url.split("/").filter(Boolean).slice(-2, -1)[0] : "");
    if (r.status === "fulfilled") items.push(...r.value);
    note(k, r.status === "fulfilled", r.status === "fulfilled" ? r.value.length : 0, r.reason);
  });
  if (!items.length) return (await previous("futures.json")) || [];
  const seen = new Set(), maxAge = Date.now() - 3 * 864e5;
  const list = items.filter(x => { if (x.ts < maxAge) return false; const k = x.title.toLowerCase().slice(0, 70); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => b.ts - a.ts).slice(0, 100);
  const tr = await translate(list.map(x => x.title));
  list.forEach(x => { if (tr[x.title]) x.fr = tr[x.title]; });
  return list;
}

/* ---------- Publication ---------- */
await mkdir(OUT + "/data", { recursive: true });
await loadMemo();
const [cal, news, fj] = await Promise.all([calendar(), cryptoNews(), financialJuice()]);
const fut = await futuresNews();
meta.translate = TRS;
await writeFile(OUT + "/data/calendar.json", JSON.stringify(cal));
await writeFile(OUT + "/data/news.json", JSON.stringify(news));
await writeFile(OUT + "/data/fj.json", JSON.stringify(fj));
await writeFile(OUT + "/data/futures.json", JSON.stringify(fut));
await writeFile(OUT + "/data/meta.json", JSON.stringify(meta));
await copyFile("index.html", OUT + "/index.html");
/* Image d'aperçu quand on partage le lien (X, Discord, Telegram…) */
for (const f of ["manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"]) { try { await copyFile(f, OUT + "/" + f); } catch {} }
try { await writeFile(OUT + "/.nojekyll", ""); } catch {}
console.log("Agenda", cal.length, "· news crypto", news.length, "· FinancialJuice", fj.length, "· news futures", fut.length);
console.log(JSON.stringify(meta.sources, null, 1));
