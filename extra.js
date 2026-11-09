/* ================================================================
   DESK — Niveaux clés, options Deribit, carnet d'ordres agrégé,
   flashs FinancialJuice. Données réelles uniquement, sans clé.
   · Niveaux : bougies OKX (jour/semaine/mois en UTC, 15 min pour les
     sessions Tokyo, Londres, New York).
   · Options : résumé de tous les contrats Deribit (open interest par
     échéance et par prix d'exercice), max pain calculé ici.
   · Carnet : 7 carnets (Binance spot + perp, OKX spot + perp, Coinbase,
     Bitget, Bybit) regroupés par distance au prix (±1,2 %), chaque
     plateforme mesurée par rapport à son propre prix.
   · Flashs : news FinancialJuice à fort impact → pop-up + son.
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,u=CK.u,S=CK.S,esc=u.esc,nf=u.nf;
var OKX="https://www.okx.com",DB="https://www.deribit.com/api/v2/public";
function J(url,ms){return u.fetchJSON(url,null,ms||12000);}
function q(p){return p.catch(function(){return null;});}
function view(){return document.body.getAttribute("data-view");}
function seg(id,cur,L){L=L||[["BTC","BTC"],["ETH","ETH"]];return '<div class="seg" role="group" aria-label="Actif">'+L.map(function(a){var b=a[0];return '<button type="button" data-'+id+'="'+b+'" aria-pressed="'+(b===cur)+'">'+a[1]+'</button>';}).join("")+'</div>';}
function livePx(b){var t=S.tick[b+"-USDT"];return t&&t.last;}

/* ================= Bulle d'aide partagée (data-x) ================= */
var xt=null;
function xtip(){
  xt=document.createElement("div");xt.className="xtip";xt.setAttribute("role","tooltip");document.body.appendChild(xt);
  document.addEventListener("pointerover",function(e){var el=e.target.closest&&e.target.closest("[data-x]");if(!el){xt.classList.remove("on");return;}xt.innerHTML=el.getAttribute("data-x");xt.classList.add("on");});
  document.addEventListener("pointermove",function(e){if(!xt.classList.contains("on"))return;var w=xt.offsetWidth,h=xt.offsetHeight,x=e.clientX+18,y=e.clientY+16;if(x+w>innerWidth-10)x=e.clientX-w-18;if(y+h>innerHeight-10)y=e.clientY-h-16;xt.style.transform="translate("+x+"px,"+y+"px)";},{passive:true});
}
function X(title,body){return ' data-x="'+esc('<b>'+title+'</b><span>'+body+'</span>')+'"';}

/* ================= 1. Niveaux clés ================= */
/* Actifs des niveaux clés : Nasdaq 100 par défaut ; les indices passent par les perpétuels OKX qui les répliquent */
var LASSETS=[["NDX","NASDAQ 100"],["SPX","S&P 500"],["BTC","BTC"],["ETH","ETH"]],IDXL={NDX:"US100-USDT-SWAP",SPX:"SPX-USDT-SWAP"};
var LV={sym:CK.ls("lvSym2")||"NDX",data:{},px:{}};
function lvPx(b){return IDXL[b]?LV.px[b]:livePx(b);}
var LDESC={
  DO:["Ouverture du jour (UTC)","Prix à 00 h 00 UTC. Au-dessus, la journée est acheteuse ; en dessous, vendeuse. Souvent retesté."],
  PDH:["Plus haut d'hier","Résistance classique. Une cassure franche ouvre la voie à la hausse ; un rejet confirme la résistance."],
  PDL:["Plus bas d'hier","Support classique. Le perdre en clôture affaiblit la structure ; les stops sont souvent placés juste en dessous."],
  WO:["Ouverture de la semaine","Prix du lundi 00 h 00 UTC. Repère de tendance hebdomadaire : au-dessus, la semaine est haussière."],
  PWH:["Plus haut semaine dernière","Résistance majeure. Liquidité (stops des vendeurs) souvent placée au-dessus."],
  PWL:["Plus bas semaine dernière","Support majeur. Liquidité (stops des acheteurs) souvent placée en dessous."],
  MO:["Ouverture du mois","Repère de tendance mensuelle, très suivi par les fonds."],
  TKH:["Plus haut Tokyo","Plus haut de la session asiatique. Londres vient souvent chercher la liquidité au-dessus ou en dessous du range asiatique."],
  TKL:["Plus bas Tokyo","Plus bas de la session asiatique."],
  LDH:["Plus haut Londres","Plus haut de la session de Londres. New York le teste souvent."],
  LDL:["Plus bas Londres","Plus bas de la session de Londres."],
  NYH:["Plus haut New York","Plus haut de la session américaine."],
  NYL:["Plus bas New York","Plus bas de la session américaine."]
};
function tzParts(tz,ts){var p={};new Intl.DateTimeFormat("en-US",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(new Date(ts)).forEach(function(x){p[x.type]=x.value;});return p;}
function zoned(tz,y,m,d,h,mi){/* heure locale d'un fuseau → timestamp UTC */var g=Date.UTC(y,m-1,d,h,mi),p=tzParts(tz,g),as=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour%24,+p.minute);return g-(as-g);}
function sessionWin(tz,oh,om,ch,cm,now){var p=tzParts(tz,now),y=+p.year,m=+p.month,d=+p.day,o=zoned(tz,y,m,d,oh,om);
  if(o>now){var pr=tzParts(tz,now-86400000);y=+pr.year;m=+pr.month;d=+pr.day;o=zoned(tz,y,m,d,oh,om);}return [o,zoned(tz,y,m,d,ch,cm)];}
