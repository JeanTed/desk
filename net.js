/* ================================================================
   DESK — Espace « Connexions » : la carte des données, en direct
   Chaque requête et chaque flux temps réel est noté par core.js
   (CK.NET). Ici on en déduit l'état de chaque source (active, à
   surveiller, en panne, en attente), on dessine la carte sources →
   espaces avec des liens vivants, et une fiche par source.
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,u=CK.u,esc=u.esc;
var DEST=[
  {id:"bandeau",name:"Bandeau",sub:"indices, taux, dollar, VIX",c:"#C4C8CF"},
  {id:"plan",name:"Plan Futures",sub:"biais, niveaux, contexte",c:"#B8F36B"},
  {id:"journee",name:"Journée",sub:"sessions, semaine, agenda",c:"#E9C46A"},
  {id:"opts",name:"Options",sub:"murs, max pain, put/call",c:"#7FA8F0"},
  {id:"news",name:"News",sub:"flux macro, agenda",c:"#A99BEA"}
];
var DN={};DEST.forEach(function(d){DN[d.id]=d;});
/* kind : ws (temps réel), http (périodique), od (à la demande), fb (secours) ; exp = intervalle attendu en ms */
var SRC=[
  {id:"okx",name:"OKX",p:"REST",kind:"http",exp:60000,to:["plan","journee","opts"],
   ep:["/api/v5/market/ticker (US100, SPX)","/api/v5/market/candles","/api/v5/public/funding-rate","/api/v5/public/open-interest"],
   data:"Prix en direct et bougies des perpétuels Nasdaq 100 et S&P 500 (niveaux du jour, de la semaine, sessions), open interest et funding.",freq:"Prix toutes les 10 s, le reste toutes les 2 min"},
  {id:"tvscan",name:"TradingView Scanner",p:"REST",kind:"http",exp:120000,to:["plan","bandeau"],
   ep:["scanner.tradingview.com/global/scan"],data:"Dollar, taux 5 et 10 ans, Nasdaq, S&P, Dow Jones, Russell 2000, VIX, VXN, or, Brent, futures NQ et ES, poids lourds des indices.",freq:"Toutes les 2 min"},
  {id:"tvw",name:"TradingView widgets",p:"Intégration",kind:"od",to:["journee","news"],
   ep:["embed-widget-events.js","tv.js"],data:"Calendrier économique officiel (secours de l'agenda) et graphiques au clic.",freq:"À l'affichage"},
  {id:"fj",name:"FinancialJuice",p:"RSS",kind:"http",exp:600000,to:["news"],ep:["www.financialjuice.com/feed.ashx?xy=rss"],data:"News macro en quasi temps réel.",freq:"Toutes les minutes ; copie du robot si le site bloque"},
  {id:"tree",name:"Tree of Alpha",p:"JSON",kind:"http",exp:120000,to:["news"],ep:["news.treeofalpha.com/api/news"],data:"Fil des gros comptes macro et politiques (Maison-Blanche, Trump, Fed…), sans les sujets crypto.",freq:"Toutes les 20 s"},
  {id:"robot",name:"Robot GitHub",p:"JSON",kind:"http",exp:1800000,to:["journee","news","opts","plan"],ep:["…github.io/desk/data/futures.json","…/data/calendar.json","…/data/calendrier.json","…/data/fj.json","…/data/options.json","…/data/futpx.json","…/data/resultats.json","…/data/marche.json","…/data/sentiment.json","…/data/briefing.json"],data:"Tout ce que le navigateur ne peut pas lire seul : agenda économique et calendrier détaillé (actuel, prévision, précédent), news futures traduites, copie de FinancialJuice, options des indices, contrats MNQ, MES, YM et RTY (Yahoo Finance), dates de résultats, positionnement des fonds (CFTC), Peur & Cupidité (CNN), adjudications du Trésor, largeur de marché, sentiment des news (Alpha Vantage) et lecture du jour (Gemini). Le détail de chaque étape est dans le tableau « Étapes du robot » ci-dessus.",freq:"Mis à jour toutes les 10 min par GitHub (certaines étapes toutes les 1 à 6 h)"},
];
CK.NETSRC=SRC;

