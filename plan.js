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
var OKX="https://www.okx.com",TV="https://scanner.tradingview.com/global/scan",FT=CK.fut,IDX={NDX:{n:"Nasdaq 100",inst:"US100-USDT-SWAP",perp:"US100"},SPX:{n:"S&P 500",inst:"SPX-USDT-SWAP",perp:"SPX"},MNQ:{n:"MNQ",inst:"US100-USDT-SWAP",perp:"US100",base:"NDX"},MES:{n:"MES",inst:"SPX-USDT-SWAP",perp:"SPX",base:"SPX"},YM:{n:"Dow (YM)",y:1},RTY:{n:"Russell (RTY)",y:1}},BASES=["NDX","SPX"],
  YONLY={YM:{full:"E-mini Dow Jones",pt:5,tick:1,name:"Dow Jones"},RTY:{full:"E-mini Russell 2000",pt:50,tick:.1,name:"Russell 2000"}},BASE4=["NDX","SPX","MNQ","MES"];
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
function ctxSym(){return YONLY[PL.sym]?"NDX":PL.sym;}
function seg(withY){var cur=withY?PL.sym:ctxSym();return '<div class="seg" role="group" aria-label="Indice">'+(withY?Object.keys(IDX):BASE4).map(function(k){return '<button type="button" data-pl="'+k+'" aria-pressed="'+(k===cur)+'">'+IDX[k].n.toUpperCase()+'</button>';}).join("")+'</div>';}
function loadPrev(b){
  if(IDX[b]&&IDX[b].y)return Promise.resolve();
  return q(u.fetchJSON(OKX+"/api/v5/market/candles?instId="+IDX[b].inst+"&bar=1Dutc&limit=3",null,12000)).then(function(j){
    var D=j&&j.data;if(D&&D[1]&&+D[1][4]>0)PD[b]=+D[1][4];render();});
}
function loadPx(b){
  if(IDX[b]&&IDX[b].y)return Promise.resolve();
  b=FT.base(b);
  return q(u.fetchJSON(OKX+"/api/v5/market/ticker?instId="+IDX[b].inst,null,8000)).then(function(j){
    var t=j&&j.data&&j.data[0];if(t&&+t.last>0&&CK.levels&&CK.levels.px){CK.levels.px[b]=+t.last;render();}});
}
function levelsOf(){
  var yl=FT.levels(PL.sym),d=CK.levels&&CK.levels.data&&CK.levels.data[FT.base(PL.sym)],o={};
  if(yl){yl.forEach(function(x){o[x.k]=x.px;});o._y=1;}else if(d)d.L.forEach(function(x){o[x.k]=x.px;});
  return o;
}
/* Dow (YM) et Russell 2000 (RTY) : niveaux lus sur le contrat réel par le robot (Yahoo), sans perpétuel OKX ni options */
function renderY(host){
  var sym=PL.sym,Y=YONLY[sym],d=FT.fresh(sym),sg=seg(true);
  if(!d||!d.L||!d.L.length||!(d.last>0)){host.innerHTML=sg+'<div class="empty">Le robot n\'a pas encore publié les niveaux de '+esc(Y.name)+' (Yahoo Finance). Réessaie dans quelques minutes.</div>';return;}
  var L={};d.L.forEach(function(x){L[x.k]=x.px;});var p=d.last,now=Date.now(),rows=[];
  function add(tag,name,v){if(v>0)rows.push({tag:tag,n:name,px:v});}
  add("PDH","Plus haut d'hier",L.PDH);add("PDL","Plus bas d'hier",L.PDL);add("PDC","Clôture d'hier (00 h UTC)",L.PDC);add("DO","Ouverture du jour (UTC)",L.DO);add("WO","Ouverture de la semaine",L.WO);
  var nh=Math.max(L.TKH||0,L.LDH||0),nl=Math.min(L.TKL||Infinity,L.LDL||Infinity);
  if(nh>0)add("NUH","Haut de la nuit (Tokyo + Londres)",nh);if(isFinite(nl)&&nl>0)add("NUL","Bas de la nuit (Tokyo + Londres)",nl);
  rows.sort(function(a,b){return b.px-a.px;});
  var html="",placed=false;
  rows.forEach(function(x){var dd=(x.px/p-1)*100,pts=x.px-p;
    if(!placed&&x.px<p){html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+px(p)+'</b></div>';placed=true;}
    html+='<div class="lv-r '+(x.px>p?"ab":"be")+(Math.abs(dd)<.35?" near":"")+' lv-fu"><span class="lv-tag">'+x.tag+'</span><span class="lv-n">'+esc(x.n)+'</span><b class="mono">'+px(x.px)+'</b><span class="lv-d mono">'+(pts>0?"+":"−")+nf(Math.abs(pts),2)+' pts</span><span class="lv-d mono">'+(pts>0?"+":"−")+nf(Math.abs(pts)*Y.pt,0)+' $</span><span class="lv-d mono">'+(dd>0?"+":"")+nf(dd,2)+' %</span></div>';});
  if(!placed)html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+px(p)+'</b></div>';
  var ch=L.DO>0?(p/L.DO-1)*100:null,us=usSession(now),head='<div class="plan-top"><div><span class="x-k">'+esc(Y.name)+'</span><b class="mono plan-px">'+px(p)+'</b>'+(ch==null?"":'<span class="mono '+u.cls(ch)+'"> '+pct(ch)+' depuis 00 h UTC</span>')+'</div>';
  if(us)head+='<div class="plan-us"><span class="x-k">'+(us.open?"Séance US ouverte":"Ouverture US")+'</span><b class="mono">'+(us.open?"clôture dans ":"dans ")+dur(us.t-now)+'</b><span class="plan-sub">'+(us.open?"fin à ":"à ")+hm(us.t)+' (Paris)</span></div>';
  head+='</div>';
  var rd=[];
  if(L.DO>0)rd.push(p>=L.DO?"Prix au-dessus de l'ouverture du jour : biais acheteur tant qu'il y reste.":"Prix sous l'ouverture du jour : biais vendeur tant qu'il y reste.");
  if(L.PDH>0&&p>L.PDH)rd.push("Au-dessus du plus haut d'hier : cassure à confirmer, sinon retour dans la zone d'hier.");
  else if(L.PDL>0&&p<L.PDL)rd.push("Sous le plus bas d'hier : pression vendeuse, surveiller la reprise du niveau.");
  else if(L.PDH>0&&L.PDL>0)rd.push("Prix dans la fourchette d'hier : les extrêmes (PDH/PDL) sont les niveaux de décision.");
  var td=parisDay(now),ev=(S.cal||[]).filter(function(e){return parisDay(e.ts)===td&&(e.imp==="hi"||e.imp==="md");}).slice(0,6);
  var ag=ev.length?'<div class="plan-ag"><span class="x-k">Annonces du jour (heure de Paris)</span>'+ev.map(function(e){return '<div class="plan-ev'+(e.ts<now?" past":"")+'"><span class="mono">'+hm(e.ts)+'</span><span class="plan-i '+(e.imp==="hi"?"hi":"md")+'" aria-hidden="true"></span><span>'+esc(e.fr||e.t)+'</span></div>';}).join("")+'</div>':'<div class="plan-ag"><span class="x-k">Annonces du jour</span><div class="plan-ev"><span>Aucune annonce américaine importante au programme.</span></div></div>';
  var spec='<p class="plan-spec"><b>'+sym+'</b> · '+Y.full+' · 1 point = <b>'+Y.pt+' $</b> · tick '+nf(Y.tick,Y.tick<1?1:0)+' pt = '+nf(Y.tick*Y.pt,2)+' $</p>';
  var out=sg+head+spec+'<div class="lv-hd"><span>Niveau</span><span></span><span>Prix</span><span>Points</span><span>$ / contrat</span><span>%</span></div><div class="lv-list">'+html+'</div>'+(rd.length?'<p class="plan-rd">'+rd.map(esc).join(" ")+'</p>':"")+ag+
    '<p class="x-n">Niveaux lus sur le contrat réel '+sym+' par le robot (Yahoo Finance, prix différé d\'environ 10 minutes, mis à jour à '+hm(d.ts||now)+' Paris). Pas de murs d\'options pour cet indice. Lecture mécanique des niveaux, pas une prévision.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}
function render(){
  var host=u.$("plan");if(!host)return;renderBias();
  if(YONLY[PL.sym]){renderY(host);return;}
  var B=FT.base(PL.sym),fu=FT.is(PL.sym),M=fu?FT.M[PL.sym]:null,L=levelsOf(),p0=CK.levels&&CK.levels.px&&CK.levels.px[B],now=Date.now(),I=IDX[PL.sym],sg=seg(true);
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
var CTX=[["VIX","VIX","TVC:VIX"],["VXN","VXN (volatilité Nasdaq)","CBOE:VXN"],["US05Y","Taux 5 ans","TVC:US05Y"],["US10Y","Taux 10 ans","TVC:US10Y"],["DXY","Dollar (DXY)","TVC:DXY"],["DJI","Dow Jones","TVC:DJI"],["RUT","Russell 2000","TVC:RUT"],["BRENT","Brent (pétrole, $)","TVC:UKOIL"],["GOLD","Or (once, $)","TVC:GOLD"],["NQ","Future NQ","CME_MINI:NQ1!"],["ES","Future ES","CME_MINI:ES1!"]];
var CURVE=[["2 ans","TVC:US02Y"],["5 ans","TVC:US05Y"],["10 ans","TVC:US10Y"],["30 ans","TVC:US30Y"]];
/* poids lourds de chaque indice : [code, nom, symbole TradingView] */
var BIGS={
  NDX:[["NVDA","Nvidia","NASDAQ:NVDA"],["MSFT","Microsoft","NASDAQ:MSFT"],["AAPL","Apple","NASDAQ:AAPL"],["AMZN","Amazon","NASDAQ:AMZN"],["META","Meta","NASDAQ:META"],["GOOGL","Alphabet","NASDAQ:GOOGL"],["AVGO","Broadcom","NASDAQ:AVGO"],["TSLA","Tesla","NASDAQ:TSLA"],["COST","Costco","NASDAQ:COST"],["NFLX","Netflix","NASDAQ:NFLX"]],
  SPX:[["NVDA","Nvidia","NASDAQ:NVDA"],["MSFT","Microsoft","NASDAQ:MSFT"],["AAPL","Apple","NASDAQ:AAPL"],["AMZN","Amazon","NASDAQ:AMZN"],["META","Meta","NASDAQ:META"],["GOOGL","Alphabet","NASDAQ:GOOGL"],["AVGO","Broadcom","NASDAQ:AVGO"],["BRK.B","Berkshire","NYSE:BRK.B"],["JPM","JPMorgan","NYSE:JPM"],["LLY","Eli Lilly","NYSE:LLY"]]
};
var IDXT={NDX:["NASDAQ:NDX","Nasdaq 100"],SPX:["SP:SPX","S&P 500"],MNQ:["CME_MINI:MNQ1!","Micro Nasdaq 100 (MNQ)"],MES:["CME_MINI:MES1!","Micro S&P 500 (MES)"]};
function loadCtx(){
  var seen={},tk=[];CTX.map(function(x){return x[2];}).concat(CURVE.map(function(x){return x[1];}),Object.keys(IDXT).map(function(k){return IDXT[k][0];}),BIGS.NDX.concat(BIGS.SPX).map(function(x){return x[2];})).forEach(function(t){if(!seen[t]){seen[t]=1;tk.push(t);}});
  return q(u.fetchJSON(TV,{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({symbols:{tickers:tk},columns:["close","change"]})},12000)).then(function(j){
    if(!j||!j.data)return;j.data.forEach(function(o){CX.rows[o.s]={c:o.d[0],ch:o.d[1]};});FT.rows=CX.rows;CX.ts=Date.now();render();renderCtx();});
}

/* Lecture inter-marchés du jour : pétrole, taux, dollar, or, VIX et Nasdaq, lus avec les règles classiques (mécanique, pas une prévision) */
function lecture(){
  function ch(sym){var r=CX.rows[sym];return r&&isFinite(r.ch)?r.ch:null;}
  var nd=ch("NASDAQ:NDX"),oil=ch("TVC:UKOIL"),gold=ch("TVC:GOLD"),dx=ch("TVC:DXY"),vx=ch("TVC:VIX"),r10=CX.rows["TVC:US10Y"],bp=r10&&isFinite(r10.ch)?(r10.c-r10.c/(1+r10.ch/100))*100:null;
  if(nd==null||oil==null)return null;
  var L=[],sc=0,n=0;
  function f(v,d){return (v>0?"+":v<0?"−":"")+nf(Math.abs(v),d)+" %";}
  if(Math.abs(oil)>=.8){
    if(oil>0&&nd<0){L.push(["dn","Pétrole "+f(oil,2)+", Nasdaq "+f(nd,2)+" : la relation inverse joue. Un baril plus cher nourrit l'inflation, donc les taux, et pèse sur la valorisation de la tech."]);sc--;n++;}
    else if(oil>0){L.push(["warn","Pétrole "+f(oil,2)+" mais Nasdaq "+f(nd,2)+" : la tech résiste à l'énergie chère. À surveiller : si le taux 10 ans suit le baril, la pression arrive."]);n++;}
    else if(nd>0){L.push(["up","Pétrole "+f(oil,2)+", Nasdaq "+f(nd,2)+" : la détente du brut redonne de l'air à la tech."]);sc++;n++;}
    else{L.push(["warn","Pétrole "+f(oil,2)+" et Nasdaq "+f(nd,2)+" baissent ensemble : plutôt des craintes sur la croissance que sur l'inflation."]);sc--;n++;}
  }else{L.push(["neu","Pétrole calme ("+f(oil,2)+") : pas de message inflation venu de l'énergie aujourd'hui."]);}
  if(bp!=null&&Math.abs(bp)>=3){
    if(bp>0){L.push(["dn","Taux 10 ans "+(bp>0?"+":"")+nf(bp,1)+" pb : des taux qui montent pèsent sur les valeurs de croissance du Nasdaq."]);sc--;}
    else{L.push(["up","Taux 10 ans "+nf(bp,1).replace("-","−")+" pb : des taux qui baissent soutiennent la tech."]);sc++;}n++;
  }
  if(dx!=null&&Math.abs(dx)>=.2){
    if(dx>0){L.push(["dn","Dollar "+f(dx,2)+" : un dollar fort resserre les conditions financières, défavorable aux actions américaines et à l'or."]);sc--;}
    else{L.push(["up","Dollar "+f(dx,2)+" : un dollar plus faible détend les conditions financières et soutient l'or."]);sc++;}n++;
  }
  if(gold!=null&&Math.abs(gold)>=.3){
    if(gold>0&&nd<0&&vx!=null&&vx>0)L.push(["warn","Or "+f(gold,2)+" avec Nasdaq en baisse et VIX en hausse : repli vers les valeurs refuges, aversion au risque."]);
    else if(gold>0&&oil>0)L.push(["warn","Or "+f(gold,2)+" et pétrole "+f(oil,2)+" : le canal inflationniste est actif, les investisseurs se protègent."]);
    else if(gold<0&&nd>0)L.push(["up","Or "+f(gold,2)+" et Nasdaq "+f(nd,2)+" : appétit pour le risque, l'or est délaissé."]);
    else if(gold>0&&dx!=null&&dx<0)L.push(["neu","Or "+f(gold,2)+" porté par un dollar plus faible."]);
    else L.push(["neu","Or "+f(gold,2)+" : pas de lien net avec le Nasdaq aujourd'hui."]);
  }
  if(vx!=null&&Math.abs(vx)>=3){
    if(vx>0){L.push(["dn","VIX "+f(vx,1)+" : la volatilité monte, le marché se couvre."]);sc--;}
    else{L.push(["up","VIX "+f(vx,1)+" : la volatilité se détend, favorable aux actions."]);sc++;}n++;
  }
  var bias=sc<=-2?["dn","prudent"]:sc>=2?["up","porteur"]:sc<0?["warn","plutôt prudent"]:sc>0?["up","plutôt porteur"]:["neu","neutre"];
  return {L:L,bias:bias,sc:sc,n:n};
}
function corrHTML(){
  var c=FT.y&&FT.y.corr&&FT.y.corr.rows;if(!c||!c.length)return '';
  function cell(v){return v==null?'—':'<span class="mono '+(v>=.3?'up':v<=-.3?'down':'')+'">'+(v>0?'+':v<0?'−':'')+nf(Math.abs(v),2)+'</span>';}
  return '<div class="ctx-h"><span class="x-k">Corrélations mesurées (rendements quotidiens)</span></div><div class="ctx-cor"><div class="cc-h"><span>Paire</span><span>30 séances</span><span>90 séances</span><span>Attendue</span></div>'+
    c.map(function(r){return '<div class="cc-r"><span>'+esc(r.nom)+'</span>'+cell(r.c30)+cell(r.c90)+'<span class="cc-a">'+esc(r.attendu)+'</span></div>';}).join("")+'</div><p class="x-n">Une corrélation mesure si deux marchés bougent ensemble. +1 : toujours dans le même sens ; −1 : toujours en sens inverse ; autour de 0 : aucun lien. Exemple : si le Nasdaq est habituellement à −0,5 avec le dollar, un dollar qui monte avec un Nasdaq qui monte est inhabituel, donc méfiance. Compare la colonne « 30 séances » (récent) à « 90 séances » (habituel) : un écart important signale que la relation change. Yahoo Finance (futures NQ, Brent, or ; dollar, taux et VIX), calculée par le robot.</p>';
}
var LBL={PDC:"Clôture hier",DO:"Ouverture jour",PDH:"Haut hier",PDL:"Bas hier",WO:"Ouverture semaine",PWH:"Haut sem. dern.",PWL:"Bas sem. dern.",MO:"Ouverture mois",TKH:"Haut Tokyo",TKL:"Bas Tokyo",LDH:"Haut Londres",LDL:"Bas Londres",NYH:"Haut New York",NYL:"Bas New York"};
function nfs(v,d){return (v>0?"+":v<0?"−":"")+nf(Math.abs(v),d||0);}
function kfmt(v){return (v<0?"−":v>0?"+":"")+nf(Math.abs(v),0);}
function mkOld(p,h){return !p||!p.ts||Date.now()-p.ts*1000>h*3600000;}
function cotHTML(){
  var M=FT.mk&&FT.mk.cot;if(!M||!M.rows||!M.rows.length||mkOld(M,24*10))return '';
  var w={NDX:"209742",SPX:"13874A",YM:"124603",RTY:"239742"},cur=M.rows.filter(function(r){return r.code===w[YONLY[PL.sym]?PL.sym:FT.base(PL.sym)];})[0]||M.rows[0];
  var rows=["asset","lev","dealer","other"].map(function(k){var g=cur.g[k];if(!g)return '';
    return '<div class="cot-r"><span>'+esc(g.n)+'</span><b class="mono '+u.cls(g.net)+'">'+kfmt(g.net)+'</b><span class="mono '+(g.chg==null?"":u.cls(g.chg))+'">'+(g.chg==null?"—":kfmt(g.chg))+'</span></div>';}).join("");
  return '<div class="ctx-h"><span class="x-k">Positionnement des fonds · '+esc(cur.nom)+'</span><span class="mono ft-d">rapport du '+esc(cur.date.split("-").reverse().join("/"))+'</span></div>'+
    '<div class="cot-g"><div class="cot-h"><span>Catégorie</span><span>Position nette (contrats)</span><span>Variation sur 1 sem.</span></div>'+rows+'</div>'+
    '<p class="x-n">Source : rapport « Traders in Financial Futures » de la CFTC (régulateur américain), publié chaque vendredi pour le mardi précédent, donc toujours en retard de 3 jours. Position nette = acheteurs − vendeurs. Les gérants d\'actifs sont les gros institutionnels ; les fonds spéculatifs (hedge funds) jouent la tendance. Ouvert : '+nf(cur.oi,0)+' contrats.</p>';
}
function fngHTML(){
  var F=FT.mk&&FT.mk.fng;if(!F||typeof F.score!=="number"||mkOld(F,6))return '';
  var sc=F.score,cl=sc>=60?"up":sc<=40?"dn":"warn";
  var comp=(F.comp||[]).map(function(c){return '<div class="fg-r"><span>'+esc(c.n)+'</span><b class="mono">'+nf(c.s,0)+'</b><span>'+esc(c.r)+'</span></div>';}).join("");
  return '<div class="ctx-h"><span class="x-k">Peur &amp; Cupidité du marché actions</span><span class="ctx-bias '+cl+'">'+esc(F.rating||"")+' · '+nf(sc,0)+' / 100</span></div>'+
    '<div class="fg-b"><i style="left:'+Math.max(0,Math.min(100,sc))+'%"></i></div><div class="fg-s"><span>Peur extrême</span><span>Neutre</span><span>Cupidité extrême</span></div>'+
    '<p class="kc-d">Veille : '+nf(F.prev,0)+' · il y a 1 semaine : '+nf(F.week,0)+' · 1 mois : '+nf(F.month,0)+' · 1 an : '+nf(F.year,0)+(F.pc!=null?' · ratio put/call (moyenne 5 jours) : <b>'+nf(F.pc,2)+'</b> (au-dessus de 1 : plus de protection achetée, marché inquiet ; sous 0,7 : euphorie)':'')+'.</p>'+
    (comp?'<div class="fg-g">'+comp+'</div>':'')+
    '<p class="x-n">Indice calculé par CNN à partir de 7 indicateurs. Un marché en « cupidité extrême » peut continuer à monter, mais devient fragile ; en « peur extrême », c\'est souvent là que se forment les creux. Une lecture d\'ambiance, pas un signal.</p>';
}
function brdHTML(){
  var B=FT.mk&&FT.mk.breadth;if(!B||!B.rows||!B.rows.length||mkOld(B,6))return '';
  var rows=B.rows.map(function(r){var t=Math.max(1,r.adv+r.dec),pa=r.adv/t*100;
    return '<div class="br-c"><div class="br-h"><b>'+esc(r.nom)+'</b><span class="mono">'+nf(r.n,0)+' valeurs</span></div>'+
      '<div class="sn-b"><i class="up" style="width:'+pa.toFixed(1)+'%"></i><i class="down" style="width:'+(100-pa).toFixed(1)+'%"></i></div>'+
      '<div class="br-r"><span>Hausse / baisse</span><b class="mono"><span class="up">'+r.adv+'</span> / <span class="down">'+r.dec+'</span></b></div>'+
      '<div class="br-r"><span>Au-dessus de la moyenne 20 j</span><b class="mono">'+nf(r.p20,0)+' %</b></div>'+
      '<div class="br-r"><span>Au-dessus de la moyenne 50 j</span><b class="mono">'+nf(r.p50,0)+' %</b></div>'+
      '<div class="br-r"><span>Au-dessus de la moyenne 200 j</span><b class="mono">'+nf(r.p200,0)+' %</b></div>'+
      '<div class="br-r"><span>Plus hauts / plus bas 52 sem.</span><b class="mono"><span class="up">'+r.nh+'</span> / <span class="down">'+r.nl+'</span></b></div></div>';}).join("");
  return '<div class="ctx-h"><span class="x-k">Largeur de marché</span></div><div class="br-g">'+rows+'</div>'+
    '<p class="x-n">Combien de valeurs participent à la hausse. Un indice qui monte avec moins de la moitié des valeurs au-dessus de leur moyenne 50 jours est porté par quelques géants : signe de fragilité. Données Yahoo Finance, séance du '+esc(B.rows[0].date.split("-").reverse().join("/"))+'.</p>';
}
function curveHTML(){
  var P=CURVE.map(function(c){var r=CX.rows[c[1]];return r&&r.c>0?{n:c[0],v:r.c}:null;});
  if(P.some(function(x){return !x;}))return '';
  var sp=(P[2].v-P[0].v)*100,inv=sp<0,max=Math.max.apply(null,P.map(function(x){return x.v;})),min=Math.min.apply(null,P.map(function(x){return x.v;}));
  return '<div class="ctx-h"><span class="x-k">Courbe des taux américains</span><span class="ctx-bias '+(inv?"dn":"up")+'">Écart 2 – 10 ans : '+nfs(sp,0)+' pb'+(inv?" · inversée":"")+'</span></div>'+
    '<div class="cv-g">'+P.map(function(x){var h=18+(max>min?(x.v-min)/(max-min):.5)*52;return '<div class="cv-c"><i style="height:'+h.toFixed(0)+'px"></i><b class="mono">'+nf(x.v,2)+' %</b><span>'+x.n+'</span></div>';}).join("")+'</div>'+
    '<p class="x-n">Une courbe inversée (taux courts supérieurs aux taux longs) a historiquement précédé des ralentissements. Des taux longs qui montent vite pèsent sur les valeurs de croissance du Nasdaq. TradingView, prix différés.</p>';
}
function aucHTML(){
  var A=FT.mk&&FT.mk.auctions;if(!A||!A.rows||!A.rows.length||mkOld(A,24))return '';
  var t0=new Date();t0=Date.UTC(t0.getFullYear(),t0.getMonth(),t0.getDate());
  var L=A.rows.map(function(r){var p=r.d.split("-"),t=Date.UTC(+p[0],+p[1]-1,+p[2]);return {r:r,t:t,j:Math.round((t-t0)/86400000)};}).filter(function(x){return x.j>=0&&x.j<=21;}).slice(0,6);
  if(!L.length)return '';
  var TY={Note:"Obligation (Note)",Bond:"Obligation longue (Bond)",TIPS:"Obligation indexée (TIPS)",FRN:"Taux variable (FRN)"};
  return '<div class="ctx-h"><span class="x-k">Prochaines adjudications du Trésor américain</span></div><div class="rs-g">'+L.map(function(x){
    var d=new Date(x.t).toLocaleDateString("fr-FR",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short"}),r=x.r,w=x.j<=1?" rs-w":"";
    return '<div class="rs-r'+w+'"><b>'+esc(r.term)+'</b><span>'+esc(TY[r.type]||r.type)+(r.re?" · réouverture":"")+'</span><span>'+(r.est?"≈ ":"")+esc(d)+(x.j===0?" · aujourd\'hui":x.j===1?" · demain":"")+'</span><span class="mono rs-e">'+(r.amt!=null?nf(r.amt,1)+" Md$":"")+'</span></div>';}).join("")+'</div>'+
    '<p class="x-n">Source : Trésor américain (fiscaldata.treasury.gov). Une adjudication faible (demande insuffisante) fait monter les taux longs, ce qui pèse sur le Nasdaq. Les bons à court terme sont écartés. Le signe « ≈ » indique une date estimée à partir de la date d\'émission (± 1 jour).</p>';
}
function futHTML(){
  var C=[["MNQ","Nasdaq 100 · MNQ"],["MES","S&P 500 · MES"],["YM","Dow Jones · YM"],["RTY","Russell 2000 · RTY"]],any=false;
  var out=C.map(function(c){var d=FT.fresh(c[0]);if(!d||!d.S||!(d.S.c>0))return '';any=true;var S=d.S,ch=S.pc>0?S.c-S.pc:null,pc=S.pc>0?(S.c/S.pc-1)*100:null,cl=pc==null?"":u.cls(pc);
    function r(k,v){return '<div class="ft-r"><span>'+k+'</span><b class="mono">'+(v>0?px(v):"—")+'</b></div>';}
    return '<div class="ft-c"><div class="ft-h"><b>'+esc(c[1])+'</b><span class="mono ft-p">'+px(S.c)+'</span></div>'+
      '<div class="ft-v mono '+cl+'">'+(ch==null?"—":(ch>=0?"+":"−")+px(Math.abs(ch))+" pts · "+pct(pc))+'</div>'+
      r("Ouverture séance",S.o)+r("Plus haut",S.h)+r("Plus bas",S.l)+r("Clôture veille",S.pc)+
      '<div class="ft-r"><span>Volume</span><b class="mono">'+(S.v>0?nf(S.v,0):"—")+'</b></div></div>';}).join("");
  if(!any)return '';
  return '<div class="ctx-h"><span class="x-k">Cours des futures · séance en cours</span></div><div class="ft-g">'+out+'</div><p class="x-n">Séance Globex du CME (18 h – 17 h, heure de New York). Cours lus par le robot sur Yahoo Finance, avec environ 10 minutes de retard : à utiliser pour le contexte, pas pour exécuter. Dernière lecture à '+hm(FT.y&&FT.y.ts||Date.now())+' (Paris).</p>';
}
function dowHTML(){
  var out=[["YM","Dow Jones (YM)",5],["RTY","Russell 2000 (RTY)",5]].map(function(c){
    var d=FT.fresh(c[0]);if(!d||!d.L||!d.L.length||!(d.last>0))return '';
    var rows=d.L.slice().sort(function(a,b){return b.px-a.px;}).map(function(x){var dd=(x.px/d.last-1)*100;
      return '<div class="dw-r"><span>'+esc(LBL[x.k]||x.k)+'</span><b class="mono">'+px(x.px)+'</b><span class="mono '+u.cls(dd)+'">'+(dd>=0?"+":"−")+nf(Math.abs(dd),2)+" %</span></div>";}).join("");
    return '<div class="dw-c"><div class="dw-h"><b>'+esc(c[1])+'</b><span class="mono">'+px(d.last)+'</span></div>'+rows+'</div>';}).join("");
  if(!out)return '';
  return '<div class="ctx-h"><span class="x-k">Dow Jones et Russell 2000 · niveaux des contrats</span></div><div class="dw-g">'+out+'</div><p class="x-n">Contrats futures YM et RTY lus par le robot (Yahoo Finance, quelques minutes de retard). Mêmes niveaux que le Nasdaq : veille, semaine, mois, sessions Tokyo, Londres et New York.</p>';
}
function resHTML(){
  var R=FT.res;if(!R||!R.rows||!R.rows.length)return '';
  var keep={};BIGS[FT.base(ctxSym())].forEach(function(x){keep[x[0]]=1;});
  var t0=new Date();t0=Date.UTC(t0.getFullYear(),t0.getMonth(),t0.getDate());
  var L=R.rows.filter(function(r){return keep[r.s]&&/^\d{4}-\d{2}-\d{2}$/.test(r.date);}).map(function(r){var p=r.date.split("-"),t=Date.UTC(+p[0],+p[1]-1,+p[2]);return {r:r,t:t,j:Math.round((t-t0)/86400000)};})
    .filter(function(x){return x.j>=0&&x.j<=60;}).sort(function(a,b){return a.t-b.t;});
  if(!L.length)return '';
  return '<div class="ctx-h"><span class="x-k">Prochains résultats des poids lourds</span></div><div class="rs-g">'+L.map(function(x){
    var d=new Date(x.t).toLocaleDateString("fr-FR",{timeZone:"UTC",weekday:"short",day:"numeric",month:"short"}),w=x.j<=3?" rs-w":"";
    return '<div class="rs-r'+w+'"><b>'+esc(x.r.n)+'</b><span>'+esc(d)+'</span><span class="mono">'+(x.j===0?"aujourd'hui":x.j===1?"demain":"dans "+x.j+" j")+'</span>'+(x.r.eps!=null&&isFinite(x.r.eps)?'<span class="mono rs-e">BPA att. '+nf(x.r.eps,2)+'</span>':'<span></span>')+'</div>';}).join("")+'</div><p class="x-n">Dates lues par le robot (Yahoo Finance) : elles peuvent être modifiées par les entreprises. Une publication de résultats d\'un poids lourd fait souvent bouger le Nasdaq après la clôture américaine.</p>';
}
function sentiHTML(){
  var s=FT.senti;if(!s||!s.ts||Date.now()-s.ts>8*3600000)return '';
  var cl={"porteur":"up","plutôt porteur":"up","prudent":"dn","plutôt prudent":"warn","neutre":"neu"}[s.label]||"neu",t=Math.max(1,(s.bull||0)+(s.neutral||0)+(s.bear||0));
  return '<div class="ctx-h"><span class="x-k">Sentiment des news financières</span><span class="ctx-bias '+cl+'">'+esc(s.label||"neutre")+'</span></div>'+
    '<div class="sn-b"><i class="up" style="width:'+(s.bull/t*100).toFixed(1)+'%"></i><i class="neu" style="width:'+(s.neutral/t*100).toFixed(1)+'%"></i><i class="down" style="width:'+(s.bear/t*100).toFixed(1)+'%"></i></div>'+
    '<p class="kc-d">'+(+s.bull||0)+' articles haussiers · '+(+s.neutral||0)+' neutres · '+(+s.bear||0)+' baissiers (sur '+(+s.n||0)+'). Score moyen '+(s.score>0?"+":s.score<0?"−":"")+nf(Math.abs(+s.score||0),2)+' sur une échelle de −1 à +1.</p><p class="x-n">Le sentiment mesure si les articles financiers récents sont plutôt positifs ou négatifs. Source : Alpha Vantage, mis à jour à '+hm(s.ts)+' (Paris). Un indicateur d\'ambiance, pas une prévision.</p>';
}
function briefHTML(){
  var b=FT.brief;if(!b||!b.titre||!b.ts||Date.now()-b.ts>8*3600000)return '';
  var cl={"porteur":"up","plutôt porteur":"up","prudent":"dn","plutôt prudent":"warn","neutre":"neu","mitigé":"warn"}[String(b.biais||"").toLowerCase()]||"neu";
  return '<div class="ctx-h"><span class="x-k">Lecture du jour · actualités et monde</span><span class="ctx-bias '+cl+'">Biais : '+esc(b.biais||"—")+'</span></div>'+
    '<div class="ctx-brief"><b>'+esc(b.titre)+'</b><p>'+esc(b.resume||"")+'</p>'+
    ((b.points||[]).length?'<ul>'+b.points.slice(0,6).map(function(x){return '<li>'+esc(x)+'</li>';}).join("")+'</ul>':'')+
    ((b.risques||[]).length?'<p class="cb-r"><span class="x-k">À surveiller</span> '+b.risques.slice(0,4).map(esc).join(" · ")+'</p>':'')+
    '<p class="x-n">Rédigé par une IA à partir des titres des dernières heures (Bloomberg, Investing, Maison Blanche, Fed, FinancialJuice…) et des prix du jour, mis à jour à '+hm(b.ts)+' (Paris). Une interprétation des nouvelles, pas une prévision ni un conseil : elle peut se tromper.</p></div>';
}
/* ---- Cartes du Contexte : chaque information dans sa case, contour coloré en haut, explication derrière le « ? » ---- */
var KOPEN={};
function K(key,html,o){
  if(!html)return '';o=o||{};
  var m=/ctx-bias (up|dn|warn|neu)/.exec(html),tone=o.tone||(m?m[1]:"acc"),note=[];
  html=html.replace(/<p class="x-n">([\s\S]*?)<\/p>/g,function(_,t){note.push(t);return '';});
  return '<div class="kc kc-'+tone+(o.wide?' kc-w':'')+(KOPEN[key]?' open':'')+'" data-k="'+key+'">'+html+
    (note.length?'<button type="button" class="kc-q" data-kq="'+key+'" aria-expanded="'+(!!KOPEN[key])+'" title="À quoi ça sert ?">?</button><div class="kc-help"><span class="x-k">À quoi ça sert</span><p>'+note.join('</p><p>')+'</p></div>':'')+'</div>';
}
function lectHTML(){
  var z=lecture();if(!z)return '';
  return '<div class="ctx-h"><span class="x-k">Lecture inter-marchés du jour</span><span class="ctx-bias '+z.bias[0]+'">Biais mécanique : '+z.bias[1]+'</span></div><ul class="ctx-lec">'+z.L.map(function(x){return '<li class="'+x[0]+'">'+esc(x[1])+'</li>';}).join("")+'</ul><p class="x-n">Règles classiques : pétrole et taux qui montent pèsent sur le Nasdaq, dollar fort et VIX en hausse aussi, l\'or est la valeur refuge. Variations du jour (TradingView, différées), seuils minimums pour éviter le bruit. Lecture mécanique, pas une prévision.</p>';
}
function bigHTML(big,avg,maxA){
  if(!big.length)return '';
  return '<div class="ctx-h"><span class="x-k">Poids lourds du '+IDXT[FT.base(ctxSym())][1]+'</span>'+(avg==null?"":'<span class="mono '+u.cls(avg)+'">moyenne '+pct(avg)+'</span>')+'</div>'+'<div class="ctx-big">'+big.map(function(x){var w=Math.max(3,Math.abs(x.r.ch)/maxA*100);return '<div class="ctx-b"><span class="ctx-n">'+esc(x.n)+'</span><span class="ctx-bar"><i class="'+(x.r.ch>=0?"up":"down")+'" style="width:'+w.toFixed(0)+'%"></i></span><b class="mono">'+px(x.r.c)+'</b><span class="mono '+u.cls(x.r.ch)+'">'+pct(x.r.ch)+'</span></div>';}).join("")+'</div><p class="x-n">Les dix plus gros poids de l\'indice, classés par variation du jour. Quand les géants montent ensemble, l\'indice suit ; quand ils divergent, le mouvement est fragile. Source : scanner public de TradingView, prix différés.</p>';
}
/* couleur d'une carte selon ce qu'elle dit (vert acheteur, rouge vendeur, orange prudence) */
function toneFut(){var d=FT.fresh("MNQ");if(!d||!d.S||!(d.S.pc>0))return "acc";var c=(d.S.c/d.S.pc-1)*100;return c>=.15?"up":c<=-.15?"dn":"neu";}
function toneBrd(){var B=FT.mk&&FT.mk.breadth;if(!B||!B.rows||!B.rows.length)return "acc";var r=B.rows[0];return r.p50>=60?"up":r.p50<=40?"dn":"warn";}
function toneCot(){var M=FT.mk&&FT.mk.cot;if(!M||!M.rows||!M.rows.length)return "acc";var g=M.rows[0].g&&M.rows[0].g.asset;return g&&g.chg!=null?(g.chg>0?"up":g.chg<0?"dn":"neu"):"acc";}
function toneAuc(){var A=FT.mk&&FT.mk.auctions;if(!A||!A.rows)return "acc";var t0=new Date();t0=Date.UTC(t0.getFullYear(),t0.getMonth(),t0.getDate());return A.rows.some(function(r){var p=r.d.split("-"),j=Math.round((Date.UTC(+p[0],+p[1]-1,+p[2])-t0)/864e5);return j>=0&&j<=1;})?"warn":"acc";}
function toneRes(){var R=FT.res;if(!R||!R.rows)return "acc";var t0=new Date();t0=Date.UTC(t0.getFullYear(),t0.getMonth(),t0.getDate());return R.rows.some(function(r){if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date))return false;var p=r.date.split("-"),j=Math.round((Date.UTC(+p[0],+p[1]-1,+p[2])-t0)/864e5);return j>=0&&j<=3;})?"warn":"acc";}

/* ---------------- 3. Biais du jour : synthèse de tous les indicateurs (acheteur / neutre / vendeur) ---------------- */
function curLvl(){
  var sym=PL.sym,L={},p;
  if(YONLY[sym]){var d=FT.fresh(sym);if(!d||!d.L||!(d.last>0))return null;d.L.forEach(function(x){L[x.k]=x.px;});return {p:d.last,L:L};}
  var B=FT.base(sym),p0=CK.levels&&CK.levels.px&&CK.levels.px[B],lv=levelsOf();if(!p0||!Object.keys(lv).length)return null;
  var off=FT.is(sym)?FT.info(sym,p0).v:0,yl=!!lv._y;delete lv._y;if(!yl)Object.keys(lv).forEach(function(k){lv[k]+=off;});
  return {p:p0+off,L:lv};
}
function biasDay(){
  var I=[];
  function add(nom,w,v,txt){I.push({nom:nom,w:w,v:v,txt:txt});}
  var c=curLvl();
  if(c&&c.L.DO>0){
    var p=c.p,L=c.L,v=p>=L.DO?1:-1,t=p>=L.DO?"au-dessus de l'ouverture du jour":"sous l'ouverture du jour";
    if(L.PDH>0&&p>L.PDH){v=2;t="au-dessus du plus haut d'hier";}else if(L.PDL>0&&p<L.PDL){v=-2;t="sous le plus bas d'hier";}
    add("Prix et niveaux",2,v,"Le prix est "+t+".");
  }
  var z=lecture();if(z)add("Inter-marchés",2,Math.max(-2,Math.min(2,z.sc)),"Pétrole, taux, dollar, or et VIX : "+z.bias[1]+".");
  var s=FT.senti;if(s&&s.ts&&Date.now()-s.ts<8*3600000&&isFinite(+s.score))add("News",1,s.score>=.15?1:s.score<=-.15?-1:0,"Sentiment des articles : "+(s.label||"neutre")+".");
  var F=FT.mk&&FT.mk.fng;if(F&&typeof F.score==="number"&&!mkOld(F,6))add("Peur & Cupidité",1,F.score>=60?1:F.score<=40?-1:0,(F.rating||"")+" ("+nf(F.score,0)+" / 100)"+(F.score>=80?", attention : zone d'euphorie fragile":F.score<=20?", attention : zone de panique, rebond possible":"")+".");
  var B=FT.mk&&FT.mk.breadth;if(B&&B.rows&&B.rows.length&&!mkOld(B,6)){var r=B.rows[0];add("Largeur de marché",1,r.p50>=60?1:r.p50<=40?-1:0,nf(r.p50,0)+" % des valeurs "+r.nom+" sont au-dessus de leur moyenne 50 jours.");}
  var M=FT.mk&&FT.mk.cot;if(M&&M.rows&&M.rows.length&&!mkOld(M,240)){var g=M.rows[0].g&&M.rows[0].g.asset;if(g&&g.chg!=null)add("Positionnement des fonds",1,g.chg>0?1:g.chg<0?-1:0,"Les gérants d'actifs ont "+(g.chg>0?"augmenté":g.chg<0?"réduit":"gardé")+" leur position nette sur la semaine.");}
  if(!I.length)return null;
  /* score = somme des votes (−2…+2 pour les deux gros indicateurs, −1…+1 pour les autres) */
  var sc=0,mx=0;I.forEach(function(x){sc+=x.v;mx+=x.w;});
  var ratio=sc/mx,lab=ratio>=.25?["up","ACHETEUR","Les indicateurs penchent plutôt du côté des acheteurs."]:ratio<=-.25?["dn","VENDEUR","Les indicateurs penchent plutôt du côté des vendeurs."]:["neu","NEUTRE","Les indicateurs se contredisent ou restent mitigés : pas de biais net."];
  return {I:I,sc:sc,mx:mx,lab:lab,ratio:ratio};
}
function renderBias(){
  var host=u.$("bias");if(!host)return;
  var b=biasDay();
  if(!b){host.innerHTML='<div class="empty">Calcul du biais du jour…</div>';return;}
  var pos=Math.max(0,Math.min(100,50+b.ratio*50)),gm=FT.brief&&FT.brief.titre&&FT.brief.ts&&Date.now()-FT.brief.ts<8*3600000?FT.brief:null;
  var gcl=gm?({"porteur":"up","plutôt porteur":"up","prudent":"dn","plutôt prudent":"warn","neutre":"neu","mitigé":"warn"}[String(gm.biais||"").toLowerCase()]||"neu"):"neu";
  var chips=b.I.map(function(x){var t=x.v>0?"up":x.v<0?"dn":"neu";return '<div class="bi-c '+t+'"><b>'+esc(x.nom)+'</b><span class="bi-v">'+(x.v>0?"▲ acheteur":x.v<0?"▼ vendeur":"● neutre")+'</span><span class="bi-t">'+esc(x.txt)+'</span></div>';}).join("");
  var out='<div class="bi kc kc-'+b.lab[0]+'"><div class="bi-top"><div class="bi-main"><span class="x-k">Biais du jour · '+esc(IDX[PL.sym].n)+'</span><b class="bi-lab '+b.lab[0]+'">'+b.lab[1]+'</b><span class="bi-sub">'+b.lab[2]+'</span></div>'+
    '<div class="bi-gauge"><div class="bi-g"><i style="left:'+pos.toFixed(1)+'%"></i></div><div class="bi-gl"><span>Vendeur</span><span>Neutre</span><span>Acheteur</span></div><span class="mono bi-sc">Score '+(b.sc>0?"+":b.sc<0?"−":"")+Math.abs(b.sc)+' sur '+b.mx+' possibles</span></div>'+
    (gm?'<div class="bi-ai"><span class="x-k">Lecture IA du jour</span><span class="ctx-bias '+gcl+'">'+esc(gm.biais||"—")+'</span><span class="bi-t">'+esc(gm.titre)+'</span></div>':'')+'</div>'+
    '<div class="bi-cs">'+chips+'</div>'+
    '<p class="x-n bi-n">Comment ça marche : chaque indicateur vote acheteur (▲), vendeur (▼) ou neutre (●). Le prix par rapport aux niveaux d\'hier et les marchés liés (pétrole, taux, dollar, VIX) comptent double, les autres une fois. Le biais est la somme des votes. C\'est un résumé de données pour t\'aider à cadrer ta journée, pas un signal d\'achat ou de vente : à toi de confirmer avec ton propre plan.</p></div>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

/* ---------------- 4. Cette semaine : annonces, résultats et adjudications jour par jour ---------------- */
function dkey(ms){return new Date(ms).toLocaleDateString("en-CA",{timeZone:"Europe/Paris"});}
function renderWeek(){
  var host=u.$("week");if(!host)return;
  var now=Date.now(),wd=new Date(now).toLocaleDateString("en-US",{timeZone:"Europe/Paris",weekday:"short"}),back={Mon:0,Tue:1,Wed:2,Thu:3,Fri:4,Sat:-2,Sun:-1}[wd],days=[];
  for(var i=0;i<5;i++)days.push(now+(i-back)*864e5);
  var today=dkey(now),cal=S.cal||[],R=FT.res&&FT.res.rows||[],A=FT.mk&&FT.mk.auctions&&FT.mk.auctions.rows||[],keep={};
  BIGS.NDX.concat(BIGS.SPX).forEach(function(x){keep[x[0]]=1;});
  if(!cal.length&&!R.length&&!A.length){host.innerHTML='<div class="empty">Chargement de la semaine…</div>';return;}
  var out='<div class="wk-g">'+days.map(function(ms){
    var k=dkey(ms),ev=cal.filter(function(e){return dkey(e.ts)===k&&(e.imp==="hi"||e.imp==="md");}).sort(function(a,b){return a.ts-b.ts;}),
      rs=R.filter(function(r){return r.date===k;}),au=A.filter(function(r){return r.d===k;}),
      hi=ev.some(function(e){return e.imp==="hi";}),tone=hi?"warn":k===today?"up":"acc",
      nm=new Date(ms).toLocaleDateString("fr-FR",{timeZone:"Europe/Paris",weekday:"long",day:"numeric",month:"short"});
    var body=ev.slice(0,7).map(function(e){return '<div class="wk-e'+(e.ts<now?" past":"")+'"><span class="mono">'+hm(e.ts)+'</span><span class="plan-i '+(e.imp==="hi"?"hi":"md")+'" aria-hidden="true"></span><span>'+esc(e.fr||e.t)+'</span></div>';}).join("")+(ev.length>7?'<div class="wk-m">+ '+(ev.length-7)+' autres annonces</div>':'')+
      rs.map(function(r){return '<div class="wk-e wk-r"><span class="mono">résultats</span><span class="plan-i rs" aria-hidden="true"></span><span>'+esc(r.n)+(r.eps!=null&&isFinite(r.eps)?' · BPA att. '+nf(r.eps,2):'')+'</span></div>';}).join("")+
      au.map(function(r){return '<div class="wk-e wk-a"><span class="mono">Trésor</span><span class="plan-i au" aria-hidden="true"></span><span>Adjudication '+esc(r.term)+(r.amt!=null?' · '+nf(r.amt,1)+' Md$':'')+'</span></div>';}).join("");
    return '<div class="kc kc-'+tone+' wk-d'+(k===today?' wk-t':'')+'"><div class="wk-h"><b>'+esc(nm)+'</b>'+(k===today?'<span class="ctx-bias up">Aujourd\'hui</span>':hi?'<span class="ctx-bias warn">Jour chargé</span>':'')+'</div>'+(body||'<div class="wk-q">Rien d\'important au programme.</div>')+'</div>';
  }).join("")+'</div><p class="x-n">Heures de Paris. Les annonces sont celles de l\'agenda économique du Desk (impact fort ou moyen), les résultats ceux des poids lourds (Yahoo Finance) et les adjudications celles du Trésor américain ; une date d\'adjudication peut être décalée d\'un jour. Le détail complet est dans l\'agenda juste en dessous.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

function renderCtx(){
  var host=u.$("ctx");if(!host)return;
  renderBias();renderWeek();
  var sg=seg();if(!CX.ts){host.innerHTML=sg+'<div class="empty">Chargement du contexte…</div>';return;}
  function tile(x){var r=CX.rows[x[2]];if(!r)return '<div class="ctx-t"><span class="x-k">'+esc(x[1])+'</span><b class="mono">—</b></div>';
    var isY=x[0]==="US10Y"||x[0]==="US05Y",v=isY?nf(r.c,3)+" %":px(r.c),c=isY?(function(){var bp=r.c-r.c/(1+(r.ch||0)/100);return (bp>=0?"+":"−")+nf(Math.abs(bp*100),1)+" pb";})():pct(r.ch);
    return '<div class="ctx-t"><span class="x-k">'+esc(x[1])+'</span><b class="mono">'+v+'</b><span class="mono '+u.cls(r.ch)+'">'+c+'</span></div>';}
  var big=BIGS[FT.base(ctxSym())].map(function(x){return {n:x[1],s:x[0],r:CX.rows[x[2]]};}).filter(function(x){return x.r;}).sort(function(a,b){return b.r.ch-a.r.ch;});
  var maxA=Math.max.apply(null,big.map(function(x){return Math.abs(x.r.ch);}).concat([.5]));
  var avg=big.length?big.reduce(function(s,x){return s+x.r.ch;},0)/big.length:null;
  var it=IDXT[ctxSym()],out=sg+'<div class="ctx-grid">'+tile([ctxSym(),it[1],(CX.rows[it[0]]||!FT.is(ctxSym()))?it[0]:FT.M[ctxSym()].big])+CTX.map(tile).join("")+'</div>'+
    '<div class="ctx-cards">'+
    K("brief",briefHTML(),{wide:1})+K("lect",lectHTML(),{wide:1})+
    K("fut",futHTML(),{wide:1,tone:toneFut()})+K("fng",fngHTML())+K("senti",sentiHTML())+K("curve",curveHTML())+
    K("brd",brdHTML(),{wide:1,tone:toneBrd()})+K("cot",cotHTML(),{tone:toneCot()})+
    K("auc",aucHTML(),{tone:toneAuc()})+K("dow",dowHTML(),{wide:1})+K("corr",corrHTML(),{wide:1})+
    K("big",bigHTML(big,avg,maxA),{wide:1,tone:avg==null?"acc":avg>=.3?"up":avg<=-.3?"dn":"neu"})+K("res",resHTML(),{tone:toneRes()})+
    '</div><p class="x-n">VIX et VXN en points ; un VIX qui monte avec l\'indice qui baisse signale un marché sous tension. Le « ? » de chaque carte explique à quoi elle sert.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

CK.plan={week:function(){renderWeek();renderBias();},boot:function(){
  var cx=u.$("ctx");if(cx)cx.addEventListener("click",function(e){var q=e.target.closest("[data-kq]");if(!q)return;var k=q.getAttribute("data-kq");KOPEN[k]=!KOPEN[k];var card=q.closest(".kc");if(card)card.classList.toggle("open",!!KOPEN[k]);q.setAttribute("aria-expanded",!!KOPEN[k]);cx._h=null;});
  ["plan","ctx"].forEach(function(id){var host=u.$(id);if(host)host.addEventListener("click",function(e){var b=e.target.closest("[data-pl]");if(!b)return;PL.sym=b.getAttribute("data-pl");CK.ls("plSym",PL.sym);var p=u.$("plan"),c=u.$("ctx");if(p)p._h=null;if(c)c._h=null;render();renderCtx();});});
  render();renderCtx();
  function lv(){if(CK.xApi)BASES.forEach(function(k){CK.xApi.loadLevels(k);});}
  function op(){if(CK.xApi)BASES.forEach(function(k){CK.xApi.loadOptions(k);});}
  lv();op();BASES.forEach(loadPrev);FT.load(function(){render();renderCtx();});setInterval(function(){FT.load(function(){render();renderCtx();if(CK.xApi&&CK.xApi.renderAll)CK.xApi.renderAll();});},180000);
  setInterval(lv,120000);setInterval(op,600000);setInterval(function(){BASES.forEach(loadPrev);},600000);
  setInterval(function(){if(!document.hidden)loadPx(PL.sym);},10000);
  loadCtx();setInterval(loadCtx,60000);
  setInterval(render,5000);setInterval(renderCtx,15000);
}};
})();