function loadLevels(b){
  var id=IDXL[b]||b+"-USDT";
  return Promise.all([q(J(OKX+"/api/v5/market/candles?instId="+id+"&bar=1Dutc&limit=3")),q(J(OKX+"/api/v5/market/candles?instId="+id+"&bar=1Wutc&limit=2")),
    q(J(OKX+"/api/v5/market/candles?instId="+id+"&bar=1Mutc&limit=1")),q(J(OKX+"/api/v5/market/history-candles?instId="+id+"&bar=15m&limit=100")),q(J(OKX+"/api/v5/market/candles?instId="+id+"&bar=15m&limit=100")),q(J(OKX+"/api/v5/market/ticker?instId="+id))]).then(function(a){
    var tk0=a[5]&&a[5].data&&a[5].data[0];if(tk0&&IDXL[b]&&+tk0.last>0)LV.px[b]=+tk0.last;
    var L=[];function add(k,px,extra){if(px>0)L.push({k:k,px:px,t:extra||""});}
    var D=a[0]&&a[0].data,Wk=a[1]&&a[1].data,M=a[2]&&a[2].data;
    if(D&&D[0])add("DO",+D[0][1]);if(D&&D[1]){add("PDH",+D[1][2]);add("PDL",+D[1][3]);}
    if(Wk&&Wk[0])add("WO",+Wk[0][1]);if(Wk&&Wk[1]){add("PWH",+Wk[1][2]);add("PWL",+Wk[1][3]);}
    if(M&&M[0])add("MO",+M[0][1]);
    /* sessions sur bougies 15 min (≈ 50 h) */
    var C={};[a[3],a[4]].forEach(function(r){((r&&r.data)||[]).forEach(function(c){C[c[0]]=c;});});
    var arr=Object.keys(C).map(function(k){var c=C[k];return {t:+c[0],h:+c[2],l:+c[3]};}),now=Date.now();
    [["TK","Asia/Tokyo",9,0,15,0],["LD","Europe/London",8,0,16,30],["NY","America/New_York",9,30,16,0]].forEach(function(s){
      var w=sessionWin(s[1],s[2],s[3],s[4],s[5],now),hi=0,lo=Infinity;arr.forEach(function(c){if(c.t>=w[0]&&c.t<w[1]){hi=Math.max(hi,c.h);lo=Math.min(lo,c.l);}});
      var live=now<w[1];if(hi>0){add(s[0]+"H",hi,live?"en cours":"");add(s[0]+"L",lo,live?"en cours":"");}});
    LV.data[b]={L:L,ts:Date.now()};CK.levels=LV;renderLevels();if(CK.liqmap)CK.liqmap.render();
  });
}
function renderLevels(){
  var host=u.$("levels");if(!host)return;var b=LV.sym,d=LV.data[b],p=lvPx(b);
  if(!d||!p){host.innerHTML=seg("lv",b,LASSETS)+'<div class="empty">Calcul des niveaux…</div>';return;}
  var L=d.L.slice().sort(function(x,y){return y.px-x.px;}),html="",placed=false;
  L.forEach(function(x){var dd=(x.px/p-1)*100,ds=LDESC[x.k];
    if(!placed&&x.px<p){html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+u.px(p)+'</b></div>';placed=true;}
    var near=Math.abs(dd)<.35;
    html+='<div class="lv-r '+(x.px>p?"ab":"be")+(near?" near":"")+'"'+X(ds[0],ds[1]+(x.t?" (session "+x.t+")":"")+" Distance : "+(dd>0?"+":"")+nf(dd,2)+" %.")+'>'+
      '<span class="lv-tag">'+x.k+'</span><span class="lv-n">'+ds[0]+(x.t?' <em>'+x.t+'</em>':'')+'</span><b class="mono">'+u.px(x.px)+'</b><span class="lv-d mono">'+(dd>0?"+":"")+nf(dd,2)+' %</span></div>';});
  if(!placed)html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+u.px(p)+'</b></div>';
  var out=seg("lv",b,LASSETS)+'<div class="lv-list">'+html+'</div><p class="x-n">Survole un niveau pour son explication. Les niveaux à moins de 0,35 % du prix sont mis en avant. Sessions : Tokyo 9 h–15 h, Londres 8 h–16 h 30, New York 9 h 30–16 h (heures locales).'+(IDXL[b]?' Indice suivi via le perpétuel OKX '+IDXL[b]+' : « jour » = 00 h UTC, pas l\'ouverture de Wall Street.':'')+'</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

/* ================= 2. Options Deribit ================= */
var OASSETS=[["NDX","NASDAQ 100"],["SPX","S&P 500"],["BTC","BTC"],["ETH","ETH"]];
var OP={sym:CK.ls("opSym2")||"NDX",data:{}};
/* Options sur indices : lues par le robot GitHub (options.py, Yahoo Finance) et publiées dans data/options.json */
function loadOptionsIdx(b){
  var url=CK.relay&&CK.relay("/options");
  if(!url){OP.data[b]={err:"Adresse du robot (data dans config.js) non réglée."};renderOptions();return Promise.resolve();}
  return q(J(url+"?t="+Math.floor(Date.now()/60000),12000)).then(function(j){
    var I=j&&j.idx&&j.idx[b];
    if(!I||!I.exp||!I.exp.length){OP.data[b]={err:j?"Le robot n'a pas encore de données pour cet indice.":"Fichier options.json introuvable sur le robot."};renderOptions();return;}
    var list=I.exp.map(function(e){return {ts:e.ts,code:e.date,c:e.c,p:e.p,oi:e.c+e.p,usd:e.usd,pcr:e.pcr,mp:e.mp};}).filter(function(e){return e.ts>Date.now()-86400000;}).sort(function(x,y){return x.ts-y.ts;});
    OP.data[b]={list:list,calls:I.calls||[],puts:I.puts||[],px:I.spot,mult:I.mult||100,idx:true,ts:Date.now(),src:j.ts||I.ts};
    CK.options=OP;renderOptions();
  });
}
var MON={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
function expTs(code){var m=code.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);return m?Date.UTC(2000+ +m[3],MON[m[2]],+m[1],8,0):0;}
function loadOptions(b){
  if(IDXL[b])return loadOptionsIdx(b);
  return q(J(DB+"/get_book_summary_by_currency?currency="+b+"&kind=option",15000)).then(function(j){
    var R=j&&j.result;if(!R||!R.length)return;var E={},K={},und=0,now=Date.now();
    R.forEach(function(x){var p=x.instrument_name.split("-");if(p.length<4)return;var ts=expTs(p[1]),k=+p[2],put=p[3]==="P",oi=+x.open_interest||0;if(!ts||ts<now-3600000)return;und=+x.underlying_price||und;
      var e=E[ts]||(E[ts]={ts:ts,code:p[1],c:0,p:0,S:{}});if(put)e.p+=oi;else e.c+=oi;var s=e.S[k]||(e.S[k]={c:0,p:0});if(put)s.p+=oi;else s.c+=oi;
      var kk=K[k]||(K[k]={c:0,p:0});if(put)kk.p+=oi;else kk.c+=oi;});
    var px=livePx(b)||und;
    var list=Object.keys(E).map(function(t){var e=E[t],ks=Object.keys(e.S).map(Number).sort(function(a,b){return a-b;}),best=null,bv=Infinity;
      ks.forEach(function(P){var v=0;ks.forEach(function(k){var s=e.S[k];if(P>k)v+=s.c*(P-k);if(P<k)v+=s.p*(k-P);});if(v<bv){bv=v;best=P;}});
      return {ts:e.ts,code:e.code,c:e.c,p:e.p,oi:e.c+e.p,usd:(e.c+e.p)*px,pcr:e.c?e.p/e.c:null,mp:best};}).sort(function(a,b){return a.ts-b.ts;});
    var strikes=Object.keys(K).map(function(k){return {k:+k,c:K[k].c,p:K[k].p};});
    OP.data[b]={list:list,calls:strikes.slice().sort(function(a,b){return b.c-a.c;}).slice(0,4),puts:strikes.slice().sort(function(a,b){return b.p-a.p;}).slice(0,4),px:px,ts:Date.now()};
    CK.options=OP;renderOptions();
  });
}
function fmtDate(ts){return new Date(ts).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",timeZone:"Europe/Paris"});}
function renderOptions(){
  var host=u.$("opts");if(!host)return;var b=OP.sym,d=OP.data[b];
  if(!d){host.innerHTML=seg("op",b,OASSETS)+'<div class="empty">'+(IDXL[b]?'Lecture des options du robot…':'Lecture des options Deribit…')+'</div>';return;}
  if(d.err){host.innerHTML=seg("op",b,OASSETS)+'<div class="empty">'+esc(d.err)+' Les options sur indices demandent votre propre robot GitHub (voir CLAUDE.md, section « Le robot »).</div>';return;}
  var m=d.mult||1,unit=d.idx?"contrats":b,px=(d.idx?lvPx(b):livePx(b))||d.px,now=Date.now(),big=d.list.slice().sort(function(a,b){return b.usd-a.usd;})[0];
  var rows=d.list.slice(0,6).map(function(e){var mp=e.mp?(e.mp/px-1)*100:null,isBig=big&&e.ts===big.ts,ms=e.ts-now;
    var tip=X("Échéance du "+fmtDate(e.ts)+" à "+u.parisTime(e.ts),
      u.usd(e.usd)+" d'options expirent ("+nf(e.c,0)+" calls, "+nf(e.p,0)+" puts en "+unit+"). "+
      (e.mp?"Max pain à "+u.px(e.mp)+" ("+(mp>0?"+":"")+nf(mp,1)+" %) : le prix auquel le plus d'options expirent sans valeur. Avant les grosses échéances, le prix a tendance à graviter vers ce niveau. ":"")+
      (e.pcr!=null?"Put/call "+nf(e.pcr,2)+(e.pcr>1?" : plus de protections à la baisse que de paris haussiers.":e.pcr<.6?" : les paris haussiers dominent.":" : équilibré."):""));
    return '<div class="op-r'+(isBig?" big":"")+'"'+tip+'><span class="op-dt"><b>'+fmtDate(e.ts)+'</b><em>'+(ms<86400000?"dans "+u.clock(ms).replace(/:\d\d$/,""):"dans "+Math.round(ms/86400000)+" j")+'</em></span>'+
      '<span class="op-v mono">'+u.usd(e.usd)+'</span><span class="op-bar"><i style="width:'+(big?Math.max(3,e.usd/big.usd*100):0).toFixed(1)+'%"></i></span>'+
      '<span class="op-mp mono">'+(e.mp?u.px(e.mp):"—")+'<em class="'+(mp==null?"":mp>0?"up":"down")+'">'+(mp==null?"":(mp>0?"+":"")+nf(mp,1)+" %")+'</em></span><span class="op-pc mono">'+(e.pcr!=null?nf(e.pcr,2):"—")+'</span></div>';}).join("");
  function wall(arr,put){return arr.map(function(s){var v=put?s.p:s.c,dd=(s.k/px-1)*100;
    return '<span class="op-w '+(put?"p":"c")+'"'+X((put?"Mur de puts":"Mur de calls")+" à "+u.px(s.k),nf(v,0)+" "+unit+" d'open interest ("+u.usd(v*m*px)+"), toutes échéances. "+(put?"Les vendeurs de ces puts se couvrent en vendant si le prix s'en approche : zone de support souvent défendue, mais qui peut accélérer la baisse si elle cède.":"Les vendeurs de ces calls se couvrent en achetant si le prix monte : zone de résistance souvent défendue, mais qui peut accélérer la hausse si elle cède."))+'>'+
      '<b class="mono">'+u.px(s.k)+'</b><em>'+u.usd(v*m*px)+' · '+(dd>0?"+":"")+nf(dd,1)+' %</em></span>';}).join("");}
  var out=seg("op",b,OASSETS)+'<div class="op-h"><span>Échéance</span><span>Notionnel</span><span></span><span>Max pain</span><span>Put/call</span></div><div class="op-l">'+rows+'</div>'+
    '<div class="op-ws"><div><span class="x-k">Murs de calls (résistances)</span>'+wall(d.calls,false)+'</div><div><span class="x-k">Murs de puts (supports)</span>'+wall(d.puts,true)+'</div></div>'+
    (d.idx?'<p class="x-n">Options sur l\'indice '+(b==="NDX"?"Nasdaq 100, lues sur l\'ETF QQQ (très liquide) et converties en points de l\'indice":"S&P 500 (^SPX)")+', par le robot sur Yahoo Finance : open interest de la veille, prix différé. Notionnel en dollars réels. Prix de référence : perpétuel OKX en direct (écart possible avec l\'indice). Ce ne sont pas les options sur futures du CME. Survole une ligne pour son explication.</p>':'<p class="x-n">Options Deribit (environ 85 % du marché des options crypto). Expirations à 8 h UTC. Survole une ligne pour son explication.</p>');
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

/* ================= 3. Carnet d'ordres agrégé ================= */
var BK={sym:CK.ls("bkSym")||"BTC",data:{},cb:{},cbT:{}},STEP=.1,SPAN=1.2,NBK=Math.round(SPAN/STEP);
var VEN=[["bnS","Binance spot"],["bnP","Binance perp"],["okS","OKX spot"],["okP","OKX perp"],["cb","Coinbase"],["bg","Bitget perp"],["by","Bybit perp"]];
function bucketize(bids,asks,mul,acc,ven){
  if(!bids||!asks||!bids.length||!asks.length)return null;var mid=(+bids[0][0]+ +asks[0][0])/2,cov=0;
  function side(arr,isB){arr.forEach(function(r){var p=+r[0],s=+r[1]*mul,dd=(p/mid-1)*100,i=Math.floor(Math.abs(dd)/STEP);if(i>=NBK)return;var B=(isB?acc.b:acc.a)[i];B.v+=p*s;B.x[ven]=(B.x[ven]||0)+p*s;cov=Math.max(cov,Math.abs(dd));});}
  side(bids,true);side(asks,false);return Math.min(SPAN,cov);
}
function loadBook(b){
  var s=b+"USDT",now=Date.now(),okCt=(S.ct&&S.ct[b+"-USDT-SWAP"]&&S.ct[b+"-USDT-SWAP"].ctVal)||(b==="BTC"?.01:.1);
  var needCB=!BK.cbT[b]||now-BK.cbT[b]>60000;
  return Promise.all([q(J("https://api.binance.com/api/v3/depth?symbol="+s+"&limit=5000")),q(J("https://fapi.binance.com/fapi/v1/depth?symbol="+s+"&limit=1000")),
    q(J(OKX+"/api/v5/market/books-full?instId="+b+"-USDT&sz=5000")),q(J(OKX+"/api/v5/market/books-full?instId="+b+"-USDT-SWAP&sz=5000")),
    needCB?q(J("https://api.exchange.coinbase.com/products/"+b+"-USD/book?level=2",20000)):Promise.resolve(null),
    q(J("https://api.bitget.com/api/v2/mix/market/merge-depth?symbol="+s+"&productType=usdt-futures&precision=scale2&limit=max")),
    q(J("https://api.bybit.com/v5/market/orderbook?category=linear&symbol="+s+"&limit=1000"))]).then(function(a){
    if(a[4]&&a[4].bids){BK.cb[b]=a[4];BK.cbT[b]=Date.now();}
    var acc={b:[],a:[]};for(var i=0;i<NBK;i++){acc.b.push({v:0,x:{}});acc.a.push({v:0,x:{}});}
    var cov={},o2=function(j){return j&&j.data&&j.data[0];};
    cov.bnS=a[0]?bucketize(a[0].bids,a[0].asks,1,acc,"bnS"):null;
    cov.bnP=a[1]?bucketize(a[1].bids,a[1].asks,1,acc,"bnP"):null;
    var ok1=o2(a[2]),ok2=o2(a[3]);cov.okS=ok1?bucketize(ok1.bids,ok1.asks,1,acc,"okS"):null;cov.okP=ok2?bucketize(ok2.bids,ok2.asks,okCt,acc,"okP"):null;
    var cb=BK.cb[b];cov.cb=cb?bucketize(cb.bids,cb.asks,1,acc,"cb"):null;
    var bg=a[5]&&a[5].data;cov.bg=bg?bucketize(bg.bids,bg.asks,1,acc,"bg"):null;
    var by=a[6]&&a[6].result;cov.by=by?bucketize(by.b,by.a,1,acc,"by"):null;
    BK.data[b]={acc:acc,cov:cov,ts:Date.now()};renderBook();
  });
}
function vlist(x){return VEN.filter(function(v){return x[v[0]]>0;}).sort(function(p,q){return x[q[0]]-x[p[0]];}).map(function(v){return v[1]+" "+u.usd(x[v[0]]);}).join(" · ");}
function renderBook(){
  var host=u.$("book");if(!host)return;var b=BK.sym,d=BK.data[b],p=livePx(b);
  if(!d){host.innerHTML=seg("bk",b)+'<div class="empty">Lecture des carnets…</div>';return;}
  var A=d.acc,mx=0,sum=function(arr,n){var t=0;for(var i=0;i<n;i++)t+=arr[i].v;return t;};
  A.b.concat(A.a).forEach(function(x){if(x.v>mx)mx=x.v;});
  var b5=sum(A.b,5),a5=sum(A.a,5),b10=sum(A.b,NBK),a10=sum(A.a,NBK),im5=b5+a5?b5/(b5+a5)*100:50,im10=b10+a10?b10/(b10+a10)*100:50;
  /* Murs : hors tranche collée au prix, et seulement avec les carnets qui couvrent toute la zone (comparaison à périmètre égal) */
  var wv=function(x){return x.v-(x.x.bnP||0)-(x.x.by||0);},wb=1,wa=1;
  /* Un mur = une tranche nettement plus chargée que ses voisines (la densité baisse naturellement en s'éloignant du prix) */
  function pick(arr){var best=2,bs=0;for(var j=2;j<NBK-1;j++){var n=[],k;for(k=Math.max(1,j-2);k<=Math.min(NBK-1,j+2);k++)if(k!==j)n.push(wv(arr[k]));
      var avg=n.length?n.reduce(function(s,x){return s+x;},0)/n.length:0,sc=avg>0?wv(arr[j])/avg:0;if(sc>bs){bs=sc;best=j;}}return {i:best,sc:bs};}
  var pb=pick(A.b),pa=pick(A.a);wb=pb.i;wa=pa.i;
  var pxAt=function(i,bid){return p?p*(1+(bid?-1:1)*(i+.5)*STEP/100):null;};
  function row(x,i,bid){var lab=(bid?"−":"+")+nf((i+1)*STEP,1)+" %",pp=pxAt(i,bid),wall=(bid&&i===wb)||(!bid&&i===wa);
    return '<div class="bk-r '+(bid?"bid":"ask")+(wall?" wall":"")+'"'+X((bid?"Ordres d'achat":"Ordres de vente")+" entre "+(bid?"−":"+")+nf(i*STEP,1)+" et "+lab+(pp?" (≈ "+u.px(pp)+")":""),
      u.usd(x.v)+" posés sur 7 carnets. "+(wall?(bid?"Mur d'achat : "+nf(pb.sc,1)+"× plus d'ordres que les tranches voisines. Il peut freiner une baisse, tant qu'il n'est pas retiré ou consommé.":"Mur de vente : "+nf(pa.sc,1)+"× plus d'ordres que les tranches voisines. Il peut freiner une hausse, tant qu'il n'est pas retiré ou absorbé."):"")+"<br>"+vlist(x.x))+'>'+
      '<span class="bk-p mono">'+(pp?u.px(pp):lab)+'</span><span class="bk-b"><i style="width:'+(mx?x.v/mx*100:0).toFixed(1)+'%"></i></span><span class="bk-v mono">'+u.usd(x.v)+'</span></div>';}
  var asks=A.a.map(function(x,i){return row(x,i,false);}).reverse().join(""),bids=A.b.map(function(x,i){return row(x,i,true);}).join("");
  var covTxt=VEN.map(function(v){var c=d.cov[v[0]];return c!=null?v[1]+" ±"+nf(c,2)+" %":null;}).filter(Boolean).join(" · ");
  function imb(v,lab){var c=v>55?"up":v<45?"down":"";return '<div class="bk-i"'+X("Déséquilibre "+lab,"Part des ordres d'achat dans le carnet agrégé "+lab+" autour du prix. Au-dessus de 55 % : plus d'acheteurs en attente (soutien). Sous 45 % : plus de vendeurs (pression). Les gros ordres peuvent être retirés à tout moment : à lire comme une tendance, pas une garantie.")+'><span class="x-k">Acheteurs '+lab+'</span><b class="mono '+c+'">'+nf(v,0)+' %</b><span class="bk-ib"><i style="width:'+nf(v,1).replace(",",".")+'%"></i></span></div>';}
  var out=seg("bk",b)+'<div class="bk-st">'+imb(im5,"±0,5 %")+imb(im10,"±1,2 %")+
    '<div class="bk-i"'+X("Plus gros mur d'achat","Tranche sous le prix (au-delà de 0,1 %) la plus chargée par rapport à ses voisines, sur les 5 carnets qui couvrent toute la zone. Le « ×» indique combien de fois plus que les tranches voisines. Il peut freiner une baisse tant qu'il n'est pas retiré ou consommé.")+'><span class="x-k">Mur d\'achat</span><b class="mono up">'+(p?u.px(pxAt(wb,true)):"—")+'</b><em>'+u.usd(wv(A.b[wb]))+' · −'+nf((wb+.5)*STEP,2)+' % · ×'+nf(pb.sc,1)+'</em></div>'+
    '<div class="bk-i"'+X("Plus gros mur de vente","Tranche au-dessus du prix (au-delà de 0,1 %) la plus chargée par rapport à ses voisines, sur les 5 carnets qui couvrent toute la zone. Le « ×» indique combien de fois plus que les tranches voisines. Il peut freiner une hausse tant qu'il n'est pas retiré ou absorbé.")+'><span class="x-k">Mur de vente</span><b class="mono down">'+(p?u.px(pxAt(wa,false)):"—")+'</b><em>'+u.usd(wv(A.a[wa]))+' · +'+nf((wa+.5)*STEP,2)+' % · ×'+nf(pa.sc,1)+'</em></div></div>'+
    '<div class="bk-lad">'+asks+'<div class="bk-mid"><span>Prix</span><b class="mono">'+(p?u.px(p):"—")+'</b><em>mis à jour '+u.ago(d.ts)+'</em></div>'+bids+'</div>'+
    '<p class="x-n">7 carnets réels agrégés par distance au prix (tranches de 0,1 %). Couverture : '+esc(covTxt)+'. Les perpétuels Binance et Bybit ne publient que les ordres les plus proches.</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

/* ================= 4. Flashs FinancialJuice ================= */
/* FinancialJuice ne marque pas ses news rouges dans le flux RSS : on les reconnaît à leur contenu
   (chiffres macro publiés, banques centrales, annonces officielles, événements géopolitiques majeurs). */
var FLASH=/(\bactual\b|\bbreaking\b|rate decision|rates? (unchanged|cut|hike)|\bholds? rates\b|fomc statement|powell|lagarde|ueda|\bbank of japan\b|\bboj\b.*(rate|hike|policy)|\becb\b.*(rate|decision)|emergency|\bmissile|\bairstrike|\binvad|ceasefire|\bnuclear\b|declares? war|\bsanctions? on\b|tariffs? (on|of)\b|\bsec (approves|sues|charges)|\betf (approv|reject)|\bhalts? trading|default|downgrade)/i;
var flashOn=CK.ls("flash")!=="0",seen={},boot0=0,queue=[],showing=false,box=null,PAGE0=Date.now();
CK.flash={on:function(){return flashOn;},set:function(v){flashOn=!!v;CK.ls("flash",v?"1":"0");}};
function key(x){return x.title+"|"+x.ts;}
CK.onNews=function(items){
  var now=Date.now();
  if(!boot0||now-PAGE0<25000){boot0=boot0||now;items.forEach(function(x){seen[key(x)]=1;});return;}
  items.slice(0,15).forEach(function(x){var k=key(x);if(seen[k])return;seen[k]=1;if(!flashOn||!FLASH.test(x.title)||(x.ts&&now-x.ts>15*60000))return;queue.push(x);});
  if(queue.length){if(CK.trNow)CK.trNow(queue);pump();}
};
/* Fil crypto : listings, piratages, ETF, faillites, achats de BTC, dépeg… */
var CFLASH=/(^BREAKING|will list|new listing|launchpool|will delist|\bhack(ed)?\b|exploit|drained|stolen|insolven|bankrupt|withdrawals? (halt|suspend|paus)|depeg|etf (approv|reject|launch)|strategic (bitcoin |crypto )?reserve|(buys?|bought|acquires?|purchases?) [\d,.]+ (bitcoin|btc)|sec (approves|sues|charges|drops)|liquidat\w* .*(billion|\$\d))/i;
var wseen={},wboot=0;
CK.onWire=function(items){
  var now=Date.now();
  if(!wboot||now-PAGE0<25000){wboot=wboot||now;items.forEach(function(x){wseen[key(x)]=1;});return;}
  items.slice(0,15).forEach(function(x){var k=key(x);if(wseen[k])return;wseen[k]=1;if(!flashOn||!CFLASH.test(x.title)||(x.ts&&now-x.ts>10*60000))return;queue.push(x);});
  if(queue.length){if(CK.trNow)CK.trNow(queue);pump();}
};
function pump(){
  if(showing||!queue.length)return;showing=true;var x=queue.shift();
  if(!box){box=document.createElement("div");box.className="flash-wrap";box.setAttribute("aria-live","assertive");document.body.appendChild(box);}
  var fr=CK.trGet&&CK.trGet(x.title),c=document.createElement("a");c.className="flash";c.href=u.safeUrl(x.link);c.target="_blank";c.rel="noopener noreferrer";
  c.innerHTML='<span class="fl-k"><i></i>Flash · '+esc(x.fsrc||"FinancialJuice")+'<em>'+u.parisTime(x.ts||Date.now())+'</em></span><b>'+esc(fr||x.title)+'</b>'+(fr?'<span class="fl-o">'+esc(x.title)+'</span>':'')+'<button type="button" class="fl-x" aria-label="Fermer">×</button><span class="fl-t"></span>';
  box.appendChild(c);if(CK.sfx&&CK.sfx.news)CK.sfx.news();
  function close(){if(c._c)return;c._c=1;c.classList.add("out");setTimeout(function(){c.remove();showing=false;pump();},350);}
  c.querySelector(".fl-x").addEventListener("click",function(e){e.preventDefault();e.stopPropagation();close();});
  var t=setTimeout(close,14000);c.addEventListener("pointerenter",function(){clearTimeout(t);c.classList.add("hold");});c.addEventListener("pointerleave",function(){c.classList.remove("hold");t=setTimeout(close,5000);});
  /* traduction arrivée entre-temps */
  setTimeout(function(){var f2=CK.trGet&&CK.trGet(x.title);if(f2&&!fr){c.querySelector("b").textContent=f2;var o=document.createElement("span");o.className="fl-o";o.textContent=x.title;c.querySelector("b").after(o);}},2500);
}
CK.flashTest=function(){var t={title:"US CPI YoY Actual 3.4% (Forecast 3.1%, Previous 3.2%)",ts:Date.now(),link:"https://www.financialjuice.com"};queue.push(t);pump();};

/* ================= 5. Corrélations sur 30 jours ================= */
/* Variations quotidiennes (log), jours communs uniquement ; indices et or : séances de semaine seulement. */
var CR={};CK.corr=CR;
var CSER=[
  {k:"NDX",n:"Nasdaq 100",src:"okx",id:"US100-USDT-SWAP",tf:1,d:"Le Nasdaq 100 regroupe les grandes valeurs tech américaines. Une corrélation forte veut dire que le BTC se comporte comme une action tech : il réagit aux mêmes nouvelles (taux, résultats, appétit pour le risque)."},
  {k:"SPX",n:"S&P 500",src:"okx",id:"SPX-USDT-SWAP",tf:1,d:"Le S&P 500 est la bourse américaine dans son ensemble. Corrélation forte : le BTC suit le sentiment global du marché actions."},
  {k:"XAU",n:"Or",src:"okx",id:"XAU-USDT-SWAP",tf:1,d:"L'or est la valeur refuge classique. Une corrélation positive soutient l'idée du BTC « or numérique » ; proche de zéro, le BTC se comporte plutôt comme un actif risqué."},
  {k:"USD",n:"Dollar (EUR/USD inversé)",src:"bn",id:"EURUSDT",tf:1,inv:true,d:"Mesuré via l'EUR/USD inversé (l'euro pèse 58 % de l'indice DXY). Une corrélation négative est la norme : quand le dollar monte, le BTC baisse."},
  {k:"ETH",n:"Ethereum",src:"okx",id:"ETH-USDT",tf:0,d:"Le n° 2 de la crypto. Corrélation très forte en général ; quand elle baisse, ETH vit sa propre histoire (rotation, nouvelles propres)."}
];
function dayKey(ts){return Math.floor(ts/86400000);}
function loadSer(s){var url=s.src==="okx"?OKX+"/api/v5/market/candles?instId="+s.id+"&bar=1Dutc&limit=130":"https://api.binance.com/api/v3/klines?symbol="+s.id+"&interval=1d&limit=130";
  return q(J(url)).then(function(j){var m={};if(s.src==="okx")((j&&j.data)||[]).forEach(function(c){if(c[8]==="1")m[dayKey(+c[0])]=+c[4];});else (j||[]).forEach(function(c){if(+c[6]<Date.now())m[dayKey(+c[0])]=+c[4];});return m;});}
function pearson(a,b){var n=a.length;if(n<10)return null;var ma=0,mb=0,i;for(i=0;i<n;i++){ma+=a[i];mb+=b[i];}ma/=n;mb/=n;var sab=0,saa=0,sbb=0;for(i=0;i<n;i++){var x=a[i]-ma,y=b[i]-mb;sab+=x*y;saa+=x*x;sbb+=y*y;}return saa&&sbb?sab/Math.sqrt(saa*sbb):null;}
function loadCorr(){
  return Promise.all([loadSer({src:"okx",id:"BTC-USDT"})].concat(CSER.map(loadSer))).then(function(a){var btc=a[0];
    CSER.forEach(function(s,i){var o=a[i+1];var days=Object.keys(o).map(Number).filter(function(d){if(btc[d]==null)return false;if(!s.tf)return true;var wd=new Date(d*86400000).getUTCDay();return wd>0&&wd<6;}).sort(function(x,y){return x-y;});
      var rb=[],ro=[];for(var k=1;k<days.length;k++){var d0=days[k-1],d1=days[k],x=Math.log(o[d1]/o[d0]);if(s.tf&&x===0)continue;rb.push(Math.log(btc[d1]/btc[d0]));ro.push(s.inv?-x:x);}
      var c30=pearson(rb.slice(-30),ro.slice(-30)),c90=rb.length>=60?pearson(rb.slice(-90),ro.slice(-90)):null,roll=[];
      for(var e=Math.max(30,rb.length-40);e<=rb.length;e++)roll.push(pearson(rb.slice(e-30,e),ro.slice(e-30,e)));
      CR[s.k]={c30:c30,c90:c90,roll:roll,n:Math.min(30,rb.length),len:rb.length};});
    CR.ts=Date.now();renderCorr();
  });
}
function cLabel(c){if(c==null)return ["—","neu"];var a=Math.abs(c),s=c>0?"positive":"négative";return a>=.6?["Forte "+s,c>0?"pos":"neg"]:a>=.3?["Modérée "+s,c>0?"pos":"neg"]:["Faible","neu"];}
CK.corrText=function(k){var c=CR[k];if(!c||c.c30==null)return "";var l=cLabel(c.c30);return "Corrélation 30 j avec le BTC : "+nf(c.c30,2)+" ("+l[0].toLowerCase()+").";};
function renderCorr(){
  var host=u.$("corr");if(!host)return;if(!CR.ts){host.innerHTML='<div class="empty">Calcul des corrélations…</div>';return;}
  var rows=CSER.map(function(s){var c=CR[s.k]||{},l=cLabel(c.c30),pos=c.c30!=null?(c.c30+1)/2*100:50;
    var sp="";if(c.roll&&c.roll.length>2){var R=c.roll.filter(function(v){return v!=null;}),k=R.length-1;sp='<svg class="cr-sp" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="100" y1="15" y2="15"/><polyline points="'+R.map(function(v,i){return (i/k*100).toFixed(1)+","+(15-v*13).toFixed(1);}).join(" ")+'"/></svg>';}
    var chg=c.roll&&c.roll.length>10&&c.c30!=null&&c.roll[0]!=null?c.c30-c.roll[0]:null;
    return '<div class="cr-r"'+X(s.n+" · corrélation avec le BTC",s.d+" Sur "+(c.n||30)+" séances communes : "+(c.c30!=null?nf(c.c30,2):"—")+" ; sur 90 : "+(c.c90!=null?nf(c.c90,2):"historique trop court")+(chg!=null?" ; elle a "+(chg>0?"monté":"baissé")+" de "+nf(Math.abs(chg),2)+" en 10 séances.":".")+" Échelle de −1 (sens opposés) à +1 (même sens) ; autour de 0 : pas de lien.")+'>'+
      '<span class="cr-n"><b>'+s.n+'</b><em class="'+l[1]+'">'+l[0]+(c.n&&c.n<30?' · '+c.n+' séances seulement':'')+'</em></span><b class="cr-v mono '+l[1]+'">'+(c.c30!=null?(c.c30>0?"+":"")+nf(c.c30,2):"—")+'</b>'+
      '<span class="cr-sc"><i class="z"></i><i class="m '+l[1]+'" style="left:'+pos.toFixed(1)+'%"></i></span><span class="cr-90 mono">90 j '+(c.c90!=null?(c.c90>0?"+":"")+nf(c.c90,2):"—")+'</span>'+sp+'</div>';}).join("");
  var out='<div class="cr-h"><span>Actif</span><span>30 séances</span><span>−1 · 0 · +1</span><span>90 séances</span><span>Évolution</span></div>'+rows+
    '<p class="x-n">Corrélation des variations quotidiennes avec le BTC, sur les jours où les deux marchés cotent (séances de semaine pour les indices et l\'or). Indices et or via les perpétuels OKX qui les répliquent ; dollar via l\'EUR/USD inversé (Binance).</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

/* ================= Démarrage ================= */
CK.extra={boot:function(){
  xtip();
  [["levels","lv",LV,"lvSym2",renderLevels,loadLevels],["opts","op",OP,"opSym2",renderOptions,loadOptions],["book","bk",BK,"bkSym",renderBook,loadBook]].forEach(function(m){
    var host=u.$(m[0]);if(!host)return;host.addEventListener("click",function(e){var b=e.target.closest("[data-"+m[1]+"]");if(!b)return;m[2].sym=b.getAttribute("data-"+m[1]);CK.ls(m[3],m[2].sym);host._h=null;m[4]();if(!m[2].data[m[2].sym])m[5](m[2].sym);});m[4]();});
  loadLevels(LV.sym);setInterval(function(){loadLevels(LV.sym);},120000);setInterval(renderLevels,5000);
  /* le BTC reste chargé en fond : la carte des liquidations s'en sert */
  if(LV.sym!=="BTC"){loadLevels("BTC");setInterval(function(){if(LV.sym!=="BTC")loadLevels("BTC");},120000);}
  /* prix des indices : relevé toutes les 10 s (pas de flux en direct pour eux) */
  setInterval(function(){[LV.sym,OP.sym].forEach(function(b,i,a){if(!IDXL[b]||a.indexOf(b)!==i)return;q(J(OKX+"/api/v5/market/ticker?instId="+IDXL[b],8000)).then(function(r){var t=r&&r.data&&r.data[0];if(t&&+t.last>0){LV.px[b]=+t.last;renderLevels();}});});},10000);
  loadOptions(OP.sym);setInterval(function(){loadOptions(OP.sym);},600000);setInterval(renderOptions,30000);
  loadCorr();setInterval(loadCorr,3600000);
  function bk(){var v=view();if(v==="liq"||!CK.FLOW)loadBook(BK.sym);}bk();setInterval(bk,20000);
  /* À l'ouverture de l'espace Liquidations : lecture immédiate, sans attendre le prochain cycle */
  var bkV=view();setInterval(function(){var v=view();if(v!==bkV){bkV=v;if(v==="liq"&&!BK.data[BK.sym])bk();}},800);setInterval(function(){if(BK.data[BK.sym])renderBook();},5000);
}};
})();