/* ---------- État d'une source ---------- */
function ago(ts){return ts?u.ago(ts):"—";}
function state(s){
  var r=(CK.NET||{})[s.id],now=Date.now();
  if(s.kind==="ws"){
    if(!r||(!r.opens&&!r.closes))return {k:"idle",l:"Connexion…",d:"Ouverture du flux en cours."};
    if(r.open){var a=now-r.lastMsg;return a<90000?{k:"ok",l:"Connecté · flux actif",d:"Dernier message "+ago(r.lastMsg)+"."}:{k:"ok",l:"Connecté · calme",d:r.lastMsg?"Aucun message depuis "+ago(r.lastMsg)+" (normal si le marché est calme).":"Connecté, aucune liquidation reçue pour l'instant (normal si le marché est calme)."};}
    if(r.opens>0)return {k:"warn",l:"Reconnexion…",d:"Connexion perdue "+ago(r.lastErr)+", nouvelle tentative automatique."};
    return r.closes>=3?{k:"down",l:"Injoignable",d:"Le serveur refuse la connexion ("+r.closes+" tentatives)."}:{k:"warn",l:"Connexion…",d:"Nouvelle tentative en cours."};
  }
  if(!r||!r.calls)return s.kind==="fb"?{k:"idle",l:"Non sollicité",d:"Utilisé seulement si la source principale échoue."}:s.kind==="od"?{k:"idle",l:"Pas encore utilisé",d:"Chargé à la demande."}:{k:"idle",l:"En attente",d:"Premier appel en cours."};
  if(r.lastErr>r.lastOk){
    if(s.id==="robot")return {k:"down",l:"En erreur",d:r.msg+" · le site GitHub ne répond pas."};
    if(r.code===429||s.id==="fj")return {k:"warn",l:"Limité",d:r.msg+" · le Desk espace ses appels automatiquement."};
    if(s.id==="tr"&&r.lastOk&&now-r.lastOk<3600000)return {k:"warn",l:"Partiel",d:"Google bloqué, MyMemory prend le relais."};
    return {k:"down",l:"En erreur",d:r.msg+" "+ago(r.lastErr)+"."};
  }
  if(s.exp&&now-r.lastOk>s.exp*2.5)return {k:"warn",l:"En retard",d:"Dernière réponse "+ago(r.lastOk)+", attendue toutes les "+Math.round(s.exp/60000)+" min."};
  var recentErr=r.lastErr&&now-r.lastErr<300000;
  return {k:"ok",l:recentErr?"Actif · erreurs récentes":"Actif",d:"Dernière réponse "+ago(r.lastOk)+(recentErr?" · "+r.msg:"")+"."};
}
function summary(){var o={ok:0,warn:0,down:0,idle:0,list:[]};SRC.forEach(function(s){var st=state(s);o[st.k]++;o.list.push({s:s,st:st});});return o;}
CK.netSummary=summary;CK.netState=state;

