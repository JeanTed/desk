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
function seg(id,cur,L){L=L||[["NDX","NASDAQ 100"],["SPX","S&P 500"]];return '<div class="seg" role="group" aria-label="Actif">'+L.map(function(a){var b=a[0];return '<button type="button" data-'+id+'="'+b+'" aria-pressed="'+(b===cur)+'">'+a[1]+'</button>';}).join("")+'</div>';}
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
var FT=CK.fut,LASSETS=[["NDX","NASDAQ 100"],["SPX","S&P 500"],["MNQ","MNQ"],["MES","MES"]],IDXL={NDX:"US100-USDT-SWAP",SPX:"SPX-USDT-SWAP",MNQ:"US100-USDT-SWAP",MES:"SPX-USDT-SWAP"};
var LV={sym:CK.ls("lvSym2")||"NDX",data:{},px:{}};if(!IDXL[LV.sym])LV.sym="NDX";
function lvPx(b){if(!IDXL[b])return livePx(b);var B=FT.base(b),p=LV.px[B];return p>0?p+FT.off(b,p):p;}
var LDESC={
  PDC:["Clôture d'hier (00 h UTC)","Dernier prix de la veille à 00 h UTC. Souvent retesté au début de la séance."],
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
  b=FT.base(b);
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
  var host=u.$("levels");if(!host)return;var b=LV.sym,B=FT.base(b),fu=FT.is(b),d=LV.data[B],p=lvPx(b);
  if(!d||!p){host.innerHTML=seg("lv",b,LASSETS)+'<div class="empty">Calcul des niveaux…</div>';return;}
  var inf=fu?FT.info(b,LV.px[B]):null,off=inf?inf.v:0,M=fu?FT.M[b]:null;
  var yl=fu?FT.levels(b):null,L=(yl||d.L).slice().sort(function(x,y){return y.px-x.px;}),html="",placed=false;
  L.forEach(function(x){var v=x.px+(yl?0:off),dd=(v/p-1)*100,ds=LDESC[x.k]||[x.k,""],pts=v-p;
    if(!placed&&v<p){html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+u.px(p)+'</b></div>';placed=true;}
    var near=Math.abs(dd)<.35;
    html+='<div class="lv-r '+(v>p?"ab":"be")+(near?" near":"")+(fu?" lv-fu":"")+'"'+X(ds[0],ds[1]+(x.t?" (session "+x.t+")":"")+" Distance : "+(dd>0?"+":"")+nf(dd,2)+" %."+(fu?" Soit "+(pts>0?"+":"")+nf(pts,2)+" points, "+nf(Math.abs(pts)*M.pt,0)+" $ par contrat "+M.n+".":""))+'>'+
      '<span class="lv-tag">'+x.k+'</span><span class="lv-n">'+ds[0]+(x.t?' <em>'+x.t+'</em>':'')+'</span><b class="mono">'+u.px(v)+'</b>'+
      (fu?'<span class="lv-d mono">'+(pts>0?"+":"−")+nf(Math.abs(pts),2)+' pts</span><span class="lv-d mono">'+(pts>0?"+":"−")+nf(Math.abs(pts)*M.pt,0)+' $</span>':'')+
      '<span class="lv-d mono">'+(dd>0?"+":"")+nf(dd,2)+' %</span></div>';});
  if(!placed)html+='<div class="lv-now"><span>Prix actuel</span><b class="mono">'+u.px(p)+'</b></div>';
  var out=seg("lv",b,LASSETS)+(fu?'<div class="lv-hd"><span>Niveau</span><span></span><span>Prix</span><span>Points</span><span>$ / contrat</span><span>%</span></div>':'')+'<div class="lv-list">'+html+'</div><p class="x-n">Survole un niveau pour son explication. Les niveaux à moins de 0,35 % du prix sont mis en avant. Sessions : Tokyo 9 h–15 h, Londres 8 h–16 h 30, New York 9 h 30–16 h (heures locales).'+(IDXL[b]?' Indice suivi via le perpétuel OKX '+IDXL[B]+' : « jour » = 00 h UTC, pas l\'ouverture de Wall Street.':'')+
    (fu?' <b>'+M.n+'</b> ('+M.full+') : 1 point = '+M.pt+' $, tick 0,25 pt = '+nf(.25*M.pt,2)+' $. '+(yl?'Niveaux lus sur le <b>contrat réel</b> '+M.n+' (Yahoo Finance, via le robot, prix différé) ; le prix actuel suit le perpétuel OKX avec un écart de '+(off>=0?"+":"−")+nf(Math.abs(off),2)+' pts.':'Niveaux = indice '+FT.M[b].base+' '+(off>=0?"+":"−")+' '+nf(Math.abs(off),2)+' pts d\'écart contrat/indice ('+inf.src+(inf.src==="estimé"?" par le coût de portage, jusqu\'à l\'échéance dans "+Math.round(inf.days)+" j":"")+'). L\'écart fond jusqu\'à l\'échéance trimestrielle : vérifie sur ta plateforme.'):'')+'</p>';
  if(host._h!==out){host.innerHTML=out;host._h=out;}
}

