/* ================================================================
   AGENT IA — l'affichage de l'agent du Desk
   ----------------------------------------------------------------
   L'agent lui-même tourne sur le relais Cloudflare du Desk
   (relais/desk-news-worker.js). Toutes les minutes il mesure le marché ;
   toutes les 30 min (et tout de suite sur un événement important ou à
   la demande) l'IA écrit une LECTURE : ce qui se passe, pourquoi, un
   scénario haussier et un baissier par actif, ce qui invaliderait tout.
   Un seul agent pour tous les utilisateurs : personne n'a de clé à mettre.
   Ce fichier affiche :
   1. la lecture du marché en cours, puis les lectures précédentes
      avec ce que leurs scénarios ont donné ;
   2. des cartes vivantes (BTC, ETH, SOL, dollar) avec graphiques et niveaux ;
   3. le Bilan (cibles atteintes) et l'onglet Conso (appels à chaque IA).
   ================================================================ */
(function(){
"use strict";
var CK=window.CK,S=CK.S,u=CK.u,esc=u.esc,nf=u.nf;

/* ====================== RÉGLAGES ====================== */
var REGLAGES={
  actifs:["BTC","ETH","SOL"],
  macro:{DXY:"TVC:DXY",TAUX_10A:"TVC:US10Y",NASDAQ:"NASDAQ:NDX",PETROLE:"FX:USOIL",OR:"TVC:GOLD"},
  notifier:2          // importance à partir de laquelle un message te notifie (1 à 3), réglable dans l'agent
};
var OKX="https://www.okx.com";
var TF_OKX={"1m":"1m","5m":"5m","15m":"15m","1H":"1H","4H":"4H","1D":"1Dutc"};
var TF_NOM={"1m":"1 min","5m":"5 min","15m":"15 min","1H":"1 h","4H":"4 h","1D":"jour"};
var REFRESH={"1m":0,"5m":0,"15m":0,"1H":3e5,"4H":9e5,"1D":9e5};

/* ---------------- État ---------------- */
var V={ch:{},tf:CK.lsj("agent:tf")||{},k:{},kt:{},oi:{},fund:{},mac:{},macH:[],tab:/^(conso|bilan)$/.test(CK.ls("agentTab")||"")?CK.ls("agentTab"):"live",filtre:CK.ls("agentFiltre")||"imp",actif:"",seen:null,fresh:{},open:{},srcOk:{}};
function reg(){var s=CK.lsj("agent:set")||{};return {notif:s.notif!==false,son:s.son!==false,seuil:+s.seuil||REGLAGES.notifier};}
function setReg(k,v){var s=CK.lsj("agent:set")||{};s[k]=v;CK.lsj("agent:set",s);}
function today(){return new Date().toLocaleDateString("en-CA",{timeZone:"Europe/Paris"});}

/* ---------------- Calculs ---------------- */
function ema(a,n){if(a.length<n)return null;var k=2/(n+1),e=a.slice(0,n).reduce(function(s,x){return s+x;},0)/n;for(var i=n;i<a.length;i++)e=a[i]*k+e*(1-k);return e;}
function rsi(c,n){n=n||14;if(c.length<n+1)return null;var g=0,l=0;for(var i=1;i<=n;i++){var d=c[i]-c[i-1];if(d>0)g+=d;else l-=d;}g/=n;l/=n;
  for(var j=n+1;j<c.length;j++){var d2=c[j]-c[j-1];g=(g*(n-1)+Math.max(d2,0))/n;l=(l*(n-1)+Math.max(-d2,0))/n;}return l===0?100:100-100/(1+g/l);}
function atr(k,n){n=n||14;if(k.length<n+1)return null;var t=[];for(var i=1;i<k.length;i++)t.push(Math.max(k[i].h-k[i].l,Math.abs(k[i].h-k[i-1].c),Math.abs(k[i].l-k[i-1].c)));
  var a=t.slice(0,n).reduce(function(s,x){return s+x;},0)/n;for(var j=n;j<t.length;j++)a=(a*(n-1)+t[j])/n;return a;}
function median(a){if(!a.length)return 0;var b=a.slice().sort(function(x,y){return x-y;});return b[Math.floor(b.length/2)];}
function r(x,d){if(x==null||!isFinite(x))return null;var p=Math.pow(10,d==null?2:d);return Math.round(x*p)/p;}
function dp(p){return p>=1000?0:p>=100?1:p>=1?2:4;}
/* Points pivots (sommets et creux de swing), 2 bougies de chaque côté */
function pivots(k,w){w=w||2;var H=[],L=[];for(var i=w;i<k.length-w;i++){var hi=true,lo=true;for(var j=1;j<=w;j++){if(k[i].h<=k[i-j].h||k[i].h<k[i+j].h)hi=false;if(k[i].l>=k[i-j].l||k[i].l>k[i+j].l)lo=false;}
  if(hi)H.push({px:k[i].h,t:k[i].t});if(lo)L.push({px:k[i].l,t:k[i].t});}return {H:H,L:L};}
function structure(k){var p=pivots(k,2),H=p.H.slice(-2),L=p.L.slice(-2);if(H.length<2||L.length<2)return "indéterminée";
  var hh=H[1].px>H[0].px,hl=L[1].px>L[0].px;return hh&&hl?"haussière (plus hauts et plus bas ascendants)":!hh&&!hl?"baissière (plus hauts et plus bas descendants)":"en range (sommets et creux sans direction nette)";}

/* Résumé d'une unité de temps, sur les bougies clôturées seulement */
function resume(tf,all){
  var k=all.filter(function(x){return x.ok;});if(k.length<30)return null;var cl=k.map(function(x){return x.c;}),last=k[k.length-1],prev=k[k.length-2];
  var e20=ema(cl,20),e50=ema(cl,50),px=last.c,a=atr(k,14),vols=k.slice(-21,-1).map(function(x){return x.v;}),vm=median(vols);
  var tr=px>e20&&e20>e50?"haussière":px<e20&&e20<e50?"baissière":"neutre";
  var w20=k.slice(-20),hi=Math.max.apply(null,w20.map(function(x){return x.h;})),lo=Math.min.apply(null,w20.map(function(x){return x.l;}));
  var cur=all[all.length-1],body=last.c-last.o,rng=last.h-last.l||1e-9;
  return {unite:TF_NOM[tf],cloture:r(px,dp(px)),tendance:tr,structure:structure(k.slice(-60)),moyenne20:r(e20,dp(px)),moyenne50:r(e50,dp(px)),rsi:r(rsi(cl,14),0),
    atr_pct:a?r(a/px*100,2):null,plus_haut_20:r(hi,dp(px)),plus_bas_20:r(lo,dp(px)),volume_vs_normale:vm?r(last.v/vm,1):null,
    derniere_bougie:{variation_pct:r((last.c/prev.c-1)*100,2),corps_pct_du_range:r(Math.abs(body)/rng*100,0),meche_haute_pct:r((last.h-Math.max(last.o,last.c))/rng*100,0),meche_basse_pct:r((Math.min(last.o,last.c)-last.l)/rng*100,0)},
    bougie_en_cours:cur&&!cur.ok?{variation_pct:r((cur.c/last.c-1)*100,2),plus_haut:r(cur.h,dp(px)),plus_bas:r(cur.l,dp(px))}:null};
}
/* Heure UTC du jour en cours, en ms */
function dayStart(t){var d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());}
/* Niveaux étiquetés : unité de temps, nom, nombre de touches */
function niveaux(b,px,fam){
  var K=V.k[b]||{},L=[],now=Date.now();
  function add(p,unite,nom){if(p&&isFinite(p))L.push({prix:p,unite:unite,nom:nom});}
  var d=(K["1D"]||[]).filter(function(x){return x.ok;});
  if(d.length>=2){var y=d[d.length-1];add(y.h,"jour","plus haut d'hier");add(y.l,"jour","plus bas d'hier");}
  var ds=dayStart(now),td=(K["1D"]||[]).filter(function(x){return x.t>=ds;})[0];if(td)add(td.o,"jour","ouverture du jour (UTC)");
  var wd=new Date(ds).getUTCDay(),ws=ds-((wd+6)%7)*864e5,wk=(K["1D"]||[]).filter(function(x){return x.t>=ws;});
  if(wk.length){add(wk[0].o,"semaine","ouverture de la semaine");}
  var pw=(K["1D"]||[]).filter(function(x){return x.t>=ws-7*864e5&&x.t<ws;});if(pw.length){add(Math.max.apply(null,pw.map(function(x){return x.h;})),"semaine","plus haut de la semaine dernière");add(Math.min.apply(null,pw.map(function(x){return x.l;})),"semaine","plus bas de la semaine dernière");}
  /* Sessions du jour (heures UTC approximatives) : Asie 00-07, Londres 07-13:30, New York 13:30-20 */
  var q=(K["15m"]||[]).filter(function(x){return x.t>=ds;});
  [["Asie",0,7],["Londres",7,13.5],["New York",13.5,20]].forEach(function(s){var a=ds+s[1]*36e5,z=ds+s[2]*36e5,w=q.filter(function(x){return x.t>=a&&x.t<z;});
    if(w.length>=4){add(Math.max.apply(null,w.map(function(x){return x.h;})),"session","plus haut de la session "+s[0]);add(Math.min.apply(null,w.map(function(x){return x.l;})),"session","plus bas de la session "+s[0]);}});
  [["4H","4h"],["1H","1h"],["15m","15m"]].forEach(function(z){var k=(K[z[0]]||[]).filter(function(x){return x.ok;}).slice(-80);if(k.length<10)return;var p=pivots(k,2);
    p.H.slice(-2).forEach(function(x){add(x.px,z[1],"sommet de swing "+z[1]);});p.L.slice(-2).forEach(function(x){add(x.px,z[1],"creux de swing "+z[1]);});});
  /* POC : le prix où il s'est échangé le plus de volume (profil de volume sur les bougies 15 min du jour et 1 h de la veille) */
  var poc=function(k){if(!k||k.length<4)return null;var lo=Math.min.apply(null,k.map(function(x){return x.l;})),hi=Math.max.apply(null,k.map(function(x){return x.h;})),n=60,st=(hi-lo)/n||1,v=new Array(n).fill(0);
    k.forEach(function(x){var a=Math.max(0,Math.floor((x.l-lo)/st)),z=Math.min(n-1,Math.floor((x.h-lo)/st)),q=x.v/(z-a+1);for(var i=a;i<=z;i++)v[i]+=q;});var m=0;for(var i=1;i<n;i++)if(v[i]>v[m])m=i;return lo+(m+0.5)*st;};
  var pj=poc((K["15m"]||[]).filter(function(x){return x.t>=ds;}));if(pj)add(pj,"poc","POC du jour");
  var py=poc((K["1H"]||[]).filter(function(x){return x.t>=ds-864e5&&x.t<ds;}));if(py)add(py,"poc","POC d'hier");
  /* Touches : bougies 1 h qui sont venues à moins de 0,1 % du niveau */
  var h1=(K["1H"]||[]).filter(function(x){return x.ok;}).slice(-100);
  L.forEach(function(l){l.touches=h1.filter(function(x){return Math.abs(x.h-l.prix)/l.prix<0.001||Math.abs(x.l-l.prix)/l.prix<0.001;}).length;l.distance_pct=r((l.prix/px-1)*100,2);l.prix=r(l.prix,dp(px));});
  /* Fusion des niveaux trop proches (confluence) : on garde le plus important et on cumule les raisons */
  var W={"semaine":5,"jour":4,"poc":3.5,"4h":3,"session":2.5,"1h":2,"15m":1};L.sort(function(a,b){return a.prix-b.prix;});var out=[];
  L.forEach(function(l){var o=out[out.length-1];if(o&&Math.abs(l.prix-o.prix)/px<0.0008){if((W[l.unite]||0)>(W[o.unite]||0)){o.nom=l.nom+" + "+o.nom;o.unite=l.unite;o.prix=l.prix;o.distance_pct=l.distance_pct;}else o.nom+=" + "+l.nom;o.touches=Math.max(o.touches,l.touches);o.confluence=(o.confluence||1)+1;}else out.push(l);});
  /* fam : les familles choisies (Semaine, Jour, POC…) ; on filtre avant de garder les plus proches */
  if(fam)out=out.filter(function(l){return fam[String(l.unite).toLowerCase()]!==false;});
  var up=out.filter(function(l){return l.prix>px;}).slice(0,6),dn=out.filter(function(l){return l.prix<=px;}).slice(-6).reverse();
  return {au_dessus:up,en_dessous:dn};
}
function liqs(b){var now=Date.now(),o={};[5,15,60].forEach(function(m){var L=0,Sh=0,big=0;(S.liqHist||[]).forEach(function(x){if(x.base!==b)return;var a=now-x.ts;if(a>=0&&a<m*6e4){if(x.long)L+=x.usd;else Sh+=x.usd;if(x.usd>big)big=x.usd;}});
  o[m+"min"]={longs_usd:Math.round(L),shorts_usd:Math.round(Sh),plus_grosse_usd:Math.round(big)};});return o;}
function oiDelta(b,min){var h=V.oi[b]||[];if(h.length<2)return null;var now=h[h.length-1],t=now.t-min*6e4,old=null;for(var i=h.length-1;i>=0;i--){if(h[i].t<=t){old=h[i];break;}}return old?r((now.v/old.v-1)*100,2):null;}
function macDelta(k,min){var h=V.macH,now=V.mac[k];if(!now)return null;var t=Date.now()-min*6e4,old=null;for(var i=h.length-1;i>=0;i--){if(h[i].t<=t){old=h[i].d[k];break;}}return old&&old.c?(k==="TAUX_10A"?r(now.c-old.c,3):r((now.c/old.c-1)*100,2)):null;}

/* ---------------- Collecte ---------------- */
function parseK(a){return (a||[]).map(function(x){return {t:+x[0],o:+x[1],h:+x[2],l:+x[3],c:+x[4],v:+x[7]||+x[5],ok:x[8]==="1"};}).reverse();}
function fetchK(b,tf){var n=tf==="1D"?40:tf==="4H"||tf==="1H"?120:100;
  return u.fetchJSON(OKX+"/api/v5/market/candles?instId="+b+"-USDT-SWAP&bar="+TF_OKX[tf]+"&limit="+n,null,12000).then(function(j){if(!j||j.code!=="0")throw new Error("OKX "+(j&&j.msg));V.k[b]=V.k[b]||{};V.k[b][tf]=parseK(j.data);V.kt[b+tf]=Date.now();});}
function collect(){
  var now=Date.now(),P=[];
  REGLAGES.actifs.forEach(function(b){Object.keys(TF_OKX).forEach(function(tf){var t=V.kt[b+tf]||0;if(!t||now-t>=REFRESH[tf]||REFRESH[tf]===0)P.push(fetchK(b,tf).catch(function(){}));});
    P.push(u.fetchJSON(OKX+"/api/v5/public/open-interest?instType=SWAP&instId="+b+"-USDT-SWAP",null,10000).then(function(j){var d=j&&j.data&&j.data[0];if(!d)return;var h=V.oi[b]=V.oi[b]||[];h.push({t:Date.now(),v:+d.oiCcy||+d.oi});if(h.length>120)h.shift();}).catch(function(){}));
    if(!V.fund[b]||now-V.fund[b].t>3e5)P.push(u.fetchJSON(OKX+"/api/v5/public/funding-rate?instId="+b+"-USDT-SWAP",null,10000).then(function(j){var d=j&&j.data&&j.data[0];if(d)V.fund[b]={t:Date.now(),r:+d.fundingRate*100};}).catch(function(){}));});
  var keys=Object.keys(REGLAGES.macro),cols=["close","change","RSI|15","RSI|60","RSI|240","EMA20|15","EMA50|15","EMA20|60","EMA50|60","EMA20|240","EMA50|240"];
  P.push(u.fetchJSON("https://scanner.tradingview.com/global/scan",{method:"POST",headers:{"Content-Type":"text/plain;charset=UTF-8"},body:JSON.stringify({symbols:{tickers:keys.map(function(k){return REGLAGES.macro[k];})},columns:cols})},12000)
    .then(function(j){var by={};(j&&j.data||[]).forEach(function(x){by[x.s]=x.d;});keys.forEach(function(k){var d=by[REGLAGES.macro[k]];if(!d)return;V.mac[k]={c:d[0],ch:d[1],rsi:{"15m":d[2],"1h":d[3],"4h":d[4]},e:{"15m":[d[5],d[6]],"1h":[d[7],d[8]],"4h":[d[9],d[10]]}};});
      V.macH.push({t:Date.now(),d:JSON.parse(JSON.stringify(V.mac))});if(V.macH.length>60)V.macH.shift();V.macT=Date.now();}).catch(function(){}));
  return Promise.all(P);
}


/* ---------------- Outils d'affichage ---------------- */
var host;
function el(id){return document.getElementById(id);}
function fp(v){if(v==null||!isFinite(v))return "—";return nf(v,dp(v));}
function sgn(v,d){if(v==null||!isFinite(v))return "—";return (v>0?"+":v<0?"−":"")+nf(Math.abs(v),d==null?2:d);}
function cl(v){return v>0?"up":v<0?"dn":"";}
function ago(ts){var m=Math.round((Date.now()-ts)/6e4);return m<1?"à l'instant":m<60?"il y a "+m+" min":"il y a "+Math.floor(m/60)+" h";}
function fk(n){n=+n||0;return n>=1e6?nf(n/1e6,1)+" M":n>=1e3?nf(n/1e3,n>=1e4?0:1)+" k":String(Math.round(n));}
function trend(b,tf){var K=(V.k[b]||{})[tf];if(!K)return "";var x=resume(tf,K);return !x?"":x.tendance==="haussière"?"u":x.tendance==="baissière"?"d":"n";}
var TYPES={glisse:["MOUVEMENT","#FFC266"],purgeL:["PURGE","var(--down)"],purgeS:["SQUEEZE","var(--up)"],move:["MOVE","#FFC266"],oi:["LEVIER","#7FA8F0"],vol:["VOLUME","#C3A6FF"],casse:["CASSURE","var(--up)"],meche:["PIÈGE","#FFC266"],news:["NEWS","#7FA8F0"],flash:["NEWS CHAUDE","#FF9F5A"],veille:["RONDE IA","#B8F36B"],dollar:["DOLLAR","#5FD3E6"],macro:["MACRO","#5FD3E6"],annonce:["ANNONCE","#C3A6FF"],suivi:["SUIVI","var(--muted)"],ia:["IA","#B8F36B"],brief:["BRIEF","#B8F36B"],lecture:["POINT","#B8F36B"]};
var ACOL={BTC:"#F7931A",ETH:"#8C9EFF",SOL:"#14F195",USD:"#5FD3E6",BRIEF:"#B8F36B",LECTURE:"#B8F36B"};
function agent(){return S.agent&&typeof S.agent==="object"?S.agent:null;}
function lv(t){return esc(String(t||"")).replace(/\[([\d\s.,  ]+)\]/g,'<span class="g5-lv">$1</span>');}

/* ---------------- Graphiques en bougies (Lightweight Charts de TradingView) ---------------- */
var LWC_URL=["https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js","https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js"],lwcP=null;
function loadLWC(){if(window.LightweightCharts)return Promise.resolve();if(lwcP)return lwcP;
  lwcP=new Promise(function(ok,ko){var i=0;(function essai(){var sc=document.createElement("script");sc.src=LWC_URL[i];sc.async=true;sc.onload=function(){ok();};sc.onerror=function(){sc.remove();i++;if(i<LWC_URL.length)essai();else{lwcP=null;ko(new Error("graphiques indisponibles"));}};document.head.appendChild(sc);})();});return lwcP;}
var TZ=function(){return -new Date().getTimezoneOffset()*60;};
function couleur(v,d){var x=host?getComputedStyle(host).getPropertyValue(v).trim():"";return x||d;}
function chart(b){
  var C=V.ch[b];if(C)return C;if(!window.LightweightCharts){loadLWC().then(function(){if(host&&host.offsetParent)paintCards();},function(){});return null;}
  var el=document.createElement("div");el.className="g7-ch";
  var up=couleur("--up","#7CFFB2"),dn=couleur("--down","#FF8C7A"),mu=couleur("--faint","#737882"),li=couleur("--line","rgba(242,238,230,.09)");
  var ch=LightweightCharts.createChart(el,{autoSize:true,height:180,layout:{background:{type:"solid",color:"transparent"},textColor:mu,fontSize:10,fontFamily:"JetBrains Mono, monospace"},
    grid:{vertLines:{visible:false},horzLines:{color:li}},rightPriceScale:{borderVisible:false,scaleMargins:{top:0.08,bottom:0.08}},timeScale:{borderVisible:false,timeVisible:true,secondsVisible:false,rightOffset:3},
    crosshair:{mode:0},handleScroll:false,handleScale:false,localization:{priceFormatter:function(p){return fp(p);}}});
  var se=ch.addCandlestickSeries({upColor:up,downColor:dn,borderVisible:false,wickUpColor:up,wickDownColor:dn,priceLineVisible:false,lastValueVisible:true});
  C=V.ch[b]={el:el,chart:ch,se:se,lines:[],k:"",lk:""};return C;
}
function court(n){var s=nom(n).replace(/^haut /,"H. ").replace(/^bas /,"B. ").replace(/^sommet /,"Sommet ").replace(/^creux /,"Creux ");return s.length>12?s.slice(0,11)+"…":s;}
function cadrer(C){var n=C.se.data().length;if(!n||!C.el.clientWidth)return false;C.chart.timeScale().setVisibleLogicalRange({from:Math.max(0,n-60),to:n+2});C.fit=false;return true;}
function majChart(b,px){
  var C=chart(b);if(!C)return;var tf=V.tf[b]||"15m",K=((V.k[b]||{})[tf]||[]).slice(-90);if(!K.length)return;
  var last=K[K.length-1],key=tf+last.t+last.c;
  if(C.k!==key){var off=TZ();C.se.setData(K.map(function(x){return {time:Math.floor(x.t/1000)+off,open:x.o,high:x.h,low:x.l,close:x.c};}));C.fit=true;C.k=key;}
  var nv=niveaux(b,px,famOn()),loin=function(a,l){return a&&l&&Math.abs(a.prix-l.prix)/px>=0.003;},U=nv.au_dessus,D=nv.en_dessous,L=[];
  if(U[0])L.push([U[0],1]);if(loin(U[0],U[1]))L.push([U[1],1]);if(D[0])L.push([D[0],0]);if(loin(D[0],D[1]))L.push([D[1],0]);
  var lk=L.map(function(x){return x[0].prix;}).join("|");
  if(C.lk!==lk){C.lines.forEach(function(p){C.se.removePriceLine(p);});var up=couleur("--up","#7CFFB2"),dn=couleur("--down","#FF8C7A");
    C.lines=L.map(function(x){var l=x[0];return C.se.createPriceLine({price:l.prix,color:x[1]?dn:up,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:court(l.nom)});});C.lk=lk;}
}
/* ---------------- Tes niveaux : tu choisis les familles affichées (mémorisé dans ton navigateur) ---------------- */
var FAM=[["semaine","Semaine"],["jour","Jour"],["poc","POC"],["session","Sessions"],["4h","4 h"],["1h","1 h"],["15m","15 min"]];
var FAM_DEF={semaine:true,jour:true,poc:true,session:true,"4h":true,"1h":false,"15m":false};
function famOn(){var f=CK.lsj("agent:niv")||{},o={};FAM.forEach(function(x){o[x[0]]=x[0] in f?!!f[x[0]]:FAM_DEF[x[0]];});return o;}
function filtreNiv(nv){var o=famOn(),ok=function(l){return o[String(l.unite).toLowerCase()]!==false;};return {au_dessus:nv.au_dessus.filter(ok),en_dessous:nv.en_dessous.filter(ok)};}
function famChips(){var o=famOn();return '<div class="g9-fam" role="group" aria-label="Niveaux affichés">'+FAM.map(function(x){return '<button type="button" data-fam="'+x[0]+'" aria-pressed="'+o[x[0]]+'" style="--u:'+(UCOL[x[0]]||"#AEB3BC")+'"><i></i>'+x[1]+'</button>';}).join("")+'</div>';}
/* Export TradingView : un indicateur Pine Script avec tes niveaux, à coller dans l'éditeur Pine */
function pine(b){
  var K=V.k[b]||{},k1=K["1m"]||[],tk=S.tick[b+"-USDT"],px=tk&&tk.last?tk.last:(k1.length?k1[k1.length-1].c:null);if(!px)return "";
  var nv=niveaux(b,px,famOn()),L=nv.au_dessus.concat(nv.en_dessous),d=new Date().toLocaleString("fr-FR",{timeZone:"Europe/Paris",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  var hex=function(u){return (UCOL[u]||"#AEB3BC").toUpperCase();},q=function(s){return String(s).replace(/"/g,"'").replace(/[^\x20-\x7E\u00C0-\u017F·]/g,"");};
  var s="//@version=5\n// Niveaux du Desk DAMOUR GLOBAL · "+b+" · "+d+" (heure de Paris)\n// À utiliser sur OKX:"+b+"USDT.P. Pour mettre à jour : recopie depuis le Desk.\nindicator(\"Niveaux Desk · "+b+"\", overlay=true, max_labels_count=50)\n";
  L.forEach(function(l,i){var u=String(l.unite).toLowerCase(),t=q(nom(l.nom)+" · "+(UNOM[u]||u));
    s+="hline("+l.prix+", \""+t+"\", color="+hex(u)+", linestyle="+(u==="1h"||u==="15m"?"hline.style_dashed":"hline.style_solid")+", linewidth="+(u==="semaine"||u==="jour"||u==="poc"?2:1)+")\n";
    s+="var label l"+i+" = label.new(na, na, \""+t+"\", style=label.style_label_left, color=color.new("+hex(u)+", 85), textcolor="+hex(u)+", size=size.small)\nlabel.set_xy(l"+i+", bar_index + 3, "+l.prix+")\n";});
  return s;
}
/* ---------------- Grand graphique : tous les niveaux importants, 15 min / 1 h / 4 h ---------------- */
var UCOL={semaine:"#C3A6FF",jour:"#FFC266",poc:"#5FD3E6",session:"#7FA8F0","4h":"#FF9F5A","1h":"#AEB3BC","15m":"#8E949E"},UNOM={semaine:"SEMAINE",jour:"JOUR",poc:"POC",session:"SESSION","4h":"4 H","1h":"1 H","15m":"15 MIN"};
var GC=null;
function grandChart(b,tf,officiel){
  tf=tf||V.gtf||"1H";V.gtf=tf;GC0.b=b;var box=document.getElementById("chartBox");if(!box)return;
  if(document.getElementById("ovChart").hidden){document.getElementById("chartTitle").textContent=b+" · niveaux de l'agent";document.getElementById("chartLink").href="https://www.tradingview.com/chart/?symbol=OKX%3A"+b+"USDT.P";CK.openOv("ovChart");}
  if(GC&&GC.chart){try{GC.chart.remove();}catch(e){}GC=null;}
  var K=V.k[b]||{},k1=K["1m"]||[],tk=S.tick[b+"-USDT"],px=tk&&tk.last?tk.last:(k1.length?k1[k1.length-1].c:null),nv=px?niveaux(b,px,famOn()):{au_dessus:[],en_dessous:[]},L=nv.au_dessus.concat(nv.en_dessous);
  var barre='<div class="g8-bar">'+[["15m","15 min"],["1H","1 h"],["4H","4 h"]].map(function(z){return '<button type="button" data-g8tf="'+z[0]+'" aria-pressed="'+(!officiel&&tf===z[0])+'">'+z[1]+'</button>';}).join("")+'<span class="g8-sep"></span><button type="button" data-g8pine="1" title="Copier l’indicateur Niveaux Desk : à coller une seule fois dans TradingView, il se met ensuite à jour tout seul">Indicateur TradingView</button><button type="button" data-g8off="1" aria-pressed="'+!!officiel+'">TradingView officiel</button><span class="g8-note">'+(officiel?"Graphique TradingView (sans les niveaux de l'agent)":"Niveaux calculés par l'agent, mis à jour en direct")+'</span></div>';
  if(officiel){box.innerHTML=barre+'<div class="g8-wrap"><div id="g8tv" style="height:100%"></div></div>';
    var go=function(){new window.TradingView.widget({container_id:"g8tv",symbol:"OKX:"+b+"USDT.P",interval:tf==="15m"?"15":tf==="1H"?"60":"240",theme:"dark",autosize:true,locale:"fr",timezone:"Europe/Paris",style:"1",allow_symbol_change:false});};
    if(window.TradingView)go();else{var sc=document.createElement("script");sc.src="https://s3.tradingview.com/tv.js";sc.onload=go;document.head.appendChild(sc);}
    lier(b,tf);return;}
  box.innerHTML=barre+'<div class="g8-wrap"><div class="g8-ch" id="g8ch"></div><aside class="g8-leg"><h4>Niveaux affichés</h4>'+famChips()+
    (L.length?legende(L,px):'<p class="g5-note">Niveaux en calcul…</p>')+
    '<p class="g5-note">Couleurs : <span style="color:'+UCOL.semaine+'">semaine</span> · <span style="color:'+UCOL.jour+'">jour</span> · <span style="color:'+UCOL.session+'">sessions</span> · <span style="color:'+UCOL["4h"]+'">4 h</span> · <span style="color:'+UCOL["1h"]+'">1 h</span></p></aside></div>';
  lier(b,tf);
  loadLWC().then(function(){
    var el=document.getElementById("g8ch");if(!el)return;var up=couleur("--up","#7CFFB2"),dn=couleur("--down","#FF8C7A");
    var ch=LightweightCharts.createChart(el,{autoSize:true,layout:{background:{type:"solid",color:"#0B0D11"},textColor:"#AEB3BC",fontSize:11,fontFamily:"JetBrains Mono, monospace"},
      grid:{vertLines:{color:"rgba(242,238,230,.05)"},horzLines:{color:"rgba(242,238,230,.06)"}},rightPriceScale:{borderVisible:false,scaleMargins:{top:0.06,bottom:0.22}},timeScale:{borderVisible:false,timeVisible:true,secondsVisible:false,rightOffset:6},
      crosshair:{mode:0},localization:{priceFormatter:function(p){return fp(p);}}});
    var se=ch.addCandlestickSeries({upColor:up,downColor:dn,borderVisible:false,wickUpColor:up,wickDownColor:dn});
    var vo=ch.addHistogramSeries({priceFormat:{type:"volume"},priceScaleId:"",lastValueVisible:false,priceLineVisible:false});vo.priceScale().applyOptions({scaleMargins:{top:0.82,bottom:0}});
    var ma=ch.addLineSeries({color:"#7FA8F0",lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
    GC={chart:ch,se:se,vo:vo,ma:ma,b:b,tf:tf,lk:""};majGrand();
    ch.timeScale().setVisibleLogicalRange({from:Math.max(0,se.data().length-110),to:se.data().length+6});
  },function(){var el=document.getElementById("g8ch");if(el)el.innerHTML='<div class="g7-ph"><span>Graphique indisponible : utilise « TradingView officiel ».</span></div>';});
}
function lier(b,tf){var box=document.getElementById("chartBox");if(!box||box._g8)return;box._g8=1;
  box.addEventListener("click",function(e){
    var fm=e.target.closest("[data-fam]");if(fm&&GC0.b){var f=famOn(),k=fm.getAttribute("data-fam");f[k]=!f[k];CK.lsj("agent:niv",f);grandChart(GC0.b,V.gtf);V.ch={};paintCards();return;}
    if(e.target.closest("[data-g8pine]")){
      CK.ui.copy(PINE_AUTO).then(function(){CK.toast("<b>Indicateur « Niveaux Desk » copié.</b> À faire une seule fois sur TradingView : Éditeur Pine (en bas) → Ctrl+A puis Ctrl+V → Enregistrer → « Ajouter au graphique ». Mets-le en favori (étoile) : il calcule ensuite les niveaux tout seul, sur tous tes graphiques.",{ms:16000});},function(){CK.toast("Copie impossible dans ce navigateur.");});return;}
    var t=e.target.closest("[data-g8tf]");if(t&&GC0.b){grandChart(GC0.b,t.getAttribute("data-g8tf"));return;}if(e.target.closest("[data-g8off]")&&GC0.b){grandChart(GC0.b,V.gtf,!document.getElementById("g8tv"));}});}
/* L'indicateur TradingView qui recalcule lui-même les niveaux du Desk (source : tradingview/niveaux-desk.pine) */
var PINE_AUTO="//@version=5\n// ============================================================================\n// Niveaux Desk · DAMOUR GLOBAL\n// Les mêmes niveaux que le Desk, calculés directement par TradingView :\n// semaine passée, jour (haut et bas d'hier, ouverture), POC (prix au plus gros\n// volume, jour et veille), sessions Asie / Londres / New York, sommets et creux 4 h et 1 h.\n// À ajouter UNE SEULE FOIS : ensuite il se met à jour tout seul, sur tous les graphiques.\n// Fonctionne sur les unités de temps intraday (1 min à 4 h). Heures des sessions en UTC, comme le Desk.\n// Lecture de marché, pas un conseil d'achat ou de vente.\n// ============================================================================\nindicator(\"Niveaux Desk\", overlay = true, max_lines_count = 80, max_labels_count = 80)\n\ngrpN = \"Niveaux affichés\"\nshowW   = input.bool(true,  \"Semaine : haut et bas de la semaine passée\", group = grpN)\nshowD   = input.bool(true,  \"Jour : haut et bas d'hier, ouverture du jour\", group = grpN)\nshowPOC = input.bool(true,  \"POC : prix au plus gros volume (jour et veille)\", group = grpN)\nshowS   = input.bool(true,  \"Sessions : Asie, Londres, New York\", group = grpN)\nshow4h  = input.bool(true,  \"Sommets et creux 4 h\", group = grpN)\nshow1h  = input.bool(false, \"Sommets et creux 1 h\", group = grpN)\ngrpR = \"Réglages\"\npocPct  = input.float(0.05, \"Finesse du POC (% du prix)\", minval = 0.01, step = 0.01, group = grpR)\ndecal   = input.int(12, \"Position des étiquettes (barres à droite)\", minval = 1, maxval = 300, group = grpR)\nplein   = input.bool(true, \"Lignes sur toute la largeur du graphique\", group = grpR)\n\n// Couleurs du Desk\ncW = color.rgb(195, 166, 255)\ncD = color.rgb(255, 194, 102)\ncP = color.rgb(95, 211, 230)\ncS = color.rgb(127, 168, 240)\nc4 = color.rgb(255, 159, 90)\nc1 = color.rgb(174, 179, 188)\n\n// ---------- Semaine et jour (bougies terminées, aucune valeur qui change après coup) ----------\n[dH, dL, dO] = request.security(syminfo.tickerid, \"D\", [high[1], low[1], open], lookahead = barmerge.lookahead_on)\n[wH, wL] = request.security(syminfo.tickerid, \"W\", [high[1], low[1]], lookahead = barmerge.lookahead_on)\n\n// ---------- Sommets et creux (2 bougies de chaque côté, comme le Desk) ----------\npivots() =>\n    ph = ta.pivothigh(high, 2, 2)\n    pl = ta.pivotlow(low, 2, 2)\n    [ta.valuewhen(not na(ph), ph, 0), ta.valuewhen(not na(ph), ph, 1), ta.valuewhen(not na(pl), pl, 0), ta.valuewhen(not na(pl), pl, 1)]\n[h4a, h4b, l4a, l4b] = request.security(syminfo.tickerid, \"240\", pivots())\n[h1a, h1b, l1a, l1b] = request.security(syminfo.tickerid, \"60\", pivots())\n\n// ---------- Sessions du jour (UTC) ----------\nnouveauJour = ta.change(time(\"D\")) != 0\ndans(s) => not na(time(timeframe.period, s + \":1234567\", \"UTC\"))\nvar float asH = na\nvar float asL = na\nvar float loH = na\nvar float loL = na\nvar float nyH = na\nvar float nyL = na\nif nouveauJour\n    asH := na\n    asL := na\n    loH := na\n    loL := na\n    nyH := na\n    nyL := na\nif timeframe.isintraday\n    if dans(\"0000-0700\")\n        asH := na(asH) ? high : math.max(asH, high)\n        asL := na(asL) ? low : math.min(asL, low)\n    if dans(\"0700-1330\")\n        loH := na(loH) ? high : math.max(loH, high)\n        loL := na(loL) ? low : math.min(loL, low)\n    if dans(\"1330-2000\")\n        nyH := na(nyH) ? high : math.max(nyH, high)\n        nyL := na(nyL) ? low : math.min(nyL, low)\n\n// ---------- POC : profil de volume du jour, mis à jour à chaque bougie ----------\nvar map<int, float> profil = map.new<int, float>()\nvar float pas = na\nvar int pocK = na\nvar float pocV = 0.0\nvar float pocJour = na\nvar float pocHier = na\nif nouveauJour or na(pas)\n    if nouveauJour and not na(pocJour)\n        pocHier := pocJour\n    profil.clear()\n    pas := open * pocPct / 100\n    pocK := na\n    pocV := 0.0\n    pocJour := na\nif timeframe.isintraday and not na(pas) and volume > 0\n    k = int(math.floor(hlc3 / pas))\n    v = nz(profil.get(k)) + volume\n    profil.put(k, v)\n    if v > pocV\n        pocV := v\n        pocK := k\n    pocJour := (pocK + 0.5) * pas\n\n// ---------- Dessin (refait à la dernière bougie) ----------\nvar array<line> lignes = array.new<line>()\nvar array<label> etiquettes = array.new<label>()\ntrace(float p, string nom, color c, bool pointille) =>\n    if not na(p)\n        lignes.push(line.new(bar_index - 1, p, bar_index, p, extend = plein ? extend.both : extend.right, color = color.new(c, 15), width = 1, style = pointille ? line.style_dashed : line.style_solid))\n        etiquettes.push(label.new(bar_index + decal, p, nom + \"  \" + str.tostring(p, format.mintick), style = label.style_label_left, color = color.new(c, 82), textcolor = c, size = size.small))\n\nif barstate.islast\n    for l in lignes\n        line.delete(l)\n    for e in etiquettes\n        label.delete(e)\n    lignes.clear()\n    etiquettes.clear()\n    if showW\n        trace(wH, \"Haut sem. passée\", cW, false)\n        trace(wL, \"Bas sem. passée\", cW, false)\n    if showD\n        trace(dH, \"Haut d'hier\", cD, false)\n        trace(dL, \"Bas d'hier\", cD, false)\n        trace(dO, \"Ouv. du jour\", cD, true)\n    if showPOC and timeframe.isintraday\n        trace(pocJour, \"POC du jour\", cP, false)\n        trace(pocHier, \"POC d'hier\", cP, true)\n    if showS and timeframe.isintraday\n        trace(asH, \"Haut Asie\", cS, true)\n        trace(asL, \"Bas Asie\", cS, true)\n        trace(loH, \"Haut Londres\", cS, true)\n        trace(loL, \"Bas Londres\", cS, true)\n        trace(nyH, \"Haut New York\", cS, true)\n        trace(nyL, \"Bas New York\", cS, true)\n    if show4h\n        trace(h4a, \"Sommet 4h\", c4, false)\n        trace(h4b, \"Sommet 4h\", c4, false)\n        trace(l4a, \"Creux 4h\", c4, false)\n        trace(l4b, \"Creux 4h\", c4, false)\n    if show1h\n        trace(h1a, \"Sommet 1h\", c1, true)\n        trace(h1b, \"Sommet 1h\", c1, true)\n        trace(l1a, \"Creux 1h\", c1, true)\n        trace(l1b, \"Creux 1h\", c1, true)\n";
var GC0={b:""};
function legende(L,px){var h="",mis=false;L.slice().sort(function(x,y){return y.prix-x.prix;}).forEach(function(l){if(!mis&&l.prix<=px){h+='<div class="g8-now"><span>prix</span><b class="num">'+fp(px)+'</b></div>';mis=true;}var u=String(l.unite).toLowerCase();h+='<div class="g8-l" style="--u:'+(UCOL[u]||"#AEB3BC")+'"><i></i><b class="num">'+fp(l.prix)+'</b><span>'+esc(nom(l.nom))+'</span><em>'+(UNOM[u]||u.toUpperCase())+'</em><small class="num '+cl(-l.distance_pct)+'">'+sgn(l.distance_pct,2)+' %</small></div>';});if(!mis)h+='<div class="g8-now"><span>prix</span><b class="num">'+fp(px)+'</b></div>';return h;}
function majGrand(){
  if(!GC||!document.getElementById("g8ch")){GC=null;return;}var b=GC.b,K=((V.k[b]||{})[GC.tf]||[]).slice(-150);if(!K.length)return;var off=TZ(),up=couleur("--up","#7CFFB2"),dn=couleur("--down","#FF8C7A");
  GC.se.setData(K.map(function(x){return {time:Math.floor(x.t/1000)+off,open:x.o,high:x.h,low:x.l,close:x.c};}));
  GC.vo.setData(K.map(function(x){return {time:Math.floor(x.t/1000)+off,value:x.v,color:x.c>=x.o?"rgba(124,255,178,.35)":"rgba(255,140,122,.35)"};}));
  var c=K.map(function(x){return x.c;}),m=[];for(var i=8;i<c.length;i++){var s2=0;for(var j=i-8;j<=i;j++)s2+=c[j];m.push({time:Math.floor(K[i].t/1000)+off,value:s2/9});}GC.ma.setData(m);
  var k1=(V.k[b]||{})["1m"]||[],tk=S.tick[b+"-USDT"],px=tk&&tk.last?tk.last:(k1.length?k1[k1.length-1].c:null);if(!px)return;
  var nv=niveaux(b,px,famOn()),L=nv.au_dessus.concat(nv.en_dessous),lk=L.map(function(l){return l.prix;}).join("|");
  if(GC.lk!==lk){(GC.lines||[]).forEach(function(p){GC.se.removePriceLine(p);});
    GC.lines=L.map(function(l){var u=String(l.unite).toLowerCase(),col=UCOL[u]||"#AEB3BC";return GC.se.createPriceLine({price:l.prix,color:col,lineWidth:u==="semaine"||u==="jour"?2:1,lineStyle:u==="1h"||u==="15m"?2:0,axisLabelVisible:true,title:court(l.nom)+" · "+(UNOM[u]||u)});});GC.lk=lk;}
}
/* ---------------- Cartes vivantes ---------------- */
function ladder(b,px){
  var nv=niveaux(b,px),up=nv.au_dessus.slice(0,2),dn=nv.en_dessous.slice(0,2),L=up.concat(dn);if(!L.length)return '<div class="g5-lad0">Niveaux en calcul…</div>';
  var all=L.map(function(l){return l.prix;}).concat([px]),mn=Math.min.apply(null,all),mx=Math.max.apply(null,all),pad=(mx-mn)*0.12||1;mn-=pad;mx+=pad;
  var H=128,y=function(v){return 6+(H-12)*(1-(v-mn)/(mx-mn));},s='<svg viewBox="0 0 300 '+H+'" class="g5-lad" role="img" aria-label="Niveaux proches de '+b+'">';
  var used=[];L.forEach(function(l){var yy=y(l.prix),ty=yy;for(var g=0;g<5&&used.some(function(v){return Math.abs(v-ty)<13;});g++)ty+=ty<y(px)?-13:13;used.push(ty);var isU=l.prix>px,c=isU?"var(--down)":"var(--up)";
    s+='<line x1="64" x2="300" y1="'+yy.toFixed(1)+'" y2="'+yy.toFixed(1)+'" stroke="'+c+'" stroke-opacity=".55" stroke-dasharray="4 4"/>'+
      '<text x="58" y="'+(ty+4).toFixed(1)+'" text-anchor="end" class="g5-lp" fill="'+c+'">'+esc(fp(l.prix))+'</text>'+
      '<text x="70" y="'+(ty-3).toFixed(1)+'" class="g5-ln">'+esc(nom(l.nom))+' · '+esc(String(l.unite).toUpperCase())+'</text>';});
  var py=y(px);s+='<line x1="64" x2="300" y1="'+py.toFixed(1)+'" y2="'+py.toFixed(1)+'" class="g5-pl"/><rect x="0" y="'+(py-10).toFixed(1)+'" width="62" height="20" rx="5" class="g5-pb"/><text x="31" y="'+(py+4).toFixed(1)+'" text-anchor="middle" class="g5-pt">'+esc(fp(px))+'</text>';
  return s+'</svg>';
}
function nom(n){var s=String(n||"").split(" + ")[0].replace(/^plus haut (de la |d')?/i,"haut ").replace(/^plus bas (de la |d')?/i,"bas ").replace(/^sommet de swing /i,"sommet ").replace(/^creux de swing /i,"creux ").replace(/ouverture (du |de la )?/i,"ouv. ").replace(/session /i,"").replace(/semaine dernière/,"sem. passée");return s.length>20?s.slice(0,19)+"…":s;}
/* Un signal capté par l'agent il y a moins de 6 min (cassure, purge, dollar…) allume la carte */
function hot(b){var a=agent(),now=Date.now(),L=(a&&Array.isArray(a.signaux)?a.signaux:[]).filter(function(m){return m.b===b&&now-m.ts<6*6e4&&m.imp>=2;});return L[L.length-1]||null;}
function card(b){
  var K=V.k[b]||{},k1=K["1m"]||[],tk=S.tick[b+"-USDT"],px=tk&&tk.last?tk.last:(k1.length?k1[k1.length-1].c:null);
  if(!px)return '<article class="g5-card"><header><b>'+b+'</b></header><div class="g5-wait">Connexion au marché…</div></article>';
  var m5=k1.length>6?(px/k1[k1.length-6].o-1)*100:null,ch=tk&&tk.open?(tk.last/tk.open-1)*100:null,lq=liqs(b)["15min"],tot=lq.longs_usd+lq.shorts_usd,oi=oiDelta(b,15),P=S.pos&&S.pos[b],fu=V.fund[b]?V.fund[b].r:null,h=hot(b),T=TYPES[h&&h.type]||null;
  return '<article class="g5-card'+(h?" hot":"")+'" style="--a:'+ACOL[b]+(T?";--h:"+T[1]:"")+'">'+
    '<header><b>'+b+'</b><span class="g5-ch num '+cl(ch)+'">'+sgn(ch)+' %<small>24 h</small></span>'+(h?'<span class="g5-flag">'+T[0]+' · '+u.parisTime(h.ts)+'</span>':'<span class="g5-calm">calme</span>')+'</header>'+
    '<div class="g5-pxr"><span class="g5-px num">'+fp(px)+'</span><span class="g5-m5 num '+cl(m5)+'">'+sgn(m5)+' %<small>5 min</small></span></div>'+
    '<div class="g5-tf">'+[["5m","5M"],["15m","15M"],["1H","1H"],["4H","4H"]].map(function(z){var t=trend(b,z[0]),on=(V.tf[b]||"15m")===z[0];return '<button type="button" class="'+t+(on?" on":"")+'" data-tfb="'+b+'" data-tf="'+z[0]+'" aria-pressed="'+on+'" title="Graphique '+z[1]+'">'+z[1]+'<i>'+(t==="u"?"▲":t==="d"?"▼":"●")+'</i></button>';}).join("")+'</div>'+
    '<div class="g7-ph" data-ch="'+b+'"><span>Graphique en chargement…</span></div><p class="g8-hint">Clic sur le graphique : plein écran avec tous les niveaux</p>'+
    '<div class="g5-liq"><div class="g5-lqh"><span>LIQUIDATIONS 15 MIN</span><b class="num">'+(tot?u.usd(tot):"—")+'</b></div><div class="g5-lqb"><i class="l" style="flex:'+(lq.longs_usd||0)+'"></i><i class="s" style="flex:'+(lq.shorts_usd||0)+'"></i>'+(tot?'':'<i class="z"></i>')+'</div><div class="g5-lqf"><span>longs '+u.usd(lq.longs_usd)+'</span><span>shorts '+u.usd(lq.shorts_usd)+'</span></div></div>'+
    '<div class="g5-kv"><span>OI 15 min<b class="num '+cl(oi)+'">'+(oi==null?'<small class="g6-wait">en calcul…</small>':sgn(oi)+' %')+'</b></span><span>Funding<b class="num">'+(fu==null?"—":sgn(fu,3)+" %")+'</b></span><span>Coinbase<b class="'+(P&&P.cb>0.03?"up":P&&P.cb<-0.03?"dn":"")+'">'+(P&&P.cb!=null?(P.cb>0.03?"acheteur":P.cb<-0.03?"vendeur":"neutre"):"—")+'</b></span></div></article>';
}
function gauge(lbl,v,th){var f=v==null?0:Math.min(1,v/th);return '<div class="g5-g"><div class="g5-gh"><span>'+lbl+'</span><b class="num '+(v!=null&&v>=th?"wn":"")+'">'+(v==null?"—":"× "+nf(v,1))+'</b></div><div class="g5-gb"><i style="width:'+Math.round(f*100)+'%" class="'+(f>=1?"full":"")+'"></i><em style="left:100%"></em></div></div>';}
function cardUSD(){
  var a=agent(),M=a&&a.marche||{},D=V.mac.DXY,T=V.mac.TAUX_10A,O=V.mac.PETROLE,N=V.mac.NASDAQ,d=M.dxy||{},h=hot("USD");
  var r=d.ratio,ev=M.eur&&M.eur.vol,dir=D&&D.ch!=null?D.ch:d.j,verdict=r!=null&&r>=3?(d.m5>0?["PRESSION SUR LE RISQUE","dn"]:["VENT FAVORABLE","up"]):(dir!=null&&Math.abs(dir)>=0.3?(dir>0?["DOLLAR FERME","dn"]:["DOLLAR FAIBLE","up"]):["CALME",""]);
  var row=function(n,x,dd,suf){return '<div class="g5-mr"><span>'+n+'</span><b class="num">'+(x?nf(x.c,dd)+(suf||""):"—")+'</b><em class="num '+(x?cl(x.ch):"")+'">'+(x?sgn(x.ch)+" %":"")+'</em></div>';};
  return '<article class="g5-card usd'+(h?" hot":"")+'" style="--a:'+ACOL.USD+(h?";--h:"+TYPES[h.type][1]:"")+'"><header><b>DOLLAR</b><span class="g5-verd '+verdict[1]+'">'+verdict[0]+'</span></header>'+
    '<div class="g5-pxr"><span class="g5-px num">'+(D?nf(D.c,2):d.v?nf(d.v,2):"—")+'</span><span class="g5-m5 num '+cl(dir)+'">'+sgn(dir)+' %<small>DXY auj.</small></span></div>'+
    gauge("Bougie 5 min vs normale",r,3)+gauge("Volume EUR/USD 5 min",ev,2.5)+
    '<div class="g5-macro">'+row("Taux 10 ans",T,3," %")+row("Pétrole",O,2)+row("Nasdaq",N,0)+'</div>'+
    '<p class="g5-note">Le DXY n\'a pas de volume : l\'agent lit celui de l\'EUR/USD (57 % du DXY).</p></article>';
}

/* ---------------- La lecture du marché (v10 : l'agent analyste) ---------------- */
function lectures(){var a=agent();return a&&Array.isArray(a.lectures)?a.lectures:[];}
function derniere(){var L=lectures();return L[L.length-1]||null;}
var CLIM={u:["FAVORABLE","up"],d:["DÉFAVORABLE","dn"],n:["NEUTRE",""]},TEND={u:["▲","HAUSSE","up"],d:["▼","BAISSE","dn"],n:["◆","RANGE",""]};
function raisonChip(R,court){var k=R&&R.k;
  if(k==="event")return '<span class="g10-why ev" title="'+esc(R.txt||"")+'"><i aria-hidden="true">⚡</i>'+(court?"sur événement":"déclenchée par : "+esc(String(R.txt||"").slice(0,110)))+'</span>';
  if(k==="demande")return '<span class="g10-why dm">demandée</span>';
  if(k==="seance")return '<span class="g10-why ev"><i aria-hidden="true">⏱</i>'+(court?"ouverture":esc(R.txt||"ouverture de séance"))+'</span>';
  return '<span class="g10-why">'+(court?"régulière":"lecture régulière · toutes les 30 min")+'</span>';}
function prochaine(){var a=agent(),p=a&&a.prochaine;if(!p)return "";var m=Math.round((p-Date.now())/6e4);return m<=0?"prochaine lecture imminente":"prochaine lecture dans "+m+" min";}
function pctS(v){return v==null?"—":sgn(v)+" %";}
function scEtat(sc){if(!sc||!sc.niv)return "";if(sc.ok)return '<em class="g10-st ok">✓ cible atteinte à '+u.parisTime(sc.ok)+'</em>';if(sc.dec)return '<em class="g10-st on">● déclenché à '+u.parisTime(sc.dec)+'</em>';return '<em class="g10-st">pas encore déclenché</em>';}
function scLigne(sc,d){if(!sc)return "";
  return '<div class="g10-sc '+(d>0?"u":"d")+'"><span class="g10-ar" aria-hidden="true">'+(d>0?"▲":"▼")+'</span><div><p><b class="g10-sct">'+(d>0?"SCÉNARIO HAUSSIER":"SCÉNARIO BAISSIER")+'</b>'+lv(sc.si||"")+'</p>'+
    '<div class="g10-lv">'+(sc.niv?'<span>déclencheur <b class="num">'+fp(sc.niv)+'</b>'+(sc.nivN?' <small>'+esc(nom(sc.nivN))+'</small>':'')+'</span>':'')+(sc.cible?'<span>cible <b class="num">'+fp(sc.cible)+'</b>'+(sc.cibleN?' <small>'+esc(nom(sc.cibleN))+'</small>':'')+'</span>':'')+scEtat(sc)+'</div></div></div>';}
/* v13 : une bande de terminal. Un seul panneau pour les trois actifs, une phrase d'état en clair par actif,
   une jauge (le prix entre support et résistance), des infobulles partout et une fiche « Comment lire ». */
function prixDirect(b,x){var tk=S.tick[b+"-USDT"];return tk&&tk.last?tk.last:(x&&x.px);}
function bornes(x){var v=[x.px,x.hausse&&x.hausse.niv,x.hausse&&x.hausse.cible,x.baisse&&x.baisse.niv,x.baisse&&x.baisse.cible].filter(function(z){return z>0;}),lo=Math.min.apply(null,v),hi=Math.max.apply(null,v),pad=(hi-lo)*0.1||x.px*0.002;return {lo:lo-pad,hi:hi+pad};}
function pos(v,B){return Math.max(0,Math.min(100,(v-B.lo)/(B.hi-B.lo)*100));}
function ecart(p,px){if(!p||!px)return "";var d=(p/px-1)*100;return (d>0?"+":"−")+nf(Math.abs(d),2)+" %";}
function bref(t){t=String(t||"").replace(/[\[\]]/g,"").replace(/\s*\(.*$/,"");return t.length>64?t.slice(0,62)+"…":t;}
function tip(t){return ' data-tip="'+esc(t)+'" tabindex="0"';}
/* La phrase d'état : ce qu'il faut retenir pour cet actif, maintenant */
function etat(b,x,old){
  var up=x.hausse,dn=x.baisse,px=old?x.px:prixDirect(b,x),T=x.tr,pick=T?x[T.s]:(up&&up.dec?up:dn&&dn.dec?dn:null),d=T?T.d:(pick===up?1:-1);
  if(pick&&pick.ok)return ['ok','✓ Cible '+fp(pick.cible)+' atteinte : scénario '+(d>0?"haussier":"baissier")+' réussi'];
  if(pick&&pick.stop)return ['ko','✕ Stop : clôture 15 min '+(d>0?"sous ":"au-dessus de ")+fp(pick.stopNiv||pick.niv)];
  if(pick&&pick.dec)return [d>0?'up':'dn',(d>0?'▲ Résistance '+fp(pick.niv)+' cassée':'▼ Support '+fp(pick.niv)+' cassé')+(pick.mode==="cloture"?' en clôture 15 min':'')+' à '+u.parisTime(pick.dec)+(pick.cible?' · objectif '+fp(pick.cible):'')];
  if(!old&&px&&up&&up.niv&&px>=up.niv)return ['arm','Au-dessus de la résistance '+fp(up.niv)+' · à confirmer par une clôture 15 min'];
  if(!old&&px&&dn&&dn.niv&&px<=dn.niv)return ['arm','Sous le support '+fp(dn.niv)+' · à confirmer par une clôture 15 min'];
  if(up&&up.niv&&dn&&dn.niv)return ['wait','Entre support ('+ecart(dn.niv,px)+') et résistance ('+ecart(up.niv,px)+') · rien de déclenché'];
  return ['wait','Pas assez de niveaux pour un scénario net'];
}
function jauge(b,x,old){
  var B=bornes(x),up=x.hausse,dn=x.baisse,px=old?x.px:prixDirect(b,x),z='',on=function(sc){return !sc?"":sc.ok?" ok":sc.stop?" ko":sc.dec?" on":"";};
  if(dn&&dn.niv){var a=pos(dn.cible||B.lo,B),c=pos(dn.niv,B);z+='<i class="g13-zone d'+on(dn)+'" style="left:'+a.toFixed(1)+'%;width:'+Math.max(1,c-a).toFixed(1)+'%"></i><span class="g13-mk d" style="left:'+c.toFixed(1)+'%"></span>';}
  if(up&&up.niv){var a2=pos(up.niv,B),c2=pos(up.cible||B.hi,B);z+='<i class="g13-zone u'+on(up)+'" style="left:'+a2.toFixed(1)+'%;width:'+Math.max(1,c2-a2).toFixed(1)+'%"></i><span class="g13-mk u" style="left:'+a2.toFixed(1)+'%"></span>';}
  var lab=function(sc,dd){var u2=dd>0;if(!sc||!sc.niv)return '<div class="g13-lv '+(u2?"u":"d")+' vide"><small>'+(u2?"Résistance":"Support")+'</small><span>aucun niveau net</span></div>';
    return '<div class="g13-lv '+(u2?"u":"d")+(sc.ignore?" off":"")+'"'+tip((u2?"Résistance : si le prix clôture 15 min au-dessus, le scénario haussier démarre":"Support : si le prix clôture 15 min en dessous, le scénario baissier démarre")+(sc.cible?" et vise "+fp(sc.cible)+".":".")+(sc.si?" L'agent : « "+String(sc.si).replace(/[\[\]]/g,"")+" »":""))+'><small>'+(u2?"Résistance":"Support")+'</small><b class="num">'+fp(sc.niv)+'</b>'+
      '<span><em class="num" data-dist="'+(u2?"u":"d")+'">'+(old?"":ecart(sc.niv,px))+'</em>'+(sc.cible?'<i>'+(u2?"→ ":"→ ")+'<b class="num">'+fp(sc.cible)+'</b></i>':'')+'</span></div>';};
  return '<div class="g13-gauge" data-lo="'+B.lo+'" data-hi="'+B.hi+'" data-up="'+(up&&up.niv||"")+'" data-dn="'+(dn&&dn.niv||"")+'"><div class="g13-track"'+tip("La barre va du plus bas (à gauche) au plus haut (à droite). Le point, c'est le prix en direct. Rouge : zone sous le support jusqu'à son objectif. Vert : zone au-dessus de la résistance jusqu'à son objectif.")+'>'+z+'<div class="g13-dotl" style="--x:'+pos(px,B).toFixed(2)+'"><b class="g13-dot"></b></div></div><div class="g13-lvs">'+lab(dn,-1)+lab(up,1)+'</div></div>';
}
function actifCol(L,b,old){var x=L.actifs[b],t=TEND[x.tendance]||TEND.n,px=old?x.px:prixDirect(b,x),lq=x.liq||{},tot=(lq.longs||0)+(lq.shorts||0),dv=!old&&px&&x.px?(px/x.px-1)*100:null,E=etat(b,x,old);
  var biais={u:"Haussier",d:"Baissier",n:"Neutre"}[x.tendance]||"Neutre";
  return '<div class="g13-a" data-b="'+b+'" data-px0="'+(x.px||"")+'" style="--a:'+ACOL[b]+'">'+
    '<div class="g13-ah"><span class="g13-sym"><i></i>'+b+'</span><span class="g13-bias '+t[2]+'"'+tip("L'avis de l'agent pour les prochaines heures.")+'>'+t[0]+' '+biais+'</span></div>'+
    '<div class="g13-pxr"><b class="g13-px num"'+tip(old?"Prix au moment de la lecture.":"Prix en direct (OKX).")+'>'+fp(px)+'</b>'+(dv==null?'':'<span class="g13-ch num '+cl(dv)+'"'+tip("Variation depuis l'heure de la lecture.")+'>'+sgn(dv)+' %</span>')+'</div>'+
    '<p class="g13-st '+E[0]+'">'+esc(E[1])+'</p>'+jauge(b,x,old)+
    (x.lecture?'<p class="g13-al">'+lv(x.lecture)+'</p>':'')+
    '<div class="g13-ft"><span'+tip("Variation sur 1 heure.")+'>1 h <b class="num '+cl(x.h1)+'">'+pctS(x.h1)+'</b></span><span'+tip("Variation sur 4 heures.")+'>4 h <b class="num '+cl(x.h4)+'">'+pctS(x.h4)+'</b></span><span'+tip("Variation sur 24 heures.")+'>24 h <b class="num '+cl(x.j)+'">'+pctS(x.j)+'</b></span>'+
      (tot?'<span class="g13-liq"'+tip("Positions liquidées sur 1 h : longs "+u.usd(lq.longs||0)+" (rouge, des acheteurs sortis de force), shorts "+u.usd(lq.shorts||0)+" (vert, des vendeurs sortis de force).")+'>liq. <i><s style="flex:'+(lq.longs||0)+'"></s><s style="flex:'+(lq.shorts||0)+'"></s></i><b class="num">'+u.usd(tot)+'</b></span>':'')+'</div></div>';}
function anneau(){var a=agent(),p=a&&a.prochaine;if(!p)return "";var m=Math.max(0,(p-Date.now())/6e4),f=Math.min(1,m/30);return '<span class="g13-ring"'+tip("Prochaine lecture automatique. Une lecture part aussi tout de suite sur un événement fort.")+'><svg viewBox="0 0 22 22" aria-hidden="true"><circle cx="11" cy="11" r="9"/><circle class="p" cx="11" cy="11" r="9" style="stroke-dashoffset:'+(56.55*(1-f)).toFixed(2)+'"/></svg><span id="g10Next">'+esc(prochaine())+'</span></span>';}
function aide(){return '<details class="g13-aide"'+(V.aide?" open":"")+'><summary>Comment lire l\'agent</summary><div class="g13-aidec">'+
  '<p><b>La lecture.</b> Toutes les 30 min, à chaque ouverture (Europe, Wall Street) et dès qu\'il se passe quelque chose de fort, l\'agent relit tout le marché et écrit ce qui se passe et pourquoi.</p>'+
  '<p><b>La barre.</b> Le point, c\'est le prix en direct. À gauche le <span class="dn">support</span>, à droite la <span class="up">résistance</span>. La couleur au-delà de chaque trait va jusqu\'à l\'objectif.</p>'+
  '<p><b>Le déclenchement.</b> Un scénario démarre quand une bougie 15 min <u>clôture</u> au-delà du niveau. Une simple mèche ne compte pas : elle s\'affiche « à confirmer ».</p>'+
  '<p><b>Le résultat.</b> Un seul scénario compte par actif, le premier déclenché. ✓ si l\'objectif est touché avant le stop. ✕ si une clôture 15 min passe au-delà du niveau d\'en face (le stop). Rien des deux en 4 h : neutre. Tout est noté dans l\'onglet Bilan.</p>'+
  '<p><b>Les petites lignes.</b> 1 h, 4 h, 24 h : variations du prix. Liq. : positions liquidées sur 1 h (rouge = acheteurs sortis, vert = vendeurs sortis). Survole un élément pour son explication.</p>'+
  '<p class="mu">Lecture de marché, pas un conseil d\'achat ou de vente.</p></div></details>';}
function lectureHTML(L,old){
  var C=CLIM[L.climat]||CLIM.n,B=["BTC","ETH","SOL"].filter(function(b){return L.actifs&&L.actifs[b];}),R=L.raison||{};
  var why=R.k==="event"?'⚡ '+esc(bref(R.txt)):R.k==="seance"?'⏱ '+esc(bref(R.txt)):R.k==="demande"?'à la demande':'lecture régulière';
  return (old?'':'<div class="g13-top"><span class="g13-live"><i></i>Agent</span><span class="g13-meta num">'+u.parisTime(L.ts)+' · '+ago(L.ts)+'</span><span class="g13-why"'+tip("Ce qui a déclenché cette lecture.")+'>'+why+'</span><span class="g10-sp"></span>'+anneau()+
      '<button type="button" class="g13-btn" data-act="aide" aria-label="Comment lire l\'agent" aria-expanded="'+!!V.aide+'">?</button><button type="button" class="g13-btn re" data-act="point"'+(V.pointBusy?' disabled':'')+'>'+(V.pointBusy?"Lecture…":"Relire")+'</button></div>'+aide())+
    '<div class="g13-head"><span class="g13-clim '+C[1]+'"'+tip("Le climat pour les actifs risqués : dollar, taux, actions, news.")+'>'+C[0].charAt(0)+C[0].slice(1).toLowerCase()+'</span>'+(old?'':'<h2>'+lv(L.titre)+'</h2>')+(L.resume?'<p>'+lv(L.resume)+'</p>':'')+'</div>'+
    '<div class="g13-strip">'+B.map(function(b){return actifCol(L,b,old);}).join("")+'</div>'+
    '<div class="g13-ctx"><div><h4>Pourquoi</h4><ul>'+(L.pourquoi||[]).map(function(p){return '<li>'+lv(p)+'</li>';}).join("")+'</ul>'+(L.dollar?'<h4>Dollar et macro</h4><p>'+lv(L.dollar)+'</p>':'')+(L.depuis?'<h4>Depuis la dernière lecture</h4><p>'+lv(L.depuis)+'</p>':'')+'</div>'+
      '<div>'+(L.surveiller?'<h4 class="w">À surveiller</h4><p>'+lv(L.surveiller)+'</p>':'')+(L.invalide?'<h4 class="i">Tout change si</h4><p>'+lv(L.invalide)+'</p>':'')+
      ((L.agenda||[]).filter(function(e){return e.ts>Date.now()-36e5;}).length?'<h4 class="w">À venir</h4>'+(L.agenda||[]).filter(function(e){return e.ts>Date.now()-36e5;}).map(function(e){return '<p class="cal"><b class="num">'+u.parisTime(e.ts)+'</b> '+esc(e.t)+(e.a?' · publié '+esc(e.a):e.f?' · prévu '+esc(e.f):'')+'</p>';}).join(""):'')+'</div></div>'+
    '<p class="g13-src">Écrit par '+esc(iaNom(L.ia&&L.ia.p))+' ('+esc(L.ia&&L.ia.m||"")+') · prix vérifiés par le Desk · lecture de marché, pas un conseil</p>';
}
/* Mise à jour en direct (toutes les 3 s) : prix, variation, position du point, distances aux niveaux, phrase d'état */
function majLive(){var h=document.querySelector(".g13");if(!h)return;var Ld=derniere();
  h.querySelectorAll(".g13-strip>.g13-a").forEach(function(c){var b=c.getAttribute("data-b"),tk=S.tick[b+"-USDT"],px=tk&&tk.last;if(!px)return;
    var p0=+c.getAttribute("data-px0"),g=c.querySelector(".g13-gauge"),e=c.querySelector(".g13-px");if(e)e.textContent=fp(px);
    var ch=c.querySelector(".g13-ch");if(ch&&p0){var dv=(px/p0-1)*100;ch.className="g13-ch num "+cl(dv);ch.textContent=sgn(dv)+" %";}
    if(g){var B={lo:+g.getAttribute("data-lo"),hi:+g.getAttribute("data-hi")},d=g.querySelector(".g13-dotl");if(d)d.style.setProperty("--x",pos(px,B).toFixed(2));
      var up=+g.getAttribute("data-up"),dn=+g.getAttribute("data-dn"),eu=g.querySelector('[data-dist="u"]'),ed=g.querySelector('[data-dist="d"]');if(eu&&up)eu.textContent=ecart(up,px);if(ed&&dn)ed.textContent=ecart(dn,px);}
    var s=c.querySelector(".g13-st");if(s&&Ld&&Ld.actifs&&Ld.actifs[b]){var E=etat(b,Ld.actifs[b]);s.className="g13-st "+E[0];s.textContent=E[1];}
  });
  var r=h.querySelector(".g13-ring .p"),a=agent();if(r&&a&&a.prochaine){var m=Math.max(0,(a.prochaine-Date.now())/6e4);r.style.strokeDashoffset=(56.55*(1-Math.min(1,m/30))).toFixed(2);}
}
function resultat(x){var T=x&&x.tr;if(T)return T.res==="ok"?["ok","✓"]:T.res==="ko"?["ko","✕"]:["on","●"];var sc=x&&(x.hausse&&x.hausse.ok?x.hausse:x.baisse&&x.baisse.ok?x.baisse:null);return sc?["ok","✓"]:null;}
function badges(L){var o="";["BTC","ETH","SOL"].forEach(function(b){var x=L.actifs&&L.actifs[b],r=resultat(x);if(!r)return;var s=x.tr?x.tr.s:(x.hausse&&x.hausse.ok?"hausse":"baisse");o+='<span class="g13-bd '+r[0]+'">'+(s==="hausse"?"▲":"▼")+' '+b+' '+r[1]+'</span>';});return o;}
function histo(){var L=lectures().slice(0,-1).reverse();if(!L.length)return "";
  return '<section class="g13-hi"><h3>Lectures précédentes</h3><p class="g13-hin">Ce que l\'agent a dit, et ce qui s\'est passé ensuite.</p>'+L.map(function(x){var C=CLIM[x.climat]||CLIM.n,R=x.raison||{};
    return '<details class="g13-old" data-lid="'+esc(x.id)+'"'+(V.open[x.id]?" open":"")+'><summary><span class="num g13-t">'+u.parisTime(x.ts)+'</span><span class="g13-dotc '+C[1]+'"></span><b>'+lv(x.titre)+'</b><span class="g13-rk">'+(R.k==="event"?"⚡":R.k==="seance"?"⏱":R.k==="demande"?"demandée":"")+'</span><span class="g13-bds">'+badges(x)+'</span></summary><div class="g13-oldb">'+lectureHTML(x,1)+'</div></details>';}).join("")+'</section>';}
function viewLecture(){
  var a=agent();
  if(!a&&S.tgErr>=2)return '<div class="g5-empty"><b>Beaucoup de monde en ce moment</b><span>Le relais gratuit de l\'agent est saturé : il revient dans quelques minutes (au pire demain matin). Tout le reste du Desk fonctionne normalement : prix, liquidations, screener, news.</span></div>';
  if(!a)return '<div class="g5-empty"><b>Connexion à l\'agent…</b><span>'+(CK.tgUrl&&CK.tgUrl()?"La lecture du marché arrive dans quelques secondes.":"Aucun relais configuré : l'agent n'est pas disponible dans cette version.")+'</span></div>';
  if(a.off)return '<div class="g5-empty"><b>Agent en cours d\'installation</b><span>'+esc(a.off)+'</span></div>';
  if(!Array.isArray(a.lectures))return '<div class="g5-empty"><b>Le relais n\'est pas encore à jour</b><span>Cette version du Desk attend l\'agent analyste (v10). Copie le fichier relais/desk-news-worker.js dans Cloudflare et clique sur « Deploy ».</span></div>';
  var L=derniere(),busy=V.pointBusy?'<div class="g10-busy"><span class="g6-spin"></span><b>L\'agent relit tout le marché…</b><small>prix, niveaux, levier, liquidations, dollar, news, agenda · moins d\'une minute</small></div>':'';
  if(!L)return busy+'<div class="g5-empty"><b>Première lecture en préparation</b><span>L\'agent écrit une lecture du marché toutes les 30 min (à l\'heure et à la demie), et tout de suite quand il se passe quelque chose d\'important.</span><p><button type="button" class="g6-go" data-act="point"><i></i>Lire le marché maintenant</button></p></div>';
  return busy+'<section class="g13'+(V.fresh[L.id]?" new":"")+'">'+lectureHTML(L)+'</section>'+histo();
}
function fairePoint(){
  var url=CK.tgUrl&&CK.tgUrl();if(!url){CK.toast("Le relais de l'agent n'est pas configuré.");return;}
  if(V.pointBusy)return;var L=derniere();
  if(L&&Date.now()-L.ts<3*6e4){CK.toast("La lecture a "+Math.max(1,Math.round((Date.now()-L.ts)/6e4))+" min : elle est à jour. Nouvelle lecture possible dans quelques minutes.");return;}
  V.pointBusy=true;paint();var debut=Date.now(),base=url.replace(/\/$/,"")+"/point";
  var fin=function(msg){V.pointBusy=false;if(msg)CK.toast(msg);paint();};
  (function essai(){u.fetchJSON(base+"?t="+Date.now(),null,20000).then(function(f){
    if(f&&f.erreur){fin(esc(f.erreur));return;}
    if(f&&f.id&&f.actifs){var a=S.agent=S.agent||{};a.lectures=Array.isArray(a.lectures)?a.lectures:[];if(!a.lectures.some(function(x){return x.id===f.id;})){delete f.recent;a.lectures.push(f);V.seen=V.seen||{};V.seen[f.id]=1;V.fresh[f.id]=1;setTimeout(function(){V.fresh={};},8000);}
      fin(f.recent&&Date.now()-f.ts>6e4?"Lecture faite il y a "+Math.max(1,Math.round((Date.now()-f.ts)/6e4))+" min : la voici.":"");return;}
    if(Date.now()-debut>170000){fin("L'agent n'a pas répondu à temps. Réessaie dans une minute.");return;}
    setTimeout(essai,8000);
  },function(){if(Date.now()-debut>170000)fin("Relais injoignable. Réessaie dans un instant.");else setTimeout(essai,8000);});})();
}
function iaNom(p){return {gemini:"Gemini",gemlite:"Gemini Lite",groq:"Groq",openrouter:"OpenRouter",workersai:"Workers AI"}[p]||p||"IA";}

/* ---------------- Conso ---------------- */
function viewConso(){
  var a=agent(),I=a&&a.ia;
  if(!I)return '<div class="g5-empty"><b>Pas encore de consommation aujourd\'hui.</b><span>L\'agent appelle l\'IA une fois par lecture : toutes les 30 min, sur un événement important, ou à la demande.</span></div>';
  var P=I.prov||{},ord=(I.ordre||["gemini","groq","openrouter","workersai"]).filter(function(p){return p!=="veille";}),tot=ord.reduce(function(s,p){return s+((P[p]||{}).n||0);},0)||1,act=ord.filter(function(p){return P[p]&&/actif|Flash-Lite/.test(P[p].etat||"");})[0];
  var tin=0,tout=0;ord.forEach(function(p){var x=P[p]||{};tin+=x.ti||0;tout+=x.to||0;});
  var k='<div class="g5-kpis"><div class="g5-kpi"><span>APPELS IA AUJOURD\'HUI</span><b class="num">'+I.n+'<small> / '+I.budget+'</small></b><small>1 appel = 1 lecture</small><div class="g5-bar"><i style="width:'+Math.min(100,Math.round(I.n/I.budget*100))+'%"></i></div></div>'+
    '<div class="g5-kpi"><span>TOKENS</span><b class="num">'+fk(tin+tout)+'</b><small>entrée '+fk(tin)+' · sortie '+fk(tout)+'</small></div>'+
    '<div class="g5-kpi"><span>IA AU TRAVAIL</span><b>'+esc(act?iaNom(act):"—")+'</b><small>'+esc(act&&P[act].modele||"")+'</small></div>'+
    '<div class="g5-kpi"><span>COÛT</span><b class="num">0 $</b><small>offres gratuites uniquement</small></div></div>';
  var cards='<div class="g5-provs">'+ord.map(function(p,i){var x=P[p]||{n:0,ok:0,er:0,ti:0,to:0,ms:0},on=/actif|Flash-Lite/.test(x.etat||""),off=/pas de clé|non branché/.test(x.etat||"");
    return '<div class="g5-prov'+(on?" on":off?" off":x.pause&&x.pause>Date.now()?" wn":"")+'"><div class="g5-ph"><span class="g5-n">'+(i+1)+'</span><b>'+iaNom(p)+'</b><span class="g5-pst">'+esc(x.pause&&x.pause>Date.now()?(x.etat||"en pause")+" · reprise "+u.parisTime(x.pause):(x.etat||"en attente"))+'</span></div>'+
      '<div class="g5-pn"><div><b class="num">'+x.n+'</b><span>appels</span></div><div><b class="num">'+fk((x.ti||0)+(x.to||0))+'</b><span>tokens</span></div><div><b class="num">'+(x.n?nf(x.ms/Math.max(1,x.n)/1000,1)+" s":"—")+'</b><span>latence</span></div><div><b class="num '+(x.er?"dn":"")+'">'+x.er+'</b><span>échecs</span></div></div>'+
      '<div class="g5-bar"><i style="width:'+Math.round(x.n/tot*100)+'%"></i></div><small>'+esc(x.modele||(p==="workersai"?"secours intégré à Cloudflare":p==="groq"?"secours gratuit":""))+'</small></div>';}).join("")+'</div>';
  var Hh=I.heures||[],mx=Math.max.apply(null,Hh.concat([1])),bars='<svg viewBox="0 0 480 120" class="g5-svg" role="img" aria-label="Appels IA par heure"><line x1="0" x2="480" y1="100" y2="100" class="g5-ax"/>'+Hh.map(function(v,i){var h=v/mx*86;return (v?'<rect x="'+(i*20+3)+'" y="'+(100-h)+'" width="14" height="'+h+'" rx="2" class="g5-bi"><title>'+i+' h : '+v+' appel'+(v>1?"s":"")+'</title></rect>':'')+(i%3===0?'<text x="'+(i*20+10)+'" y="116" text-anchor="middle" class="g5-tt">'+i+'h</text>':'');}).join("")+'<text x="2" y="12" class="g5-tt">'+mx+' max</text></svg>';
  var log=(I.log||[]).slice().reverse(),K={lecture:"Lecture",point:"Lecture",alerte:"Alerte (ancien)",brief:"Brief (ancien)",news:"News (ancien)"};
  var tb=log.length?'<div class="g5-tw"><table class="g5-tb"><thead><tr><th>Heure</th><th>Tâche</th><th>IA</th><th>Modèle</th><th>Entrée</th><th>Sortie</th><th>Durée</th><th>Statut</th></tr></thead><tbody>'+log.map(function(x){return '<tr><td class="num">'+u.parisTime(x.ts)+'</td><td>'+esc(K[x.k]||x.k)+'</td><td>'+esc(iaNom(x.p))+'</td><td><small>'+esc(x.m||"")+'</small></td><td class="num">'+fk(x.ti)+'</td><td class="num">'+fk(x.to)+'</td><td class="num">'+nf(x.ms/1000,1)+' s</td><td>'+(x.ok?'<span class="g5-ok">OK</span>':'<span class="g5-ko" title="'+esc(x.e||"")+'">ÉCHEC</span>')+'</td></tr>';}).join("")+'</tbody></table></div>':'<p class="g5-note">Le journal se remplit à chaque appel.</p>';
  return k+cards+'<div class="g5-2"><section class="g5-box"><h4>Appels par heure · aujourd\'hui</h4>'+bars+'</section><section class="g5-box"><h4>Comment l\'agent travaille</h4><ul class="g5-ul"><li>Toutes les minutes, le Desk mesure tout seul, sans IA : prix, niveaux, levier, liquidations, dollar, news, agenda.</li><li>Toutes les 30 min, l\'IA relit tout et écrit une lecture complète (un seul appel, avec réflexion).</li><li>Sur un événement important (purge, gros move, news majeure, dollar qui s\'emballe, annonce publiée), une lecture part tout de suite.</li><li>Un seul agent pour tous les utilisateurs : '+I.budget+' appels par jour au maximum.</li><li>Ordre : Gemini Flash, puis Groq, puis Gemini Flash-Lite, puis OpenRouter, puis Workers AI si les autres sont en pause.</li><li>L\'IA reçoit des faits calculés par le Desk (liquidations, levier, tendance, niveaux) qu\'elle n\'a pas le droit de contredire.</li></ul></section></div><section class="g5-box"><h4>Journal des appels</h4>'+tb+'</section>';
}

/* ---------------- Bilan : comme un journal de trades ----------------
   Un seul scénario par actif et par lecture : le premier qui clôture 15 min au-delà de son niveau.
   ✓ objectif touché avant le stop · ✕ stop (clôture revenue de l'autre côté du niveau) · ● neutre (ni l'un ni l'autre en 4 h). */
function pctOk(x){var n=(x.ok||0)+(x.ko||0);return n?Math.round(x.ok/n*100):null;}
function barre(x){var t=(x.ok||0)+(x.ko||0)+(x.ne||0);return '<div class="g5-st3"><i class="ok" style="flex:'+(x.ok||0)+'"></i><i class="ne" style="flex:'+(x.ne||0)+'"></i><i class="ko" style="flex:'+(x.ko||0)+'"></i>'+(!t?'<i class="z"></i>':'')+'</div>';}
function viewBilan(){
  var a=agent(),B=a&&a.bilan;
  if(!B||!(B.v>=3)||!B.recent||!B.recent.length)return '<div class="g5-empty"><b>Pas encore de résultat.</b><span>Pour chaque lecture, le Desk suit un seul scénario par actif : le premier qui casse son niveau en clôture 15 min. ✓ si l\'objectif est touché avant le stop (le niveau d\'en face), ✕ si le prix clôture au-delà du stop, neutre si rien en 4 h. Les premiers résultats arrivent 4 h après les premières lectures.</span></div>';
  var tot={ok:0,ko:0,ne:0,nd:0};Object.keys(B.jours||{}).forEach(function(j){var x=B.jours[j];["ok","ko","ne","nd"].forEach(function(k){tot[k]+=x[k]||0;});});
  var R=B.recent,gains=R.filter(function(x){return x.mv!=null;}),moy=gains.length?gains.reduce(function(s,x){return s+x.mv;},0)/gains.length:null,pot=R.filter(function(x){return x.pot;}),mp=pot.length?pot.reduce(function(s,x){return s+x.pot;},0)/pot.length:null;
  var td=(B.jours||{})[today()]||{ok:0,ko:0,ne:0,nd:0},p=pctOk(tot);
  var k='<div class="g5-kpis"><div class="g5-kpi big"><span>RÉUSSITE · 30 JOURS</span><b class="num '+(p>=55?"up":p!=null&&p<45?"dn":"")+'">'+(p==null?"—":p+" %")+'</b><small>'+tot.ok+' objectif'+(tot.ok>1?"s":"")+' touché'+(tot.ok>1?"s":"")+' · '+tot.ko+' stop'+(tot.ko>1?"s":"")+' · '+tot.ne+' neutre'+(tot.ne>1?"s":"")+'</small>'+barre(tot)+'</div>'+
    '<div class="g5-kpi"><span>RÉSULTAT MOYEN</span><b class="num '+cl(moy)+'">'+(moy==null?"—":sgn(moy)+" %")+'</b><small>par scénario déclenché, neutres compris (prix à 4 h)</small></div>'+
    '<div class="g5-kpi"><span>AUJOURD\'HUI</span><b class="num">'+(pctOk(td)==null?"—":pctOk(td)+" %")+'</b><small>'+td.ok+' ✓ · '+td.ko+' ✕ · '+td.ne+' neutres</small></div>'+
    '<div class="g5-kpi"><span>OBJECTIF MOYEN</span><b class="num">'+(mp==null?"—":nf(mp,2)+" %")+'</b><small>distance entre le niveau cassé et l\'objectif · '+tot.nd+' lecture'+(tot.nd>1?"s":"")+' sans cassure</small></div></div>';
  var rows=function(o){return Object.keys(o||{}).map(function(t){var x=o[t],q=pctOk(x);return '<div class="g5-br"><span>'+esc(t)+'</span>'+barre(x)+'<b class="num '+(q>=55?"up":q!=null&&q<45?"dn":"")+'">'+(q==null?"—":q+" %")+'</b><small>'+x.ok+' / '+((x.ok||0)+(x.ko||0))+'</small></div>';}).join("");};
  var J=Object.keys(B.jours||{}).sort().slice(-30),mx=Math.max.apply(null,J.map(function(j){var x=B.jours[j];return (x.ok||0)+(x.ko||0)+(x.ne||0);}).concat([1])),bw=480/Math.max(J.length,1);
  var ch='<svg viewBox="0 0 480 130" class="g5-svg" role="img" aria-label="Résultats par jour"><line x1="0" x2="480" y1="110" y2="110" class="g5-ax"/>'+J.map(function(j,i){var x=B.jours[j],y=110,o='';[["ok","var(--up)"],["ne","var(--faint)"],["ko","var(--down)"]].forEach(function(z){var h=(x[z[0]]||0)/mx*92;if(h>0){y-=h;o+='<rect x="'+(i*bw+bw*0.18).toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+(bw*0.64).toFixed(1)+'" height="'+h.toFixed(1)+'" fill="'+z[1]+'"><title>'+j+' : '+(x.ok||0)+' ✓, '+(x.ne||0)+' neutres, '+(x.ko||0)+' ✕</title></rect>';}});return o+(i===J.length-1||i%7===0?'<text x="'+(i*bw+bw/2).toFixed(1)+'" y="126" text-anchor="middle" class="g5-tt">'+j.slice(8)+'/'+j.slice(5,7)+'</text>':'');}).join("")+'</svg>';
  var RR={ok:["✓","up","objectif touché"],ko:["✕","dn","stop au niveau d'en face"],ne:["●","","neutre en 4 h"]},list=R.slice().reverse().slice(0,30).map(function(x){var r=RR[x.res]||["?","",""];return '<div class="g5-vr"><span class="g5-t num">'+u.parisTime(x.ts)+'</span><b class="'+r[1]+'">'+r[0]+'</b><span class="g5-a" style="--a:'+(ACOL[x.b]||"var(--muted)")+'">'+esc(x.b)+'</span><span class="g5-vt">'+(x.s==="hausse"?"▲ cassure de ":"▼ cassure de ")+fp(x.niv)+(x.cible?' → '+fp(x.cible):'')+'</span><em class="num '+cl(x.mv)+'">'+(x.mv==null?esc(r[2]):sgn(x.mv)+' %')+'</em></div>';}).join("");
  return k+'<div class="g5-2"><section class="g5-box"><h4>Par actif</h4>'+rows(B.actifs)+'</section><section class="g5-box"><h4>Résultats par jour · 30 jours</h4>'+ch+'<p class="g5-note">Vert = objectif touché · gris = neutre · rouge = stop (clôture au-delà du niveau d\'en face). Ne comptent pas : une lecture sans cassure en clôture 15 min, ou un scénario dont l\'objectif est plus proche que le stop.</p></section></div>'+
    '<section class="g5-box"><h4>Derniers scénarios</h4><div class="g5-vl">'+list+'</div></section>';
}

/* ---------------- Construction ---------------- */
function status(){
  var a=agent(),I=a&&a.ia,P=I&&I.prov||{},act=I&&(I.ordre||[]).filter(function(p){return P[p]&&/actif|Flash-Lite/.test(P[p].etat||"");})[0],L=derniere(),age=a&&a.maj?Date.now()-a.maj:null;
  var on=a&&!a.off&&age!=null&&age<15*6e4;
  return '<span class="g5-dot '+(on?"on":"off")+'"></span><b>'+(on?"EN VEILLE":a?"HORS LIGNE":"CONNEXION…")+'</b><span>'+(on?"tour il y a "+Math.max(0,Math.round(age/1000))+" s":"")+(act?" · IA : "+iaNom(act):"")+(L?" · dernière lecture "+u.parisTime(L.ts):"")+'</span>';
}
function paint(){
  host=host||el("veille");if(!host)return;if(!host._built){build();host._built=1;}
  host.querySelectorAll("[data-g5tab]").forEach(function(b){b.setAttribute("aria-selected",b.getAttribute("data-g5tab")===V.tab?"true":"false");});
  el("g5Live").hidden=V.tab!=="live";el("g5Conso").hidden=V.tab!=="conso";el("g5Bilan").hidden=V.tab!=="bilan";el("g5St").innerHTML=status();
  if(V.tab==="live"){paintCards();el("g10Lec").innerHTML=viewLecture();}
  else if(V.tab==="bilan")el("g5Bilan").innerHTML=viewBilan();
  else el("g5Conso").innerHTML=viewConso();
  var R=reg();el("g5Notif").setAttribute("aria-pressed",String(R.notif));el("g5Son").setAttribute("aria-pressed",String(R.son));el("g5Seuil").value=String(R.seuil===1?1:2);
}
function paintCards(){var c=el("g5Cards");if(!c)return;c.innerHTML=REGLAGES.actifs.map(card).join("")+cardUSD();
  /* Les graphiques sont gardés d'un rafraîchissement à l'autre : on les replace dans la carte */
  REGLAGES.actifs.forEach(function(b){var ph=c.querySelector('[data-ch="'+b+'"]');if(!ph)return;var C=chart(b);if(!C)return;ph.replaceWith(C.el);setTimeout(function(){if(C.fit)cadrer(C);},80);
    var K=V.k[b]||{},k1=K["1m"]||[],tk=S.tick[b+"-USDT"],px=tk&&tk.last?tk.last:(k1.length?k1[k1.length-1].c:null);if(px)try{majChart(b,px);}catch(e){}});}
function build(){
  host.innerHTML='<div class="g5-top"><div class="g5-brand"><span class="g5-radar" aria-hidden="true"><i></i></span><div><b>AGENT IA</b><small>l\'analyste du Desk · une lecture toutes les 30 min</small></div></div>'+
    '<div class="g5-st" id="g5St"></div><div class="g5-tabs" role="tablist"><button type="button" role="tab" data-g5tab="live">Live</button><button type="button" role="tab" data-g5tab="bilan">Bilan</button><button type="button" role="tab" data-g5tab="conso">Conso IA</button></div></div>'+
    '<div id="g5Live"><div class="g10-opts"><button type="button" class="g5-tog" id="g5Notif"><i></i>Notifications</button><button type="button" class="g5-tog" id="g5Son"><i></i>Son</button><label class="g5-sel">Me prévenir <select id="g5Seuil"><option value="2">sur événement important</option><option value="1">à chaque lecture</option></select></label></div>'+
      '<div id="g10Lec" aria-live="polite"></div><h3 class="g10-h3">Le marché en direct</h3><div class="g5-cards" id="g5Cards"></div></div>'+
    '<div id="g5Bilan" hidden></div><div id="g5Conso" hidden></div>'+
    '<p class="g5-disc">Lecture de marché, pas un conseil d\'achat ou de vente. Une IA peut se tromper : vérifie toujours avant de décider.</p>';
  host.addEventListener("click",function(e){
    var t=e.target.closest("[data-g5tab]");if(t){V.tab=t.getAttribute("data-g5tab");CK.ls("agentTab",V.tab);paint();return;}
    var gch=e.target.closest(".g7-ch");if(gch){var crd=gch.closest(".g5-card"),bb=crd&&crd.querySelector("header>b");if(bb){GC0.b=bb.textContent.trim();grandChart(GC0.b,V.tf[GC0.b]==="5m"?"15m":(V.tf[GC0.b]||"1H"));}return;}
    var tb=e.target.closest("[data-tfb]");if(tb){V.tf[tb.getAttribute("data-tfb")]=tb.getAttribute("data-tf");CK.lsj("agent:tf",V.tf);paintCards();return;}
    var ac=e.target.closest("[data-act]");if(ac){if(ac.getAttribute("data-act")==="point"){fairePoint();return;}if(ac.getAttribute("data-act")==="aide"){V.aide=!V.aide;var ad=host.querySelector(".g13-aide");if(ad)ad.open=V.aide;ac.setAttribute("aria-expanded",String(V.aide));return;}}
    if(e.target.closest("#g5Notif")){var R=reg();setReg("notif",!R.notif);if(!R.notif&&window.Notification&&Notification.permission!=="granted")Notification.requestPermission();paint();return;}
    if(e.target.closest("#g5Son")){setReg("son",!reg().son);paint();return;}
  });
  /* Les lectures précédentes ouvertes restent ouvertes d'un rafraîchissement à l'autre */
  host.addEventListener("toggle",function(e){var d=e.target;if(d&&d.matches&&d.matches(".g13-aide"))V.aide=d.open;if(d&&d.matches&&d.matches("details[data-lid]")){if(d.open)V.open[d.getAttribute("data-lid")]=1;else delete V.open[d.getAttribute("data-lid")];}},true);
  host.addEventListener("change",function(e){if(e.target.id==="g5Seuil"){setReg("seuil",+e.target.value);CK.toast("Réglage enregistré.");}});
  setInterval(function(){if(GC)try{majGrand();}catch(e){}},5000);
  setInterval(function(){if(V.tab==="live"&&host.offsetParent)paintCards();var s=el("g5St");if(s)s.innerHTML=status();var n=el("g10Next");if(n)n.textContent=prochaine();try{majLive();}catch(e){}},3000);
}

/* ---------------- Nouvelle lecture : animation, son, notification ---------------- */
function onAgent(){
  var L=lectures(),first=!V.seen;V.seen=V.seen||{};var R=reg(),nouvelles=[];
  L.forEach(function(x){if(V.seen[x.id])return;V.seen[x.id]=1;if(first)return;V.fresh[x.id]=1;if(R.seuil===1||(x.raison&&/^(event|seance)$/.test(x.raison.k)))nouvelles.push(x);});
  if(nouvelles.length){var m=nouvelles[nouvelles.length-1];
    if(R.son&&CK.sfx&&CK.sfx.news&&(!CK.flash||CK.flash.on()))try{CK.sfx.news();}catch(e){}
    if(R.notif&&document.hidden&&window.Notification&&Notification.permission==="granted")try{new Notification("Agent IA · lecture du marché",{body:String(m.titre||"").replace(/[\[\]]/g,"")+(m.raison&&m.raison.k==="event"?" · "+String(m.raison.txt||"").slice(0,80):""),tag:m.id});}catch(e){}}
  paint();setTimeout(function(){V.fresh={};},8000);
}
CK.onAgent=onAgent;

/* ---------------- Boucle (données des cartes) ---------------- */
function cycle(){return collect().then(function(){if(host&&host.offsetParent)paint();}).catch(function(){});}
CK.veille={
  boot:function(){host=el("veille");if(!host)return;paint();if(S.agent)onAgent();
    setTimeout(function loop(){cycle().finally(function(){setTimeout(loop,30000);});},3000);},
  state:function(){var d=today(),L=lectures();return {active:!!agent(),busy:!!V.pointBusy,
    att:L.filter(function(x){return new Date(x.ts).toLocaleDateString("en-CA",{timeZone:"Europe/Paris"})===d;}),
    msgs:L.slice(-6).map(function(x){return {ts:x.ts,actif:x.raison&&x.raison.k==="event"?"⚡":"LECTURE",titre:String(x.titre||"").replace(/[\[\]]/g,"").slice(0,90),importance:x.raison&&x.raison.k==="event"?3:2};}),calls:agent()&&agent().ia?agent().ia.n:0,err:""};},
  pine:pine,
  reglages:REGLAGES
};
})();