/* ---------- Construction ---------- */
var host,svg,cards={},prev={},built=false;
var NS="http://www.w3.org/2000/svg";
function el(n,a,p){var e=document.createElementNS(NS,n);for(var k in a)e.setAttribute(k,a[k]);p.appendChild(e);return e;}
var VH=12+SRC.length*45+4;
function build(){
  host=u.$("net");if(!host||built)return;built=true;
  host.innerHTML='<div class="nt-sum" id="ntSum"></div>'+
    '<div class="nt-mapbox"><div class="nt-legend"><span><i class="ok"></i>actif</span><span><i class="warn"></i>à surveiller</span><span><i class="down"></i>en panne</span><span><i class="idle"></i>en attente</span><span class="nt-flow"><i></i>donnée reçue à l\'instant</span></div>'+
    '<div class="nt-scroll"><svg class="nt-map" id="ntMap" viewBox="0 0 1000 '+VH+'" role="img" aria-label="Carte des connexions : sources de données reliées aux espaces"></svg></div></div>'+
    '<div class="ntb" id="ntRobot"></div><div class="nt-cards" id="ntCards"></div>';
  svg=u.$("ntMap");
  var SX=16,SW=300,SH=36,SY0=12,SG=45,DX=690,DW=294,DH=54,DY0=20,DG=(VH-2*DY0-DH)/(DEST.length-1),dIdx={};DEST.forEach(function(d,i){dIdx[d.id]=i;});
  var gl=el("g",{},svg),gn=el("g",{},svg),gd=el("g",{},svg);
  SRC.forEach(function(s,i){var y0=SY0+i*SG+SH/2;
    s.to.forEach(function(t){var j=dIdx[t],y1=DY0+j*DG+DH/2,x0=SX+SW,x1=DX,mx=(x0+x1)/2;
      el("path",{class:"lk","data-s":s.id,"data-d":t,d:"M"+x0+" "+y0+" C"+mx+" "+y0+" "+mx+" "+y1+" "+x1+" "+y1},gl);});
    var g=el("g",{class:"nd","data-s":s.id,tabindex:"0",role:"link"},gn);
    el("rect",{x:SX,y:SY0+i*SG,width:SW,height:SH,rx:9},g);
    el("circle",{class:"sd",cx:SX+16,cy:SY0+i*SG+SH/2,r:5},g);el("circle",{class:"rp",cx:SX+16,cy:SY0+i*SG+SH/2,r:5},g);
    var t=el("text",{x:SX+30,y:SY0+i*SG+23},g);t.textContent=s.name;
    var p=el("text",{class:"p",x:SX+SW-12,y:SY0+i*SG+23,"text-anchor":"end"},g);p.textContent=s.p;});
  DEST.forEach(function(d,i){var g=el("g",{class:"ds","data-d":d.id},gd);
    var r=el("rect",{x:DX,y:DY0+i*DG,width:DW,height:DH,rx:12},g);r.style.stroke=d.c;
    var t=el("text",{x:DX+16,y:DY0+i*DG+24},g);t.textContent=d.name;t.style.fill=d.c;
    var p=el("text",{class:"p",x:DX+16,y:DY0+i*DG+42},g);p.textContent=d.sub;});
  /* Survol : on isole une source ou un espace */
  function focus(sid,did){if(!sid&&!did){svg.classList.remove("focus");return;}svg.classList.add("focus");var on={},ds={};
    [].forEach.call(svg.querySelectorAll(".lk"),function(p){var o=(sid&&p.getAttribute("data-s")===sid)||(did&&p.getAttribute("data-d")===did);p.classList.toggle("on",o);if(o){on[p.getAttribute("data-s")]=1;ds[p.getAttribute("data-d")]=1;}});
    [].forEach.call(svg.querySelectorAll(".nd"),function(g){g.classList.toggle("on",!!on[g.getAttribute("data-s")]);});
    [].forEach.call(svg.querySelectorAll(".ds"),function(g){g.classList.toggle("on",!!ds[g.getAttribute("data-d")]);});}
  [].forEach.call(svg.querySelectorAll(".nd"),function(g){var sid=g.getAttribute("data-s");g.addEventListener("pointerenter",function(){focus(sid);});g.addEventListener("focus",function(){focus(sid);});
    function go(){var c=u.$("nt-"+sid);if(c){c.scrollIntoView({behavior:"smooth",block:"center"});c.classList.remove("hl");void c.offsetWidth;c.classList.add("hl");}}
    g.addEventListener("click",go);g.addEventListener("keydown",function(e){if(e.key==="Enter")go();});});
  [].forEach.call(svg.querySelectorAll(".ds"),function(g){g.addEventListener("pointerenter",function(){focus(null,g.getAttribute("data-d"));});});
  svg.addEventListener("pointerleave",function(){focus();});
  /* Fiches */
  u.$("ntCards").innerHTML=SRC.map(function(s){
    return '<article class="nt-c" id="nt-'+s.id+'"><header><b>'+esc(s.name)+'</b><span class="nt-chip">'+esc(s.p)+'</span><span class="nt-st" data-st></span></header>'+
      '<div class="nt-m"><div><em>Dernière donnée</em><b data-m="last">—</b></div><div><em>'+(s.kind==="ws"?"Messages / min":"Latence")+'</em><b data-m="rate">—</b></div>'+
      '<div><em>'+(s.kind==="ws"?"Reconnexions":"Réussies")+'</em><b data-m="ok">—</b></div><div><em>Erreurs</em><b data-m="err">—</b></div></div>'+
      '<p class="nt-d" data-d></p>'+
      '<details><summary>Détails</summary><dl><dt>Adresses</dt><dd>'+s.ep.map(function(e){return '<code>'+esc(e)+'</code>';}).join("")+'</dd><dt>Données</dt><dd>'+esc(s.data)+'</dd><dt>Fréquence</dt><dd>'+esc(s.freq)+'</dd>'+
      '<dt>Alimente</dt><dd class="nt-tags">'+s.to.map(function(t){return '<span style="color:'+DN[t].c+'">'+esc(DN[t].name)+'</span>';}).join("")+'</dd><dt>Clé API</dt><dd>Aucune</dd></dl></details></article>';}).join("");
  SRC.forEach(function(s){cards[s.id]=u.$("nt-"+s.id);});
  paint();
}

