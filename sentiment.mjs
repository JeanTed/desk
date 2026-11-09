// Sentiment des news financières — Alpha Vantage (NEWS_SENTIMENT), lu par le robot GitHub.
// - Clé gratuite : secret GitHub « ALPHAVANTAGE_KEY » (alphavantage.co/support/#api-key). Sans clé, rien ne change.
// - Offre gratuite ≈ 25 appels par jour : au plus 1 appel toutes les 2 h (12 par jour).
// - Écrit site/data/sentiment.json : score moyen (-1 à +1), répartition, quelques titres (anglais, non affichés tels quels).
import { readFile, writeFile, mkdir } from "node:fs/promises";

const OUT = "site";
const SITE = (process.env.SITE_URL || "").replace(/\/$/, "");
const KEY = process.env.ALPHAVANTAGE_KEY || "";
const MAX_AGE = 115 * 60000;

async function getJSON(url, ms = 20000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { signal: ctl.signal }); if (!r.ok) throw new Error("HTTP " + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
async function previous() { if (!SITE) return null; try { return await getJSON(`${SITE}/data/sentiment.json`, 10000); } catch { return null; } }
async function meta(ok, n, err) {
  let m; try { m = JSON.parse(await readFile(`${OUT}/data/meta.json`, "utf8")); } catch { m = { ts: Date.now(), sources: {} }; }
  m.sources = m.sources || {};
  m.sources.sentiment = { ok, n, err: ok ? "" : String(err).slice(0, 140), ts: Date.now() };
  await writeFile(`${OUT}/data/meta.json`, JSON.stringify(m));
}
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const crypto = /\b(bitcoin\w*|btc|ethereum|crypto\w*|solana|xrp|doge\w*|blockchain|stablecoin\w*|nft\w*)\b/i;

async function main() {
  await mkdir(OUT + "/data", { recursive: true });
  const prev = await previous();
  const garder = async () => { if (prev && prev.ts) await writeFile(OUT + "/data/sentiment.json", JSON.stringify(prev)); };
  if (!KEY) { console.log("ALPHAVANTAGE_KEY absente : sentiment désactivé."); await garder(); return; }
  if (prev && prev.ts && Date.now() - prev.ts < MAX_AGE) { console.log("Sentiment récent : republié tel quel."); await garder(); return; }

  const j = await getJSON(`https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=financial_markets,economy_macro,economy_monetary,economy_fiscal&sort=LATEST&limit=50&apikey=${KEY}`);
  if (!j || !Array.isArray(j.feed)) throw new Error(clean(j && (j.Information || j.Note || j["Error Message"]) || "réponse inattendue", 120).replace(KEY, "***"));
  const f = j.feed.filter(a => a && a.title && !crypto.test(a.title));
  if (f.length < 5) throw new Error("trop peu d'articles (" + f.length + ")");
  let sw = 0, w = 0, bull = 0, bear = 0, neutral = 0;
  for (const a of f) {
    const sc = Number(a.overall_sentiment_score); if (!isFinite(sc)) continue;
    const rel = Math.max(0.2, Number(a.topics && a.topics[0] && a.topics[0].relevance_score) || 0.5);
    sw += sc * rel; w += rel;
    if (sc >= 0.15) bull++; else if (sc <= -0.15) bear++; else neutral++;
  }
  const score = w ? Math.round(sw / w * 1000) / 1000 : 0;
  const label = score >= 0.25 ? "porteur" : score >= 0.1 ? "plutôt porteur" : score <= -0.25 ? "prudent" : score <= -0.1 ? "plutôt prudent" : "neutre";
  const items = f.slice().sort((a, b) => Math.abs(b.overall_sentiment_score) - Math.abs(a.overall_sentiment_score)).slice(0, 8)
    .map(a => ({ title: clean(a.title, 160), src: clean(a.source, 30), score: Number(a.overall_sentiment_score) }));
  await writeFile(OUT + "/data/sentiment.json", JSON.stringify({ ts: Date.now(), n: f.length, score, label, bull, neutral, bear, items }));
  await meta(true, f.length, "");
  console.log("Sentiment :", score, label, `(${bull}/${neutral}/${bear})`);
}

main().catch(async e => {
  console.log("Sentiment : ERREUR", String(e.message || e).slice(0, 200).replace(KEY || "§", "***"));
  try { const prev = await previous(); if (prev && prev.ts) await writeFile(OUT + "/data/sentiment.json", JSON.stringify(prev)); await meta(false, 0, e.message || e); } catch {}
});
