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
var OKX="https://www.okx.com",TV="https://scanner.tradingview.com/global/scan",FT=CK.fut,IDX={NDX:{n:"Nasdaq 100",inst:"US100-USDT-SWAP",perp:"US100"},SPX:{n:"S&P 500",inst:"SPX-USDT-SWAP",perp:"SPX"},MNQ:{n:"MNQ",inst:"US100-USDT-SWAP",perp:"US100",base:"NDX"},MES:{n:"MES",inst:"SPX-USDT-SWAP",perp:"SPX",base:"SPX"}},BASES=["NDX","SPX"];
var PL={sym:CK.ls("plSym")||"NDX"};if(!IDX[PL.sym])PL.sym="NDX";
var PD={};                      /* clôture d'hier (UTC), par indice */
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
function seg(){return '<div class="seg" role="group" aria-label="Indice">'+Object.keys(IDX).map(function(k){return '<button type="button" data-pl="'+k+'" aria-pressed="'+(k===PL.sym)+'">'+IDX[k].n.toUpperCase()+'</button>';}).join("")+'</div>';}
function loadPrev(b){
  return q(u.fetchJSON(OKX+"/api/v5/market/candles?instId="+IDX[b].inst+"&bar=1Dutc&limit=3",null,12000)).then(function(j){
    var D=j&&j.data;if(D&&D[1]&&+D[1][4]>0)PD[b]=+D[1][4];render();});
}
function loadPx(b){
  b=FT.base(b);
  return q(u.fetchJSON(OKX+"/api/v5/market/ticker?instId="+IDX[b].inst,null,8000)).then(function(j){
    var t=j&&j.data&&j.data[0];if(t&&+t.last>0&&CK.levels&&CK.levels.px){CK.levels.px[b]=+t.last;render();}});
}
function levelsOf(){
  var yl=FT.levels(PL.sym),d=CK.levels&&CK.levels.data&&CK.levels.data[FT.base(PL.sym)],o={};
  if(yl){yl.forEach(function(x){o[x.k]=x.px;});o._y=1;}else if(d)d.L.forEach(function(x){o[x.k]=x.px;});
  return o;
}
function render(){
  var host=u.$("plan");if(!host)return;
  var B=FT.base(PL.sym),fu=FT.is(PL.sym),M=fu?FT.M[PL.sym]:null,L=levelsOf(),p0=CK.levels&&CK.levels.px&&CK.levels.px[B],now=Date.now(),I=IDX[PL.sym],sg=seg();
  if(!p0||!Object.keys(L).length){host.innerHTML=sg+'<div class="empty">Calcul du plan…</div>';return;}
  var inf=fu?FT.info(PL.sym,p0):null,off=inf?inf.v:0,p=p0+off;var yl=!!L._y;delete L._y;if(!yl)Object.keys(L).forEach(function(k){L[k]+=off;});
  var rows=[];
  function add(tag,name,v,kind,tip){if(v>0)rows.push({tag:tag,n:name,px:v,k:kind,tip:tip||""});}
  add("PDH","Plus haut d'hier",L.PDH,"niv");add("PDL","Plus bas d'hier",L.PDL,"niv");
  if(L.PDC>0)add("PDC","Clôture d'hier (00 h UTC)",L.PDC,"niv");else if(PD[B])add("PDC","Clôture d'hier (00 h UTC)",PD[B]+off,"niv");
  add("DO","Ouverture du jour (UTC)",L.DO,"niv");add("WO","Ouverture de la semaine",L.WO,"niv");
  var nh=Math.max(L.TKH||0,L.LDH||0),nl=Math.min(L.TKL||Infinity,L.LDL||Infinity);
  if(nh>0)add("NUH","Haut de la nuit (Tokyo + Londres)",nh,"niv");
  if(isFinite(nl)&&nl>0)add("NUL","Bas de la nuit (Tokyo + Londres)",nl,"niv");
  var O=CK.opData&&CK.opData.data&&CK.opData.data[B],oinfo="";
  if(O&&O.list){
    var nx=O.list.filter(function(e){return e.ts>now;}).sort(function(a,b){return a.ts-b.ts;})[0];
    if(nx&&nx.mp>0)add("MP","Max pain, échéance la plus proche",nx.mp+off,"opt","Prix d'exercice où les vendeurs d'options paient le moins à l'échéance du "+new Date(nx.ts).toLocaleDateString("fr-FR",{day:"numeric",month:"short"})+". L'indice y est souvent attiré en fin de vie des options.");
    var wc=(O.wc||O.calls||[]).map(function(w){return {k:w.k+off,c:w.c,p:w.p};}).filter(function(w){return w.k>p;}),wp=(O.wp||O.puts||[]).map(function(w){return {k:w.k+off,c:w.c,p:w.p};}).filter(function(w){return w.k<p;});
    if(wc.length)add("MC","Mur de calls au-dessus",wc[0].k,"opt",nf(wc[0].c,0)+" contrats calls : résistance possible (les vendeurs de calls couvrent en vendant).");
    if(wp.length)add("MS","Mur de puts en dessous",wp[0].k,"opt",nf(wp[0].p,0)+" contrats puts : support possible.");
  }else if(O&&O.err)oinfo=O.err;
  rows.sort(function(a,b){return b.px-a.px;});
  var html="",placed=false;
  rows.forEach(function(x){
    var dd=(x.px/p-1)*100,pts=x.px-p;
    if(!placed&&x.px<p){html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+px(p)+'</b></div>';placed=true;}
    html+='<div class="lv-r '+(x.px>p?"ab":"be")+(Math.abs(dd)<.35?" near":"")+(x.k==="opt"?" plan-opt":"")+(fu?" lv-fu":"")+'"'+(x.tip?' data-x="'+esc('<b>'+x.n+'</b><span>'+x.tip+'</span>')+'"':"")+'><span class="lv-tag">'+x.tag+'</span><span class="lv-n">'+esc(x.n)+'</span><b class="mono">'+px(x.px)+'</b>'+(fu?'<span class="lv-d mono">'+(pts>0?"+":"−")+nf(Math.abs(pts),2)+' pts</span><span class="lv-d mono">'+(pts>0?"+":"−")+nf(Math.abs(pts)*M.pt,0)+' $</span>':'')+'<span class="lv-d mono">'+(dd>0?"+":"")+nf(dd,2)+' %</span></div>';
  });
  if(!placed)html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+px(p)+'</b></div>';
  /* en-tête : prix, variation depuis l'ouverture du jour, compte à rebours US */
  var ch=L.DO>0?(p/L.DO-1)*100:null,us=usSession(now),head='<div class="plan-top"><div><span class="x-k">'+I.n+'</span><b class="mono plan-px">'+px(p)+'</b>'+(ch==null?"":'<span class="mono '+u.cls(ch)+'"> '+pct(ch)+' depuis 00 h UTC</span>')+'</div>';
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
  var spec=fu?'<p class="plan-spec"><b>'+M.n+'</b> · '+M.full+' · 1 point = <b>'+M.pt+' $</b> · tick 0,25 pt = '+nf(.25*M.pt,2)+' $ · écart contrat/référence <b>'+(off>=0?"+":"−")+nf(Math.abs(off),2)+' pts</b> ('+inf.src+') · échéance trimestrielle dans '+Math.round(inf.days)+' j</p>':'';
  var out=sg+head+spec+(fu?'<div class="lv-hd"><span>Niveau</span><span></span><span>Prix</span><span>Points</span><span>$ / contrat</span><span>%</span></div>':'')+'<div class="lv-list">'+html+'</div>'+(rd.length?'<p class="plan-rd">'+rd.map(esc).join(" ")+'</p>':"")+ag+
    '<p class="x-n">'+(oinfo?esc(oinfo)+" ":"")+'Prix et niveaux : perpétuel '+I.perp+' d\'OKX (journée à 00 h UTC), écart possible avec l\'indice.'+(fu?' Pour '+M.n+', chaque niveau = indice + écart contrat/indice '+(yl?'(niveaux lus sur le contrat réel, Yahoo Finance via le robot, prix différé)':'(écart '+inf.src+' : robot Yahoo, sinon TradingView en séance US, sinon coût de portage)')+' : vérifie le prix exact sur ta plateforme.':'')+' Nuit = Tokyo + Londres. Options : open interest de la veille (robot GitHub). Lecture mécanique des niveaux, pas une prévision.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

/* ---------------- 2. Contexte : volatilité, taux, poids lourds ---------------- */
var CTX=[["VIX","VIX","TVC:VIX"],["VXN","VXN (volatilité Nasdaq)","CBOE:VXN"],["US05Y","Taux 5 ans","TVC:US05Y"],["US10Y","Taux 10 ans","TVC:US10Y"],["DXY","Dollar (DXY)","TVC:DXY"],["DJI","Dow Jones","TVC:DJI"],["RUT","Russell 2000","TVC:RUT"],["BRENT","Brent (pétrole, $)","TVC:UKOIL"],["NQ","Future NQ","CME_MINI:NQ1!"],["ES","Future ES","CME_MINI:ES1!"]];
/* poids lourds de chaque indice : [code, nom, symbole TradingView] */
var BIGS={
  NDX:[["NVDA","Nvidia","NASDAQ:NVDA"],["MSFT","Microsoft","NASDAQ:MSFT"],["AAPL","Apple","NASDAQ:AAPL"],["AMZN","Amazon","NASDAQ:AMZN"],["META","Meta","NASDAQ:META"],["GOOGL","Alphabet","NASDAQ:GOOGL"],["AVGO","Broadcom","NASDAQ:AVGO"],["TSLA","Tesla","NASDAQ:TSLA"],["COST","Costco","NASDAQ:COST"],["NFLX","Netflix","NASDAQ:NFLX"]],
  SPX:[["NVDA","Nvidia","NASDAQ:NVDA"],["MSFT","Microsoft","NASDAQ:MSFT"],["AAPL","Apple","NASDAQ:AAPL"],["AMZN","Amazon","NASDAQ:AMZN"],["META","Meta","NASDAQ:META"],["GOOGL","Alphabet","NASDAQ:GOOGL"],["AVGO","Broadcom","NASDAQ:AVGO"],["BRK.B","Berkshire","NYSE:BRK.B"],["JPM","JPMorgan","NYSE:JPM"],["LLY","Eli Lilly","NYSE:LLY"]]
};
var IDXT={NDX:["NASDAQ:NDX","Nasdaq 100"],SPX:["SP:SPX","S&P 500"],MNQ:["CME_MINI:MNQ1!","Micro Nasdaq 100 (MNQ)"],MES:["CME_MINI:MES1!","Micro S&P 500 (MES)"]};
function loadCtx(){
  var seen={},tk=[];CTX.map(function(x){return x[2];}).concat(Object.keys(IDXT).map(function(k){return IDXT[k][0];}),BIGS.NDX.concat(BIGS.SPX).map(function(x){return x[2];})).forEach(function(t){if(!seen[t]){seen[t]=1;tk.push(t);}});
  return q(u.fetchJSON(TV,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({symbols:{tickers:tk},columns:["close","change"]})},12000)).then(function(j){
    if(!j||!j.data)return;j.data.forEach(function(o){CX.rows[o.s]={c:o.d[0],ch:o.d[1]};});FT.rows=CX.rows;CX.ts=Date.now();render();renderCtx();});
}
function renderCtx(){
  var host=u.$("ctx");if(!host)return;
  var sg=seg();if(!CX.ts){host.innerHTML=sg+'<div class="empty">Chargement du contexte…</div>';return;}
  function tile(x){var r=CX.rows[x[2]];if(!r)return '<div class="ctx-t"><span class="x-k">'+esc(x[1])+'</span><b class="mono">—</b></div>';
    var isY=x[0]==="US10Y"||x[0]==="US05Y",v=isY?nf(r.c,3)+" %":px(r.c),c=isY?(function(){var bp=r.c-r.c/(1+(r.ch||0)/100);return (bp>=0?"+":"−")+nf(Math.abs(bp*100),1)+" pb";})():pct(r.ch);
    return '<div class="ctx-t"><span class="x-k">'+esc(x[1])+'</span><b class="mono">'+v+'</b><span class="mono '+u.cls(r.ch)+'">'+c+'</span></div>';}
  var big=BIGS[FT.base(PL.sym)].map(function(x){return {n:x[1],s:x[0],r:CX.rows[x[2]]};}).filter(function(x){return x.r;}).sort(function(a,b){return b.r.ch-a.r.ch;});
  var maxA=Math.max.apply(null,big.map(function(x){return Math.abs(x.r.ch);}).concat([.5]));
  var avg=big.length?big.reduce(function(s,x){return s+x.r.ch;},0)/big.length:null;
  var it=IDXT[PL.sym],out=sg+'<div class="ctx-grid">'+tile([PL.sym,it[1],(CX.rows[it[0]]||!FT.is(PL.sym))?it[0]:FT.M[PL.sym].big])+CTX.map(tile).join("")+'</div><div class="ctx-h"><span class="x-k">Poids lourds du '+IDXT[FT.base(PL.sym)][1]+'</span>'+(avg==null?"":'<span class="mono '+u.cls(avg)+'">moyenne '+pct(avg)+'</span>')+'</div>'+
    '<div class="ctx-big">'+big.map(function(x){var w=Math.max(3,Math.abs(x.r.ch)/maxA*100);return '<div class="ctx-b"><span class="ctx-n">'+esc(x.n)+'</span><span class="ctx-bar"><i class="'+(x.r.ch>=0?"up":"down")+'" style="width:'+w.toFixed(0)+'%"></i></span><b class="mono">'+px(x.r.c)+'</b><span class="mono '+u.cls(x.r.ch)+'">'+pct(x.r.ch)+'</span></div>';}).join("")+'</div>'+
    '<p class="x-n">Source : scanner public de TradingView, prix différés. VIX et VXN en points ; un VIX qui monte avec l\'indice qui baisse signale un marché sous tension.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

CK.plan={boot:function(){
  ["plan","ctx"].forEach(function(id){var host=u.$(id);if(host)host.addEventListener("click",function(e){var b=e.target.closest("[data-pl]");if(!b)return;PL.sym=b.getAttribute("data-pl");CK.ls("plSym",PL.sym);var p=u.$("plan"),c=u.$("ctx");if(p)p._h=null;if(c)c._h=null;render();renderCtx();});});
  render();renderCtx();
  function lv(){if(CK.xApi)BASES.forEach(function(k){CK.xApi.loadLevels(k);});}
  function op(){if(CK.xApi)BASES.forEach(function(k){CK.xApi.loadOptions(k);});}
  lv();op();BASES.forEach(loadPrev);FT.load(render);setInterval(function(){FT.load(function(){render();if(CK.xApi&&CK.xApi.renderAll)CK.xApi.renderAll();});},180000);
  setInterval(lv,120000);setInterval(op,600000);setInterval(function(){BASES.forEach(loadPrev);},600000);
  setInterval(function(){if(!document.hidden)loadPx(PL.sym);},10000);
  loadCtx();setInterval(loadCtx,60000);
  setInterval(render,5000);setInterval(renderCtx,15000);
}};
})();