/* ---------- Mise à jour en direct ---------- */
function set(el,v){if(el&&el.textContent!==v)el.textContent=v;}
function paint(){
  if(!host)return;var now=Date.now(),sm=summary();
  var sum=u.$("ntSum"),html='<div class="ns ok"><b>'+sm.ok+'</b><span>actives</span></div><div class="ns warn"><b>'+sm.warn+'</b><span>à surveiller</span></div><div class="ns down"><b>'+sm.down+'</b><span>en panne</span></div><div class="ns idle"><b>'+sm.idle+'</b><span>en attente</span></div>'+
    '<div class="ns live"><i></i><span>État en direct · mis à jour chaque seconde</span></div>';
  if(sum._h!==html){sum.innerHTML=html;sum._h=html;}
  set(u.$("netMeta"),sm.ok+"/"+SRC.length+" sources actives");
  sm.list.forEach(function(x){var s=x.s,st=x.st,r=(CK.NET||{})[s.id]||{},c=cards[s.id];
    /* carte : couleur de la source et de ses liens */
    var g=svg.querySelector('.nd[data-s="'+s.id+'"]');if(g)g.setAttribute("class","nd st-"+st.k+(g.classList.contains("on")?" on":""));
    var fresh=Math.max(r.lastOk||0,r.lastMsg||0),flowing=fresh&&now-fresh<4000;
    [].forEach.call(svg.querySelectorAll('.lk[data-s="'+s.id+'"]'),function(p){var on=p.classList.contains("on");p.setAttribute("class","lk st-"+st.k+(flowing?" flow":"")+(on?" on":""));});
    if(fresh&&prev[s.id]!==fresh){prev[s.id]=fresh;if(g&&now-fresh<4000){g.classList.remove("ping");void g.getBBox();g.classList.add("ping");}}
    /* fiche */
    if(!c)return;var stEl=c.querySelector("[data-st]");stEl.className="nt-st "+st.k;set(stEl,st.l);c.setAttribute("data-k",st.k);
    set(c.querySelector('[data-m="last"]'),fresh?u.ago(fresh):"—");
    if(s.kind==="ws"){var m=(r.msgs||[]).filter(function(t){return now-t<60000;}).length;set(c.querySelector('[data-m="rate"]'),r.opens?String(m):"—");set(c.querySelector('[data-m="ok"]'),r.opens?String(Math.max(0,r.opens-1)):"—");}
    else{set(c.querySelector('[data-m="rate"]'),r.ms?r.ms+" ms":"—");set(c.querySelector('[data-m="ok"]'),r.calls?r.ok+" / "+r.calls:"—");}
    var ee=c.querySelector('[data-m="err"]');set(ee,r.err||r.closes?String(s.kind==="ws"?r.closes||0:r.err):"0");ee.className=(r.err||(s.kind==="ws"&&r.closes))?"bad":"";
    set(c.querySelector("[data-d]"),st.d);
  });
}
/* ---------- Étapes du robot GitHub : lues dans meta.json (plus besoin de le copier à la main) ---------- */
var BN={calendar:"Agenda économique (flux principal)",calendrier_tv:"Calendrier détaillé TradingView (actuel, prévision, description)",fj:"FinancialJuice (copie)",
  options:"Options Nasdaq 100 / S&P 500",fut_mnq:"Contrat MNQ",fut_mes:"Contrat MES",fut_ym:"Contrat YM (Dow)",fut_rty:"Contrat RTY (Russell)",fut_corr:"Corrélations",
  resultats:"Dates des résultats d'entreprises",marche_cot:"Positionnement des fonds (CFTC)",marche_fng:"Peur & Cupidité (CNN)",marche_auctions:"Adjudications du Trésor",marche_breadth:"Largeur de marché",
  sentiment:"Sentiment des news (Alpha Vantage)",briefing:"Lecture du jour (Gemini)"};