/* ================= 2. Options Deribit ================= */
var OASSETS=[["NDX","NASDAQ 100"],["SPX","S&P 500"],["MNQ","MNQ"],["MES","MES"]];
var OP={sym:CK.ls("opSym2")||"NDX",data:{}};if(!IDXL[OP.sym])OP.sym="NDX";
/* Options sur indices : lues par le robot GitHub (options.py, Yahoo Finance) et publiées dans data/options.json */
function loadOptionsIdx(b){
  var url=CK.relay&&CK.relay("/options");
  if(!url){OP.data[b]={err:"Adresse du robot (data dans config.js) non réglée."};renderOptions();return Promise.resolve();}
  return q(J(url+"?t="+Math.floor(Date.now()/60000),12000)).then(function(j){
    var I=j&&j.idx&&j.idx[b];
    if(!I||!I.exp||!I.exp.length){OP.data[b]={err:j?"Le robot n'a pas encore de données pour cet indice.":"Fichier options.json introuvable sur le robot."};renderOptions();return;}
    var list=I.exp.map(function(e){return {ts:e.ts,code:e.date,c:e.c,p:e.p,oi:e.c+e.p,usd:e.usd,pcr:e.pcr,mp:e.mp};}).filter(function(e){return e.ts>Date.now()-86400000;}).sort(function(x,y){return x.ts-y.ts;});
    OP.data[b]={list:list,calls:(I.calls||[]).slice(0,4),puts:(I.puts||[]).slice(0,4),wc:I.calls||[],wp:I.puts||[],px:I.spot,mult:I.mult||100,idx:true,ts:Date.now(),src:j.ts||I.ts};
    CK.options=OP;renderOptions();
  });
}
var MON={JAN:0,FEB:1,MAR:2,APR:3,MAY:4,JUN:5,JUL:6,AUG:7,SEP:8,OCT:9,NOV:10,DEC:11};
function expTs(code){var m=code.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);return m?Date.UTC(2000+ +m[3],MON[m[2]],+m[1],8,0):0;}
function loadOptions(b){
  b=FT.base(b);
  return IDXL[b]?loadOptionsIdx(b):Promise.resolve();
}
function fmtDate(ts){return new Date(ts).toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short",timeZone:"Europe/Paris"});}
function renderOptions(){
  var host=u.$("opts");if(!host)return;var b=OP.sym,B=FT.base(b),fu=FT.is(b),d=OP.data[B],M=fu?FT.M[b]:null,off=0;
  if(!d){host.innerHTML=seg("op",b,OASSETS)+'<div class="empty">'+(IDXL[B]?'Lecture des options du robot…':'Lecture des options Deribit…')+'</div>';return;}
  if(d.err){host.innerHTML=seg("op",b,OASSETS)+'<div class="empty">'+esc(d.err)+' Les options sur indices demandent votre propre robot GitHub (voir CLAUDE.md, section « Le robot »).</div>';return;}
  if(fu&&LV.px[B]>0){off=FT.off(b,LV.px[B]);d=Object.assign({},d,{list:d.list.map(function(e){return Object.assign({},e,{mp:e.mp?e.mp+off:e.mp});}),calls:d.calls.map(function(w){return Object.assign({},w,{k:w.k+off});}),puts:d.puts.map(function(w){return Object.assign({},w,{k:w.k+off});})});}
  var m=d.mult||1,unit=d.idx?"contrats":b,px=(d.idx?lvPx(b):livePx(b))||d.px,now=Date.now(),big=d.list.slice().sort(function(a,b){return b.usd-a.usd;})[0];
  var rows=d.list.slice(0,6).map(function(e){var mp=e.mp?(e.mp/px-1)*100:null,isBig=big&&e.ts===big.ts,ms=e.ts-now;
    var tip=X("Échéance du "+fmtDate(e.ts)+" à "+u.parisTime(e.ts),
      u.usd(e.usd)+" d'options expirent ("+nf(e.c,0)+" calls, "+nf(e.p,0)+" puts en "+unit+"). "+
      (e.mp?"Max pain à "+u.px(e.mp)+" ("+(mp>0?"+":"")+nf(mp,1)+" %) : le prix auquel le plus d'options expirent sans valeur. Avant les grosses échéances, le prix a tendance à graviter vers ce niveau. ":"")+
      (e.pcr!=null?"Put/call "+nf(e.pcr,2)+(e.pcr>1?" : plus de protections à la baisse que de paris haussiers.":e.pcr<.6?" : les paris haussiers dominent.":" : équilibré."):""));
    return '<div class="op-r'+(isBig?" big":"")+'"'+tip+'><span class="op-dt"><b>'+fmtDate(e.ts)+'</b><em>'+(ms<86400000?"dans "+u.clock(ms).replace(/:\d\d$/,""):"dans "+Math.round(ms/86400000)+" j")+'</em></span>'+
      '<span class="op-v mono">'+u.usd(e.usd)+'</span><span class="op-bar"><i style="width:'+(big?Math.max(3,e.usd/big.usd*100):0).toFixed(1)+'%"></i></span>'+
      '<span class="op-mp mono">'+(e.mp?u.px(e.mp):"—")+'<em class="'+(mp==null?"":mp>0?"up":"down")+'">'+(mp==null?"":(fu?(e.mp>px?"+":"−")+nf(Math.abs(e.mp-px),0)+" pts · ":"")+(mp>0?"+":"")+nf(mp,1)+" %")+'</em></span><span class="op-pc mono">'+(e.pcr!=null?nf(e.pcr,2):"—")+'</span></div>';}).join("");
  function wall(arr,put){return arr.map(function(s){var v=put?s.p:s.c,dd=(s.k/px-1)*100;
    return '<span class="op-w '+(put?"p":"c")+'"'+X((put?"Mur de puts":"Mur de calls")+" à "+u.px(s.k),nf(v,0)+" "+unit+" d'open interest ("+u.usd(v*m*px)+"), toutes échéances. "+(put?"Les vendeurs de ces puts se couvrent en vendant si le prix s'en approche : zone de support souvent défendue, mais qui peut accélérer la baisse si elle cède.":"Les vendeurs de ces calls se couvrent en achetant si le prix monte : zone de résistance souvent défendue, mais qui peut accélérer la hausse si elle cède."))+'>'+
      '<b class="mono">'+u.px(s.k)+'</b><em>'+u.usd(v*m*px)+' · '+(fu?(s.k>px?"+":"−")+nf(Math.abs(s.k-px),0)+' pts / '+nf(Math.abs(s.k-px)*M.pt,0)+' $ · ':'')+(dd>0?"+":"")+nf(dd,1)+' %</em></span>';}).join("");}
  var out=seg("op",b,OASSETS)+'<div class="op-h"><span>Échéance</span><span>Notionnel</span><span></span><span>Max pain</span><span>Put/call</span></div><div class="op-l">'+rows+'</div>'+
    '<div class="op-ws"><div><span class="x-k">Murs de calls (résistances)</span>'+wall(d.calls,false)+'</div><div><span class="x-k">Murs de puts (supports)</span>'+wall(d.puts,true)+'</div></div>'+
    (d.idx?'<p class="x-n">Options sur l\'indice '+(B==="NDX"?"Nasdaq 100, lues sur l\'ETF QQQ (très liquide) et converties en points de l\'indice":"S&P 500 (^SPX)")+', par le robot sur Yahoo Finance : open interest de la veille, prix différé. Notionnel en dollars réels. Prix de référence : perpétuel OKX en direct (écart possible avec l\'indice). Ce ne sont pas les options sur futures du CME. Survole une ligne pour son explication.'+(fu?' Niveaux convertis en <b>'+M.n+'</b> : indice '+(off>=0?"+":"−")+' '+nf(Math.abs(off),2)+' pts d\'écart contrat/indice, 1 point = '+M.pt+' $.':'')+'</p>':'<p class="x-n">Options Deribit (environ 85 % du marché des options crypto). Expirations à 8 h UTC. Survole une ligne pour son explication.</p>');
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
CK.onWire=function(){};
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

/* ================= Démarrage ================= */
/* utilisé par le Plan du jour (plan.js) */
CK.opData=OP;CK.xApi={loadLevels:loadLevels,loadOptions:loadOptions,renderAll:function(){renderLevels();renderOptions();}};
CK.extra={boot:function(){
  xtip();
  [["levels","lv",LV,"lvSym2",renderLevels,loadLevels],["opts","op",OP,"opSym2",renderOptions,loadOptions]].forEach(function(m){
    var host=u.$(m[0]);if(!host)return;host.addEventListener("click",function(e){var b=e.target.closest("[data-"+m[1]+"]");if(!b)return;m[2].sym=b.getAttribute("data-"+m[1]);CK.ls(m[3],m[2].sym);host._h=null;m[4]();if(!m[2].data[m[2].sym])m[5](m[2].sym);});m[4]();});
  loadLevels(LV.sym);setInterval(function(){loadLevels(LV.sym);},120000);setInterval(renderLevels,5000);
  /* prix des indices : relevé toutes les 10 s (pas de flux en direct pour eux) */
  setInterval(function(){[LV.sym,OP.sym].map(FT.base).forEach(function(b,i,a){if(!IDXL[b]||a.indexOf(b)!==i)return;q(J(OKX+"/api/v5/market/ticker?instId="+IDXL[b],8000)).then(function(r){var t=r&&r.data&&r.data[0];if(t&&+t.last>0){LV.px[b]=+t.last;renderLevels();}});});},10000);
  loadOptions(OP.sym);setInterval(function(){loadOptions(OP.sym);},600000);setInterval(renderOptions,30000);
}};
})();
