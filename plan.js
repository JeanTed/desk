/* ================================================================
   DESK — Plan du jour Nasdaq 100 et contexte de marché
   · Plan : niveaux de la veille, de la nuit, de la journée, murs
     d'options et agenda, rangés du plus haut au plus bas autour du prix.
     Données : bougies OKX (perpétuel US100), robot options (options.py),
     agenda économique du Desk.
   · Contexte : volatilité (VIX, VXN), taux 10 ans, dollar, futures NQ/ES
     et poids lourds du Nasdaq, via le scanner public de TradingView.
   Aucune clé API. Lecture mécanique des niveaux, pas une prévision.
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,u=CK.u,S=CK.S,esc=u.esc,nf=u.nf;
var OKX="https://www.okx.com",TV="https://scanner.tradingview.com/global/scan",INST="US100-USDT-SWAP";
var PD={close:null};            /* clôture d'hier (UTC) */
var CX={rows:{},ts:0};          /* contexte TradingView */

function q(p){return p.catch(function(){return null;});}
function px(v){return u.px(v);}
function pct(v){return (v>0?"+":v<0?"−":"")+nf(Math.abs(v),2)+" %";}
function tzp(tz,ms){var o={};new Intl.DateTimeFormat("en-US",{timeZone:tz,hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",weekday:"short"}).formatToParts(new Date(ms)).forEach(function(p){o[p.type]=p.value;});return o;}
/* Heure de New York (9 h 30 – 16 h) convertie en instant réel : suit les changements d'heure */
function nyAt(dayShift,h,m,now){
  var base=now+dayShift*864e5,p=tzp("America/New_York",base),g=Date.UTC(+p.year,+p.month-1,+p.day,h+5,m);
  var q2=tzp("America/New_York",g);g+=((h*60+m)-(+q2.hour*60+ +q2.minute))*60000;return g;
}
function usSession(now){
  for(var d=0;d<6;d++){
    var o=nyAt(d,9,30,now),c=nyAt(d,16,0,now),wd=tzp("America/New_York",o).weekday;
    if(wd==="Sat"||wd==="Sun")continue;
    if(now>=o&&now<c)return {open:true,t:c,o:o};
    if(now<o)return {open:false,t:o,o:o};
  }
  return null;
}
function dur(ms){var m=Math.max(0,Math.round(ms/60000)),d=Math.floor(m/1440),h=Math.floor((m%1440)/60);m=m%60;return (d?d+" j ":"")+(h?h+" h ":"")+(m<10&&(h||d)?"0":"")+m+(h||d?"":" min");}
function hm(ms){return new Date(ms).toLocaleTimeString("fr-FR",{timeZone:"Europe/Paris",hour:"2-digit",minute:"2-digit"});}
function parisDay(ms){return new Date(ms).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris"});}

/* ---------------- 1. Plan du jour ---------------- */
function loadPrev(){
  return q(u.fetchJSON(OKX+"/api/v5/market/candles?instId="+INST+"&bar=1Dutc&limit=3",null,12000)).then(function(j){
    var D=j&&j.data;if(D&&D[1]&&+D[1][4]>0)PD.close=+D[1][4];render();});
}
function levelsOf(){
  var d=CK.levels&&CK.levels.data&&CK.levels.data.NDX,o={};
  if(d)d.L.forEach(function(x){o[x.k]=x.px;});
  return o;
}
function render(){
  var host=u.$("plan");if(!host)return;
  var L=levelsOf(),p=CK.levels&&CK.levels.px&&CK.levels.px.NDX,now=Date.now();
  if(!p||!Object.keys(L).length){host.innerHTML='<div class="empty">Calcul du plan…</div>';return;}
  var rows=[];
  function add(tag,name,v,kind,tip){if(v>0)rows.push({tag:tag,n:name,px:v,k:kind,tip:tip||""});}
  add("PDH","Plus haut d'hier",L.PDH,"niv");add("PDL","Plus bas d'hier",L.PDL,"niv");
  if(PD.close)add("PDC","Clôture d'hier (00 h UTC)",PD.close,"niv");
  add("DO","Ouverture du jour (UTC)",L.DO,"niv");add("WO","Ouverture de la semaine",L.WO,"niv");
  var nh=Math.max(L.TKH||0,L.LDH||0),nl=Math.min(L.TKL||Infinity,L.LDL||Infinity);
  if(nh>0)add("NUH","Haut de la nuit (Tokyo + Londres)",nh,"niv");
  if(isFinite(nl)&&nl>0)add("NUL","Bas de la nuit (Tokyo + Londres)",nl,"niv");
  var O=CK.opData&&CK.opData.data&&CK.opData.data.NDX,oinfo="";
  if(O&&O.list){
    var nx=O.list.filter(function(e){return e.ts>now;}).sort(function(a,b){return a.ts-b.ts;})[0];
    if(nx&&nx.mp>0)add("MP","Max pain, échéance la plus proche",nx.mp,"opt","Prix d'exercice où les vendeurs d'options paient le moins à l'échéance du "+new Date(nx.ts).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+". L'indice y est souvent attiré en fin de vie des options.");
    var wc=(O.wc||O.calls||[]).filter(function(w){return w.k>p;}),wp=(O.wp||O.puts||[]).filter(function(w){return w.k<p;});
    if(wc.length)add("MC","Mur de calls au-dessus",wc[0].k,"opt",nf(wc[0].c,0)+" contrats calls : résistance possible (les vendeurs de calls couvrent en vendant).");
    if(wp.length)add("MS","Mur de puts en dessous",wp[0].k,"opt",nf(wp[0].p,0)+" contrats puts : support possible.");
  }else if(O&&O.err)oinfo=O.err;
  rows.sort(function(a,b){return b.px-a.px;});
  var html="",placed=false;
  rows.forEach(function(x){
    var dd=(x.px/p-1)*100;
    if(!placed&&x.px<p){html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+px(p)+'</b></div>';placed=true;}
    html+='<div class="lv-r '+(x.px>p?"ab":"be")+(Math.abs(dd)<.35?" near":"")+(x.k==="opt"?" plan-opt":"")+'"'+(x.tip?' data-x="'+esc('<b>'+x.n+'</b><span>'+x.tip+'</span>')+'"':"")+'><span class="lv-tag">'+x.tag+'</span><span class="lv-n">'+esc(x.n)+'</span><b class="mono">'+px(x.px)+'</b><span class="lv-d mono">'+(dd>0?"+":"")+nf(dd,2)+' %</span></div>';
  });
  if(!placed)html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+px(p)+'</b></div>';
  /* en-tête : prix, variation depuis l'ouverture du jour, compte à rebours US */
  var ch=L.DO>0?(p/L.DO-1)*100:null,us=usSession(now),head='<div class="plan-top"><div><span class="x-k">Nasdaq 100</span><b class="mono plan-px">'+px(p)+'</b>'+(ch==null?"":'<span class="mono '+u.cls(ch)+'"> '+pct(ch)+' depuis 00 h UTC</span>')+'</div>';
  if(us)head+='<div class="plan-us"><span class="x-k">'+(us.open?"Séance US ouverte":"Ouverture US")+'</span><b class="mono">'+(us.open?"clôture dans ":"dans ")+dur(us.t-now)+'</b><span class="plan-sub">'+(us.open?"fin à ":"à ")+hm(us.t)+' (Paris)</span></div>';
  head+='</div>';
  /* lecture mécanique */
  var rd=[];
  if(L.DO>0)rd.push(p>=L.DO?"Prix au-dessus de l'ouverture du jour : biais acheteur tant qu'il y reste.":"Prix sous l'ouverture du jour : biais vendeur tant qu'il y reste.");
  if(L.PDH>0&&p>L.PDH)rd.push("Au-dessus du plus haut d'hier : cassure à confirmer, sinon retour dans la zone d'hier.");
  else if(L.PDL>0&&p<L.PDL)rd.push("Sous le plus bas d'hier : pression vendeuse, surveiller la reprise du niveau.");
  else if(L.PDH>0&&L.PDL>0)rd.push("Prix dans la fourchette d'hier : les extrêmes (PDH/PDL) sont les niveaux de décision.");
  /* agenda du jour : annonces américaines importantes */
  var td=parisDay(now),ev=(S.cal||[]).filter(function(e){return parisDay(e.ts)===td&&(e.imp==="hi"||e.imp==="md");}).slice(0,6);
  var ag=ev.length?'<div class="plan-ag"><span class="x-k">Annonces du jour (heure de Paris)</span>'+ev.map(function(e){return '<div class="plan-ev'+(e.ts<now?" past":"")+'"><span class="mono">'+hm(e.ts)+'</span><span class="plan-i '+(e.imp==="hi"?"hi":"md")+'" aria-hidden="true"></span><span>'+esc(e.fr||e.t)+'</span></div>';}).join("")+'</div>':'<div class="plan-ag"><span class="x-k">Annonces du jour</span><div class="plan-ev"><span>Aucune annonce américaine importante au programme.</span></div></div>';
  var out=head+'<div class="lv-list">'+html+'</div>'+(rd.length?'<p class="plan-rd">'+rd.map(esc).join(" ")+'</p>':"")+ag+
    '<p class="x-n">'+(oinfo?esc(oinfo)+" ":"")+'Prix et niveaux : perpétuel US100 d\'OKX (journée à 00 h UTC), écart possible avec l\'indice. Nuit = Tokyo + Londres. Options : open interest de la veille (robot GitHub). Lecture mécanique des niveaux, pas une prévision.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

/* ---------------- 2. Contexte : volatilité, taux, poids lourds ---------------- */
var CTX=[["VIX","VIX","TVC:VIX"],["VXN","VXN (volatilité Nasdaq)","CBOE:VXN"],["US10Y","Taux 10 ans","TVC:US10Y"],["DXY","Dollar (DXY)","TVC:DXY"],["NQ","Future NQ","CME_MINI:NQ1!"],["ES","Future ES","CME_MINI:ES1!"]];
var BIG=[["NVDA","Nvidia"],["MSFT","Microsoft"],["AAPL","Apple"],["AMZN","Amazon"],["META","Meta"],["GOOGL","Alphabet"],["AVGO","Broadcom"],["TSLA","Tesla"],["COST","Costco"],["NFLX","Netflix"]];
function loadCtx(){
  var tk=CTX.map(function(x){return x[2];}).concat(BIG.map(function(x){return "NASDAQ:"+x[0];}));
  return q(u.fetchJSON(TV,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({symbols:{tickers:tk},columns:["close","change"]})},12000)).then(function(j){
    if(!j||!j.data)return;j.data.forEach(function(o){CX.rows[o.s]={c:o.d[0],ch:o.d[1]};});CX.ts=Date.now();renderCtx();});
}
function renderCtx(){
  var host=u.$("ctx");if(!host)return;
  if(!CX.ts){host.innerHTML='<div class="empty">Chargement du contexte…</div>';return;}
  function tile(x){var r=CX.rows[x[2]];if(!r)return '<div class="ctx-t"><span class="x-k">'+esc(x[1])+'</span><b class="mono">—</b></div>';
    var isY=x[0]==="US10Y",v=isY?nf(r.c,3)+" %":px(r.c),c=isY?(function(){var bp=r.c-r.c/(1+(r.ch||0)/100);return (bp>=0?"+":"−")+nf(Math.abs(bp*100),1)+" pb";})():pct(r.ch);
    return '<div class="ctx-t"><span class="x-k">'+esc(x[1])+'</span><b class="mono">'+v+'</b><span class="mono '+u.cls(r.ch)+'">'+c+'</span></div>';}
  var big=BIG.map(function(x){return {n:x[1],s:x[0],r:CX.rows["NASDAQ:"+x[0]]};}).filter(function(x){return x.r;}).sort(function(a,b){return b.r.ch-a.r.ch;});
  var maxA=Math.max.apply(null,big.map(function(x){return Math.abs(x.r.ch);}).concat([.5]));
  var avg=big.length?big.reduce(function(s,x){return s+x.r.ch;},0)/big.length:null;
  var out='<div class="ctx-grid">'+CTX.map(tile).join("")+'</div><div class="ctx-h"><span class="x-k">Poids lourds du Nasdaq 100</span>'+(avg==null?"":'<span class="mono '+u.cls(avg)+'">moyenne '+pct(avg)+'</span>')+'</div>'+
    '<div class="ctx-big">'+big.map(function(x){var w=Math.max(3,Math.abs(x.r.ch)/maxA*100);return '<div class="ctx-b"><span class="ctx-n">'+esc(x.n)+'</span><span class="ctx-bar"><i class="'+(x.r.ch>=0?"up":"down")+'" style="width:'+w.toFixed(0)+'%"></i></span><b class="mono">'+px(x.r.c)+'</b><span class="mono '+u.cls(x.r.ch)+'">'+pct(x.r.ch)+'</span></div>';}).join("")+'</div>'+
    '<p class="x-n">Source : scanner public de TradingView, prix différés. VIX et VXN en points ; un VIX qui monte avec l\'indice qui baisse signale un marché sous tension.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

CK.plan={boot:function(){
  render();renderCtx();
  function all(){if(CK.xApi){CK.xApi.loadLevels("NDX");CK.xApi.loadOptions("NDX");}loadPrev();}
  all();setInterval(function(){if(CK.xApi)CK.xApi.loadLevels("NDX");},120000);
  setInterval(function(){if(CK.xApi)CK.xApi.loadOptions("NDX");},600000);
  setInterval(loadPrev,600000);
  loadCtx();setInterval(loadCtx,60000);
  setInterval(render,5000);setInterval(renderCtx,15000);
}};
})();