var RB={rows:null,ts:0,err:""};
function bname(k){if(BN[k])return BN[k];if(/^news|^nw|futures/i.test(k)||k.indexOf(" ")>0||k.indexOf("·")>0)return k;return k;}
function loadRobot(){
  var url=CK.relay&&CK.relay("/meta");if(!url){RB.err="Adresse du robot non configurée.";paintRobot();return;}
  u.fetchJSON(url+"?t="+Math.floor(Date.now()/60000),null,12000).then(function(j){
    var S=j&&j.sources;if(!S)throw new Error("meta.json vide");RB.rows=Object.keys(S).map(function(k){return {k:k,v:S[k]};});RB.ts=+j.ts||0;RB.err="";paintRobot();
  }).catch(function(e){RB.err=String(e&&e.message||e);paintRobot();});
}
function paintRobot(){
  var h=u.$("ntRobot");if(!h)return;
  var out;
  if(!RB.rows)out='<div class="ntb-h"><b>Étapes du robot</b></div><p class="ntb-n">'+esc(RB.err||"Lecture de meta.json…")+'</p>';
  else{
    var bad=0,rows=RB.rows.slice().sort(function(a,b){return (a.v.ok?1:0)-(b.v.ok?1:0)||String(a.k).localeCompare(String(b.k));}).map(function(x){
      var v=x.v||{},ts=+v.ts||0;if(ts&&ts<1e12)ts*=1000;var old=ts&&Date.now()-ts>26*3600000,k=v.ok?(old?"warn":"ok"):"down";if(k==="down")bad++;
      return '<div class="ntb-r '+k+'"><i></i><span class="ntb-n1">'+esc(bname(x.k))+'</span><span class="ntb-c mono">'+(v.n!=null?esc(v.n)+" éléments":"")+'</span><span class="ntb-a">'+(ts?u.ago(ts):"—")+'</span><span class="ntb-e">'+(v.ok?(old?"Pas de mise à jour depuis plus d'un jour":""):esc(String(v.err||"En erreur").slice(0,160)))+'</span></div>';}).join("");
    out='<div class="ntb-h"><b>Étapes du robot</b><span class="ntb-s '+(bad?"down":"ok")+'">'+(bad?bad+" en erreur":"toutes réussies")+'</span><span class="ntb-n">Dernier passage : '+(RB.ts?u.ago(RB.ts):"—")+' · lu dans meta.json</span></div><div class="ntb-g">'+rows+'</div>';
  }
  if(h._h!==out){h.innerHTML=out;h._h=out;}
}
var loopT=null;
CK.net={boot:function(){build();loadRobot();setInterval(function(){if(document.body.getAttribute("data-view")==="net")loadRobot();},60000);clearInterval(loopT);loopT=setInterval(function(){if(document.body.getAttribute("data-view")==="net")paint();},1000);},paint:paint};
})();
